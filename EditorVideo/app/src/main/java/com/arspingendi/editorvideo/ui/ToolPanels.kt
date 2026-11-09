package com.arspingendi.editorvideo.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.CallSplit
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.MusicOff
import androidx.compose.material.icons.filled.Restore
import androidx.compose.material.icons.filled.RotateLeft
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RangeSlider
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.arspingendi.editorvideo.AspectRatio
import com.arspingendi.editorvideo.BackgroundMode
import com.arspingendi.editorvideo.EditorViewModel
import com.arspingendi.editorvideo.FilterType
import com.arspingendi.editorvideo.R
import com.arspingendi.editorvideo.SubjectMode
import com.arspingendi.editorvideo.TextPosition
import com.arspingendi.editorvideo.TransitionType
import com.arspingendi.editorvideo.media.VideoExporter
import kotlin.math.roundToInt

@Composable
fun ToolPanel(tool: Tool, vm: EditorViewModel, playheadMs: Long, onExportAudio: () -> Unit) {
    when (tool) {
        Tool.TRIM -> TrimPanel(vm, playheadMs)
        Tool.CLIP -> ClipPanel(vm, playheadMs)
        Tool.SPEED -> SpeedPanel(vm)
        Tool.FILTER -> FilterPanel(vm)
        Tool.ADJUST -> AdjustPanel(vm)
        Tool.ROTATE -> RotatePanel(vm)
        Tool.TRANSITION -> TransitionPanel(vm)
        Tool.AUDIO -> AudioPanel(vm, onExportAudio)
        Tool.MUSIC -> MusicPanel(vm)
        Tool.TEXT -> TextPanel(vm)
        Tool.BACKGROUND -> BackgroundPanel(vm)
        Tool.FORMAT -> FormatPanel(vm)
    }
}

// ---------------------------------------------------------------- Recortar

@Composable
private fun TrimPanel(vm: EditorViewModel, playheadMs: Long) {
    val clip = vm.selected ?: return
    val duration = clip.durationMs.toFloat()
    Text(stringResource(R.string.recorte_duracion, formatTime(clip.trimmedMs)), style = MaterialTheme.typography.titleSmall)
    RangeSlider(
        value = clip.trimStartMs.toFloat()..clip.trimEndMs.toFloat(),
        onValueChange = { r -> vm.setTrim(r.start.toLong(), r.endInclusive.toLong()) },
        onValueChangeFinished = { vm.refreshThumbnail() },
        valueRange = 0f..duration,
    )
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(stringResource(R.string.recorte_inicio, formatTime(clip.trimStartMs)), style = MaterialTheme.typography.bodySmall)
        Text(stringResource(R.string.recorte_fin, formatTime(clip.trimEndMs)), style = MaterialTheme.typography.bodySmall)
    }
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        // El cursor del reproductor es relativo al inicio del recorte.
        val absolute = clip.trimStartMs + playheadMs
        OutlinedButton(onClick = { vm.setTrim(absolute, clip.trimEndMs); vm.refreshThumbnail() }) {
            Text(stringResource(R.string.fijar_inicio))
        }
        OutlinedButton(onClick = { vm.setTrim(clip.trimStartMs, absolute) }) {
            Text(stringResource(R.string.fijar_fin))
        }
    }
}

// ---------------------------------------------------------------- Clip

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ClipPanel(vm: EditorViewModel, playheadMs: Long) {
    val context = LocalContext.current
    val index = vm.selectedIndex
    Text(stringResource(R.string.clip_n, index + 1), style = MaterialTheme.typography.titleSmall)
    Spacer(Modifier.height(8.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ActionButton(Icons.AutoMirrored.Filled.CallSplit, R.string.dividir) {
            if (!vm.split(playheadMs)) vm.message = context.getString(R.string.dividir_error)
        }
        ActionButton(Icons.Filled.ContentCopy, R.string.duplicar) { vm.duplicate() }
        ActionButton(Icons.AutoMirrored.Filled.ArrowBack, R.string.mover_izq, enabled = index > 0) { vm.move(-1) }
        ActionButton(Icons.AutoMirrored.Filled.ArrowForward, R.string.mover_der, enabled = index < vm.clips.size - 1) { vm.move(1) }
        ActionButton(Icons.Filled.Delete, R.string.eliminar) { vm.remove() }
    }
}

@Composable
private fun ActionButton(icon: ImageVector, label: Int, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled) {
        Icon(icon, null, Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(stringResource(label))
    }
}

// ---------------------------------------------------------------- Velocidad

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SpeedPanel(vm: EditorViewModel) {
    val clip = vm.selected ?: return
    Text(stringResource(R.string.velocidad_actual, trimFloat(clip.speed)), style = MaterialTheme.typography.titleSmall)
    Spacer(Modifier.height(8.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f, 3f, 4f).forEach { s ->
            FilterChip(
                selected = clip.speed == s,
                onClick = { vm.updateSelected { it.copy(speed = s) } },
                label = { Text("${trimFloat(s)}x") }
            )
        }
    }
}

private fun trimFloat(f: Float): String =
    if (f == f.toInt().toFloat()) f.toInt().toString() else f.toString()

// ---------------------------------------------------------------- Filtros

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FilterPanel(vm: EditorViewModel) {
    val clip = vm.selected ?: return
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterType.entries.forEach { f ->
            FilterChip(
                selected = clip.filter == f,
                onClick = { vm.updateSelected { it.copy(filter = f) } },
                label = { Text(stringResource(f.label)) }
            )
        }
    }
}

// ---------------------------------------------------------------- Ajustes

@Composable
private fun AdjustPanel(vm: EditorViewModel) {
    val clip = vm.selected ?: return
    LabeledSlider(R.string.brillo, clip.brightness, -0.6f..0.6f) { v -> vm.updateSelected { it.copy(brightness = v) } }
    LabeledSlider(R.string.contraste, clip.contrast, -0.6f..0.6f) { v -> vm.updateSelected { it.copy(contrast = v) } }
    LabeledSlider(R.string.saturacion, clip.saturation, -1f..1f) { v -> vm.updateSelected { it.copy(saturation = v) } }
    TextButton(onClick = { vm.updateSelected { it.copy(brightness = 0f, contrast = 0f, saturation = 0f) } }) {
        Icon(Icons.Filled.Restore, null)
        Spacer(Modifier.width(6.dp))
        Text(stringResource(R.string.restablecer))
    }
}

@Composable
private fun LabeledSlider(
    label: Int,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    onChange: (Float) -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(stringResource(label), Modifier.width(96.dp), style = MaterialTheme.typography.bodyMedium)
        Slider(value = value, onValueChange = onChange, valueRange = range, modifier = Modifier.weight(1f))
        Text(
            "${(value * 100).roundToInt()}",
            Modifier.width(40.dp),
            style = MaterialTheme.typography.bodySmall
        )
    }
}

// ---------------------------------------------------------------- Girar

@Composable
private fun RotatePanel(vm: EditorViewModel) {
    val clip = vm.selected ?: return
    Text(stringResource(R.string.rotacion_actual, clip.rotation), style = MaterialTheme.typography.titleSmall)
    Spacer(Modifier.height(8.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = { vm.updateSelected { it.copy(rotation = (it.rotation + 270) % 360) } }) {
            Icon(Icons.Filled.RotateLeft, null); Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.girar_izq))
        }
    }
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = { vm.updateSelected { it.copy(rotation = (it.rotation + 90) % 360) } }) {
        Icon(Icons.Filled.RotateRight, null); Spacer(Modifier.width(6.dp))
        Text(stringResource(R.string.girar_der))
    }
}

// ---------------------------------------------------------------- Transición

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TransitionPanel(vm: EditorViewModel) {
    val clip = vm.selected ?: return
    if (vm.selectedIndex <= 0) {
        Text(stringResource(R.string.trans_primero), color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        Text(stringResource(R.string.trans_info), style = MaterialTheme.typography.bodySmall)
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TransitionType.entries.forEach { t ->
                FilterChip(
                    selected = clip.transitionIn == t,
                    onClick = { vm.updateSelected { it.copy(transitionIn = t) } },
                    label = { Text(stringResource(t.label)) }
                )
            }
        }
        TextButton(onClick = { vm.applyTransitionToAll(clip.transitionIn) }) {
            Text(stringResource(R.string.trans_todos))
        }
    }
    Spacer(Modifier.height(4.dp))
    val secs = vm.settings.transitionMs / 1000f
    Text(stringResource(R.string.trans_duracion, "%.1f".format(secs)), style = MaterialTheme.typography.bodyMedium)
    Slider(
        value = secs,
        onValueChange = { v -> vm.updateSettings { it.copy(transitionMs = (v * 1000).toLong()) } },
        valueRange = 0.3f..2f,
    )
}

// ---------------------------------------------------------------- Audio

@Composable
private fun AudioPanel(vm: EditorViewModel, onExportAudio: () -> Unit) {
    val clip = vm.selected ?: return
    val s = vm.settings
    if (!clip.hasAudio) {
        Text(stringResource(R.string.sin_audio_clip), color = MaterialTheme.colorScheme.onSurfaceVariant)
    } else {
        Text(stringResource(R.string.volumen_clip, (clip.volume * 100).roundToInt()), style = MaterialTheme.typography.bodyMedium)
        Slider(
            value = clip.volume,
            onValueChange = { v -> vm.updateSelected { it.copy(volume = v) } },
            valueRange = 0f..1.5f,
        )
        SwitchRow(R.string.silenciar_clip, clip.volume == 0f) { on ->
            vm.updateSelected { it.copy(volume = if (on) 0f else 1f) }
        }
    }
    SwitchRow(R.string.quitar_audio_todo, s.removeAllAudio) { on -> vm.updateSettings { it.copy(removeAllAudio = on) } }
    SwitchRow(R.string.silenciar_original, s.muteOriginal) { on -> vm.updateSettings { it.copy(muteOriginal = on) } }
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = onExportAudio) {
        Icon(Icons.Filled.AudioFile, null); Spacer(Modifier.width(6.dp))
        Text(stringResource(R.string.exportar_audio))
    }
}

@Composable
private fun SwitchRow(label: Int, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clickable { onChange(!checked) }
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(stringResource(label), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

// ---------------------------------------------------------------- Música

@Composable
private fun MusicPanel(vm: EditorViewModel) {
    val context = LocalContext.current
    val s = vm.settings
    val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        if (uri != null) {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    uri, android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                )
            }
            vm.setMusic(uri)
        }
    }
    if (s.musicUri == null) {
        Text(stringResource(R.string.musica_ninguna), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Button(onClick = { pick.launch(arrayOf("audio/*")) }) {
            Icon(Icons.Filled.LibraryMusic, null); Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.musica_elegir))
        }
    } else {
        Text(s.musicName ?: "", style = MaterialTheme.typography.titleSmall)
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.musica_volumen, (s.musicVolume * 100).roundToInt()), style = MaterialTheme.typography.bodyMedium)
        Slider(
            value = s.musicVolume,
            onValueChange = { v -> vm.updateSettings { it.copy(musicVolume = v) } },
            valueRange = 0f..1.5f,
        )
        SwitchRow(R.string.silenciar_original, s.muteOriginal) { on -> vm.updateSettings { it.copy(muteOriginal = on) } }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { pick.launch(arrayOf("audio/*")) }) {
                Text(stringResource(R.string.musica_cambiar))
            }
            OutlinedButton(onClick = { vm.setMusic(null) }) {
                Icon(Icons.Filled.MusicOff, null); Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.musica_quitar))
            }
        }
    }
}

// ---------------------------------------------------------------- Texto

private val swatches = listOf(
    0xFFFFFFFF, 0xFF000000, 0xFFFFD54F, 0xFFFF5252, 0xFF69F0AE, 0xFF40C4FF, 0xFFE040FB, 0xFFFF9100,
).map { it.toInt() }

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TextPanel(vm: EditorViewModel) {
    val s = vm.settings
    OutlinedTextField(
        value = s.text,
        onValueChange = { t -> vm.updateSettings { it.copy(text = t) } },
        label = { Text(stringResource(R.string.texto_hint)) },
        modifier = Modifier.fillMaxWidth(),
        maxLines = 3,
    )
    Text(stringResource(R.string.texto_info), style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(8.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextPosition.entries.forEach { p ->
            FilterChip(
                selected = s.textPosition == p,
                onClick = { vm.updateSettings { it.copy(textPosition = p) } },
                label = { Text(stringResource(p.label)) }
            )
        }
    }
    LabeledSliderRaw(stringResource(R.string.texto_tamano), s.textSize, 0.03f..0.14f) { v ->
        vm.updateSettings { it.copy(textSize = v) }
    }
    ColorRow(selected = s.textColor) { c -> vm.updateSettings { it.copy(textColor = c) } }
    SwitchRow(R.string.texto_fondo, s.textBackground) { on -> vm.updateSettings { it.copy(textBackground = on) } }
}

@Composable
private fun LabeledSliderRaw(label: String, value: Float, range: ClosedFloatingPointRange<Float>, onChange: (Float) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.width(96.dp), style = MaterialTheme.typography.bodyMedium)
        Slider(value = value, onValueChange = onChange, valueRange = range, modifier = Modifier.weight(1f))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ColorRow(selected: Int, colors: List<Int> = swatches, onSelect: (Int) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        colors.forEach { c ->
            Box(
                Modifier
                    .size(34.dp)
                    .background(Color(c), CircleShape)
                    .border(
                        BorderStroke(
                            if (c == selected) 3.dp else 1.dp,
                            if (c == selected) MaterialTheme.colorScheme.primary else Color.Gray
                        ),
                        CircleShape
                    )
                    .clickable { onSelect(c) }
            )
        }
    }
}

// ---------------------------------------------------------------- Fondo

private val bgSwatches = listOf(
    0xFF00B140, 0xFF0047BB, 0xFF000000, 0xFFFFFFFF, 0xFF6D4AFF, 0xFFFF7A59, 0xFFF5E6C8, 0xFF2E3440,
).map { it.toInt() }

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BackgroundPanel(vm: EditorViewModel) {
    val clip = vm.selected ?: return
    val o = vm.bgOptions
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) vm.updateBgOptions { it.copy(imageUri = uri, mode = BackgroundMode.IMAGE) }
    }
    Text(stringResource(R.string.fondo_info), style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
    Spacer(Modifier.height(8.dp))
    Text(stringResource(R.string.sujeto), style = MaterialTheme.typography.titleSmall)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        SubjectMode.entries.forEach { m ->
            FilterChip(selected = o.subject == m, onClick = { vm.updateBgOptions { it.copy(subject = m) } },
                label = { Text(stringResource(m.label)) })
        }
    }
    Text(stringResource(R.string.nuevo_fondo), style = MaterialTheme.typography.titleSmall)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        BackgroundMode.entries.forEach { m ->
            FilterChip(selected = o.mode == m, onClick = {
                if (m == BackgroundMode.IMAGE && o.imageUri == null) {
                    pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                } else vm.updateBgOptions { it.copy(mode = m) }
            }, label = { Text(stringResource(m.label)) })
        }
    }
    when (o.mode) {
        BackgroundMode.COLOR -> ColorRow(o.color, bgSwatches) { c -> vm.updateBgOptions { it.copy(color = c) } }
        BackgroundMode.IMAGE -> OutlinedButton(onClick = {
            pickImage.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        }) {
            Icon(Icons.Filled.Image, null); Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.fondo_elegir_imagen))
        }
        BackgroundMode.BLUR -> Unit
    }
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { vm.removeBackground() }) {
            Icon(Icons.Filled.AutoFixHigh, null); Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.fondo_aplicar))
        }
    }
    if (clip.backgroundRemoved) {
        TextButton(onClick = { vm.restoreOriginal() }) {
            Icon(Icons.Filled.Restore, null); Spacer(Modifier.width(6.dp))
            Text(stringResource(R.string.fondo_restaurar))
        }
    }
}

// ---------------------------------------------------------------- Formato

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FormatPanel(vm: EditorViewModel) {
    val s = vm.settings
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AspectRatio.entries.forEach { a ->
            FilterChip(selected = s.aspect == a, onClick = { vm.updateSettings { it.copy(aspect = a) } },
                label = { Text(stringResource(a.label)) })
        }
    }
    SwitchRow(R.string.formato_rellenar, s.fillFrame) { on -> vm.updateSettings { it.copy(fillFrame = on) } }
    val (w, h) = VideoExporter.outputSize(vm.clips, s)
    Text(stringResource(R.string.formato_resolucion, w, h), style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
}
