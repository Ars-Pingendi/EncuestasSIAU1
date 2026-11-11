package com.personal.reproductor.ui

import android.Manifest
import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.personal.reproductor.ReproductorApp
import com.personal.reproductor.data.Album
import com.personal.reproductor.data.Library
import com.personal.reproductor.data.SongSort
import com.personal.reproductor.data.Track
import com.personal.reproductor.data.TrackSharing
import com.personal.reproductor.tv.TvShare
import com.personal.reproductor.tv.TvShareService
import com.personal.reproductor.tv.TvShareStatus
import com.personal.reproductor.data.LibraryBuilder
import com.personal.reproductor.data.YouTubeIds
import com.personal.reproductor.data.toTrack
import com.personal.reproductor.data.youTubeTrack
import com.personal.reproductor.data.youtube.YouTubeDownloads
import com.personal.reproductor.data.youtube.YouTubeRepository
import androidx.media3.common.PlaybackException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import com.personal.reproductor.playback.EXTRA_ALBUM_ID
import com.personal.reproductor.playback.EXTRA_ARTWORK_URL
import com.personal.reproductor.playback.EXTRA_PATH
import com.personal.reproductor.playback.EXTRA_DURATION_MS
import com.personal.reproductor.playback.toMediaItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.random.Random

fun hasAudioPermission(context: Context): Boolean {
    val permission = if (Build.VERSION.SDK_INT >= 33) {
        Manifest.permission.READ_MEDIA_AUDIO
    } else {
        Manifest.permission.READ_EXTERNAL_STORAGE
    }
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}

class MainViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as ReproductorApp
    val settings = app.settings
    val effects = app.effects
    val sleepTimer = app.sleepTimer
    private val userData = app.userData
    private val libraryRepo = app.library

    // ------------------------------------------------------------------ permisos y biblioteca

    private val _permission = MutableStateFlow(hasAudioPermission(application))
    val permission: StateFlow<Boolean> = _permission.asStateFlow()

    val library: StateFlow<Library> = libraryRepo.state
    val scanning: StateFlow<Boolean> = libraryRepo.scanning

    fun setPermission(granted: Boolean) {
        _permission.value = granted
        if (granted) libraryRepo.start()
    }

    fun refreshLibrary() = libraryRepo.refresh()

    fun rescanStorage() {
        viewModelScope.launch {
            toast("Buscando audio en el almacenamiento…")
            val checked = libraryRepo.rescanStorage()
            toast("Listo: ${library.value.tracks.size} canciones ($checked archivos revisados)")
        }
    }

    val sortedTracks: StateFlow<List<Track>> =
        combine(library, settings.songSort) { lib, sort -> sortTracks(lib.tracks, sort) }
            .flowOn(Dispatchers.Default)
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private fun sortTracks(tracks: List<Track>, sort: SongSort): List<Track> {
        val c = LibraryBuilder.collator
        return when (sort) {
            SongSort.TITLE -> tracks.sortedWith(compareBy(c) { it.title })
            SongSort.ARTIST -> tracks.sortedWith(compareBy<Track, Any>(c) { it.artist }.thenBy(c) { it.title })
            SongSort.ALBUM -> tracks.sortedWith(
                compareBy<Track, Any>(c) { it.album }.thenBy { it.trackNumber }.thenBy(c) { it.title },
            )
            SongSort.RECENT -> tracks.sortedByDescending { it.dateAddedSec }
            SongSort.DURATION -> tracks.sortedByDescending { it.durationMs }
        }
    }

    // ------------------------------------------------------------------ favoritos, listas, estadísticas

    /** Canciones de YouTube guardadas (por id de video), para mostrarlas en listas y favoritos. */
    private val remoteTracks: StateFlow<Map<String, Track>> =
        userData.remoteTracks.map { list -> list.associate { it.videoId to it.toTrack() } }
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    private fun resolveAny(lib: Library, remote: Map<String, Track>, id: Long, path: String?): Track? {
        val videoId = YouTubeIds.videoIdFromPath(path)
        return if (videoId != null) remote[videoId] else lib.resolve(id, path)
    }

    val playlists: StateFlow<List<PlaylistUi>> =
        combine(userData.playlists, userData.playlistTracks, library, remoteTracks) { lists, items, lib, remote ->
            val byList = items.groupBy { it.playlistId }
            lists.map { p ->
                // (id guardado, canción resuelta en la biblioteca actual), en el orden de la lista
                val resolved = byList[p.id].orEmpty()
                    .sortedBy { it.position }
                    .mapNotNull { row -> resolveAny(lib, remote, row.trackId, row.path)?.let { row.trackId to it } }
                PlaylistUi(
                    id = p.id,
                    name = p.name,
                    tracks = resolved.map { it.second },
                    storedIds = resolved.map { it.first },
                )
            }
        }.flowOn(Dispatchers.Default).stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val favoriteTracks: StateFlow<List<Track>> =
        combine(userData.favoriteTracks, library, remoteTracks) { favs, lib, remote ->
            favs.sortedByDescending { it.addedAt }.mapNotNull { resolveAny(lib, remote, it.trackId, it.path) }
        }.flowOn(Dispatchers.Default).stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val favoriteTrackIds: StateFlow<Set<Long>> =
        favoriteTracks.map { list -> list.map { it.id }.toSet() }
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    val favoriteAlbums: StateFlow<List<Album>> =
        combine(userData.favoriteAlbums, library) { favs, lib ->
            favs.sortedByDescending { it.addedAt }
                .mapNotNull { lib.resolveAlbum(it.albumId, it.albumTitle, it.artist) }
        }.flowOn(Dispatchers.Default).stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    val favoriteAlbumIds: StateFlow<Set<Long>> =
        favoriteAlbums.map { list -> list.map { it.id }.toSet() }
            .stateIn(viewModelScope, SharingStarted.Eagerly, emptySet())

    val smartLists: StateFlow<Map<SmartList, List<Track>>> =
        combine(library, userData.stats, remoteTracks, app.downloads.downloaded) { lib, stats, remote, downloaded ->
            mapOf(
                SmartList.RECENTLY_ADDED to lib.tracks.sortedByDescending { it.dateAddedSec }.take(100),
                SmartList.MOST_PLAYED to stats.filter { it.playCount > 0 }
                    .sortedByDescending { it.playCount }
                    .mapNotNull { resolveAny(lib, remote, it.trackId, it.path) }
                    .take(100),
                SmartList.RECENTLY_PLAYED to stats.filter { it.lastPlayed > 0 }
                    .sortedByDescending { it.lastPlayed }
                    .mapNotNull { resolveAny(lib, remote, it.trackId, it.path) }
                    .take(100),
                SmartList.DOWNLOADED to downloaded.mapNotNull { remote[it] }
                    .sortedWith(compareBy(LibraryBuilder.collator) { it.title }),
            )
        }.flowOn(Dispatchers.Default).stateIn(viewModelScope, SharingStarted.Eagerly, emptyMap())

    fun toggleFavorite(track: Track) {
        viewModelScope.launch {
            if (track.id in favoriteTrackIds.value) {
                userData.removeFavoriteTrack(track)
                toast("Quitada de favoritos")
            } else {
                userData.addFavoriteTrack(track)
                toast("Añadida a favoritos")
            }
        }
    }

    fun toggleFavorite(album: Album) {
        viewModelScope.launch {
            if (album.id in favoriteAlbumIds.value) {
                userData.removeFavoriteAlbum(album)
                toast("Álbum quitado de favoritos")
            } else {
                userData.addFavoriteAlbum(album)
                toast("Álbum añadido a favoritos")
            }
        }
    }

    fun createPlaylist(name: String, tracks: List<Track>) {
        val clean = name.trim()
        if (clean.isEmpty()) return
        viewModelScope.launch {
            val id = userData.createPlaylist(clean)
            if (tracks.isNotEmpty()) userData.addTracks(id, tracks)
            toast("Lista «$clean» creada")
        }
    }

    fun addToPlaylist(playlistId: Long, tracks: List<Track>) {
        viewModelScope.launch {
            val before = playlists.value.firstOrNull { it.id == playlistId }?.tracks?.map { it.id }?.toSet().orEmpty()
            userData.addTracks(playlistId, tracks)
            val added = tracks.count { it.id !in before }
            toast(if (added == 0) "Ya estaba en la lista" else "Añadidas $added a la lista")
        }
    }

    fun removeFromPlaylist(playlistId: Long, track: Track) {
        viewModelScope.launch {
            userData.removeFromPlaylist(playlistId, track)
            toast("Quitada de la lista")
        }
    }

    fun reorderPlaylist(playlistId: Long, orderedStoredIds: List<Long>) {
        viewModelScope.launch { userData.reorderPlaylist(playlistId, orderedStoredIds) }
    }

    fun renamePlaylist(id: Long, name: String) {
        val clean = name.trim()
        if (clean.isEmpty()) return
        viewModelScope.launch { userData.renamePlaylist(id, clean) }
    }

    fun deletePlaylist(id: Long) {
        viewModelScope.launch {
            userData.deletePlaylist(id)
            toast("Lista eliminada")
        }
    }

    // ------------------------------------------------------------------ navegación y diálogos

    private val _stack = MutableStateFlow<List<Route>>(listOf(Route.Home))
    val stack: StateFlow<List<Route>> = _stack.asStateFlow()

    var homeTab: Int = 0

    private val _nowPlayingOpen = MutableStateFlow(false)
    val nowPlayingOpen: StateFlow<Boolean> = _nowPlayingOpen.asStateFlow()

    private val _dialog = MutableStateFlow<DialogState?>(null)
    val dialog: StateFlow<DialogState?> = _dialog.asStateFlow()

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    fun toast(message: String) {
        _messages.tryEmit(message)
    }

    fun navigate(route: Route) {
        if (_stack.value.last() == route) return
        _stack.value = _stack.value + route
    }

    fun back(): Boolean {
        if (_stack.value.size <= 1) return false
        _stack.value = _stack.value.dropLast(1)
        return true
    }

    fun openNowPlaying() { _nowPlayingOpen.value = true }
    fun closeNowPlaying() { _nowPlayingOpen.value = false }

    fun showDialog(state: DialogState?) { _dialog.value = state }

    fun goToAlbum(albumId: Long) {
        closeNowPlaying()
        navigate(Route.AlbumRoute(albumId))
    }

    fun goToArtist(name: String) {
        closeNowPlaying()
        navigate(Route.ArtistRoute(name.trim().lowercase()))
    }

    // ------------------------------------------------------------------ reproductor (MediaController)

    private val _player = MutableStateFlow(PlayerUi())
    val player: StateFlow<PlayerUi> = _player.asStateFlow()

    private val _position = MutableStateFlow(0L)
    val position: StateFlow<Long> = _position.asStateFlow()

    val currentTrackId: StateFlow<Long> =
        player.map { it.trackId }.distinctUntilChanged().stateIn(viewModelScope, SharingStarted.Eagerly, -1L)

    /** La canción que suena, sea del dispositivo o de YouTube (para favoritos y listas desde el reproductor). */
    val currentTrack: StateFlow<Track?> =
        combine(player, library) { p, lib ->
            val videoId = YouTubeIds.videoIdFromPath(p.path)
            when {
                !p.hasMedia -> null
                videoId != null -> youTubeTrack(videoId, p.title, p.artist, p.durationMs, p.artworkUrl)
                else -> lib.tracksById[p.trackId]
            }
        }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller: MediaController? = null

    private val playerListener = object : Player.Listener {
        override fun onEvents(player: Player, events: Player.Events) {
            syncPlayer(events)
        }

        override fun onPlayerError(error: PlaybackException) {
            val fromYouTube = YouTubeIds.videoIdFromPath(_player.value.path) != null
            toast(
                if (fromYouTube) "No se pudo reproducir desde YouTube; se pasa a la siguiente."
                else "No se pudo reproducir este archivo; se pasa al siguiente.",
            )
        }
    }

    // ------------------------------------------------------------------ Pipo en la TV

    val tvStatus: StateFlow<TvShareStatus> = TvShare.status

    fun setTvSharing(on: Boolean) {
        try {
            if (on) TvShareService.start(app) else TvShareService.stop(app)
        } catch (e: Exception) {
            Log.w("MainViewModel", "No se pudo iniciar Pipo en la TV", e)
            toast("No se pudo empezar a compartir con la TV")
        }
    }

    fun tvNewPin() {
        TvShare.newPin(app)
        TvShareService.refreshNotification(app)
    }

    fun tvUnpairAll() {
        TvShare.unpairAll(app)
        toast("Se olvidaron las TV emparejadas")
    }

    init {
        TvShare.refresh(app)
        if (TvShare.isEnabled(app)) setTvSharing(true)
        if (_permission.value) libraryRepo.start()
        connectController()
        viewModelScope.launch { app.downloads.events.collect { toast(it) } }
        viewModelScope.launch {
            while (isActive) {
                delay(400)
                controller?.let { if (it.isPlaying) _position.value = it.currentPosition.coerceAtLeast(0L) }
            }
        }
    }

    private fun connectController() {
        val context = getApplication<Application>()
        val token = SessionToken(
            context,
            ComponentName(context, com.personal.reproductor.playback.PlaybackService::class.java),
        )
        val future = MediaController.Builder(context, token).buildAsync()
        controllerFuture = future
        future.addListener(
            {
                try {
                    val c = future.get()
                    controller = c
                    c.addListener(playerListener)
                    syncPlayer(null)
                } catch (e: Exception) {
                    Log.w(TAG, "No se pudo conectar con el servicio de reproducción", e)
                }
            },
            ContextCompat.getMainExecutor(context),
        )
    }

    private fun syncPlayer(events: Player.Events?) {
        val c = controller ?: return
        val item = c.currentMediaItem
        val metadata = item?.mediaMetadata
        val extras = metadata?.extras
        val reported = c.duration
        val duration = if (reported != C.TIME_UNSET && reported > 0) reported else extras?.getLong(EXTRA_DURATION_MS) ?: 0L
        val previous = _player.value
        val timelineChanged = events?.contains(Player.EVENT_TIMELINE_CHANGED) == true
        _player.value = PlayerUi(
            connected = true,
            hasMedia = item != null,
            isPlaying = c.isPlaying,
            buffering = c.playbackState == Player.STATE_BUFFERING,
            trackId = item?.mediaId?.toLongOrNull() ?: -1L,
            title = metadata?.title?.toString().orEmpty(),
            artist = metadata?.artist?.toString().orEmpty(),
            album = metadata?.albumTitle?.toString().orEmpty(),
            albumId = extras?.getLong(EXTRA_ALBUM_ID) ?: 0L,
            artworkUrl = extras?.getString(EXTRA_ARTWORK_URL),
            path = extras?.getString(EXTRA_PATH).orEmpty(),
            durationMs = duration,
            shuffle = c.shuffleModeEnabled,
            repeatMode = c.repeatMode,
            index = c.currentMediaItemIndex,
            queueSize = c.mediaItemCount,
            queueVersion = if (timelineChanged) previous.queueVersion + 1 else previous.queueVersion,
        )
        _position.value = c.currentPosition.coerceAtLeast(0L)
    }

    /** Reproduce [tracks] empezando por [startIndex]. Si [shuffle] es null conserva el modo aleatorio actual. */
    fun play(tracks: List<Track>, startIndex: Int, shuffle: Boolean? = null) {
        val c = controller ?: return toast("El reproductor aún se está iniciando…")
        if (tracks.isEmpty()) return
        if (shuffle != null) c.shuffleModeEnabled = shuffle
        c.setMediaItems(tracks.map { it.toMediaItem() }, startIndex.coerceIn(0, tracks.lastIndex), 0L)
        c.prepare()
        c.play()
    }

    fun playShuffled(tracks: List<Track>) {
        if (tracks.isEmpty()) return
        play(tracks, Random.nextInt(tracks.size), shuffle = true)
    }

    fun playNext(tracks: List<Track>) {
        val c = controller ?: return
        if (tracks.isEmpty()) return
        if (c.mediaItemCount == 0) {
            play(tracks, 0)
            return
        }
        c.addMediaItems(c.currentMediaItemIndex + 1, tracks.map { it.toMediaItem() })
        toast(if (tracks.size == 1) "Sonará a continuación" else "${tracks.size} canciones sonarán a continuación")
    }

    fun enqueue(tracks: List<Track>) {
        val c = controller ?: return
        if (tracks.isEmpty()) return
        if (c.mediaItemCount == 0) {
            play(tracks, 0)
            return
        }
        c.addMediaItems(tracks.map { it.toMediaItem() })
        toast(if (tracks.size == 1) "Añadida a la cola" else "${tracks.size} canciones añadidas a la cola")
    }

    fun togglePlayPause() {
        val c = controller ?: return
        if (c.isPlaying) c.pause() else {
            if (c.playbackState == Player.STATE_IDLE) c.prepare()
            c.play()
        }
    }

    fun next() { controller?.seekToNext() }
    fun previous() { controller?.seekToPrevious() }

    fun seekTo(positionMs: Long) {
        controller?.seekTo(positionMs)
        _position.value = positionMs
    }

    fun toggleShuffle() {
        val c = controller ?: return
        c.shuffleModeEnabled = !c.shuffleModeEnabled
    }

    fun cycleRepeat() {
        val c = controller ?: return
        c.repeatMode = when (c.repeatMode) {
            Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
            Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
            else -> Player.REPEAT_MODE_OFF
        }
    }

    fun queueSnapshot(): List<QueueItem> {
        val c = controller ?: return emptyList()
        val seen = HashMap<Long, Int>()
        return List(c.mediaItemCount) { i ->
            val item = c.getMediaItemAt(i)
            val md = item.mediaMetadata
            val id = item.mediaId.toLongOrNull() ?: -1L
            val occurrence = seen[id] ?: 0
            seen[id] = occurrence + 1
            QueueItem(
                index = i,
                uid = "$id#$occurrence",
                trackId = id,
                title = md.title?.toString().orEmpty(),
                artist = md.artist?.toString().orEmpty(),
                albumId = md.extras?.getLong(EXTRA_ALBUM_ID) ?: 0L,
                durationMs = md.extras?.getLong(EXTRA_DURATION_MS) ?: 0L,
                artworkUrl = md.extras?.getString(EXTRA_ARTWORK_URL),
            )
        }
    }

    fun jumpToQueueIndex(index: Int) {
        val c = controller ?: return
        c.seekTo(index, 0L)
        c.play()
    }

    fun removeFromQueue(index: Int) {
        controller?.removeMediaItem(index)
    }

    fun moveInQueue(from: Int, to: Int) {
        controller?.moveMediaItem(from, to)
    }

    fun clearQueue() {
        controller?.run {
            stop()
            clearMediaItems()
        }
    }

    // ------------------------------------------------------------------ descargas de YouTube

    private val downloadsRepo: YouTubeDownloads = app.downloads
    val downloadedIds: StateFlow<Set<String>> = downloadsRepo.downloaded
    val downloadStatus: StateFlow<Map<String, YouTubeDownloads.Status>> = downloadsRepo.status

    fun download(tracks: List<Track>) {
        val remote = tracks.filter { it.isRemote }
        if (remote.isEmpty()) return
        viewModelScope.launch {
            userData.rememberRemote(remote)
            val added = downloadsRepo.enqueue(remote)
            toast(
                when {
                    added == 0 -> "Ya están descargadas o en cola"
                    added == 1 -> "Descargando…"
                    else -> "Descargando $added canciones…"
                },
            )
        }
    }

    fun deleteDownload(track: Track) {
        val id = track.remoteId ?: return
        downloadsRepo.delete(id)
        toast("Descarga eliminada")
    }

    fun deleteAllDownloads() {
        downloadsRepo.deleteAll()
        toast("Se borraron todas las descargas")
    }

    fun downloadsSizeBytes(): Long = downloadsRepo.totalBytes()

    // ------------------------------------------------------------------ compartir

    /**
     * Abre el menú «Compartir» de Android (WhatsApp, Bluetooth, correo, Drive…) con los archivos
     * de audio. Las canciones de YouTube sin descargar se comparten como enlace.
     */
    fun share(context: Context, tracks: List<Track>) {
        if (tracks.isEmpty()) return
        val downloaded = downloadedIds.value
        val withFile = tracks.filter { it.remoteId == null || it.remoteId in downloaded }
        val linksOnly = tracks.filter { it.remoteId != null && it.remoteId !in downloaded }
        viewModelScope.launch {
            try {
                if (withFile.isEmpty()) {
                    context.startActivity(TrackSharing.linkChooser(linksOnly))
                    return@launch
                }
                val items = withContext(Dispatchers.IO) { TrackSharing.prepare(app, withFile, downloadsRepo) }
                if (items.isEmpty()) {
                    toast("No se encontró el archivo para compartir")
                    return@launch
                }
                val subject = if (withFile.size == 1) withFile.first().title else "${items.size} canciones"
                context.startActivity(TrackSharing.chooser(items, subject))
                if (linksOnly.isNotEmpty()) {
                    toast(
                        if (linksOnly.size == 1) "1 canción de YouTube sin descargar no se incluyó"
                        else "${linksOnly.size} canciones de YouTube sin descargar no se incluyeron",
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w("MainViewModel", "No se pudo compartir", e)
                toast("No se pudo compartir: ${e.message ?: e.javaClass.simpleName}")
            }
        }
    }

    /** Comparte el enlace de YouTube aunque la canción esté descargada. */
    fun shareLink(context: Context, track: Track) {
        if (track.remoteId == null) return
        context.startActivity(TrackSharing.linkChooser(listOf(track)))
    }

    // ------------------------------------------------------------------ YouTube

    private val youtubeRepo: YouTubeRepository = app.youtube
    private val _youtube = MutableStateFlow(YouTubeUi())
    val youtube: StateFlow<YouTubeUi> = _youtube.asStateFlow()
    private var ytLastPage: YouTubeRepository.SearchPage? = null
    private var ytJob: Job? = null

    fun ytSearch(query: String, mode: YtMode = _youtube.value.mode) {
        val q = query.trim()
        if (q.isEmpty()) return
        ytJob?.cancel()
        ytLastPage = null
        _youtube.value = YouTubeUi(query = q, mode = mode, loading = true, searched = true)
        ytJob = viewModelScope.launch {
            try {
                val page = youtubeRepo.search(q, mode.filter)
                ytLastPage = page
                _youtube.value = _youtube.value.copy(loading = false, results = page.tracks, hasMore = page.hasMore)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Búsqueda en YouTube fallida", e)
                _youtube.value = _youtube.value.copy(loading = false, error = youtubeRepo.describeError(e))
            }
        }
    }

    fun ytSetMode(mode: YtMode) {
        val q = _youtube.value.query
        if (q.isNotBlank()) ytSearch(q, mode) else _youtube.value = _youtube.value.copy(mode = mode)
    }

    fun ytLoadMore() {
        val previous = ytLastPage ?: return
        val state = _youtube.value
        if (!previous.hasMore || state.loadingMore || state.loading) return
        _youtube.value = state.copy(loadingMore = true)
        ytJob = viewModelScope.launch {
            try {
                val page = youtubeRepo.more(previous)
                ytLastPage = page
                val merged = (_youtube.value.results + page.tracks).distinctBy { it.id }
                _youtube.value = _youtube.value.copy(loadingMore = false, results = merged, hasMore = page.hasMore)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Más resultados de YouTube fallidos", e)
                _youtube.value = _youtube.value.copy(loadingMore = false)
                toast(youtubeRepo.describeError(e))
            }
        }
    }

    override fun onCleared() {
        controller?.removeListener(playerListener)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controller = null
        super.onCleared()
    }

    private companion object {
        const val TAG = "MainViewModel"
    }
}
