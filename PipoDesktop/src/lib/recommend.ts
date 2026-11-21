// Recomendaciones para la pantalla Inicio, calculadas en el equipo a partir de lo que se escucha:
// cuántas veces y qué tan reciente se reprodujo cada canción, los favoritos y las listas.
//
// - Afinidad por artista y por género: cada reproducción suma, y pesa más si fue reciente.
// - Artistas parecidos: comparten géneros, aparecen juntos en tus listas o colaboran en una canción.
// - Las listas cambian una vez al día (el azar usa la fecha como semilla), como los mixes diarios.
import type { Track } from '../../shared/types';
import type { Album } from './group';
import { artistOf, UNKNOWN_ARTIST, UNKNOWN_GENRE } from './group';
import { norm } from './format';

const DAY = 86_400_000;

export interface Stat {
  plays: number;
  last: number;
}

export interface RecInput {
  /** Canciones de la biblioteca local. */
  tracks: Track[];
  albums: Album[];
  stats: Record<string, Stat>;
  favorites: string[];
  playlists: { trackIds: string[] }[];
  /** Busca una canción por id (local o de YouTube recordada). */
  resolve: (id: string) => Track | undefined;
  now: number;
}

export type RecentItem =
  | { kind: 'album'; album: Album; at: number }
  | { kind: 'track'; track: Track; at: number };

export interface Mix {
  /** «mix:<artista normalizado>». */
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  covers: Track[];
  tracks: Track[];
}

export interface TopArtist {
  name: string;
  /** Clave del artista en la biblioteca (para abrir su página), si existe. */
  libKey?: string;
  cover?: Track;
  score: number;
}

export interface RadioSeed {
  track: Track;
  label: string;
}

export interface HomeData {
  hasHistory: boolean;
  recent: RecentItem[];
  recentTracks: Track[];
  mixes: Mix[];
  forYou: Track[];
  albumsForYou: Album[];
  again: Track[];
  added: Album[];
  topArtists: TopArtist[];
  seeds: RadioSeed[];
}

// ── Utilidades ──

/** «Carlos Vives, Shakira» o «Bad Bunny feat. Drake» → posibles artistas por separado. */
export function splitArtists(name: string): string[] {
  return name
    .split(/\s*[,;]\s*|\s+(?:\/|&|\+|feat\.?|ft\.?|featuring|con|x|vs\.?)\s+|\s*\((?:feat\.?|ft\.?|con)\s+|\)\s*$/i)
    .map((s) => s.trim())
    .filter((s) => s && s !== UNKNOWN_ARTIST);
}

/**
 * Artistas de cada canción. Un nombre compuesto («Simon & Garfunkel») solo se separa si alguna de
 * sus partes también aparece por su cuenta o con otros (así «Carlos Vives, Shakira» cuenta para
 * Carlos Vives y para Shakira, pero un dúo sigue siendo un dúo).
 */
export function artistSplitter(tracks: Iterable<Track>) {
  const fullsOf = new Map<string, Set<string>>();
  const fulls = new Set<string>();
  for (const t of tracks) {
    const full = artistOf(t);
    if (fulls.has(full)) continue;
    fulls.add(full);
    for (const p of splitArtists(full)) {
      const k = norm(p);
      if (!fullsOf.has(k)) fullsOf.set(k, new Set());
      fullsOf.get(k)!.add(full);
    }
  }
  const cache = new Map<string, string[]>();
  const names = (full: string): string[] => {
    let r = cache.get(full);
    if (r) return r;
    const parts = splitArtists(full);
    const independent = parts.length > 1 && parts.some((p) => (fullsOf.get(norm(p))?.size ?? 0) > 1);
    r = full === UNKNOWN_ARTIST || !full.trim() ? [] : independent ? parts : [full.trim()];
    cache.set(full, r);
    return r;
  };
  // En YouTube los artistas vienen separados por YouTube Music (Pipo los une con «, »).
  const ytNames = (full: string) => full.split(/\s*,\s*/).map((s) => s.trim()).filter((s) => s && s !== UNKNOWN_ARTIST);
  const namesOf = (t: Track) => (t.source === 'youtube' ? ytNames(artistOf(t)) : names(artistOf(t)));
  return {
    names: namesOf,
    keys: (t: Track) => namesOf(t).map(norm).filter(Boolean),
  };
}

function genreOf(t: Track): string {
  const g = (t.genre || '').trim();
  return !g || g === UNKNOWN_GENRE || g === 'YouTube' ? '' : norm(g);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Azar repetible: misma semilla, misma secuencia. */
export function rng(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Evita dos canciones seguidas del mismo artista cuando se puede. */
function spreadArtists(list: Track[], artistKeys: (t: Track) => string[]): Track[] {
  const out: Track[] = [];
  const rest = [...list];
  while (rest.length) {
    const prev = out.length ? artistKeys(out[out.length - 1])[0] : undefined;
    let i = rest.findIndex((t) => artistKeys(t)[0] !== prev);
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  return out;
}

function capPerArtist(list: Track[], max: number, limit: number, artistKeys: (t: Track) => string[]): Track[] {
  const count = new Map<string, number>();
  const out: Track[] = [];
  for (const t of list) {
    const k = artistKeys(t)[0] ?? '';
    const n = count.get(k) ?? 0;
    if (n >= max) continue;
    count.set(k, n + 1);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** Peso de una canción escuchada: más reproducciones y más recientes pesan más. */
export function playWeight(s: Stat | undefined, now: number): number {
  if (!s || s.plays <= 0) return 0;
  const age = Math.max(0, now - s.last) / DAY;
  return s.plays * (0.35 + 0.65 * Math.pow(0.5, age / 30));
}

// ── Cálculo ──

export function buildHome(input: RecInput): HomeData {
  const { tracks, albums, stats, now } = input;
  const d = new Date(now);
  const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const favs = new Set(input.favorites);
  const albumOf = new Map<string, Album>();
  for (const a of albums) for (const t of a.tracks) albumOf.set(t.id, a);

  // Canciones escuchadas (locales o de YouTube), de la más reciente a la más antigua.
  const played: { track: Track; stat: Stat }[] = [];
  for (const [id, stat] of Object.entries(stats)) {
    if (!stat || stat.plays <= 0 || !stat.last) continue;
    const track = input.resolve(id);
    if (track) played.push({ track, stat });
  }
  played.sort((a, b) => b.stat.last - a.stat.last);
  const hasHistory = played.length > 0;

  // Conjunto de canciones disponibles: la biblioteca + las de YouTube escuchadas o favoritas.
  const pool = new Map<string, Track>();
  for (const t of tracks) pool.set(t.id, t);
  for (const p of played) pool.set(p.track.id, p.track);
  for (const id of favs) {
    const t = input.resolve(id);
    if (t) pool.set(t.id, t);
  }
  const poolList = [...pool.values()];
  const split = artistSplitter(poolList);
  const artistKeys = split.keys;

  // Afinidad por artista y por género.
  const artistAff = new Map<string, number>();
  const genreAff = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, v: number) => k && m.set(k, (m.get(k) ?? 0) + v);
  for (const t of poolList) {
    const w = playWeight(stats[t.id], now) + (favs.has(t.id) ? 1.5 : 0);
    if (!w) continue;
    for (const a of artistKeys(t)) bump(artistAff, a, w);
    bump(genreAff, genreOf(t), w);
  }
  const maxArtist = Math.max(1, ...artistAff.values());
  const maxGenre = Math.max(1, ...genreAff.values());
  const affOf = (t: Track) => Math.max(0, ...artistKeys(t).map((a) => artistAff.get(a) ?? 0)) / maxArtist;
  const genreAffOf = (t: Track) => (genreAff.get(genreOf(t)) ?? 0) / maxGenre;

  // Índice de artistas: nombre visible, canciones, géneros.
  interface ArtistInfo { key: string; name: string; tracks: Track[]; genres: Map<string, number> }
  const artists = new Map<string, ArtistInfo>();
  for (const t of poolList) {
    for (const name of split.names(t)) {
      const key = norm(name);
      let a = artists.get(key);
      if (!a) artists.set(key, (a = { key, name, tracks: [], genres: new Map() }));
      a.tracks.push(t);
      const g = genreOf(t);
      if (g) a.genres.set(g, (a.genres.get(g) ?? 0) + 1);
    }
  }
  // Artistas que aparecen juntos en listas o en una misma canción (colaboraciones).
  const together = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const addTogether = (keys: string[], v: number) => {
    const u = [...new Set(keys)].slice(0, 40);
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) together.set(pairKey(u[i], u[j]), (together.get(pairKey(u[i], u[j])) ?? 0) + v);
  };
  for (const p of input.playlists) {
    const keys = p.trackIds.map((id) => input.resolve(id)).filter((t): t is Track => !!t).flatMap((t) => artistKeys(t).slice(0, 1));
    addTogether(keys, 1);
  }
  for (const t of poolList) if (artistKeys(t).length > 1) addTogether(artistKeys(t), 2);

  const genreShare = (a: ArtistInfo) => {
    const total = [...a.genres.values()].reduce((s, n) => s + n, 0) || 1;
    return new Map([...a.genres].map(([g, n]) => [g, n / total]));
  };
  const similarTo = (seed: ArtistInfo, limit: number): ArtistInfo[] => {
    const sg = genreShare(seed);
    const scored: { a: ArtistInfo; s: number }[] = [];
    for (const a of artists.values()) {
      if (a.key === seed.key) continue;
      let overlap = 0;
      const ag = genreShare(a);
      for (const [g, v] of sg) overlap += Math.min(v, ag.get(g) ?? 0);
      const tog = Math.min(3, together.get(pairKey(seed.key, a.key)) ?? 0) / 3;
      const s = overlap * 3 + tog * 2;
      if (s <= 0) continue;
      scored.push({ a, s: s * (1 + 0.5 * Math.log1p(artistAff.get(a.key) ?? 0)) + Math.min(a.tracks.length, 10) * 0.02 });
    }
    return scored.sort((x, y) => y.s - x.s).slice(0, limit).map((x) => x.a);
  };

  // ── Escuchado recientemente ──
  const recentTracks = played.map((p) => p.track);
  const recentWindow = played.slice(0, 60);
  const albumHits = new Map<string, number>();
  for (const p of recentWindow) {
    const al = albumOf.get(p.track.id);
    if (al && al.tracks.length > 1) albumHits.set(al.key, (albumHits.get(al.key) ?? 0) + 1);
  }
  const recent: RecentItem[] = [];
  const seenAlbum = new Set<string>();
  const seenTrack = new Set<string>();
  for (const p of recentWindow) {
    const al = albumOf.get(p.track.id);
    if (al && (albumHits.get(al.key) ?? 0) >= 2) {
      if (seenAlbum.has(al.key)) continue;
      seenAlbum.add(al.key);
      recent.push({ kind: 'album', album: al, at: p.stat.last });
    } else {
      if (seenTrack.has(p.track.id)) continue;
      seenTrack.add(p.track.id);
      recent.push({ kind: 'track', track: p.track, at: p.stat.last });
    }
    if (recent.length >= 12) break;
  }

  // ── Mixes ──
  const rand = rng(`mixes|${day}`);
  let seeds: ArtistInfo[];
  if (hasHistory || favs.size) {
    seeds = [...artistAff.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => artists.get(k))
      .filter((a): a is ArtistInfo => !!a);
  } else {
    // Sin historial: los artistas con más canciones en la biblioteca, en otro orden cada día.
    seeds = shuffle([...artists.values()].filter((a) => a.tracks.length >= 4).sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 12), rand);
  }
  const mixes: Mix[] = [];
  const usedAsSeed = new Set<string>();
  for (const seed of seeds) {
    if (mixes.length >= 6) break;
    if (usedAsSeed.has(seed.key)) continue;
    const similar = similarTo(seed, 6);
    const own = seed.tracks;
    if (own.length + similar.reduce((s, a) => s + a.tracks.length, 0) < 6) continue;
    usedAsSeed.add(seed.key);
    const r = rng(`${seed.key}|${day}`);
    const pref = (t: Track) => playWeight(stats[t.id], now) + (favs.has(t.id) ? 2 : 0) + r() * 1.5;
    const ownPick = [...own].sort((a, b) => pref(b) - pref(a)).slice(0, similar.length ? 12 : 30);
    const others: Track[] = [];
    const per = Math.max(3, Math.ceil(18 / Math.max(1, similar.length)));
    for (const a of similar) others.push(...[...a.tracks].sort((x, y) => pref(y) - pref(x)).filter((t) => !ownPick.includes(t)).slice(0, per));
    const all = [...new Map([...ownPick, ...others].map((t) => [t.id, t])).values()].slice(0, 30);
    const list = spreadArtists(shuffle(all, r), artistKeys);
    const covers: Track[] = [];
    const coverSeen = new Set<string>();
    for (const t of [...ownPick, ...others]) {
      const k = t.artId ?? t.artworkUrl;
      if (!k || coverSeen.has(k)) continue;
      coverSeen.add(k);
      covers.push(t);
      if (covers.length >= 4) break;
    }
    const names = [seed.name, ...similar.slice(0, 3).map((a) => a.name)];
    mixes.push({
      id: `mix:${seed.key}`,
      title: `Mix de ${seed.name}`,
      subtitle: names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : `Lo mejor de ${seed.name}`,
      artist: seed.name,
      covers,
      tracks: list,
    });
  }

  // ── Canciones para ti: lo que no has escuchado (o casi) de tus artistas y géneros ──
  const r2 = rng(`foryou|${day}`);
  const fresh = (t: Track) => {
    const s = stats[t.id];
    return !s || s.plays === 0 || (s.plays <= 1 && now - s.last > 60 * DAY);
  };
  const addedBoost = (t: Track) => (t.addedAt && now - t.addedAt < 30 * DAY ? 0.3 : 0);
  const candidates = tracks
    .filter(fresh)
    .map((t) => ({ t, s: (hasHistory ? 2 * affOf(t) + genreAffOf(t) : 0) + addedBoost(t) + r2() * (hasHistory ? 0.35 : 1) }))
    .filter((x) => !hasHistory || x.s > 0.4)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.t);
  const forYou = capPerArtist(candidates, 3, 30, artistKeys);

  // ── Álbumes para ti: casi sin escuchar, de tus artistas o géneros ──
  const r3 = rng(`albums|${day}`);
  const albumScore = (a: Album) => {
    const playedCount = a.tracks.filter((t) => (stats[t.id]?.plays ?? 0) > 0).length;
    if (a.tracks.length < 2 || playedCount / a.tracks.length >= 0.34) return -1;
    const aff = Math.max(...a.tracks.map(affOf));
    const gen = Math.max(...a.tracks.map(genreAffOf));
    return hasHistory ? 2 * aff + gen + r3() * 0.3 - (aff + gen > 0 ? 0 : 1) : r3();
  };
  const albumCount = new Map<string, number>();
  const albumsForYou = albums
    .map((a) => ({ a, s: albumScore(a) }))
    .filter((x) => x.s > (hasHistory ? 0.2 : -0.5))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a)
    .filter((a) => {
      const k = norm(a.artist);
      const n = albumCount.get(k) ?? 0;
      albumCount.set(k, n + 1);
      return n < 2;
    })
    .slice(0, 12);

  // ── Para volver a escuchar: lo que más te gustó y hace rato no suena ──
  const r4 = rng(`again|${day}`);
  const again = capPerArtist(
    poolList
      .filter((t) => {
        const s = stats[t.id];
        const old = !s || !s.last || now - s.last > 14 * DAY;
        return old && ((s?.plays ?? 0) >= 2 || favs.has(t.id));
      })
      .map((t) => ({ t, s: (stats[t.id]?.plays ?? 0) * (favs.has(t.id) ? 1.6 : 1) + (favs.has(t.id) ? 2 : 0) + r4() * 1.5 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t),
    4,
    30,
    artistKeys,
  );

  // ── Agregadas recientemente ──
  const added = albums
    .map((a) => ({ a, at: Math.max(...a.tracks.map((t) => t.addedAt || 0)) }))
    .filter((x) => x.at > 0)
    .sort((x, y) => y.at - x.at)
    .slice(0, 12)
    .map((x) => x.a);

  // ── Tus artistas ──
  const libArtistKey = new Map<string, string>();
  for (const t of tracks) {
    const full = artistOf(t);
    // La página de artista de la biblioteca agrupa por el nombre completo.
    libArtistKey.set(norm(full), full.toLowerCase());
    for (const k of artistKeys(t)) if (!libArtistKey.has(k)) libArtistKey.set(k, full.toLowerCase());
  }
  const topArtists: TopArtist[] = [...artistAff.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, score]) => {
      const a = artists.get(k)!;
      return { name: a.name, libKey: libArtistKey.get(k), cover: a.tracks.find((t) => t.artId) ?? a.tracks.find((t) => t.artworkUrl), score };
    });

  // ── Semillas para buscar canciones parecidas en YouTube ──
  const seedsOut: RadioSeed[] = [];
  if (played[0]) seedsOut.push({ track: played[0].track, label: `Porque escuchaste «${played[0].track.title}»` });
  const lastKeys = played[0] ? artistKeys(played[0].track) : [];
  for (const top of topArtists) {
    const k = norm(top.name);
    if (lastKeys.includes(k)) continue;
    const best = artists.get(k)?.tracks.filter((t) => (stats[t.id]?.plays ?? 0) > 0).sort((a, b) => playWeight(stats[b.id], now) - playWeight(stats[a.id], now))[0];
    if (best) seedsOut.push({ track: best, label: `Parecido a ${top.name}` });
    break;
  }

  return { hasHistory, recent, recentTracks, mixes, forYou, albumsForYou, again, added, topArtists, seeds: seedsOut };
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
