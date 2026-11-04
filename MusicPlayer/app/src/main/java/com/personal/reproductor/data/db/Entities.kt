package com.personal.reproductor.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "playlists")
data class PlaylistEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val createdAt: Long,
)

/** Se guarda también la ruta del archivo para poder reencontrar la canción si MediaStore cambia sus ids. */
@Entity(
    tableName = "playlist_tracks",
    primaryKeys = ["playlistId", "trackId"],
    foreignKeys = [
        ForeignKey(
            entity = PlaylistEntity::class,
            parentColumns = ["id"],
            childColumns = ["playlistId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("playlistId")],
)
data class PlaylistTrackEntity(
    val playlistId: Long,
    val trackId: Long,
    val path: String,
    val position: Int,
    val addedAt: Long,
)

@Entity(tableName = "favorite_tracks")
data class FavoriteTrackEntity(
    @PrimaryKey val trackId: Long,
    val path: String,
    val addedAt: Long,
)

@Entity(tableName = "favorite_albums")
data class FavoriteAlbumEntity(
    @PrimaryKey val albumId: Long,
    val albumTitle: String,
    val artist: String,
    val addedAt: Long,
)

@Entity(tableName = "play_stats")
data class PlayStatEntity(
    @PrimaryKey val trackId: Long,
    val path: String,
    val playCount: Int,
    val lastPlayed: Long,
)
