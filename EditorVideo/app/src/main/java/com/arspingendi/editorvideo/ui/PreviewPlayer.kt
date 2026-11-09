package com.arspingendi.editorvideo.ui

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableLongState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.arspingendi.editorvideo.Clip
import com.arspingendi.editorvideo.ProjectSettings
import com.arspingendi.editorvideo.TextPosition
import com.arspingendi.editorvideo.media.VisualEffects
import kotlinx.coroutines.delay

/**
 * Vista previa del clip seleccionado con su recorte, velocidad, volumen y "look"
 * (giro, filtro y ajustes de color) aplicados en tiempo real.
 */
@Composable
fun PreviewPlayer(
    clip: Clip,
    settings: ProjectSettings,
    playhead: MutableLongState,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            repeatMode = Player.REPEAT_MODE_ONE
            playWhenReady = false
        }
    }
    var effectsSupported by remember { mutableStateOf(true) }
    var effectsApplied by remember { mutableStateOf(false) }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onPlayerError(error: PlaybackException) {
                // Si el dispositivo no soporta efectos en la vista previa, se reproduce sin ellos.
                if (effectsApplied) effectsSupported = false
            }
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    val look = remember(clip.rotation, clip.filter, clip.brightness, clip.contrast, clip.saturation) {
        VisualEffects.lookEffects(clip)
    }

    LaunchedEffect(clip.id, clip.uri, clip.trimStartMs, clip.trimEndMs, look, effectsSupported) {
        delay(120) // evita recargar en cada movimiento del deslizador
        val wasPlaying = player.isPlaying
        if (effectsSupported && look.isNotEmpty()) {
            runCatching { player.setVideoEffects(look); effectsApplied = true }
                .onFailure { effectsSupported = false }
        } else if (effectsApplied) {
            runCatching { player.setVideoEffects(emptyList()) }
            effectsApplied = false
        }
        val item = MediaItem.Builder()
            .setUri(clip.uri)
            .setClippingConfiguration(
                MediaItem.ClippingConfiguration.Builder()
                    .setStartPositionMs(clip.trimStartMs)
                    .setEndPositionMs(clip.trimEndMs)
                    .build()
            )
            .build()
        player.setMediaItem(item)
        player.prepare()
        player.playWhenReady = wasPlaying
    }

    LaunchedEffect(clip.speed) { player.setPlaybackSpeed(clip.speed) }
    LaunchedEffect(clip.volume, settings.muteOriginal, settings.removeAllAudio) {
        player.volume = if (settings.muteOriginal || settings.removeAllAudio) 0f else clip.volume.coerceIn(0f, 1f)
    }
    LaunchedEffect(player) {
        while (true) {
            playhead.longValue = player.currentPosition.coerceAtLeast(0L)
            delay(100)
        }
    }

    Box(modifier) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    this.player = player
                    setShowNextButton(false)
                    setShowPreviousButton(false)
                    controllerShowTimeoutMs = 2500
                }
            },
            modifier = Modifier.fillMaxSize()
        )
        // Aproximación del texto sobreimpreso (el resultado exacto se ve al exportar).
        val text = settings.text.trim()
        if (text.isNotEmpty()) {
            val align = when (settings.textPosition) {
                TextPosition.TOP -> Alignment.TopCenter
                TextPosition.CENTER -> Alignment.Center
                TextPosition.BOTTOM -> Alignment.BottomCenter
            }
            Text(
                text,
                color = Color(settings.textColor),
                fontSize = (settings.textSize * 320).sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .align(align)
                    .padding(horizontal = 16.dp, vertical = 28.dp)
                    .then(
                        if (settings.textBackground)
                            Modifier.background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(4.dp))
                        else Modifier
                    )
                    .padding(horizontal = 6.dp)
            )
        }
    }
}
