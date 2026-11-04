@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Album as AlbumIcon
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.data.Track

// ---------------------------------------------------------------------------- Álbum

@Composable
fun AlbumScreen(vm: MainViewModel, albumId: Long) {
    val library by vm.library.collectAsStateWithLifecycle()
    val currentId by vm.currentTrackId.collectAsStateWithLifecycle()
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()
    val favAlbums by vm.favoriteAlbumIds.collectAsStateWithLifecycle()
    val album = library.albumsById[albumId]

    DetailScaffold(title = album?.title ?: "Álbum", onBack = { vm.back() }) {
        if (album == null) {
            EmptyState(Icons.Filled.AlbumIcon, "Álbum no disponible", "Este álbum ya no está en tu biblioteca.")
            return@DetailScaffold
        }
        val isFav = album.id in favAlbums
        LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
            item {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Artwork(
                        album.coverTrackId, album.id,
                        Modifier.size(132.dp),
                        requestPx = 400,
                        shape = RoundedCornerShape(16.dp),
                    )
                    Spacer(Modifier.width(16.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            album.title,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            album.artist,
                            style = MaterialTheme.typography.bodyLarge,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.clickable { vm.goToArtist(album.artist) },
                        )
                        val year = if (album.year > 0) "${album.year} · " else ""
                        Text(
                            "$year${pluralSongs(album.tracks.size)} · ${formatTotal(album.durationMs)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            item {
                Row(
                    Modifier.padding(horizontal = 16.dp).padding(bottom = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Button(onClick = { vm.play(album.tracks, 0, shuffle = false) }) {
                        Icon(Icons.Filled.PlayArrow, null, Modifier.size(20.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Reproducir")
                    }
                    FilledTonalIconButton(onClick = { vm.playShuffled(album.tracks) }) {
                        Icon(Icons.Filled.Shuffle, contentDescription = "Aleatorio")
                    }
                    IconButton(onClick = { vm.toggleFavorite(album) }) {
                        Icon(
                            if (isFav) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (isFav) "Quitar álbum de favoritos" else "Añadir álbum a favoritos",
                            tint = if (isFav) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = { vm.showDialog(DialogState.AddToPlaylist(album.tracks)) }) {
                        Icon(Icons.AutoMirrored.Filled.PlaylistAdd, contentDescription = "Añadir álbum a una lista")
                    }
                    IconButton(onClick = { vm.enqueue(album.tracks) }) {
                        Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = "Añadir álbum a la cola")
                    }
                }
            }
            itemsIndexed(album.tracks, key = { _, t -> t.id }) { index, track ->
                TrackRow(
                    track = track,
                    vm = vm,
                    currentId = currentId,
                    favorites = favs,
                    onClick = { vm.play(album.tracks, index) },
                    leadingNumber = if (track.trackNumber > 0) track.trackNumber else index + 1,
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------- Artista

@Composable
fun ArtistScreen(vm: MainViewModel, key: String) {
    val library by vm.library.collectAsStateWithLifecycle()
    val currentId by vm.currentTrackId.collectAsStateWithLifecycle()
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()
    val favAlbums by vm.favoriteAlbumIds.collectAsStateWithLifecycle()
    val artist = library.artists.firstOrNull { it.key == key }

    DetailScaffold(title = artist?.name ?: "Artista", onBack = { vm.back() }) {
        if (artist == null) {
            EmptyState(Icons.Filled.AlbumIcon, "Artista no disponible", "Este artista ya no está en tu biblioteca.")
            return@DetailScaffold
        }
        LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
            item {
                PlayShuffleRow(
                    count = artist.tracks.size,
                    onPlay = { vm.play(artist.tracks, 0, shuffle = false) },
                    onShuffle = { vm.playShuffled(artist.tracks) },
                )
            }
            if (artist.albums.isNotEmpty()) {
                item { SectionTitle("Álbumes") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 8.dp)) {
                        items(artist.albums, key = { it.id }) { album ->
                            AlbumCard(
                                album = album,
                                isFavorite = album.id in favAlbums,
                                onClick = { vm.navigate(Route.AlbumRoute(album.id)) },
                                modifier = Modifier.width(156.dp),
                            )
                        }
                    }
                }
            }
            item { SectionTitle("Canciones") }
            itemsIndexed(artist.tracks, key = { _, t -> t.id }) { index, track ->
                TrackRow(
                    track = track,
                    vm = vm,
                    currentId = currentId,
                    favorites = favs,
                    onClick = { vm.play(artist.tracks, index) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------- Colección genérica de canciones

@Composable
fun TrackCollectionScreen(
    vm: MainViewModel,
    title: String,
    tracks: List<Track>,
    emptyIcon: ImageVector,
    emptyMessage: String,
    actions: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {},
    extraMenu: (@Composable (track: Track, dismiss: () -> Unit) -> Unit)? = null,
) {
    val currentId by vm.currentTrackId.collectAsStateWithLifecycle()
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()

    DetailScaffold(title = title, onBack = { vm.back() }, actions = actions) {
        if (tracks.isEmpty()) {
            EmptyState(emptyIcon, "Aquí no hay canciones", emptyMessage)
        } else {
            LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
                item {
                    PlayShuffleRow(
                        count = tracks.size,
                        onPlay = { vm.play(tracks, 0, shuffle = false) },
                        onShuffle = { vm.playShuffled(tracks) },
                    )
                }
                itemsIndexed(tracks, key = { _, t -> t.id }) { index, track ->
                    TrackRow(
                        track = track,
                        vm = vm,
                        currentId = currentId,
                        favorites = favs,
                        onClick = { vm.play(tracks, index) },
                        extraMenu = extraMenu,
                    )
                }
            }
        }
    }
}

@Composable
fun GenreScreen(vm: MainViewModel, name: String) {
    val library by vm.library.collectAsStateWithLifecycle()
    val genre = library.genres.firstOrNull { it.name == name }
    TrackCollectionScreen(
        vm = vm,
        title = name,
        tracks = genre?.tracks.orEmpty(),
        emptyIcon = Icons.AutoMirrored.Filled.QueueMusic,
        emptyMessage = "No hay canciones de este género.",
    )
}

@Composable
fun FolderScreen(vm: MainViewModel, path: String) {
    val library by vm.library.collectAsStateWithLifecycle()
    val folder = library.folders.firstOrNull { it.path == path }
    TrackCollectionScreen(
        vm = vm,
        title = folder?.name ?: "Carpeta",
        tracks = folder?.tracks.orEmpty(),
        emptyIcon = Icons.AutoMirrored.Filled.QueueMusic,
        emptyMessage = "No hay canciones en esta carpeta.",
    )
}

@Composable
fun SmartListScreen(vm: MainViewModel, kind: SmartList) {
    val smart by vm.smartLists.collectAsStateWithLifecycle()
    TrackCollectionScreen(
        vm = vm,
        title = kind.title,
        tracks = smart[kind].orEmpty(),
        emptyIcon = Icons.AutoMirrored.Filled.QueueMusic,
        emptyMessage = when (kind) {
            SmartList.RECENTLY_ADDED -> "Aún no hay música en tu biblioteca."
            SmartList.MOST_PLAYED, SmartList.RECENTLY_PLAYED ->
                "Aparecerá aquí a medida que escuches música en esta app."
        },
    )
}

@Composable
fun PlaylistScreen(vm: MainViewModel, id: Long) {
    val playlists by vm.playlists.collectAsStateWithLifecycle()
    val playlist = playlists.firstOrNull { it.id == id }
    TrackCollectionScreen(
        vm = vm,
        title = playlist?.name ?: "Lista",
        tracks = playlist?.tracks.orEmpty(),
        emptyIcon = Icons.AutoMirrored.Filled.PlaylistPlay,
        emptyMessage = "Añade canciones desde el menú ⋮ de cualquier canción, álbum o desde el reproductor.",
        actions = {
            if (playlist != null) {
                IconButton(onClick = { vm.showDialog(DialogState.RenamePlaylist(playlist.id, playlist.name)) }) {
                    Icon(Icons.Filled.Edit, contentDescription = "Renombrar lista")
                }
                IconButton(onClick = { vm.showDialog(DialogState.DeletePlaylist(playlist.id, playlist.name)) }) {
                    Icon(Icons.Filled.Delete, contentDescription = "Eliminar lista")
                }
            }
        },
        extraMenu = { track, dismiss ->
            if (playlist != null) {
                DropdownMenuItem(
                    text = { Text("Quitar de esta lista") },
                    leadingIcon = { Icon(Icons.Filled.Delete, null) },
                    onClick = {
                        dismiss()
                        vm.removeFromPlaylist(playlist.id, track)
                    },
                )
            }
        },
    )
}
