package com.personal.reproductor.tv

import com.personal.reproductor.data.Track
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Órdenes del teléfono hacia la TV («Reproducir en la TV»). La app de la TV no puede recibir
 * conexiones, así que pregunta al teléfono cada pocos segundos con una petición larga
 * («/pipo/remote»): si hay una orden nueva la recibe al instante; si no, el teléfono la deja
 * esperando hasta ~20 s. Que la TV pregunte seguido es también lo que indica que está conectada.
 */
object TvRemote {
    private class Entry(val seq: Long, val at: Long, val json: JSONObject)

    private const val KEEP_MS = 120_000L
    private const val CONNECTED_MS = 45_000L
    private const val MAX_TRACKS = 200

    private val lock = ReentrantLock()
    private val changed = lock.newCondition()
    private val entries = ArrayDeque<Entry>()
    private var seq = 0L

    @Volatile
    private var lastPollAt = 0L

    /** ¿Hay una TV preguntando ahora mismo? */
    fun tvConnected(): Boolean = System.currentTimeMillis() - lastPollAt < CONNECTED_MS

    /** Canción tal como la entiende la app de la TV (misma forma que en «/pipo/library»). */
    fun trackJson(t: Track): JSONObject {
        val videoId = t.remoteId
        return if (videoId != null) {
            JSONObject()
                .put("id", "yt:$videoId")
                .put("title", t.title)
                .put("artist", t.artist)
                .put("album", "YouTube")
                .put("albumArtist", "")
                .put("genre", "")
                .put("trackNo", 0)
                .put("discNo", 0)
                .put("year", 0)
                .put("durationMs", t.durationMs)
                .put("folder", "YouTube")
                .put("addedAt", System.currentTimeMillis())
                .put("source", "youtube")
                .put("art", t.artworkUrl?.takeIf { it.startsWith("https://") } ?: JSONObject.NULL)
        } else {
            JSONObject()
                .put("id", "a:${t.id}")
                .put("title", t.title)
                .put("artist", t.artist)
                .put("album", t.album)
                .put("albumArtist", "")
                .put("genre", t.genre)
                .put("trackNo", t.trackNumber % 1000)
                .put("discNo", t.trackNumber / 1000)
                .put("year", t.year)
                .put("durationMs", t.durationMs)
                .put("folder", t.folderPath)
                .put("addedAt", t.dateAddedSec * 1000)
                .put("source", "local")
                .put("art", "/pipo/art/${t.id}_${t.albumId}")
        }
    }

    /**
     * Encola una orden para la TV: «play» (empieza a sonar), «playNext» (a continuación) o
     * «enqueue» (al final de la cola). Devuelve si hay una TV conectada que la recibirá ya.
     */
    fun send(type: String, tracks: List<Track>, start: Int = 0): Boolean {
        val array = JSONArray()
        tracks.take(MAX_TRACKS).forEach { array.put(trackJson(it)) }
        val now = System.currentTimeMillis()
        lock.withLock {
            seq += 1
            val command = JSONObject().put("seq", seq).put("type", type).put("tracks", array).put("start", start)
            entries.addLast(Entry(seq, now, command))
            while (entries.isNotEmpty() && now - entries.first().at > KEEP_MS) entries.removeFirst()
            changed.signalAll()
        }
        return tvConnected()
    }

    /** Resultado de una pregunta de la TV: la posición actual y las órdenes nuevas. */
    class Poll(val seq: Long, val commands: List<JSONObject>)

    /**
     * Espera hasta [timeoutMs] órdenes posteriores a [since]. Con [since] negativo (la TV se acaba
     * de conectar) responde de inmediato con la posición actual, sin órdenes viejas.
     */
    fun await(since: Long, timeoutMs: Long): Poll {
        lastPollAt = System.currentTimeMillis()
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMs)
        lock.withLock {
            if (since < 0) return Poll(seq, emptyList())
            while (true) {
                val fresh = entries.filter { it.seq > since }
                if (fresh.isNotEmpty()) {
                    lastPollAt = System.currentTimeMillis()
                    return Poll(seq, fresh.map { it.json })
                }
                val left = deadline - System.nanoTime()
                if (left <= 0) break
                changed.awaitNanos(left)
            }
        }
        lastPollAt = System.currentTimeMillis()
        return Poll(seq, emptyList())
    }
}
