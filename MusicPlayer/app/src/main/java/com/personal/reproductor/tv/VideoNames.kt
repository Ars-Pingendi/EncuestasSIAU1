package com.personal.reproductor.tv

import java.text.Normalizer

/** Resultado de reconocer un video por su nombre y carpetas. */
data class ParsedVideoName(
    val kind: String, // "movie" | "episode"
    /** Película: su título. Episodio: título del episodio (puede estar vacío). */
    val title: String,
    val series: String = "",
    val season: Int = 0,
    val episode: Int = 0,
    val year: Int = 0,
)

/**
 * Reconoce películas y series por el nombre del archivo y las carpetas.
 * Es la misma lógica que usa Pipo para Windows, para que la TV agrupe igual los videos del
 * teléfono y los del PC.
 */
object VideoNames {
    private val TAGS = Regex(
        "\\b(?:2160p|1080p|1080i|720p|576p|480p|4k|uhd|hdr10\\+?|hdr|dolby ?vision|dv|blu-?ray|bdrip|brrip|webrip|web-?dl|web|" +
            "hdtv|dvdrip|dvd|x264|x265|h\\.?264|h\\.?265|hevc|avc|xvid|divx|aac\\d?|ac3|e-?ac-?3|ddp?\\d?(?:[ .]\\d)?|" +
            "dts(?:-?hd)?(?:-?ma)?|truehd|atmos|flac|remux|proper|repack|extended|unrated|imax|multi|dual|latino|castellano|" +
            "vose|subs?|10bit|8bit|amzn|nf|dsnp|hmax)\\b",
        RegexOption.IGNORE_CASE,
    )
    private val SEASON_DIR = Regex("^(?:season|temporada|temp|series|serie|s)[\\s._-]*(\\d{1,2})$", RegexOption.IGNORE_CASE)
    private val SXE = Regex(
        "^(.*?)[\\s._\\-\\[(]*\\bS(\\d{1,2})[\\s._-]*E(\\d{1,3})(?:[\\s._-]*(?:E|-E)?\\d{1,3})?\\b(.*)$",
        RegexOption.IGNORE_CASE,
    )
    private val NXM = Regex("^(.*?)[\\s._\\-\\[(]*\\b(\\d{1,2})x(\\d{2,3})\\b(.*)$", RegexOption.IGNORE_CASE)
    private val EP_WORD = Regex("(?:^|[\\s._-])(?:e|ep|episode|episodio|cap|capitulo|capítulo)[\\s._-]*(\\d{1,3})\\b", RegexOption.IGNORE_CASE)
    private val EP_NUMBER = Regex("^(\\d{1,3})(?=[\\s._-])")
    private val YEAR = Regex("(?:^|[\\s(\\[])((?:19|20)\\d{2})(?=[\\s)\\]]|$)")
    private val TRAILING_YEAR = Regex("[\\s(\\[]*\\b((?:19|20)\\d{2})\\b[\\s)\\]]*$")
    private val SEPARATORS = Regex("[._]+")
    private val BRACKETS = Regex("\\[[^\\]]*\\]")
    private val BRACES = Regex("\\{[^}]*\\}")
    private val EDGES = Regex("^[\\s\\-–—:]+|[\\s\\-–—:(]+$")
    private val SPACES = Regex("\\s{2,}")
    private val ACCENTS = Regex("\\p{InCombiningDiacriticalMarks}+")
    private val NOT_ALNUM = Regex("[^a-z0-9]+")

    private val CAMERA_NAME = Regex(
        "^(?:VID|PXL|MOV|MVI|WhatsApp[ _-]Video|Screen[ _-]?Recording|Screenrecorder|ScreenRecord|Video)?[-_ ]*" +
            "(?:\\d{4}[-_]?\\d{2}[-_]?\\d{2})(?:[-_ ]|$)",
        RegexOption.IGNORE_CASE,
    )
    private val WHATSAPP_SUFFIX = Regex("-WA\\d+", RegexOption.IGNORE_CASE)

    /** ¿Es un nombre automático de cámara, WhatsApp o grabador de pantalla («VID_20240312_183015»)? */
    fun isCameraName(base: String): Boolean = CAMERA_NAME.containsMatchIn(base)

    /** Etiqueta legible según el origen del archivo (cámara, WhatsApp, grabación de pantalla). */
    fun cameraLabel(base: String): String = when {
        base.contains("whatsapp", ignoreCase = true) || WHATSAPP_SUFFIX.containsMatchIn(base) -> "Video de WhatsApp"
        base.contains("screen", ignoreCase = true) -> "Grabación de pantalla"
        else -> "Video"
    }

    /** Quita puntos, corchetes y etiquetas de release («1080p», «BluRay», «x264»…). */
    fun cleanTitle(raw: String, cutTags: Boolean = true): String {
        var t = raw.replace(SEPARATORS, " ").replace(BRACKETS, " ").replace(BRACES, " ")
        val tag = if (cutTags) TAGS.find(t) else null
        if (tag != null) t = if (tag.range.first > 0) t.substring(0, tag.range.first) else ""
        return t.replace(EDGES, "").replace(SPACES, " ").trim()
    }

    private fun stripYear(name: String): String {
        val m = TRAILING_YEAR.find(name)
        return if (m != null && m.range.first > 0) name.substring(0, m.range.first).trim() else name
    }

    /** Clave para agrupar episodios de una misma serie aunque cambie la escritura. */
    fun seriesKey(name: String): String =
        Normalizer.normalize(name, Normalizer.Form.NFD).replace(ACCENTS, "").lowercase().replace(NOT_ALNUM, "")

    /** Primera carpeta del recorrido (de adentro hacia afuera) que no sea de temporada. */
    private fun ancestorSeries(dirs: List<String>, rootName: String): String {
        for (i in dirs.indices.reversed()) {
            if (!SEASON_DIR.matches(dirs[i].trim())) {
                val n = stripYear(cleanTitle(dirs[i]))
                if (n.isNotEmpty()) return n
            }
        }
        return stripYear(cleanTitle(rootName)).ifEmpty { "Serie sin nombre" }
    }

    /** [relPath] es la ruta relativa a la carpeta raíz (p. ej. «Series/Dark/Temporada 1/Dark S01E02.mkv»). */
    fun parse(relPath: String, rootName: String = ""): ParsedVideoName {
        val parts = relPath.split('/', '\\').filter { it.isNotEmpty() }
        val file = parts.lastOrNull() ?: relPath
        val dirs = parts.dropLast(1)
        val base = file.substringBeforeLast('.', file)
        val spaced = base.replace(SEPARATORS, " ")

        val m = SXE.find(base) ?: NXM.find(base)
        if (m != null) {
            val before = stripYear(cleanTitle(m.groupValues[1]))
            val series = before.ifEmpty { ancestorSeries(dirs, rootName) }
            return ParsedVideoName(
                kind = "episode",
                title = cleanTitle(m.groupValues[4]),
                series = series,
                season = m.groupValues[2].toInt(),
                episode = m.groupValues[3].toInt(),
            )
        }

        // «Serie/Temporada 2/03 - Título.mkv»
        val parent = dirs.lastOrNull()?.trim().orEmpty()
        val sd = SEASON_DIR.find(parent)
        if (sd != null) {
            val ep = EP_WORD.find(spaced) ?: EP_NUMBER.find(spaced)
            if (ep != null) {
                return ParsedVideoName(
                    kind = "episode",
                    title = cleanTitle(spaced.replaceFirst(ep.value, " ")),
                    series = ancestorSeries(dirs.dropLast(1), rootName),
                    season = sd.groupValues[1].toInt(),
                    episode = ep.groupValues[1].toInt(),
                )
            }
        }

        // Película: el título llega hasta el último año que no esté al principio.
        val last = YEAR.findAll(spaced).filter { it.range.first > 0 }.lastOrNull()
        var year = 0
        var title: String
        if (last != null) {
            year = last.groupValues[1].toInt()
            // Con año, todo lo anterior es el título (aunque contenga palabras como «DTS» o «Web»).
            title = cleanTitle(spaced.substring(0, last.range.first), false)
        } else {
            title = cleanTitle(spaced)
        }
        title = title.ifEmpty { cleanTitle(spaced, false) }.ifEmpty { spaced.trim() }
        return ParsedVideoName(kind = "movie", title = title, year = year)
    }
}
