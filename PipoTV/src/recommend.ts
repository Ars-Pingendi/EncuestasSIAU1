// Recomendaciones para «Inicio» de la TV, calculadas en el televisor con lo que se escucha aquí,
// los favoritos y las listas del PC o del teléfono (la misma lógica que Pipo para Windows y Android).
//
// - Afinidad por artista y por género: cada reproducción suma, y pesa más si fue reciente.
// - Artistas parecidos: comparten géneros, aparecen juntos en tus listas o colaboran en una canción.
// - Las listas cambian una vez al día (el azar usa la fecha como semilla).
//
// Escrito para el navegador de webOS 4 (Chromium 53): sin flatMap, Object.fromEntries ni similares.
import type { TvTrack } from './api';
import { artistOf, UNKNOWN_ARTIST, type Group } from './library';
import type { Stat } from './history';

const DAY = 86400000;

export interface RecInput {
  tracks: TvTrack[];
  albums: Group[];
  stats: { [id: string]: Stat };
  favorites: TvTrack[];
  playlists: TvTrack[][];
  resolve: (id: string) => TvTrack | undefined;
  now: number;
}

export type RecentItem = { kind: 'album'; album: Group; at: number } | { kind: 'track'; track: TvTrack; at: number };

export interface Mix {
  id: string;
  title: string;
  subtitle: string;
  artist: string;
  covers: TvTrack[];
  tracks: TvTrack[];
}

export interface TopArtist {
  name: string;
  key: string;
  cover: TvTrack | null;
  tracks: TvTrack[];
}

export interface HomeData {
  hasHistory: boolean;
  recent: RecentItem[];
  recentTracks: TvTrack[];
  mixes: Mix[];
  forYou: TvTrack[];
  albumsForYou: Group[];
  again: TvTrack[];
  added: Group[];
  topArtists: TopArtist[];
}

export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const isYoutube = (t: TvTrack) => t.id.indexOf('yt:') === 0;

export function splitArtists(name: string): string[] {
  return name
    .split(/\s*[,;]\s*|\s+(?:\/|&|\+|feat\.?|ft\.?|featuring|con|x|vs\.?)\s+|\s*\((?:feat\.?|ft\.?|con)\s+|\)\s*$/i)
    .map((s) => s.trim())
    .filter((s) => !!s && s !== UNKNOWN_ARTIST);
}

/** Separa colaboraciones sin partir dúos («Simon & Garfunkel»); en YouTube las comas siempre separan. */
export function artistSplitter(tracks: TvTrack[]) {
  const fullsOf: { [k: string]: { [full: string]: boolean } } = {};
  const fullsIn = (t: TvTrack): string[] =>
    isYoutube(t) ? artistOf(t).split(/\s*,\s*/).map((s) => s.trim()).filter((s) => !!s) : [artistOf(t)];
  const seen: { [full: string]: boolean } = {};
  for (const t of tracks) {
    for (const full of fullsIn(t)) {
      if (seen[full]) continue;
      seen[full] = true;
      for (const p of splitArtists(full)) {
        const k = norm(p);
        (fullsOf[k] || (fullsOf[k] = {}))[full] = true;
      }
    }
  }
  const cache: { [full: string]: string[] } = {};
  const namesOf = (full: string): string[] => {
    if (cache[full]) return cache[full];
    const parts = splitArtists(full);
    let r: string[];
    if (!full.trim() || full === UNKNOWN_ARTIST) r = [];
    else if (parts.length > 1 && parts.some((p) => Object.keys(fullsOf[norm(p)] || {}).length > 1)) r = parts;
    else r = [full.trim()];
    cache[full] = r;
    return r;
  };
  const names = (t: TvTrack): string[] => {
    const out: string[] = [];
    for (const full of fullsIn(t)) for (const n of namesOf(full)) if (out.indexOf(n) < 0) out.push(n);
    return out;
  };
  return { names, keys: (t: TvTrack) => names(t).map(norm).filter((k) => !!k) };
}

function genreOf(t: TvTrack): string {
  const g = (t.genre || '').trim();
  return !g || g === 'Sin género' || g === 'YouTube' ? '' : norm(g);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

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
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function playWeight(s: Stat | undefined, now: number): number {
  if (!s || s.plays <= 0) return 0;
  const age = Math.max(0, now - s.last) / DAY;
  return s.plays * (0.35 + 0.65 * Math.pow(0.5, age / 30));
}

function maxOf(values: number[]): number {
  let m = 0;
  for (const v of values) if (v > m) m = v;
  return m;
}

export function buildHome(input: RecInput): HomeData {
  const { tracks, albums, stats, now } = input;
  const d = new Date(now);
  const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const favIds: { [id: string]: boolean } = {};
  for (const t of input.favorites) favIds[t.id] = true;
  const albumOf: { [id: string]: Group } = {};
  for (const a of albums) for (const t of a.tracks) albumOf[t.id] = a;

  const played: { track: TvTrack; stat: Stat }[] = [];
  for (const id of Object.keys(stats)) {
    const stat = stats[id];
    if (!stat || stat.plays <= 0 || !stat.last) continue;
    const track = input.resolve(id);
    if (track) played.push({ track, stat });
  }
  played.sort((a, b) => b.stat.last - a.stat.last);
  const hasHistory = played.length > 0;

  // Canciones disponibles: la biblioteca + las de YouTube escuchadas o favoritas.
  const pool: TvTrack[] = tracks.slice();
  const inPool: { [id: string]: boolean } = {};
  for (const t of pool) inPool[t.id] = true;
  for (const p of played) if (!inPool[p.track.id]) (inPool[p.track.id] = true), pool.push(p.track);
  for (const t of input.favorites) if (!inPool[t.id]) (inPool[t.id] = true), pool.push(t);
  const split = artistSplitter(pool);
  const keysOf: { [id: string]: string[] } = {};
  const artistKeys = (t: TvTrack) => keysOf[t.id] || (keysOf[t.id] = split.keys(t));

  // Afinidad por artista y género.
  const artistAff: { [k: string]: number } = {};
  const genreAff: { [g: string]: number } = {};
  for (const t of pool) {
    const w = playWeight(stats[t.id], now) + (favIds[t.id] ? 1.5 : 0);
    if (!w) continue;
    for (const a of artistKeys(t)) artistAff[a] = (artistAff[a] || 0) + w;
    const g = genreOf(t);
    if (g) genreAff[g] = (genreAff[g] || 0) + w;
  }
  const maxArtist = Math.max(1, maxOf(Object.keys(artistAff).map((k) => artistAff[k])));
  const maxGenre = Math.max(1, maxOf(Object.keys(genreAff).map((k) => genreAff[k])));
  const affOf = (t: TvTrack) => maxOf(artistKeys(t).map((a) => artistAff[a] || 0)) / maxArtist;
  const genreAffOf = (t: TvTrack) => (genreAff[genreOf(t)] || 0) / maxGenre;

  interface ArtistInfo { key: string; name: string; tracks: TvTrack[]; genres: { [g: string]: number } }
  const artists: { [k: string]: ArtistInfo } = {};
  for (const t of pool) {
    for (const name of split.names(t)) {
      const key = norm(name);
      const a = artists[key] || (artists[key] = { key, name, tracks: [], genres: {} });
      a.tracks.push(t);
      const g = genreOf(t);
      if (g) a.genres[g] = (a.genres[g] || 0) + 1;
    }
  }
  const together: { [pair: string]: number } = {};
  const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  const addTogether = (keys: string[], v: number) => {
    const u: string[] = [];
    for (const k of keys) if (u.indexOf(k) < 0 && u.length < 40) u.push(k);
    for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) together[pairKey(u[i], u[j])] = (together[pairKey(u[i], u[j])] || 0) + v;
  };
  for (const list of input.playlists) addTogether(list.map((t) => artistKeys(t)[0]).filter((k) => !!k), 1);
  for (const t of pool) if (artistKeys(t).length > 1) addTogether(artistKeys(t), 2);

  const genreShare = (a: ArtistInfo) => {
    let total = 0;
    for (const g of Object.keys(a.genres)) total += a.genres[g];
    const out: { [g: string]: number } = {};
    for (const g of Object.keys(a.genres)) out[g] = a.genres[g] / (total || 1);
    return out;
  };
  const similarTo = (seed: ArtistInfo, limit: number): ArtistInfo[] => {
    const sg = genreShare(seed);
    const scored: { a: ArtistInfo; s: number }[] = [];
    for (const k of Object.keys(artists)) {
      const a = artists[k];
      if (a.key === seed.key) continue;
      const ag = genreShare(a);
      let overlap = 0;
      for (const g of Object.keys(sg)) overlap += Math.min(sg[g], ag[g] || 0);
      const tog = Math.min(3, together[pairKey(seed.key, a.key)] || 0) / 3;
      const s = overlap * 3 + tog * 2;
      if (s <= 0) continue;
      scored.push({ a, s: s * (1 + 0.5 * Math.log(1 + (artistAff[a.key] || 0))) + Math.min(a.tracks.length, 10) * 0.02 });
    }
    return scored.sort((x, y) => y.s - x.s).slice(0, limit).map((x) => x.a);
  };
  const spread = (list: TvTrack[]): TvTrack[] => {
    const out: TvTrack[] = [];
    const rest = list.slice();
    while (rest.length) {
      const prev = out.length ? artistKeys(out[out.length - 1])[0] : undefined;
      let i = -1;
      for (let j = 0; j < rest.length; j++) if (artistKeys(rest[j])[0] !== prev) { i = j; break; }
      out.push(rest.splice(i < 0 ? 0 : i, 1)[0]);
    }
    return out;
  };
  const capPerArtist = (list: TvTrack[], max: number, limit: number): TvTrack[] => {
    const count: { [k: string]: number } = {};
    const out: TvTrack[] = [];
    for (const t of list) {
      const k = artistKeys(t)[0] || '';
      if ((count[k] || 0) >= max) continue;
      count[k] = (count[k] || 0) + 1;
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  };

  // ── Escuchado recientemente ──
  const recentTracks = played.map((p) => p.track);
  const windowList = played.slice(0, 60);
  const albumHits: { [k: string]: number } = {};
  for (const p of windowList) {
    const al = albumOf[p.track.id];
    if (al && al.tracks.length > 1) albumHits[al.key] = (albumHits[al.key] || 0) + 1;
  }
  const recent: RecentItem[] = [];
  const seenAlbum: { [k: string]: boolean } = {};
  const seenTrack: { [k: string]: boolean } = {};
  for (const p of windowList) {
    const al = albumOf[p.track.id];
    if (al && (albumHits[al.key] || 0) >= 2) {
      if (seenAlbum[al.key]) continue;
      seenAlbum[al.key] = true;
      recent.push({ kind: 'album', album: al, at: p.stat.last });
    } else {
      if (seenTrack[p.track.id]) continue;
      seenTrack[p.track.id] = true;
      recent.push({ kind: 'track', track: p.track, at: p.stat.last });
    }
    if (recent.length >= 12) break;
  }

  // ── Mixes ──
  const rand = rng(`mixes|${day}`);
  let seeds: ArtistInfo[];
  if (hasHistory || input.favorites.length) {
    seeds = Object.keys(artistAff)
      .sort((a, b) => artistAff[b] - artistAff[a])
      .map((k) => artists[k])
      .filter((a) => !!a);
  } else {
    seeds = shuffle(
      Object.keys(artists)
        .map((k) => artists[k])
        .filter((a) => a.tracks.length >= 4)
        .sort((a, b) => b.tracks.length - a.tracks.length)
        .slice(0, 12),
      rand,
    );
  }
  const mixes: Mix[] = [];
  const used: { [k: string]: boolean } = {};
  for (const seed of seeds) {
    if (mixes.length >= 6) break;
    if (used[seed.key]) continue;
    const similar = similarTo(seed, 6);
    let total = seed.tracks.length;
    for (const a of similar) total += a.tracks.length;
    if (total < 6) continue;
    used[seed.key] = true;
    const r = rng(`${seed.key}|${day}`);
    const prefCache: { [id: string]: number } = {};
    const pref = (t: TvTrack) =>
      prefCache[t.id] !== undefined ? prefCache[t.id] : (prefCache[t.id] = playWeight(stats[t.id], now) + (favIds[t.id] ? 2 : 0) + r() * 1.5);
    const own = seed.tracks.slice().sort((a, b) => pref(b) - pref(a)).slice(0, similar.length ? 12 : 30);
    const ownIds: { [id: string]: boolean } = {};
    for (const t of own) ownIds[t.id] = true;
    const per = Math.max(3, Math.ceil(18 / Math.max(1, similar.length)));
    let others: TvTrack[] = [];
    for (const a of similar) others = others.concat(a.tracks.slice().sort((x, y) => pref(y) - pref(x)).filter((t) => !ownIds[t.id]).slice(0, per));
    const all: TvTrack[] = [];
    const inMix: { [id: string]: boolean } = {};
    for (const t of own.concat(others)) {
      if (inMix[t.id] || all.length >= 30) continue;
      inMix[t.id] = true;
      all.push(t);
    }
    const covers: TvTrack[] = [];
    const coverSeen: { [k: string]: boolean } = {};
    for (const t of own.concat(others)) {
      if (!t.art || coverSeen[t.art]) continue;
      coverSeen[t.art] = true;
      covers.push(t);
      if (covers.length >= 4) break;
    }
    const names = [seed.name].concat(similar.slice(0, 3).map((a) => a.name));
    mixes.push({
      id: `mix:${seed.key}`,
      title: `Mix de ${seed.name}`,
      subtitle: names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : `Lo mejor de ${seed.name}`,
      artist: seed.name,
      covers,
      tracks: spread(shuffle(all, r)),
    });
  }

  // ── Canciones para ti ──
  const r2 = rng(`foryou|${day}`);
  const fresh = (t: TvTrack) => {
    const s = stats[t.id];
    return !s || s.plays === 0 || (s.plays <= 1 && now - s.last > 60 * DAY);
  };
  const addedBoost = (t: TvTrack) => (t.addedAt && now - t.addedAt < 30 * DAY ? 0.3 : 0);
  const forYou = capPerArtist(
    tracks
      .filter(fresh)
      .map((t) => ({ t, s: (hasHistory ? 2 * affOf(t) + genreAffOf(t) : 0) + addedBoost(t) + r2() * (hasHistory ? 0.35 : 1) }))
      .filter((x) => !hasHistory || x.s > 0.4)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t),
    3,
    30,
  );

  // ── Álbumes para ti ──
  const r3 = rng(`albums|${day}`);
  const albumScore = (a: Group) => {
    let playedCount = 0;
    for (const t of a.tracks) if ((stats[t.id] ? stats[t.id].plays : 0) > 0) playedCount++;
    if (a.tracks.length < 2 || playedCount / a.tracks.length >= 0.34) return -1;
    const aff = maxOf(a.tracks.map(affOf));
    const gen = maxOf(a.tracks.map(genreAffOf));
    return hasHistory ? 2 * aff + gen + r3() * 0.3 - (aff + gen > 0 ? 0 : 1) : r3();
  };
  const albumCount: { [k: string]: number } = {};
  const albumsForYou = albums
    .map((a) => ({ a, s: albumScore(a) }))
    .filter((x) => x.s > (hasHistory ? 0.2 : -0.5))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.a)
    .filter((a) => {
      const k = norm(artistOf(a.tracks[0]));
      albumCount[k] = (albumCount[k] || 0) + 1;
      return albumCount[k] <= 2;
    })
    .slice(0, 12);

  // ── Para volver a escuchar ──
  const r4 = rng(`again|${day}`);
  const again = capPerArtist(
    pool
      .filter((t) => {
        const s = stats[t.id];
        const old = !s || !s.last || now - s.last > 14 * DAY;
        return old && ((s ? s.plays : 0) >= 2 || !!favIds[t.id]);
      })
      .map((t) => {
        const plays = stats[t.id] ? stats[t.id].plays : 0;
        return { t, s: plays * (favIds[t.id] ? 1.6 : 1) + (favIds[t.id] ? 2 : 0) + r4() * 1.5 };
      })
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t),
    4,
    30,
  );

  // ── Agregadas recientemente ──
  const added = albums
    .map((a) => ({ a, at: maxOf(a.tracks.map((t) => t.addedAt || 0)) }))
    .filter((x) => x.at > 0)
    .sort((x, y) => y.at - x.at)
    .slice(0, 12)
    .map((x) => x.a);

  // ── Tus artistas ──
  const topArtists: TopArtist[] = Object.keys(artistAff)
    .sort((a, b) => artistAff[b] - artistAff[a])
    .slice(0, 12)
    .map((k) => {
      const a = artists[k];
      let cover: TvTrack | null = null;
      for (const t of a.tracks) if (t.art) { cover = t; break; }
      return { name: a.name, key: k, cover, tracks: a.tracks };
    });

  return { hasHistory, recent, recentTracks, mixes, forYou, albumsForYou, again, added, topArtists };
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}
