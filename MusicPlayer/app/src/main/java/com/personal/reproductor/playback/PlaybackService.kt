package com.personal.reproductor.playback

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.util.Log
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Timeline
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.personal.reproductor.MainActivity
import com.personal.reproductor.ReproductorApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Servicio de reproducción en segundo plano (ExoPlayer + MediaSession).
 * Da la notificación con controles, la pantalla de bloqueo y los botones de auriculares/Bluetooth.
 * Guarda la cola y la posición para retomar la reproducción al volver a abrir la app.
 */
class PlaybackService : MediaSessionService() {

    private var mediaSession: MediaSession? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private var playCounted = false
    private var consecutiveErrors = 0
    private var effectsSession = -1
    private var queueSaveJob: Job? = null

    override fun onCreate() {
        super.onCreate()
        val app = application as ReproductorApp
        val queueStore = app.queueStore

        // Cadena de audio propia: el ecualizador de 10 bandas procesa el PCM antes de llegar al AudioTrack.
        val eqProcessor = app.effects.createProcessor()
        val renderersFactory = object : DefaultRenderersFactory(this) {
            override fun buildAudioSink(
                context: Context,
                enableFloatOutput: Boolean,
                enableAudioTrackPlaybackParams: Boolean,
            ): AudioSink? =
                DefaultAudioSink.Builder(context)
                    .setEnableFloatOutput(enableFloatOutput)
                    .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
                    .setAudioProcessors(arrayOf(eqProcessor))
                    .build()
        }

        val player = ExoPlayer.Builder(this, renderersFactory)
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

        // Sesión de audio fija: así los efectos del sistema siguen conectados entre canciones.
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
                saveState(player)
            }

            override fun onTimelineChanged(timeline: Timeline, reason: Int) {
                if (reason == Player.TIMELINE_CHANGE_REASON_PLAYLIST_CHANGED) scheduleQueueSave(player)
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) consecutiveErrors = 0 else saveState(player)
            }

            override fun onShuffleModeEnabledChanged(shuffleModeEnabled: Boolean) = saveState(player)

            override fun onRepeatModeChanged(repeatMode: Int) = saveState(player)

            override fun onPlayerError(error: PlaybackException) {
                Log.w(TAG, "Error de reproducción", error)
                // Si un archivo falla (borrado, formato no soportado), pasa al siguiente
                // sin cambiar si estaba reproduciendo o en pausa.
                if (++consecutiveErrors <= MAX_CONSECUTIVE_ERRORS && player.hasNextMediaItem()) {
                    player.seekToNextMediaItem()
                    player.prepare()
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

        // Retomar la cola guardada (en pausa). Si el usuario ya empezó algo nuevo, no se toca.
        scope.launch {
            val snapshot = withContext(Dispatchers.IO) { queueStore.load() }
            if (snapshot != null && player.mediaItemCount == 0) {
                player.setMediaItems(snapshot.rows.map { it.toMediaItem() }, snapshot.index, snapshot.positionMs)
                player.shuffleModeEnabled = snapshot.shuffle
                player.repeatMode = snapshot.repeatMode
                player.prepare()
            }
        }

        // Cada segundo: cuenta reproducciones (a los 20 s) y, cada 5 s, guarda la posición.
        scope.launch {
            var ticks = 0
            while (isActive) {
                delay(1000)
                countPlayIfNeeded(app, player)
                if (player.isPlaying && ++ticks % 5 == 0) saveState(player)
            }
        }
    }

    private fun scheduleQueueSave(player: Player) {
        queueSaveJob?.cancel()
        queueSaveJob = scope.launch {
            delay(1500)
            writeQueue(player)
        }
    }

    private suspend fun writeQueue(player: Player) {
        val store = (application as ReproductorApp).queueStore
        val rows = store.rowsOf(List(player.mediaItemCount) { player.getMediaItemAt(it) })
        withContext(Dispatchers.IO) { store.saveRows(rows) }
        saveState(player)
    }

    private fun saveState(player: Player) {
        if (player.mediaItemCount == 0) return
        (application as ReproductorApp).queueStore.saveState(
            player.currentMediaItemIndex,
            player.currentPosition.coerceAtLeast(0L),
            player.shuffleModeEnabled,
            player.repeatMode,
        )
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
        val player = mediaSession?.player
        if (player != null) saveState(player)
        // Si no se está reproduciendo nada, no hay motivo para mantener el servicio vivo.
        if (player == null || !player.playWhenReady || player.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        val app = application as ReproductorApp
        app.sleepTimer.onFinish = null
        mediaSession?.player?.let { player ->
            saveState(player)
            // Si había un cambio de cola pendiente de guardar, se escribe ahora mismo.
            if (queueSaveJob?.isActive == true) {
                queueSaveJob?.cancel()
                val rows = app.queueStore.rowsOf(List(player.mediaItemCount) { player.getMediaItemAt(it) })
                if (rows.isNotEmpty()) app.queueStore.saveRows(rows)
            }
        }
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
