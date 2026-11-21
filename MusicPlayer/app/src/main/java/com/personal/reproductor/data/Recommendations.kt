package com.personal.reproductor.data

import java.util.Calendar
import kotlin.math.ceil
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Recomendaciones para «Inicio», calculadas en el teléfono a partir de lo que se escucha: cuántas
 * veces y qué tan reciente sonó cada canción, los favoritos y las listas (la misma lógica que la app
 * de Windows).
 *
 * - Afinidad por artista y por género: cada reproducción suma, y pesa más si fue reciente.
 * - Artistas parecidos: comparten géneros, aparecen juntos en tus listas o colaboran en una canción.
 * - Las listas cambian una vez al día (el azar usa la fecha como semilla), como los mixes diarios.
 */
object Recommendations {

    private const val DAY = 86_400_000L

    data class Stat(val plays: Int, val last: Long)

    sealed interface RecentItem {
        data class OfAlbum(val album: Album, val at: Long) : RecentItem
        data class OfTrack(val track: Track, val at: Long) : RecentItem
    }

    data class Mix(
        /** «mix:<artista normalizado>». */
        val id: String,
        val title: String,
        val subtitle: String,
        val artist: String,
        val covers: List<Track>,
        val tracks: List<Track>,
    )

    data class TopArtist(
        val name: String,
        /** Clave del artista en la biblioteca (para abrir su página), si existe. */
        val libraryKey: String?,
        val cover: Track?,
        val score: Double,
    )

    data class RadioSeed(val track: Track, val label: String)

    data class Home(
        val hasHistory: Boolean = false,
        val recent: List<RecentItem> = emptyList(),
        val recentTracks: List<Track> = emptyList(),
        val mixes: List<Mix> = emptyList(),
        val forYou: List<Track> = emptyList(),
        val albumsForYou: List<Album> = emptyList(),
        val again: List<Track> = emptyList(),
        val added: List<Album> = emptyList(),
        val topArtists: List<TopArtist> = emptyList(),
        val seeds: List<RadioSeed> = emptyList(),
    ) {
        val isEmpty: Boolean get() = !hasHistory && mixes.isEmpty() && forYou.isEmpty() && added.isEmpty()
    }

    /**
     * [played]: canciones escuchadas (locales o de YouTube) con su estadística.
     * [favorites]: canciones favoritas; [playlists]: canciones de cada lista.
     */
    fun build(
        library: Library,
        played: List<Pair<Track, Stat>>,
        favorites: List<Track>,
        playlists: List<List<Track>>,
        now: Long,
    ): Home {
        val cal = Calendar.getInstance().apply { timeInMillis = now }
        val day = "${cal.get(Calendar.YEAR)}-${cal.get(Calendar.DAY_OF_YEAR)}"
        val stats = HashMap<Long, Stat>()
        for ((t, s) in played) stats[t.id] = s
        val favIds = favorites.map { it.id }.toHashSet()
        val albumOf = HashMap<Long, Album>()
        for (a in library.albums) for (t in a.tracks) albumOf[t.id] = a

        val playedSorted = played.filter { it.second.plays > 0 && it.second.last > 0 }.sortedByDescending { it.second.last }
        val hasHistory = playedSorted.isNotEmpty()

        // Canciones disponibles: la biblioteca + las de YouTube escuchadas o favoritas.
        val pool = LinkedHashMap<Long, Track>()
        for (t in library.tracks) pool[t.id] = t
        for ((t, _) in playedSorted) pool[t.id] = t
        for (t in favorites) pool[t.id] = t
        val poolList = pool.values.toList()
        val split = ArtistSplitter(poolList)

        // Afinidad por artista y por género.
        val artistAff = HashMap<String, Double>()
        val genreAff = HashMap<String, Double>()
        for (t in poolList) {
            val w = playWeight(stats[t.id], now) + if (t.id in favIds) 1.5 else 0.0
            if (w == 0.0) continue
            for (k in split.keys(t)) artistAff.merge(k, w, Double::plus)
            genreOf(t).takeIf { it.isNotEmpty() }?.let { genreAff.merge(it, w, Double::plus) }
        }
        val maxArtist = max(1.0, artistAff.values.maxOrNull() ?: 0.0)
        val maxGenre = max(1.0, genreAff.values.maxOrNull() ?: 0.0)
        fun affOf(t: Track) = (split.keys(t).maxOfOrNull { artistAff[it] ?: 0.0 } ?: 0.0) / maxArtist
        fun genreAffOf(t: Track) = (genreAff[genreOf(t)] ?: 0.0) / maxGenre

        // Índice de artistas.
        class ArtistInfo(val key: String, val name: String) {
            val tracks = ArrayList<Track>()
            val genres = HashMap<String, Int>()
        }
        val artists = LinkedHashMap<String, ArtistInfo>()
        for (t in poolList) {
            for (name in split.names(t)) {
                val key = name.fold().trim()
                val a = artists.getOrPut(key) { ArtistInfo(key, name) }
                a.tracks.add(t)
                genreOf(t).takeIf { it.isNotEmpty() }?.let { a.genres.merge(it, 1, Int::plus) }
            }
        }
        // Artistas que aparecen juntos en listas o en una misma canción.
        val together = HashMap<String, Int>()
        fun pairKey(a: String, b: String) = if (a < b) "$a\u0000$b" else "$b\u0000$a"
        fun addTogether(keys: List<String>, v: Int) {
            val u = keys.distinct().take(40)
            for (i in u.indices) for (j in i + 1 until u.size) together.merge(pairKey(u[i], u[j]), v, Int::plus)
        }
        for (list in playlists) addTogether(list.mapNotNull { split.keys(it).firstOrNull() }, 1)
        for (t in poolList) split.keys(t).takeIf { it.size > 1 }?.let { addTogether(it, 2) }

        fun genreShare(a: ArtistInfo): Map<String, Double> {
            val total = a.genres.values.sum().coerceAtLeast(1)
            return a.genres.mapValues { it.value.toDouble() / total }
        }
        fun similarTo(seed: ArtistInfo, limit: Int): List<ArtistInfo> {
            val sg = genreShare(seed)
            return artists.values.asSequence()
                .filter { it.key != seed.key }
                .mapNotNull { a ->
                    val ag = genreShare(a)
                    val overlap = sg.entries.sumOf { (g, v) -> min(v, ag[g] ?: 0.0) }
                    val tog = min(3, together[pairKey(seed.key, a.key)] ?: 0) / 3.0
                    val s = overlap * 3 + tog * 2
                    if (s <= 0) null
                    else a to (s * (1 + 0.5 * ln(1 + (artistAff[a.key] ?: 0.0))) + min(a.tracks.size, 10) * 0.02)
                }
                .sortedByDescending { it.second }
                .take(limit)
                .map { it.first }
                .toList()
        }

        // ── Escuchado recientemente ──
        val recentTracks = playedSorted.map { it.first }
        val window = playedSorted.take(60)
        val albumHits = HashMap<Long, Int>()
        for ((t, _) in window) {
            val al = albumOf[t.id]
            if (al != null && al.tracks.size > 1) albumHits.merge(al.id, 1, Int::plus)
        }
        val recent = ArrayList<RecentItem>()
        val seenAlbum = HashSet<Long>()
        val seenTrack = HashSet<Long>()
        for ((t, s) in window) {
            val al = albumOf[t.id]
            if (al != null && (albumHits[al.id] ?: 0) >= 2) {
                if (seenAlbum.add(al.id)) recent.add(RecentItem.OfAlbum(al, s.last))
            } else if (seenTrack.add(t.id)) {
                recent.add(RecentItem.OfTrack(t, s.last))
            }
            if (recent.size >= 12) break
        }

        // ── Mixes ──
        val rand = rng("mixes|$day")
        val seeds: List<ArtistInfo> = if (hasHistory || favIds.isNotEmpty()) {
            artistAff.entries.sortedByDescending { it.value }.mapNotNull { artists[it.key] }
        } else {
            // Sin historial: los artistas con más canciones, en otro orden cada día.
            artists.values.filter { it.tracks.size >= 4 }.sortedByDescending { it.tracks.size }.take(12).shuffledWith(rand)
        }
        val mixes = ArrayList<Mix>()
        val used = HashSet<String>()
        for (seed in seeds) {
            if (mixes.size >= 6) break
            if (!used.add(seed.key)) continue
            val similar = similarTo(seed, 6)
            if (seed.tracks.size + similar.sumOf { it.tracks.size } < 6) continue
            val r = rng("${seed.key}|$day")
            val prefCache = HashMap<Long, Double>()
            fun pref(t: Track) = prefCache.getOrPut(t.id) { playWeight(stats[t.id], now) + (if (t.id in favIds) 2.0 else 0.0) + r() * 1.5 }
            val own = seed.tracks.sortedByDescending { pref(it) }.take(if (similar.isEmpty()) 30 else 12)
            val ownIds = own.map { it.id }.toHashSet()
            val per = max(3, ceil(18.0 / max(1, similar.size)).toInt())
            val others = similar.flatMap { a -> a.tracks.sortedByDescending { pref(it) }.filter { it.id !in ownIds }.take(per) }
            val all = (own + others).distinctBy { it.id }.take(30)
            val list = spreadArtists(all.shuffledWith(r), split)
            val covers = ArrayList<Track>()
            val coverSeen = HashSet<String>()
            for (t in own + others) {
                val k = t.artworkUrl ?: if (t.isRemote) null else "a${t.albumId}"
                if (k == null || !coverSeen.add(k)) continue
                covers.add(t)
                if (covers.size >= 4) break
            }
            val names = listOf(seed.name) + similar.take(3).map { it.name }
            mixes.add(
                Mix(
                    id = "mix:${seed.key}",
                    title = "Mix de ${seed.name}",
                    subtitle = if (names.size > 1) names.dropLast(1).joinToString(", ") + " y " + names.last() else "Lo mejor de ${seed.name}",
                    artist = seed.name,
                    covers = covers,
                    tracks = list,
                ),
            )
        }

        // ── Canciones para ti ──
        val r2 = rng("foryou|$day")
        fun fresh(t: Track): Boolean {
            val s = stats[t.id] ?: return true
            return s.plays == 0 || (s.plays <= 1 && now - s.last > 60 * DAY)
        }
        fun addedBoost(t: Track) = if (t.dateAddedSec > 0 && now - t.dateAddedSec * 1000 < 30 * DAY) 0.3 else 0.0
        val candidates = library.tracks.filter { fresh(it) }
            .map { t -> t to (if (hasHistory) 2 * affOf(t) + genreAffOf(t) else 0.0) + addedBoost(t) + r2() * (if (hasHistory) 0.35 else 1.0) }
            .filter { !hasHistory || it.second > 0.4 }
            .sortedByDescending { it.second }
            .map { it.first }
        val forYou = capPerArtist(candidates, 3, 30, split)

        // ── Álbumes para ti ──
        val r3 = rng("albums|$day")
        fun albumScore(a: Album): Double {
            val playedCount = a.tracks.count { (stats[it.id]?.plays ?: 0) > 0 }
            if (a.tracks.size < 2 || playedCount.toDouble() / a.tracks.size >= 0.34) return -1.0
            val aff = a.tracks.maxOf { affOf(it) }
            val gen = a.tracks.maxOf { genreAffOf(it) }
            return if (hasHistory) 2 * aff + gen + r3() * 0.3 - (if (aff + gen > 0) 0.0 else 1.0) else r3()
        }
        val albumCount = HashMap<String, Int>()
        val albumsForYou = library.albums
            .map { it to albumScore(it) }
            .filter { it.second > (if (hasHistory) 0.2 else -0.5) }
            .sortedByDescending { it.second }
            .map { it.first }
            .filter { a -> (albumCount.merge(a.artist.fold(), 1, Int::plus) ?: 1) <= 2 }
            .take(12)

        // ── Para volver a escuchar ──
        val r4 = rng("again|$day")
        val again = capPerArtist(
            poolList.filter { t ->
                val s = stats[t.id]
                val old = s == null || s.last == 0L || now - s.last > 14 * DAY
                old && ((s?.plays ?: 0) >= 2 || t.id in favIds)
            }.map { t ->
                val fav = t.id in favIds
                t to (stats[t.id]?.plays ?: 0) * (if (fav) 1.6 else 1.0) + (if (fav) 2.0 else 0.0) + r4() * 1.5
            }.sortedByDescending { it.second }.map { it.first },
            4, 30, split,
        )

        // ── Agregadas recientemente ──
        val added = library.albums
            .map { a -> a to (a.tracks.maxOfOrNull { it.dateAddedSec } ?: 0L) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .take(12)
            .map { it.first }

        // ── Tus artistas ──
        val libKey = HashMap<String, String>()
        for (t in library.tracks) {
            val full = t.artist.trim().lowercase()
            libKey[t.artist.fold().trim()] = full
            for (k in split.keys(t)) libKey.putIfAbsent(k, full)
        }
        val topArtists = artistAff.entries.sortedByDescending { it.value }.take(12).mapNotNull { (k, score) ->
            val a = artists[k] ?: return@mapNotNull null
            TopArtist(a.name, libKey[k], a.tracks.firstOrNull { !it.isRemote } ?: a.tracks.firstOrNull { it.artworkUrl != null }, score)
        }

        // ── Semillas para buscar canciones parecidas en YouTube ──
        val seedsOut = ArrayList<RadioSeed>()
        val last = playedSorted.firstOrNull()?.first
        if (last != null) seedsOut.add(RadioSeed(last, "Porque escuchaste «${last.title}»"))
        val lastKeys = last?.let { split.keys(it) }.orEmpty()
        for (top in topArtists) {
            val k = top.name.fold().trim()
            if (k in lastKeys) continue
            val best = artists[k]?.tracks?.filter { (stats[it.id]?.plays ?: 0) > 0 }?.maxByOrNull { playWeight(stats[it.id], now) }
            if (best != null) seedsOut.add(RadioSeed(best, "Parecido a ${top.name}"))
            break
        }

        return Home(hasHistory, recent, recentTracks, mixes, forYou, albumsForYou, again, added, topArtists, seedsOut)
    }

    // ── Utilidades ──

    /** Peso de una canción escuchada: más reproducciones y más recientes pesan más. */
    fun playWeight(s: Stat?, now: Long): Double {
        if (s == null || s.plays <= 0) return 0.0
        val age = max(0L, now - s.last).toDouble() / DAY
        return s.plays * (0.35 + 0.65 * 0.5.pow(age / 30))
    }

    private fun genreOf(t: Track): String {
        val g = t.genre.trim()
        return if (g.isEmpty() || g == UNKNOWN_GENRE || g == YOUTUBE_ALBUM) "" else g.fold().trim()
    }

    private val COMMA = Regex("\\s*,\\s*")

    private val SEPARATORS = Regex(
        "\\s*[,;]\\s*|\\s+(?:/|&|\\+|feat\\.?|ft\\.?|featuring|con|x|vs\\.?)\\s+|\\s*\\((?:feat\\.?|ft\\.?|con)\\s+|\\)\\s*$",
        RegexOption.IGNORE_CASE,
    )

    /** «Carlos Vives, Shakira» o «Bad Bunny feat. Drake» → posibles artistas por separado. */
    fun splitArtists(name: String): List<String> =
        name.split(SEPARATORS).map { it.trim() }.filter { it.isNotEmpty() && it != UNKNOWN_ARTIST }

    /**
     * Artistas de cada canción. Un nombre compuesto («Simon & Garfunkel») solo se separa si alguna de
     * sus partes también aparece por su cuenta o con otros; en YouTube las comas siempre separan.
     */
    class ArtistSplitter(tracks: Collection<Track>) {
        private val fullsOf = HashMap<String, HashSet<String>>()
        private val cache = HashMap<String, List<String>>()

        /** En YouTube, las comas siempre separan artistas distintos. */
        private fun fullsIn(t: Track): List<String> =
            if (t.isRemote) t.artist.split(COMMA).map { it.trim() }.filter { it.isNotEmpty() } else listOf(t.artist)

        init {
            for (full in tracks.flatMapTo(HashSet()) { fullsIn(it) }) {
                for (p in splitArtists(full)) fullsOf.getOrPut(p.fold().trim()) { HashSet() }.add(full)
            }
        }

        private fun namesOf(full: String): List<String> = cache.getOrPut(full) {
            val parts = splitArtists(full)
            when {
                full.isBlank() || full == UNKNOWN_ARTIST -> emptyList()
                parts.size > 1 && parts.any { (fullsOf[it.fold().trim()]?.size ?: 0) > 1 } -> parts
                else -> listOf(full.trim())
            }
        }

        fun names(t: Track): List<String> = fullsIn(t).flatMap { namesOf(it) }.distinct()

        fun keys(t: Track): List<String> = names(t).map { it.fold().trim() }.filter { it.isNotEmpty() }
    }

    private fun spreadArtists(list: List<Track>, split: ArtistSplitter): List<Track> {
        val out = ArrayList<Track>(list.size)
        val rest = list.toMutableList()
        while (rest.isNotEmpty()) {
            val prev = out.lastOrNull()?.let { split.keys(it).firstOrNull() }
            var i = rest.indexOfFirst { split.keys(it).firstOrNull() != prev }
            if (i < 0) i = 0
            out.add(rest.removeAt(i))
        }
        return out
    }

    private fun capPerArtist(list: List<Track>, maxPer: Int, limit: Int, split: ArtistSplitter): List<Track> {
        val count = HashMap<String, Int>()
        val out = ArrayList<Track>()
        for (t in list) {
            val k = split.keys(t).firstOrNull() ?: ""
            val n = count[k] ?: 0
            if (n >= maxPer) continue
            count[k] = n + 1
            out.add(t)
            if (out.size >= limit) break
        }
        return out
    }

    /** Azar repetible: misma semilla, misma secuencia (mulberry32, como en Windows). */
    fun rng(seed: String): () -> Double {
        var h = 2166136261L.toInt()
        for (ch in seed) h = (h xor ch.code) * 16777619
        var a = if (h == 0) 1 else h
        return {
            a += 0x6d2b79f5
            var t = (a xor (a ushr 15)) * (1 or a)
            t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
            ((t xor (t ushr 14)).toLong() and 0xffffffffL).toDouble() / 4294967296.0
        }
    }

    private fun <T> List<T>.shuffledWith(rand: () -> Double): List<T> {
        val a = toMutableList()
        for (i in a.size - 1 downTo 1) {
            val j = (rand() * (i + 1)).toInt()
            val tmp = a[i]; a[i] = a[j]; a[j] = tmp
        }
        return a
    }
}
