package com.personal.reproductor.data

import android.content.ContentUris
import android.net.Uri
import android.provider.MediaStore
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
) {
    val uri: Uri get() = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
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
