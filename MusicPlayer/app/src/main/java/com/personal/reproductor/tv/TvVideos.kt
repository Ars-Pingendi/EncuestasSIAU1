package com.personal.reproductor.tv

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.util.Size
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Un video guardado en el teléfono, listo para ofrecérselo a la TV. */
data class PhoneVideo(
    val id: Long,
    val kind: String, // "movie" | "episode"
    val title: String,
    val series: String,
    val seriesKey: String,
    val season: Int,
    val episode: Int,
    val year: Int,
    val durationMs: Long,
    val size: Long,
    val addedAt: Long,
    val width: Int,
    val height: Int,
    val mime: String,
    val ext: String,
) {
    val tvId: String get() = "m:$id"
}

/** Qué contiene un archivo de video (códecs), leído con MediaExtractor. */
data class VideoProbe(
    val video: String? = null,
    val width: Int = 0,
    val height: Int = 0,
    val audio: List<String> = emptyList(),
    val channels: Int = 0,
)

/**
 * Videos del teléfono para la app Pipo de la TV (LG webOS). El teléfono no convierte videos: los
 * envía tal cual (con soporte de rangos) y avisa si la TV probablemente no los reproduzca.
 */
object TvVideos {
    private const val CACHE_MS = 10_000L
    private const val THUMB_DIR = "tv-video-thumbs"

    @Volatile private var cached: List<PhoneVideo> = emptyList()
    @Volatile private var cachedAt = 0L

    // ───────────────────────────── Permiso ─────────────────────────────

    fun permission(): String =
        if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_VIDEO else Manifest.permission.READ_EXTERNAL_STORAGE

    fun hasPermission(context: Context): Boolean =
        ContextCompat.checkSelfPermission(context, permission()) == PackageManager.PERMISSION_GRANTED

    // ───────────────────────────── Biblioteca ─────────────────────────────

    fun uriFor(id: Long): Uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)

    /** «m:123» → 123. */
    fun idOf(tvId: String): Long? = if (tvId.startsWith("m:")) tvId.substring(2).toLongOrNull() else null

    @Synchronized
    fun list(context: Context, force: Boolean = false): List<PhoneVideo> {
        val now = System.currentTimeMillis()
        if (!force && cached.isNotEmpty() && now - cachedAt < CACHE_MS) return cached
        if (!hasPermission(context)) return emptyList()
        val out = ArrayList<PhoneVideo>()
        @Suppress("DEPRECATION")
        val projection = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.WIDTH,
            MediaStore.Video.Media.HEIGHT,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.DATE_TAKEN,
            MediaStore.Video.Media.MIME_TYPE,
            MediaStore.Video.Media.DATA,
        )
        try {
            context.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection,
                "${MediaStore.Video.Media.DURATION} >= ?",
                arrayOf("1000"),
                "${MediaStore.Video.Media.DATE_ADDED} DESC",
            )?.use { c ->
                while (c.moveToNext()) {
                    val name = c.getString(1).orEmpty()
                    val path = c.getString(9).orEmpty()
                    val added = c.getLong(6) * 1000
                    val taken = c.getLong(7)
                    out += build(
                        id = c.getLong(0),
                        name = name,
                        path = path,
                        durationMs = c.getLong(2),
                        size = c.getLong(3),
                        width = c.getInt(4),
                        height = c.getInt(5),
                        addedAt = added,
                        takenAt = if (taken > 0) taken else added,
                        mime = c.getString(8).orEmpty(),
                    )
                }
            }
        } catch (_: Exception) {
            // sin acceso o MediaStore ocupado: se devuelve lo que haya
        }
        cached = out
        cachedAt = now
        return out
    }

    fun find(context: Context, id: Long): PhoneVideo? =
        list(context).firstOrNull { it.id == id } ?: list(context, force = true).firstOrNull { it.id == id }

    private fun build(
        id: Long, name: String, path: String, durationMs: Long, size: Long, width: Int, height: Int,
        addedAt: Long, takenAt: Long, mime: String,
    ): PhoneVideo {
        val ext = name.substringAfterLast('.', "").lowercase()
        val base = name.substringBeforeLast('.', name)
        val parsed = if (VideoNames.isCameraName(base)) {
            ParsedVideoName("movie", cameraTitle(base, takenAt))
        } else {
            // Ruta relativa al almacenamiento: «/storage/emulated/0/Movies/Dark/S01E02.mkv» → «Movies/Dark/S01E02.mkv».
            val rel = path.replace(Regex("^/(?:storage/[^/]+|sdcard)/"), "").ifEmpty { name }
            VideoNames.parse(rel)
        }
        return PhoneVideo(
            id = id,
            kind = parsed.kind,
            title = parsed.title.ifEmpty { if (parsed.kind == "movie") base else "" },
            series = parsed.series,
            seriesKey = if (parsed.series.isNotEmpty()) VideoNames.seriesKey(parsed.series) else "",
            season = parsed.season,
            episode = parsed.episode,
            year = parsed.year,
            durationMs = durationMs,
            size = size,
            addedAt = addedAt,
            width = width,
            height = height,
            mime = mime,
            ext = ext,
        )
    }

    /** «VID_20240312_183015» → «Video del 12 mar 2024, 18:30». */
    private fun cameraTitle(base: String, takenAt: Long): String {
        val date = SimpleDateFormat("d MMM yyyy, HH:mm", Locale("es")).format(Date(takenAt)).replace(".", "")
        return "${VideoNames.cameraLabel(base)} del $date"
    }

    fun payload(context: Context): JSONObject {
        val items = JSONArray()
        for (v in list(context)) {
            items.put(
                JSONObject()
                    .put("id", v.tvId)
                    .put("kind", v.kind)
                    .put("title", v.title)
                    .put("series", v.series)
                    .put("seriesKey", v.seriesKey)
                    .put("season", v.season)
                    .put("episode", v.episode)
                    .put("year", v.year)
                    .put("durationMs", v.durationMs)
                    .put("size", v.size)
                    .put("addedAt", v.addedAt)
                    .put("width", v.width)
                    .put("height", v.height)
                    .put("vcodec", "")
                    .put("langs", JSONArray())
                    .put("subs", 0),
            )
        }
        return JSONObject().put("enabled", true).put("scanning", false).put("count", items.length()).put("items", items)
    }

    // ───────────────────────────── Compatibilidad con la TV ─────────────────────────────

    fun probe(context: Context, id: Long): VideoProbe {
        val ex = MediaExtractor()
        return try {
            ex.setDataSource(context, uriFor(id), null)
            var video: String? = null
            var w = 0
            var h = 0
            var channels = 0
            val audio = ArrayList<String>()
            for (i in 0 until ex.trackCount) {
                val f = ex.getTrackFormat(i)
                val mime = f.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("video/") && video == null) {
                    video = mime
                    if (f.containsKey(MediaFormat.KEY_WIDTH)) w = f.getInteger(MediaFormat.KEY_WIDTH)
                    if (f.containsKey(MediaFormat.KEY_HEIGHT)) h = f.getInteger(MediaFormat.KEY_HEIGHT)
                } else if (mime.startsWith("audio/")) {
                    audio += mime
                    if (channels == 0 && f.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                }
            }
            VideoProbe(video, w, h, audio, channels)
        } catch (_: Exception) {
            VideoProbe()
        } finally {
            try {
                ex.release()
            } catch (_: Exception) {
            }
        }
    }

    private fun videoKey(mime: String) = when (mime) {
        "video/avc" -> "h264"
        "video/hevc", "video/dolby-vision" -> "hevc"
        "video/x-vnd.on2.vp9" -> "vp9"
        "video/x-vnd.on2.vp8" -> "vp8"
        "video/av01" -> "av1"
        "video/mp4v-es" -> "mpeg4"
        "video/3gpp" -> "h263"
        else -> mime.removePrefix("video/")
    }

    private fun audioKey(mime: String) = when {
        mime == "audio/mp4a-latm" -> "aac"
        mime == "audio/ac3" -> "ac3"
        mime.startsWith("audio/eac3") -> "eac3"
        mime == "audio/mpeg" -> "mp3"
        mime == "audio/opus" -> "opus"
        mime == "audio/vorbis" -> "vorbis"
        mime == "audio/flac" -> "flac"
        mime.contains("dts") -> "dts"
        mime.contains("truehd") -> "truehd"
        mime == "audio/raw" -> "pcm"
        else -> mime.removePrefix("audio/")
    }

    private fun containerKey(ext: String) = when (ext) {
        "mp4", "m4v", "3gp", "3g2" -> "mp4"
        "ts", "mts", "m2ts" -> "ts"
        else -> ext
    }

    private class Caps(val v: Set<String>, val a: Set<String>, val c: Set<String>)

    private fun parseCaps(raw: String): Caps {
        val v = HashSet<String>()
        val a = HashSet<String>()
        val c = HashSet<String>()
        for (token in raw.split(',')) {
            val kind = token.trim().lowercase().substringBefore('.', "")
            val name = token.trim().lowercase().substringAfter('.', "")
            if (name.isEmpty()) continue
            when (kind) {
                "v" -> v += name
                "a" -> a += name
                "c" -> c += name
            }
        }
        if (v.isEmpty()) v += "h264"
        if (a.isEmpty()) {
            a += "aac"
            a += "mp3"
        }
        if (c.isEmpty()) c += "mp4"
        return Caps(v, a, c)
    }

    private fun channelsLabel(n: Int) = when {
        n <= 1 -> "mono"
        n == 2 -> "estéreo"
        n == 6 -> "5.1"
        n == 8 -> "7.1"
        else -> "$n canales"
    }

    /** Respuesta de «/video/<id>/play»: siempre reproducción directa, con el aviso de compatibilidad. */
    fun plan(context: Context, video: PhoneVideo, capsRaw: String, token: String): JSONObject {
        val caps = parseCaps(capsRaw)
        val p = probe(context, video.id)
        val vKey = p.video?.let { videoKey(it) }
        val aKey = p.audio.firstOrNull()?.let { audioKey(it) }
        val reasons = ArrayList<String>()
        if (vKey != null && vKey !in caps.v) reasons += "video ${vKey.uppercase()} no compatible"
        if (aKey != null && aKey !in caps.a && aKey != "pcm" && aKey != "vorbis") reasons += "audio ${aKey.uppercase()} no compatible"
        if (containerKey(video.ext) !in caps.c) reasons += "contenedor ${containerKey(video.ext).uppercase()} no compatible"

        val height = if (p.height > 0) p.height else video.height
        val info = listOfNotNull(
            when {
                height >= 2160 -> "4K"
                height > 0 -> "${height}p"
                else -> null
            },
            vKey?.uppercase(),
            aKey?.let { "${it.uppercase()} ${channelsLabel(p.channels)}" },
        ).joinToString(" · ")

        val title = if (video.kind == "movie") {
            if (video.year > 0) "${video.title} (${video.year})" else video.title
        } else {
            "${video.series} · T${video.season} E${video.episode}${if (video.title.isNotEmpty()) " · ${video.title}" else ""}"
        }
        return JSONObject()
            .put("id", video.tvId)
            .put("title", title)
            .put("mode", "direct")
            .put("reason", if (reasons.isEmpty()) "Reproducción directa" else reasons.joinToString(", "))
            .put("url", "/pipo/video/${Uri.encode(video.tvId)}/file?t=${Uri.encode(token)}")
            .put("startAt", 0)
            .put("durationMs", video.durationMs)
            .put("container", "native")
            .put("audioIndex", 0)
            .put("audio", JSONArray())
            .put("subs", JSONArray())
            .put("info", info)
    }

    fun mimeFor(video: PhoneVideo): String {
        if (video.mime.startsWith("video/")) return video.mime
        return when (video.ext) {
            "mkv" -> "video/x-matroska"
            "webm" -> "video/webm"
            "avi" -> "video/x-msvideo"
            "mov" -> "video/quicktime"
            "ts", "mts", "m2ts" -> "video/mp2t"
            "3gp" -> "video/3gpp"
            else -> "video/mp4"
        }
    }

    // ───────────────────────────── Miniaturas ─────────────────────────────

    /** Imagen JPEG del video (la misma sirve de carátula y de miniatura). Se guarda en caché. */
    fun thumbnail(context: Context, id: Long): ByteArray? {
        val dir = File(context.cacheDir, THUMB_DIR).apply { mkdirs() }
        val file = File(dir, "$id.jpg")
        try {
            if (file.isFile && file.length() > 0) return file.readBytes()
        } catch (_: Exception) {
        }
        val bitmap = loadBitmap(context, id) ?: return null
        val bytes = ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 82, out)
            out.toByteArray()
        }
        try {
            file.writeBytes(bytes)
        } catch (_: Exception) {
        }
        return bytes
    }

    private fun loadBitmap(context: Context, id: Long): Bitmap? {
        val uri = uriFor(id)
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                return context.contentResolver.loadThumbnail(uri, Size(640, 360), null)
            } catch (_: Exception) {
                // se intenta con un fotograma del video
            }
        }
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(context, uri)
            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val frame = retriever.getFrameAtTime((durationMs / 10) * 1000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: return null
            if (frame.width <= 640) frame else Bitmap.createScaledBitmap(frame, 640, (frame.height * 640f / frame.width).toInt().coerceAtLeast(1), true)
        } catch (_: Exception) {
            null
        } finally {
            try {
                retriever.release()
            } catch (_: Exception) {
            }
        }
    }
}
