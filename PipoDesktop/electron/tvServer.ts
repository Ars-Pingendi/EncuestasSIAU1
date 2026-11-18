// Servidor para Pipo en la TV (LG webOS): comparte la biblioteca por la red de la casa.
// Solo lectura, con emparejamiento por código. No depende de Electron para poder probarse con Node.
import crypto from 'node:crypto';
import http from 'node:http';
import os from 'node:os';
import type { Track } from '../shared/types';
import { cors, sendJson, sendWebResponse, serveFile } from './httpUtil';
import type { Library } from './library';
import type { VideoService } from './videoService';
import type { JsonStore } from './store';
import type { YouTube } from './youtube';
import type { TvRemote } from './tvRemote';
import { videoIdOk, type YtVideo } from './ytVideo';

export const TV_PORT = 37373;

export interface TvStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  addresses: string[];
  pin: string;
  paired: number;
  error?: string;
}

interface Saved {
  enabled: boolean;
  pin: string;
  tokens: string[];
}

export interface TvServerOptions {
  store: JsonStore;
  library: Library;
  youtube: YouTube;
  appVersion: string;
  hostName?: string;
  /** Películas y series (opcional). */
  video?: VideoService;
  /** Videos de YouTube para la TV (opcional). */
  ytVideo?: YtVideo;
  /** Órdenes «Reproducir / Ver en la TV» (opcional). */
  remote?: TvRemote;
}

function newPin(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
    }
  }
  // Primero las redes domésticas típicas.
  const score = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return out.sort((a, b) => score(a) - score(b));
}

export class TvServer {
  private server: http.Server | null = null;
  private port = TV_PORT;
  private saved: Saved;
  private failures = 0;
  private lastError: string | undefined;

  constructor(private readonly o: TvServerOptions) {
    const s = o.store.get<Saved>('tv');
    this.saved = { enabled: s?.enabled ?? false, pin: s?.pin ?? newPin(), tokens: s?.tokens ?? [] };
  }

  private persist() {
    this.o.store.set('tv', this.saved, 0);
  }

  status(): TvStatus {
    return {
      enabled: this.saved.enabled,
      running: !!this.server?.listening,
      port: this.port,
      addresses: lanAddresses(),
      pin: this.saved.pin,
      paired: this.saved.tokens.length,
      error: this.lastError,
    };
  }

  async setEnabled(on: boolean): Promise<TvStatus> {
    this.saved.enabled = on;
    this.persist();
    if (on) await this.start();
    else this.stop();
    return this.status();
  }

  regeneratePin(): TvStatus {
    this.saved.pin = newPin();
    this.failures = 0;
    this.persist();
    return this.status();
  }

  unpairAll(): TvStatus {
    this.saved.tokens = [];
    this.persist();
    return this.status();
  }

  async startIfEnabled() {
    if (this.saved.enabled) await this.start();
  }

  async start(): Promise<void> {
    if (this.server?.listening) return;
    this.lastError = undefined;
    for (let port = TV_PORT; port < TV_PORT + 8; port++) {
      try {
        await this.listen(port);
        this.port = port;
        return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
          this.lastError = (err as Error).message;
          return;
        }
      }
    }
    this.lastError = 'Los puertos de Pipo están ocupados por otro programa.';
  }

  private listen(port: number) {
    return new Promise<void>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res).catch((err) => {
          if (!res.headersSent) sendJson(res, 500, { error: String((err as Error).message ?? err) });
          else res.destroy();
        });
      });
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => {
        server.removeListener('error', reject);
        this.server = server;
        resolve();
      });
    });
  }

  stop() {
    this.server?.close();
    this.server = null;
  }

  // ───────────────────────────── Peticiones ─────────────────────────────

  private authorized(req: http.IncomingMessage, url: URL): boolean {
    const token = url.searchParams.get('t') ?? String(req.headers['x-pipo-token'] ?? '');
    return !!token && this.saved.tokens.includes(token);
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.setEncoding('utf8');
      req.on('data', (chunk: string) => {
        data += chunk;
        if (data.length > 4096) {
          reject(new Error('Petición demasiado grande'));
          req.destroy();
        }
      });
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse) {
    cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://pipo.local');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== 'pipo') return sendJson(res, 404, { error: 'No encontrado' });
    const route = parts[1] ?? '';

    if (route === 'info') {
      return sendJson(res, 200, {
        app: 'pipo',
        name: this.o.hostName ?? os.hostname(),
        version: this.o.appVersion,
        features: this.features(),
      });
    }

    if (route === 'pair' && req.method === 'POST') {
      // El cuerpo llega como texto para evitar la verificación previa de CORS en televisores antiguos.
      let pin = '';
      try {
        pin = String(JSON.parse(await this.readBody(req)).pin ?? '').trim();
      } catch {
        pin = '';
      }
      if (pin && pin === this.saved.pin) {
        const token = crypto.randomBytes(16).toString('hex');
        this.saved.tokens = [...this.saved.tokens.slice(-9), token];
        this.failures = 0;
        this.persist();
        return sendJson(res, 200, { token, name: this.o.hostName ?? os.hostname() });
      }
      // Tras varios intentos fallidos el código cambia (evita adivinarlo).
      if (++this.failures >= 8) this.regeneratePin();
      await new Promise((r) => setTimeout(r, 800));
      return sendJson(res, 403, { error: 'Código incorrecto' });
    }

    if (!this.authorized(req, url)) return sendJson(res, 401, { error: 'Empareja la TV de nuevo' });

    if (route === 'library') return sendJson(res, 200, this.libraryPayload());

    // Películas y series
    if (route === 'videos') {
      return this.o.video ? sendJson(res, 200, this.o.video.payload()) : sendJson(res, 404, { error: 'Este equipo no comparte videos' });
    }
    if (route === 'video') {
      if (!this.o.video) return sendJson(res, 404, { error: 'Este equipo no comparte videos' });
      return this.o.video.handle(req, res, url, parts, url.searchParams.get('t') ?? '');
    }

    if (route === 'media') {
      const id = parts.slice(2).join('/');
      if (id.startsWith('yt:')) {
        // De YouTube: la descarga si existe; si no, el audio que yt-dlp va trayendo (como en la app).
        const videoId = id.slice(3);
        const file = this.o.youtube.downloadFile(videoId);
        if (file) return serveFile(req, res, file);
        if (!videoIdOk(videoId)) return sendJson(res, 404, { error: 'Canción no disponible' });
        return sendWebResponse(res, await this.o.youtube.streamResponse(videoId, req.headers.range ?? null));
      }
      const file = this.o.library.pathForId(id);
      return file ? serveFile(req, res, file) : sendJson(res, 404, { error: 'Canción no disponible' });
    }

    // Órdenes del PC para la TV (petición larga)
    if (route === 'remote' && this.o.remote) {
      const since = Number(url.searchParams.get('since') ?? -1);
      const result = await this.o.remote.poll(Number.isFinite(since) ? since : -1, 20_000, (cancel) => res.on('close', cancel));
      if (res.writableEnded || res.destroyed) return;
      return sendJson(res, 200, result);
    }

    // Registro de YouTube (para saber por qué un video no carga)
    if (route === 'log') {
      const text = Buffer.from(this.o.ytVideo ? this.o.ytVideo.dump() : '');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': text.length, 'Cache-Control': 'no-store' });
      return res.end(text);
    }

    // YouTube: búsqueda, calidades y archivos (mismo protocolo que Pipo para Android)
    if (route === 'yt' && this.o.ytVideo) return this.youtube(req, res, url, parts);
    if (route === 'art') {
      const file = this.o.library.artPath(parts[2] ?? '');
      return file ? serveFile(req, res, file, { cache: true }) : sendJson(res, 404, { error: 'Sin carátula' });
    }
    if (route === 'dlart') {
      const file = this.o.youtube.downloadArt(parts[2] ?? '');
      return file ? serveFile(req, res, file, { cache: true }) : sendJson(res, 404, { error: 'Sin carátula' });
    }
    return sendJson(res, 404, { error: 'No encontrado' });
  }

  private features() {
    return { music: true, video: !!this.o.video, youtube: !!this.o.ytVideo && this.o.youtube.available(), remote: !!this.o.remote };
  }

  private async youtube(req: http.IncomingMessage, res: http.ServerResponse, url: URL, parts: string[]) {
    const yv = this.o.ytVideo!;
    const first = parts[2] ?? '';
    try {
      if (first === 'search') {
        const q = (url.searchParams.get('q') ?? '').trim();
        if (!q) return sendJson(res, 400, { error: 'Escribe qué buscar' });
        const t0 = Date.now();
        const items = await this.o.youtube.search(q, url.searchParams.get('mode') === 'songs' ? 'songs' : 'videos');
        yv.log(`TV: búsqueda «${q}»: ${items.length} resultados en ${Date.now() - t0} ms`);
        return sendJson(res, 200, {
          items: items.map((i) => ({ id: `yt:${i.videoId}`, title: i.title, channel: i.artist, durationMs: i.durationMs, thumb: i.thumbnail || null })),
          next: null,
        });
      }
      if (!videoIdOk(first)) return sendJson(res, 404, { error: 'Video no encontrado' });
      const kind = parts[3] ?? '';
      if (kind === 'play') {
        const token = url.searchParams.get('t') ?? '';
        const forceDirect = url.searchParams.get('force') === 'direct';
        yv.log(`TV: la TV pide el video ${first}${forceDirect ? ' (con audio incluido)' : ''}`);
        const plan = await yv.plan(first, '/pipo/yt', `?t=${encodeURIComponent(token)}`, Number(url.searchParams.get('h') ?? 0) || 0, forceDirect);
        yv.log(`TV: plan ${first}: ${plan.mode} ${plan.info}`);
        return sendJson(res, 200, plan);
      }
      if (kind === 'v' || kind === 'm' || kind === 'a' || kind === 'aw') {
        return sendWebResponse(res, await yv.serve(first, kind, Number(parts[4] ?? 0) || 0, req.headers.range ?? null));
      }
      return sendJson(res, 404, { error: 'No encontrado' });
    } catch (err) {
      yv.log(`TV: yt/${first}: ERROR ${(err as Error).message}`);
      if (!res.headersSent) return sendJson(res, 500, { error: (err as Error).message });
      res.destroy();
    }
  }

  /** Canción tal como la entiende la app de la TV. */
  tvTrack(t: Track) {
    const art = (): string | null => {
      if (t.artId) return `/pipo/art/${encodeURIComponent(t.artId)}`;
      if (t.videoId && this.o.youtube.downloadArt(t.videoId)) return `/pipo/dlart/${t.videoId}`;
      return t.artworkUrl && /^https:\/\//.test(t.artworkUrl) ? t.artworkUrl : null;
    };
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumArtist: t.albumArtist,
      genre: t.genre,
      trackNo: t.trackNo,
      discNo: t.discNo,
      year: t.year,
      durationMs: t.durationMs,
      folder: t.folder,
      addedAt: t.addedAt,
      source: t.source,
      art: art(),
    };
  }

  /** «Reproducir / Ver en la TV» desde el PC. Devuelve si hay una TV conectada. */
  sendRemote(type: 'play' | 'playNext' | 'enqueue' | 'video', tracks: Track[], start = 0): { delivered: boolean; running: boolean } {
    if (!this.o.remote || !this.server) return { delivered: false, running: !!this.server };
    if (type === 'video' && tracks[0]?.videoId) this.o.ytVideo?.prepare(tracks[0].videoId);
    const delivered = this.o.remote.send(type, tracks.map((t) => this.tvTrack(t)), start);
    return { delivered, running: true };
  }

  remoteConnected(): boolean {
    return !!this.o.remote && this.o.remote.connected();
  }

  logText(): string {
    return this.o.ytVideo ? this.o.ytVideo.dump() : '';
  }

  private libraryPayload() {
    const art = (t: Track): string | null => {
      if (t.artId) return `/pipo/art/${encodeURIComponent(t.artId)}`;
      if (t.videoId && this.o.youtube.downloadArt(t.videoId)) return `/pipo/dlart/${t.videoId}`;
      return t.artworkUrl && /^https:\/\//.test(t.artworkUrl) ? t.artworkUrl : null;
    };
    const local = this.o.library.snapshot().tracks;
    const downloaded = this.o.youtube.listDownloads().map((d) => d.track);
    const tracks = [...local, ...downloaded].map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      albumArtist: t.albumArtist,
      genre: t.genre,
      trackNo: t.trackNo,
      discNo: t.discNo,
      year: t.year,
      durationMs: t.durationMs,
      folder: t.folder,
      addedAt: t.addedAt,
      source: t.source,
      art: art(t),
    }));
    const user = this.o.store.get<{ playlists?: { id: string; name: string; trackIds: string[] }[]; favTracks?: string[]; favAlbums?: string[] }>('usuario') ?? {};
    return {
      name: this.o.hostName ?? os.hostname(),
      version: this.o.appVersion,
      tracks,
      features: this.features(),
      playlists: (user.playlists ?? []).map((p) => ({ id: p.id, name: p.name, trackIds: p.trackIds })),
      favTracks: user.favTracks ?? [],
    };
  }
}
