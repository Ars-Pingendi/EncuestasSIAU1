package com.personal.reproductor.data.youtube

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.media3.datasource.DataSpec
import com.personal.reproductor.data.Track
import com.personal.reproductor.data.YOUTUBE_URI_SCHEME
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.io.IOException

/**
 * Descargas de YouTube para escuchar sin conexión. Los archivos se guardan dentro de la app
 * (no aparecen en otras apps) y se reproducen automáticamente en lugar de la versión en línea,
 * así que las canciones descargadas siguen funcionando en listas, favoritos y cola.
 */
class YouTubeDownloads(
    context: Context,
    private val youtube: YouTubeRepository,
    scope: CoroutineScope,
) {
    sealed interface Status {
        data object Queued : Status
        data class Running(val progress: Float?) : Status
        data class Failed(val message: String) : Status
    }

    private val dir: File =
        (context.getExternalFilesDir("youtube") ?: File(context.filesDir, "youtube")).also { it.mkdirs() }

    private val _downloaded = MutableStateFlow(scan())
    /** Ids de video ya descargados. */
    val downloaded: StateFlow<Set<String>> = _downloaded.asStateFlow()

    private val _status = MutableStateFlow<Map<String, Status>>(emptyMap())
    /** Descargas en cola, en curso o fallidas. */
    val status: StateFlow<Map<String, Status>> = _status.asStateFlow()

    private val _events = MutableSharedFlow<String>(extraBufferCapacity = 16)
    /** Mensajes para mostrar al usuario ("Descargada: …"). */
    val events: SharedFlow<String> = _events.asSharedFlow()

    private val queue = Channel<Track>(Channel.UNLIMITED)

    init {
        // Una descarga a la vez, en orden.
        scope.launch(Dispatchers.IO) {
            for (track in queue) process(track)
        }
    }

    private fun scan(): Set<String> =
        dir.listFiles()
            ?.filter { it.isFile && it.extension in AUDIO_EXTENSIONS && it.length() > 0 }
            ?.map { it.nameWithoutExtension }
            ?.toSet()
            ?: emptySet()

    fun fileFor(videoId: String): File? =
        AUDIO_EXTENSIONS.asSequence()
            .map { File(dir, "$videoId.$it") }
            .firstOrNull { it.isFile && it.length() > 0 }

    /** Si la canción está descargada, la petición se redirige al archivo local (funciona sin internet). */
    fun localDataSpec(dataSpec: DataSpec): DataSpec? {
        if (dataSpec.uri.scheme != YOUTUBE_URI_SCHEME) return null
        val videoId = dataSpec.uri.authority ?: return null
        val file = fileFor(videoId) ?: return null
        return dataSpec.buildUpon().setUri(Uri.fromFile(file)).build()
    }

    /** Pone en cola las canciones de YouTube indicadas. Devuelve cuántas se agregaron. */
    fun enqueue(tracks: List<Track>): Int {
        var added = 0
        for (track in tracks) {
            val id = track.remoteId ?: continue
            if (id in _downloaded.value) continue
            val current = _status.value[id]
            if (current is Status.Queued || current is Status.Running) continue
            _status.update { it + (id to Status.Queued) }
            queue.trySend(track)
            added++
        }
        return added
    }

    fun delete(videoId: String) {
        dir.listFiles()?.filter { it.nameWithoutExtension == videoId }?.forEach { it.delete() }
        _downloaded.update { it - videoId }
        _status.update { it - videoId }
    }

    fun deleteAll() {
        dir.listFiles()?.forEach { it.delete() }
        _downloaded.value = emptySet()
    }

    fun totalBytes(): Long = dir.listFiles()?.sumOf { it.length() } ?: 0L

    private fun process(track: Track) {
        val id = track.remoteId ?: return
        val part = File(dir, "$id.part")
        _status.update { it + (id to Status.Running(null)) }
        try {
            val source = youtube.resolveForDownload(id)
            youtube.downloadTo(source, part) { progress ->
                _status.update { it + (id to Status.Running(progress)) }
            }
            val target = File(dir, "$id.${source.extension}")
            if (!part.renameTo(target)) throw IOException("No se pudo guardar el archivo")
            _downloaded.update { it + id }
            _status.update { it - id }
            _events.tryEmit("Descargada: ${track.title}")
        } catch (e: CancellationException) {
            part.delete()
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Descarga fallida de $id", e)
            part.delete()
            youtube.invalidate(id)
            _status.update { it + (id to Status.Failed(e.message ?: e.javaClass.simpleName)) }
            _events.tryEmit("No se pudo descargar «${track.title}». Inténtalo de nuevo.")
        }
    }

    private companion object {
        const val TAG = "YouTubeDownloads"
        val AUDIO_EXTENSIONS = setOf("m4a", "webm", "mp3", "audio")
    }
}
