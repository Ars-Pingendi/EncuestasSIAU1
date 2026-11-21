package com.personal.reproductor.data.youtube

import com.personal.reproductor.data.Track
import com.personal.reproductor.data.youTubeTrack
import org.json.JSONArray
import org.json.JSONObject

/**
 * Lee la cola de la radio de YouTube Music (respuesta de `youtubei/v1/next` con la lista
 * `RDAMVM<videoId>`): título, artistas, álbum, duración y carátula de cada canción.
 */
object RadioParser {

    fun parse(root: JSONObject): List<Track> {
        val out = ArrayList<Track>()
        val seen = HashSet<String>()
        for (r in findAll(root, "playlistPanelVideoRenderer")) {
            val videoId = r.optString("videoId").ifEmpty {
                r.optJSONObject("navigationEndpoint")?.optJSONObject("watchEndpoint")?.optString("videoId").orEmpty()
            }
            if (videoId.length != 11 || !seen.add(videoId)) continue
            val title = runsText(r.optJSONObject("title")).ifEmpty { r.optJSONObject("title")?.optString("simpleText").orEmpty() }.trim()
            if (title.isEmpty()) continue
            val runs = (r.optJSONObject("longBylineText") ?: r.optJSONObject("shortBylineText"))?.optJSONArray("runs") ?: JSONArray()
            val artists = ArrayList<String>()
            val all = StringBuilder()
            for (i in 0 until runs.length()) {
                val run = runs.optJSONObject(i) ?: continue
                val text = run.optString("text")
                all.append(text)
                val type = run.optJSONObject("navigationEndpoint")?.optJSONObject("browseEndpoint")
                    ?.optJSONObject("browseEndpointContextSupportedConfigs")
                    ?.optJSONObject("browseEndpointContextMusicConfig")?.optString("pageType").orEmpty()
                if (type == "MUSIC_PAGE_TYPE_ARTIST" || type == "MUSIC_PAGE_TYPE_USER_CHANNEL") artists.add(text)
            }
            val artist = if (artists.isNotEmpty()) artists.joinToString(", ") else all.split(" • ").firstOrNull()?.trim().orEmpty()
            val length = r.optJSONObject("lengthText")
            val durText = runsText(length).ifEmpty { length?.optString("simpleText").orEmpty() }
            val thumbs = r.optJSONObject("thumbnail")?.optJSONArray("thumbnails")
            var thumb = thumbs?.optJSONObject(thumbs.length() - 1)?.optString("url").orEmpty()
            thumb = if (thumb.isNotEmpty()) thumb.replace(Regex("=w\\d+-h\\d+"), "=w544-h544") else "https://i.ytimg.com/vi/$videoId/hqdefault.jpg"
            out.add(youTubeTrack(videoId, title, artist, parseDuration(durText), thumb))
        }
        return out
    }

    /** «Artista - Canción (Video Oficial)» → (artista, título) limpios; si no, el canal es el artista. */
    fun splitVideoTitle(raw: String, channel: String): Pair<String, String> {
        val noise = Regex("\\s*[(\\[](?:official|oficial|video|lyric|letra|audio|visualizer|hd|4k|en vivo|live)[^)\\]]*[)\\]]", RegexOption.IGNORE_CASE)
        fun clean(s: String) = s.replace(noise, "").replace(Regex("\\s+"), " ").trim()
        val ch = channel.replace(Regex("\\s*-\\s*Topic$|VEVO$|\\s+Oficial$|\\s+Official$", RegexOption.IGNORE_CASE), "").trim()
        val m = Regex("^(.+?)\\s+[-–—|]\\s+(.+)$").find(raw)
        if (m != null) return m.groupValues[1].trim() to clean(m.groupValues[2]).ifEmpty { m.groupValues[2].trim() }
        return ch to clean(raw).ifEmpty { raw }
    }

    private fun runsText(o: JSONObject?): String {
        val runs = o?.optJSONArray("runs") ?: return ""
        return (0 until runs.length()).joinToString("") { runs.optJSONObject(it)?.optString("text").orEmpty() }
    }

    private fun parseDuration(text: String): Long {
        if (text.isBlank()) return 0L
        val parts = text.split(':').map { it.trim().toLongOrNull() ?: return 0L }
        return parts.fold(0L) { acc, n -> acc * 60 + n } * 1000L
    }

    /** Todos los objetos con la clave [key], en el orden en que aparecen. */
    private fun findAll(root: Any?, key: String): List<JSONObject> {
        val out = ArrayList<JSONObject>()
        fun walk(node: Any?) {
            when (node) {
                is JSONObject -> {
                    node.optJSONObject(key)?.let { out.add(it) }
                    val names = node.keys().asSequence().toList()
                    for (k in names) walk(node.opt(k))
                }
                is JSONArray -> for (i in 0 until node.length()) walk(node.opt(i))
            }
        }
        walk(root)
        return out
    }
}
