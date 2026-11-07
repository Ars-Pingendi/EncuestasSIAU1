@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.PlaylistPlay
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Album as AlbumIcon
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.zIndex
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.data.Album
import com.personal.reproductor.data.Track
import java.util.Locale

// ---------------------------------------------------------------------------- utilidades de texto

fun formatDuration(ms: Long): String {
    val totalSec = (ms / 1000).coerceAtLeast(0)
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) {
        String.format(Locale.getDefault(), "%d:%02d:%02d", h, m, s)
    } else {
        String.format(Locale.getDefault(), "%d:%02d", m, s)
    }
}

fun formatTotal(ms: Long): String {
    val minutes = ms / 60_000
    val h = minutes / 60
    return if (h > 0) "$h h ${minutes % 60} min" else "$minutes min"
}

fun pluralSongs(n: Int): String = if (n == 1) "1 canción" else "$n canciones"

// ---------------------------------------------------------------------------- estructura de pantallas

@Composable
fun DetailScaffold(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        TopAppBar(
            title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Atrás")
                }
            },
            actions = actions,
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        content()
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
}

@Composable
fun LoadingState(message: String) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
fun EmptyState(
    icon: ImageVector,
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(16.dp))
            FilledTonalButton(onClick = onAction) { Text(actionLabel) }
        }
    }
}

/** Fila genérica de lista (artistas, géneros, carpetas, listas…). */
@Composable
fun ListRow(
    title: String,
    subtitle: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leading: @Composable () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        leading()
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        trailing?.invoke()
    }
}

@Composable
fun IconBadge(icon: ImageVector, modifier: Modifier = Modifier) {
    Box(
        modifier.size(52.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

/** Cabecera con contador y botones Reproducir / Aleatorio. */
@Composable
fun PlayShuffleRow(
    count: Int,
    onPlay: () -> Unit,
    onShuffle: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            pluralSongs(count),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        trailing()
        FilledTonalIconButton(onClick = onShuffle, enabled = count > 0) {
            Icon(Icons.Filled.Shuffle, contentDescription = "Reproducir en orden aleatorio")
        }
        Button(onClick = onPlay, enabled = count > 0) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(4.dp))
            Text("Reproducir")
        }
    }
}

// ---------------------------------------------------------------------------- canciones

@Composable
fun TrackRow(
    track: Track,
    vm: MainViewModel,
    currentId: Long,
    favorites: Set<Long>,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingNumber: Int? = null,
    extraMenu: (@Composable (track: Track, dismiss: () -> Unit) -> Unit)? = null,
    reorder: DragReorderState? = null,
) {
    val isCurrent = track.id == currentId
    val isFavorite = track.id in favorites
    var menu by remember { mutableStateOf(false) }
    val dragged = reorder != null && reorder.draggedKey == track.id
    val reorderModifier = if (reorder != null) {
        Modifier
            .zIndex(if (dragged) 1f else 0f)
            .graphicsLayer { translationY = reorder.translationFor(track.id) }
    } else {
        Modifier
    }

    Row(
        modifier
            .then(reorderModifier)
            .then(if (dragged) Modifier.background(MaterialTheme.colorScheme.surfaceVariant) else Modifier)
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = { menu = true })
            .padding(start = 16.dp, top = 6.dp, bottom = 6.dp, end = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leadingNumber != null) {
            Text(
                leadingNumber.toString(),
                style = MaterialTheme.typography.bodyMedium,
                color = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.width(32.dp),
            )
        } else {
            Artwork(track.id, track.albumId, Modifier.size(52.dp), requestPx = 160, artworkUrl = track.artworkUrl)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                track.title,
                style = MaterialTheme.typography.bodyLarge,
                color = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "${track.artist} · ${track.album}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (isFavorite) {
            Icon(
                Icons.Filled.Favorite,
                contentDescription = "Favorita",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 4.dp).size(16.dp),
            )
        }
        Text(
            formatDuration(track.durationMs),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 4.dp),
        )
        if (reorder != null) DragHandle(track.id, reorder)
        Box {
            IconButton(onClick = { menu = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Más opciones")
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                val close = { menu = false }
                DropdownMenuItem(
                    text = { Text("Reproducir a continuación") },
                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.PlaylistPlay, null) },
                    onClick = { close(); vm.playNext(listOf(track)) },
                )
                DropdownMenuItem(
                    text = { Text("Añadir a la cola") },
                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.QueueMusic, null) },
                    onClick = { close(); vm.enqueue(listOf(track)) },
                )
                DropdownMenuItem(
                    text = { Text("Añadir a una lista…") },
                    leadingIcon = { Icon(Icons.AutoMirrored.Filled.PlaylistAdd, null) },
                    onClick = { close(); vm.showDialog(DialogState.AddToPlaylist(listOf(track))) },
                )
                DropdownMenuItem(
                    text = { Text(if (isFavorite) "Quitar de favoritos" else "Añadir a favoritos") },
                    leadingIcon = {
                        Icon(if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, null)
                    },
                    onClick = { close(); vm.toggleFavorite(track) },
                )
                if (!track.isRemote) {
                    DropdownMenuItem(
                        text = { Text("Ir al álbum") },
                        leadingIcon = { Icon(Icons.Filled.AlbumIcon, null) },
                        onClick = { close(); vm.navigate(Route.AlbumRoute(track.albumId)) },
                    )
                    DropdownMenuItem(
                        text = { Text("Ir al artista") },
                        leadingIcon = { Icon(Icons.Filled.Person, null) },
                        onClick = { close(); vm.goToArtist(track.artist) },
                    )
                }
                extraMenu?.invoke(track, close)
            }
        }
    }
}

@Composable
fun AlbumCard(album: Album, isFavorite: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).padding(8.dp),
    ) {
        Box {
            Artwork(
                album.coverTrackId,
                album.id,
                Modifier.fillMaxWidth().aspectRatio(1f),
                requestPx = 400,
                shape = RoundedCornerShape(12.dp),
            )
            if (isFavorite) {
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(6.dp)
                        .size(26.dp)
                        .clip(CircleShape)
                        .background(Color.Black.copy(alpha = 0.55f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Filled.Favorite,
                        contentDescription = "Favorito",
                        tint = Color.White,
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(
            album.title,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            album.artist,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

// ---------------------------------------------------------------------------- mini reproductor

@Composable
fun MiniPlayer(vm: MainViewModel, modifier: Modifier = Modifier) {
    val p by vm.player.collectAsStateWithLifecycle()
    val pos by vm.position.collectAsStateWithLifecycle()
    if (!p.hasMedia) return

    Surface(
        onClick = { vm.openNowPlaying() },
        modifier = modifier.fillMaxWidth(),
        tonalElevation = 3.dp,
        shadowElevation = 6.dp,
    ) {
        Column {
            LinearProgressIndicator(
                progress = { if (p.durationMs > 0) (pos.toFloat() / p.durationMs).coerceIn(0f, 1f) else 0f },
                modifier = Modifier.fillMaxWidth().height(2.dp),
            )
            Row(
                Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Artwork(p.trackId, p.albumId, Modifier.size(44.dp), requestPx = 160, artworkUrl = p.artworkUrl)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        p.title,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        p.artist,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                IconButton(onClick = { vm.togglePlayPause() }) {
                    Icon(
                        if (p.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (p.isPlaying) "Pausar" else "Reproducir",
                    )
                }
                IconButton(onClick = { vm.next() }) {
                    Icon(Icons.Filled.SkipNext, contentDescription = "Siguiente")
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------- diálogos

@Composable
fun NameDialog(
    title: String,
    initial: String,
    confirmLabel: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var text by remember { mutableStateOf(initial) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it.take(40) },
                singleLine = true,
                label = { Text("Nombre") },
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(text) }, enabled = text.isNotBlank()) { Text(confirmLabel) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun AppDialogs(vm: MainViewModel) {
    val dialog by vm.dialog.collectAsStateWithLifecycle()
    when (val d = dialog) {
        null -> Unit

        is DialogState.AddToPlaylist -> {
            val lists by vm.playlists.collectAsStateWithLifecycle()
            AlertDialog(
                onDismissRequest = { vm.showDialog(null) },
                title = { Text("Añadir a una lista") },
                text = {
                    if (lists.isEmpty()) {
                        Text("Todavía no tienes listas. Crea la primera con el botón «Nueva lista».")
                    } else {
                        LazyColumn {
                            items(lists, key = { it.id }) { pl ->
                                Row(
                                    Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            vm.addToPlaylist(pl.id, d.tracks)
                                            vm.showDialog(null)
                                        }
                                        .padding(vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = null)
                                    Spacer(Modifier.width(12.dp))
                                    Column {
                                        Text(pl.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        Text(
                                            pluralSongs(pl.tracks.size),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(onClick = { vm.showDialog(DialogState.NewPlaylist(d.tracks)) }) {
                        Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Nueva lista")
                    }
                },
                dismissButton = { TextButton(onClick = { vm.showDialog(null) }) { Text("Cancelar") } },
            )
        }

        is DialogState.NewPlaylist -> NameDialog(
            title = "Nueva lista",
            initial = "",
            confirmLabel = "Crear",
            onConfirm = { name ->
                vm.createPlaylist(name, d.tracks)
                vm.showDialog(null)
            },
            onDismiss = { vm.showDialog(null) },
        )

        is DialogState.RenamePlaylist -> NameDialog(
            title = "Renombrar lista",
            initial = d.current,
            confirmLabel = "Guardar",
            onConfirm = { name ->
                vm.renamePlaylist(d.id, name)
                vm.showDialog(null)
            },
            onDismiss = { vm.showDialog(null) },
        )

        is DialogState.DeletePlaylist -> AlertDialog(
            onDismissRequest = { vm.showDialog(null) },
            title = { Text("Eliminar lista") },
            text = { Text("¿Eliminar «${d.name}»? Las canciones no se borran del dispositivo.") },
            confirmButton = {
                TextButton(onClick = {
                    vm.deletePlaylist(d.id)
                    vm.showDialog(null)
                    vm.back()
                }) { Text("Eliminar") }
            },
            dismissButton = { TextButton(onClick = { vm.showDialog(null) }) { Text("Cancelar") } },
        )
    }
}
