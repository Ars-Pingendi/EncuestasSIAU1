package com.personal.reproductor.data

import android.content.ContentUris
import android.net.Uri
import java.text.Normalizer

const val UNKNOWN_ARTIST = "Artista desconocido"
const val UNKNOWN_ALBUM = "Álbum desconocido"
const val UNKNOWN_GENRE = "Sin género"
const val VARIOUS_ARTISTS = "Varios artistas"

private val ALBUM_ART_BASE: Uri = Uri.parse("content://media/external/audio/albumart")
private val DIACRITICS = Regex("\\p{Mn}+")

/** Minúsculas y sin tildes: sirve para buscar sin preocuparse por acentos. */
fun String.fold(): String =
    Normalizer.normalize(this, Normalizer.Form.NFD).replace(DIACRITICS, "").lowercase()

data class Track(
    val id: Long,
    val title: String,
    val artist: String,
    val album: String,
    val albumId: Long,
    val durationMs: Long,
    val trackNumber: Int,
    val year: Int,
    val dateAddedSec: Long,
    val path: String,
    val genre: String,
    val sizeBytes: Long,
    /** Id del video si la canción viene de YouTube; null si es un archivo del dispositivo. */
    val remoteId: String? = null,
    /** Carátula remota (miniatura de YouTube). */
    val artworkUrl: String? = null,
) {
    val isRemote: Boolean get() = remoteId != null
    val albumArtUri: Uri get() = ContentUris.withAppendedId(ALBUM_ART_BASE, albumId)
    val folderPath: String = path.substringBeforeLast('/', "")
    val searchKey: String by lazy(LazyThreadSafetyMode.NONE) { "$title $artist $album".fold() }
}

data class Album(
    val id: Long,
    val title: String,
    val artist: String,
    val year: Int,
    val tracks: List<Track>,
) {
    val durationMs: Long get() = tracks.sumOf { it.durationMs }
    val coverTrackId: Long get() = tracks.first().id
}

data class Artist(
    val key: String,
    val name: String,
    val albums: List<Album>,
    val tracks: List<Track>,
)

data class Genre(val name: String, val tracks: List<Track>)

data class Folder(val path: String, val name: String, val tracks: List<Track>)

data class Library(
    val loaded: Boolean = false,
    val tracks: List<Track> = emptyList(),
    val albums: List<Album> = emptyList(),
    val artists: List<Artist> = emptyList(),
    val genres: List<Genre> = emptyList(),
    val folders: List<Folder> = emptyList(),
    val tracksById: Map<Long, Track> = emptyMap(),
    val tracksByPath: Map<String, Track> = emptyMap(),
    val albumsById: Map<Long, Album> = emptyMap(),
) {
    /** Busca una canción por id y, si el id cambió tras un reescaneo, por ruta de archivo. */
    fun resolve(id: Long, path: String?): Track? =
        tracksById[id] ?: path?.let { tracksByPath[it] }

    fun resolveAlbum(id: Long, title: String, artist: String): Album? =
        albumsById[id] ?: albums.firstOrNull { it.title == title && it.artist == artist }
}

// ---------------------------------------------------------------------------- YouTube

const val YOUTUBE_PATH_PREFIX = "yt:"
const val YOUTUBE_URI_SCHEME = "pipoyt"
const val YOUTUBE_ALBUM = "YouTube"

object YouTubeIds {
    /** Id numérico estable y negativo (FNV-1a de 64 bits) para no chocar con los ids de MediaStore. */
    fun trackId(videoId: String): Long {
        var h = -0x340d631b7bdddcdbL // 0xcbf29ce484222325
        for (ch in videoId) {
            h = h xor ch.code.toLong()
            h *= 0x100000001b3L
        }
        return -(h and Long.MAX_VALUE) - 1
    }

    fun path(videoId: String): String = YOUTUBE_PATH_PREFIX + videoId

    fun videoIdFromPath(path: String?): String? =
        path?.takeIf { it.startsWith(YOUTUBE_PATH_PREFIX) }?.removePrefix(YOUTUBE_PATH_PREFIX)?.takeIf { it.isNotBlank() }
}

fun youTubeTrack(videoId: String, title: String, artist: String, durationMs: Long, artworkUrl: String?): Track =
    Track(
        id = YouTubeIds.trackId(videoId),
        title = title.ifBlank { "Sin título" },
        artist = artist.ifBlank { UNKNOWN_ARTIST },
        album = YOUTUBE_ALBUM,
        albumId = 0L,
        durationMs = durationMs.coerceAtLeast(0L),
        trackNumber = 0,
        year = 0,
        dateAddedSec = 0L,
        path = YouTubeIds.path(videoId),
        genre = YOUTUBE_ALBUM,
        sizeBytes = 0L,
        remoteId = videoId,
        artworkUrl = artworkUrl,
    )
