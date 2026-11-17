@file:OptIn(ExperimentalMaterial3Api::class)

package com.personal.reproductor.ui

import android.app.Activity
import android.content.pm.ActivityInfo
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.MusicNote
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.MergingMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import com.personal.reproductor.ReproductorApp
import com.personal.reproductor.data.youtube.YouTubeRepository
import com.personal.reproductor.data.youTubeTrack
import com.personal.reproductor.playback.YouTubeRangeDataSource
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap

/** Una calidad que se puede elegir: imagen sola (con la pista de audio aparte) o video con audio incluido. */
private class VideoChoice(val label: String, val rendition: YouTubeRepository.VideoRendition, val needsAudio: Boolean)

private fun heightLabel(h: Int) = if (h >= 2160) "4K" else "${h}p"

/**
 * Ver un video de YouTube sin anuncios dentro de la app. La imagen (hasta 1080p) y el audio llegan por
 * separado y ExoPlayer los une; si eso falla se usa el video con audio incluido (normalmente 360p).
 */
@Composable
fun VideoScreen(vm: MainViewModel, route: Route.VideoRoute) {
    val context = LocalContext.current
    val app = context.applicationContext as ReproductorApp
    val tv by vm.tvStatus.collectAsStateWithLifecycle()

    var options by remember { mutableStateOf<YouTubeRepository.VideoOptions?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableIntStateOf(-1) }
    var fullscreen by remember { mutableStateOf(false) }

    val sources = remember { ConcurrentHashMap<Uri, YouTubeRepository.DownloadSource>() }
    val exo = remember {
        ExoPlayer.Builder(context)
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
    }
    val factory = remember { DataSource.Factory { YouTubeRangeDataSource(app.youtube, sources) } }
    val progressive = remember { ProgressiveMediaSource.Factory(factory) }

    // Mientras se ve el video, la música se pausa; al salir se libera el reproductor.
    DisposableEffect(Unit) {
        vm.pauseForVideo()
        onDispose { exo.release() }
    }

    val choices: List<VideoChoice> = remember(options) {
        val o = options ?: return@remember emptyList()
        val list = ArrayList<VideoChoice>()
        if (o.audio != null) o.adaptive.sortedByDescending { it.height }.forEach { list += VideoChoice(heightLabel(it.height), it, true) }
        o.muxed.sortedByDescending { it.height }.forEach { r ->
            if (list.none { it.rendition.height == r.height }) list += VideoChoice(heightLabel(r.height), r, false)
        }
        list
    }

    fun mediaSource(choice: VideoChoice): MediaSource {
        val o = options!!
        val videoUri = Uri.parse("pipoytv://${route.videoId}/${if (choice.needsAudio) "v" else "m"}${choice.rendition.height}")
        sources[videoUri] = choice.rendition.source
        val video = progressive.createMediaSource(MediaItem.fromUri(videoUri))
        if (!choice.needsAudio) return video
        val audioUri = Uri.parse("pipoytv://${route.videoId}/a")
        sources[audioUri] = o.audio!!
        return MergingMediaSource(video, progressive.createMediaSource(MediaItem.fromUri(audioUri)))
    }

    fun playChoice(index: Int, startMs: Long) {
        val choice = choices.getOrNull(index) ?: return
        selected = index
        exo.setMediaSource(mediaSource(choice), startMs)
        exo.prepare()
        exo.playWhenReady = true
    }

    // 1) Se consultan las calidades disponibles.
    LaunchedEffect(route.videoId) {
        try {
            options = withContext(Dispatchers.IO) { app.youtube.videoOptions(route.videoId) }
        } catch (e: Exception) {
            error = app.youtube.describeError(e)
        }
    }
    // 2) Con las calidades a la vista, se empieza en 720p (o la mejor por debajo).
    LaunchedEffect(choices) {
        if (choices.isEmpty()) {
            if (options != null && error == null) error = "YouTube no ofreció video para este contenido."
            return@LaunchedEffect
        }
        val start = choices.indexOfFirst { it.rendition.height <= 720 }.takeIf { it >= 0 } ?: choices.lastIndex
        playChoice(start, 0L)
    }
    // 3) Si falla la imagen y el audio por separado, se pasa al video con audio incluido.
    DisposableEffect(exo, choices) {
        val listener = object : Player.Listener {
            override fun onPlayerError(e: PlaybackException) {
                app.youtube.invalidate(route.videoId)
                val current = choices.getOrNull(selected)
                val fallback = choices.indexOfFirst { !it.needsAudio }
                if (current != null && current.needsAudio && fallback >= 0) {
                    playChoice(fallback, exo.currentPosition)
                } else {
                    error = "No se pudo reproducir el video. Revisa tu conexión e inténtalo de nuevo."
                }
            }
        }
        exo.addListener(listener)
        onDispose { exo.removeListener(listener) }
    }

    // Pantalla completa: horizontal y sin barras del sistema.
    val view = LocalView.current
    DisposableEffect(fullscreen) {
        val activity = context as? Activity
        val window = activity?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        if (fullscreen) {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            controller?.hide(WindowInsetsCompat.Type.systemBars())
        }
        onDispose {
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            controller?.show(WindowInsetsCompat.Type.systemBars())
        }
    }
    BackHandler(enabled = fullscreen) { fullscreen = false }

    val player: @Composable (Modifier) -> Unit = { modifier ->
        AndroidView(
            modifier = modifier,
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = exo
                    useController = true
                    keepScreenOn = true
                    setFullscreenButtonClickListener { isFull -> fullscreen = isFull }
                }
            },
        )
    }

    if (fullscreen) {
        Box(Modifier.fillMaxSize().background(Color.Black)) { player(Modifier.fillMaxSize()) }
        return
    }

    DetailScaffold(title = route.title, onBack = { vm.back() }) {
        Column(Modifier.fillMaxSize()) {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(Color.Black), contentAlignment = Alignment.Center) {
                when {
                    error != null -> Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(16.dp)) {
                        Icon(Icons.Filled.CloudOff, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp))
                        Text(error ?: "", color = Color.White, style = MaterialTheme.typography.bodyMedium)
                    }
                    options == null -> CircularProgressIndicator(color = Color.White)
                    else -> player(Modifier.fillMaxSize())
                }
            }
            Column(Modifier.padding(16.dp)) {
                Text(route.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(route.channel, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (choices.size > 1) {
                    Text("Calidad", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 12.dp, bottom = 4.dp))
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        choices.forEachIndexed { index, choice ->
                            FilterChip(
                                selected = index == selected,
                                onClick = { if (index != selected) playChoice(index, exo.currentPosition) },
                                label = { Text(choice.label) },
                            )
                        }
                    }
                }
                Row(Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    val track = youTubeTrack(route.videoId, route.title, route.channel, route.durationMs, route.thumb)
                    if (tv.running) {
                        OutlinedButton(onClick = { exo.pause(); vm.tvWatch(track) }) {
                            Icon(Icons.Filled.Tv, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text("  Ver en la TV")
                        }
                    }
                    OutlinedButton(onClick = { vm.back(); vm.play(listOf(track), 0) }) {
                        Icon(Icons.Filled.MusicNote, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("  Solo audio")
                    }
                }
            }
        }
    }
}
