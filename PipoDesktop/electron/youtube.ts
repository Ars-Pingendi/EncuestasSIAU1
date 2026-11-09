// YouTube sin anuncios: búsqueda (API interna de YouTube Music / YouTube), reproducción
// del audio en streaming a través del protocolo propio y descargas para escuchar sin internet.
// La extracción de los flujos de audio la hace yt-dlp (incluido con la app y actualizable).
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { DownloadEvent, DownloadInfo, ResolveResult, Track, YtItem, YtSearchKind } from '../shared/types';
import type { JsonStore } from './store';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const WEB_REMIX_VERSION = '1.20260707.12.00';
const WEB_VERSION = '2.20260708.00.00';
const SONGS_PARAMS = 'EgWKAQIIAWoKEAoQAxAEEAkQBQ==';
const VIDEOS_PARAMS = 'EgIQAQ==';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const CHUNK = 8 * 1024 * 1024;
const RESOLVE_TTL = 60 * 60 * 1000;

interface Resolved {
  url: string;
  headers: Record<string, string>;
  size: number;
  mime: string;
  at: number;
}

export interface YouTubeOptions {
  store: JsonStore;
  fetch: Fetch;
  binDir: string;
  bundledBinDir: string;
  cacheDir: string;
  downloadsDir: string;
  nodeRuntime?: string;
  onDownload: (e: DownloadEvent) => void;
}

export function ytTrack(item: YtItem): Track {
  return {
    id: `yt:${item.videoId}`,
    source: 'youtube',
    videoId: item.videoId,
    title: item.title,
    artist: item.artist,
    album: item.album || (item.kind === 'song' ? '' : 'YouTube'),
    albumArtist: '',
    genre: '',
    trackNo: 0,
    discNo: 0,
    year: 0,
    durationMs: item.durationMs,
    folder: '',
    fileName: '',
    addedAt: Date.now(),
    size: 0,
    artworkUrl: item.thumbnail,
  };
}

export class YouTube {
  private resolved = new Map<string, Resolved>();
  private inflight = new Map<string, Promise<Resolved>>();
  private downloads = new Map<string, DownloadInfo>();
  private dlQueue: Track[] = [];
  private dlActive: { videoId: string; proc: ChildProcess | null; cancelled: boolean } | null = null;
  private exe: string | null = null;
  private jsArgs: string[] | null = null;

  constructor(private readonly o: YouTubeOptions) {
    fs.mkdirSync(o.downloadsDir, { recursive: true });
    fs.mkdirSync(o.cacheDir, { recursive: true });
    const saved = o.store.get<DownloadInfo[]>('descargas') ?? [];
    for (const d of saved) if (fs.existsSync(d.file)) this.downloads.set(d.videoId, d);
  }

  // ───────────────────────────── yt-dlp ─────────────────────────────

  private exeName(): string {
    return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  }

  /** Copia el yt-dlp incluido a una carpeta escribible (para poder actualizarlo con -U). */
  ytdlpPath(): string | null {
    if (this.exe && fs.existsSync(this.exe)) return this.exe;
    const name = this.exeName();
    const bundled = path.join(this.o.bundledBinDir, name);
    const local = path.join(this.o.binDir, name);
    try {
      if (fs.existsSync(bundled)) {
        const st = fs.statSync(bundled);
        const stamp = `${st.size}-${Math.round(st.mtimeMs)}`;
        const prev = this.o.store.get<string>('ytdlpOrigen');
        if (!fs.existsSync(local) || prev !== stamp) {
          fs.mkdirSync(this.o.binDir, { recursive: true });
          fs.copyFileSync(bundled, local);
          if (process.platform !== 'win32') fs.chmodSync(local, 0o755);
          this.o.store.set('ytdlpOrigen', stamp, 0);
        }
      }
    } catch (err) {
      console.error('No se pudo preparar yt-dlp', err);
    }
    if (fs.existsSync(local)) this.exe = local;
    else if (fs.existsSync(bundled)) this.exe = bundled;
    else this.exe = process.platform === 'win32' ? null : 'yt-dlp';
    return this.exe;
  }

  available(): boolean {
    return this.ytdlpPath() !== null;
  }

  private run(args: string[], onLine?: (line: string) => void, timeoutMs = 120_000, track?: (p: ChildProcess) => void) {
    return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const exe = this.ytdlpPath();
      if (!exe) return reject(new Error('No se encontró el componente de YouTube (yt-dlp).'));
      const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
      // El ejecutable de la app puede funcionar como Node.js para que yt-dlp resuelva los retos de YouTube.
      if (this.o.nodeRuntime) env.ELECTRON_RUN_AS_NODE = '1';
      const proc = spawn(exe, ['--ignore-config', '--cache-dir', this.o.cacheDir, ...args], {
        windowsHide: true,
        env,
      });
      track?.(proc);
      let stdout = '';
      let stderr = '';
      let buf = '';
      proc.stdout.setEncoding('utf8');
      proc.stderr.setEncoding('utf8');
      proc.stdout.on('data', (d: string) => {
        stdout += d;
        if (onLine) {
          buf += d;
          let i: number;
          while ((i = buf.search(/[\r\n]/)) >= 0) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (line) onLine(line);
          }
        }
      });
      proc.stderr.on('data', (d: string) => (stderr += d));
      const timer = setTimeout(() => proc.kill(), timeoutMs);
      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  }

  private async jsRuntimeArgs(): Promise<string[]> {
    if (this.jsArgs) return this.jsArgs;
    this.jsArgs = [];
    if (!this.o.nodeRuntime) return this.jsArgs;
    try {
      const help = await this.run(['--help'], undefined, 30_000);
      if (help.stdout.includes('--js-runtimes')) this.jsArgs = ['--js-runtimes', `node:${this.o.nodeRuntime}`];
    } catch {
      // sin yt-dlp: no importa aquí
    }
    return this.jsArgs;
  }

  async version(): Promise<string> {
    try {
      const r = await this.run(['--version'], undefined, 30_000);
      return r.stdout.trim() || 'desconocida';
    } catch {
      return 'no disponible';
    }
  }

  async update(): Promise<string> {
    const r = await this.run(['-U'], undefined, 180_000);
    this.jsArgs = null;
    const out = `${r.stdout}\n${r.stderr}`;
    if (/up to date|está actualizado/i.test(out)) return 'El componente de YouTube ya está al día.';
    if (/Updated yt-dlp to|Updating to/i.test(out)) return 'Componente de YouTube actualizado.';
    if (r.code !== 0) throw new Error(friendlyError(out) ?? 'No se pudo actualizar el componente de YouTube.');
    return 'Actualización revisada.';
  }

  // ───────────────────────────── Búsqueda ─────────────────────────────

  async search(query: string, kind: YtSearchKind): Promise<YtItem[]> {
    const q = query.trim();
    if (!q) return [];
    try {
      const items = kind === 'songs' ? await this.searchMusic(q) : await this.searchVideos(q);
      if (items.length) return items;
    } catch (err) {
      console.warn('Búsqueda directa falló, se usa yt-dlp', err);
    }
    return this.searchWithYtdlp(q, kind);
  }

  private async innertube(host: string, client: string, version: string, clientId: string, body: object) {
    const res = await this.o.fetch(`https://${host}/youtubei/v1/search?prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
        Origin: `https://${host}`,
        Referer: `https://${host}/`,
        'X-YouTube-Client-Name': clientId,
        'X-YouTube-Client-Version': version,
      },
      body: JSON.stringify({
        context: { client: { clientName: client, clientVersion: version, hl: 'es', gl: 'CO' } },
        ...body,
      }),
    });
    if (!res.ok) throw new Error(`YouTube respondió ${res.status}`);
    return res.json();
  }

  private async searchMusic(query: string): Promise<YtItem[]> {
    const data = await this.innertube('music.youtube.com', 'WEB_REMIX', WEB_REMIX_VERSION, '67', {
      query,
      params: SONGS_PARAMS,
    });
    const out: YtItem[] = [];
    const seen = new Set<string>();
    for (const r of findAll(data, 'musicResponsiveListItemRenderer')) {
      const videoId: string | undefined =
        r?.playlistItemData?.videoId ??
        r?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint
          ?.watchEndpoint?.videoId;
      if (!videoId || seen.has(videoId)) continue;
      const cols = (r.flexColumns ?? []).map((c: any) => c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []);
      const title = (cols[0] ?? []).map((x: any) => x.text).join('').trim();
      const runs: any[] = cols[1] ?? [];
      const pageType = (x: any) => x?.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
        ?.browseEndpointContextMusicConfig?.pageType as string | undefined;
      const artists = runs.filter((x) => pageType(x) === 'MUSIC_PAGE_TYPE_ARTIST').map((x) => x.text);
      const albumRun = runs.find((x) => pageType(x) === 'MUSIC_PAGE_TYPE_ALBUM');
      const parts = runs.map((x) => x.text).join('').split(' • ').map((s) => s.trim()).filter(Boolean);
      const durText = [...parts, ...cols.flat().map((x: any) => x?.text ?? '')].find((s) => /^\d{1,2}(:\d{2}){1,2}$/.test(s));
      const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
      let thumb: string = thumbs.length ? thumbs[thumbs.length - 1].url : '';
      thumb = thumb ? thumb.replace(/=w\d+-h\d+/, '=w544-h544') : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      if (!title) continue;
      seen.add(videoId);
      out.push({
        videoId,
        title,
        artist: artists.length ? artists.join(', ') : parts[0] && parts[0] !== durText ? parts[0] : '',
        album: albumRun?.text ?? (parts[1] && parts[1] !== durText ? parts[1] : ''),
        durationMs: parseDuration(durText),
        thumbnail: thumb,
        kind: 'song',
      });
    }
    return out;
  }

  private async searchVideos(query: string): Promise<YtItem[]> {
    const data = await this.innertube('www.youtube.com', 'WEB', WEB_VERSION, '1', { query, params: VIDEOS_PARAMS });
    const out: YtItem[] = [];
    const seen = new Set<string>();
    for (const v of findAll(data, 'videoRenderer')) {
      const videoId: string | undefined = v?.videoId;
      const len: string | undefined = v?.lengthText?.simpleText;
      if (!videoId || !len || seen.has(videoId)) continue;
      seen.add(videoId);
      out.push({
        videoId,
        title: (v.title?.runs ?? []).map((x: any) => x.text).join('') || v.title?.simpleText || '',
        artist: v.ownerText?.runs?.[0]?.text ?? v.longBylineText?.runs?.[0]?.text ?? '',
        album: '',
        durationMs: parseDuration(len),
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        kind: 'video',
      });
    }
    return out;
  }

  private async searchWithYtdlp(query: string, kind: YtSearchKind): Promise<YtItem[]> {
    const target =
      kind === 'songs'
        ? `https://music.youtube.com/search?q=${encodeURIComponent(query)}#songs`
        : `ytsearch25:${query}`;
    const r = await this.run(['--flat-playlist', '-J', '--playlist-end', '25', '--no-warnings', target], undefined, 60_000);
    if (r.code !== 0) throw new Error(friendlyError(r.stderr) ?? 'No se pudo buscar en YouTube.');
    const data = JSON.parse(r.stdout);
    return (data.entries ?? [])
      .filter((e: any) => e?.id && String(e.id).length === 11)
      .map((e: any) => ({
        videoId: e.id,
        title: e.title ?? '',
        artist: e.channel ?? e.uploader ?? '',
        album: '',
        durationMs: Math.round((e.duration ?? 0) * 1000),
        thumbnail: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
        kind: kind === 'songs' ? 'song' : 'video',
      }));
  }

  // ───────────────────────────── Reproducción ─────────────────────────────

  private async resolve(videoId: string, force = false): Promise<Resolved> {
    const cached = this.resolved.get(videoId);
    if (!force && cached && Date.now() - cached.at < RESOLVE_TTL) return cached;
    const running = this.inflight.get(videoId);
    if (running) return running;
    const p = (async () => {
      const js = await this.jsRuntimeArgs();
      const r = await this.run(
        [...js, '-J', '--no-playlist', '--no-warnings', '-f', 'bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio/best',
          `https://www.youtube.com/watch?v=${videoId}`],
        undefined,
        90_000,
      );
      if (r.code !== 0) throw new Error(friendlyError(r.stderr) ?? 'No se pudo abrir este video.');
      const info = JSON.parse(r.stdout);
      const fmt = info.requested_formats?.[0] ?? info;
      if (!fmt.url) throw new Error('YouTube no entregó un flujo de audio para este video.');
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries<string>(fmt.http_headers ?? info.http_headers ?? {})) {
        if (/^(user-agent|accept-language|origin|referer)$/i.test(k)) headers[k] = v;
      }
      const ext: string = fmt.ext ?? 'webm';
      const resolved: Resolved = {
        url: fmt.url,
        headers,
        size: fmt.filesize ?? fmt.filesize_approx ?? 0,
        mime: ext === 'm4a' ? 'audio/mp4' : ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : 'audio/webm',
        at: Date.now(),
      };
      this.resolved.set(videoId, resolved);
      return resolved;
    })().finally(() => this.inflight.delete(videoId));
    this.inflight.set(videoId, p);
    return p;
  }

  async prepare(videoId: string): Promise<ResolveResult> {
    if (this.downloadFile(videoId)) return { ok: true };
    try {
      await this.resolve(videoId);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  downloadFile(videoId: string): string | undefined {
    const d = this.downloads.get(videoId);
    return d && fs.existsSync(d.file) ? d.file : undefined;
  }

  downloadArt(videoId: string): string | undefined {
    const file = path.join(this.o.downloadsDir, `${videoId}.jpg`);
    return fs.existsSync(file) ? file : undefined;
  }

  /** Respuesta parcial (206) con un trozo del audio remoto, a partir de la cabecera Range del reproductor. */
  async streamResponse(videoId: string, range: string | null): Promise<Response> {
    let info = await this.resolve(videoId);
    const m = /bytes=(\d*)-(\d*)/.exec(range ?? '');
    const start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : start + CHUNK - 1;
    end = Math.min(end, start + CHUNK - 1);
    if (info.size) end = Math.min(end, info.size - 1);

    const get = (r: Resolved) => this.o.fetch(r.url, { headers: { ...r.headers, Range: `bytes=${start}-${end}` } });
    let res = await get(info);
    if (res.status === 403 || res.status === 410 || res.status === 404) {
      info = await this.resolve(videoId, true);
      res = await get(info);
    }
    if (res.status === 416) return new Response(null, { status: 416, headers: corsHeaders() });
    if (!res.ok) return new Response(null, { status: 502, headers: corsHeaders() });

    const cr = res.headers.get('content-range');
    const total = cr ? Number(cr.split('/')[1]) || info.size : info.size;
    if (total && !info.size) info.size = total;
    const headers = corsHeaders();
    headers.set('Content-Type', info.mime);
    headers.set('Accept-Ranges', 'bytes');
    const len = res.headers.get('content-length');
    if (len) headers.set('Content-Length', len);
    if (res.status === 206 && cr) {
      headers.set('Content-Range', cr);
      return new Response(res.body, { status: 206, headers });
    }
    return new Response(res.body, { status: 200, headers });
  }

  // ───────────────────────────── Descargas ─────────────────────────────

  listDownloads(): DownloadInfo[] {
    return [...this.downloads.values()].sort((a, b) => b.downloadedAt - a.downloadedAt);
  }

  enqueueDownload(track: Track) {
    const videoId = track.videoId ?? track.id.replace(/^yt:/, '');
    if (this.downloads.has(videoId) || this.dlQueue.some((t) => t.videoId === videoId) || this.dlActive?.videoId === videoId) return;
    this.dlQueue.push({ ...track, videoId });
    this.o.onDownload({ videoId, state: 'queued', progress: 0 });
    void this.pump();
  }

  cancelDownload(videoId: string) {
    this.dlQueue = this.dlQueue.filter((t) => t.videoId !== videoId);
    if (this.dlActive?.videoId === videoId) {
      this.dlActive.cancelled = true;
      this.dlActive.proc?.kill();
    }
    this.o.onDownload({ videoId, state: 'removed' });
  }

  async deleteDownload(videoId: string) {
    const d = this.downloads.get(videoId);
    this.downloads.delete(videoId);
    this.saveDownloads();
    for (const f of await fsp.readdir(this.o.downloadsDir).catch(() => [] as string[])) {
      if (f.startsWith(`${videoId}.`)) await fsp.rm(path.join(this.o.downloadsDir, f), { force: true }).catch(() => undefined);
    }
    if (d) this.o.onDownload({ videoId, state: 'removed' });
  }

  private saveDownloads() {
    this.o.store.set('descargas', this.listDownloads(), 0);
  }

  private async pump() {
    if (this.dlActive) return;
    const track = this.dlQueue.shift();
    if (!track) return;
    const videoId = track.videoId!;
    this.dlActive = { videoId, proc: null, cancelled: false };
    const active = this.dlActive;
    try {
      this.o.onDownload({ videoId, state: 'running', progress: 0 });
      const js = await this.jsRuntimeArgs();
      let lastEmit = 0;
      const r = await this.run(
        [...js, '-f', 'bestaudio[ext=m4a]/bestaudio[acodec=opus]/bestaudio/best', '--no-playlist', '--no-part', '--no-mtime',
          '--newline', '--progress', '--no-warnings', '-o', path.join(this.o.downloadsDir, '%(id)s.%(ext)s'),
          '--progress-template', 'download:PIPO %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s',
          `https://www.youtube.com/watch?v=${videoId}`],
        (line) => {
          const m = /^PIPO (\S+) (\S+) (\S+)/.exec(line);
          if (!m) return;
          const done = Number(m[1]);
          const total = Number(m[2]) || Number(m[3]);
          if (done && total && Date.now() - lastEmit > 300) {
            lastEmit = Date.now();
            this.o.onDownload({ videoId, state: 'running', progress: Math.min(1, done / total) });
          }
        },
        30 * 60_000,
        (p) => (active.proc = p),
      );
      if (active.cancelled) {
        await this.deleteDownload(videoId);
        return;
      }
      if (r.code !== 0) throw new Error(friendlyError(r.stderr) ?? 'La descarga no se completó.');
      const files = await fsp.readdir(this.o.downloadsDir);
      const name = files.find((f) => f.startsWith(`${videoId}.`) && !/\.(jpg|part|ytdl|json|tmp)$/i.test(f));
      if (!name) throw new Error('No se encontró el archivo descargado.');
      const file = path.join(this.o.downloadsDir, name);
      const size = (await fsp.stat(file)).size;
      let artworkUrl = track.artworkUrl;
      if (track.artworkUrl?.startsWith('http')) {
        try {
          const img = await this.o.fetch(track.artworkUrl);
          if (img.ok) {
            await fsp.writeFile(path.join(this.o.downloadsDir, `${videoId}.jpg`), Buffer.from(await img.arrayBuffer()));
            artworkUrl = `pipo://media/dlart/${videoId}`;
          }
        } catch {
          // sin miniatura sin conexión
        }
      }
      const info: DownloadInfo = {
        videoId,
        file,
        size,
        downloadedAt: Date.now(),
        track: { ...track, artworkUrl, size },
      };
      this.downloads.set(videoId, info);
      this.saveDownloads();
      this.o.onDownload({ videoId, state: 'done', progress: 1, info });
    } catch (err) {
      for (const f of await fsp.readdir(this.o.downloadsDir).catch(() => [] as string[])) {
        if (f.startsWith(`${videoId}.`)) await fsp.rm(path.join(this.o.downloadsDir, f), { force: true }).catch(() => undefined);
      }
      this.o.onDownload({ videoId, state: 'error', message: (err as Error).message });
    } finally {
      this.dlActive = null;
      void this.pump();
    }
  }

  stopAll() {
    this.dlQueue = [];
    this.dlActive?.proc?.kill();
  }
}

export function corsHeaders(): Headers {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
  return h;
}

function parseDuration(text?: string): number {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0) * 1000;
}

function findAll(root: unknown, key: string): any[] {
  const out: any[] = [];
  const stack: unknown[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    const obj = node as Record<string, unknown>;
    if (key in obj) out.push(obj[key]);
    const vals = Object.values(obj);
    for (let i = vals.length - 1; i >= 0; i--) stack.push(vals[i]);
  }
  return out;
}

function friendlyError(text: string): string | undefined {
  if (!text) return undefined;
  if (/confirm you.?re not a bot|Sign in to confirm/i.test(text))
    return 'YouTube pidió confirmar que no eres un robot. Suele pasar con VPN o redes compartidas: prueba más tarde o actualiza el componente de YouTube en Ajustes.';
  if (/Video unavailable|This video is not available/i.test(text)) return 'Este video no está disponible.';
  if (/Requested format is not available/i.test(text)) return 'YouTube no ofreció un formato de audio compatible. Actualiza el componente de YouTube en Ajustes.';
  if (/Private video/i.test(text)) return 'Este video es privado.';
  if (/age.restricted|confirm your age|inappropriate/i.test(text)) return 'Este video tiene restricción de edad y no se puede reproducir sin iniciar sesión.';
  if (/Unable to download|getaddrinfo|timed out|Connection|network/i.test(text)) return 'No hay conexión con YouTube. Revisa tu internet.';
  const err = text.split('\n').find((l) => l.startsWith('ERROR:'));
  return err ? err.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/, '') : undefined;
}
