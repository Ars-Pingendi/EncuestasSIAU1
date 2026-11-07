package com.personal.reproductor.data.youtube

import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.media3.datasource.DataSpec
import com.personal.reproductor.data.Track
import com.personal.reproductor.data.YOUTUBE_URI_SCHEME
import com.personal.reproductor.data.youTubeTrack
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.Image
import org.schabi.newpipe.extractor.InfoItem
import org.schabi.newpipe.extractor.MediaFormat
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.Page
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.search.SearchInfo
import org.schabi.newpipe.extractor.linkhandler.SearchQueryHandler
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.StreamType
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Búsqueda y reproducción de YouTube sin anuncios, con NewPipeExtractor:
 * se obtiene directamente el audio del video, así que los anuncios nunca se cargan.
 * No usa ninguna cuenta de Google.
 */
class YouTubeRepository {

    /** Página de resultados; guarda lo necesario para pedir la siguiente. */
    class SearchPage internal constructor(
        val tracks: List<Track>,
        internal val handler: SearchQueryHandler,
        internal val next: Page?,
    ) {
        val hasMore: Boolean get() = next != null
    }

    private class CachedStream(val url: String, val formatName: String?, val expiresAt: Long)

    /** Audio listo para descargar. [contentLength] es -1 si YouTube no lo indica. */
    class DownloadSource(val url: String, val extension: String, val contentLength: Long)

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var initialized = false
    private val urlCache = ConcurrentHashMap<String, CachedStream>()
    private val requestNumber = AtomicInteger(0)

    private fun ensureInit() {
        if (initialized) return
        synchronized(this) {
            if (!initialized) {
                NewPipe.init(PipoDownloader(client), Localization("es", "CO"), ContentCountry("CO"))
                initialized = true
            }
        }
    }

    // ------------------------------------------------------------------ búsqueda

    /** [filter]: "music_songs" (YouTube Music) o "videos". */
    suspend fun search(query: String, filter: String): SearchPage = withContext(Dispatchers.IO) {
        ensureInit()
        val yt = ServiceList.YouTube
        val handler = yt.searchQHFactory.fromQuery(query, listOf(filter), "")
        val info = SearchInfo.getInfo(yt, handler)
        SearchPage(
            tracks = info.relatedItems.mapNotNull { toTrack(it) }.distinctBy { it.id },
            handler = handler,
            next = if (info.hasNextPage()) info.nextPage else null,
        )
    }

    suspend fun more(previous: SearchPage): SearchPage = withContext(Dispatchers.IO) {
        val next = previous.next ?: return@withContext SearchPage(emptyList(), previous.handler, null)
        ensureInit()
        val page = SearchInfo.getMoreItems(ServiceList.YouTube, previous.handler, next)
        SearchPage(
            tracks = page.items.mapNotNull { toTrack(it) }.distinctBy { it.id },
            handler = previous.handler,
            next = if (page.hasNextPage()) page.nextPage else null,
        )
    }

    private fun toTrack(item: InfoItem): Track? {
        if (item !is StreamInfoItem) return null
        val type = item.streamType
        if (type == StreamType.LIVE_STREAM || type == StreamType.AUDIO_LIVE_STREAM) return null
        val videoId = try {
            ServiceList.YouTube.streamLHFactory.getId(item.url)
        } catch (e: Exception) {
            return null
        }
        return youTubeTrack(
            videoId = videoId,
            title = item.name.orEmpty(),
            artist = item.uploaderName.orEmpty(),
            durationMs = item.duration.coerceAtLeast(0L) * 1000L,
            artworkUrl = bestThumbnail(item.thumbnails),
        )
    }

    private fun bestThumbnail(images: List<Image>): String? {
        val valid = images.filter { !it.url.isNullOrBlank() }
        val good = valid.filter { it.height in 1..600 }.maxByOrNull { it.height }
        return (good ?: valid.maxByOrNull { it.height } ?: valid.firstOrNull())?.url
    }

    // ------------------------------------------------------------------ reproducción

    /**
     * Convierte un enlace interno `pipoyt://VIDEO_ID` en la petición real al servidor de audio de YouTube.
     * Lo llama ExoPlayer en su hilo de carga (no en el hilo principal), justo antes de descargar.
     */
    fun resolveDataSpec(dataSpec: DataSpec): DataSpec {
        val uri = dataSpec.uri
        if (uri.scheme != YOUTUBE_URI_SCHEME) return dataSpec
        val videoId = uri.authority ?: throw IOException("Enlace de YouTube inválido")
        val streamUrl = try {
            resolveStreamUrl(videoId)
        } catch (e: IOException) {
            throw e
        } catch (e: Exception) {
            throw IOException("No se pudo obtener el audio de YouTube", e)
        }

        // Igual que NewPipe: contador "rn" en la URL, POST con un cuerpo mínimo y cabeceras del cliente.
        val url = if (streamUrl.contains("/videoplayback")) {
            streamUrl + "&rn=" + requestNumber.getAndIncrement()
        } else {
            streamUrl
        }
        val headers = streamingHeaders(url)

        return dataSpec.buildUpon()
            .setUri(Uri.parse(url))
            .setHttpMethod(DataSpec.HTTP_METHOD_POST)
            .setHttpBody(POST_BODY)
            .build()
            .withAdditionalHeaders(headers)
    }

    /** Olvida la URL guardada (p. ej. si caducó y dio error). */
    fun invalidate(videoId: String) {
        urlCache.remove(videoId)
    }

    /** Cabeceras que espera el servidor de audio de YouTube según el cliente que generó la URL. */
    private fun streamingHeaders(url: String): Map<String, String> {
        val headers = HashMap<String, String>()
        headers["User-Agent"] = if (YoutubeParsingHelper.isVisionOsStreamingUrl(url)) {
            YoutubeParsingHelper.getVisionOsUserAgent(null)
        } else {
            PipoDownloader.USER_AGENT
        }
        if (YoutubeParsingHelper.isWebStreamingUrl(url)) {
            headers["Origin"] = YOUTUBE_BASE_URL
            headers["Referer"] = YOUTUBE_BASE_URL
            headers["Sec-Fetch-Dest"] = "empty"
            headers["Sec-Fetch-Mode"] = "cors"
            headers["Sec-Fetch-Site"] = "cross-site"
        }
        headers["TE"] = "trailers"
        return headers
    }

    // ------------------------------------------------------------------ descarga

    /** Elige el mejor audio del video para descargarlo (bloqueante: llamar fuera del hilo principal). */
    fun resolveForDownload(videoId: String): DownloadSource {
        val stream = bestStream(videoId)
        val clen = Uri.parse(stream.url).getQueryParameter("clen")?.toLongOrNull() ?: -1L
        val extension = when (stream.formatName) {
            "M4A" -> "m4a"
            "WEBMA", "WEBMA_OPUS" -> "webm"
            "MP3" -> "mp3"
            else -> "audio"
        }
        return DownloadSource(stream.url, extension, clen)
    }

    /**
     * Descarga por fragmentos de 1 MB usando el parámetro "range" (como el reproductor de YouTube),
     * porque YouTube limita las descargas de un solo golpe. Bloqueante.
     */
    fun downloadTo(source: DownloadSource, out: File, onProgress: (Float?) -> Unit) {
        FileOutputStream(out).use { fos ->
            var position = 0L
            while (true) {
                val end = position + CHUNK_BYTES - 1
                val url = source.url + "&range=" + position + "-" + end + "&rn=" + requestNumber.getAndIncrement()
                val builder = okhttp3.Request.Builder().url(url).post(POST_BODY.toRequestBody())
                streamingHeaders(url).forEach { (name, value) -> builder.header(name, value) }
                val bytes = client.newCall(builder.build()).execute().use { response ->
                    if (!response.isSuccessful) throw IOException("YouTube respondió ${response.code}")
                    response.body?.bytes() ?: ByteArray(0)
                }
                fos.write(bytes)
                position += bytes.size
                onProgress(
                    if (source.contentLength > 0) (position.toFloat() / source.contentLength).coerceIn(0f, 1f) else null,
                )
                val finished = bytes.size < CHUNK_BYTES || (source.contentLength in 1..position)
                if (finished) break
            }
            if (position == 0L) throw IOException("YouTube no envió datos")
        }
    }

    private fun resolveStreamUrl(videoId: String): String = bestStream(videoId).url

    private fun bestStream(videoId: String): CachedStream {
        val now = SystemClock.elapsedRealtime()
        urlCache[videoId]?.let { if (it.expiresAt > now) return it }
        ensureInit()
        val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
        val candidates = info.audioStreams.filter {
            it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && !it.content.isNullOrBlank()
        }
        // Preferir la pista de audio original (no dobladas) si el video tiene varias.
        val originals = candidates.filter { s -> s.audioTrackType?.name.let { it == null || it == "ORIGINAL" } }
            .ifEmpty { candidates }
        val best = originals.maxWithOrNull(
            compareBy<AudioStream>({ bitrateOf(it) }, { if (it.format == MediaFormat.M4A) 1 else 0 }),
        ) ?: throw IOException("YouTube no ofreció audio para este video")
        Log.i(TAG, "Audio $videoId: ${best.format} ${bitrateOf(best)} bps")
        val cached = CachedStream(best.content, best.format?.name, now + URL_TTL_MS)
        urlCache[videoId] = cached
        return cached
    }

    private fun bitrateOf(s: AudioStream): Int = if (s.averageBitrate > 0) s.averageBitrate else s.bitrate

    fun describeError(e: Throwable): String = when (e) {
        is ReCaptchaException -> "YouTube pidió una verificación (captcha). Intenta de nuevo en un rato."
        is UnknownHostException, is ConnectException, is SocketTimeoutException ->
            "Sin conexión a internet o YouTube no respondió."
        else -> "No se pudo buscar en YouTube (${e.javaClass.simpleName}). Si sigue fallando, " +
            "puede que YouTube haya cambiado algo y la app necesite una actualización."
    }

    private companion object {
        const val TAG = "YouTube"
        const val YOUTUBE_BASE_URL = "https://www.youtube.com"
        const val URL_TTL_MS = 90L * 60L * 1000L
        const val CHUNK_BYTES = 1_048_576L
        val POST_BODY = byteArrayOf(0x78, 0)
    }
}
