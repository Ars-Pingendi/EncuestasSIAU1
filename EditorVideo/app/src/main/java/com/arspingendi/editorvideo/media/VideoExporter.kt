package com.arspingendi.editorvideo.media

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.Effect
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.common.audio.SpeedProvider
import androidx.media3.common.audio.ToInt16PcmAudioProcessor
import androidx.media3.effect.SpeedChangeEffect
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import com.arspingendi.editorvideo.AspectRatio
import com.arspingendi.editorvideo.Clip
import com.arspingendi.editorvideo.ProjectSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.max
import kotlin.math.roundToInt

/** Construye la composición final y la exporta con Media3 Transformer. */
object VideoExporter {

    /** Exporta el proyecto completo a MP4 (H.264 + AAC). */
    suspend fun exportVideo(
        context: Context,
        clips: List<Clip>,
        settings: ProjectSettings,
        output: File,
        onProgress: (Int) -> Unit,
    ): File {
        val composition = buildComposition(clips, settings, audioOnly = false)
        return run(context, composition, output, audioOnly = false, onProgress)
    }

    /** Exporta solo la pista de audio de la línea de tiempo (M4A/AAC). */
    suspend fun exportAudio(
        context: Context,
        clips: List<Clip>,
        settings: ProjectSettings,
        output: File,
        onProgress: (Int) -> Unit,
    ): File {
        val composition = buildComposition(clips, settings.copy(removeAllAudio = false), audioOnly = true)
        return run(context, composition, output, audioOnly = true, onProgress)
    }

    /** Ejecuta un Transformer sobre una composición ya armada. Debe correr en el hilo principal. */
    suspend fun run(
        context: Context,
        composition: Composition,
        output: File,
        audioOnly: Boolean,
        onProgress: (Int) -> Unit,
    ): File = withContext(Dispatchers.Main) {
        output.parentFile?.mkdirs()
        if (output.exists()) output.delete()
        coroutineScope {
            var transformer: Transformer? = null
            val poller = launch {
                val holder = ProgressHolder()
                while (isActive) {
                    val t = transformer
                    if (t != null && t.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
                        onProgress(holder.progress)
                    }
                    delay(250)
                }
            }
            try {
                suspendCancellableCoroutine { cont ->
                    val builder = Transformer.Builder(context)
                        .setAudioMimeType(MimeTypes.AUDIO_AAC)
                        .addListener(object : Transformer.Listener {
                            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                                if (cont.isActive) cont.resume(output)
                            }

                            override fun onError(
                                composition: Composition,
                                exportResult: ExportResult,
                                exportException: ExportException,
                            ) {
                                if (cont.isActive) cont.resumeWithException(exportException)
                            }
                        })
                    if (!audioOnly) builder.setVideoMimeType(MimeTypes.VIDEO_H264)
                    val t = builder.build()
                    transformer = t
                    cont.invokeOnCancellation {
                        Handler(Looper.getMainLooper()).post { runCatching { t.cancel() } }
                    }
                    t.start(composition, output.absolutePath)
                }
            } finally {
                poller.cancel()
            }
        }
    }

    fun buildComposition(clips: List<Clip>, settings: ProjectSettings, audioOnly: Boolean): Composition {
        require(clips.isNotEmpty())
        val audioEnabled = audioOnly || !settings.removeAllAudio
        val (outW, outH) = outputSize(clips, settings)

        val items = clips.mapIndexed { index, clip ->
            val mediaItem = MediaItem.Builder()
                .setUri(clip.uri)
                .setClippingConfiguration(
                    MediaItem.ClippingConfiguration.Builder()
                        .setStartPositionMs(clip.trimStartMs)
                        .setEndPositionMs(clip.trimEndMs)
                        .build()
                )
                .build()

            val audio = mutableListOf<AudioProcessor>()
            val video = mutableListOf<Effect>()

            if (clip.speed != 1f) {
                if (audioEnabled) {
                    // Procesador de audio + ajuste de tiempos de video enlazados (mantiene la sincronía).
                    val pair = Effects.createExperimentalSpeedChangingEffect(ConstantSpeed(clip.speed))
                    audio += pair.first
                    video += pair.second
                } else {
                    video += SpeedChangeEffect(clip.speed)
                }
            }
            val gain = if (settings.muteOriginal) 0f else clip.volume
            if (audioEnabled && gain != 1f) audio += gainProcessors(gain)

            if (!audioOnly) {
                val next = clips.getOrNull(index + 1)?.transitionIn
                video += VisualEffects.exportEffects(clip, index, next, settings, outW, outH)
            }

            EditedMediaItem.Builder(mediaItem)
                .setRemoveAudio(!audioEnabled)
                .setRemoveVideo(audioOnly)
                .setEffects(Effects(audio, video))
                .build()
        }

        val mainSequence = EditedMediaItemSequence.Builder(items)
            .experimentalSetForceAudioTrack(audioEnabled)
            .build()
        val sequences = mutableListOf(mainSequence)

        val music = settings.musicUri
        if (audioEnabled && music != null) {
            val musicItem = EditedMediaItem.Builder(MediaItem.fromUri(music))
                .setRemoveVideo(true)
                .setEffects(
                    Effects(
                        if (settings.musicVolume != 1f) gainProcessors(settings.musicVolume) else emptyList(),
                        emptyList()
                    )
                )
                .build()
            sequences += EditedMediaItemSequence.Builder(musicItem).setIsLooping(true).build()
        }

        return Composition.Builder(sequences)
            .setHdrMode(Composition.HDR_MODE_TONE_MAP_HDR_TO_SDR_USING_OPEN_GL)
            .build()
    }

    /** Resolución de salida (pares, lado largo ≤ 1920). */
    fun outputSize(clips: List<Clip>, settings: ProjectSettings): Pair<Int, Int> {
        val (w, h) = when (settings.aspect) {
            AspectRatio.ORIGINAL -> {
                val first = clips.first()
                val rotated = first.rotation % 180 != 0
                val w0 = if (rotated) first.height else first.width
                val h0 = if (rotated) first.width else first.height
                if (w0 <= 0 || h0 <= 0) 1280f to 720f else w0.toFloat() to h0.toFloat()
            }
            else -> {
                val base = 1080f
                if (settings.aspect.w >= settings.aspect.h)
                    base * settings.aspect.w / settings.aspect.h to base
                else base to base * settings.aspect.h / settings.aspect.w
            }
        }
        val scale = minOf(1f, 1920f / max(w, h))
        fun even(v: Float) = ((v * scale).roundToInt() / 2 * 2).coerceAtLeast(2)
        return even(w) to even(h)
    }

    /** Ajuste de volumen. ChannelMixingAudioProcessor exige PCM de 16 bits, por eso se normaliza antes. */
    private fun gainProcessors(gain: Float): List<AudioProcessor> = listOf(
        ToInt16PcmAudioProcessor(),
        ChannelMixingAudioProcessor().apply {
            putChannelMixingMatrix(ChannelMixingMatrix.createForConstantGain(1, 1).scaleBy(gain))
            putChannelMixingMatrix(ChannelMixingMatrix.createForConstantGain(2, 2).scaleBy(gain))
        },
    )
}

private class ConstantSpeed(private val speed: Float) : SpeedProvider {
    override fun getSpeed(timeUs: Long): Float = speed
    override fun getNextSpeedChangeTimeUs(timeUs: Long): Long = C.TIME_UNSET
}
