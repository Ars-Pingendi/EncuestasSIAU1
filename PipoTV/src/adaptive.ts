// Reproductor adaptativo para YouTube: imagen (MP4/H.264) y audio (M4A) llegan como dos archivos
// separados desde el teléfono y se unen en el televisor con Media Source Extensions.
//
// Cada archivo es un MP4 fragmentado con un índice «sidx» al principio (como los de YouTube):
// ftyp + moov (inicialización), sidx (dónde empieza cada fragmento de ~5 s) y luego moof + mdat.
// Se lee solo el principio de cada archivo, se arma la lista de fragmentos y se piden por rango
// los que hacen falta, unos 30 s por delante de la reproducción.
import type { AdaptiveSpec, AdaptiveVideo } from './api';

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
}

function fourcc(dv: DataView, off: number): string {
  return String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));
}

function u64(dv: DataView, off: number): number {
  return dv.getUint32(off) * 4294967296 + dv.getUint32(off + 4);
}

/** Pide los bytes [from, to] de un archivo. Si el servidor ignora el rango (200) se recorta aquí. */
export function getRange(url: string, from: number, to: number): Promise<ArrayBuffer> {
  return fetch(url, { headers: { Range: `bytes=${from}-${to}` } }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.arrayBuffer().then((buf) => (res.status === 200 && from > 0 ? buf.slice(from, to + 1) : buf));
  });
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

/** Lee inicialización e índice de un archivo, ampliando la lectura si hace falta. */
export async function loadRep(url: string, mime: string, size: number): Promise<Rep> {
  let window = HEAD_BYTES;
  for (let attempt = 0; attempt < 4; attempt++) {
    const to = size > 0 ? Math.min(size - 1, window - 1) : window - 1;
    const buf = await getRange(url, 0, to);
    const parsed = parseHead(buf, size);
    if (parsed) return { url, mime, init: buf.slice(0, parsed.initEnd), segs: parsed.segs };
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
  private onSeeking = () => this.seek();
  private onTime = () => this.pump();

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
    if (!MediaSource.isTypeSupported(first.mime) || !MediaSource.isTypeSupported(this.spec.audio.mime)) {
      return this.fatal('Este televisor no admite el formato de YouTube');
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
      const [vrep, arep] = await Promise.all([
        loadRep(this.resolve(chosen.url), chosen.mime, chosen.bytes),
        loadRep(this.resolve(this.spec.audio.url), this.spec.audio.mime, this.spec.audio.bytes),
      ]);
      if (this.dead) return;
      const total = Math.max(vrep.segs.length ? vrep.segs[vrep.segs.length - 1].t1 : 0, arep.segs.length ? arep.segs[arep.segs.length - 1].t1 : 0);
      try {
        this.ms.duration = this.durationSec > 0 ? Math.max(this.durationSec, total) : total;
      } catch {
        // la duración se corrige al terminar
      }
      this.v = { name: 'video', sb: this.ms.addSourceBuffer(chosen.mime), rep: null, next: 0, busy: true, gen: 0, failures: 0, retryAt: 0 };
      this.a = { name: 'audio', sb: this.ms.addSourceBuffer(this.spec.audio.mime), rep: null, next: 0, busy: true, gen: 0, failures: 0, retryAt: 0 };
      for (const [f, rep] of [[this.v, vrep], [this.a, arep]] as [Feeder, Rep][]) {
        await this.append(f, rep.init);
        f.rep = rep;
        f.next = segAt(rep, this.startSec);
        f.busy = false;
      }
      this.pump();
    } catch (err) {
      this.fatal(err instanceof Error ? err.message : 'No se pudo preparar el video');
    }
  }

  private feeders(): Feeder[] {
    return this.v && this.a ? [this.v, this.a] : [];
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
    getRange(f.rep.url, seg.start, seg.end)
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
        if (f.failures >= MAX_FAILURES) this.fatal(err instanceof Error ? err.message : 'Se perdió la conexión con el teléfono');
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
      const rep = await loadRep(this.resolve(target.url), target.mime, target.bytes);
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
      this.fatal(err instanceof Error ? err.message : 'No se pudo cambiar la calidad');
    }
  }
}
