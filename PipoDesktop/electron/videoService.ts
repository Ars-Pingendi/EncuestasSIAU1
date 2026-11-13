// Servicio de video para la TV: decide cómo reproducir cada archivo (directo, copiando el video
// y convirtiendo el audio, o recodificando), y entrega subtítulos y miniaturas.
// No depende de Electron para poder probarse con Node.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type http from 'node:http';
import path from 'node:path';
import {
  buildStreamArgs, decide, parseCaps,
  type AudioStream, type Ffmpeg, type PlayMode, type StreamContainer,
} from './ffmpeg';
import { cors, sendJson, serveFile } from './httpUtil';
import { isLanguageWord, langName, normalizeLang } from './lang';
import type { VideoItem, VideoLibrary } from './videoLibrary';

const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.ts': 'video/mp2t', '.m2ts': 'video/mp2t', '.mts': 'video/mp2t', '.wmv': 'video/x-ms-wmv',
  '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.flv': 'video/x-flv', '.ogv': 'video/ogg', '.3gp': 'video/3gpp',
};

export function videoMime(ext: string): string {
  return VIDEO_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa']);
const SUB_DIRS = ['', 'Subs', 'Subtitles', 'Subtitulos', 'Subtítulos', 'Sub'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

// ───────────────────────────── Subtítulos ─────────────────────────────

export function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // Subtítulos antiguos en español suelen venir en Windows-1252 («ñ», tildes).
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export function srtToVtt(text: string): string {
  const body = text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{1,3})/g, (_m, a: string, b: string) => `${a.padStart(8, '0')}.${b.padEnd(3, '0')}`)
    .replace(/\{\\an?\d\}/g, '');
  return `WEBVTT\n\n${body}\n`;
}

interface ExternalSub {
  file: string;
  lang: string;
  forced: boolean;
  label: string;
}

/** «Español», «Español 5.1», «Inglés · Comentarios del director»… (en español, sin repetir el idioma). */
function trackLabel(lang: string, title: string, fallback: string): string {
  const name = langName(normalizeLang(lang) || normalizeLang(title.split(/[\s()\-_,]+/)[0] ?? ''));
  const t = title.trim();
  if (!t) return name || fallback;
  // Si el título solo repite el idioma («English», «spa»), se usa el nombre en español.
  const rest = t.split(/[\s()\-_,./]+/).filter((w) => w && !isLanguageWord(w));
  if (!rest.length) return name || t;
  if (!name) return t;
  return t.toLowerCase().includes(name.toLowerCase()) ? t : `${name} · ${t}`;
}

function channelsLabel(n: number): string {
  if (n <= 1) return 'mono';
  if (n === 2) return 'estéreo';
  if (n === 6) return '5.1';
  if (n === 8) return '7.1';
  return `${n} canales`;
}

function audioLabel(a: AudioStream): string {
  return `${trackLabel(a.lang, a.title, `Pista ${a.rel + 1}`)} · ${a.codec.toUpperCase()} ${channelsLabel(a.channels)}`;
}

function findImage(dir: string, names: string[]): string | null {
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  const lower = new Map(files.map((f) => [f.toLowerCase(), f]));
  for (const n of names) {
    for (const ext of IMAGE_EXT) {
      const hit = lower.get(`${n}${ext}`.toLowerCase());
      if (hit) return path.join(dir, hit);
    }
  }
  return null;
}

class Semaphore {
  private n = 0;
  private waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.n >= this.max) await new Promise<void>((r) => this.waiters.push(r));
    this.n++;
    try {
      return await fn();
    } finally {
      this.n--;
      this.waiters.shift()?.();
    }
  }
}

// ───────────────────────────── Servicio ─────────────────────────────

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
  url: string;
  /** Segundo del video en que empieza la transmisión (la TV suma este valor a la posición). */
  startAt: number;
  durationMs: number;
  container: 'native' | StreamContainer;
  audioIndex: number;
  audio: PlanAudio[];
  subs: PlanSub[];
  info: string;
}

export interface PlanQuery {
  caps: string;
  audio?: number;
  start?: number;
  force?: PlayMode;
  c?: StreamContainer;
}

export interface VideoServiceOptions {
  library: VideoLibrary;
  ffmpeg: Ffmpeg;
  cacheDir: string;
  logFile?: string;
}

const MAX_STREAMS = 3;

export class VideoService {
  private extracting = new Map<string, Promise<void>>();
  private thumbing = new Map<string, Promise<boolean>>();
  private thumbLimit = new Semaphore(2);
  private streams = new Map<string, { kill: () => void; at: number }>();

  constructor(private readonly o: VideoServiceOptions) {
    fs.mkdirSync(path.join(o.cacheDir, 'subs'), { recursive: true });
    fs.mkdirSync(path.join(o.cacheDir, 'thumbs'), { recursive: true });
  }

  private log(text: string) {
    if (this.o.logFile) fs.appendFile(this.o.logFile, `[${new Date().toISOString()}] video: ${text}\n`, () => undefined);
  }

  /** Cierra las conversiones en curso (al salir de la app). */
  stopAll() {
    for (const s of this.streams.values()) s.kill();
    this.streams.clear();
  }

  // ───────────────────────────── Catálogo ─────────────────────────────

  payload() {
    const items = this.o.library.items().map((i) => {
      const langs = new Set<string>();
      for (const a of i.probe?.audio ?? []) {
        const n = langName(normalizeLang(a.lang));
        if (n) langs.add(n);
      }
      return {
        id: i.id,
        kind: i.kind,
        title: i.title,
        series: i.series,
        seriesKey: i.seriesKey,
        season: i.season,
        episode: i.episode,
        year: i.year,
        durationMs: i.durationMs,
        size: i.size,
        addedAt: i.addedAt,
        width: i.probe?.video?.width ?? 0,
        height: i.probe?.video?.height ?? 0,
        vcodec: i.probe?.video?.codec ?? '',
        langs: [...langs],
        subs: (i.probe?.subs ?? []).filter((s) => s.text).length,
      };
    });
    return { enabled: true, scanning: this.o.library.status().scanning, count: items.length, items };
  }

  // ───────────────────────────── Plan de reproducción ─────────────────────────────

  private displayTitle(i: VideoItem): string {
    if (i.kind === 'movie') return i.year ? `${i.title} (${i.year})` : i.title;
    return `${i.series} · T${i.season} E${i.episode}${i.title ? ` · ${i.title}` : ''}`;
  }

  /** Subtítulos sueltos junto al video («Película.es.srt», «Subs/Película.eng.srt»…). */
  findExternalSubs(item: VideoItem): ExternalSub[] {
    const dir = path.dirname(item.fullPath);
    const base = path.basename(item.fullPath, path.extname(item.fullPath)).toLowerCase();
    const out: ExternalSub[] = [];
    for (const sub of SUB_DIRS) {
      const d = sub ? path.join(dir, sub) : dir;
      let names: string[];
      try {
        names = fs.readdirSync(d);
      } catch {
        continue;
      }
      for (const name of names.sort()) {
        const ext = path.extname(name).toLowerCase();
        if (!SUB_EXT.has(ext)) continue;
        const stem = name.slice(0, name.length - ext.length).toLowerCase();
        if (!stem.startsWith(base)) continue;
        const rest = stem.slice(base.length);
        if (rest && !/^[\s._\-([]/.test(rest)) continue;
        const tokens = rest.split(/[\s._\-()[\]]+/).filter(Boolean);
        const lang = tokens.map(normalizeLang).find(Boolean) ?? '';
        const forced = tokens.some((t) => /^(forced|forzado|forzados)$/.test(t));
        const extra = tokens.some((t) => /^(sdh|cc)$/.test(t)) ? ' (SDH)' : '';
        const label = `${langName(lang) || 'Subtítulo externo'}${forced ? ' (forzados)' : ''}${extra}`;
        out.push({ file: path.join(d, name), lang, forced, label });
      }
    }
    return out;
  }

  async plan(item: VideoItem, q: PlanQuery, token: string): Promise<VideoPlan> {
    const caps = parseCaps(q.caps);
    const d = decide({ ext: item.ext, probe: item.probe, caps, audioRel: q.audio, force: q.force });
    let container: StreamContainer = q.c === 'ts' ? 'ts' : 'mp4';
    if (container === 'ts' && (d.vcodec === 'vp9' || d.acodec === 'opus')) container = 'mp4';
    const base = `/pipo/video/${encodeURIComponent(item.id)}`;
    const tokenQ = `t=${encodeURIComponent(token)}`;
    let url: string;
    let startAt = 0;
    if (d.mode === 'direct') {
      url = `${base}/file?${tokenQ}`;
    } else {
      startAt = Math.max(0, q.start ?? 0);
      // Si se copia el video, solo se puede empezar en un fotograma clave: se informa cuál.
      if (startAt > 0 && d.vcodec === 'copy' && item.probe?.video) {
        startAt = await this.o.ffmpeg.keyframeBefore(item.fullPath, item.probe.video.index, startAt, item.probe.startSec);
      }
      url =
        `${base}/stream?${tokenQ}&mode=${d.mode}&start=${startAt.toFixed(3)}&audio=${d.audioIndex}&c=${container}` +
        `&caps=${encodeURIComponent(q.caps)}`;
    }

    const probe = item.probe;
    const audio: PlanAudio[] = (probe?.audio ?? []).map((a) => ({
      index: a.rel,
      label: audioLabel(a),
      lang: normalizeLang(a.lang),
      codec: a.codec,
      channels: a.channels,
      active: a.rel === d.audioIndex,
    }));
    const subs: PlanSub[] = [];
    for (const s of probe?.subs ?? []) {
      if (!s.text) continue;
      subs.push({
        id: `e${s.rel}`,
        label: trackLabel(s.lang, s.title, `Subtítulo ${s.rel + 1}`) + (s.forced && !/forz|forced/i.test(s.title) ? ' (forzados)' : ''),
        lang: normalizeLang(s.lang),
        forced: s.forced,
        external: false,
        default: s.default,
      });
    }
    this.findExternalSubs(item).forEach((x, k) => subs.push({ id: `x${k}`, label: x.label, lang: x.lang, forced: x.forced, external: true, default: false }));
    if (probe?.subs.some((s) => s.text)) void this.ensureEmbeddedSubs(item);

    const v = probe?.video;
    const a = probe?.audio[d.audioIndex];
    const info = [v ? (v.height >= 2160 ? '4K' : v.height ? `${v.height}p` : '') : '', v?.codec.toUpperCase(), a ? `${a.codec.toUpperCase()} ${channelsLabel(a.channels)}` : '']
      .filter(Boolean)
      .join(' · ');
    return {
      id: item.id,
      title: this.displayTitle(item),
      mode: d.mode,
      reason: d.reason,
      url,
      startAt,
      durationMs: item.durationMs,
      container: d.mode === 'direct' ? 'native' : container,
      audioIndex: d.audioIndex,
      audio,
      subs,
      info,
    };
  }

  // ───────────────────────────── Peticiones ─────────────────────────────

  async handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL, parts: string[], token: string) {
    const item = this.o.library.byId(parts[2] ?? '');
    if (!item) return sendJson(res, 404, { error: 'Video no encontrado' });
    if (!fs.existsSync(item.fullPath)) return sendJson(res, 404, { error: 'El archivo ya no está en el PC' });
    const q = url.searchParams;
    const num = (k: string): number | undefined => {
      const v = q.get(k);
      return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;
    };
    const mode = (k: string): PlayMode | undefined => {
      const v = q.get(k);
      return v === 'direct' || v === 'remux' || v === 'transcode' ? v : undefined;
    };
    const container = q.get('c') === 'ts' ? 'ts' : 'mp4';
    switch (parts[3]) {
      case 'play':
        return sendJson(res, 200, await this.plan(item, { caps: q.get('caps') ?? '', audio: num('audio'), start: num('start'), force: mode('force'), c: container }, token));
      case 'file':
        return serveFile(req, res, item.fullPath, { mime: videoMime(item.ext) });
      case 'stream':
        return this.stream(req, res, item, { caps: q.get('caps') ?? '', audio: num('audio'), start: num('start') ?? 0, force: mode('mode') ?? 'remux', c: container }, token);
      case 'sub':
        return this.subtitle(res, item, (parts[4] ?? '').replace(/\.vtt$/i, ''));
      case 'thumb':
        return this.image(req, res, item, false);
      case 'poster':
        return this.image(req, res, item, true);
      default:
        return sendJson(res, 404, { error: 'No encontrado' });
    }
  }

  // ───────────────────────────── Conversión en vivo ─────────────────────────────

  private async stream(req: http.IncomingMessage, res: http.ServerResponse, item: VideoItem, q: PlanQuery, token: string) {
    if (!this.o.ffmpeg.available() || !item.probe?.video) {
      return sendJson(res, 503, { error: 'Falta ffmpeg en el PC para convertir este video.' });
    }
    // Una conversión no admite adelantar con Range: la TV pide otra con «start».
    const m = /bytes=(\d+)-/.exec(String(req.headers.range ?? ''));
    if (m && Number(m[1]) > 0) {
      res.writeHead(416, { 'Content-Range': 'bytes */*' });
      return res.end();
    }
    const caps = parseCaps(q.caps);
    const d = decide({ ext: item.ext, probe: item.probe, caps, audioRel: q.audio, force: q.force });
    let container: StreamContainer = q.c === 'ts' ? 'ts' : 'mp4';
    if (container === 'ts' && (d.vcodec === 'vp9' || d.acodec === 'opus')) container = 'mp4';
    let start = Math.max(0, q.start ?? 0);
    if (d.vcodec === 'copy' && start > 0) start += 0.002; // margen para caer justo en el fotograma clave
    const args = buildStreamArgs({ file: item.fullPath, probe: item.probe, decision: d, container, start });

    const key = `${token}:${item.id}`;
    this.streams.get(key)?.kill();
    if (this.streams.size >= MAX_STREAMS) {
      const oldest = [...this.streams.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      oldest[1].kill();
      this.streams.delete(oldest[0]);
    }

    const proc = this.o.ffmpeg.spawnStream(args);
    if (!proc || !proc.stdout) return sendJson(res, 503, { error: 'No se pudo iniciar ffmpeg.' });
    let stderr = '';
    proc.stderr?.setEncoding('utf8');
    proc.stderr?.on('data', (c: string) => {
      if (stderr.length < 8192) stderr += c;
    });
    let killed = false;
    const entry = {
      at: Date.now(),
      kill: () => {
        killed = true;
        proc.kill();
      },
    };
    this.streams.set(key, entry);
    const release = () => {
      if (this.streams.get(key) === entry) this.streams.delete(key);
    };
    res.on('close', () => {
      entry.kill();
      release();
    });
    proc.on('error', (err) => {
      this.log(`ffmpeg: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'No se pudo iniciar ffmpeg.' });
    });

    const started = Date.now();
    let first = true;
    proc.stdout.on('data', (chunk: Buffer) => {
      if (first) {
        first = false;
        cors(res);
        res.writeHead(200, {
          'Content-Type': container === 'ts' ? 'video/mp2t' : 'video/mp4',
          'Cache-Control': 'no-store',
          'Accept-Ranges': 'none',
        });
        this.log(`${d.mode} ${item.id} (${d.reason}) arranca en ${Date.now() - started} ms`);
      }
      if (!res.write(chunk)) {
        proc.stdout!.pause();
        res.once('drain', () => proc.stdout!.resume());
      }
    });
    proc.on('close', (code) => {
      release();
      if (first && !res.headersSent) {
        // Terminó sin entregar nada: error de ffmpeg.
        this.log(`falló ${item.id} (${args.join(' ')}) código ${code}\n${stderr.trim().split('\n').slice(-12).join('\n')}`);
        sendJson(res, 500, { error: 'ffmpeg no pudo convertir este video.', detail: stderr.trim().split('\n').slice(-3).join(' ') });
      } else {
        if (code !== 0 && !killed) this.log(`terminó con código ${code} ${item.id}\n${stderr.trim().split('\n').slice(-6).join('\n')}`);
        res.end();
      }
    });
  }

  // ───────────────────────────── Subtítulos ─────────────────────────────

  private subtitleCache(item: VideoItem, index: number): string {
    let mtime = 0;
    try {
      mtime = Math.round(fs.statSync(item.fullPath).mtimeMs);
    } catch {
      // se usa 0
    }
    return path.join(this.o.cacheDir, 'subs', `${item.id.slice(2)}_${mtime}_${index}.vtt`);
  }

  /** Extrae todos los subtítulos de texto del archivo en una sola pasada (queda en caché). */
  private async ensureEmbeddedSubs(item: VideoItem): Promise<void> {
    if (!item.probe) return;
    const missing = item.probe.subs
      .filter((s) => s.text)
      .map((s) => ({ index: s.index, out: this.subtitleCache(item, s.index) }))
      .filter((t) => !fs.existsSync(t.out));
    if (!missing.length) return;
    let p = this.extracting.get(item.id);
    if (!p) {
      this.log(`extrayendo ${missing.length} subtítulo(s) de ${item.id}`);
      p = this.o.ffmpeg
        .extractSubtitles(item.fullPath, missing)
        .then((ok) => (ok ? undefined : this.log(`extracción incompleta ${item.id}`)))
        .finally(() => this.extracting.delete(item.id));
      this.extracting.set(item.id, p);
    }
    await p;
  }

  private async subtitle(res: http.ServerResponse, item: VideoItem, id: string) {
    const send = (vtt: string) => {
      cors(res);
      res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'max-age=3600' });
      res.end(vtt);
    };
    try {
      if (id.startsWith('e')) {
        const stream = item.probe?.subs.find((s) => s.rel === Number(id.slice(1)) && s.text);
        if (!stream) return sendJson(res, 404, { error: 'Subtítulo no disponible' });
        const out = this.subtitleCache(item, stream.index);
        if (!fs.existsSync(out)) {
          await Promise.race([this.ensureEmbeddedSubs(item), new Promise((r) => setTimeout(r, 170_000))]);
        }
        if (!fs.existsSync(out)) return sendJson(res, 504, { error: 'Los subtítulos todavía se están preparando. Inténtalo en un momento.' });
        return send(await fsp.readFile(out, 'utf8'));
      }
      if (id.startsWith('x')) {
        const ext = this.findExternalSubs(item)[Number(id.slice(1))];
        if (!ext) return sendJson(res, 404, { error: 'Subtítulo no disponible' });
        const e = path.extname(ext.file).toLowerCase();
        if (e === '.srt') return send(srtToVtt(decodeText(await fsp.readFile(ext.file))));
        if (e === '.vtt') return send(decodeText(await fsp.readFile(ext.file)).replace(/^﻿/, ''));
        const vtt = await this.o.ffmpeg.convertSubtitleFile(ext.file);
        return vtt ? send(vtt) : sendJson(res, 500, { error: 'No se pudo leer el subtítulo' });
      }
    } catch (err) {
      this.log(`subtítulo ${item.id}/${id}: ${(err as Error).message}`);
      return sendJson(res, 500, { error: 'No se pudo leer el subtítulo' });
    }
    return sendJson(res, 404, { error: 'Subtítulo no disponible' });
  }

  // ───────────────────────────── Miniaturas y pósters ─────────────────────────────

  private async image(req: http.IncomingMessage, res: http.ServerResponse, item: VideoItem, poster: boolean) {
    const dir = path.dirname(item.fullPath);
    const base = path.basename(item.fullPath, path.extname(item.fullPath));
    let file: string | null = null;
    if (poster) {
      // Póster de la película o de la serie (carpeta de la serie, hasta la carpeta raíz).
      file = findImage(dir, [`${base}-poster`, 'poster', 'folder', 'cover', 'movie']);
      if (!file && item.kind === 'episode') {
        let d = path.dirname(dir);
        for (let k = 0; k < 2 && !file && d.length >= item.root.length; k++, d = path.dirname(d)) file = findImage(d, ['poster', 'folder', 'cover']);
        if (!file) file = findImage(dir, []) ?? null;
      }
    } else {
      file = findImage(dir, [`${base}-thumb`, `${base}-landscape`, `${base}-fanart`, base]);
    }
    if (!file) {
      let mtime = 0;
      try {
        mtime = Math.round(fs.statSync(item.fullPath).mtimeMs);
      } catch {
        // sin fecha
      }
      const out = path.join(this.o.cacheDir, 'thumbs', `${item.id.slice(2)}_${mtime}.jpg`);
      if (!fs.existsSync(out)) {
        let p = this.thumbing.get(item.id);
        if (!p) {
          p = this.thumbLimit
            .run(() => this.o.ffmpeg.thumbnail(item.fullPath, out, item.durationMs))
            .finally(() => this.thumbing.delete(item.id));
          this.thumbing.set(item.id, p);
        }
        if (!(await p)) return sendJson(res, 404, { error: 'Sin miniatura' });
      }
      file = out;
    }
    return serveFile(req, res, file, { cache: true });
  }
}
