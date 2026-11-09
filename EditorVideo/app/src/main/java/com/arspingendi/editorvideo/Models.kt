package com.arspingendi.editorvideo

import android.net.Uri
import androidx.annotation.StringRes

enum class FilterType(@StringRes val label: Int) {
    NONE(R.string.filtro_ninguno),
    BW(R.string.filtro_bn),
    SEPIA(R.string.filtro_sepia),
    VIVID(R.string.filtro_vivido),
    WARM(R.string.filtro_calido),
    COOL(R.string.filtro_frio),
    VINTAGE(R.string.filtro_vintage),
    INVERT(R.string.filtro_invertido),
}

enum class TransitionType(@StringRes val label: Int) {
    NONE(R.string.trans_ninguna),
    FADE_BLACK(R.string.trans_fundido_negro),
    FADE_WHITE(R.string.trans_fundido_blanco),
    SLIDE_LEFT(R.string.trans_deslizar_izq),
    SLIDE_UP(R.string.trans_deslizar_arriba),
    ZOOM_IN(R.string.trans_zoom),
}

enum class AspectRatio(@StringRes val label: Int, val w: Int, val h: Int) {
    ORIGINAL(R.string.formato_original, 0, 0),
    R16_9(R.string.formato_16_9, 16, 9),
    R9_16(R.string.formato_9_16, 9, 16),
    R1_1(R.string.formato_1_1, 1, 1),
    R4_5(R.string.formato_4_5, 4, 5),
}

enum class TextPosition(@StringRes val label: Int, val anchorY: Float) {
    TOP(R.string.texto_arriba, 0.8f),
    CENTER(R.string.texto_centro, 0f),
    BOTTOM(R.string.texto_abajo, -0.8f),
}

enum class BackgroundMode(@StringRes val label: Int) {
    COLOR(R.string.fondo_color),
    BLUR(R.string.fondo_desenfoque),
    IMAGE(R.string.fondo_imagen),
}

enum class SubjectMode(@StringRes val label: Int) {
    PERSON(R.string.fondo_detectar_persona),
    CHROMA(R.string.fondo_pantalla_verde),
}

/** Un fragmento de video dentro de la línea de tiempo. */
data class Clip(
    val id: Long,
    val uri: Uri,
    val durationMs: Long,
    val width: Int,
    val height: Int,
    val hasAudio: Boolean,
    val trimStartMs: Long = 0L,
    val trimEndMs: Long = durationMs,
    val speed: Float = 1f,
    val volume: Float = 1f,
    val rotation: Int = 0,
    val filter: FilterType = FilterType.NONE,
    val brightness: Float = 0f,
    val contrast: Float = 0f,
    val saturation: Float = 0f,
    val transitionIn: TransitionType = TransitionType.NONE,
    val backgroundRemoved: Boolean = false,
    /** URI original antes de quitar el fondo (para poder restaurarlo). */
    val originalUri: Uri? = null,
) {
    val trimmedMs: Long get() = (trimEndMs - trimStartMs).coerceAtLeast(0L)
    val outputMs: Long get() = (trimmedMs / speed).toLong()
}

/** Ajustes globales del proyecto. */
data class ProjectSettings(
    val aspect: AspectRatio = AspectRatio.ORIGINAL,
    val fillFrame: Boolean = false,
    val removeAllAudio: Boolean = false,
    val muteOriginal: Boolean = false,
    val musicUri: Uri? = null,
    val musicName: String? = null,
    val musicVolume: Float = 0.8f,
    val text: String = "",
    val textPosition: TextPosition = TextPosition.BOTTOM,
    val textColor: Int = 0xFFFFFFFF.toInt(),
    val textSize: Float = 0.06f,
    val textBackground: Boolean = true,
    val transitionMs: Long = 700L,
)

data class BackgroundOptions(
    val subject: SubjectMode = SubjectMode.PERSON,
    val mode: BackgroundMode = BackgroundMode.COLOR,
    val color: Int = 0xFF00B140.toInt(),
    val imageUri: Uri? = null,
)

sealed interface ExportState {
    data object Idle : ExportState
    data class Running(val title: String, val progress: Int) : ExportState
    data class Done(val uri: Uri, val mime: String, val message: String) : ExportState
    data class Failed(val message: String) : ExportState
}
