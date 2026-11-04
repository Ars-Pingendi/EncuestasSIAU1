package com.personal.reproductor.data

import android.content.Context
import android.database.ContentObserver
import android.media.MediaScannerConnection
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.resume

class LibraryRepository(
    private val context: Context,
    private val settings: AppSettings,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(Library())
    val state: StateFlow<Library> = _state.asStateFlow()

    private val _scanning = MutableStateFlow(false)
    val scanning: StateFlow<Boolean> = _scanning.asStateFlow()

    private val mutex = Mutex()
    private var started = false
    private var debounceJob: Job? = null

    private val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean) {
            debounceJob?.cancel()
            debounceJob = scope.launch {
                delay(1500)
                refreshNow()
            }
        }
    }

    /** Se llama cuando ya hay permiso de lectura: registra el observador y hace el primer escaneo. */
    fun start() {
        if (started) return
        started = true
        context.contentResolver.registerContentObserver(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, true, observer,
        )
        refresh()
    }

    fun refresh() {
        scope.launch { refreshNow() }
    }

    suspend fun refreshNow() = mutex.withLock {
        _scanning.value = true
        try {
            val tracks = MediaStoreScanner.scan(
                context,
                settings.minDurationSec.value * 1000L,
                settings.includeAllAudio.value,
            )
            _state.value = withContext(Dispatchers.Default) { LibraryBuilder.build(tracks) }
        } catch (e: Exception) {
            Log.w(TAG, "Error al escanear la biblioteca", e)
            _state.update { it.copy(loaded = true) }
        } finally {
            _scanning.value = false
        }
    }

    /**
     * Recorre el almacenamiento (interno y SD) y pide a Android que indexe los audios
     * que todavía no estén en MediaStore. Devuelve cuántos archivos revisó.
     */
    suspend fun rescanStorage(): Int = withContext(Dispatchers.IO) {
        val files = ArrayList<String>()
        for (root in storageRoots()) walk(root, files)
        if (files.isNotEmpty()) {
            withTimeoutOrNull(90_000) {
                suspendCancellableCoroutine<Unit> { cont ->
                    val remaining = AtomicInteger(files.size)
                    MediaScannerConnection.scanFile(context, files.toTypedArray(), null) { _, _ ->
                        if (remaining.decrementAndGet() == 0 && cont.isActive) cont.resume(Unit)
                    }
                }
            }
        }
        refreshNow()
        files.size
    }

    private fun storageRoots(): Set<File> {
        val roots = linkedSetOf<File>()
        roots += Environment.getExternalStorageDirectory()
        context.getExternalFilesDirs(null).forEach { dir ->
            val p = dir?.absolutePath ?: return@forEach
            val i = p.indexOf("/Android/")
            if (i > 0) roots += File(p.substring(0, i))
        }
        return roots
    }

    private fun walk(root: File, out: MutableList<String>) {
        val stack = ArrayDeque<File>()
        stack.add(root)
        while (stack.isNotEmpty() && out.size < MAX_FILES) {
            val dir = stack.removeLast()
            val children = try { dir.listFiles() } catch (e: SecurityException) { null } ?: continue
            for (f in children) {
                if (f.name.startsWith(".")) continue
                if (f.isDirectory) {
                    if (f.name != "Android") stack.add(f)
                } else if (f.extension.lowercase() in AUDIO_EXTENSIONS) {
                    out += f.absolutePath
                }
            }
        }
    }

    private companion object {
        const val TAG = "LibraryRepository"
        const val MAX_FILES = 30_000
        val AUDIO_EXTENSIONS = setOf("mp3", "m4a", "aac", "flac", "ogg", "opus", "wav", "wma", "amr", "mka", "oga")
    }
}
