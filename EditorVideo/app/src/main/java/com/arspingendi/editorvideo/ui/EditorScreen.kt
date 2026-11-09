package com.arspingendi.editorvideo.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AspectRatio
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.ContentCut
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.RotateRight
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.ViewTimeline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.arspingendi.editorvideo.EditorViewModel
import com.arspingendi.editorvideo.ExportState
import com.arspingendi.editorvideo.R
import com.arspingendi.editorvideo.TransitionType
import com.arspingendi.editorvideo.media.MediaUtils

enum class Tool(val label: Int, val icon: ImageVector) {
    TRIM(R.string.tool_recortar, Icons.Filled.ContentCut),
    CLIP(R.string.tool_clip, Icons.Filled.ViewTimeline),
    SPEED(R.string.tool_velocidad, Icons.Filled.Speed),
    FILTER(R.string.tool_filtros, Icons.Filled.AutoAwesome),
    ADJUST(R.string.tool_ajustes, Icons.Filled.Tune),
    ROTATE(R.string.tool_girar, Icons.Filled.RotateRight),
    TRANSITION(R.string.tool_transicion, Icons.Filled.SwapHoriz),
    AUDIO(R.string.tool_audio, Icons.AutoMirrored.Filled.VolumeUp),
    MUSIC(R.string.tool_musica, Icons.Filled.MusicNote),
    TEXT(R.string.tool_texto, Icons.Filled.TextFields),
    BACKGROUND(R.string.tool_fondo, Icons.Filled.PersonOutline),
    FORMAT(R.string.tool_formato, Icons.Filled.AspectRatio),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(vm: EditorViewModel) {
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    var tool by rememberSaveable { mutableStateOf(Tool.TRIM) }
    val playhead = remember { mutableLongStateOf(0L) }
    var showExportChooser by remember { mutableStateOf(false) }
    var pendingAudioOnly by remember { mutableStateOf<Boolean?>(null) }

    val pickVideos = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(20)
    ) { uris -> vm.addClips(uris) }
    val launchPicker = {
        pickVideos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly))
    }

    val storagePermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val audioOnly = pendingAudioOnly
        pendingAudioOnly = null
        if (granted && audioOnly != null) vm.export(audioOnly)
        else if (!granted) vm.message = context.getString(R.string.permiso_almacenamiento)
    }
    val startExport: (Boolean) -> Unit = { audioOnly ->
        val needsPermission = Build.VERSION.SDK_INT < 29 && ContextCompat.checkSelfPermission(
            context, Manifest.permission.WRITE_EXTERNAL_STORAGE
        ) != PackageManager.PERMISSION_GRANTED
        if (needsPermission) {
            pendingAudioOnly = audioOnly
            storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        } else vm.export(audioOnly)
    }

    LaunchedEffect(vm.message) {
        vm.message?.let {
            snackbar.showSnackbar(it)
            vm.message = null
        }
    }

    // Mantener la pantalla encendida durante procesos largos.
    val view = LocalView.current
    val running = vm.exportState is ExportState.Running
    LaunchedEffect(running) { view.keepScreenOn = running }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name), fontWeight = FontWeight.SemiBold) },
                actions = {
                    if (vm.clips.isNotEmpty()) {
                        IconButton(onClick = launchPicker) {
                            Icon(Icons.Filled.Add, stringResource(R.string.agregar_clip))
                        }
                        Button(
                            onClick = { showExportChooser = true },
                            modifier = Modifier.padding(end = 8.dp)
                        ) { Text(stringResource(R.string.exportar)) }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            if (vm.clips.isEmpty()) {
                EmptyState(importing = vm.importing, onImport = launchPicker)
            } else {
                val clip = vm.selected
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .background(Color.Black)
                ) {
                    if (clip != null) {
                        PreviewPlayer(
                            clip = clip,
                            settings = vm.settings,
                            playhead = playhead,
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                }
                Text(
                    stringResource(R.string.duracion_total, formatTime(vm.totalDurationMs)),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 16.dp, top = 8.dp)
                )
                ClipStrip(vm, onAdd = launchPicker)
                ScrollableTabRow(
                    selectedTabIndex = tool.ordinal,
                    edgePadding = 8.dp,
                    containerColor = MaterialTheme.colorScheme.surfaceContainer,
                ) {
                    Tool.entries.forEach { t ->
                        Tab(
                            selected = tool == t,
                            onClick = { tool = t },
                            text = { Text(stringResource(t.label), fontSize = 12.sp) },
                            icon = { Icon(t.icon, null, Modifier.size(20.dp)) },
                        )
                    }
                }
                Surface(
                    color = MaterialTheme.colorScheme.surfaceContainer,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(250.dp)
                ) {
                    Column(
                        Modifier
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp)
                    ) {
                        ToolPanel(tool, vm, playhead.longValue, onExportAudio = { startExport(true) })
                    }
                }
            }
        }
    }

    if (showExportChooser) {
        AlertDialog(
            onDismissRequest = { showExportChooser = false },
            icon = { Icon(Icons.Filled.Movie, null) },
            title = { Text(stringResource(R.string.exportar_titulo)) },
            text = {
                val (w, h) = com.arspingendi.editorvideo.media.VideoExporter.outputSize(vm.clips, vm.settings)
                Column {
                    Text(stringResource(R.string.duracion_total, formatTime(vm.totalDurationMs)))
                    Text(stringResource(R.string.formato_resolucion, w, h))
                }
            },
            confirmButton = {
                Button(onClick = { showExportChooser = false; startExport(false) }) {
                    Text(stringResource(R.string.exportar_video_mp4))
                }
            },
            dismissButton = {
                TextButton(onClick = { showExportChooser = false; startExport(true) }) {
                    Text(stringResource(R.string.exportar_audio))
                }
            }
        )
    }

    when (val state = vm.exportState) {
        is ExportState.Running -> AlertDialog(
            onDismissRequest = {},
            title = { Text(state.title) },
            text = {
                Column {
                    LinearProgressIndicator(
                        progress = { state.progress / 100f },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    Text("${state.progress} %", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        stringResource(R.string.no_cerrar),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { vm.cancelJob() }) { Text(stringResource(R.string.cancelar)) }
            }
        )
        is ExportState.Done -> AlertDialog(
            onDismissRequest = { vm.dismissExport() },
            title = { Text(stringResource(R.string.exportar_titulo)) },
            text = { Text(state.message) },
            confirmButton = {
                Row {
                    TextButton(onClick = {
                        runCatching { context.startActivity(MediaUtils.viewIntent(state.uri, state.mime)) }
                    }) { Text(stringResource(R.string.ver)) }
                    Button(onClick = {
                        runCatching { context.startActivity(MediaUtils.shareIntent(state.uri, state.mime)) }
                    }) { Text(stringResource(R.string.compartir)) }
                }
            },
            dismissButton = {
                TextButton(onClick = { vm.dismissExport() }) { Text(stringResource(R.string.cerrar)) }
            }
        )
        is ExportState.Failed -> AlertDialog(
            onDismissRequest = { vm.dismissExport() },
            title = { Text(stringResource(R.string.error_titulo)) },
            text = { Text(state.message) },
            confirmButton = {
                TextButton(onClick = { vm.dismissExport() }) { Text(stringResource(R.string.cerrar)) }
            }
        )
        ExportState.Idle -> Unit
    }
}

@Composable
private fun EmptyState(importing: Boolean, onImport: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Filled.VideoLibrary, null,
            Modifier.size(88.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.vacio_titulo), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.vacio_texto),
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(28.dp))
        if (importing) {
            CircularProgressIndicator()
        } else {
            Button(onClick = onImport, contentPadding = PaddingValues(horizontal = 28.dp, vertical = 14.dp)) {
                Icon(Icons.Filled.Add, null)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.importar_videos))
            }
        }
    }
}

@Composable
private fun ClipStrip(vm: EditorViewModel, onAdd: () -> Unit) {
    val selectedId = vm.selected?.id
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        itemsIndexed(vm.clips, key = { _, c -> c.id }) { index, clip ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (index > 0) {
                    val hasTransition = clip.transitionIn != TransitionType.NONE
                    Box(
                        Modifier
                            .padding(horizontal = 3.dp)
                            .size(22.dp)
                            .clip(RoundedCornerShape(6.dp))
                            .background(
                                if (hasTransition) MaterialTheme.colorScheme.secondaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Filled.SwapHoriz, null, Modifier.size(14.dp),
                            tint = if (hasTransition) MaterialTheme.colorScheme.secondary
                                   else MaterialTheme.colorScheme.outline
                        )
                    }
                }
                val isSelected = clip.id == selectedId
                Box(
                    Modifier
                        .size(width = 96.dp, height = 64.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .border(
                            BorderStroke(
                                if (isSelected) 3.dp else 1.dp,
                                if (isSelected) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)
                            ),
                            RoundedCornerShape(10.dp)
                        )
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .clickable { vm.select(clip.id) }
                ) {
                    vm.thumbnails[clip.id]?.let {
                        Image(it, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    }
                    Text(
                        formatTime(clip.outputMs),
                        fontSize = 10.sp,
                        color = Color.White,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(4.dp)
                            .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                    Text(
                        "${index + 1}",
                        fontSize = 10.sp,
                        color = Color.White,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(4.dp)
                            .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp, vertical = 1.dp)
                    )
                }
            }
        }
        item {
            OutlinedButton(
                onClick = onAdd,
                modifier = Modifier
                    .padding(start = 8.dp)
                    .size(width = 64.dp, height = 64.dp),
                contentPadding = PaddingValues(0.dp),
                shape = RoundedCornerShape(10.dp)
            ) { Icon(Icons.Filled.Add, stringResource(R.string.agregar_clip)) }
        }
    }
}

fun formatTime(ms: Long): String {
    val totalSec = ms / 1000
    val tenths = (ms % 1000) / 100
    return "%d:%02d.%d".format(totalSec / 60, totalSec % 60, tenths)
}
