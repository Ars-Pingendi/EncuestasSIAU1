package com.arspingendi.editorvideo

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.arspingendi.editorvideo.media.BackgroundRemover
import com.arspingendi.editorvideo.media.MediaUtils
import com.arspingendi.editorvideo.media.VideoExporter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class EditorViewModel(app: Application) : AndroidViewModel(app) {

    private val ctx get() = getApplication<Application>()

    val clips = mutableStateListOf<Clip>()
    val thumbnails = mutableStateMapOf<Long, ImageBitmap>()
    var selectedId by mutableStateOf<Long?>(null)
        private set
    var settings by mutableStateOf(ProjectSettings())
        private set
    var bgOptions by mutableStateOf(BackgroundOptions())
        private set
    var exportState by mutableStateOf<ExportState>(ExportState.Idle)
        private set
    var importing by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)

    private var nextId = 1L
    private var job: Job? = null

    val selected: Clip? get() = clips.firstOrNull { it.id == selectedId } ?: clips.firstOrNull()
    val selectedIndex: Int get() = clips.indexOfFirst { it.id == selected?.id }

    // ---------- Importación ----------

    fun addClips(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            importing = true
            var failed = false
            for (uri in uris) {
                val info = withContext(Dispatchers.IO) { MediaUtils.readInfo(ctx, uri) }
                if (info == null || !info.hasVideo || info.durationMs <= 0) {
                    failed = true; continue
                }
                val clip = Clip(
                    id = nextId++,
                    uri = uri,
                    durationMs = info.durationMs,
                    width = info.width,
                    height = info.height,
                    hasAudio = info.hasAudio,
                    transitionIn = if (clips.isEmpty()) TransitionType.NONE
                                   else clips.last().transitionIn.takeIf { it != TransitionType.NONE } ?: TransitionType.NONE,
                )
                clips.add(clip)
                if (selectedId == null) selectedId = clip.id
                loadThumbnail(clip)
            }
            importing = false
            if (failed) message = ctx.getString(R.string.error_import)
        }
    }

    private fun loadThumbnail(clip: Clip) {
        viewModelScope.launch {
            val bmp = withContext(Dispatchers.IO) {
                MediaUtils.thumbnail(ctx, clip.uri, clip.trimStartMs + 200)
            }
            if (bmp != null) thumbnails[clip.id] = bmp.asImageBitmap()
        }
    }

    // ---------- Edición de clips ----------

    fun select(id: Long) { selectedId = id }

    fun updateSelected(transform: (Clip) -> Clip) {
        val c = selected ?: return
        update(c.id, transform)
    }

    private fun update(id: Long, transform: (Clip) -> Clip) {
        val i = clips.indexOfFirst { it.id == id }
        if (i >= 0) clips[i] = transform(clips[i])
    }

    fun setTrim(startMs: Long, endMs: Long) = updateSelected {
        val minLen = MIN_CLIP_MS.coerceAtMost(it.durationMs)
        val s = startMs.coerceIn(0L, it.durationMs - minLen)
        val e = endMs.coerceIn(s + minLen, it.durationMs)
        it.copy(trimStartMs = s, trimEndMs = e)
    }

    fun refreshThumbnail() { selected?.let { loadThumbnail(it) } }

    fun applyTransitionToAll(type: TransitionType) {
        for (i in clips.indices) {
            if (i > 0) clips[i] = clips[i].copy(transitionIn = type)
        }
    }

    fun remove() {
        val c = selected ?: return
        val i = clips.indexOf(c)
        clips.remove(c)
        thumbnails.remove(c.id)
        selectedId = clips.getOrNull(i.coerceAtMost(clips.size - 1))?.id
    }

    fun duplicate() {
        val c = selected ?: return
        val i = clips.indexOf(c)
        val copy = c.copy(id = nextId++)
        clips.add(i + 1, copy)
        thumbnails[c.id]?.let { thumbnails[copy.id] = it }
        selectedId = copy.id
    }

    fun move(delta: Int) {
        val c = selected ?: return
        val i = clips.indexOf(c)
        val j = i + delta
        if (j !in clips.indices) return
        clips.removeAt(i)
        clips.add(j, c)
    }

    /** Divide el clip seleccionado en la posición del cursor (relativa al inicio del recorte). */
    fun split(positionInClipMs: Long): Boolean {
        val c = selected ?: return false
        val cut = c.trimStartMs + positionInClipMs
        if (cut - c.trimStartMs < MIN_CLIP_MS || c.trimEndMs - cut < MIN_CLIP_MS) return false
        val i = clips.indexOf(c)
        val first = c.copy(trimEndMs = cut)
        val second = c.copy(id = nextId++, trimStartMs = cut, transitionIn = TransitionType.NONE)
        clips[i] = first
        clips.add(i + 1, second)
        loadThumbnail(second)
        selectedId = second.id
        return true
    }

    // ---------- Proyecto ----------

    fun updateSettings(transform: (ProjectSettings) -> ProjectSettings) {
        settings = transform(settings)
    }

    fun setMusic(uri: Uri?) {
        settings = if (uri == null) settings.copy(musicUri = null, musicName = null)
        else settings.copy(musicUri = uri, musicName = MediaUtils.displayName(ctx, uri) ?: uri.lastPathSegment)
    }

    fun updateBgOptions(transform: (BackgroundOptions) -> BackgroundOptions) {
        bgOptions = transform(bgOptions)
    }

    val totalDurationMs: Long get() = clips.sumOf { it.outputMs }

    // ---------- Procesos largos ----------

    fun removeBackground() {
        val c = selected ?: return
        val options = bgOptions
        val source = c.originalUri ?: c.uri
        runJob(ctx.getString(R.string.fondo_procesando)) { progress ->
            val out = File(ctx.filesDir, "procesados/fondo_${c.id}_${System.currentTimeMillis()}.mp4")
            BackgroundRemover.process(ctx, source, options, out, progress)
            val newUri = Uri.fromFile(out)
            val info = withContext(Dispatchers.IO) { MediaUtils.readInfo(ctx, newUri) }
            update(c.id) {
                val dur = info?.durationMs?.takeIf { d -> d > 0 } ?: it.durationMs
                it.copy(
                    uri = newUri,
                    originalUri = source,
                    backgroundRemoved = true,
                    durationMs = dur,
                    width = info?.width ?: it.width,
                    height = info?.height ?: it.height,
                    trimEndMs = it.trimEndMs.coerceAtMost(dur),
                )
            }
            clips.firstOrNull { it.id == c.id }?.let { loadThumbnail(it) }
            exportState = ExportState.Idle
            message = ctx.getString(R.string.fondo_aplicado)
        }
    }

    fun restoreOriginal() {
        val c = selected ?: return
        val original = c.originalUri ?: return
        viewModelScope.launch {
            val info = withContext(Dispatchers.IO) { MediaUtils.readInfo(ctx, original) }
            update(c.id) {
                it.copy(
                    uri = original,
                    originalUri = null,
                    backgroundRemoved = false,
                    width = info?.width ?: it.width,
                    height = info?.height ?: it.height,
                )
            }
            clips.firstOrNull { it.id == c.id }?.let { loadThumbnail(it) }
        }
    }

    fun export(audioOnly: Boolean) {
        if (clips.isEmpty()) return
        val snapshot = clips.toList()
        val s = settings
        val title = ctx.getString(if (audioOnly) R.string.exportando_audio else R.string.exportando_video)
        runJob(title) { progress ->
            val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date())
            val dir = File(ctx.cacheDir, "exportados").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() }
            val file = if (audioOnly) {
                VideoExporter.exportAudio(ctx, snapshot, s, File(dir, "EditorVideo_$stamp.m4a"), progress)
            } else {
                VideoExporter.exportVideo(ctx, snapshot, s, File(dir, "EditorVideo_$stamp.mp4"), progress)
            }
            val uri = withContext(Dispatchers.IO) { MediaUtils.saveToGallery(ctx, file, audioOnly) }
            exportState = ExportState.Done(
                uri = uri,
                mime = if (audioOnly) "audio/mp4" else "video/mp4",
                message = ctx.getString(if (audioOnly) R.string.exportado_audio else R.string.exportado_video),
            )
        }
    }

    private fun runJob(title: String, block: suspend (onProgress: (Int) -> Unit) -> Unit) {
        if (job?.isActive == true) return
        exportState = ExportState.Running(title, 0)
        job = viewModelScope.launch {
            try {
                block { p -> exportState = ExportState.Running(title, p) }
            } catch (e: CancellationException) {
                exportState = ExportState.Idle
            } catch (e: Throwable) {
                exportState = ExportState.Failed(describe(e))
            }
        }
    }

    private fun describe(e: Throwable): String {
        val root = generateSequence(e) { it.cause }.last()
        return buildString {
            append(e.message ?: e.javaClass.simpleName)
            if (root !== e && root.message != null) append("\n").append(root.message)
        }
    }

    fun cancelJob() {
        job?.cancel()
        exportState = ExportState.Idle
    }

    fun dismissExport() { exportState = ExportState.Idle }

    companion object {
        const val MIN_CLIP_MS = 300L
    }
}
