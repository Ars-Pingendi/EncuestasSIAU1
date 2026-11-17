package com.personal.reproductor.data.youtube

import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Registro corto de lo que pasa entre la TV, el teléfono y YouTube. La TV lo muestra en
 * Ajustes › «Registro del teléfono» para saber en qué paso falló un video.
 */
object YouTubeLog {
    private const val MAX_LINES = 250
    private val lines = ArrayDeque<String>()
    private val clock = SimpleDateFormat("HH:mm:ss", Locale.US)

    fun add(tag: String, message: String) {
        Log.i("PipoTV", "$tag: $message")
        val line = "${clock.format(Date())} $tag: $message"
        synchronized(lines) {
            lines.addLast(line)
            while (lines.size > MAX_LINES) lines.removeFirst()
        }
    }

    /** Las últimas líneas, de la más reciente a la más antigua. */
    fun dump(max: Int = 80): String = synchronized(lines) { lines.toList().takeLast(max).reversed().joinToString("\n") }
}
