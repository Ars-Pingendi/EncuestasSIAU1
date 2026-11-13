// Conexión con Pipo para Windows (servidor en la red de la casa).
export interface TvTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  trackNo: number;
  discNo: number;
  year: number;
  durationMs: number;
  folder: string;
  addedAt: number;
  source: string;
  art: string | null;
}

export interface TvPlaylist {
  id: string;
  name: string;
  trackIds: string[];
}

export interface LibraryPayload {
  name: string;
  version: string;
  tracks: TvTrack[];
  playlists: TvPlaylist[];
  favTracks: string[];
  /** Pipo para Windows anuncia si comparte películas y series; Android no. */
  features?: { music: boolean; video: boolean };
}

export interface TvVideo {
  id: string;
  kind: 'movie' | 'episode';
  /** Película: su título. Episodio: título del episodio (puede estar vacío). */
  title: string;
  series: string;
  seriesKey: string;
  season: number;
  episode: number;
  year: number;
  durationMs: number;
  size: number;
  addedAt: number;
  width: number;
  height: number;
  vcodec: string;
  langs: string[];
  subs: number;
}

export interface VideosPayload {
  enabled: boolean;
  scanning: boolean;
  count: number;
  items: TvVideo[];
}

export type PlayMode = 'direct' | 'remux' | 'transcode';

export interface PlanAudio {
  index: number;
  label: string;
  lang: string;
  codec: string;
  channels: number;
  active: boolean;
}

export interface PlanSub {
  id: string;
  label: string;
  lang: string;
  forced: boolean;
  external: boolean;
  default: boolean;
}

export interface VideoPlan {
  id: string;
  title: string;
  mode: PlayMode;
  reason: string;
  /** Ruta relativa al servidor (ya incluye el código de acceso). */
  url: string;
  startAt: number;
  durationMs: number;
  container: 'native' | 'mp4' | 'ts';
  audioIndex: number;
  audio: PlanAudio[];
  subs: PlanSub[];
  info: string;
}

export interface PlanRequest {
  caps: string;
  audio?: number;
  start?: number;
  force?: PlayMode;
  c?: 'mp4' | 'ts';
}

export interface Connection {
  base: string; // http://192.168.1.20:37373
  token: string;
  name: string;
}

const KEY = 'pipo:conexion';

export function savedConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Connection) : null;
  } catch {
    return null;
  }
}

export function forgetConnection() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // sin almacenamiento
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

export function normalizeAddress(input: string): string {
  let a = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  a = a.replace(/,/g, '.').replace(/\s+/g, '');
  if (!/:\d+$/.test(a)) a += ':37373';
  return `http://${a}`;
}

export async function pair(address: string, pin: string): Promise<Connection> {
  const base = normalizeAddress(address);
  let res: Response;
  try {
    // text/plain evita la verificación previa de CORS.
    res = await withTimeout(
      fetch(`${base}/pipo/pair`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ pin: pin.trim() }) }),
      10000,
      'El PC no respondió.',
    );
  } catch {
    throw new Error('No se encontró Pipo en esa dirección. Revisa que el PC o el teléfono esté encendido, con «Compartir mi música con la TV» activado y en la misma red que la TV.');
  }
  if (res.status === 403) throw new Error('El código no es correcto. Míralo en Pipo › Ajustes › Pipo en la TV (en el PC o en el teléfono).');
  if (!res.ok) throw new Error(`El PC respondió con un error (${res.status}).`);
  const data = (await res.json()) as { token: string; name: string };
  const conn: Connection = { base, token: data.token, name: data.name };
  try {
    localStorage.setItem(KEY, JSON.stringify(conn));
  } catch {
    // sin almacenamiento: la conexión dura hasta cerrar la app
  }
  return conn;
}

export class Unauthorized extends Error {}

export async function loadLibrary(conn: Connection): Promise<LibraryPayload> {
  let res: Response;
  try {
    res = await withTimeout(fetch(`${conn.base}/pipo/library?t=${conn.token}`), 20000, 'Tiempo agotado');
  } catch {
    throw new Error(`No hay conexión con «${conn.name}». ¿Está encendido y con «Compartir mi música con la TV» activado?`);
  }
  if (res.status === 401) throw new Unauthorized('La TV ya no está emparejada.');
  if (!res.ok) throw new Error(`Error del equipo (${res.status}).`);
  return (await res.json()) as LibraryPayload;
}

export function mediaUrl(conn: Connection, id: string) {
  return `${conn.base}/pipo/media/${encodeURIComponent(id)}?t=${conn.token}`;
}

export function artUrl(conn: Connection, art: string | null): string | null {
  if (!art) return null;
  if (art.charAt(0) === '/') return `${conn.base}${art}?t=${conn.token}`;
  return art;
}

// ───────────────────────────── Videos ─────────────────────────────

/** null si el equipo no comparte videos (Pipo para Android). */
export async function loadVideos(conn: Connection): Promise<VideosPayload | null> {
  let res: Response;
  try {
    res = await withTimeout(fetch(`${conn.base}/pipo/videos?t=${conn.token}`), 30000, 'Tiempo agotado');
  } catch {
    throw new Error(`No hay conexión con «${conn.name}».`);
  }
  if (res.status === 404) return null;
  if (res.status === 401) throw new Unauthorized('La TV ya no está emparejada.');
  if (!res.ok) throw new Error(`Error del equipo (${res.status}).`);
  return (await res.json()) as VideosPayload;
}

export async function fetchPlan(conn: Connection, id: string, req: PlanRequest): Promise<VideoPlan> {
  const q = [`caps=${encodeURIComponent(req.caps)}`, `t=${conn.token}`];
  if (req.audio !== undefined) q.push(`audio=${req.audio}`);
  if (req.start) q.push(`start=${req.start.toFixed(3)}`);
  if (req.force) q.push(`force=${req.force}`);
  if (req.c) q.push(`c=${req.c}`);
  let res: Response;
  try {
    res = await withTimeout(fetch(`${conn.base}/pipo/video/${encodeURIComponent(id)}/play?${q.join('&')}`), 60000, 'Tiempo agotado');
  } catch {
    throw new Error(`No hay conexión con «${conn.name}». ¿Sigue encendido el PC?`);
  }
  if (res.status === 401) throw new Unauthorized('La TV ya no está emparejada.');
  if (!res.ok) {
    let msg = `Error del equipo (${res.status}).`;
    try {
      msg = ((await res.json()) as { error?: string }).error || msg;
    } catch {
      // sin detalle
    }
    throw new Error(msg);
  }
  return (await res.json()) as VideoPlan;
}

export function absoluteUrl(conn: Connection, path: string): string {
  return path.charAt(0) === '/' ? `${conn.base}${path}` : path;
}

export function videoImageUrl(conn: Connection, id: string, poster = false): string {
  return `${conn.base}/pipo/video/${encodeURIComponent(id)}/${poster ? 'poster' : 'thumb'}?t=${conn.token}`;
}

export function subtitleUrl(conn: Connection, id: string, subId: string): string {
  return `${conn.base}/pipo/video/${encodeURIComponent(id)}/sub/${subId}.vtt?t=${conn.token}`;
}

/** Descarga un texto (subtítulos) con un límite de tiempo largo: el PC puede tener que extraerlo del video. */
export async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const res = await withTimeout(fetch(url), timeoutMs, 'Tiempo agotado');
  if (!res.ok) {
    let msg = `Error (${res.status})`;
    try {
      msg = ((await res.json()) as { error?: string }).error || msg;
    } catch {
      // sin detalle
    }
    throw new Error(msg);
  }
  return res.text();
}
