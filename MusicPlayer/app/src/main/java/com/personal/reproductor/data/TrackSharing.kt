package com.personal.reproductor.data

import android.content.ClipData
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.MediaStore
import androidx.core.content.FileProvider
import com.personal.reproductor.data.youtube.YouTubeDownloads
import java.io.File

/**
 * Compartir canciones con otras apps (WhatsApp, Bluetooth, Gmail, Drive, Quick Share…)
 * mediante el menú «Compartir» de Android.
 *
 * - Música del teléfono: se comparte la entrada de MediaStore (sin copiar el archivo).
 * - Descargas de YouTube: viven dentro de la app con el id del video como nombre, así que se
 *   copian a la caché con un nombre legible («Artista - Título.m4a») y se exponen con FileProvider.
 */
object TrackSharing {
    private const val DIR = "compartir"
    private const val MAX_AGE_MS = 24L * 60 * 60 * 1000

    data class Shared(val uri: Uri, val mime: String)

    fun authority(context: Context) = "${context.packageName}.archivos"

    /** Nombre de archivo legible y válido en cualquier sistema. */
    fun fileName(track: Track, extension: String): String {
        val artist = track.artist.takeUnless { it.isBlank() || it == UNKNOWN_ARTIST }
        val base = listOfNotNull(artist, track.title.ifBlank { "Canción" }).joinToString(" - ")
        val clean = base
            .replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_")
            .replace(Regex("\\s+"), " ")
            .trim(' ', '.')
            .take(110)
            .ifBlank { "Canción" }
        return "$clean.$extension"
    }

    fun mimeFor(extension: String): String = when (extension.lowercase()) {
        "m4a", "mp4", "aac" -> "audio/mp4"
        "webm" -> "audio/webm"
        "mp3" -> "audio/mpeg"
        "ogg", "oga", "opus" -> "audio/ogg"
        "flac" -> "audio/flac"
        "wav" -> "audio/wav"
        else -> "audio/*"
    }

    /** Prepara los archivos (hilo de E/S). Las canciones de YouTube sin descargar se omiten. */
    fun prepare(context: Context, tracks: List<Track>, downloads: YouTubeDownloads): List<Shared> {
        cleanup(context)
        return tracks.mapNotNull { track ->
            val videoId = track.remoteId
            if (videoId == null) {
                val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, track.id)
                val mime = runCatching { context.contentResolver.getType(uri) }.getOrNull()
                    ?: mimeFor(track.path.substringAfterLast('.', ""))
                Shared(uri, mime)
            } else {
                val source = downloads.fileFor(videoId) ?: return@mapNotNull null
                val ext = source.extension.takeUnless { it == "audio" } ?: "m4a"
                val folder = File(File(context.cacheDir, DIR), videoId).apply { mkdirs() }
                val target = File(folder, fileName(track, ext))
                if (!target.isFile || target.length() != source.length()) {
                    folder.listFiles()?.forEach { it.delete() }
                    source.copyTo(target, overwrite = true)
                }
                Shared(FileProvider.getUriForFile(context, authority(context), target), mimeFor(ext))
            }
        }
    }

    /** Intent del menú «Compartir» del sistema con permiso de lectura para la app elegida. */
    fun chooser(items: List<Shared>, subject: String): Intent {
        val uris = ArrayList(items.map { it.uri })
        val mimes = items.map { it.mime }.distinct()
        val send = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).apply {
                type = mimes.first()
                putExtra(Intent.EXTRA_STREAM, uris.first())
            }
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = mimes.singleOrNull() ?: "audio/*"
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            }
        }
        send.putExtra(Intent.EXTRA_SUBJECT, subject)
        send.putExtra(Intent.EXTRA_TITLE, subject)
        send.clipData = ClipData.newRawUri(subject, uris.first()).apply {
            uris.drop(1).forEach { addItem(ClipData.Item(it)) }
        }
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return Intent.createChooser(send, "Compartir con…")
    }

    /** Enlaces de YouTube para las canciones que no están descargadas. */
    fun linkChooser(tracks: List<Track>): Intent {
        val text = tracks.filter { it.remoteId != null }.joinToString("\n") { "${it.title} – https://youtu.be/${it.remoteId}" }
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, text)
        }
        return Intent.createChooser(send, "Compartir enlace")
    }

    /** Borra las copias de más de un día (las apps de destino ya las leyeron). */
    private fun cleanup(context: Context) {
        val now = System.currentTimeMillis()
        File(context.cacheDir, DIR).listFiles()?.forEach { folder ->
            if (now - folder.lastModified() > MAX_AGE_MS) folder.deleteRecursively()
        }
    }
}
