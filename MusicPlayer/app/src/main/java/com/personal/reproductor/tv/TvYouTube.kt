package com.personal.reproductor.tv

import android.net.Uri
import com.personal.reproductor.ReproductorApp
import com.personal.reproductor.data.Track
import com.personal.reproductor.data.youtube.YouTubeRepository
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID

/**
 * YouTube para la app de la TV: el teléfono busca y entrega los videos («/pipo/yt/…»).
 * La TV nunca habla con YouTube: el teléfono es el puente (YouTube liga las direcciones al
 * equipo que las pidió y no permite CORS).
 */
object TvYouTube {
    private const val MAX_SESSIONS = 12

    /** Búsquedas con más páginas disponibles, para «Cargar más». */
    private val sessions = object : LinkedHashMap<String, YouTubeRepository.SearchPage>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, YouTubeRepository.SearchPage>?) =
            size > MAX_SESSIONS
    }

    private fun trackJson(t: Track): JSONObject =
        JSONObject()
            .put("id", "yt:${t.remoteId}")
            .put("title", t.title)
            .put("channel", t.artist)
            .put("durationMs", t.durationMs)
            .put("thumb", t.artworkUrl?.takeIf { it.startsWith("https://") } ?: JSONObject.NULL)

    /** [mode]: «videos» o «songs». [page]: la marca devuelta en «next» para pedir más. */
    fun search(app: ReproductorApp, query: String, mode: String, page: String?): JSONObject {
        val repo = app.youtube
        val result = runBlocking {
            if (page.isNullOrEmpty()) {
                repo.search(query, if (mode == "songs") "music_songs" else "videos")
            } else {
                val previous = synchronized(sessions) { sessions[page] } ?: throw IOException("La búsqueda caducó. Búscala de nuevo.")
                repo.more(previous)
            }
        }
        var next: String? = null
        if (result.hasMore) {
            next = UUID.randomUUID().toString().substring(0, 8)
            synchronized(sessions) { sessions[next] = result }
        }
        val items = JSONArray()
        result.tracks.forEach { items.put(trackJson(it)) }
        return JSONObject().put("items", items).put("next", next ?: JSONObject.NULL)
    }

    private fun path(videoId: String, kind: String, height: Int, token: String) =
        "/pipo/yt/${Uri.encode(videoId)}/$kind${if (height > 0) "/$height" else ""}?t=${Uri.encode(token)}"

    private fun label(height: Int) = if (height >= 2160) "4K" else "${height}p"

    /**
     * Respuesta de «/pipo/yt/<id>/play»: cómo ver el video en la TV.
     * «adaptive»: imagen y audio por separado (hasta 1080p) que la TV une; «url»: video con audio
     * incluido (360p), la reserva si lo anterior falla. [maxHeight]: calidad máxima pedida (0 = la mejor).
     */
    fun plan(app: ReproductorApp, videoId: String, token: String, maxHeight: Int, forceDirect: Boolean = false): JSONObject {
        val o = app.youtube.videoOptions(videoId)
        val audio = o.audio
        val canAdapt = !forceDirect && o.adaptive.isNotEmpty() && audio != null && audio.extension == "m4a"
        val muxed = o.muxed.lastOrNull()
        if (!canAdapt && muxed == null) throw IOException("YouTube no ofreció video para ver en la TV")

        val out = JSONObject()
            .put("id", "yt:$videoId")
            .put("title", o.title)
            .put("startAt", 0)
            .put("durationMs", o.durationMs)
            .put("container", "native")
            .put("audioIndex", 0)
            .put("audio", JSONArray())
            .put("subs", JSONArray())
            .put("url", if (muxed != null) path(videoId, "m", muxed.height, token) else "")

        if (!canAdapt) {
            return out.put("mode", "direct")
                .put("reason", "Video con audio de YouTube (${label(muxed!!.height)})")
                .put("info", "${label(muxed.height)} · H264")
        }
        val videos = JSONArray()
        var selected = 0
        o.adaptive.forEachIndexed { i, r ->
            videos.put(
                JSONObject()
                    .put("label", label(r.height))
                    .put("height", r.height)
                    .put("fps", r.fps)
                    .put("url", path(videoId, "v", r.height, token))
                    .put("mime", "video/mp4; codecs=\"${r.codec.ifEmpty { "avc1.640028" }}\"")
                    .put("bytes", r.source.contentLength),
            )
            if (maxHeight <= 0 || r.height <= maxHeight) selected = i
        }
        val adaptive = JSONObject()
            .put("audio", JSONObject().put("url", path(videoId, "a", 0, token)).put("mime", "audio/mp4; codecs=\"mp4a.40.2\"").put("bytes", audio!!.contentLength))
            .put("videos", videos)
            .put("selected", selected)
        val chosen = o.adaptive[selected]
        return out.put("mode", "adaptive")
            .put("reason", "Imagen y audio de YouTube por separado")
            .put("info", "${label(chosen.height)}${if (chosen.fps > 30) chosen.fps else ""} · H264 · AAC")
            .put("adaptive", adaptive)
    }

    /** Origen del archivo de una calidad concreta («v»: solo imagen, «m»: con audio, «a»: audio). */
    fun source(app: ReproductorApp, videoId: String, kind: String, height: Int): YouTubeRepository.DownloadSource? {
        val o = app.youtube.videoOptions(videoId)
        return when (kind) {
            "v" -> o.adaptive.firstOrNull { it.height == height }?.source
            "m" -> o.muxed.firstOrNull { it.height == height }?.source
            "a" -> o.audio
            else -> null
        }
    }
}
