package com.personal.reproductor.audio

import android.content.Context
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Virtualizer
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.ln
import kotlin.math.roundToInt

/** Preajuste definido en 10 frecuencias estándar (dB); se adapta a las bandas reales del dispositivo. */
class EqPreset(val name: String, val anchorsDb: DoubleArray)

object EqPresets {
    private val ISO_HZ = doubleArrayOf(31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)

    val builtIn: List<EqPreset> = listOf(
        EqPreset("Plano", doubleArrayOf(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)),
        EqPreset("Graves potentes", doubleArrayOf(6.0, 5.5, 4.5, 2.5, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0)),
        EqPreset("Agudos brillantes", doubleArrayOf(0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.5, 4.0, 5.0, 5.5)),
        EqPreset("Loudness", doubleArrayOf(5.0, 4.0, 2.5, 0.0, -1.5, -1.5, 0.0, 2.5, 4.5, 5.0)),
        EqPreset("Vocal", doubleArrayOf(-3.0, -2.5, -1.5, 1.0, 3.0, 3.5, 3.0, 1.5, 0.0, -1.0)),
        EqPreset("Rock", doubleArrayOf(4.5, 3.5, 2.5, 1.0, -1.0, -1.5, 0.5, 2.5, 3.5, 4.5)),
        EqPreset("Pop", doubleArrayOf(-1.5, 0.0, 1.5, 3.0, 3.5, 3.0, 1.5, 0.0, -1.0, -1.5)),
        EqPreset("Jazz", doubleArrayOf(3.0, 2.5, 1.0, 2.0, -1.5, -1.5, 0.0, 1.5, 2.5, 3.5)),
        EqPreset("Clásica", doubleArrayOf(4.0, 3.5, 2.5, 1.5, -0.5, -0.5, 0.0, 2.0, 3.0, 3.5)),
        EqPreset("Electrónica", doubleArrayOf(5.0, 4.5, 3.5, 0.0, -1.5, 1.5, 0.5, 1.5, 4.5, 5.0)),
        EqPreset("Hip hop", doubleArrayOf(5.0, 5.0, 3.5, 3.0, 0.5, -1.0, 0.5, 0.0, 1.5, 3.0)),
        EqPreset("Acústica", doubleArrayOf(3.0, 3.0, 2.5, 1.0, 1.5, 1.5, 2.5, 3.0, 2.5, 1.5)),
        EqPreset("Menos graves", doubleArrayOf(-6.0, -5.0, -4.0, -2.5, -1.0, 0.0, 0.0, 0.0, 0.0, 0.0)),
    )

    /** Interpola (en escala logarítmica de frecuencia) el valor en dB del preajuste para [freqHz]. */
    fun interpolate(anchorsDb: DoubleArray, freqHz: Double): Double {
        if (freqHz <= ISO_HZ.first()) return anchorsDb.first()
        if (freqHz >= ISO_HZ.last()) return anchorsDb.last()
        for (i in 0 until ISO_HZ.size - 1) {
            if (freqHz <= ISO_HZ[i + 1]) {
                val t = (ln(freqHz) - ln(ISO_HZ[i])) / (ln(ISO_HZ[i + 1]) - ln(ISO_HZ[i]))
                return anchorsDb[i] + (anchorsDb[i + 1] - anchorsDb[i]) * t
            }
        }
        return anchorsDb.last()
    }
}

/**
 * Controla Equalizer, BassBoost, Virtualizer y LoudnessEnhancer de Android sobre la sesión de audio
 * de ExoPlayer. Es un singleton de la app: el servicio de reproducción lo "conecta" ([attach])
 * y la pantalla del ecualizador lo manipula directamente. Todo se guarda y se reaplica al abrir la app.
 */
class AudioEffectsController(context: Context) {

    data class CustomPreset(val name: String, val levelsMb: List<Int>)

    data class EqState(
        /** El servicio de reproducción ya conectó los efectos (o intentó hacerlo). */
        val attached: Boolean = false,
        /** El dispositivo ofrece un ecualizador utilizable. */
        val available: Boolean = false,
        val enabled: Boolean = false,
        val centerFreqsHz: List<Int> = emptyList(),
        val minLevelMb: Int = -1500,
        val maxLevelMb: Int = 1500,
        val levelsMb: List<Int> = emptyList(),
        /** Nombre del preajuste activo; null = ajuste manual. */
        val presetName: String? = null,
        val bassSupported: Boolean = false,
        val bassStrength: Int = 0,
        val virtualizerSupported: Boolean = false,
        val virtualizerStrength: Int = 0,
        val gainSupported: Boolean = false,
        val gainMb: Int = 0,
        val customPresets: List<CustomPreset> = emptyList(),
    )

    private val prefs = context.applicationContext.getSharedPreferences("ecualizador", Context.MODE_PRIVATE)

    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var virtualizer: Virtualizer? = null
    private var loudness: LoudnessEnhancer? = null
    private var attachedSession = -1

    private val _state = MutableStateFlow(loadPersisted())
    val state: StateFlow<EqState> = _state.asStateFlow()

    // ------------------------------------------------------------------ conexión con el reproductor

    fun attach(sessionId: Int) {
        if (sessionId <= 0) return
        if (sessionId == attachedSession && _state.value.attached) return
        releaseEffects()
        attachedSession = sessionId
        val saved = _state.value

        var eqAvailable = false
        var freqs = emptyList<Int>()
        var minLevel = -1500
        var maxLevel = 1500
        var levels = emptyList<Int>()

        val eq = guard("Equalizer") { Equalizer(0, sessionId) }
        if (eq != null) {
            val ok = guard("configurar Equalizer") {
                val bands = eq.numberOfBands.toInt()
                val range = eq.bandLevelRange
                minLevel = range[0].toInt()
                maxLevel = range[1].toInt()
                freqs = List(bands) { eq.getCenterFreq(it.toShort()) / 1000 }
                levels = if (saved.levelsMb.size == bands) {
                    saved.levelsMb.map { it.coerceIn(minLevel, maxLevel) }
                } else {
                    List(bands) { 0 }
                }
                true
            }
            if (ok == true) {
                equalizer = eq
                eqAvailable = true
            } else {
                eq.release()
            }
        }

        val bb = guard("BassBoost") { BassBoost(0, sessionId) }
        val bassOk = bb != null && guard("BassBoost.soporte") { bb.strengthSupported } == true
        if (bassOk) bassBoost = bb else bb?.release()

        val vz = guard("Virtualizer") { Virtualizer(0, sessionId) }
        val virtOk = vz != null && guard("Virtualizer.soporte") { vz.strengthSupported } == true
        if (virtOk) virtualizer = vz else vz?.release()

        val le = guard("LoudnessEnhancer") { LoudnessEnhancer(sessionId) }
        if (le != null) loudness = le

        val next = saved.copy(
            attached = true,
            available = eqAvailable,
            centerFreqsHz = freqs,
            minLevelMb = minLevel,
            maxLevelMb = maxLevel,
            levelsMb = levels,
            bassSupported = bassOk,
            virtualizerSupported = virtOk,
            gainSupported = le != null,
        )
        _state.value = next
        push(next)
        Log.i(TAG, "Efectos conectados a la sesión $sessionId: bandas=${freqs.size} graves=$bassOk virt=$virtOk ganancia=${le != null}")
    }

    fun detach() {
        releaseEffects()
        attachedSession = -1
        _state.value = _state.value.copy(attached = false, available = false)
    }

    private fun releaseEffects() {
        guard("liberar efectos") {
            equalizer?.release()
            bassBoost?.release()
            virtualizer?.release()
            loudness?.release()
        }
        equalizer = null
        bassBoost = null
        virtualizer = null
        loudness = null
    }

    // ------------------------------------------------------------------ acciones desde la interfaz

    fun setEnabled(on: Boolean) = update { it.copy(enabled = on) }

    fun setBandLevel(index: Int, levelMb: Int) = update { s ->
        if (index !in s.levelsMb.indices) return@update s
        val v = levelMb.coerceIn(s.minLevelMb, s.maxLevelMb)
        s.copy(
            enabled = true,
            levelsMb = s.levelsMb.toMutableList().also { it[index] = v },
            presetName = null,
        )
    }

    fun applyPreset(name: String) = update { s ->
        if (s.centerFreqsHz.isEmpty()) return@update s
        val builtIn = EqPresets.builtIn.firstOrNull { it.name == name }
        val fromBuiltIn: List<Int>? = builtIn?.let { preset ->
            s.centerFreqsHz.map { hz ->
                (EqPresets.interpolate(preset.anchorsDb, hz.toDouble()) * 100).roundToInt()
                    .coerceIn(s.minLevelMb, s.maxLevelMb)
            }
        }
        val fromCustom: List<Int>? = s.customPresets.firstOrNull { it.name == name }
            ?.levelsMb?.takeIf { it.size == s.centerFreqsHz.size }
            ?.map { it.coerceIn(s.minLevelMb, s.maxLevelMb) }
        val levels = fromBuiltIn ?: fromCustom ?: return@update s
        s.copy(enabled = true, levelsMb = levels, presetName = name)
    }

    fun resetAll() = update { s ->
        s.copy(
            levelsMb = List(s.levelsMb.size) { 0 },
            presetName = "Plano",
            bassStrength = 0,
            virtualizerStrength = 0,
            gainMb = 0,
        )
    }

    fun setBass(strength: Int) = update { it.copy(enabled = true, bassStrength = strength.coerceIn(0, 1000)) }

    fun setVirtualizer(strength: Int) =
        update { it.copy(enabled = true, virtualizerStrength = strength.coerceIn(0, 1000)) }

    fun setGain(gainMb: Int) = update { it.copy(enabled = true, gainMb = gainMb.coerceIn(0, MAX_GAIN_MB)) }

    fun saveCustomPreset(rawName: String) = update { s ->
        var name = rawName.trim().take(30)
        if (name.isEmpty() || s.levelsMb.isEmpty()) return@update s
        if (EqPresets.builtIn.any { it.name.equals(name, ignoreCase = true) }) name = "$name (mío)"
        val others = s.customPresets.filterNot { it.name.equals(name, ignoreCase = true) }
        s.copy(customPresets = others + CustomPreset(name, s.levelsMb), presetName = name)
    }

    fun deleteCustomPreset(name: String) = update { s ->
        s.copy(
            customPresets = s.customPresets.filterNot { it.name == name },
            presetName = if (s.presetName == name) null else s.presetName,
        )
    }

    // ------------------------------------------------------------------ interno

    private inline fun update(transform: (EqState) -> EqState) {
        val next = transform(_state.value)
        if (next == _state.value) return
        _state.value = next
        push(next)
        persist(next)
    }

    /** Envía el estado completo a los efectos reales (si están conectados). */
    private fun push(s: EqState) {
        equalizer?.let { eq ->
            guard("aplicar ecualizador") {
                eq.setEnabled(s.enabled)
                s.levelsMb.forEachIndexed { i, mb -> eq.setBandLevel(i.toShort(), mb.toShort()) }
            }
        }
        bassBoost?.let { bb ->
            guard("aplicar graves") {
                bb.setStrength(s.bassStrength.toShort())
                bb.setEnabled(s.enabled && s.bassStrength > 0)
            }
        }
        virtualizer?.let { vz ->
            guard("aplicar envolvente") {
                vz.setStrength(s.virtualizerStrength.toShort())
                vz.setEnabled(s.enabled && s.virtualizerStrength > 0)
            }
        }
        loudness?.let { le ->
            guard("aplicar ganancia") {
                le.setTargetGain(s.gainMb)
                le.setEnabled(s.enabled && s.gainMb > 0)
            }
        }
    }

    private fun persist(s: EqState) {
        val custom = JSONArray().also { arr ->
            s.customPresets.forEach { p ->
                arr.put(JSONObject().put("name", p.name).put("levels", JSONArray(p.levelsMb)))
            }
        }
        prefs.edit()
            .putBoolean(K_ENABLED, s.enabled)
            .putString(K_LEVELS, s.levelsMb.joinToString(","))
            .putString(K_PRESET, s.presetName)
            .putInt(K_BASS, s.bassStrength)
            .putInt(K_VIRT, s.virtualizerStrength)
            .putInt(K_GAIN, s.gainMb)
            .putString(K_CUSTOM, custom.toString())
            .apply()
    }

    private fun loadPersisted(): EqState = EqState(
        enabled = prefs.getBoolean(K_ENABLED, false),
        levelsMb = prefs.getString(K_LEVELS, "").orEmpty().split(',').mapNotNull { it.toIntOrNull() },
        presetName = prefs.getString(K_PRESET, null),
        bassStrength = prefs.getInt(K_BASS, 0),
        virtualizerStrength = prefs.getInt(K_VIRT, 0),
        gainMb = prefs.getInt(K_GAIN, 0),
        customPresets = readCustomPresets(),
    )

    private fun readCustomPresets(): List<CustomPreset> = try {
        val arr = JSONArray(prefs.getString(K_CUSTOM, "[]"))
        List(arr.length()) { i ->
            val o = arr.getJSONObject(i)
            val l = o.getJSONArray("levels")
            CustomPreset(o.getString("name"), List(l.length()) { j -> l.getInt(j) })
        }
    } catch (e: Exception) {
        emptyList()
    }

    private inline fun <T> guard(what: String, block: () -> T): T? = try {
        block()
    } catch (e: Throwable) {
        Log.w(TAG, "Fallo en $what", e)
        null
    }

    companion object {
        private const val TAG = "AudioEffects"
        const val MAX_GAIN_MB = 1500
        private const val K_ENABLED = "enabled"
        private const val K_LEVELS = "levels"
        private const val K_PRESET = "preset"
        private const val K_BASS = "bass"
        private const val K_VIRT = "virtualizer"
        private const val K_GAIN = "gain"
        private const val K_CUSTOM = "custom_presets"
    }
}
