package com.personal.reproductor.data

import android.content.ContentResolver
import android.content.Context
import android.provider.MediaStore
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Lee el índice de audio de Android (MediaStore), que cubre la memoria interna
 * y las tarjetas SD. Es la forma recomendada de "buscar en el almacenamiento".
 */
object MediaStoreScanner {

    private const val TAG = "MediaStoreScanner"

    private val ID3V1_GENRES = listOf(
        "Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal",
        "New Age", "Oldies", "Other", "Pop", "R&B", "Rap", "Reggae", "Rock", "Techno", "Industrial",
        "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop",
        "Vocal", "Jazz+Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game",
        "Sound Clip", "Gospel", "Noise", "AlternRock", "Bass", "Soul", "Punk", "Space", "Meditative",
        "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial",
        "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta",
        "Top 40", "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave",
        "Psychadelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz",
        "Polka", "Retro", "Musical", "Rock & Roll", "Hard Rock",
    )
    private val GENRE_NUMBER = Regex("^\\(?(\\d{1,3})\\)?$")

    suspend fun scan(context: Context, minDurationMs: Long, includeAllAudio: Boolean): List<Track> =
        withContext(Dispatchers.IO) {
            val resolver = context.contentResolver
            val genres = loadGenres(resolver)
            val tracks = ArrayList<Track>()

            val projection = arrayOf(
                MediaStore.Audio.Media._ID,
                MediaStore.Audio.Media.TITLE,
                MediaStore.Audio.Media.ARTIST,
                MediaStore.Audio.Media.ALBUM,
                MediaStore.Audio.Media.ALBUM_ID,
                MediaStore.Audio.Media.DURATION,
                MediaStore.Audio.Media.TRACK,
                MediaStore.Audio.Media.YEAR,
                MediaStore.Audio.Media.DATE_ADDED,
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.SIZE,
            )
            val selection = buildString {
                if (!includeAllAudio) append("${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ")
                append("${MediaStore.Audio.Media.DURATION} >= ?")
            }

            resolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                arrayOf(minDurationMs.toString()),
                null,
            )?.use { c ->
                val iId = c.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val iTitle = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
                val iArtist = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
                val iAlbum = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
                val iAlbumId = c.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)
                val iDuration = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
                val iTrack = c.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK)
                val iYear = c.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR)
                val iAdded = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATE_ADDED)
                val iData = c.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA)
                val iSize = c.getColumnIndexOrThrow(MediaStore.Audio.Media.SIZE)

                while (c.moveToNext()) {
                    val id = c.getLong(iId)
                    val path = c.getString(iData).orEmpty()
                    val title = c.getString(iTitle)?.trim().takeUnless { it.isNullOrEmpty() }
                        ?: path.substringAfterLast('/').substringBeforeLast('.').ifEmpty { "Sin título" }
                    tracks += Track(
                        id = id,
                        title = title,
                        artist = cleanName(c.getString(iArtist), UNKNOWN_ARTIST),
                        album = cleanName(c.getString(iAlbum), UNKNOWN_ALBUM),
                        albumId = c.getLong(iAlbumId),
                        durationMs = c.getLong(iDuration),
                        trackNumber = c.getInt(iTrack) % 1000, // 1003 = disco 1, pista 3
                        year = c.getInt(iYear),
                        dateAddedSec = c.getLong(iAdded),
                        path = path,
                        genre = genres[id] ?: UNKNOWN_GENRE,
                        sizeBytes = c.getLong(iSize),
                    )
                }
            }
            tracks
        }

    private fun cleanName(raw: String?, fallback: String): String {
        val s = raw?.trim().orEmpty()
        return if (s.isEmpty() || s == "<unknown>") fallback else s
    }

    /** Géneros: id de canción -> nombre de género (funciona en todas las versiones de Android). */
    private fun loadGenres(resolver: ContentResolver): Map<Long, String> {
        val result = HashMap<Long, String>()
        try {
            resolver.query(
                MediaStore.Audio.Genres.EXTERNAL_CONTENT_URI,
                arrayOf(MediaStore.Audio.Genres._ID, MediaStore.Audio.Genres.NAME),
                null, null, null,
            )?.use { g ->
                while (g.moveToNext()) {
                    val genreId = g.getLong(0)
                    val name = normalizeGenre(g.getString(1))
                    val members = MediaStore.Audio.Genres.Members.getContentUri("external", genreId)
                    resolver.query(
                        members,
                        arrayOf(MediaStore.Audio.Genres.Members.AUDIO_ID),
                        null, null, null,
                    )?.use { m ->
                        while (m.moveToNext()) result.putIfAbsent(m.getLong(0), name)
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "No se pudieron leer los géneros", e)
        }
        return result
    }

    private fun normalizeGenre(raw: String?): String {
        val s = raw?.trim().orEmpty()
        if (s.isEmpty()) return UNKNOWN_GENRE
        val m = GENRE_NUMBER.matchEntire(s)
        if (m != null) return ID3V1_GENRES.getOrNull(m.groupValues[1].toInt()) ?: UNKNOWN_GENRE
        return s
    }
}
