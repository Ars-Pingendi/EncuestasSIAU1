package com.personal.reproductor.playback

import android.content.ContentUris
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.personal.reproductor.data.Track

const val EXTRA_ALBUM_ID = "albumId"
const val EXTRA_DURATION_MS = "durationMs"
const val EXTRA_PATH = "path"

private val ALBUM_ART_BASE: Uri = Uri.parse("content://media/external/audio/albumart")

fun buildMediaItem(
    id: Long,
    title: String,
    artist: String,
    album: String,
    albumId: Long,
    durationMs: Long,
    path: String,
): MediaItem =
    MediaItem.Builder()
        .setMediaId(id.toString())
        .setUri(ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id))
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle(title)
                .setArtist(artist)
                .setAlbumTitle(album)
                .setArtworkUri(ContentUris.withAppendedId(ALBUM_ART_BASE, albumId))
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

fun Track.toMediaItem(): MediaItem = buildMediaItem(id, title, artist, album, albumId, durationMs, path)
