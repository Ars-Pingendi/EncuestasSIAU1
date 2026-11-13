// ffmpeg: análisis de archivos de video (pistas, duración), miniaturas, subtítulos y los
// comandos que convierten el video para la TV. Sin dependencias de Electron (se prueba con Node).
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface VideoStream {
  index: number;
  codec: string;
  profile: string;
  pixFmt: string;
  width: number;
  height: number;
  fps: number;
}

export interface AudioStream {
  index: number;
  /** Posición entre las pistas de audio (0 = la primera). */
  rel: number;
  codec: string;
  profile: string;
  channels: number;
  sampleRate: number;
  lang: string;
  title: string;
  default: boolean;
}

export interface SubStream {
  index: number;
  rel: number;
  codec: string;
  lang: string;
  title: string;
  default: boolean;
  forced: boolean;
  /** Subtítulo de texto (convertible a WebVTT); los de imagen (PGS, VobSub) no. */
  text: boolean;
}

export interface ProbeResult {
  format: string;
  durationMs: number;
  /** Segundo en que empieza el archivo (casi siempre 0). */
  startSec: number;
  video: VideoStream | null;
  audio: AudioStream[];
  subs: SubStream[];
}

const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text', 'microdvd', 'subviewer', 'subviewer1', 'sami', 'realtext', 'jacosub', 'mpl2', 'pjs', 'stl', 'vplayer', 'ttml']);

function channelsOf(layout: string): number {
  const l = layout.trim().toLowerCase();
  const dotted = /^(\d+)\.(\d+)/.exec(l);
  if (dotted) return Number(dotted[1]) + Number(dotted[2]);
  const n = /^(\d+) channels?/.exec(l);
  if (n) return Number(n[1]);
  const table: Record<string, number> = { mono: 1, stereo: 2, downmix: 2, quad: 4, 'quad(side)': 4, hexagonal: 6, octagonal: 8 };
  return table[l] ?? 2;
}

function seconds(h: string, m: string, s: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Interpreta lo que imprime `ffmpeg -i archivo` (formato estable desde hace muchos años). */
export function parseProbe(text: string): ProbeResult | null {
  const input = /^Input #0,\s*(.+?),\s*from\s/m.exec(text);
  if (!input) return null;
  const result: ProbeResult = { format: input[1], durationMs: 0, startSec: 0, video: null, audio: [], subs: [] };
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (dur) result.durationMs = Math.round(seconds(dur[1], dur[2], dur[3]) * 1000);
  const start = /start:\s*(-?\d+(?:\.\d+)?)/.exec(text);
  if (start) result.startSec = Number(start[1]);

  type Pending = { stream: AudioStream | SubStream | null; kind: string };
  let current: Pending | null = null;
  let inMeta = false;
  let audioRel = 0;
  let subRel = 0;

  for (const line of text.split(/\r?\n/)) {
    const s = /^\s*Stream #(\d+):(\d+)(?:\[[^\]]*\])?(?:\(([^)]*)\))?:\s*(Video|Audio|Subtitle|Data|Attachment):\s*(.*)$/i.exec(line);
    if (s) {
      inMeta = false;
      const index = Number(s[2]);
      const lang = s[3] && s[3] !== 'und' ? s[3] : '';
      const kind = s[4].toLowerCase();
      const rest = s[5];
      const codec = (/^([\w-]+)/.exec(rest)?.[1] ?? '').toLowerCase();
      const profileRaw = /^[\w-]+ \(([^)]*)\)/.exec(rest)?.[1] ?? '';
      const profile = profileRaw.includes('/ 0x') ? '' : profileRaw;
      const isDefault = /\(default\)/.test(rest);
      current = { stream: null, kind };
      if (kind === 'video') {
        // Las carátulas incrustadas (mjpeg/png "attached pic") no son el video.
        if (/\(attached pic\)/.test(rest) || result.video) continue;
        const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(rest);
        const pix = /,\s*((?:yuv|nv\d|gray|rgb|bgr|gbr|pal8|p0|ayuv|xyz)\w*)(?=[(,\s]|$)/i.exec(rest);
        const fps = /([\d.]+) fps/.exec(rest);
        result.video = {
          index,
          codec,
          profile,
          pixFmt: pix ? pix[1].toLowerCase() : '',
          width: size ? Number(size[1]) : 0,
          height: size ? Number(size[2]) : 0,
          fps: fps ? Number(fps[1]) : 0,
        };
      } else if (kind === 'audio') {
        const hz = /(\d+) Hz,\s*([^,]+)/.exec(rest);
        const a: AudioStream = {
          index,
          rel: audioRel++,
          codec,
          profile,
          channels: hz ? channelsOf(hz[2]) : 2,
          sampleRate: hz ? Number(hz[1]) : 0,
          lang,
          title: '',
          default: isDefault,
        };
        result.audio.push(a);
        current.stream = a;
      } else if (kind === 'subtitle') {
        const sub: SubStream = { index, rel: subRel++, codec, lang, title: '', default: isDefault, forced: /\(forced\)/.test(rest), text: TEXT_SUBS.has(codec) };
        result.subs.push(sub);
        current.stream = sub;
      }
      continue;
    }
    if (/^\s{2}Chapters:/.test(line) || /^\s{2}Input #/.test(line)) {
      current = null;
      inMeta = false;
      continue;
    }
    if (/^\s{4}Metadata:/.test(line)) {
      inMeta = !!current;
      continue;
    }
    if (inMeta && current?.stream) {
      const tag = /^\s{6,}([\w-]+)\s*:\s*(.*)$/.exec(line);
      if (tag) {
        const key = tag[1].toLowerCase();
        if (key === 'title' && !current.stream.title) current.stream.title = tag[2].trim();
        if (key === 'language' && !current.stream.lang && tag[2].trim() !== 'und') current.stream.lang = tag[2].trim();
      }
    }
  }
  return result;
}

// ───────────────────────────── Decisión de reproducción ─────────────────────────────

/** Lo que la TV sabe reproducir (códigos «v.h264», «a.ac3», «c.mkv»…). */
export interface Caps {
  v: Set<string>;
  a: Set<string>;
  c: Set<string>;
}

export function parseCaps(raw: string | null | undefined): Caps {
  const caps: Caps = { v: new Set(), a: new Set(), c: new Set() };
  for (const token of (raw ?? '').split(',')) {
    const [kind, name] = token.trim().toLowerCase().split('.');
    if (!name) continue;
    if (kind === 'v') caps.v.add(name);
    else if (kind === 'a') caps.a.add(name);
    else if (kind === 'c') caps.c.add(name);
  }
  // Mínimo que cualquier TV reproduce.
  if (!caps.v.size) caps.v.add('h264');
  if (!caps.a.size) {
    caps.a.add('aac');
    caps.a.add('mp3');
  }
  if (!caps.c.size) caps.c.add('mp4');
  return caps;
}

export type PlayMode = 'direct' | 'remux' | 'transcode';
export type StreamContainer = 'mp4' | 'ts';

export interface Decision {
  mode: PlayMode;
  vcodec: 'copy' | 'h264' | 'vp9';
  acodec: 'copy' | 'aac' | 'opus' | 'none';
  audioIndex: number;
  reason: string;
}

/** Clave de contenedor según la extensión (ffmpeg llama igual a MP4 y MOV, a MKV y WebM). */
export function containerKey(ext: string): string {
  const e = ext.replace(/^\./, '').toLowerCase();
  if (e === 'mp4' || e === 'm4v') return 'mp4';
  if (e === 'mov') return 'mov';
  if (e === 'mkv') return 'mkv';
  if (e === 'webm') return 'webm';
  if (e === 'ts' || e === 'm2ts' || e === 'mts') return 'ts';
  if (e === 'avi') return 'avi';
  return e;
}

export function defaultAudioRel(audio: AudioStream[]): number {
  const d = audio.findIndex((a) => a.default);
  return d >= 0 ? d : 0;
}

function is10bit(v: VideoStream): boolean {
  return /(10|12|14|16)(le|be)$/.test(v.pixFmt) || /10/.test(v.profile);
}

function videoCompatible(v: VideoStream, caps: Caps): boolean {
  if (!caps.v.has(v.codec)) return false;
  // Casi ninguna TV decodifica H.264 de 10 bits; HEVC de 10 bits sí.
  if (v.codec === 'h264' && is10bit(v)) return false;
  return true;
}

export interface DecideInput {
  ext: string;
  probe: ProbeResult | null;
  caps: Caps;
  /** Pista de audio pedida (posición); por defecto la marcada como predeterminada. */
  audioRel?: number;
  /** Fuerza un modo como mínimo (para reintentar cuando la TV no pudo reproducir). */
  force?: PlayMode;
}

export function decide(i: DecideInput): Decision {
  const { probe, caps } = i;
  if (!probe || !probe.video) {
    return { mode: 'direct', vcodec: 'copy', acodec: 'copy', audioIndex: 0, reason: 'sin información del archivo' };
  }
  const audioRel = Math.min(Math.max(0, i.audioRel ?? defaultAudioRel(probe.audio)), Math.max(0, probe.audio.length - 1));
  const a = probe.audio[audioRel];
  const vOk = videoCompatible(probe.video, caps);
  const aOk = !a || caps.a.has(a.codec);
  const cOk = caps.c.has(containerKey(i.ext));
  const sameAudio = audioRel === defaultAudioRel(probe.audio);
  const vcodec: Decision['vcodec'] = !vOk ? (caps.v.has('h264') ? 'h264' : 'vp9') : 'copy';
  // En los flujos convertidos solo se copia el audio que es seguro dentro de un MP4 fragmentado.
  const copySafe = !!a && aOk && a.codec !== 'mp3';
  const acodecForOutput: Decision['acodec'] = !a ? 'none' : copySafe ? 'copy' : caps.a.has('aac') || !caps.a.has('opus') ? 'aac' : 'opus';

  const reasons: string[] = [];
  if (!vOk) reasons.push(`video ${probe.video.codec}${is10bit(probe.video) ? ' de 10 bits' : ''} no compatible`);
  if (!aOk && a) reasons.push(`audio ${a.codec.toUpperCase()} no compatible`);
  if (!cOk) reasons.push(`contenedor ${containerKey(i.ext).toUpperCase()} no compatible`);
  if (!sameAudio) reasons.push('otra pista de audio');

  const wantsDirect = vOk && aOk && cOk && sameAudio;
  let mode: PlayMode = wantsDirect ? 'direct' : vOk ? 'remux' : 'transcode';
  if (i.force === 'remux' && mode === 'direct') mode = 'remux';
  if (i.force === 'transcode') mode = 'transcode';
  const finalV: Decision['vcodec'] = mode === 'transcode' ? (caps.v.has('h264') ? 'h264' : vcodec === 'copy' ? 'vp9' : vcodec) : 'copy';
  return {
    mode,
    vcodec: mode === 'direct' ? 'copy' : finalV,
    acodec: mode === 'direct' ? 'copy' : acodecForOutput,
    audioIndex: audioRel,
    reason: mode === 'direct' ? 'Reproducción directa' : reasons.join(', ') || 'conversión',
  };
}

// ───────────────────────────── Comandos de conversión ─────────────────────────────

export interface StreamArgsInput {
  file: string;
  probe: ProbeResult;
  decision: Decision;
  container: StreamContainer;
  /** Segundo desde el que empezar. */
  start: number;
}

export function buildStreamArgs(i: StreamArgsInput): string[] {
  const { probe, decision: d } = i;
  const v = probe.video!;
  const a = probe.audio[d.audioIndex];
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '0'];
  if (i.start > 0) args.push('-ss', i.start.toFixed(3));
  args.push('-i', i.file, '-map', `0:${v.index}`);
  if (a && d.acodec !== 'none') args.push('-map', `0:${a.index}`);
  args.push('-sn', '-dn', '-map_metadata', '-1');

  if (d.vcodec === 'copy') {
    args.push('-c:v', 'copy');
    if (v.codec === 'hevc' && i.container === 'mp4') args.push('-tag:v', 'hvc1');
  } else if (d.vcodec === 'h264') {
    args.push(
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p',
      '-vf', "scale='min(1920,iw)':-2", '-force_key_frames', 'expr:gte(t,n_forced*2)',
    );
  } else {
    args.push(
      '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-b:v', '0', '-crf', '34', '-pix_fmt', 'yuv420p',
      '-vf', "scale='min(1920,iw)':-2", '-g', '50',
    );
  }

  if (a && d.acodec !== 'none') {
    if (d.acodec === 'copy') args.push('-c:a', 'copy');
    else {
      const ch = a.channels > 2 ? Math.min(a.channels, 6) : 2;
      if (d.acodec === 'aac') args.push('-c:a', 'aac', '-b:a', ch > 2 ? '384k' : '192k', '-ac', String(ch));
      else args.push('-c:a', 'libopus', '-b:a', ch > 2 ? '256k' : '160k', '-ac', String(ch));
    }
  }

  args.push('-avoid_negative_ts', 'make_zero', '-max_muxing_queue_size', '2048');
  if (i.container === 'ts') args.push('-muxdelay', '0', '-muxpreload', '0', '-f', 'mpegts', 'pipe:1');
  else args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1');
  return args;
}

// ───────────────────────────── Ejecución ─────────────────────────────

export interface RunResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export class Ffmpeg {
  private exe: string | null | undefined;

  constructor(private readonly bundledDir: string) {}

  /** ffmpeg incluido en la app; en Linux/Mac, el del sistema. */
  path(): string | null {
    if (this.exe !== undefined) return this.exe;
    const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const candidates = [process.env.PIPO_FFMPEG, path.join(this.bundledDir, name)].filter((p): p is string => !!p);
    for (const c of candidates) {
      if (fs.existsSync(c)) return (this.exe = c);
    }
    this.exe = process.platform === 'win32' ? null : name;
    return this.exe;
  }

  available(): boolean {
    return this.path() !== null;
  }

  run(args: string[], opts: { timeoutMs?: number; maxStdout?: number } = {}): Promise<RunResult> {
    return new Promise((resolve) => {
      const exe = this.path();
      if (!exe) return resolve({ code: -1, stdout: Buffer.alloc(0), stderr: 'ffmpeg no está disponible' });
      const proc = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const out: Buffer[] = [];
      let outSize = 0;
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => {
        if (outSize < (opts.maxStdout ?? 64 * 1024 * 1024)) {
          out.push(d);
          outSize += d.length;
        }
      });
      proc.stderr.setEncoding('utf8');
      proc.stderr.on('data', (d: string) => {
        if (stderr.length < 256 * 1024) stderr += d;
      });
      const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 60_000);
      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout: Buffer.alloc(0), stderr: String(err.message) });
      });
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout: Buffer.concat(out), stderr });
      });
    });
  }

  spawnStream(args: string[]): ChildProcess | null {
    const exe = this.path();
    if (!exe) return null;
    return spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  }

  async probe(file: string): Promise<ProbeResult | null> {
    const r = await this.run(['-hide_banner', '-nostdin', '-i', file], { timeoutMs: 45_000 });
    return parseProbe(r.stderr);
  }

  /** Miniatura JPEG de 480 px tomada del 20 % de la película. */
  async thumbnail(file: string, out: string, durationMs: number): Promise<boolean> {
    const at = durationMs > 0 ? Math.min(Math.max(durationMs / 1000 * 0.2, 2), Math.max(0, durationMs / 1000 - 1)) : 5;
    const tmp = `${out}.tmp.jpg`;
    const r = await this.run(
      ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', at.toFixed(2), '-i', file, '-map', '0:v:0', '-frames:v', '1', '-vf', 'scale=480:-2,format=yuvj420p', '-q:v', '5', '-y', tmp],
      { timeoutMs: 60_000 },
    );
    if (r.code !== 0 || !fs.existsSync(tmp)) {
      fs.rmSync(tmp, { force: true });
      return false;
    }
    fs.renameSync(tmp, out);
    return true;
  }

  /** Segundo del último fotograma clave anterior (o igual) a `t`: desde ahí se puede copiar el video sin recodificar. */
  async keyframeBefore(file: string, videoIndex: number, t: number, startSec: number): Promise<number> {
    const r = await this.run(
      ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', t.toFixed(3), '-i', file, '-map', `0:${videoIndex}`, '-c', 'copy', '-copyts', '-frames:v', '1', '-f', 'framecrc', '-'],
      { timeoutMs: 30_000 },
    );
    const text = r.stdout.toString('utf8');
    const tb = /^#tb 0:\s*(\d+)\/(\d+)/m.exec(text);
    const row = /^0,\s*(-?\d+),\s*(-?\d+),/m.exec(text);
    if (!tb || !row) return t;
    const pts = Number(row[2]) * (Number(tb[1]) / Number(tb[2]));
    const rel = pts - startSec;
    return rel >= 0 && rel <= t + 0.5 ? rel : t;
  }

  /** Extrae pistas de subtítulos de texto a archivos WebVTT en una sola pasada. */
  async extractSubtitles(file: string, tracks: { index: number; out: string }[]): Promise<boolean> {
    if (!tracks.length) return true;
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file];
    for (const t of tracks) args.push('-map', `0:${t.index}`, '-c:s', 'webvtt', '-f', 'webvtt', `${t.out}.tmp`);
    // Los subtítulos viajan intercalados con el video: hay que leer todo el archivo.
    const r = await this.run(args, { timeoutMs: 15 * 60_000 });
    let ok = r.code === 0;
    for (const t of tracks) {
      if (fs.existsSync(`${t.out}.tmp`)) fs.renameSync(`${t.out}.tmp`, t.out);
      else ok = false;
    }
    return ok;
  }

  /** Convierte un archivo de subtítulos (ass, ssa…) a WebVTT. */
  async convertSubtitleFile(file: string): Promise<string | null> {
    const r = await this.run(['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-f', 'webvtt', '-'], { timeoutMs: 30_000 });
    return r.code === 0 && r.stdout.length ? r.stdout.toString('utf8') : null;
  }
}
