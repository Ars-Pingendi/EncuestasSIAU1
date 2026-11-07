package com.personal.reproductor.ui

import androidx.media3.common.Player
import com.personal.reproductor.data.Track

enum class SmartList(val title: String) {
    RECENTLY_ADDED("Agregadas recientemente"),
    MOST_PLAYED("Más reproducidas"),
    RECENTLY_PLAYED("Reproducidas recientemente"),
}

sealed interface Route {
    data object Home : Route
    data class AlbumRoute(val id: Long) : Route
    data class ArtistRoute(val key: String) : Route
    data class GenreRoute(val name: String) : Route
    data class FolderRoute(val path: String) : Route
    data class PlaylistRoute(val id: Long) : Route
    data class SmartRoute(val kind: SmartList) : Route
    data object SearchRoute : Route
    data object EqualizerRoute : Route
    data object SettingsRoute : Route
}

sealed interface DialogState {
    data class AddToPlaylist(val tracks: List<Track>) : DialogState
    data class NewPlaylist(val tracks: List<Track>) : DialogState
    data class RenamePlaylist(val id: Long, val current: String) : DialogState
    data class DeletePlaylist(val id: Long, val name: String) : DialogState
}

/** [storedIds] son los ids guardados en la base de datos, alineados uno a uno con [tracks]. */
data class PlaylistUi(val id: Long, val name: String, val tracks: List<Track>, val storedIds: List<Long>)

data class PlayerUi(
    val connected: Boolean = false,
    val hasMedia: Boolean = false,
    val isPlaying: Boolean = false,
    val buffering: Boolean = false,
    val trackId: Long = -1L,
    val title: String = "",
    val artist: String = "",
    val album: String = "",
    val albumId: Long = 0L,
    val artworkUrl: String? = null,
    /** Ruta del archivo, o "yt:VIDEO_ID" si la canción viene de YouTube. */
    val path: String = "",
    val durationMs: Long = 0L,
    val shuffle: Boolean = false,
    val repeatMode: Int = Player.REPEAT_MODE_OFF,
    val index: Int = 0,
    val queueSize: Int = 0,
    val queueVersion: Int = 0,
)

data class QueueItem(
    val index: Int,
    /** Identificador único dentro de la cola (una misma canción puede estar repetida). */
    val uid: String,
    val trackId: Long,
    val title: String,
    val artist: String,
    val albumId: Long,
    val durationMs: Long,
    val artworkUrl: String? = null,
)

enum class YtMode(val label: String, val filter: String) {
    SONGS("Canciones", "music_songs"),
    VIDEOS("Videos", "videos"),
}

data class YouTubeUi(
    val query: String = "",
    val mode: YtMode = YtMode.SONGS,
    val loading: Boolean = false,
    val loadingMore: Boolean = false,
    val results: List<Track> = emptyList(),
    val hasMore: Boolean = false,
    val error: String? = null,
    val searched: Boolean = false,
)
