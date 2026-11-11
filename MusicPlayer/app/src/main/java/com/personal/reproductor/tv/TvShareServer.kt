package com.personal.reproductor.tv

import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
import com.personal.reproductor.ReproductorApp
import com.personal.reproductor.data.Track
import com.personal.reproductor.data.TrackSharing
import com.personal.reproductor.data.YouTubeIds
import com.personal.reproductor.ui.ArtworkLoader
import fi.iki.elonen.NanoHTTPD
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream

/**
 * Servidor para la app Pipo de la TV LG (webOS): mismo protocolo que Pipo para Windows.
 * Solo lectura; la TV se empareja con un código de 4 cifras y recibe un token.
 *
 *  GET  /pipo/info            nombre del teléfono
 *  POST /pipo/pair            {"pin":"1234"} → {"token": …}
 *  GET  /pipo/library?t=…     canciones, listas y favoritos
 *  GET  /pipo/media/<id>?t=…  audio con soporte de rangos (para adelantar)
 *  GET  /pipo/art/<id>?t=…    carátula en JPEG
 */
class TvShareServer(private val context: Context, port: Int) : NanoHTTPD(port) {

    private val app = context.applicationContext as ReproductorApp
    private var failures = 0

    private fun deviceName(): String =
        Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME)?.takeIf { it.isNotBlank() }
            ?: "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"

    private fun versionName(): String =
        try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: ""
        } catch (_: Exception) {
            ""
        }

    private fun cors(r: Response): Response {
        r.addHeader("Access-Control-Allow-Origin", "*")
        r.addHeader("Access-Control-Allow-Headers", "Content-Type, Range, X-Pipo-Token")
        r.addHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
        return r
    }

    private fun json(status: Response.Status, body: JSONObject): Response =
        cors(newFixedLengthResponse(status, "application/json; charset=utf-8", body.toString()).apply {
            addHeader("Cache-Control", "no-store")
        })

    private fun error(status: Response.Status, message: String) = json(status, JSONObject().put("error", message))

    override fun serve(session: IHTTPSession): Response {
        return try {
            route(session)
        } catch (e: Exception) {
            error(Response.Status.INTERNAL_ERROR, e.message ?: e.javaClass.simpleName)
        }
    }

    private fun route(session: IHTTPSession): Response {
        if (session.method == Method.OPTIONS) return cors(newFixedLengthResponse(Response.Status.NO_CONTENT, "text/plain", ""))
        val parts = session.uri.split('/').filter { it.isNotEmpty() }
        if (parts.firstOrNull() != "pipo") return error(Response.Status.NOT_FOUND, "No encontrado")
        val route = parts.getOrNull(1).orEmpty()

        if (route == "info") {
            return json(Response.Status.OK, JSONObject().put("app", "pipo").put("name", deviceName()).put("version", versionName()))
        }

        if (route == "pair" && session.method == Method.POST) {
            val files = HashMap<String, String>()
            session.parseBody(files)
            val body = files["postData"].orEmpty()
            val pin = try {
                JSONObject(body).optString("pin").trim()
            } catch (_: Exception) {
                ""
            }
            synchronized(this) {
                if (pin.isNotEmpty() && pin == TvShare.pin(context)) {
                    failures = 0
                    val token = TvShare.addToken(context)
                    return json(Response.Status.OK, JSONObject().put("token", token).put("name", deviceName()))
                }
                // Tras varios intentos fallidos el código cambia (evita adivinarlo).
                if (++failures >= 8) {
                    failures = 0
                    TvShare.newPin(context)
                }
            }
            Thread.sleep(800)
            return error(Response.Status.FORBIDDEN, "Código incorrecto")
        }

        val token = session.parms["t"] ?: session.headers["x-pipo-token"].orEmpty()
        if (token.isEmpty() || token !in TvShare.tokens(context)) {
            return error(Response.Status.UNAUTHORIZED, "Empareja la TV de nuevo")
        }

        return when (route) {
            "library" -> json(Response.Status.OK, libraryPayload())
            "media" -> media(parts.drop(2).joinToString("/"), session.headers["range"])
            "art" -> artwork(parts.getOrNull(2).orEmpty())
            else -> error(Response.Status.NOT_FOUND, "No encontrado")
        }
    }

    // ───────────────────────────── Biblioteca ─────────────────────────────

    private fun localId(t: Track) = "a:${t.id}"

    private fun libraryPayload(): JSONObject = runBlocking {
        val library = app.library.state.value
        val downloaded = app.downloads.downloaded.value
        val remote = app.userData.remoteTracks.first().associateBy { it.videoId }

        val tracks = JSONArray()
        for (t in library.tracks) {
            tracks.put(
                JSONObject()
                    .put("id", localId(t))
                    .put("title", t.title)
                    .put("artist", t.artist)
                    .put("album", t.album)
                    .put("albumArtist", "")
                    .put("genre", t.genre)
                    .put("trackNo", t.trackNumber % 1000)
                    .put("discNo", t.trackNumber / 1000)
                    .put("year", t.year)
                    .put("durationMs", t.durationMs)
                    .put("folder", t.folderPath)
                    .put("addedAt", t.dateAddedSec * 1000)
                    .put("source", "local")
                    .put("art", "/pipo/art/${t.id}_${t.albumId}"),
            )
        }
        for (videoId in downloaded) {
            val r = remote[videoId] ?: continue
            tracks.put(
                JSONObject()
                    .put("id", "yt:$videoId")
                    .put("title", r.title)
                    .put("artist", r.artist)
                    .put("album", "YouTube")
                    .put("albumArtist", "")
                    .put("genre", "")
                    .put("trackNo", 0)
                    .put("discNo", 0)
                    .put("year", 0)
                    .put("durationMs", r.durationMs)
                    .put("folder", "YouTube")
                    .put("addedAt", r.updatedAt)
                    .put("source", "youtube")
                    .put("art", r.artworkUrl?.takeIf { it.startsWith("https://") } ?: JSONObject.NULL),
            )
        }

        // Ids que entiende la TV: «a:<id>» para la música del teléfono y «yt:<video>» para las descargas.
        fun tvId(trackId: Long, path: String): String? {
            val videoId = YouTubeIds.videoIdFromPath(path)
            if (videoId != null) return if (videoId in downloaded) "yt:$videoId" else null
            return library.resolve(trackId, path)?.let { localId(it) }
        }

        val playlists = JSONArray()
        val items = app.userData.playlistTracks.first().groupBy { it.playlistId }
        for (p in app.userData.playlists.first()) {
            val ids = JSONArray()
            items[p.id].orEmpty().sortedBy { it.position }.mapNotNull { tvId(it.trackId, it.path) }.forEach { ids.put(it) }
            playlists.put(JSONObject().put("id", p.id.toString()).put("name", p.name).put("trackIds", ids))
        }
        val favs = JSONArray()
        app.userData.favoriteTracks.first().sortedByDescending { it.addedAt }.mapNotNull { tvId(it.trackId, it.path) }.forEach { favs.put(it) }

        JSONObject()
            .put("name", deviceName())
            .put("version", versionName())
            .put("tracks", tracks)
            .put("playlists", playlists)
            .put("favTracks", favs)
    }

    // ───────────────────────────── Audio ─────────────────────────────

    private fun media(id: String, range: String?): Response {
        if (id.startsWith("yt:")) {
            val file = app.downloads.fileFor(id.removePrefix("yt:")) ?: return error(Response.Status.NOT_FOUND, "Canción no disponible")
            return ranged(FileInputStream(file), 0L, file.length(), TrackSharing.mimeFor(file.extension), range)
        }
        val trackId = id.removePrefix("a:").toLongOrNull() ?: return error(Response.Status.NOT_FOUND, "Canción no disponible")
        val uri = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, trackId)
        val afd = context.contentResolver.openAssetFileDescriptor(uri, "r") ?: return error(Response.Status.NOT_FOUND, "Canción no disponible")
        val size = if (afd.length >= 0) afd.length else afd.parcelFileDescriptor.statSize
        val track = app.library.state.value.tracksById[trackId]
        val mime = context.contentResolver.getType(uri) ?: TrackSharing.mimeFor(File(track?.path.orEmpty()).extension)
        return ranged(afd.createInputStream(), afd.startOffset, size, mime, range)
    }

    /** Respuesta completa o parcial (206) según la cabecera Range. */
    private fun ranged(input: FileInputStream, baseOffset: Long, size: Long, mime: String, range: String?): Response {
        val m = range?.let { Regex("bytes=(\\d*)-(\\d*)").find(it) }
        if (m != null && (m.groupValues[1].isNotEmpty() || m.groupValues[2].isNotEmpty())) {
            val start = if (m.groupValues[1].isNotEmpty()) m.groupValues[1].toLong() else maxOf(0L, size - m.groupValues[2].toLong())
            val end = if (m.groupValues[1].isNotEmpty() && m.groupValues[2].isNotEmpty()) minOf(m.groupValues[2].toLong(), size - 1) else size - 1
            if (start >= size || start > end) {
                input.close()
                return cors(newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, "text/plain", "").apply {
                    addHeader("Content-Range", "bytes */$size")
                })
            }
            input.channel.position(baseOffset + start)
            val r = newFixedLengthResponse(Response.Status.PARTIAL_CONTENT, mime, input, end - start + 1)
            r.addHeader("Content-Range", "bytes $start-$end/$size")
            r.addHeader("Accept-Ranges", "bytes")
            return cors(r)
        }
        input.channel.position(baseOffset)
        val r = newFixedLengthResponse(Response.Status.OK, mime, input, size)
        r.addHeader("Accept-Ranges", "bytes")
        return cors(r)
    }

    // ───────────────────────────── Carátulas ─────────────────────────────

    private fun artwork(key: String): Response {
        val (trackId, albumId) = key.split('_').let { (it.getOrNull(0)?.toLongOrNull() ?: 0L) to (it.getOrNull(1)?.toLongOrNull() ?: 0L) }
        val bitmap = runBlocking { ArtworkLoader.load(context, trackId, albumId, 400) }
            ?: return error(Response.Status.NOT_FOUND, "Sin carátula")
        val bytes = ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, out)
            out.toByteArray()
        }
        val r = newFixedLengthResponse(Response.Status.OK, "image/jpeg", ByteArrayInputStream(bytes), bytes.size.toLong())
        r.addHeader("Cache-Control", "max-age=86400")
        return cors(r)
    }
}
