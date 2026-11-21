@file:OptIn(ExperimentalFoundationApi::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.data.Album
import com.personal.reproductor.data.Recommendations
import com.personal.reproductor.data.Track
import java.util.Calendar

private val CARD_WIDTH = 148.dp

private fun greeting(): String {
    val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when (h) {
        in 5..11 -> "Buenos días"
        in 12..18 -> "Buenas tardes"
        else -> "Buenas noches"
    }
}

/**
 * Inicio, al estilo de Spotify: lo escuchado hace poco, mixes que se renuevan cada día, canciones
 * parecidas de YouTube y recomendaciones de tu propia biblioteca.
 * [openTab] cambia de pestaña (Favoritos, YouTube).
 */
@Composable
fun InicioTab(vm: MainViewModel, openTab: (String) -> Unit) {
    val library by vm.library.collectAsStateWithLifecycle()
    val home by vm.home.collectAsStateWithLifecycle()
    val radios by vm.radios.collectAsStateWithLifecycle()
    val favs by vm.favoriteTracks.collectAsStateWithLifecycle()
    val playlists by vm.playlists.collectAsStateWithLifecycle()

    val seedKey = home.seeds.joinToString("|") { vm.radioKey(it.track) }
    LaunchedEffect(seedKey) { if (home.seeds.isNotEmpty()) vm.loadRadios(home.seeds) }
    val radioRows = home.seeds.mapNotNull { s -> radios[vm.radioKey(s.track)]?.let { vm.radioKey(s.track) to it } }

    when {
        !library.loaded -> LoadingState("Preparando tus recomendaciones…")
        home.isEmpty -> EmptyState(
            icon = Icons.Filled.Home,
            title = "Aquí verás tus recomendaciones",
            message = "Escucha música de tu teléfono o de YouTube: Pipo aprende lo que te gusta y te muestra lo escuchado hace poco, mixes diarios y canciones parecidas.",
            actionLabel = "Buscar en YouTube",
            onAction = { openTab("YouTube") },
        )
        else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
            item {
                Text(
                    greeting(),
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 10.dp),
                )
            }
            item { QuickGrid(vm, home, favs, playlists, openTab) }
            if (home.recent.isNotEmpty()) item {
                Shelf("Escuchado recientemente", action = "Ver todo" to { vm.navigate(Route.SmartRoute(SmartList.RECENTLY_PLAYED)) }) {
                    items(home.recent, key = { r ->
                        when (r) {
                            is Recommendations.RecentItem.OfAlbum -> "a${r.album.id}"
                            is Recommendations.RecentItem.OfTrack -> "t${r.track.id}"
                        }
                    }) { r ->
                        when (r) {
                            is Recommendations.RecentItem.OfAlbum -> AlbumTile(vm, r.album, "Álbum · ${r.album.artist}")
                            is Recommendations.RecentItem.OfTrack -> TrackTile(vm, home.recentTracks, home.recentTracks.indexOf(r.track).coerceAtLeast(0))
                        }
                    }
                }
            }
            if (home.mixes.isNotEmpty()) item {
                Shelf(
                    if (home.hasHistory) "Tus mixes" else "Mixes de tu biblioteca",
                    subtitle = "Se renuevan cada día con tus artistas y otros parecidos",
                ) {
                    items(home.mixes, key = { it.id }) { m -> MixTile(vm, m) }
                }
            }
            radioRows.getOrNull(0)?.let { (key, r) -> item { RadioShelf(vm, key, r) } }
            if (home.forYou.isNotEmpty()) item {
                Shelf(
                    if (home.hasHistory) "Canciones para ti" else "Descubre tu música",
                    subtitle = if (home.hasHistory) "De tus artistas y géneros, que aún no has escuchado" else "Canciones de tu teléfono que aún no has escuchado",
                    action = "Ver todo" to { vm.navigate(Route.MixRoute("foryou")) },
                ) {
                    itemsIndexed(home.forYou, key = { _, t -> t.id }) { i, _ -> TrackTile(vm, home.forYou, i) }
                }
            }
            if (home.albumsForYou.isNotEmpty()) item {
                Shelf("Álbumes que podrían gustarte", subtitle = if (home.hasHistory) "Casi sin escuchar, de lo que más te gusta" else null) {
                    items(home.albumsForYou, key = { it.id }) { a -> AlbumTile(vm, a, a.artist) }
                }
            }
            if (home.topArtists.isNotEmpty()) item {
                Shelf("Tus artistas") {
                    items(home.topArtists, key = { it.name }) { a -> ArtistTile(vm, a, openTab) }
                }
            }
            radioRows.getOrNull(1)?.let { (key, r) -> item { RadioShelf(vm, key, r) } }
            if (home.again.isNotEmpty()) item {
                Shelf(
                    "Para volver a escuchar",
                    subtitle = "Lo que más te gustó y hace rato no suena",
                    action = "Ver todo" to { vm.navigate(Route.MixRoute("again")) },
                ) {
                    itemsIndexed(home.again, key = { _, t -> t.id }) { i, _ -> TrackTile(vm, home.again, i) }
                }
            }
            if (home.added.isNotEmpty()) item {
                Shelf("Agregadas recientemente", action = "Ver todo" to { vm.navigate(Route.SmartRoute(SmartList.RECENTLY_ADDED)) }) {
                    items(home.added, key = { it.id }) { a -> AlbumTile(vm, a, a.artist) }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------- piezas

@Composable
private fun Shelf(
    title: String,
    subtitle: String? = null,
    action: Pair<String, () -> Unit>? = null,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(top = 14.dp)) {
        Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle != null) {
                    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (action != null) TextButton(onClick = action.second) { Text(action.first) }
        }
        Spacer(Modifier.height(6.dp))
        LazyRow(
            contentPadding = PaddingValues(horizontal = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            content = content,
        )
    }
}

@Composable
private fun Tile(
    title: String,
    subtitle: String?,
    onClick: () -> Unit,
    onLongClick: (() -> Unit)? = null,
    circle: Boolean = false,
    art: @Composable (Modifier) -> Unit,
    menu: @Composable BoxScope.() -> Unit = {},
) {
    Column(
        Modifier
            .width(CARD_WIDTH)
            .clip(RoundedCornerShape(12.dp))
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .padding(8.dp),
        horizontalAlignment = if (circle) Alignment.CenterHorizontally else Alignment.Start,
    ) {
        Box {
            art(Modifier.fillMaxWidth().aspectRatio(1f))
            menu()
        }
        Spacer(Modifier.height(6.dp))
        Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (subtitle != null) {
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun TrackTile(vm: MainViewModel, list: List<Track>, index: Int) {
    val track = list[index]
    var menu by remember { mutableStateOf(false) }
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()
    val tvOn = vm.tvStatus.collectAsStateWithLifecycle().value.running
    val dl = rememberDownloadUi(vm, track.remoteId)
    Tile(
        title = track.title,
        subtitle = track.artist,
        onClick = { vm.play(list, index, shuffle = false) },
        onLongClick = { menu = true },
        art = { m -> Artwork(track.id, track.albumId, m, requestPx = 400, shape = RoundedCornerShape(12.dp), artworkUrl = track.artworkUrl) },
        menu = {
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                TrackMenuItems(track, vm, track.id in favs, dl, tvOn) { menu = false }
            }
        },
    )
}

@Composable
private fun AlbumTile(vm: MainViewModel, album: Album, subtitle: String) {
    var menu by remember { mutableStateOf(false) }
    Tile(
        title = album.title,
        subtitle = subtitle,
        onClick = { vm.navigate(Route.AlbumRoute(album.id)) },
        onLongClick = { menu = true },
        art = { m -> Artwork(album.coverTrackId, album.id, m, requestPx = 400, shape = RoundedCornerShape(12.dp)) },
        menu = {
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Reproducir") }, leadingIcon = { Icon(Icons.Filled.PlayArrow, null) }, onClick = { menu = false; vm.play(album.tracks, 0, shuffle = false) })
                DropdownMenuItem(text = { Text("Añadir a la cola") }, leadingIcon = { Icon(Icons.AutoMirrored.Filled.QueueMusic, null) }, onClick = { menu = false; vm.enqueue(album.tracks) })
                DropdownMenuItem(text = { Text("Añadir a una lista…") }, leadingIcon = { Icon(Icons.AutoMirrored.Filled.PlaylistAdd, null) }, onClick = { menu = false; vm.showDialog(DialogState.AddToPlaylist(album.tracks)) })
            }
        },
    )
}

@Composable
private fun MixTile(vm: MainViewModel, mix: Recommendations.Mix) {
    var menu by remember { mutableStateOf(false) }
    Tile(
        title = mix.title,
        subtitle = mix.subtitle,
        onClick = { vm.navigate(Route.MixRoute(mix.id)) },
        onLongClick = { menu = true },
        art = { m -> MixArt(mix.covers, mix.artist, m) },
        menu = {
            Box(Modifier.align(Alignment.BottomEnd).padding(6.dp)) {
                IconButton(
                    onClick = { vm.play(mix.tracks, 0, shuffle = false) },
                    modifier = Modifier.size(40.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
                ) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = "Reproducir ${mix.title}", tint = MaterialTheme.colorScheme.onPrimary)
                }
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Reproducir") }, leadingIcon = { Icon(Icons.Filled.PlayArrow, null) }, onClick = { menu = false; vm.play(mix.tracks, 0, shuffle = false) })
                DropdownMenuItem(text = { Text("Guardar como lista…") }, leadingIcon = { Icon(Icons.AutoMirrored.Filled.PlaylistAdd, null) }, onClick = { menu = false; vm.showDialog(DialogState.NewPlaylist(mix.tracks)) })
            }
        },
    )
}

/** Portada de mix: mosaico de 4 carátulas (o una sola) con el nombre del artista encima. */
@Composable
fun MixArt(covers: List<Track>, artist: String, modifier: Modifier) {
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
        if (covers.size >= 4) {
            Column(Modifier.fillMaxSize()) {
                for (row in 0..1) {
                    Row(Modifier.weight(1f).fillMaxWidth()) {
                        for (col in 0..1) {
                            val t = covers[row * 2 + col]
                            Artwork(t.id, t.albumId, Modifier.weight(1f).fillMaxSize(), requestPx = 200, shape = RectangleShape, artworkUrl = t.artworkUrl)
                        }
                    }
                }
            }
        } else {
            val t = covers.firstOrNull()
            Artwork(t?.id ?: 0L, t?.albumId ?: 0L, Modifier.fillMaxSize(), requestPx = 400, shape = RectangleShape, artworkUrl = t?.artworkUrl)
        }
        Column(
            Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xD90A0618))))
                .padding(start = 10.dp, end = 10.dp, top = 22.dp, bottom = 8.dp),
        ) {
            Text("MIX", color = Color(0xFFC5B8FF), fontSize = 10.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = 1.5.sp)
            Text(artist, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun ArtistTile(vm: MainViewModel, a: Recommendations.TopArtist, openTab: (String) -> Unit) {
    Tile(
        title = a.name,
        subtitle = "Artista",
        circle = true,
        onClick = {
            if (a.libraryKey != null) vm.navigate(Route.ArtistRoute(a.libraryKey))
            else {
                vm.ytSearch(a.name, YtMode.SONGS)
                openTab("YouTube")
            }
        },
        art = { m ->
            val t = a.cover
            if (t != null) Artwork(t.id, t.albumId, m, requestPx = 400, shape = CircleShape, artworkUrl = t.artworkUrl)
            else Box(m.clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Person, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSecondaryContainer)
            }
        },
    )
}

@Composable
private fun RadioShelf(vm: MainViewModel, key: String, radio: MainViewModel.RadioUi) {
    if (!radio.loading && radio.tracks.isEmpty()) return
    Shelf(
        radio.label,
        subtitle = "Canciones parecidas en YouTube",
        action = if (radio.tracks.isNotEmpty()) "Ver todo" to { vm.navigate(Route.MixRoute("radio:$key")) } else null,
    ) {
        if (radio.loading) {
            items(5) {
                Column(Modifier.width(CARD_WIDTH).padding(8.dp)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant))
                    Spacer(Modifier.height(8.dp))
                    Box(Modifier.fillMaxWidth(0.8f).height(12.dp).clip(RoundedCornerShape(6.dp)).background(MaterialTheme.colorScheme.surfaceVariant))
                }
            }
        } else {
            itemsIndexed(radio.tracks, key = { _, t -> t.id }) { i, _ -> TrackTile(vm, radio.tracks, i) }
        }
    }
}

@Composable
private fun QuickGrid(
    vm: MainViewModel,
    home: Recommendations.Home,
    favs: List<Track>,
    playlists: List<PlaylistUi>,
    openTab: (String) -> Unit,
) {
    data class Quick(val key: String, val title: String, val art: @Composable (Modifier) -> Unit, val onClick: () -> Unit)
    val tiles = ArrayList<Quick>()
    if (favs.isNotEmpty()) {
        tiles.add(Quick("fav", "Favoritos", { m ->
            Box(m.background(Brush.linearGradient(listOf(Color(0xFF6B4EE6), Color(0xFF9B7BFF), Color(0xFFC5B8FF)))), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Favorite, null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
        }) { openTab("Favoritos") })
    }
    for (r in home.recent) {
        if (tiles.size >= 4) break
        if (r is Recommendations.RecentItem.OfAlbum) {
            val a = r.album
            tiles.add(Quick("a${a.id}", a.title, { m -> Artwork(a.coverTrackId, a.id, m, requestPx = 160, shape = RectangleShape) }) { vm.navigate(Route.AlbumRoute(a.id)) })
        }
    }
    for (p in playlists) {
        if (tiles.size >= 4) break
        if (p.tracks.isEmpty()) continue
        val first = p.tracks.first()
        tiles.add(Quick("p${p.id}", p.name, { m -> Artwork(first.id, first.albumId, m, requestPx = 160, shape = RectangleShape, artworkUrl = first.artworkUrl) }) { vm.navigate(Route.PlaylistRoute(p.id)) })
    }
    for (mix in home.mixes) {
        if (tiles.size >= 6) break
        tiles.add(Quick(mix.id, mix.title, { m -> MixArt(mix.covers.take(1), mix.artist, m) }) { vm.navigate(Route.MixRoute(mix.id)) })
    }
    if (tiles.isEmpty()) return
    Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in tiles.chunked(2)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (q in row) {
                    Row(
                        Modifier
                            .weight(1f)
                            .height(56.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable(onClick = q.onClick),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        q.art(Modifier.size(56.dp))
                        Text(
                            q.title,
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = 10.dp),
                        )
                    }
                }
                if (row.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ---------------------------------------------------------------------------- detalle de mix

@Composable
fun MixScreen(vm: MainViewModel, id: String) {
    // Se observan para que la lista siga al día mientras la pantalla está abierta.
    val home by vm.home.collectAsStateWithLifecycle()
    val radios by vm.radios.collectAsStateWithLifecycle()
    val data = remember(home, radios, id) { vm.mixTracks(id) }
    TrackCollectionScreen(
        vm = vm,
        title = data?.first ?: "Para ti",
        tracks = data?.second.orEmpty(),
        actions = {
            if (!data?.second.isNullOrEmpty()) {
                IconButton(onClick = { vm.showDialog(DialogState.NewPlaylist(data!!.second)) }) {
                    Icon(Icons.AutoMirrored.Filled.PlaylistAdd, contentDescription = "Guardar como lista")
                }
            }
        },
        emptyIcon = Icons.Filled.Home,
        emptyMessage = "Las recomendaciones se renuevan cada día.",
    )
}
