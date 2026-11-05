@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.audio.AudioEffectsController
import com.personal.reproductor.audio.EqPresets
import java.util.Locale
import kotlin.math.roundToInt

@Composable
fun EqualizerScreen(vm: MainViewModel) {
    val eq by vm.effects.state.collectAsStateWithLifecycle()
    val controller = vm.effects
    var showSave by remember { mutableStateOf(false) }

    DetailScaffold(
        title = "Ecualizador",
        onBack = { vm.back() },
        actions = {
            Switch(
                checked = eq.enabled,
                onCheckedChange = { controller.setEnabled(it) },
                enabled = eq.attached && eq.available,
                modifier = Modifier.padding(end = 12.dp),
            )
        },
    ) {
        Column(
            Modifier
                .weight(1f)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 24.dp),
        ) {
            when {
                !eq.attached -> EqMessage(
                    "Preparando el ecualizador…",
                    "Si esto no cambia en unos segundos, reproduce una canción y vuelve a esta pantalla.",
                )

                !eq.available -> EqMessage(
                    "Ecualizador no disponible",
                    "Tu dispositivo no permite crear un ecualizador de audio para esta app.",
                )

                else -> {
                    BandsCard(eq, controller)
                    PresetsSection(eq, controller, onSave = { showSave = true })
                    EngineSection(eq, controller)
                    EffectsSection(eq, controller)
                    Text(
                        "Los efectos usan el procesador de audio de tu dispositivo, así que el rango y la " +
                            "intensidad pueden variar según el modelo. Si escuchas distorsión, baja la " +
                            "amplificación o las bandas más altas.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    )
                }
            }
        }
    }

    if (showSave) {
        NameDialog(
            title = "Guardar preajuste",
            initial = "",
            confirmLabel = "Guardar",
            onConfirm = {
                controller.saveCustomPreset(it)
                showSave = false
                vm.toast("Preajuste guardado")
            },
            onDismiss = { showSave = false },
        )
    }
}

@Composable
private fun EqMessage(title: String, message: String) {
    EmptyState(Icons.Filled.Equalizer, title, message)
}

// ---------------------------------------------------------------------------- bandas

@Composable
private fun BandsCard(eq: AudioEffectsController.EqState, controller: AudioEffectsController) {
    Surface(
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 16.dp).alpha(if (eq.enabled) 1f else 0.55f)) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    eq.presetName ?: "Personalizado",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary,
                )
                Text(
                    "±${eq.maxLevelMb / 100} dB",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            EqCurve(
                levelsMb = eq.levelsMb,
                minMb = eq.minLevelMb,
                maxMb = eq.maxLevelMb,
                modifier = Modifier.fillMaxWidth().height(88.dp).padding(vertical = 8.dp),
            )
            Row(Modifier.fillMaxWidth()) {
                eq.levelsMb.forEachIndexed { index, mb ->
                    Column(
                        Modifier.weight(1f),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(
                            formatDb(mb),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                        )
                        VerticalBandSlider(
                            valueMb = mb,
                            minMb = eq.minLevelMb,
                            maxMb = eq.maxLevelMb,
                            onChange = { controller.setBandLevel(index, it) },
                            modifier = Modifier.height(210.dp),
                        )
                        Text(
                            formatHz(eq.centerFreqsHz.getOrElse(index) { 0 }, compact = eq.levelsMb.size > 6),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}

/** Curva suave que resume la respuesta de frecuencia actual. */
@Composable
private fun EqCurve(levelsMb: List<Int>, minMb: Int, maxMb: Int, modifier: Modifier = Modifier) {
    val lineColor = MaterialTheme.colorScheme.primary
    val gridColor = MaterialTheme.colorScheme.outlineVariant
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val span = (maxMb - minMb).coerceAtLeast(1).toFloat()
        fun yFor(mb: Int) = h * (1f - (mb - minMb) / span)

        drawLine(gridColor, Offset(0f, yFor(0)), Offset(w, yFor(0)), strokeWidth = 1.dp.toPx())
        val n = levelsMb.size
        if (n < 2) return@Canvas

        val xs = FloatArray(n) { w * (it + 0.5f) / n }
        val ys = FloatArray(n) { yFor(levelsMb[it]) }
        val line = Path().apply {
            moveTo(0f, ys[0])
            lineTo(xs[0], ys[0])
            for (i in 1 until n) {
                val mid = (xs[i - 1] + xs[i]) / 2f
                cubicTo(mid, ys[i - 1], mid, ys[i], xs[i], ys[i])
            }
            lineTo(w, ys[n - 1])
        }
        val area = Path().apply {
            addPath(line)
            lineTo(w, h)
            lineTo(0f, h)
            close()
        }
        drawPath(area, brush = Brush.verticalGradient(listOf(lineColor.copy(alpha = 0.30f), Color.Transparent)))
        drawPath(line, color = lineColor, style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round))
    }
}

/** Control deslizante vertical (arrastrar o tocar). El 0 dB queda en el centro. */
@Composable
private fun VerticalBandSlider(
    valueMb: Int,
    minMb: Int,
    maxMb: Int,
    onChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val activeColor = MaterialTheme.colorScheme.primary
    val trackColor = MaterialTheme.colorScheme.outlineVariant
    val tickColor = MaterialTheme.colorScheme.onSurfaceVariant
    val currentOnChange by rememberUpdatedState(onChange)
    val padPx = with(LocalDensity.current) { 14.dp.toPx() }

    Canvas(
        modifier = modifier
            .fillMaxWidth()
            .pointerInput(minMb, maxMb, padPx) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)

                    fun valueAt(y: Float): Int {
                        val usable = (size.height - 2 * padPx).coerceAtLeast(1f)
                        val frac = 1f - ((y - padPx) / usable).coerceIn(0f, 1f)
                        val raw = minMb + frac * (maxMb - minMb)
                        return ((raw / 50f).roundToInt() * 50).coerceIn(minMb, maxMb)
                    }

                    currentOnChange(valueAt(down.position.y))
                    down.consume()
                    drag(down.id) { change ->
                        currentOnChange(valueAt(change.position.y))
                        change.consume()
                    }
                }
            },
    ) {
        val top = padPx
        val bottom = size.height - padPx
        val cx = size.width / 2f
        val span = (maxMb - minMb).coerceAtLeast(1).toFloat()
        fun yOf(mb: Int) = bottom - (mb - minMb) / span * (bottom - top)

        val stroke = 6.dp.toPx()
        drawLine(trackColor, Offset(cx, top), Offset(cx, bottom), strokeWidth = stroke, cap = StrokeCap.Round)

        val zeroY = yOf(0)
        val valueY = yOf(valueMb)
        drawLine(tickColor, Offset(cx - 11.dp.toPx(), zeroY), Offset(cx + 11.dp.toPx(), zeroY), strokeWidth = 1.5.dp.toPx())
        drawLine(activeColor, Offset(cx, zeroY), Offset(cx, valueY), strokeWidth = stroke, cap = StrokeCap.Round)
        drawCircle(activeColor, radius = 11.dp.toPx(), center = Offset(cx, valueY))
        drawCircle(Color.White.copy(alpha = 0.9f), radius = 4.dp.toPx(), center = Offset(cx, valueY))
    }
}

// ---------------------------------------------------------------------------- preajustes

@Composable
private fun PresetsSection(
    eq: AudioEffectsController.EqState,
    controller: AudioEffectsController,
    onSave: () -> Unit,
) {
    SectionTitle("Preajustes", Modifier.padding(top = 8.dp))
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        EqPresets.builtIn.forEach { preset ->
            FilterChip(
                selected = eq.presetName == preset.name,
                onClick = { controller.applyPreset(preset.name) },
                label = { Text(preset.name) },
            )
        }
    }

    if (eq.customPresets.isNotEmpty()) {
        SectionTitle("Mis preajustes")
        Row(
            Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            eq.customPresets.forEach { custom ->
                FilterChip(
                    selected = eq.presetName == custom.name,
                    onClick = { controller.applyPreset(custom.name) },
                    label = { Text(custom.name) },
                    trailingIcon = {
                        Icon(
                            Icons.Filled.Close,
                            contentDescription = "Eliminar preajuste ${custom.name}",
                            modifier = Modifier
                                .size(18.dp)
                                .clickable { controller.deleteCustomPreset(custom.name) },
                        )
                    },
                )
            }
        }
    }

    Row(
        Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedButton(onClick = onSave) { Text("Guardar ajuste actual") }
        TextButton(onClick = { controller.resetAll() }) { Text("Restablecer todo") }
    }
}

// ---------------------------------------------------------------------------- motor y salida de audio

@Composable
private fun EngineSection(eq: AudioEffectsController.EqState, controller: AudioEffectsController) {
    SectionTitle("Motor del ecualizador", Modifier.padding(top = 8.dp))
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        FilterChip(
            selected = eq.engine == AudioEffectsController.Engine.SOFTWARE,
            onClick = { controller.setEngine(AudioEffectsController.Engine.SOFTWARE) },
            label = { Text("10 bandas (recomendado)") },
        )
        FilterChip(
            selected = eq.engine == AudioEffectsController.Engine.SYSTEM,
            enabled = eq.sysAvailable,
            onClick = { controller.setEngine(AudioEffectsController.Engine.SYSTEM) },
            label = {
                Text(if (eq.sysAvailable) "Sistema (${eq.sysBandCount} bandas)" else "Sistema (no disponible)")
            },
        )
    }
    Text(
        if (eq.engine == AudioEffectsController.Engine.SOFTWARE) {
            "Ecualizador propio de la app: suena igual en cualquier dispositivo y reduce la ganancia " +
                "automáticamente al realzar bandas para evitar la distorsión."
        } else {
            "Ecualizador integrado de Android: sus bandas y su rango dependen del fabricante."
        },
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 6.dp),
    )

    SectionTitle("Salida de audio")
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text("Ajuste según la salida", style = MaterialTheme.typography.bodyLarge)
            Text(
                if (eq.autoProfiles) {
                    "Ahora: ${eq.profile.label}. Altavoz, cable y Bluetooth recuerdan cada uno su ecualizador."
                } else {
                    "Un solo ajuste para todas las salidas."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(Modifier.width(12.dp))
        Switch(checked = eq.autoProfiles, onCheckedChange = { controller.setAutoProfiles(it) })
    }
}

// ---------------------------------------------------------------------------- efectos

@Composable
private fun EffectsSection(eq: AudioEffectsController.EqState, controller: AudioEffectsController) {
    SectionTitle("Efectos", Modifier.padding(top = 8.dp))
    EffectSlider(
        title = "Refuerzo de graves",
        valueLabel = "${eq.bassStrength / 10} %",
        value = eq.bassStrength.toFloat(),
        range = 0f..1000f,
        supported = eq.bassSupported,
        onChange = { controller.setBass(it.roundToInt()) },
    )
    EffectSlider(
        title = "Sonido envolvente",
        valueLabel = "${eq.virtualizerStrength / 10} %",
        value = eq.virtualizerStrength.toFloat(),
        range = 0f..1000f,
        supported = eq.virtualizerSupported,
        onChange = { controller.setVirtualizer(it.roundToInt()) },
    )
    EffectSlider(
        title = "Amplificar volumen",
        valueLabel = "+" + String.format(Locale.getDefault(), "%.1f", eq.gainMb / 100f) + " dB",
        value = eq.gainMb.toFloat(),
        range = 0f..AudioEffectsController.MAX_GAIN_MB.toFloat(),
        supported = eq.gainSupported,
        onChange = { controller.setGain(it.roundToInt()) },
    )
}

@Composable
private fun EffectSlider(
    title: String,
    valueLabel: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    supported: Boolean,
    onChange: (Float) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            if (supported) {
                Text(
                    valueLabel,
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
        if (supported) {
            Slider(value = value, onValueChange = onChange, valueRange = range)
        } else {
            Text(
                "No compatible con este dispositivo",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
        }
    }
}

// ---------------------------------------------------------------------------- formato

private fun formatDb(mb: Int): String = when {
    mb == 0 -> "0"
    mb % 100 == 0 -> String.format(Locale.getDefault(), "%+d", mb / 100)
    else -> String.format(Locale.getDefault(), "%+.1f", mb / 100f)
}

private fun formatHz(hz: Int, compact: Boolean): String = when {
    hz <= 0 -> ""
    hz < 1000 -> if (compact) "$hz" else "$hz Hz"
    hz % 1000 == 0 -> if (compact) "${hz / 1000}k" else "${hz / 1000} kHz"
    else -> if (compact) {
        String.format(Locale.getDefault(), "%.1fk", hz / 1000f)
    } else {
        String.format(Locale.getDefault(), "%.1f kHz", hz / 1000f)
    }
}
