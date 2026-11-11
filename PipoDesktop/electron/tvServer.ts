// Servidor para Pipo en la TV (LG webOS): comparte la biblioteca por la red de la casa.
// Solo lectura, con emparejamiento por código. No depende de Electron para poder probarse con Node.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import type { Track } from '../shared/types';
import { mimeFor } from './files';
import type { Library } from './library';
import type { JsonStore } from './store';
import type { YouTube } from './youtube';

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
          if (!res.headersSent) this.json(res, 500, { error: String((err as Error).message ?? err) });
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

  private cors(res: http.ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, X-Pipo-Token');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  }

  private json(res: http.ServerResponse, status: number, body: unknown) {
    const data = Buffer.from(JSON.stringify(body));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
    res.end(data);
  }

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
    this.cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url ?? '/', 'http://pipo.local');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== 'pipo') return this.json(res, 404, { error: 'No encontrado' });
    const route = parts[1] ?? '';

    if (route === 'info') {
      return this.json(res, 200, { app: 'pipo', name: this.o.hostName ?? os.hostname(), version: this.o.appVersion });
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
        return this.json(res, 200, { token, name: this.o.hostName ?? os.hostname() });
      }
      // Tras varios intentos fallidos el código cambia (evita adivinarlo).
      if (++this.failures >= 8) this.regeneratePin();
      await new Promise((r) => setTimeout(r, 800));
      return this.json(res, 403, { error: 'Código incorrecto' });
    }

    if (!this.authorized(req, url)) return this.json(res, 401, { error: 'Empareja la TV de nuevo' });

    if (route === 'library') return this.json(res, 200, this.libraryPayload());

    if (route === 'media') {
      const id = parts.slice(2).join('/');
      const file = id.startsWith('yt:') ? this.o.youtube.downloadFile(id.slice(3)) : this.o.library.pathForId(id);
      return file ? this.serveFile(req, res, file, false) : this.json(res, 404, { error: 'Canción no disponible' });
    }
    if (route === 'art') {
      const file = this.o.library.artPath(parts[2] ?? '');
      return file ? this.serveFile(req, res, file, true) : this.json(res, 404, { error: 'Sin carátula' });
    }
    if (route === 'dlart') {
      const file = this.o.youtube.downloadArt(parts[2] ?? '');
      return file ? this.serveFile(req, res, file, true) : this.json(res, 404, { error: 'Sin carátula' });
    }
    return this.json(res, 404, { error: 'No encontrado' });
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
      playlists: (user.playlists ?? []).map((p) => ({ id: p.id, name: p.name, trackIds: p.trackIds })),
      favTracks: user.favTracks ?? [],
    };
  }

  private serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, cache: boolean) {
    let size: number;
    try {
      size = fs.statSync(file).size;
    } catch {
      return this.json(res, 404, { error: 'Archivo no disponible' });
    }
    const headers: Record<string, string | number> = { 'Content-Type': mimeFor(file), 'Accept-Ranges': 'bytes' };
    if (cache) headers['Cache-Control'] = 'max-age=86400';
    const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range ?? ''));
    if (m && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
      let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        res.end();
        return;
      }
      start = Math.max(0, start);
      end = Math.max(start, end);
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  }
}
