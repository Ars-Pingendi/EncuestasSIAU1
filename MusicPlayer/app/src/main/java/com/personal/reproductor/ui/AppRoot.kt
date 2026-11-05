@file:OptIn(ExperimentalMaterial3Api::class)

package com.personal.reproductor.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

@Composable
fun AppRoot(vm: MainViewModel) {
    val granted by vm.permission.collectAsStateWithLifecycle()
    if (granted) MainContent(vm) else PermissionScreen(vm)
}

@Composable
private fun MainContent(vm: MainViewModel) {
    val stack by vm.stack.collectAsStateWithLifecycle()
    val nowPlayingOpen by vm.nowPlayingOpen.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(Unit) {
        vm.messages.collect { message ->
            launch {
                snackbar.currentSnackbarData?.dismiss()
                snackbar.showSnackbar(message)
            }
        }
    }

    BackHandler(enabled = nowPlayingOpen) { vm.closeNowPlaying() }
    BackHandler(enabled = !nowPlayingOpen && stack.size > 1) { vm.back() }

    // Surface (y no un Box) para que todo el contenido herede el color de texto del tema;
    // sin esto, los textos sin color propio salían negros sobre el fondo oscuro.
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                HomeScreen(vm)
                // Las pantallas de detalle se dibujan encima de Inicio (que conserva su posición de scroll).
                stack.drop(1).forEach { route ->
                    key(route) {
                        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                            RouteContent(vm, route)
                        }
                    }
                }
                SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
            }
            MiniPlayer(vm)
            Spacer(
                Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .windowInsetsBottomHeight(WindowInsets.navigationBars),
            )
        }

        AnimatedVisibility(
            visible = nowPlayingOpen,
            enter = slideInVertically { it },
            exit = slideOutVertically { it },
        ) {
            NowPlayingScreen(vm)
        }
    } }

    AppDialogs(vm)
}

@Composable
private fun RouteContent(vm: MainViewModel, route: Route) {
    when (route) {
        Route.Home -> Unit
        is Route.AlbumRoute -> AlbumScreen(vm, route.id)
        is Route.ArtistRoute -> ArtistScreen(vm, route.key)
        is Route.GenreRoute -> GenreScreen(vm, route.name)
        is Route.FolderRoute -> FolderScreen(vm, route.path)
        is Route.PlaylistRoute -> PlaylistScreen(vm, route.id)
        is Route.SmartRoute -> SmartListScreen(vm, route.kind)
        Route.SearchRoute -> SearchScreen(vm)
        Route.EqualizerRoute -> EqualizerScreen(vm)
        Route.SettingsRoute -> SettingsScreen(vm)
    }
}

@Composable
private fun PermissionScreen(vm: MainViewModel) {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        vm.setPermission(hasAudioPermission(context))
    }
    val permissions = if (Build.VERSION.SDK_INT >= 33) {
        arrayOf(Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.POST_NOTIFICATIONS)
    } else {
        arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE)
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            Modifier.fillMaxSize().systemBarsPadding().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.Center,
        ) {
            Icon(
                Icons.Filled.LibraryMusic,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(72.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text("Pipo Music Player", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(12.dp))
            Text(
                "Para mostrar tu música necesito permiso para leer los archivos de audio de este dispositivo. " +
                    "Todo se queda en tu teléfono: no se envía nada a internet.",
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))
            Button(onClick = { launcher.launch(permissions) }) { Text("Dar acceso a mi música") }
            TextButton(
                onClick = {
                    context.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                            .setData(Uri.fromParts("package", context.packageName, null)),
                    )
                },
            ) { Text("Abrir ajustes de la app") }
        }
    }
}
