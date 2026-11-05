package com.personal.reproductor.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.BaseAudioProcessor
import androidx.media3.common.util.UnstableApi
import java.nio.ByteBuffer
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.tanh

/**
 * Ecualizador gráfico de 10 bandas por software (filtros "peaking" biquad, receta RBJ).
 * Se inserta en la cadena de audio de ExoPlayer, por lo que suena igual en cualquier dispositivo.
 *
 * - Soporta PCM de 16 bits y de coma flotante; cualquier otro formato pasa sin tocarse.
 * - Reduce automáticamente la ganancia según el realce máximo de las bandas (margen de seguridad)
 *   y aplica un limitador suave para evitar la saturación.
 */
@UnstableApi
class EqAudioProcessor : BaseAudioProcessor() {

    /** Parámetros inmutables: la interfaz crea uno nuevo y el hilo de audio lo lee. */
    class Params(val enabled: Boolean, val gainsDb: DoubleArray)

    @Volatile
    private var params = Params(false, DoubleArray(BAND_COUNT))
    private var applied: Params? = null

    private var channels = 0
    private var sampleRate = 0
    private var floatInput = false

    private var activeBands = IntArray(0)
    private val b0 = DoubleArray(BAND_COUNT)
    private val b1 = DoubleArray(BAND_COUNT)
    private val b2 = DoubleArray(BAND_COUNT)
    private val a1 = DoubleArray(BAND_COUNT)
    private val a2 = DoubleArray(BAND_COUNT)
    private var z1 = Array(0) { DoubleArray(BAND_COUNT) }
    private var z2 = Array(0) { DoubleArray(BAND_COUNT) }
    private var preGain = 1.0

    fun setParams(p: Params) {
        params = p
    }

    override fun onConfigure(inputAudioFormat: AudioProcessor.AudioFormat): AudioProcessor.AudioFormat {
        val supported = (inputAudioFormat.encoding == C.ENCODING_PCM_16BIT ||
            inputAudioFormat.encoding == C.ENCODING_PCM_FLOAT) &&
            inputAudioFormat.channelCount in 1..8
        // NOT_SET = procesador inactivo para este formato (el audio pasa sin cambios).
        return if (supported) inputAudioFormat else AudioProcessor.AudioFormat.NOT_SET
    }

    override fun onFlush() {
        channels = inputAudioFormat.channelCount.coerceAtLeast(0)
        sampleRate = inputAudioFormat.sampleRate
        floatInput = inputAudioFormat.encoding == C.ENCODING_PCM_FLOAT
        z1 = Array(channels) { DoubleArray(BAND_COUNT) }
        z2 = Array(channels) { DoubleArray(BAND_COUNT) }
        applied = null
    }

    override fun queueInput(inputBuffer: ByteBuffer) {
        val remaining = inputBuffer.remaining()
        if (remaining == 0) return
        val output = replaceOutputBuffer(remaining)

        val p = params
        if (!p.enabled || channels == 0 || sampleRate <= 0) {
            output.put(inputBuffer)
            output.flip()
            return
        }
        if (p !== applied) recalculate(p)
        if (activeBands.isEmpty()) {
            output.put(inputBuffer)
            output.flip()
            return
        }

        val bytesPerSample = if (floatInput) 4 else 2
        val frames = remaining / (bytesPerSample * channels)
        var pos = inputBuffer.position()
        for (frame in 0 until frames) {
            for (c in 0 until channels) {
                val x = if (floatInput) {
                    inputBuffer.getFloat(pos).toDouble()
                } else {
                    inputBuffer.getShort(pos) / 32768.0
                }
                pos += bytesPerSample
                val y = softClip(filter(c, x * preGain))
                if (floatInput) {
                    output.putFloat(y.toFloat())
                } else {
                    output.putShort((y * 32767.0).roundToInt().coerceIn(-32768, 32767).toShort())
                }
            }
        }
        // Si quedó un frame incompleto, se copia tal cual.
        inputBuffer.position(pos)
        output.put(inputBuffer)
        output.flip()
    }

    private fun filter(channel: Int, x: Double): Double {
        var y = x
        val s1 = z1[channel]
        val s2 = z2[channel]
        for (k in activeBands) {
            val out = b0[k] * y + s1[k]
            s1[k] = b1[k] * y - a1[k] * out + s2[k]
            s2[k] = b2[k] * y - a2[k] * out
            y = out
        }
        return y
    }

    /** Compresión suave por encima de ~-1 dBFS: nunca supera 1.0 y no recorta de golpe. */
    private fun softClip(x: Double): Double {
        val a = abs(x)
        if (a <= KNEE) return x
        val shaped = KNEE + (1.0 - KNEE) * tanh((a - KNEE) / (1.0 - KNEE))
        return if (x < 0) -shaped else shaped
    }

    private fun recalculate(p: Params) {
        val active = ArrayList<Int>()
        var maxBoost = 0.0
        for (i in 0 until BAND_COUNT) {
            val gain = p.gainsDb.getOrElse(i) { 0.0 }
            val f0 = FREQS_HZ[i]
            if (abs(gain) < 0.05 || f0 >= sampleRate * 0.45) {
                for (c in 0 until channels) {
                    z1[c][i] = 0.0
                    z2[c][i] = 0.0
                }
                continue
            }
            val amp = 10.0.pow(gain / 40.0)
            val w0 = 2.0 * PI * f0 / sampleRate
            val cosW = cos(w0)
            val alpha = sin(w0) / (2.0 * Q)
            val a0 = 1.0 + alpha / amp
            b0[i] = (1.0 + alpha * amp) / a0
            b1[i] = (-2.0 * cosW) / a0
            b2[i] = (1.0 - alpha * amp) / a0
            a1[i] = (-2.0 * cosW) / a0
            a2[i] = (1.0 - alpha / amp) / a0
            active += i
            if (gain > maxBoost) maxBoost = gain
        }
        activeBands = active.toIntArray()
        preGain = 10.0.pow(-HEADROOM * maxBoost / 20.0)
        applied = p
    }

    companion object {
        const val BAND_COUNT = 10
        val FREQS_HZ = doubleArrayOf(31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0)
        private const val Q = 1.41      // separación de una octava
        private const val HEADROOM = 0.7 // fracción del realce máximo que se compensa
        private const val KNEE = 0.89    // ~ -1 dBFS
    }
}
