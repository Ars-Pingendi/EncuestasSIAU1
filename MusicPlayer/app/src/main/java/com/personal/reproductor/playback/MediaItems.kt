package com.personal.reproductor.playback

import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.personal.reproductor.data.Track

const val EXTRA_ALBUM_ID = "albumId"
const val EXTRA_DURATION_MS = "durationMs"
const val EXTRA_PATH = "path"

fun Track.toMediaItem(): MediaItem =
    MediaItem.Builder()
        .setMediaId(id.toString())
        .setUri(uri)
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setAlbumTitle(album)
                .setArtworkUri(albumArtUri)
                .setIsPlayable(true)
                .setIsBrowsable(false)
                .setExtras(
                    Bundle().apply {
                        putLong(EXTRA_ALBUM_ID, albumId)
                        putLong(EXTRA_DURATION_MS, durationMs)
                        putString(EXTRA_PATH, path)
                    },
                )
                .build(),
        )
        .build()
