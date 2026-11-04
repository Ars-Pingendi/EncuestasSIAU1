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

data class PlaylistUi(val id: Long, val name: String, val tracks: List<Track>)

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
    val durationMs: Long = 0L,
    val shuffle: Boolean = false,
    val repeatMode: Int = Player.REPEAT_MODE_OFF,
    val index: Int = 0,
    val queueSize: Int = 0,
    val queueVersion: Int = 0,
)

data class QueueItem(
    val index: Int,
    val trackId: Long,
    val title: String,
    val artist: String,
    val albumId: Long,
    val durationMs: Long,
)
