package com.personal.reproductor.playback

import android.content.ContentUris
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.personal.reproductor.data.Track
import com.personal.reproductor.data.YOUTUBE_URI_SCHEME
import com.personal.reproductor.data.YouTubeIds

const val EXTRA_ALBUM_ID = "albumId"
const val EXTRA_DURATION_MS = "durationMs"
const val EXTRA_PATH = "path"
const val EXTRA_ARTWORK_URL = "artworkUrl"

private val ALBUM_ART_BASE: Uri = Uri.parse("content://media/external/audio/albumart")

fun buildMediaItem(
    id: Long,
    title: String,
    artist: String,
    album: String,
    albumId: Long,
    durationMs: Long,
    path: String,
    artworkUrl: String? = null,
): MediaItem {
    // Canción de YouTube: enlace interno que el servicio resuelve justo antes de reproducir.
    val videoId = YouTubeIds.videoIdFromPath(path)
    val uri = if (videoId != null) {
        Uri.Builder().scheme(YOUTUBE_URI_SCHEME).authority(videoId).build()
    } else {
        ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id)
    }
    val artwork = artworkUrl?.let { Uri.parse(it) } ?: ContentUris.withAppendedId(ALBUM_ART_BASE, albumId)
    return MediaItem.Builder()
        .setMediaId(id.toString())
        .setUri(uri)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setAlbumTitle(album)
                .setArtworkUri(artwork)
                .setIsPlayable(true)
                .setIsBrowsable(false)
                .setExtras(
                    Bundle().apply {
                        putLong(EXTRA_ALBUM_ID, albumId)
                        putLong(EXTRA_DURATION_MS, durationMs)
                        putString(EXTRA_PATH, path)
                        putString(EXTRA_ARTWORK_URL, artworkUrl)
                    },
                )
                .build(),
        )
        .build()
}

fun Track.toMediaItem(): MediaItem = buildMediaItem(id, title, artist, album, albumId, durationMs, path, artworkUrl)
