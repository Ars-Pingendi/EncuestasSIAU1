// Reproductor adaptativo para YouTube: imagen (MP4/H.264) y audio (M4A) llegan como dos archivos
// separados desde el teléfono y se unen en el televisor con Media Source Extensions.
//
// Cada archivo es un MP4 fragmentado con un índice «sidx» al principio (como los de YouTube):
// ftyp + moov (inicialización), sidx (dónde empieza cada fragmento de ~5 s) y luego moof + mdat.
// Se lee solo el principio de cada archivo, se arma la lista de fragmentos y se piden por rango
// los que hacen falta, unos 30 s por delante de la reproducción.
import type { AdaptiveAudio, AdaptiveSpec, AdaptiveVideo } from './api';
import { errorText, request } from './net';

const AHEAD_SEC = 30;
const BEHIND_SEC = 30;
const HEAD_BYTES = 256 * 1024;
const MAX_FAILURES = 4;

interface Seg {
  start: number; // primer byte del fragmento
  end: number; // último byte (inclusivo)
  t0: number; // segundos
  t1: number;
}

interface Rep {
  url: string;
  mime: string;
  init: ArrayBuffer;
  segs: Seg[];
}

interface Feeder {
  name: string;
  sb: SourceBuffer;
  rep: Rep | null;
  next: number;
  busy: boolean;
  gen: number;
  failures: number;
  retryAt: number;
  abort?: () => void;
}

function fourcc(dv: DataView, off: number): string {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
}

function u64(dv: DataView, off: number): number {
  return dv.getUint32(off) * 4294967296 + dv.getUint32(off + 4);
}

/**
 * Pide los bytes [from, to] de un archivo. Si el servidor ignora el rango (200) se recorta aquí.
 * Se puede cancelar (al adelantar, cambiar de calidad o cerrar) para no dejar conexiones ocupadas.
 */
export function getRange(url: string, from: number, to: number, timeoutMs = 30000): { promise: Promise<ArrayBuffer>; abort(): void } {
  const r = request(url, { headers: { Range: `bytes=${from}-${to}` }, binary: true, timeoutMs, timeoutMessage: 'el teléfono no envió datos a tiempo' });
  const promise = r.promise.then((res) => {
    const buf = res.body as ArrayBuffer;
    if (res.status < 200 || res.status >= 300) {
      // El teléfono explica el motivo en un JSON {"error": "…"}.
      let detail = '';
      try {
        detail = errorText({ status: res.status, body: new TextDecoder().decode(new Uint8Array(buf || new ArrayBuffer(0))) });
      } catch {
        // sin detalle
      }
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return res.status === 200 && from > 0 ? buf.slice(from, to + 1) : buf;
  });
  return { promise, abort: r.abort };
}

function why(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ParsedHead {
  initEnd: number;
  segs: Seg[];
}

/**
 * Lee el principio de un MP4 fragmentado: devuelve dónde termina la inicialización y los fragmentos
 * (de «sidx»). Devuelve null si faltan bytes (hay que leer más) y lanza un error si el archivo no sirve.
 */
export function parseHead(buf: ArrayBuffer, fileSize: number): ParsedHead | null {
  const dv = new DataView(buf);
  const len = buf.byteLength;
  let off = 0;
  let moovEnd = -1;
  while (off + 8 <= len) {
    let size = dv.getUint32(off);
    const type = fourcc(dv, off + 4);
    if (size === 1) {
      if (off + 16 > len) return null;
      size = u64(dv, off + 8);
    } else if (size === 0) {
      size = fileSize > 0 ? fileSize - off : len - off;
    }
    if (size < 8) throw new Error('Archivo de video dañado');
    if (type === 'moof' || type === 'mdat') throw new Error('El video no trae índice de fragmentos');
    if (type === 'moov') moovEnd = off + size;
    if (type === 'sidx') {
      if (off + size > len) return null;
      if (moovEnd < 0) throw new Error('El índice llegó antes que la inicialización');
      let p = off + 8;
      const version = dv.getUint8(p);
      p += 8; // versión + banderas, id de referencia
      const timescale = dv.getUint32(p);
      p += 4;
      let earliest: number;
      let firstOffset: number;
      if (version === 0) {
        earliest = dv.getUint32(p);
        firstOffset = dv.getUint32(p + 4);
        p += 8;
      } else {
        earliest = u64(dv, p);
        firstOffset = u64(dv, p + 8);
        p += 16;
      }
      p += 2;
      const count = dv.getUint16(p);
      p += 2;
      if (!timescale || !count) throw new Error('Índice de video vacío');
      const segs: Seg[] = [];
      let start = off + size + firstOffset;
      let t = earliest;
      for (let i = 0; i < count; i++) {
        const word = dv.getUint32(p);
        const dur = dv.getUint32(p + 4);
        p += 12;
        if (word >>> 31) throw new Error('Índice jerárquico no admitido');
        const refSize = word & 0x7fffffff;
        segs.push({ start, end: start + refSize - 1, t0: t / timescale, t1: (t + dur) / timescale });
        start += refSize;
        t += dur;
      }
      return { initEnd: moovEnd, segs };
    }
    off += size;
  }
  return null;
}


// ───────────────────────────── WebM (audio Opus de YouTube) ─────────────────────────────
// Un WebM empieza con la cabecera EBML y un «Segment» que contiene Info (escala de tiempo y
// duración), Tracks y Cues (el índice: en qué byte empieza cada «Cluster» y a qué tiempo). La
// inicialización son los bytes antes del primer Cluster; cada Cluster es un fragmento.

const EBML_ID = 0x1a45dfa3;
const SEGMENT_ID = 0x18538067;
const SEEKHEAD_ID = 0x114d9b74;
const INFO_ID = 0x1549a966;
const CUES_ID = 0x1c53bb6b;
const CLUSTER_ID = 0x1f43b675;

interface Vint {
  value: number;
  len: number;
}

function vint(dv: DataView, off: number, keepMarker: boolean): Vint | null {
  if (off >= dv.byteLength) return null;
  const first = dv.getUint8(off);
  let len = 1;
  let mask = 0x80;
  while (len <= 8 && !(first & mask)) {
    len++;
    mask >>= 1;
  }
  if (len > 8 || off + len > dv.byteLength) return null;
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < len; i++) {
    const b = dv.getUint8(off + i);
    if (b !== 0xff) allOnes = false;
    value = value * 256 + b;
  }
  return { value: !keepMarker && allOnes ? -1 : value, len };
}

interface Ebml {
  id: number;
  size: number; // -1 = desconocido
  dataStart: number;
}

function element(dv: DataView, off: number): Ebml | null {
  const id = vint(dv, off, true);
  if (!id) return null;
  const size = vint(dv, off + id.len, false);
  if (!size) return null;
  return { id: id.value, size: size.value, dataStart: off + id.len + size.len };
}

function uintAt(dv: DataView, off: number, size: number): number {
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + dv.getUint8(off + i);
  return v;
}

/** Recorre los hijos de [start, end) llamando a fn(elemento). */
function children(dv: DataView, start: number, end: number, fn: (e: Ebml) => void) {
  let off = start;
  while (off < end) {
    const e = element(dv, off);
    if (!e || e.size < 0) return;
    fn(e);
    off = e.dataStart + e.size;
  }
}

interface WebmContext {
  segStart: number; // dónde empiezan los datos del Segment (las posiciones de Cues son relativas a esto)
  segEnd: number;
  scale: number; // nanosegundos por unidad
  duration: number; // en unidades
}

/** Lee un elemento Cues que empieza en dv[off] (posición absoluta en el archivo: base + off). */
function parseCues(dv: DataView, off: number, base: number, ctx: WebmContext): Seg[] | null {
  const cues = element(dv, off);
  if (!cues || cues.id !== CUES_ID) throw new Error('Índice de audio dañado');
  if (cues.dataStart + cues.size > dv.byteLength) return null;
  const points: { t: number; pos: number }[] = [];
  children(dv, cues.dataStart, cues.dataStart + cues.size, (cp) => {
    if (cp.id !== 0xbb) return;
    let t = -1;
    let pos = -1;
    children(dv, cp.dataStart, cp.dataStart + cp.size, (c) => {
      if (c.id === 0xb3) t = uintAt(dv, c.dataStart, c.size);
      else if (c.id === 0xb7 && pos < 0) {
        children(dv, c.dataStart, c.dataStart + c.size, (tp) => {
          if (tp.id === 0xf1) pos = uintAt(dv, tp.dataStart, tp.size);
        });
      }
    });
    if (t >= 0 && pos >= 0 && (!points.length || pos > points[points.length - 1].pos)) points.push({ t, pos });
  });
  if (!points.length) throw new Error('Índice de audio vacío');
  const cuesAbs = base + off;
  const segs: Seg[] = [];
  for (let i = 0; i < points.length; i++) {
    const start = ctx.segStart + points[i].pos;
    const nextStart = i + 1 < points.length ? ctx.segStart + points[i + 1].pos : cuesAbs > start ? cuesAbs : ctx.segEnd;
    const t0 = (points[i].t * ctx.scale) / 1e9;
    const t1 = i + 1 < points.length ? (points[i + 1].t * ctx.scale) / 1e9 : ctx.duration > 0 ? (ctx.duration * ctx.scale) / 1e9 : t0 + 10;
    segs.push({ start, end: nextStart - 1, t0, t1 });
  }
  return segs;
}

type WebmHead = { initEnd: number; segs: Seg[] } | { cuesAt: number; initEnd: number; ctx: WebmContext } | null;

/** Principio de un WebM: inicialización y, si el índice está ahí, los fragmentos. null = faltan bytes. */
export function parseWebmHead(buf: ArrayBuffer, fileSize: number): WebmHead {
  const dv = new DataView(buf);
  const len = buf.byteLength;
  const head = element(dv, 0);
  if (!head || head.id !== EBML_ID) throw new Error('No es un archivo WebM');
  const seg = element(dv, head.dataStart + head.size);
  if (!seg) return null;
  if (seg.id !== SEGMENT_ID) throw new Error('WebM sin segmento');
  const ctx: WebmContext = {
    segStart: seg.dataStart,
    segEnd: seg.size < 0 ? fileSize : Math.min(fileSize > 0 ? fileSize : Infinity, seg.dataStart + seg.size),
    scale: 1000000,
    duration: 0,
  };
  let off = seg.dataStart;
  let cuesAt = -1;
  let firstCluster = -1;
  let segs: Seg[] | null = null;
  while (off < len) {
    const e = element(dv, off);
    if (!e) return null;
    if (e.id === CLUSTER_ID) {
      firstCluster = off;
      break;
    }
    if (e.size < 0) throw new Error('WebM con tamaño desconocido');
    const end = e.dataStart + e.size;
    if (e.id === INFO_ID || e.id === SEEKHEAD_ID || e.id === CUES_ID) {
      if (end > len) return null;
      if (e.id === INFO_ID) {
        children(dv, e.dataStart, end, (c) => {
          if (c.id === 0x2ad7b1) ctx.scale = uintAt(dv, c.dataStart, c.size);
          else if (c.id === 0x4489) ctx.duration = c.size === 4 ? dv.getFloat32(c.dataStart) : dv.getFloat64(c.dataStart);
        });
      } else if (e.id === SEEKHEAD_ID) {
        children(dv, e.dataStart, end, (sk) => {
          if (sk.id !== 0x4dbb) return;
          let id = 0;
          let pos = -1;
          children(dv, sk.dataStart, sk.dataStart + sk.size, (c) => {
            if (c.id === 0x53ab) id = uintAt(dv, c.dataStart, c.size);
            else if (c.id === 0x53ac) pos = uintAt(dv, c.dataStart, c.size);
          });
          if (id === CUES_ID && pos >= 0) cuesAt = ctx.segStart + pos;
        });
      } else {
        segs = parseCues(dv, off, 0, ctx);
      }
    }
    off = end;
  }
  if (firstCluster < 0) return null;
  if (segs) return { initEnd: firstCluster, segs };
  if (cuesAt > 0) return { cuesAt, initEnd: firstCluster, ctx };
  throw new Error('El audio no trae índice');
}

function isWebm(buf: ArrayBuffer): boolean {
  return buf.byteLength >= 4 && new DataView(buf).getUint32(0) === EBML_ID;
}

/** Lee inicialización e índice de un archivo (MP4 o WebM), ampliando la lectura si hace falta. */
export async function loadRep(url: string, mime: string, size: number, register?: (abort: () => void) => void): Promise<Rep> {
  let window = HEAD_BYTES;
  for (let attempt = 0; attempt < 4; attempt++) {
    const to = size > 0 ? Math.min(size - 1, window - 1) : window - 1;
    const req = getRange(url, 0, to, 45000);
    if (register) register(req.abort);
    const buf = await req.promise;
    if (isWebm(buf)) {
      const w = parseWebmHead(buf, size);
      if (w && 'segs' in w) return { url, mime, init: buf.slice(0, w.initEnd), segs: w.segs };
      if (w && 'cuesAt' in w) {
        // El índice está al final del archivo: se pide aparte.
        const cuesReq = getRange(url, w.cuesAt, size > 0 ? Math.min(size - 1, w.cuesAt + 1024 * 1024) : w.cuesAt + 1024 * 1024, 45000);
        if (register) register(cuesReq.abort);
        const cuesBuf = await cuesReq.promise;
        const segs = parseCues(new DataView(cuesBuf), 0, w.cuesAt, w.ctx);
        if (!segs) throw new Error('Índice de audio demasiado grande');
        return { url, mime, init: buf.slice(0, w.initEnd), segs };
      }
    } else {
      const parsed = parseHead(buf, size);
      if (parsed) return { url, mime, init: buf.slice(0, parsed.initEnd), segs: parsed.segs };
    }
    if (size > 0 && to >= size - 1) break;
    window *= 4;
  }
  throw new Error('No se pudo leer el índice del video');
}

function segAt(rep: Rep, t: number): number {
  for (let i = 0; i < rep.segs.length; i++) if (t < rep.segs[i].t1) return i;
  return rep.segs.length;
}

function bufferedEndAt(sb: SourceBuffer, t: number): number {
  const b = sb.buffered;
  for (let i = 0; i < b.length; i++) if (t >= b.start(i) - 0.1 && t <= b.end(i) + 0.1) return b.end(i);
  return -1;
}

export class AdaptivePlayer {
  private ms: MediaSource;
  private url = '';
  private v: Feeder | null = null;
  private a: Feeder | null = null;
  private dead = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private quality: number;
  private fatalSent = false;
  /** Peticiones de inicio (índices) en curso, para cancelarlas al cerrar. */
  private pending: (() => void)[] = [];
  private onSeeking = () => this.seek();
  private onTime = () => this.pump();
  /** Audio elegido para la fuente adaptativa (o null si va aparte, sincronizado). */
  private audioSpec: AdaptiveAudio | null = null;
  /** Si el televisor no admite el audio de YouTube en la fuente adaptativa: se reproduce aparte. */
  private sync: HTMLAudioElement | null = null;
  private syncTimer: ReturnType<typeof setInterval> | undefined;
  private syncHandlers: { [ev: string]: () => void } = {};

  constructor(
    private video: HTMLVideoElement,
    private resolve: (path: string) => string,
    private spec: AdaptiveSpec,
    private durationSec: number,
    private startSec: number,
    private onFatal: (message: string) => void,
  ) {
    this.quality = spec.selected;
    this.ms = new MediaSource();
  }

  get videos(): AdaptiveVideo[] {
    return this.spec.videos;
  }

  get currentQuality(): number {
    return this.quality;
  }

  /** Conecta el reproductor del navegador con este flujo. */
  attach() {
    const first = this.spec.videos[this.quality];
    if (!first || typeof MediaSource === 'undefined') return this.fatal('Este televisor no admite reproducción adaptativa');
    if (!MediaSource.isTypeSupported(first.mime)) return this.fatal(`este televisor no admite la imagen de YouTube (${first.mime})`);
    const candidates = [this.spec.audio].concat(this.spec.audioAlt ? [this.spec.audioAlt] : []);
    this.audioSpec = candidates.filter((a) => MediaSource.isTypeSupported(a.mime))[0] || null;
    if (!this.audioSpec) {
      // Plan B: la imagen por la fuente adaptativa y el audio en su propio reproductor, sincronizado.
      const probe = document.createElement('audio');
      const playable = candidates.filter((a) => {
        const r = probe.canPlayType(a.mime);
        return r === 'probably' || r === 'maybe';
      })[0];
      if (!playable) return this.fatal(`este televisor no admite el audio de YouTube (${candidates.map((a) => a.mime).join(', ')})`);
      this.startSyncAudio(playable);
    }
    this.ms.addEventListener('sourceopen', () => void this.open());
    this.url = URL.createObjectURL(this.ms);
    this.video.src = this.url;
    this.video.addEventListener('seeking', this.onSeeking);
    this.video.addEventListener('timeupdate', this.onTime);
    this.timer = setInterval(() => this.pump(), 400);
  }

  destroy() {
    this.dead = true;
    for (const abort of this.pending) abort();
    this.pending = [];
    for (const f of this.feeders()) if (f.abort) f.abort();
    this.stopSyncAudio();
    if (this.timer) clearInterval(this.timer);
    this.video.removeEventListener('seeking', this.onSeeking);
    this.video.removeEventListener('timeupdate', this.onTime);
    try {
      if (this.ms.readyState === 'open') this.ms.endOfStream();
    } catch {
      // ya cerrado
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = '';
  }

  private fatal(message: string) {
    if (this.fatalSent || this.dead) return;
    this.fatalSent = true;
    this.onFatal(message);
  }

  private append(f: Feeder, buf: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = () => {
        f.sb.removeEventListener('updateend', done);
        f.sb.removeEventListener('error', bad);
        resolve();
      };
      const bad = () => {
        f.sb.removeEventListener('updateend', done);
        f.sb.removeEventListener('error', bad);
        reject(new Error('append'));
      };
      f.sb.addEventListener('updateend', done);
      f.sb.addEventListener('error', bad);
      try {
        f.sb.appendBuffer(buf);
      } catch (e) {
        f.sb.removeEventListener('updateend', done);
        f.sb.removeEventListener('error', bad);
        reject(e);
      }
    });
  }

  private remove(f: Feeder, from: number, to: number): Promise<void> {
    return new Promise((resolve) => {
      if (to <= from) return resolve();
      const done = () => {
        f.sb.removeEventListener('updateend', done);
        resolve();
      };
      f.sb.addEventListener('updateend', done);
      try {
        f.sb.remove(from, to);
      } catch {
        f.sb.removeEventListener('updateend', done);
        resolve();
      }
    });
  }

  private async open() {
    if (this.dead) return;
    try {
      const chosen = this.spec.videos[this.quality];
      const audio = this.audioSpec;
      const [vrep, arep] = await Promise.all([
        loadRep(this.resolve(chosen.url), chosen.mime, chosen.bytes, (a) => this.pending.push(a)).catch((e) => {
          throw new Error(`imagen ${chosen.label}: ${why(e)}`);
        }),
        audio
          ? loadRep(this.resolve(audio.url), audio.mime, audio.bytes, (a) => this.pending.push(a)).catch((e) => {
              throw new Error(`audio: ${why(e)}`);
            })
          : Promise.resolve(null),
      ]);
      this.pending = [];
      if (this.dead) return;
      const total = Math.max(vrep.segs.length ? vrep.segs[vrep.segs.length - 1].t1 : 0, arep && arep.segs.length ? arep.segs[arep.segs.length - 1].t1 : 0);
      try {
        this.ms.duration = this.durationSec > 0 ? Math.max(this.durationSec, total) : total;
      } catch {
        // la duración se corrige al terminar
      }
      this.v = { name: 'video', sb: this.ms.addSourceBuffer(chosen.mime), rep: null, next: 0, busy: true, gen: 0, failures: 0, retryAt: 0 };
      const pairs: [Feeder, Rep][] = [[this.v, vrep]];
      if (audio && arep) {
        this.a = { name: 'audio', sb: this.ms.addSourceBuffer(audio.mime), rep: null, next: 0, busy: true, gen: 0, failures: 0, retryAt: 0 };
        pairs.push([this.a, arep]);
      }
      for (const [f, rep] of pairs) {
        await this.append(f, rep.init);
        f.rep = rep;
        f.next = segAt(rep, this.startSec);
        f.busy = false;
      }
      this.pump();
    } catch (err) {
      this.fatal(`al preparar el video (${why(err)})`);
    }
  }

  private feeders(): Feeder[] {
    if (!this.v) return [];
    if (this.sync) return [this.v];
    return this.a ? [this.v, this.a] : [];
  }

  /** Audio aparte (si el televisor no lo admite en la fuente adaptativa), siguiendo a la imagen. */
  private startSyncAudio(a: AdaptiveAudio) {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = this.resolve(a.url);
    this.sync = audio;
    const v = this.video;
    const align = () => {
      if (Math.abs(audio.currentTime - v.currentTime) > 0.25) {
        try {
          audio.currentTime = v.currentTime;
        } catch {
          // todavía sin datos
        }
      }
    };
    this.syncHandlers = {
      playing: () => {
        align();
        const p = audio.play();
        if (p && p.catch) p.catch(() => undefined);
      },
      pause: () => audio.pause(),
      waiting: () => audio.pause(),
      seeking: () => {
        try {
          audio.currentTime = v.currentTime;
        } catch {
          // todavía sin datos
        }
      },
      volumechange: () => {
        audio.volume = v.volume;
        audio.muted = v.muted;
      },
    };
    for (const ev of Object.keys(this.syncHandlers)) v.addEventListener(ev, this.syncHandlers[ev]);
    audio.addEventListener('error', () => this.fatal('el audio de YouTube no se pudo reproducir'));
    // Corrige el desfase poco a poco: si se separan más de un cuarto de segundo, el audio salta a la imagen.
    this.syncTimer = setInterval(() => {
      if (v.paused || v.readyState < 3) return;
      if (audio.paused && audio.readyState >= 2) {
        const p = audio.play();
        if (p && p.catch) p.catch(() => undefined);
      }
      align();
    }, 1000);
  }

  private stopSyncAudio() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    for (const ev of Object.keys(this.syncHandlers)) this.video.removeEventListener(ev, this.syncHandlers[ev]);
    this.syncHandlers = {};
    if (this.sync) {
      this.sync.pause();
      this.sync.removeAttribute('src');
      this.sync.load();
    }
    this.sync = null;
  }

  private pump() {
    if (this.dead || this.ms.readyState === 'closed') return;
    const now = this.video.currentTime || 0;
    for (const f of this.feeders()) this.feed(f, now);
    this.maybeEnd();
  }

  private feed(f: Feeder, now: number) {
    if (f.busy || f.sb.updating || !f.rep || Date.now() < f.retryAt) return;
    if (f.next >= f.rep.segs.length) return;
    const seg = f.rep.segs[f.next];
    if (seg.t0 > now + AHEAD_SEC) return;
    f.busy = true;
    const gen = f.gen;
    const stale = () => this.dead || gen !== f.gen;
    const req = getRange(f.rep.url, seg.start, seg.end);
    f.abort = req.abort;
    req.promise
      .then(async (buf) => {
        if (stale()) return;
        await this.trim(f, now);
        if (stale()) return;
        try {
          await this.append(f, buf);
        } catch (e) {
          if (stale()) return;
          if (e && (e as { name?: string }).name === 'QuotaExceededError') {
            // Sin espacio: se libera lo ya visto y se reintenta en el siguiente ciclo.
            await this.remove(f, 0, Math.max(0, (this.video.currentTime || 0) - 5));
            f.busy = false;
            return;
          }
          throw e;
        }
        if (stale()) return;
        f.failures = 0;
        f.next++;
        f.busy = false;
        this.pump();
      })
      .catch((err) => {
        if (stale()) return;
        f.busy = false;
        f.failures++;
        // Reintento con espera creciente; si el teléfono no vuelve, se avisa.
        f.retryAt = Date.now() + Math.min(8000, 1000 * f.failures);
        if (f.failures >= MAX_FAILURES) this.fatal(`${f.name}, fragmento ${f.next + 1}: ${why(err)}`);
      });
  }

  /** Libera el video ya visto (más de BEHIND_SEC atrás) para no llenar la memoria del televisor. */
  private async trim(f: Feeder, now: number) {
    const b = f.sb.buffered;
    if (!b.length || f.sb.updating) return;
    const start = b.start(0);
    if (start < now - BEHIND_SEC - 5) await this.remove(f, start, now - BEHIND_SEC);
  }

  private maybeEnd() {
    const fs = this.feeders();
    if (!fs.length || this.ms.readyState !== 'open') return;
    for (const f of fs) if (f.busy || f.sb.updating || !f.rep || f.next < f.rep.segs.length) return;
    try {
      this.ms.endOfStream();
    } catch {
      // se reintenta en el próximo ciclo
    }
  }

  /** El usuario adelantó o retrocedió: si ya está en memoria no se pide nada; si no, se empieza ahí. */
  private seek() {
    if (this.dead) return;
    const t = this.video.currentTime || 0;
    for (const f of this.feeders()) {
      if (!f.rep) continue;
      if (f.abort) f.abort();
      f.abort = undefined;
      f.gen++;
      f.busy = false;
      f.failures = 0;
      f.retryAt = 0;
      if (f.sb.updating) {
        try {
          f.sb.abort();
        } catch {
          // nada que abortar
        }
      }
      const end = bufferedEndAt(f.sb, t);
      if (end >= 0) {
        // Ya está en memoria hasta «end»: se sigue desde el primer fragmento posterior.
        let i = segAt(f.rep, t);
        while (i < f.rep.segs.length && f.rep.segs[i].t0 < end - 0.05) i++;
        f.next = i;
      } else {
        f.next = segAt(f.rep, t);
      }
    }
    this.pump();
  }

  /** Cambia la calidad de la imagen sin cortar el audio (la imagen se vuelve a pedir desde el punto actual). */
  async setQuality(index: number) {
    const f = this.v;
    const target = this.spec.videos[index];
    if (this.dead || !f || !target || index === this.quality) return;
    if (f.abort) f.abort();
    f.abort = undefined;
    f.gen++;
    f.busy = true;
    if (f.sb.updating) {
      try {
        f.sb.abort();
      } catch {
        // nada que abortar
      }
    }
    try {
      const rep = await loadRep(this.resolve(target.url), target.mime, target.bytes, (a) => this.pending.push(a));
      if (this.dead) return;
      await this.remove(f, 0, this.ms.duration || 1e9);
      await this.append(f, rep.init);
      f.rep = rep;
      f.next = segAt(rep, this.video.currentTime || 0);
      this.quality = index;
      f.busy = false;
      this.pump();
    } catch (err) {
      f.busy = false;
      this.fatal(`al cambiar la calidad (${why(err)})`);
    }
  }
}
