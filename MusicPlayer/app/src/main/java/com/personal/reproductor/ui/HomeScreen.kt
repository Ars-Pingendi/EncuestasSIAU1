@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.automirrored.filled.Sort
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Album as AlbumIcon
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.FiberNew
import androidx.compose.material.icons.filled.Folder as FolderIcon
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.data.SongSort
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.size

private val TAB_TITLES = listOf("Canciones", "Álbumes", "Artistas", "Géneros", "Carpetas", "Listas", "Favoritos")

@Composable
fun HomeScreen(vm: MainViewModel) {
    val pagerState = rememberPagerState(initialPage = vm.homeTab) { TAB_TITLES.size }
    val scope = rememberCoroutineScope()
    val scanning by vm.scanning.collectAsStateWithLifecycle()
    var menu by remember { mutableStateOf(false) }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.currentPage }.collect { vm.homeTab = it }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopAppBar(
            title = { Text("Pipo Music Player") },
            actions = {
                IconButton(onClick = { vm.navigate(Route.SearchRoute) }) {
                    Icon(Icons.Filled.Search, contentDescription = "Buscar")
                }
                IconButton(onClick = { vm.navigate(Route.EqualizerRoute) }) {
                    Icon(Icons.Filled.Equalizer, contentDescription = "Ecualizador")
                }
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "Más opciones")
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("Buscar música de nuevo") },
                            onClick = { menu = false; vm.rescanStorage() },
                        )
                        DropdownMenuItem(
                            text = { Text("Ajustes") },
                            onClick = { menu = false; vm.navigate(Route.SettingsRoute) },
                        )
                    }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        ScrollableTabRow(
            selectedTabIndex = pagerState.currentPage,
            edgePadding = 8.dp,
            containerColor = MaterialTheme.colorScheme.background,
        ) {
            TAB_TITLES.forEachIndexed { i, title ->
                Tab(
                    selected = pagerState.currentPage == i,
                    onClick = { scope.launch { pagerState.animateScrollToPage(i) } },
                    text = { Text(title) },
                )
            }
        }
        if (scanning) LinearProgressIndicator(Modifier.fillMaxWidth())

        HorizontalPager(
            state = pagerState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
        ) { page ->
            when (page) {
                0 -> SongsTab(vm)
                1 -> AlbumsTab(vm)
                2 -> ArtistsTab(vm)
                3 -> GenresTab(vm)
                4 -> FoldersTab(vm)
                5 -> PlaylistsTab(vm)
                else -> FavoritesTab(vm)
            }
        }
    }
}

// ---------------------------------------------------------------------------- Canciones

@Composable
private fun SongsTab(vm: MainViewModel) {
    val library by vm.library.collectAsStateWithLifecycle()
    val tracks by vm.sortedTracks.collectAsStateWithLifecycle()
    val sort by vm.settings.songSort.collectAsStateWithLifecycle()
    val currentId by vm.currentTrackId.collectAsStateWithLifecycle()
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()

    when {
        !library.loaded -> LoadingState("Buscando música en tu dispositivo…")
        tracks.isEmpty() -> EmptyState(
            icon = Icons.Filled.LibraryMusic,
            title = "No encontré música",
            message = "Revisa que haya archivos de audio en tu dispositivo o ajusta la duración mínima en Ajustes.",
            actionLabel = "Buscar de nuevo",
            onAction = { vm.rescanStorage() },
        )
        else -> LazyColumn(Modifier.fillMaxSize()) {
            item {
                var sortMenu by remember { mutableStateOf(false) }
                PlayShuffleRow(
                    count = tracks.size,
                    onPlay = { vm.play(tracks, 0, shuffle = false) },
                    onShuffle = { vm.playShuffled(tracks) },
                    trailing = {
                        Box {
                            IconButton(onClick = { sortMenu = true }) {
                                Icon(Icons.AutoMirrored.Filled.Sort, contentDescription = "Ordenar")
                            }
                            DropdownMenu(expanded = sortMenu, onDismissRequest = { sortMenu = false }) {
                                SongSort.entries.forEach { option ->
                                    DropdownMenuItem(
                                        text = { Text(option.label) },
                                        leadingIcon = {
                                            if (option == sort) Icon(Icons.Filled.Check, contentDescription = null)
                                        },
                                        onClick = {
                                            sortMenu = false
                                            vm.settings.setSongSort(option)
                                        },
                                    )
                                }
                            }
                        }
                    },
                )
            }
            itemsIndexed(tracks, key = { _, t -> t.id }) { index, track ->
                TrackRow(
                    track = track,
                    vm = vm,
                    currentId = currentId,
                    favorites = favs,
                    onClick = { vm.play(tracks, index) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------- Álbumes

@Composable
private fun AlbumsTab(vm: MainViewModel) {
    val library by vm.library.collectAsStateWithLifecycle()
    val favAlbums by vm.favoriteAlbumIds.collectAsStateWithLifecycle()

    if (!library.loaded) {
        LoadingState("Buscando música en tu dispositivo…")
    } else if (library.albums.isEmpty()) {
        EmptyState(Icons.Filled.AlbumIcon, "Sin álbumes", "Aún no hay álbumes en tu biblioteca.")
    } else {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(150.dp),
            contentPadding = PaddingValues(8.dp),
            modifier = Modifier.fillMaxSize(),
        ) {
            gridItems(library.albums, key = { it.id }) { album ->
                AlbumCard(
                    album = album,
                    isFavorite = album.id in favAlbums,
                    onClick = { vm.navigate(Route.AlbumRoute(album.id)) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------- Artistas

@Composable
private fun ArtistsTab(vm: MainViewModel) {
    val library by vm.library.collectAsStateWithLifecycle()
    if (!library.loaded) {
        LoadingState("Buscando música en tu dispositivo…")
    } else if (library.artists.isEmpty()) {
        EmptyState(Icons.Filled.LibraryMusic, "Sin artistas", "Aún no hay artistas en tu biblioteca.")
    } else {
        LazyColumn(Modifier.fillMaxSize()) {
            items(library.artists, key = { it.key }) { artist ->
                val cover = artist.tracks.first()
                ListRow(
                    title = artist.name,
                    subtitle = "${artist.albums.size} ${if (artist.albums.size == 1) "álbum" else "álbumes"} · ${pluralSongs(artist.tracks.size)}",
                    onClick = { vm.navigate(Route.ArtistRoute(artist.key)) },
                    leading = {
                        Artwork(cover.id, cover.albumId, Modifier.size(52.dp), requestPx = 160, shape = CircleShape)
                    },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------- Géneros

@Composable
private fun GenresTab(vm: MainViewModel) {
    val library by vm.library.collectAsStateWithLifecycle()
    if (!library.loaded) {
        LoadingState("Buscando música en tu dispositivo…")
    } else if (library.genres.isEmpty()) {
        EmptyState(Icons.Filled.Category, "Sin géneros", "Tus archivos no tienen género en sus etiquetas.")
    } else {
        LazyColumn(Modifier.fillMaxSize()) {
            items(library.genres, key = { it.name }) { genre ->
                ListRow(
                    title = genre.name,
                    subtitle = pluralSongs(genre.tracks.size),
                    onClick = { vm.navigate(Route.GenreRoute(genre.name)) },
                    leading = { IconBadge(Icons.Filled.Category) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------- Carpetas

@Composable
private fun FoldersTab(vm: MainViewModel) {
    val library by vm.library.collectAsStateWithLifecycle()
    if (!library.loaded) {
        LoadingState("Buscando música en tu dispositivo…")
    } else if (library.folders.isEmpty()) {
        EmptyState(Icons.Filled.FolderIcon, "Sin carpetas", "Aún no hay carpetas con música.")
    } else {
        LazyColumn(Modifier.fillMaxSize()) {
            items(library.folders, key = { it.path }) { folder ->
                ListRow(
                    title = folder.name,
                    subtitle = "${pluralSongs(folder.tracks.size)} · ${folder.path.removePrefix("/storage/emulated/0")}",
                    onClick = { vm.navigate(Route.FolderRoute(folder.path)) },
                    leading = { IconBadge(Icons.Filled.FolderIcon) },
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------- Listas

@Composable
private fun PlaylistsTab(vm: MainViewModel) {
    val playlists by vm.playlists.collectAsStateWithLifecycle()
    val smart by vm.smartLists.collectAsStateWithLifecycle()

    LazyColumn(Modifier.fillMaxSize()) {
        item { SectionTitle("Automáticas") }
        items(SmartList.entries, key = { it.name }) { kind ->
            ListRow(
                title = kind.title,
                subtitle = pluralSongs(smart[kind]?.size ?: 0),
                onClick = { vm.navigate(Route.SmartRoute(kind)) },
                leading = {
                    IconBadge(
                        when (kind) {
                            SmartList.RECENTLY_ADDED -> Icons.Filled.FiberNew
                            SmartList.MOST_PLAYED -> Icons.Filled.BarChart
                            SmartList.RECENTLY_PLAYED -> Icons.Filled.History
                        },
                    )
                },
            )
        }
        item { SectionTitle("Mis listas") }
        item {
            ListRow(
                title = "Nueva lista",
                subtitle = "Crea una lista de reproducción",
                onClick = { vm.showDialog(DialogState.NewPlaylist(emptyList())) },
                leading = { IconBadge(Icons.Filled.Add) },
            )
        }
        items(playlists, key = { "pl_${it.id}" }) { playlist ->
            var menu by remember { mutableStateOf(false) }
            ListRow(
                title = playlist.name,
                subtitle = pluralSongs(playlist.tracks.size),
                onClick = { vm.navigate(Route.PlaylistRoute(playlist.id)) },
                leading = { IconBadge(Icons.AutoMirrored.Filled.QueueMusic) },
                trailing = {
                    Box {
                        IconButton(onClick = { menu = true }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "Más opciones")
                        }
                        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                            DropdownMenuItem(
                                text = { Text("Reproducir") },
                                leadingIcon = { Icon(Icons.Filled.PlayArrow, null) },
                                onClick = { menu = false; vm.play(playlist.tracks, 0, shuffle = false) },
                            )
                            DropdownMenuItem(
                                text = { Text("Renombrar") },
                                leadingIcon = { Icon(Icons.Filled.Edit, null) },
                                onClick = {
                                    menu = false
                                    vm.showDialog(DialogState.RenamePlaylist(playlist.id, playlist.name))
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Eliminar") },
                                leadingIcon = { Icon(Icons.Filled.Delete, null) },
                                onClick = {
                                    menu = false
                                    vm.showDialog(DialogState.DeletePlaylist(playlist.id, playlist.name))
                                },
                            )
                        }
                    }
                },
            )
        }
    }
}

// ---------------------------------------------------------------------------- Favoritos

@Composable
private fun FavoritesTab(vm: MainViewModel) {
    val tracks by vm.favoriteTracks.collectAsStateWithLifecycle()
    val albums by vm.favoriteAlbums.collectAsStateWithLifecycle()
    val favAlbumIds by vm.favoriteAlbumIds.collectAsStateWithLifecycle()
    val favIds by vm.favoriteTrackIds.collectAsStateWithLifecycle()
    val currentId by vm.currentTrackId.collectAsStateWithLifecycle()
    var section by rememberSaveable { mutableIntStateOf(0) }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            FilterChip(
                selected = section == 0,
                onClick = { section = 0 },
                label = { Text("Canciones (${tracks.size})") },
            )
            Spacer(Modifier.width(8.dp))
            FilterChip(
                selected = section == 1,
                onClick = { section = 1 },
                label = { Text("Álbumes (${albums.size})") },
            )
        }
        if (section == 0) {
            if (tracks.isEmpty()) {
                EmptyState(
                    Icons.Filled.FavoriteBorder,
                    "Aún no tienes canciones favoritas",
                    "Abre el menú ⋮ de una canción y elige «Añadir a favoritos», o toca el corazón en el reproductor.",
                )
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
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
                            favorites = favIds,
                            onClick = { vm.play(tracks, index) },
                        )
                    }
                }
            }
        } else {
            if (albums.isEmpty()) {
                EmptyState(
                    Icons.Filled.FavoriteBorder,
                    "Aún no tienes álbumes favoritos",
                    "Abre un álbum y toca el corazón para guardarlo aquí.",
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(150.dp),
                    contentPadding = PaddingValues(8.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    gridItems(albums, key = { it.id }) { album ->
                        AlbumCard(
                            album = album,
                            isFavorite = album.id in favAlbumIds,
                            onClick = { vm.navigate(Route.AlbumRoute(album.id)) },
                        )
                    }
                }
            }
        }
    }
}
