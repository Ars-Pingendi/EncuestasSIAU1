@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)

package com.personal.reproductor.ui

import androidx.compose.material.icons.filled.DownloadDone
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Share
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.PlaylistAdd
import androidx.compose.material.icons.automirrored.filled.QueueMusic
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Equalizer
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.RepeatOne
import androidx.compose.material.icons.filled.Shuffle
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.SkipPrevious
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player

@Composable
fun NowPlayingScreen(vm: MainViewModel) {
    val p by vm.player.collectAsStateWithLifecycle()
    val pos by vm.position.collectAsStateWithLifecycle()
    val track by vm.currentTrack.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()
    val sleepLeft by vm.sleepTimer.remainingMs.collectAsStateWithLifecycle()

    var showQueue by remember { mutableStateOf(false) }
    var showSleep by remember { mutableStateOf(false) }
    var dragging by remember { mutableStateOf(false) }
    var dragFraction by remember { mutableFloatStateOf(0f) }

    val isRemote = track?.isRemote == true
    val isFavorite = p.trackId in favs
    val duration = p.durationMs.coerceAtLeast(1L)
    val fraction = if (dragging) dragFraction else (pos.toFloat() / duration).coerceIn(0f, 1f)
    val shownPosition = if (dragging) (dragFraction * duration).toLong() else pos

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { vm.closeNowPlaying() }) {
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Cerrar", modifier = Modifier.size(32.dp))
                }
                Text(
                    "Reproduciendo",
                    style = MaterialTheme.typography.titleSmall,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { showQueue = true }) {
                    Icon(Icons.AutoMirrored.Filled.QueueMusic, contentDescription = "Cola de reproducción")
                }
            }

            BoxWithConstraints(
                Modifier.weight(1f).fillMaxWidth().padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                val side = minOf(maxWidth, maxHeight)
                Artwork(
                    p.trackId, p.albumId,
                    Modifier.size(side),
                    requestPx = 800,
                    shape = RoundedCornerShape(28.dp),
                    artworkUrl = p.artworkUrl,
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(
                        p.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        modifier = Modifier.basicMarquee(),
                    )
                    Text(
                        p.artist,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable(enabled = !isRemote) { vm.goToArtist(p.artist) },
                    )
                    Text(
                        p.album,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable(enabled = !isRemote) { vm.goToAlbum(p.albumId) },
                    )
                }
                IconButton(onClick = { track?.let { t -> vm.toggleFavorite(t) } }, enabled = track != null) {
                    Icon(
                        if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = if (isFavorite) "Quitar de favoritos" else "Añadir a favoritos",
                        tint = if (isFavorite) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(28.dp),
                    )
                }
            }

            Slider(
                value = fraction,
                onValueChange = {
                    dragging = true
                    dragFraction = it
                },
                onValueChangeFinished = {
                    vm.seekTo((dragFraction * duration).toLong())
                    dragging = false
                },
                modifier = Modifier.padding(top = 8.dp),
            )
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp)) {
                Text(formatDuration(shownPosition), style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.weight(1f))
                Text(formatDuration(p.durationMs), style = MaterialTheme.typography.labelMedium)
            }

            Row(
                Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = { vm.toggleShuffle() }) {
                    Icon(
                        Icons.Filled.Shuffle,
                        contentDescription = "Aleatorio",
                        tint = if (p.shuffle) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { vm.previous() }, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Filled.SkipPrevious, contentDescription = "Anterior", modifier = Modifier.size(36.dp))
                }
                FilledIconButton(onClick = { vm.togglePlayPause() }, modifier = Modifier.size(72.dp)) {
                    Icon(
                        if (p.isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                        contentDescription = if (p.isPlaying) "Pausar" else "Reproducir",
                        modifier = Modifier.size(40.dp),
                    )
                }
                IconButton(onClick = { vm.next() }, modifier = Modifier.size(56.dp)) {
                    Icon(Icons.Filled.SkipNext, contentDescription = "Siguiente", modifier = Modifier.size(36.dp))
                }
                IconButton(onClick = { vm.cycleRepeat() }) {
                    Icon(
                        if (p.repeatMode == Player.REPEAT_MODE_ONE) Icons.Filled.RepeatOne else Icons.Filled.Repeat,
                        contentDescription = "Repetir",
                        tint = if (p.repeatMode == Player.REPEAT_MODE_OFF) {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                    )
                }
            }

            Row(
                Modifier.fillMaxWidth().padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = {
                    vm.closeNowPlaying()
                    vm.navigate(Route.EqualizerRoute)
                }) {
                    Icon(Icons.Filled.Equalizer, contentDescription = "Ecualizador")
                }
                IconButton(onClick = { showSleep = true }) {
                    Icon(
                        Icons.Filled.Timer,
                        contentDescription = "Temporizador de apagado",
                        tint = if (sleepLeft != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(
                    onClick = { track?.let { t -> vm.showDialog(DialogState.AddToPlaylist(listOf(t))) } },
                    enabled = track != null,
                ) {
                    Icon(Icons.AutoMirrored.Filled.PlaylistAdd, contentDescription = "Añadir a una lista")
                }
                IconButton(onClick = { track?.let { t -> vm.share(context, listOf(t)) } }, enabled = track != null) {
                    Icon(Icons.Filled.Share, contentDescription = "Compartir")
                }
                if (isRemote) {
                    val dl = rememberDownloadUi(vm, track?.remoteId)
                    IconButton(
                        onClick = {
                            track?.let { t ->
                                if (dl.kind == DownloadUiKind.DONE) vm.toast("Ya está descargada: suena sin internet")
                                else vm.download(listOf(t))
                            }
                        },
                        enabled = !dl.busy,
                    ) {
                        when (dl.kind) {
                            DownloadUiKind.DONE -> Icon(
                                Icons.Filled.DownloadDone,
                                contentDescription = "Descargada",
                                tint = MaterialTheme.colorScheme.primary,
                            )
                            DownloadUiKind.QUEUED, DownloadUiKind.RUNNING -> DownloadIndicator(dl, Modifier.size(22.dp))
                            else -> Icon(Icons.Filled.Download, contentDescription = "Descargar para escuchar sin internet")
                        }
                    }
                }
            }
            sleepLeft?.let { left ->
                Text(
                    "Se detendrá en ${formatDuration(left)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                )
            }
        }
    }

    if (showQueue) QueueSheet(vm, onDismiss = { showQueue = false })

    if (showSleep) {
        AlertDialog(
            onDismissRequest = { showSleep = false },
            title = { Text("Temporizador de apagado") },
            text = {
                Column {
                    listOf(15, 30, 45, 60, 90).forEach { minutes ->
                        Text(
                            "$minutes minutos",
                            style = MaterialTheme.typography.bodyLarge,
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    vm.sleepTimer.start(minutes)
                                    vm.toast("La música se detendrá en $minutes minutos")
                                    showSleep = false
                                }
                                .padding(vertical = 12.dp),
                        )
                    }
                }
            },
            confirmButton = {
                if (sleepLeft != null) {
                    TextButton(onClick = {
                        vm.sleepTimer.cancel()
                        showSleep = false
                    }) { Text("Desactivar temporizador") }
                }
            },
            dismissButton = { TextButton(onClick = { showSleep = false }) { Text("Cerrar") } },
        )
    }
}

@Composable
private fun QueueSheet(vm: MainViewModel, onDismiss: () -> Unit) {
    val p by vm.player.collectAsStateWithLifecycle()
    val snapshot = remember(p.queueVersion, p.queueSize) { vm.queueSnapshot() }
    // Copia local que se reordena mientras se arrastra; se aplica al reproductor al soltar.
    val working = remember(snapshot) { snapshot.toMutableStateList() }
    val listState = rememberLazyListState(initialFirstVisibleItemIndex = (p.index - 2).coerceAtLeast(0))
    val reorder = rememberDragReorderState(
        listState = listState,
        headerCount = 0,
        onSwap = { from, to -> working.add(to, working.removeAt(from)) },
        onDrop = { from, to -> if (from != to) vm.moveInQueue(from, to) },
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Cola de reproducción (${working.size})",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f),
            )
            TextButton(onClick = {
                vm.clearQueue()
                onDismiss()
                vm.closeNowPlaying()
            }) { Text("Vaciar") }
        }
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp),
        ) {
            itemsIndexed(working, key = { _, item -> item.uid }) { position, item ->
                val isCurrent = item.index == p.index
                val dragged = reorder.draggedKey == item.uid
                Row(
                    Modifier
                        .zIndex(if (dragged) 1f else 0f)
                        .graphicsLayer { translationY = reorder.translationFor(item.uid) }
                        .then(
                            if (dragged) Modifier.background(MaterialTheme.colorScheme.surfaceVariant) else Modifier,
                        )
                        .fillMaxWidth()
                        .clickable { vm.jumpToQueueIndex(position) }
                        .padding(start = 24.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Artwork(item.trackId, item.albumId, Modifier.size(44.dp), requestPx = 160, artworkUrl = item.artworkUrl)
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            item.title,
                            style = MaterialTheme.typography.bodyLarge,
                            color = if (isCurrent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            item.artist,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    DragHandle(item.uid, reorder)
                    IconButton(onClick = { vm.removeFromQueue(position) }) {
                        Icon(Icons.Filled.Close, contentDescription = "Quitar de la cola")
                    }
                }
            }
        }
        Spacer(Modifier.navigationBarsPadding())
    }
}
