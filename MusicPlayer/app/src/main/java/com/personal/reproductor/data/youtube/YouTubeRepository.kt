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
import org.schabi.newpipe.extractor.playlist.PlaylistInfo
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import org.schabi.newpipe.extractor.linkhandler.SearchQueryHandler
import org.schabi.newpipe.extractor.services.youtube.YoutubeParsingHelper
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.StreamType
import org.schabi.newpipe.extractor.stream.VideoStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
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
    class DownloadSource(val url: String, val extension: String, val contentLength: Long, val videoId: String? = null)

    /** Una calidad de video. [videoOnly]: sin audio (hay que combinarla con la pista de audio). */
    class VideoRendition(
        val height: Int,
        val fps: Int,
        val codec: String,
        val bitrate: Int,
        val videoOnly: Boolean,
        val source: DownloadSource,
    )

    /**
     * Lo que ofrece YouTube para ver un video: calidades de solo imagen (hasta 1080p, para combinar con
     * [audio]) y calidades con audio incluido (normalmente 360p), todas en MP4/H.264.
     */
    class VideoOptions(
        val videoId: String,
        val title: String,
        val durationMs: Long,
        val adaptive: List<VideoRendition>,
        val muxed: List<VideoRendition>,
        /** El mejor audio para el teléfono (ExoPlayer entiende M4A y WebM/Opus). */
        val audio: DownloadSource?,
        /** Audio M4A/AAC (el que cualquier TV entiende), si YouTube lo ofrece. */
        val audioM4a: DownloadSource? = null,
        /** Audio WebM/Opus, si YouTube lo ofrece (a veces es el único). */
        val audioWebm: DownloadSource? = null,
    )

    private class CachedVideo(val options: VideoOptions, val expiresAt: Long)

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var initialized = false
    private val urlCache = ConcurrentHashMap<String, CachedStream>()
    private val videoCache = ConcurrentHashMap<String, CachedVideo>()
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

    // ------------------------------------------------------------------ canciones parecidas (radio)

    private class CachedRadio(val tracks: List<Track>, val at: Long)

    private val radioCache = ConcurrentHashMap<String, CachedRadio>()

    /**
     * Canciones parecidas a [seed] para «Inicio»: la radio de YouTube Music (lo que suena después en
     * YouTube Music). Si la canción es del teléfono, primero se busca en YouTube Music por artista y
     * título. Respaldo: la mezcla de YouTube y luego los videos relacionados.
     */
    suspend fun radio(seed: Track): List<Track> = withContext(Dispatchers.IO) {
        val key = (seed.remoteId ?: "${seed.artist}|${seed.title}").lowercase()
        val cached = radioCache[key]
        if (cached != null && System.currentTimeMillis() - cached.at < 12 * 3600_000L) return@withContext cached.tracks
        ensureInit()
        val videoId = seed.remoteId
            ?: search("${seed.artist} ${seed.title}".trim(), "music_songs").tracks.firstOrNull()?.remoteId
            ?: return@withContext cached?.tracks.orEmpty()
        fun attempt(name: String, block: () -> List<Track>): List<Track> = try {
            block()
        } catch (e: Exception) {
            YouTubeLog.add("Radio", "$videoId $name: ${e.javaClass.simpleName} ${e.message.orEmpty().take(120)}")
            emptyList()
        }
        var tracks = attempt("YouTube Music") { radioMusic(videoId) }
        if (tracks.size < 3) tracks = attempt("mezcla") {
            PlaylistInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId&list=RD$videoId")
                .relatedItems.mapNotNull { item -> toTrack(item)?.let { cleanVideo(it, item) } }
        }
        if (tracks.size < 3) tracks = attempt("relacionados") {
            StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
                .relatedItems.mapNotNull { item -> toTrack(item)?.let { cleanVideo(it, item) } }
        }
        tracks = tracks.filter { it.remoteId != videoId }.distinctBy { it.id }.take(25)
        if (tracks.isEmpty()) return@withContext cached?.tracks.orEmpty()
        radioCache[key] = CachedRadio(tracks, System.currentTimeMillis())
        YouTubeLog.add("Radio", "$videoId: ${tracks.size} canciones parecidas")
        tracks
    }

    private fun cleanVideo(t: Track, item: InfoItem): Track {
        val (artist, title) = RadioParser.splitVideoTitle(item.name.orEmpty(), (item as? StreamInfoItem)?.uploaderName.orEmpty())
        return t.copy(title = title.ifBlank { t.title }, artist = artist.ifBlank { t.artist })
    }

    private fun radioMusic(videoId: String): List<Track> {
        val body = JSONObject()
            .put("context", JSONObject().put("client", JSONObject().put("clientName", "WEB_REMIX").put("clientVersion", WEB_REMIX_VERSION).put("hl", "es").put("gl", "CO")))
            .put("videoId", videoId)
            .put("playlistId", "RDAMVM$videoId")
            .put("isAudioOnly", true)
            .put("enablePersistentPlaylistPanel", true)
            .put("tunerSettingValue", "AUTOMIX_SETTING_NORMAL")
        val request = okhttp3.Request.Builder()
            .url("https://music.youtube.com/youtubei/v1/next?prettyPrint=false")
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .header("User-Agent", PipoDownloader.USER_AGENT)
            .header("Origin", "https://music.youtube.com")
            .header("Referer", "https://music.youtube.com/")
            .header("X-YouTube-Client-Name", "67")
            .header("X-YouTube-Client-Version", WEB_REMIX_VERSION)
            .build()
        val text = client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("YouTube Music respondió ${response.code}")
            response.body?.string().orEmpty()
        }
        return RadioParser.parse(JSONObject(text))
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
        urlCache.remove(videoId + TV_SUFFIX)
        videoCache.remove(videoId)
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
    fun resolveForDownload(videoId: String): DownloadSource = sourceOf(videoId, bestStream(videoId))

    /**
     * Audio para la TV: se prefiere M4A (AAC), que cualquier televisor reproduce. Bloqueante.
     */
    fun resolveForTv(videoId: String): DownloadSource = sourceOf(videoId, bestStream(videoId, preferM4a = true))

    private fun sourceOf(videoId: String, stream: CachedStream): DownloadSource {
        val clen = Uri.parse(stream.url).getQueryParameter("clen")?.toLongOrNull() ?: -1L
        val extension = when (stream.formatName) {
            "M4A" -> "m4a"
            "WEBMA", "WEBMA_OPUS" -> "webm"
            "MP3" -> "mp3"
            else -> "audio"
        }
        return DownloadSource(stream.url, extension, clen, videoId)
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

    /**
     * Lee los bytes [start]..[endInclusive] del archivo como un flujo, pidiendo a YouTube fragmentos de 1 MB
     * (igual que la descarga) a medida que se consumen. Lo usan el servidor de la TV y el visor de video.
     * Si YouTube rechaza la dirección se prueban otras formas de identificarse y, si nada sirve, se
     * olvida y el error llega a quien lee.
     */
    fun openRange(source: DownloadSource, start: Long, endInclusive: Long): RangeStream =
        RangeStream(source, start, endInclusive)

    inner class RangeStream(
        private val source: DownloadSource,
        start: Long,
        private val endInclusive: Long,
    ) : InputStream() {
        private var position = start
        private var buffer = ByteArray(0)
        private var offset = 0
        private var finished = false

        /** Pide ya el primer fragmento: así un rechazo de YouTube se detecta antes de contestarle a la TV. */
        fun prefetch() {
            if (offset >= buffer.size && !finished && position <= endInclusive) fetch()
        }

        override fun read(): Int {
            val one = ByteArray(1)
            return if (read(one, 0, 1) == -1) -1 else one[0].toInt() and 0xff
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (len == 0) return 0
            while (offset >= buffer.size) {
                if (finished || position > endInclusive) return -1
                fetch()
                if (buffer.isEmpty()) {
                    finished = true
                    return -1
                }
            }
            val n = minOf(len, buffer.size - offset)
            System.arraycopy(buffer, offset, b, off, n)
            offset += n
            return n
        }

        private fun fetch() {
            val last = minOf(position + CHUNK_BYTES - 1, endInclusive)
            val wanted = last - position + 1
            val bytes = fetchChunk(source, position, last)
            buffer = bytes
            offset = 0
            position += bytes.size
            if (bytes.size < wanted) finished = true
        }
    }

    /** Qué forma de identificarse funcionó con cada dirección (0 = la de siempre). */
    private val workingProfile = ConcurrentHashMap<String, Int>()

    private fun profileRequest(url: String, profile: Int): okhttp3.Request.Builder {
        val builder = okhttp3.Request.Builder().url(url)
        when (profile) {
            0 -> {
                builder.post(POST_BODY.toRequestBody())
                streamingHeaders(url).forEach { (name, value) -> builder.header(name, value) }
            }
            1 -> builder.get().header("User-Agent", IOS_USER_AGENT)
            else -> builder.get().header("User-Agent", ANDROID_USER_AGENT)
        }
        return builder
    }

    /**
     * Pide los bytes [from]..[to]. Cada tipo de dirección de YouTube espera que quien la pide se
     * identifique de una forma distinta (navegador, iPhone, Android): si responde con rechazo
     * (400/401/403/404/410) se prueba con las otras y se recuerda la que funcionó.
     */
    private fun fetchChunk(source: DownloadSource, from: Long, to: Long): ByteArray {
        val first = workingProfile[source.url] ?: 0
        var code = 0
        for (k in 0 until PROFILES) {
            val profile = (first + k) % PROFILES
            val url = source.url + "&range=" + from + "-" + to + "&rn=" + requestNumber.getAndIncrement()
            val bytes = client.newCall(profileRequest(url, profile).build()).execute().use { response ->
                if (response.isSuccessful) {
                    response.body?.bytes() ?: ByteArray(0)
                } else {
                    code = response.code
                    null
                }
            }
            if (bytes != null) {
                val previous = workingProfile.put(source.url, profile)
                if (profile != 0 && previous != profile) YouTubeLog.add("YouTube", "modo $profile aceptado por YouTube")
                return bytes
            }
            YouTubeLog.add("YouTube", "rechazó con $code (modo $profile, bytes $from-$to)")
            if (code !in RETRY_CODES) break
        }
        source.videoId?.let { invalidate(it) }
        throw IOException("YouTube respondió $code")
    }

    // ------------------------------------------------------------------ video

    /** Calidades de video disponibles (bloqueante: llamar fuera del hilo principal). */
    fun videoOptions(videoId: String): VideoOptions {
        videoCache[videoId]?.let { if (it.expiresAt > SystemClock.elapsedRealtime()) return it.options }
        // Si ya se está consultando este video (p. ej. el teléfono lo preparó al pulsar «Ver en la TV»),
        // se espera a esa consulta en vez de repetirla.
        synchronized(videoLocks.getOrPut(videoId) { Any() }) {
            videoCache[videoId]?.let { if (it.expiresAt > SystemClock.elapsedRealtime()) return it.options }
            return extractVideoOptions(videoId)
        }
    }

    private val videoLocks = ConcurrentHashMap<String, Any>()

    private fun extractVideoOptions(videoId: String): VideoOptions {
        val now = SystemClock.elapsedRealtime()
        ensureInit()
        YouTubeLog.add("YouTube", "$videoId: consultando a YouTube…")
        val info = try {
            StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
        } catch (e: Exception) {
            YouTubeLog.add("YouTube", "$videoId: YouTube falló tras ${SystemClock.elapsedRealtime() - now} ms (${e.javaClass.simpleName}: ${e.message})")
            throw e
        }
        YouTubeLog.add("YouTube", "$videoId: YouTube respondió en ${SystemClock.elapsedRealtime() - now} ms")

        fun rendition(s: VideoStream): VideoRendition {
            val clen = Uri.parse(s.content).getQueryParameter("clen")?.toLongOrNull() ?: -1L
            return VideoRendition(
                height = s.height,
                fps = s.fps,
                codec = s.codec.orEmpty(),
                bitrate = s.bitrate,
                videoOnly = s.isVideoOnly,
                source = DownloadSource(s.content, "mp4", clen, videoId),
            )
        }

        fun usable(s: VideoStream) =
            s.isUrl && s.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && !s.content.isNullOrBlank() &&
                s.format == MediaFormat.MPEG_4 && s.height > 0

        // Una por altura (la de más bitrate); en MP4 con H.264 para que cualquier TV o teléfono la entienda.
        fun best(list: List<VideoStream>, h264Only: Boolean): List<VideoRendition> =
            list.filter { usable(it) && (!h264Only || it.codec.orEmpty().startsWith("avc1")) }
                .groupBy { it.height }
                .map { (_, group) -> group.maxWithOrNull(compareBy<VideoStream>({ it.bitrate }, { it.fps }))!! }
                .sortedBy { it.height }
                .map { rendition(it) }

        val onlyVideo = info.videoOnlyStreams.orEmpty()
        val withAudio = info.videoStreams.orEmpty()
        val adaptive = best(onlyVideo, h264Only = true).filter { it.height <= MAX_VIDEO_HEIGHT && it.source.contentLength > 0 }
        val muxed = best(withAudio, h264Only = false)
        fun kinds(list: List<VideoStream>) = list.groupingBy { it.deliveryMethod.name + "/" + (it.format?.name ?: "?") }.eachCount().toString()
        YouTubeLog.add(
            "YouTube",
            "$videoId: solo imagen ${onlyVideo.size} ${kinds(onlyVideo)}, con audio ${withAudio.size} ${kinds(withAudio)}; " +
                "usables: adaptativo ${adaptive.size}, con audio ${muxed.size}",
        )
        if (adaptive.isEmpty() && muxed.isEmpty()) {
            throw IOException("YouTube no ofreció video MP4/H.264 para este contenido (solo imagen ${onlyVideo.size}, con audio ${withAudio.size}).")
        }
        val audio = try {
            sourceOf(videoId, pickAudio(videoId, info, preferM4a = true, now = now))
        } catch (_: Exception) {
            null
        }
        // Las dos variantes de audio por separado: la TV elige la que entiende.
        val progressiveAudio = info.audioStreams.orEmpty().filter {
            it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && !it.content.isNullOrBlank()
        }
        val originalAudio = progressiveAudio.filter { s -> s.audioTrackType?.name.let { it == null || it == "ORIGINAL" } }.ifEmpty { progressiveAudio }
        fun bestAudio(formats: Set<MediaFormat>, extension: String): DownloadSource? {
            val best = originalAudio.filter { it.format in formats }.maxByOrNull { bitrateOf(it) } ?: return null
            val clen = Uri.parse(best.content).getQueryParameter("clen")?.toLongOrNull() ?: -1L
            return DownloadSource(best.content, extension, clen, videoId)
        }
        val audioM4a = bestAudio(setOf(MediaFormat.M4A), "m4a")
        val audioWebm = bestAudio(setOf(MediaFormat.WEBMA_OPUS, MediaFormat.WEBMA), "webm")
        YouTubeLog.add(
            "YouTube",
            "$videoId: audio ${info.audioStreams.orEmpty().groupingBy { it.deliveryMethod.name + "/" + (it.format?.name ?: "?") }.eachCount()}; " +
                "M4A ${if (audioM4a != null) "sí" else "no"}, Opus ${if (audioWebm != null) "sí" else "no"}",
        )
        val options = VideoOptions(
            videoId = videoId,
            title = info.name.orEmpty(),
            durationMs = info.duration.coerceAtLeast(0L) * 1000L,
            adaptive = adaptive,
            muxed = muxed,
            audio = audio,
            audioM4a = audioM4a,
            audioWebm = audioWebm,
        )
        videoCache[videoId] = CachedVideo(options, now + URL_TTL_MS)
        return options
    }

    private fun resolveStreamUrl(videoId: String): String = bestStream(videoId).url

    private fun bestStream(videoId: String, preferM4a: Boolean = false): CachedStream {
        val now = SystemClock.elapsedRealtime()
        val key = if (preferM4a) videoId + TV_SUFFIX else videoId
        urlCache[key]?.let { if (it.expiresAt > now) return it }
        ensureInit()
        val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$videoId")
        return pickAudio(videoId, info, preferM4a, now)
    }

    /** Elige el mejor audio de [info] y lo guarda en caché. */
    private fun pickAudio(videoId: String, info: StreamInfo, preferM4a: Boolean, now: Long): CachedStream {
        val key = if (preferM4a) videoId + TV_SUFFIX else videoId
        val candidates = info.audioStreams.filter {
            it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP && !it.content.isNullOrBlank()
        }
        // Preferir la pista de audio original (no dobladas) si el video tiene varias.
        val originals = candidates.filter { s -> s.audioTrackType?.name.let { it == null || it == "ORIGINAL" } }
            .ifEmpty { candidates }
        // Para la TV: M4A (AAC) si existe; si no, el mejor disponible.
        val pool = if (preferM4a) originals.filter { it.format == MediaFormat.M4A }.ifEmpty { originals } else originals
        val best = pool.maxWithOrNull(
            compareBy<AudioStream>({ bitrateOf(it) }, { if (it.format == MediaFormat.M4A) 1 else 0 }),
        ) ?: throw IOException("YouTube no ofreció audio para este video")
        Log.i(TAG, "Audio $videoId: ${best.format} ${bitrateOf(best)} bps")
        val cached = CachedStream(best.content, best.format?.name, now + URL_TTL_MS)
        urlCache[key] = cached
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

    companion object {
        private const val WEB_REMIX_VERSION = "1.20260707.12.00"

        /** Tipo MIME según la extensión elegida por [resolveForDownload] / [resolveForTv]. */
        fun mimeFor(extension: String): String = when (extension) {
            "m4a" -> "audio/mp4"
            "webm" -> "audio/webm"
            "mp3" -> "audio/mpeg"
            else -> "audio/mp4"
        }

        private const val TV_SUFFIX = "#tv"
        const val TAG = "YouTube"
        const val YOUTUBE_BASE_URL = "https://www.youtube.com"
        const val URL_TTL_MS = 90L * 60L * 1000L
        const val CHUNK_BYTES = 1_048_576L
        const val MAX_VIDEO_HEIGHT = 1080
        private const val PROFILES = 3
        private val RETRY_CODES = setOf(400, 401, 403, 404, 410)
        private const val IOS_USER_AGENT = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)"
        private const val ANDROID_USER_AGENT = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"
        val POST_BODY = byteArrayOf(0x78, 0)
    }
}
