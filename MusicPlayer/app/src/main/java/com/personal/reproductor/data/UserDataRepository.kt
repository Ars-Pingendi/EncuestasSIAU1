package com.personal.reproductor.data

import com.personal.reproductor.data.db.FavoriteAlbumEntity
import com.personal.reproductor.data.db.FavoriteTrackEntity
import com.personal.reproductor.data.db.PlayStatEntity
import com.personal.reproductor.data.db.PlaylistEntity
import com.personal.reproductor.data.db.PlaylistTrackEntity
import com.personal.reproductor.data.db.UserDao
import kotlinx.coroutines.flow.Flow

class UserDataRepository(private val dao: UserDao) {

    val playlists: Flow<List<PlaylistEntity>> = dao.playlists()
    val playlistTracks: Flow<List<PlaylistTrackEntity>> = dao.playlistTracks()
    val favoriteTracks: Flow<List<FavoriteTrackEntity>> = dao.favoriteTracks()
    val favoriteAlbums: Flow<List<FavoriteAlbumEntity>> = dao.favoriteAlbums()
    val stats: Flow<List<PlayStatEntity>> = dao.stats()

    suspend fun createPlaylist(name: String): Long =
        dao.insertPlaylist(PlaylistEntity(name = name, createdAt = System.currentTimeMillis()))

    suspend fun renamePlaylist(id: Long, name: String) = dao.renamePlaylist(id, name)

    suspend fun deletePlaylist(id: Long) = dao.deletePlaylist(id)

    suspend fun addTracks(playlistId: Long, tracks: List<Track>) {
        var position = dao.maxPosition(playlistId) + 1
        val now = System.currentTimeMillis()
        dao.insertPlaylistTracks(
            tracks.map { PlaylistTrackEntity(playlistId, it.id, it.path, position++, now) },
        )
    }

    suspend fun removeFromPlaylist(playlistId: Long, track: Track) =
        dao.removeFromPlaylist(playlistId, track.id, track.path)

    suspend fun addFavoriteTrack(track: Track) =
        dao.insertFavoriteTrack(FavoriteTrackEntity(track.id, track.path, System.currentTimeMillis()))

    suspend fun removeFavoriteTrack(track: Track) = dao.deleteFavoriteTrack(track.id, track.path)

    suspend fun addFavoriteAlbum(album: Album) =
        dao.insertFavoriteAlbum(FavoriteAlbumEntity(album.id, album.title, album.artist, System.currentTimeMillis()))

    suspend fun removeFavoriteAlbum(album: Album) = dao.deleteFavoriteAlbum(album.id)

    suspend fun recordPlay(trackId: Long, path: String) =
        dao.recordPlay(trackId, path, System.currentTimeMillis())
}
