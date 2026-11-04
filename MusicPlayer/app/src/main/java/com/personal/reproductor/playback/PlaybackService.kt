package com.personal.reproductor.playback

import android.app.PendingIntent
import android.content.Intent
import android.media.AudioManager
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.personal.reproductor.MainActivity
import com.personal.reproductor.ReproductorApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Servicio de reproducción en segundo plano (ExoPlayer + MediaSession).
 * Da la notificación con controles, la pantalla de bloqueo y los botones de auriculares/Bluetooth.
 */
class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var playCounted = false
    private var consecutiveErrors = 0
    private var effectsSession = -1

    override fun onCreate() {
        super.onCreate()
        val app = application as ReproductorApp

        val player = ExoPlayer.Builder(this)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .build()

        // Sesión de audio fija: así el ecualizador sigue conectado entre canciones.
        val audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
        val sessionId = audioManager.generateAudioSessionId()
        if (sessionId > 0) {
            player.setAudioSessionId(sessionId)
            effectsSession = sessionId
            app.effects.attach(sessionId)
        }

        player.addListener(object : Player.Listener {
            override fun onAudioSessionIdChanged(audioSessionId: Int) {
                if (audioSessionId > 0 && audioSessionId != effectsSession) {
                    effectsSession = audioSessionId
                    app.effects.attach(audioSessionId)
                }
            }

            override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
                playCounted = false
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) consecutiveErrors = 0
            }

            override fun onPlayerError(error: PlaybackException) {
                Log.w(TAG, "Error de reproducción", error)
                // Si un archivo falla (borrado, formato no soportado), pasa al siguiente.
                if (++consecutiveErrors <= MAX_CONSECUTIVE_ERRORS && player.hasNextMediaItem()) {
                    player.seekToNextMediaItem()
                    player.prepare()
                    player.play()
                }
            }
        })

        val openApp = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        mediaSession = MediaSession.Builder(this, player).setSessionActivity(openApp).build()

        app.sleepTimer.onFinish = { player.pause() }

        // Cuenta una reproducción cuando se escucharon 20 s (o la mitad si la pista es corta).
        scope.launch {
            while (isActive) {
                delay(1000)
                countPlayIfNeeded(app, player)
            }
        }
    }

    private fun countPlayIfNeeded(app: ReproductorApp, player: ExoPlayer) {
        if (playCounted || !player.isPlaying) return
        val item = player.currentMediaItem ?: return
        val duration = player.duration
        val threshold = if (duration != C.TIME_UNSET && duration > 0L && duration < 40_000L) duration / 2 else 20_000L
        if (player.currentPosition < threshold) return
        playCounted = true
        val trackId = item.mediaId.toLongOrNull() ?: return
        val path = item.mediaMetadata.extras?.getString(EXTRA_PATH).orEmpty()
        scope.launch { app.userData.recordPlay(trackId, path) }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        // Si no se está reproduciendo nada, no hay motivo para mantener el servicio vivo.
        val player = mediaSession?.player
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        val app = application as ReproductorApp
        app.sleepTimer.onFinish = null
        app.effects.detach()
        mediaSession?.run {
            player.release()
            release()
        }
        mediaSession = null
        scope.cancel()
        super.onDestroy()
    }

    private companion object {
        const val TAG = "PlaybackService"
        const val MAX_CONSECUTIVE_ERRORS = 5
    }
}
