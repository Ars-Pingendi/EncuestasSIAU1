@file:OptIn(ExperimentalMaterial3Api::class)

package com.personal.reproductor.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.personal.reproductor.data.ThemeMode

@Composable
fun SettingsScreen(vm: MainViewModel) {
    val theme by vm.settings.themeMode.collectAsStateWithLifecycle()
    val minDuration by vm.settings.minDurationSec.collectAsStateWithLifecycle()
    val includeAll by vm.settings.includeAllAudio.collectAsStateWithLifecycle()
    val library by vm.library.collectAsStateWithLifecycle()
    val scanning by vm.scanning.collectAsStateWithLifecycle()

    DetailScaffold(title = "Ajustes", onBack = { vm.back() }) {
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState())) {
            SectionTitle("Apariencia")
            ThemeMode.entries.forEach { mode ->
                OptionRow(label = mode.label, selected = theme == mode) { vm.settings.setThemeMode(mode) }
            }

            SectionTitle("Biblioteca")
            Text(
                "Ignorar audios más cortos que:",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
            listOf(0 to "No ignorar ninguno", 15 to "15 segundos", 30 to "30 segundos", 60 to "1 minuto").forEach { (sec, label) ->
                OptionRow(label = label, selected = minDuration == sec) {
                    vm.settings.setMinDurationSec(sec)
                    vm.refreshLibrary()
                }
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable {
                        vm.settings.setIncludeAllAudio(!includeAll)
                        vm.refreshLibrary()
                    }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("Incluir todos los audios", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "Muestra también grabaciones y notas de voz que Android no marca como música.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Switch(
                    checked = includeAll,
                    onCheckedChange = {
                        vm.settings.setIncludeAllAudio(it)
                        vm.refreshLibrary()
                    },
                )
            }
            Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                FilledTonalButton(onClick = { vm.rescanStorage() }, enabled = !scanning) {
                    Text(if (scanning) "Buscando…" else "Buscar música de nuevo en el almacenamiento")
                }
                Text(
                    "Revisa la memoria interna y la tarjeta SD. Úsalo si copiaste archivos y no aparecen.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }

            SectionTitle("Acerca de")
            Text(
                "Pipo Music Player 1.1.1\n" +
                    "${pluralSongs(library.tracks.size)} · ${library.albums.size} álbumes · ${library.artists.size} artistas",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
            Spacer(Modifier.padding(bottom = 24.dp))
        }
    }
}

@Composable
private fun OptionRow(label: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = onClick)
        Spacer(Modifier.width(8.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}
