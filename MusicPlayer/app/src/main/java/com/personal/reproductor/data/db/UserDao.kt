package com.personal.reproductor.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
abstract class UserDao {

    // ---- Listas de reproducción ----
    @Query("SELECT * FROM playlists ORDER BY name COLLATE NOCASE")
    abstract fun playlists(): Flow<List<PlaylistEntity>>

    @Query("SELECT * FROM playlist_tracks ORDER BY playlistId, position")
    abstract fun playlistTracks(): Flow<List<PlaylistTrackEntity>>

    @Insert
    abstract suspend fun insertPlaylist(playlist: PlaylistEntity): Long

    @Query("UPDATE playlists SET name = :name WHERE id = :id")
    abstract suspend fun renamePlaylist(id: Long, name: String)

    @Query("DELETE FROM playlists WHERE id = :id")
    abstract suspend fun deletePlaylist(id: Long)

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    abstract suspend fun insertPlaylistTracks(items: List<PlaylistTrackEntity>)

    @Query("SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlistId = :playlistId")
    abstract suspend fun maxPosition(playlistId: Long): Int

    @Query("DELETE FROM playlist_tracks WHERE playlistId = :playlistId AND (trackId = :trackId OR path = :path)")
    abstract suspend fun removeFromPlaylist(playlistId: Long, trackId: Long, path: String)

    @Query("SELECT trackId FROM playlist_tracks WHERE playlistId = :playlistId ORDER BY position")
    abstract suspend fun trackIdsOf(playlistId: Long): List<Long>

    @Query("UPDATE playlist_tracks SET position = :position WHERE playlistId = :playlistId AND trackId = :trackId")
    abstract suspend fun setPosition(playlistId: Long, trackId: Long, position: Int)

    /** Guarda el nuevo orden; las canciones que ya no están en la biblioteca conservan su lugar al final. */
    @Transaction
    open suspend fun reorderPlaylist(playlistId: Long, orderedTrackIds: List<Long>) {
        val listed = orderedTrackIds.toSet()
        val rest = trackIdsOf(playlistId).filter { it !in listed }
        (orderedTrackIds + rest).forEachIndexed { index, id -> setPosition(playlistId, id, index) }
    }

    // ---- Favoritos ----
    @Query("SELECT * FROM favorite_tracks")
    abstract fun favoriteTracks(): Flow<List<FavoriteTrackEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertFavoriteTrack(item: FavoriteTrackEntity)

    @Query("DELETE FROM favorite_tracks WHERE trackId = :trackId OR path = :path")
    abstract suspend fun deleteFavoriteTrack(trackId: Long, path: String)

    @Query("SELECT * FROM favorite_albums")
    abstract fun favoriteAlbums(): Flow<List<FavoriteAlbumEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertFavoriteAlbum(item: FavoriteAlbumEntity)

    @Query("DELETE FROM favorite_albums WHERE albumId = :albumId")
    abstract suspend fun deleteFavoriteAlbum(albumId: Long)

    // ---- Estadísticas de reproducción ----
    @Query("SELECT * FROM play_stats")
    abstract fun stats(): Flow<List<PlayStatEntity>>

    @Query("INSERT OR IGNORE INTO play_stats (trackId, path, playCount, lastPlayed) VALUES (:trackId, :path, 0, 0)")
    abstract suspend fun ensureStat(trackId: Long, path: String)

    @Query("UPDATE play_stats SET playCount = playCount + 1, lastPlayed = :now WHERE trackId = :trackId")
    abstract suspend fun bumpStat(trackId: Long, now: Long)

    @Transaction
    open suspend fun recordPlay(trackId: Long, path: String, now: Long) {
        ensureStat(trackId, path)
        bumpStat(trackId, now)
    }
}
