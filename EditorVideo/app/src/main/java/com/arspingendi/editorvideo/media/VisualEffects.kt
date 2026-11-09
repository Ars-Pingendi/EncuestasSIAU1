package com.arspingendi.editorvideo.media

import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableString
import android.text.style.AbsoluteSizeSpan
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import androidx.media3.common.Effect
import androidx.media3.effect.Brightness
import androidx.media3.effect.Contrast
import androidx.media3.effect.HslAdjustment
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.OverlayEffect
import androidx.media3.effect.TextureOverlay
import androidx.media3.effect.Presentation
import androidx.media3.effect.RgbFilter
import androidx.media3.effect.RgbMatrix
import androidx.media3.effect.ScaleAndRotateTransformation
import androidx.media3.effect.StaticOverlaySettings
import androidx.media3.effect.TextOverlay
import com.arspingendi.editorvideo.Clip
import com.arspingendi.editorvideo.FilterType
import com.arspingendi.editorvideo.ProjectSettings
import com.arspingendi.editorvideo.TransitionType
import com.google.common.collect.ImmutableList

/** Construye las listas de efectos de Media3 para vista previa y exportación. */
object VisualEffects {

    /** Efectos de "look" (giro, filtro, ajustes de color). Se usan también en la vista previa. */
    fun lookEffects(clip: Clip): List<Effect> {
        val list = mutableListOf<Effect>()
        if (clip.rotation % 360 != 0) {
            // Media3 gira en sentido antihorario; el usuario espera sentido horario.
            list += ScaleAndRotateTransformation.Builder()
                .setRotationDegrees((360 - clip.rotation % 360).toFloat())
                .build()
        }
        filterEffect(clip.filter)?.let { list += it }
        if (clip.saturation != 0f) {
            list += HslAdjustment.Builder().adjustSaturation(clip.saturation * 100f).build()
        }
        if (clip.brightness != 0f) list += Brightness(clip.brightness.coerceIn(-1f, 1f))
        if (clip.contrast != 0f) list += Contrast(clip.contrast.coerceIn(-1f, 1f))
        return list
    }

    /**
     * Cadena completa para exportar un clip: look + formato de salida + transiciones + texto.
     * @param nextTransition transición del clip siguiente (para el fundido de salida).
     */
    fun exportEffects(
        clip: Clip,
        index: Int,
        nextTransition: TransitionType?,
        settings: ProjectSettings,
        outWidth: Int,
        outHeight: Int,
    ): List<Effect> {
        val list = mutableListOf<Effect>()
        list += lookEffects(clip)
        list += Presentation.createForWidthAndHeight(
            outWidth, outHeight,
            if (settings.fillFrame) Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP
            else Presentation.LAYOUT_SCALE_TO_FIT
        )

        val clipUs = clip.outputMs * 1000L
        val transUs = (settings.transitionMs * 1000L).coerceAtMost(clipUs / 2).coerceAtLeast(1L)
        val fadeIn = if (index > 0) clip.transitionIn else TransitionType.NONE
        val fadeOut = nextTransition ?: TransitionType.NONE

        val inColor = fadeIn == TransitionType.FADE_BLACK || fadeIn == TransitionType.FADE_WHITE
        val outColor = fadeOut == TransitionType.FADE_BLACK || fadeOut == TransitionType.FADE_WHITE
        if (inColor || outColor) {
            list += FadeMatrix(
                inWhite = fadeIn == TransitionType.FADE_WHITE,
                fadeInUs = if (inColor) transUs else 0L,
                outWhite = fadeOut == TransitionType.FADE_WHITE,
                fadeOutUs = if (outColor) transUs else 0L,
                clipDurationUs = clipUs,
            )
        }
        if (fadeIn == TransitionType.SLIDE_LEFT || fadeIn == TransitionType.SLIDE_UP ||
            fadeIn == TransitionType.ZOOM_IN
        ) {
            list += MotionTransition(fadeIn, transUs)
        }
        textOverlay(settings, outHeight)?.let { list += it }
        return list
    }

    private fun filterEffect(type: FilterType): Effect? = when (type) {
        FilterType.NONE -> null
        FilterType.BW -> RgbFilter.createGrayscaleFilter()
        FilterType.INVERT -> RgbFilter.createInvertedFilter()
        FilterType.SEPIA -> ConstantRgbMatrix(SEPIA)
        FilterType.VINTAGE -> ConstantRgbMatrix(VINTAGE)
        FilterType.WARM -> ConstantRgbMatrix(scaleMatrix(1.10f, 1.02f, 0.85f))
        FilterType.COOL -> ConstantRgbMatrix(scaleMatrix(0.88f, 1.0f, 1.12f))
        FilterType.VIVID -> HslAdjustment.Builder().adjustSaturation(45f).build()
    }

    private fun textOverlay(settings: ProjectSettings, outHeight: Int): Effect? {
        val text = settings.text.trim()
        if (text.isEmpty()) return null
        val span = SpannableString(text)
        val px = (outHeight * settings.textSize).toInt().coerceAtLeast(12)
        val flags = Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
        span.setSpan(AbsoluteSizeSpan(px), 0, text.length, flags)
        span.setSpan(ForegroundColorSpan(settings.textColor), 0, text.length, flags)
        span.setSpan(StyleSpan(Typeface.BOLD), 0, text.length, flags)
        if (settings.textBackground) {
            span.setSpan(BackgroundColorSpan(Color.argb(150, 0, 0, 0)), 0, text.length, flags)
        }
        val overlaySettings = StaticOverlaySettings.Builder()
            .setBackgroundFrameAnchor(0f, settings.textPosition.anchorY)
            .setOverlayFrameAnchor(0f, when {
                settings.textPosition.anchorY > 0f -> 1f
                settings.textPosition.anchorY < 0f -> -1f
                else -> 0f
            })
            .build()
        val overlay = TextOverlay.createStaticTextOverlay(span, overlaySettings)
        return OverlayEffect(ImmutableList.of<TextureOverlay>(overlay))
    }

    // ---- Matrices de color (column-major 4x4, se aplican a vec4(rgb, 1)) ----

    private val SEPIA = floatArrayOf(
        0.393f, 0.349f, 0.272f, 0f,
        0.769f, 0.686f, 0.534f, 0f,
        0.189f, 0.168f, 0.131f, 0f,
        0f, 0f, 0f, 1f,
    )

    private val VINTAGE: FloatArray = FloatArray(16).also { m ->
        val id = scaleMatrix(1f, 1f, 1f)
        for (i in 0 until 16) m[i] = 0.55f * SEPIA[i] + 0.45f * id[i]
        // Leve "lavado" de negros.
        m[12] = 0.06f; m[13] = 0.05f; m[14] = 0.03f; m[15] = 1f
    }

    private fun scaleMatrix(r: Float, g: Float, b: Float) = floatArrayOf(
        r, 0f, 0f, 0f,
        0f, g, 0f, 0f,
        0f, 0f, b, 0f,
        0f, 0f, 0f, 1f,
    )
}

private class ConstantRgbMatrix(private val m: FloatArray) : RgbMatrix {
    override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray = m
}

private fun smooth(t: Float): Float {
    val x = t.coerceIn(0f, 1f)
    return x * x * (3f - 2f * x)
}

/**
 * Fundido desde/hacia negro o blanco al inicio y/o final del clip.
 * Las marcas de tiempo que recibe un efecto dentro de una secuencia incluyen el desfase de los
 * clips anteriores, por eso se mide el tiempo relativo al primer cuadro recibido.
 */
private class FadeMatrix(
    private val inWhite: Boolean,
    private val fadeInUs: Long,
    private val outWhite: Boolean,
    private val fadeOutUs: Long,
    private val clipDurationUs: Long,
) : RgbMatrix {
    private var firstUs = Long.MIN_VALUE
    private val m = FloatArray(16)

    override fun getMatrix(presentationTimeUs: Long, useHdr: Boolean): FloatArray {
        if (firstUs == Long.MIN_VALUE) firstUs = presentationTimeUs
        val t = presentationTimeUs - firstUs
        var k = 1f
        var white = false
        if (fadeInUs > 0 && t < fadeInUs) {
            k = smooth(t.toFloat() / fadeInUs); white = inWhite
        } else if (fadeOutUs > 0 && t > clipDurationUs - fadeOutUs) {
            k = smooth((clipDurationUs - t).toFloat() / fadeOutUs); white = outWhite
        }
        val offset = if (white) 1f - k else 0f
        m.fill(0f)
        m[0] = k; m[5] = k; m[10] = k
        m[12] = offset; m[13] = offset; m[14] = offset; m[15] = 1f
        return m
    }
}

/** Transición de entrada con movimiento (deslizamiento o zoom). */
private class MotionTransition(
    private val type: TransitionType,
    private val durationUs: Long,
) : MatrixTransformation {
    private var firstUs = Long.MIN_VALUE
    private val matrix = Matrix()

    override fun getMatrix(presentationTimeUs: Long): Matrix {
        if (firstUs == Long.MIN_VALUE) firstUs = presentationTimeUs
        val p = smooth((presentationTimeUs - firstUs).toFloat() / durationUs)
        matrix.reset()
        when (type) {
            // Coordenadas normalizadas: el ancho del cuadro mide 2.
            TransitionType.SLIDE_LEFT -> matrix.setTranslate(2f * (1f - p), 0f)
            TransitionType.SLIDE_UP -> matrix.setTranslate(0f, -2f * (1f - p))
            TransitionType.ZOOM_IN -> {
                val s = 0.3f + 0.7f * p
                matrix.setScale(s, s)
            }
            else -> Unit
        }
        return matrix
    }
}
