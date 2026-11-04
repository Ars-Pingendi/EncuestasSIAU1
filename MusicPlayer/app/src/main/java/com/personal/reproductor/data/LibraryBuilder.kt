package com.personal.reproductor.data

import java.io.File
import java.text.Collator
import java.util.Locale

/** Agrupa la lista plana de canciones en álbumes, artistas, géneros y carpetas. */
object LibraryBuilder {

    val collator: Collator = Collator.getInstance(Locale("es")).apply { strength = Collator.PRIMARY }

    private val byTitle: Comparator<Track> = compareBy(collator) { it.title }

    fun build(tracks: List<Track>): Library {
        val sortedTracks = tracks.sortedWith(byTitle)

        val albums = sortedTracks.groupBy { it.albumId }.map { (id, list) ->
            Album(
                id = id,
                title = list.first().album,
                artist = albumArtist(list),
                year = list.maxOf { it.year },
                tracks = list.sortedWith(compareBy<Track> { it.trackNumber }.then(byTitle)),
            )
        }.sortedWith(compareBy(collator) { it.title })

        val albumsById = albums.associateBy { it.id }
        val artists = sortedTracks.groupBy { it.artist.trim().lowercase() }.map { (key, list) ->
            val name = list.first().artist
            Artist(
                key = key,
                name = name,
                albums = list.map { it.albumId }.distinct()
                    .mapNotNull { albumsById[it] }
                    .sortedWith(compareBy(collator) { it.title }),
                tracks = list.sortedWith(compareBy<Track>({ collator.getCollationKey(it.album) }, { it.trackNumber }).then(byTitle)),
            )
        }.sortedWith(compareBy(collator) { it.name })

        val genres = sortedTracks.groupBy { it.genre }.map { (name, list) ->
            Genre(name, list)
        }.sortedWith(compareBy(collator) { it.name })

        val folders = sortedTracks.groupBy { it.folderPath }.map { (path, list) ->
            Folder(path, path.substringAfterLast('/').ifEmpty { File.separator }, list)
        }.sortedWith(compareBy(collator) { it.name })

        return Library(
            loaded = true,
            tracks = sortedTracks,
            albums = albums,
            artists = artists,
            genres = genres,
            folders = folders,
            tracksById = sortedTracks.associateBy { it.id },
            tracksByPath = sortedTracks.associateBy { it.path },
            albumsById = albumsById,
        )
    }

    private fun albumArtist(tracks: List<Track>): String {
        val counts = tracks.groupingBy { it.artist }.eachCount()
        if (counts.size == 1) return counts.keys.first()
        val top = counts.maxByOrNull { it.value } ?: return VARIOUS_ARTISTS
        return if (top.value >= tracks.size * 0.7) top.key else VARIOUS_ARTISTS
    }
}
