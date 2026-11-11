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
