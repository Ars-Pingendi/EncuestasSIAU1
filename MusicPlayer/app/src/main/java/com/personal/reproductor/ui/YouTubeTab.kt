@file:OptIn(ExperimentalMaterial3Api::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Pestaña YouTube: búsqueda y reproducción sin anuncios (solo audio). */
@Composable
fun YouTubeTab(vm: MainViewModel) {
    val ui by vm.youtube.collectAsStateWithLifecycle()
    val currentId by vm.currentTrackId.collectAsStateWithLifecycle()
    val favs by vm.favoriteTrackIds.collectAsStateWithLifecycle()
    val tv by vm.tvStatus.collectAsStateWithLifecycle()
    val tvTarget by vm.tvTarget.collectAsStateWithLifecycle()
    // Con «Escuchar en la TV» activado, tocar un resultado lo reproduce en el televisor.
    val toTv = tv.running && tvTarget
    var text by rememberSaveable { mutableStateOf(ui.query) }
    val focus = LocalFocusManager.current

    fun search() {
        focus.clearFocus()
        vm.ytSearch(text)
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = text,
            onValueChange = { text = it },
            singleLine = true,
            placeholder = { Text("Buscar en YouTube") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            trailingIcon = {
                if (text.isNotEmpty()) {
                    IconButton(onClick = { text = "" }) {
                        Icon(Icons.Filled.Close, contentDescription = "Borrar")
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { search() }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Row(
            Modifier.padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            YtMode.entries.forEach { mode ->
                FilterChip(
                    selected = ui.mode == mode,
                    onClick = { vm.ytSetMode(mode) },
                    label = { Text(mode.label) },
                )
            }
            if (tv.running) {
                FilterChip(
                    selected = toTv,
                    onClick = { vm.setTvTarget(!tvTarget) },
                    label = { Text("Escuchar en la TV") },
                    leadingIcon = { Icon(Icons.Filled.Tv, contentDescription = null, modifier = Modifier.size(18.dp)) },
                )
            }
        }

        val error = ui.error
        when {
            ui.loading -> LoadingState("Buscando en YouTube…")
            error != null -> EmptyState(
                icon = Icons.Filled.CloudOff,
                title = "No se pudo buscar",
                message = error,
                actionLabel = "Reintentar",
                onAction = { vm.ytSearch(ui.query) },
            )
            !ui.searched -> EmptyState(
                icon = Icons.Filled.Search,
                title = "Escucha desde YouTube",
                message = "Busca canciones o videos: suenan sin anuncios, en segundo plano y con tu ecualizador. " +
                    "Puedes guardarlas en tus listas y favoritos con el menú ⋮. " +
                    "Con la TV conectada, activa «Escuchar en la TV» para que suenen en el televisor.",
            )
            ui.results.isEmpty() -> EmptyState(
                icon = Icons.Filled.Search,
                title = "Sin resultados",
                message = "No encontré nada para «${ui.query}».",
            )
            else -> LazyColumn(Modifier.fillMaxSize()) {
                item {
                    PlayShuffleRow(
                        count = ui.results.size,
                        onPlay = { if (toTv) vm.tvPlay(ui.results, 0) else vm.play(ui.results, 0, shuffle = false) },
                        onShuffle = { if (toTv) vm.tvPlay(ui.results, 0, shuffle = true) else vm.playShuffled(ui.results) },
                    )
                }
                itemsIndexed(ui.results, key = { _, t -> t.id }) { index, track ->
                    TrackRow(
                        track = track,
                        vm = vm,
                        currentId = currentId,
                        favorites = favs,
                        onClick = { if (toTv) vm.tvPlay(ui.results, index) else vm.play(ui.results, index) },
                    )
                }
                if (ui.hasMore) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
                            if (ui.loadingMore) {
                                CircularProgressIndicator()
                            } else {
                                OutlinedButton(onClick = { vm.ytLoadMore() }) { Text("Cargar más") }
                            }
                        }
                    }
                }
            }
        }
    }
}
