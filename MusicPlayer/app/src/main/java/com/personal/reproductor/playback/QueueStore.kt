package com.personal.reproductor.playback

import android.content.Context
import android.util.Log
import androidx.media3.common.MediaItem
import org.json.JSONArray
import java.io.File

/**
 * Guarda la cola de reproducción (lista de canciones) en un archivo y el estado
 * (posición, aleatorio, repetir) en preferencias, para retomar justo donde se quedó.
 */
class QueueStore(context: Context) {

    data class Row(
        val id: Long,
        val title: String,
        val artist: String,
        val album: String,
        val albumId: Long,
        val durationMs: Long,
        val path: String,
    ) {
        fun toMediaItem(): MediaItem = buildMediaItem(id, title, artist, album, albumId, durationMs, path)
    }

    data class Snapshot(
        val rows: List<Row>,
        val index: Int,
        val positionMs: Long,
        val shuffle: Boolean,
        val repeatMode: Int,
    )

    private val file = File(context.filesDir, "cola.json")
    private val tmpFile = File(context.filesDir, "cola.json.tmp")
    private val prefs = context.getSharedPreferences("cola_estado", Context.MODE_PRIVATE)

    fun rowsOf(items: List<MediaItem>): List<Row> = items.mapNotNull { item ->
        val id = item.mediaId.toLongOrNull() ?: return@mapNotNull null
        val md = item.mediaMetadata
        val extras = md.extras
        Row(
            id = id,
            title = md.title?.toString().orEmpty(),
            artist = md.artist?.toString().orEmpty(),
            album = md.albumTitle?.toString().orEmpty(),
            albumId = extras?.getLong(EXTRA_ALBUM_ID) ?: 0L,
            durationMs = extras?.getLong(EXTRA_DURATION_MS) ?: 0L,
            path = extras?.getString(EXTRA_PATH).orEmpty(),
        )
    }

    @Synchronized
    fun saveRows(rows: List<Row>) {
        try {
            val array = JSONArray()
            rows.forEach { r ->
                array.put(
                    JSONArray()
                        .put(r.id)
                        .put(r.title)
                        .put(r.artist)
                        .put(r.album)
                        .put(r.albumId)
                        .put(r.durationMs)
                        .put(r.path),
                )
            }
            tmpFile.writeText(array.toString())
            if (!tmpFile.renameTo(file)) {
                file.delete()
                tmpFile.renameTo(file)
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo guardar la cola", e)
        }
    }

    fun saveState(index: Int, positionMs: Long, shuffle: Boolean, repeatMode: Int) {
        prefs.edit()
            .putInt(K_INDEX, index)
            .putLong(K_POSITION, positionMs)
            .putBoolean(K_SHUFFLE, shuffle)
            .putInt(K_REPEAT, repeatMode)
            .apply()
    }

    @Synchronized
    fun load(): Snapshot? {
        return try {
            if (!file.exists()) return null
            val array = JSONArray(file.readText())
            val rows = List(array.length()) { i ->
                val r = array.getJSONArray(i)
                Row(
                    id = r.getLong(0),
                    title = r.getString(1),
                    artist = r.getString(2),
                    album = r.getString(3),
                    albumId = r.getLong(4),
                    durationMs = r.getLong(5),
                    path = r.getString(6),
                )
            }
            if (rows.isEmpty()) return null
            Snapshot(
                rows = rows,
                index = prefs.getInt(K_INDEX, 0).coerceIn(0, rows.lastIndex),
                positionMs = prefs.getLong(K_POSITION, 0L).coerceAtLeast(0L),
                shuffle = prefs.getBoolean(K_SHUFFLE, false),
                repeatMode = prefs.getInt(K_REPEAT, 0),
            )
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo leer la cola guardada", e)
            null
        }
    }

    private companion object {
        const val TAG = "QueueStore"
        const val K_INDEX = "index"
        const val K_POSITION = "position"
        const val K_SHUFFLE = "shuffle"
        const val K_REPEAT = "repeat"
    }
}
