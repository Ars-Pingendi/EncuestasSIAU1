package com.personal.reproductor.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Virtualizer
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.ln
import kotlin.math.roundToInt

/** Preajuste definido en 10 frecuencias estándar (dB). */
class EqPreset(val name: String, val anchorsDb: DoubleArray)

object EqPresets {
    val ISO_HZ = doubleArrayOf(31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)

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

    /** Valor en dB de una curva de 10 puntos ISO, interpolado (frecuencia logarítmica) en [freqHz]. */
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

    /** Convierte los niveles de bandas arbitrarias (Hz, dB) en la curva de 10 puntos ISO. */
    fun anchorsFromBands(freqsHz: List<Int>, levelsDb: List<Double>): DoubleArray {
        if (freqsHz.isEmpty() || freqsHz.size != levelsDb.size) return DoubleArray(ISO_HZ.size)
        return DoubleArray(ISO_HZ.size) { i ->
            val f = ISO_HZ[i]
            when {
                f <= freqsHz.first() -> levelsDb.first()
                f >= freqsHz.last() -> levelsDb.last()
                else -> {
                    var j = 0
                    while (j < freqsHz.size - 2 && f > freqsHz[j + 1]) j++
                    val lo = freqsHz[j].toDouble()
                    val hi = freqsHz[j + 1].toDouble()
                    val t = (ln(f) - ln(lo)) / (ln(hi) - ln(lo))
                    levelsDb[j] + (levelsDb[j + 1] - levelsDb[j]) * t
                }
            }
        }
    }
}

/**
 * Controla todo el procesamiento de audio de la app:
 *  - Ecualizador de 10 bandas por software ([EqAudioProcessor], dentro de ExoPlayer) o el del sistema.
 *  - Refuerzo de graves, sonido envolvente y amplificación (efectos de Android).
 *  - Un perfil de ajustes por salida de audio (altavoz, cable, Bluetooth) que se cambia solo.
 *
 * Es un singleton de la app: el servicio de reproducción lo conecta y la pantalla del ecualizador lo manipula.
 */
class AudioEffectsController(context: Context) {

    enum class Engine { SOFTWARE, SYSTEM }

    enum class OutputProfile(val key: String, val label: String) {
        GENERAL("general", "General"),
        SPEAKER("altavoz", "Altavoz del teléfono"),
        WIRED("cable", "Audífonos con cable o USB"),
        BLUETOOTH("bluetooth", "Bluetooth"),
    }

    /** Preajuste del usuario: curva de 10 puntos ISO (dB). */
    data class CustomPreset(val name: String, val anchorsDb: List<Double>)

    data class EqState(
        /** El servicio de reproducción ya conectó los efectos. */
        val attached: Boolean = false,
        /** El motor elegido está listo para usarse. */
        val available: Boolean = false,
        val engine: Engine = Engine.SOFTWARE,
        val sysAvailable: Boolean = false,
        val sysBandCount: Int = 0,
        val enabled: Boolean = false,
        /** Frecuencias, rango y niveles del motor activo. */
        val centerFreqsHz: List<Int> = emptyList(),
        val minLevelMb: Int = SOFT_MIN_MB,
        val maxLevelMb: Int = SOFT_MAX_MB,
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
        val autoProfiles: Boolean = true,
        val profile: OutputProfile = OutputProfile.SPEAKER,
    )

    /** Ajustes que se guardan por perfil. */
    private data class ProfileSettings(
        val enabled: Boolean = false,
        val engine: Engine = Engine.SOFTWARE,
        val softLevelsMb: List<Int> = List(SOFT_BANDS) { 0 },
        val sysLevelsMb: List<Int> = emptyList(),
        val presetName: String? = null,
        val bassStrength: Int = 0,
        val virtualizerStrength: Int = 0,
        val gainMb: Int = 0,
    )

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("ecualizador", Context.MODE_PRIVATE)
    private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val handler = Handler(Looper.getMainLooper())

    private var processor: EqAudioProcessor? = null
    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var virtualizer: Virtualizer? = null
    private var loudness: LoudnessEnhancer? = null
    private var attachedSession = -1
    private var attached = false

    private var sysAvailable = false
    private var sysFreqs: List<Int> = emptyList()
    private var sysMin = -1500
    private var sysMax = 1500
    private var bassSupported = false
    private var virtSupported = false
    private var gainSupported = false

    private var autoProfiles = prefs.getBoolean(K_AUTO, true)
    private var customPresets: List<CustomPreset> = readCustomPresets()
    private var activeProfile = if (autoProfiles) OutputProfile.SPEAKER else OutputProfile.GENERAL
    private var settings: ProfileSettings = loadProfile(activeProfile) ?: migrateLegacy()

    private val _state = MutableStateFlow(buildState())
    val state: StateFlow<EqState> = _state.asStateFlow()

    private var monitoring = false
    private val recheck = Runnable { onRouteChanged() }
    private val deviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = refreshRoute()
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = refreshRoute()
    }

    // ------------------------------------------------------------------ conexión con el reproductor

    /** Crea el procesador de 10 bandas que el servicio inserta en la cadena de audio de ExoPlayer. */
    fun createProcessor(): EqAudioProcessor {
        val p = EqAudioProcessor()
        processor = p
        push()
        return p
    }

    fun attach(sessionId: Int) {
        if (sessionId <= 0) return
        if (sessionId == attachedSession && attached) return
        releaseEffects()
        attachedSession = sessionId

        sysAvailable = false
        sysFreqs = emptyList()
        val eq = guard("Equalizer") { Equalizer(0, sessionId) }
        if (eq != null) {
            val ok = guard("configurar Equalizer") {
                val bands = eq.numberOfBands.toInt()
                val range = eq.bandLevelRange
                sysMin = range[0].toInt()
                sysMax = range[1].toInt()
                sysFreqs = List(bands) { eq.getCenterFreq(it.toShort()) / 1000 }
                true
            }
            if (ok == true) {
                equalizer = eq
                sysAvailable = sysFreqs.isNotEmpty()
            } else {
                eq.release()
            }
        }

        val bb = guard("BassBoost") { BassBoost(0, sessionId) }
        bassSupported = bb != null && guard("BassBoost.soporte") { bb.strengthSupported } == true
        if (bassSupported) bassBoost = bb else bb?.release()

        val vz = guard("Virtualizer") { Virtualizer(0, sessionId) }
        virtSupported = vz != null && guard("Virtualizer.soporte") { vz.strengthSupported } == true
        if (virtSupported) virtualizer = vz else vz?.release()

        val le = guard("LoudnessEnhancer") { LoudnessEnhancer(sessionId) }
        gainSupported = le != null
        if (le != null) loudness = le

        attached = true
        settings = normalize(settings)
        push()
        publish()
        Log.i(TAG, "Efectos conectados (sesión $sessionId): bandas sistema=${sysFreqs.size} graves=$bassSupported virt=$virtSupported ganancia=$gainSupported")
        startRouteMonitor()
    }

    fun detach() {
        stopRouteMonitor()
        releaseEffects()
        processor = null
        attachedSession = -1
        attached = false
        sysAvailable = false
        publish()
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

    fun setEnabled(on: Boolean) = mutate { it.copy(enabled = on) }

    fun setEngine(engine: Engine) {
        if (engine == Engine.SYSTEM && !sysAvailable) return
        mutate { it.copy(engine = engine) }
    }

    fun setBandLevel(index: Int, levelMb: Int) = mutate { s ->
        if (s.engine == Engine.SOFTWARE) {
            if (index !in s.softLevelsMb.indices) return@mutate s
            val v = levelMb.coerceIn(SOFT_MIN_MB, SOFT_MAX_MB)
            s.copy(
                enabled = true,
                softLevelsMb = s.softLevelsMb.toMutableList().also { it[index] = v },
                presetName = null,
            )
        } else {
            if (index !in s.sysLevelsMb.indices) return@mutate s
            val v = levelMb.coerceIn(sysMin, sysMax)
            s.copy(
                enabled = true,
                sysLevelsMb = s.sysLevelsMb.toMutableList().also { it[index] = v },
                presetName = null,
            )
        }
    }

    fun applyPreset(name: String) {
        val anchors: DoubleArray = EqPresets.builtIn.firstOrNull { it.name == name }?.anchorsDb
            ?: customPresets.firstOrNull { it.name == name }?.anchorsDb?.toDoubleArray()
            ?: return
        if (anchors.size != EqPresets.ISO_HZ.size) return
        mutate { s ->
            s.copy(
                enabled = true,
                presetName = name,
                softLevelsMb = anchors.map { (it * 100).roundToInt().coerceIn(SOFT_MIN_MB, SOFT_MAX_MB) },
                sysLevelsMb = if (sysFreqs.isEmpty()) {
                    s.sysLevelsMb
                } else {
                    sysFreqs.map { hz ->
                        (EqPresets.interpolate(anchors, hz.toDouble()) * 100).roundToInt().coerceIn(sysMin, sysMax)
                    }
                },
            )
        }
    }

    fun resetAll() = mutate { s ->
        s.copy(
            softLevelsMb = List(SOFT_BANDS) { 0 },
            sysLevelsMb = List(s.sysLevelsMb.size) { 0 },
            presetName = "Plano",
            bassStrength = 0,
            virtualizerStrength = 0,
            gainMb = 0,
        )
    }

    fun setBass(strength: Int) = mutate { it.copy(enabled = true, bassStrength = strength.coerceIn(0, 1000)) }

    fun setVirtualizer(strength: Int) =
        mutate { it.copy(enabled = true, virtualizerStrength = strength.coerceIn(0, 1000)) }

    fun setGain(gainMb: Int) = mutate { it.copy(enabled = true, gainMb = gainMb.coerceIn(0, MAX_GAIN_MB)) }

    fun saveCustomPreset(rawName: String) {
        var name = rawName.trim().take(30)
        val s = settings
        if (name.isEmpty()) return
        if (EqPresets.builtIn.any { it.name.equals(name, ignoreCase = true) }) name = "$name (mío)"
        val anchors: List<Double> = if (s.engine == Engine.SOFTWARE) {
            s.softLevelsMb.map { it / 100.0 }
        } else {
            EqPresets.anchorsFromBands(sysFreqs, s.sysLevelsMb.map { it / 100.0 }).toList()
        }
        val others = customPresets.filterNot { it.name.equals(name, ignoreCase = true) }
        customPresets = others + CustomPreset(name, anchors)
        persistCustom()
        mutate { it.copy(presetName = name) }
        publish()
    }

    fun deleteCustomPreset(name: String) {
        customPresets = customPresets.filterNot { it.name == name }
        persistCustom()
        if (settings.presetName == name) mutate { it.copy(presetName = null) }
        publish()
    }

    fun setAutoProfiles(on: Boolean) {
        autoProfiles = on
        prefs.edit().putBoolean(K_AUTO, on).apply()
        switchProfile(if (on) detectProfile() else OutputProfile.GENERAL)
    }

    // ------------------------------------------------------------------ perfiles por salida de audio

    private fun switchProfile(target: OutputProfile) {
        if (target == activeProfile) {
            publish()
            return
        }
        activeProfile = target
        // Si el perfil nunca se configuró, hereda el ajuste actual para que el sonido no cambie de golpe.
        settings = normalize(loadProfile(target) ?: settings)
        persistProfile()
        push()
        publish()
    }

    private fun onRouteChanged() {
        if (autoProfiles) switchProfile(detectProfile())
    }

    private fun refreshRoute() {
        onRouteChanged()
        // Al conectar Bluetooth, Android tarda un instante en redirigir el audio.
        handler.removeCallbacks(recheck)
        handler.postDelayed(recheck, 900)
    }

    private fun startRouteMonitor() {
        if (monitoring) return
        monitoring = true
        try {
            audioManager.registerAudioDeviceCallback(deviceCallback, handler)
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo vigilar la salida de audio", e)
        }
        onRouteChanged()
    }

    private fun stopRouteMonitor() {
        if (!monitoring) return
        monitoring = false
        handler.removeCallbacks(recheck)
        try {
            audioManager.unregisterAudioDeviceCallback(deviceCallback)
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo detener la vigilancia de salida", e)
        }
    }

    private fun detectProfile(): OutputProfile {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
                val routed = audioManager.getAudioDevicesForAttributes(attrs).map { it.type }
                profileOf(routed)?.let { return it }
            }
            val connected = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }
            return profileOf(connected) ?: OutputProfile.SPEAKER
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo detectar la salida de audio", e)
            return OutputProfile.SPEAKER
        }
    }

    private fun profileOf(types: List<Int>): OutputProfile? = when {
        types.any { it in WIRED_TYPES } -> OutputProfile.WIRED
        types.any { it in BLUETOOTH_TYPES } -> OutputProfile.BLUETOOTH
        types.any { it == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER || it == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE } ->
            OutputProfile.SPEAKER
        else -> null
    }

    // ------------------------------------------------------------------ estado y aplicación

    private inline fun mutate(transform: (ProfileSettings) -> ProfileSettings) {
        val next = transform(settings)
        if (next == settings) return
        settings = next
        persistProfile()
        push()
        publish()
    }

    private fun normalize(s: ProfileSettings): ProfileSettings {
        val soft = if (s.softLevelsMb.size == SOFT_BANDS) {
            s.softLevelsMb.map { it.coerceIn(SOFT_MIN_MB, SOFT_MAX_MB) }
        } else {
            List(SOFT_BANDS) { 0 }
        }
        val sys = when {
            sysFreqs.isEmpty() -> s.sysLevelsMb
            s.sysLevelsMb.size == sysFreqs.size -> s.sysLevelsMb.map { it.coerceIn(sysMin, sysMax) }
            else -> List(sysFreqs.size) { 0 }
        }
        val engine = if (s.engine == Engine.SYSTEM && attached && !sysAvailable) Engine.SOFTWARE else s.engine
        return s.copy(softLevelsMb = soft, sysLevelsMb = sys, engine = engine)
    }

    /** Envía el estado completo a los motores reales (si están conectados). */
    private fun push() {
        val s = settings
        val soft = s.engine == Engine.SOFTWARE

        processor?.setParams(
            EqAudioProcessor.Params(
                enabled = s.enabled && soft,
                gainsDb = DoubleArray(EqAudioProcessor.BAND_COUNT) { s.softLevelsMb.getOrElse(it) { 0 } / 100.0 },
            ),
        )
        equalizer?.let { eq ->
            guard("aplicar ecualizador del sistema") {
                eq.setEnabled(s.enabled && !soft)
                if (s.sysLevelsMb.size == sysFreqs.size) {
                    s.sysLevelsMb.forEachIndexed { i, mb -> eq.setBandLevel(i.toShort(), mb.toShort()) }
                }
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

    private fun publish() {
        _state.value = buildState()
    }

    private fun buildState(): EqState {
        val s = settings
        val soft = s.engine == Engine.SOFTWARE
        return EqState(
            attached = attached,
            available = attached && (soft || sysAvailable),
            engine = s.engine,
            sysAvailable = sysAvailable,
            sysBandCount = sysFreqs.size,
            enabled = s.enabled,
            centerFreqsHz = if (soft) EqPresets.ISO_HZ.map { it.roundToInt() } else sysFreqs,
            minLevelMb = if (soft) SOFT_MIN_MB else sysMin,
            maxLevelMb = if (soft) SOFT_MAX_MB else sysMax,
            levelsMb = if (soft) s.softLevelsMb else s.sysLevelsMb,
            presetName = s.presetName,
            bassSupported = bassSupported,
            bassStrength = s.bassStrength,
            virtualizerSupported = virtSupported,
            virtualizerStrength = s.virtualizerStrength,
            gainSupported = gainSupported,
            gainMb = s.gainMb,
            customPresets = customPresets,
            autoProfiles = autoProfiles,
            profile = activeProfile,
        )
    }

    // ------------------------------------------------------------------ persistencia

    private fun persistProfile() {
        prefs.edit().putString("profile_${activeProfile.key}", settingsToJson(settings)).apply()
    }

    private fun loadProfile(profile: OutputProfile): ProfileSettings? {
        val json = prefs.getString("profile_${profile.key}", null) ?: return null
        return try {
            val o = JSONObject(json)
            ProfileSettings(
                enabled = o.optBoolean("enabled", false),
                engine = runCatching { Engine.valueOf(o.optString("engine")) }.getOrDefault(Engine.SOFTWARE),
                softLevelsMb = parseInts(o.optString("soft")).let { if (it.size == SOFT_BANDS) it else List(SOFT_BANDS) { 0 } },
                sysLevelsMb = parseInts(o.optString("sys")),
                presetName = o.optString("preset").takeIf { it.isNotBlank() },
                bassStrength = o.optInt("bass", 0),
                virtualizerStrength = o.optInt("virt", 0),
                gainMb = o.optInt("gain", 0),
            )
        } catch (e: Exception) {
            null
        }
    }

    private fun settingsToJson(s: ProfileSettings): String = JSONObject()
        .put("enabled", s.enabled)
        .put("engine", s.engine.name)
        .put("soft", s.softLevelsMb.joinToString(","))
        .put("sys", s.sysLevelsMb.joinToString(","))
        .put("preset", s.presetName ?: "")
        .put("bass", s.bassStrength)
        .put("virt", s.virtualizerStrength)
        .put("gain", s.gainMb)
        .toString()

    private fun parseInts(csv: String): List<Int> = csv.split(',').mapNotNull { it.trim().toIntOrNull() }

    /** Ajustes de la versión anterior (un solo ecualizador del sistema): se conservan los efectos y el estado. */
    private fun migrateLegacy(): ProfileSettings {
        val presetName = prefs.getString(K_PRESET, null)
        val anchors = EqPresets.builtIn.firstOrNull { it.name == presetName }?.anchorsDb
        return ProfileSettings(
            enabled = prefs.getBoolean(K_ENABLED, false),
            softLevelsMb = anchors?.map { (it * 100).roundToInt().coerceIn(SOFT_MIN_MB, SOFT_MAX_MB) }
                ?: List(SOFT_BANDS) { 0 },
            sysLevelsMb = parseInts(prefs.getString(K_LEVELS, "").orEmpty()),
            presetName = if (anchors != null) presetName else null,
            bassStrength = prefs.getInt(K_BASS, 0),
            virtualizerStrength = prefs.getInt(K_VIRT, 0),
            gainMb = prefs.getInt(K_GAIN, 0),
        )
    }

    private fun persistCustom() {
        prefs.edit().putString(K_CUSTOM_V2, customToJson(customPresets)).apply()
    }

    private fun customToJson(list: List<CustomPreset>): String {
        val arr = JSONArray()
        list.forEach { p -> arr.put(JSONObject().put("name", p.name).put("anchors", JSONArray(p.anchorsDb))) }
        return arr.toString()
    }

    private fun readCustomPresets(): List<CustomPreset> {
        try {
            val v2 = prefs.getString(K_CUSTOM_V2, null)
            if (v2 != null) {
                val arr = JSONArray(v2)
                return List(arr.length()) { i ->
                    val o = arr.getJSONObject(i)
                    val a = o.getJSONArray("anchors")
                    CustomPreset(o.getString("name"), List(a.length()) { j -> a.getDouble(j) })
                }.filter { it.anchorsDb.size == EqPresets.ISO_HZ.size }
            }
            // Versión anterior: niveles de las bandas del dispositivo (normalmente 5). Se convierten a 10 puntos.
            val legacy = prefs.getString(K_CUSTOM_LEGACY, null) ?: return emptyList()
            val arr = JSONArray(legacy)
            val converted = (0 until arr.length()).mapNotNull { i ->
                val o = arr.getJSONObject(i)
                val l = o.getJSONArray("levels")
                val db = List(l.length()) { j -> l.getInt(j) / 100.0 }
                val anchors = when (db.size) {
                    LEGACY_BANDS_HZ.size -> EqPresets.anchorsFromBands(LEGACY_BANDS_HZ, db).toList()
                    EqPresets.ISO_HZ.size -> db
                    else -> return@mapNotNull null
                }
                CustomPreset(o.getString("name"), anchors)
            }
            prefs.edit().putString(K_CUSTOM_V2, customToJson(converted)).apply()
            return converted
        } catch (e: Exception) {
            return emptyList()
        }
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
        const val SOFT_BANDS = 10
        const val SOFT_MIN_MB = -1200
        const val SOFT_MAX_MB = 1200

        private const val K_AUTO = "auto_profiles"
        private const val K_CUSTOM_V2 = "custom_presets_v2"
        private const val K_CUSTOM_LEGACY = "custom_presets"
        private const val K_ENABLED = "enabled"
        private const val K_LEVELS = "levels"
        private const val K_PRESET = "preset"
        private const val K_BASS = "bass"
        private const val K_VIRT = "virtualizer"
        private const val K_GAIN = "gain"

        private val LEGACY_BANDS_HZ = listOf(60, 230, 910, 3600, 14000)

        private val WIRED_TYPES = setOf(
            AudioDeviceInfo.TYPE_WIRED_HEADSET,
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
            AudioDeviceInfo.TYPE_USB_HEADSET,
            AudioDeviceInfo.TYPE_USB_DEVICE,
            AudioDeviceInfo.TYPE_LINE_ANALOG,
            AudioDeviceInfo.TYPE_LINE_DIGITAL,
        )
        private val BLUETOOTH_TYPES = setOf(
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
            AudioDeviceInfo.TYPE_HEARING_AID,
            AudioDeviceInfo.TYPE_BLE_HEADSET,
            AudioDeviceInfo.TYPE_BLE_SPEAKER,
            AudioDeviceInfo.TYPE_BLE_BROADCAST,
        )
    }
}
