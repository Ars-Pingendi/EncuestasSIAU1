@file:OptIn(ExperimentalMaterial3Api::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.data.fold

@Composable
fun SearchScreen(vm: MainViewModel) {
    var query by rememberSaveable { mutableStateOf("") }
    val library by vm.library.collectAsStateWithLifecycle()
    val currentId by vm.currentTrackId.collectAsStateWithLifecycle()
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()
    val favAlbums by vm.favoriteAlbumIds.collectAsStateWithLifecycle()
    val focus = remember { FocusRequester() }

    LaunchedEffect(Unit) { focus.requestFocus() }

    val q = remember(query) { query.trim().fold() }
    val tracks = remember(q, library) {
        if (q.isEmpty()) emptyList() else library.tracks.filter { it.searchKey.contains(q) }.take(100)
    }
    val albums = remember(q, library) {
        if (q.isEmpty()) emptyList() else library.albums.filter { "${it.title} ${it.artist}".fold().contains(q) }.take(30)
    }
    val artists = remember(q, library) {
        if (q.isEmpty()) emptyList() else library.artists.filter { it.name.fold().contains(q) }.take(30)
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .imePadding(),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { vm.back() }) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás")
            }
            TextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Canciones, álbumes o artistas") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = "" }) {
                            Icon(Icons.Filled.Close, contentDescription = "Borrar")
                        }
                    }
                },
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                ),
                modifier = Modifier.weight(1f).focusRequester(focus),
            )
        }

        if (q.isEmpty()) {
            EmptyState(Icons.Filled.Search, "Busca en tu música", "Escribe el nombre de una canción, un álbum o un artista.")
        } else if (tracks.isEmpty() && albums.isEmpty() && artists.isEmpty()) {
            EmptyState(Icons.Filled.Search, "Sin resultados", "No encontré nada para «${query.trim()}».")
        } else {
            LazyColumn(Modifier.weight(1f).fillMaxWidth()) {
                if (artists.isNotEmpty()) {
                    item { SectionTitle("Artistas") }
                    items(artists, key = { "ar_${it.key}" }) { artist ->
                        val cover = artist.tracks.first()
                        ListRow(
                            title = artist.name,
                            subtitle = pluralSongs(artist.tracks.size),
                            onClick = { vm.navigate(Route.ArtistRoute(artist.key)) },
                            leading = {
                                Artwork(cover.id, cover.albumId, Modifier.size(48.dp), requestPx = 160, shape = CircleShape)
                            },
                        )
                    }
                }
                if (albums.isNotEmpty()) {
                    item { SectionTitle("Álbumes") }
                    items(albums, key = { "al_${it.id}" }) { album ->
                        ListRow(
                            title = album.title,
                            subtitle = "${album.artist} · ${pluralSongs(album.tracks.size)}" +
                                if (album.id in favAlbums) " · ♥" else "",
                            onClick = { vm.navigate(Route.AlbumRoute(album.id)) },
                            leading = { Artwork(album.coverTrackId, album.id, Modifier.size(48.dp), requestPx = 160) },
                        )
                    }
                }
                if (tracks.isNotEmpty()) {
                    item { SectionTitle("Canciones") }
                    itemsIndexed(tracks, key = { _, t -> "t_${t.id}" }) { index, track ->
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
    }
}
