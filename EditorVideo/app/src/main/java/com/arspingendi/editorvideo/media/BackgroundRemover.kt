package com.arspingendi.editorvideo.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import androidx.media3.common.MediaItem
import androidx.media3.common.util.Size
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.TextureOverlay
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import com.arspingendi.editorvideo.BackgroundMode
import com.arspingendi.editorvideo.BackgroundOptions
import com.arspingendi.editorvideo.SubjectMode
import com.google.android.gms.tasks.Tasks
import com.google.common.collect.ImmutableList
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import java.io.File
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min

/**
 * Quita o reemplaza el fondo de un clip completo y genera un nuevo archivo MP4.
 *
 * Cada cuadro se procesa en el dispositivo: se separa a la persona del fondo con ML Kit
 * (o se aplica clave de color para pantalla verde) y se compone sobre el fondo elegido.
 */
object BackgroundRemover {

    suspend fun process(
        context: Context,
        source: Uri,
        options: BackgroundOptions,
        output: File,
        onProgress: (Int) -> Unit,
    ): File {
        val bgImage = options.imageUri?.takeIf { options.mode == BackgroundMode.IMAGE }?.let {
            MediaUtils.loadBitmap(context, it, 1920)
        }
        val overlay = BackgroundOverlay(context.applicationContext, source, options, bgImage)
        val item = EditedMediaItem.Builder(MediaItem.fromUri(source))
            .setEffects(
                Effects(
                    emptyList(),
                    listOf(
                        // Limitar a 720p mantiene el procesamiento por cuadro en tiempos razonables.
                        Presentation.createForShortSide(720),
                        OverlayEffect(ImmutableList.of<TextureOverlay>(overlay)),
                    )
                )
            )
            .build()
        val composition = Composition.Builder(EditedMediaItemSequence.Builder(item).build())
            .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
            .build()
        return try {
            VideoExporter.run(context, composition, output, audioOnly = false, onProgress)
        } finally {
            overlay.close()
        }
    }
}

private class BackgroundOverlay(
    context: Context,
    source: Uri,
    private val options: BackgroundOptions,
    private val bgImage: Bitmap?,
) : BitmapOverlay() {

    private val retriever = MediaMetadataRetriever().apply { setDataSource(context, source) }
    private val segmenter: Segmenter? = if (options.subject == SubjectMode.PERSON) {
        Segmentation.getClient(
            SelfieSegmenterOptions.Builder()
                .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
                .build()
        )
    } else null

    private var videoSize = Size(1280, 720)
    private var firstUs = Long.MIN_VALUE
    private var lastUs = Long.MIN_VALUE
    // Doble búfer: entregar un Bitmap distinto en cada cuadro obliga a Media3 a re-subir la textura.
    private val buffers = arrayOfNulls<Bitmap>(2)
    private var bufferIndex = 0
    private var out: Bitmap? = null
    private var layer: Bitmap? = null
    private var scaledBg: Bitmap? = null
    private val filterPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val maskPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN)
    }

    override fun configure(videoSize: Size) {
        super.configure(videoSize)
        this.videoSize = videoSize
    }

    override fun getBitmap(presentationTimeUs: Long): Bitmap {
        val current = out
        if (presentationTimeUs == lastUs && current != null) return current
        lastUs = presentationTimeUs
        if (firstUs == Long.MIN_VALUE) firstUs = presentationTimeUs
        val relUs = (presentationTimeUs - firstUs).coerceAtLeast(0L)

        val w = videoSize.width
        val h = videoSize.height
        val frame = grabFrame(relUs, w, h)
            ?: return current ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { out = it }
        bufferIndex = 1 - bufferIndex
        val target = buffers[bufferIndex]?.takeIf { it.width == w && it.height == h }
            ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { buffers[bufferIndex] = it }
        compose(frame, target)
        frame.recycle()
        out = target
        return target
    }

    /** Extrae el cuadro de origen en el instante dado, ya orientado y escalado al tamaño de salida. */
    private fun grabFrame(timeUs: Long, w: Int, h: Int): Bitmap? {
        val raw = try {
            if (Build.VERSION.SDK_INT >= 27) {
                retriever.getScaledFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST, w, h)
                    ?: retriever.getScaledFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, w, h)
            } else {
                retriever.getFrameAtTime(timeUs, MediaMetadataRetriever.OPTION_CLOSEST)
            }
        } catch (e: Exception) {
            null
        } ?: return null

        var bmp = raw
        // Si la orientación no coincide con el cuadro de salida, se gira según los metadatos.
        if ((bmp.width > bmp.height) != (w > h) && bmp.width != bmp.height) {
            val rot = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
                ?.toIntOrNull()?.takeIf { it != 0 } ?: 90
            val m = Matrix().apply { postRotate(rot.toFloat()) }
            bmp = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
            if (bmp !== raw) raw.recycle()
        }
        val src = bmp
        if (src.width != w || src.height != h || src.config != Bitmap.Config.ARGB_8888) {
            val scaled = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            Canvas(scaled).drawBitmap(src, null, Rect(0, 0, w, h), filterPaint)
            src.recycle()
            return scaled
        }
        return src
    }

    private fun compose(frame: Bitmap, target: Bitmap) {
        val w = target.width
        val h = target.height
        val mask = computeMask(frame)

        // Capa del sujeto: cuadro original con el alfa de la máscara.
        val fg = layer?.takeIf { it.width == w && it.height == h }
            ?: Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { layer = it }
        fg.eraseColor(Color.TRANSPARENT)
        val fgCanvas = Canvas(fg)
        fgCanvas.drawBitmap(frame, 0f, 0f, null)
        fgCanvas.drawBitmap(mask, null, Rect(0, 0, w, h), maskPaint)
        mask.recycle()

        // Fondo + sujeto.
        val canvas = Canvas(target)
        when (options.mode) {
            BackgroundMode.COLOR -> canvas.drawColor(options.color)
            BackgroundMode.IMAGE -> {
                val bg = scaledBackground(w, h)
                if (bg != null) canvas.drawBitmap(bg, 0f, 0f, null) else canvas.drawColor(options.color)
            }
            BackgroundMode.BLUR -> {
                val small = Bitmap.createScaledBitmap(frame, max(1, w / 24), max(1, h / 24), true)
                canvas.drawBitmap(small, null, Rect(0, 0, w, h), filterPaint)
                small.recycle()
            }
        }
        canvas.drawBitmap(fg, 0f, 0f, null)
    }

    /** Máscara de baja resolución (alfa = sujeto). Se escala con filtrado para suavizar bordes. */
    private fun computeMask(frame: Bitmap): Bitmap {
        val scale = min(1f, 384f / max(frame.width, frame.height))
        val sw = max(1, (frame.width * scale).toInt())
        val sh = max(1, (frame.height * scale).toInt())
        val small = Bitmap.createScaledBitmap(frame, sw, sh, true)
        val pixels = IntArray(sw * sh)

        val seg = segmenter
        if (seg != null) {
            val result = try {
                Tasks.await(seg.process(InputImage.fromBitmap(small, 0)), 5, TimeUnit.SECONDS)
            } catch (e: Exception) {
                null
            }
            if (result != null) {
                val buf = result.buffer.order(ByteOrder.nativeOrder())
                buf.rewind()
                val mw = result.width
                val mh = result.height
                for (y in 0 until sh) {
                    val my = min(mh - 1, y * mh / sh)
                    for (x in 0 until sw) {
                        val mx = min(mw - 1, x * mw / sw)
                        val c = buf.getFloat((my * mw + mx) * 4)
                        // Endurece levemente la máscara para bordes más limpios.
                        val a = ((c - 0.25f) / 0.5f).coerceIn(0f, 1f)
                        pixels[y * sw + x] = ((a * 255f).toInt() shl 24) or 0xFFFFFF
                    }
                }
            } else {
                pixels.fill(-1) // Si falla la detección se conserva el cuadro completo.
            }
        } else {
            small.getPixels(pixels, 0, sw, 0, 0, sw, sh)
            for (i in pixels.indices) {
                val p = pixels[i]
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                val greenness = g - max(r, b)
                // 0 = verde puro (fondo), 1 = sujeto.
                val a = 1f - ((greenness - 25f) / 45f).coerceIn(0f, 1f)
                pixels[i] = ((a * 255f).toInt() shl 24) or 0xFFFFFF
            }
        }
        small.recycle()
        return Bitmap.createBitmap(pixels, sw, sh, Bitmap.Config.ARGB_8888)
    }

    private fun scaledBackground(w: Int, h: Int): Bitmap? {
        val src = bgImage ?: return null
        scaledBg?.takeIf { it.width == w && it.height == h }?.let { return it }
        // Recorte centrado (cover).
        val scale = max(w.toFloat() / src.width, h.toFloat() / src.height)
        val dw = src.width * scale
        val dh = src.height * scale
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val m = Matrix().apply {
            postScale(scale, scale)
            postTranslate((w - dw) / 2f, (h - dh) / 2f)
        }
        Canvas(bmp).drawBitmap(src, m, filterPaint)
        scaledBg = bmp
        return bmp
    }

    fun close() {
        runCatching { retriever.release() }
        runCatching { segmenter?.close() }
    }
}
