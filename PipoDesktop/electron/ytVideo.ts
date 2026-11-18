// Videos de YouTube para el visor de la app y para la TV: yt-dlp dice qué archivos ofrece YouTube
// (imagen sola hasta 1080p, audio M4A u Opus, y video con audio incluido) y este módulo los entrega
// por partes, con soporte de rangos, para que el reproductor una imagen y audio.
// Mismo formato de respuesta que Pipo para Android, así la TV funciona igual con ambos.
// No depende de Electron para poder probarse con Node.

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface YtFile {
  url: string;
  headers: Record<string, string>;
  size: number;
  height: number;
  fps: number;
  codec: string;
  ext: string;
}

export interface YtVideoOptions {
  videoId: string;
  title: string;
  durationMs: number;
  /** Solo imagen, MP4/H.264, una por altura (de menor a mayor), hasta 1080p. */
  adaptive: YtFile[];
  /** Video con audio incluido (MP4), de menor a mayor. */
  muxed: YtFile[];
  audioM4a?: YtFile;
  audioWebm?: YtFile;
}

export interface YtVideoDeps {
  /** JSON de `yt-dlp -J` del video. */
  info: (videoId: string) => Promise<any>;
  fetch: Fetch;
  log?: (line: string) => void;
}

const CACHE_MS = 90 * 60 * 1000;
const INFO_TIMEOUT_MS = 75_000;
const CHUNK = 4 * 1024 * 1024;
const MAX_HEIGHT = 1080;

function clenOf(url: string): number {
  const m = /[?&]clen=(\d+)/.exec(url);
  return m ? Number(m[1]) : 0;
}

function label(height: number): string {
  return height >= 2160 ? '4K' : `${height}p`;
}

export function videoIdOk(id: string): boolean {
  return /^[\w-]{11}$/.test(id);
}

/** Elige del JSON de yt-dlp los archivos que sirven (solo descargas HTTPS directas, sin HLS ni DASH). */
export function pickFormats(videoId: string, data: any): YtVideoOptions {
  const formats: any[] = Array.isArray(data?.formats) ? data.formats : [];
  const usable = formats.filter((f) => f && typeof f.url === 'string' && (f.protocol === 'https' || f.protocol === 'http'));
  const file = (f: any): YtFile => ({
    url: f.url,
    headers: { ...(data.http_headers ?? {}), ...(f.http_headers ?? {}) },
    size: Number(f.filesize) || clenOf(f.url),
    height: Number(f.height) || 0,
    fps: Math.round(Number(f.fps) || 0),
    codec: String(f.vcodec && f.vcodec !== 'none' ? f.vcodec : f.acodec || ''),
    ext: String(f.ext || ''),
  });
  const rate = (f: any) => Number(f.tbr) || Number(f.vbr) || Number(f.abr) || 0;
  const byHeight = (list: any[]): YtFile[] => {
    const best = new Map<number, any>();
    for (const f of list) {
      const h = Number(f.height) || 0;
      const prev = best.get(h);
      if (!prev || rate(f) > rate(prev)) best.set(h, f);
    }
    return [...best.values()].sort((a, b) => a.height - b.height).map(file);
  };
  const videoOnly = usable.filter((f) => f.vcodec && f.vcodec !== 'none' && (!f.acodec || f.acodec === 'none'));
  const adaptive = byHeight(
    videoOnly.filter((f) => f.ext === 'mp4' && String(f.vcodec).startsWith('avc1') && (Number(f.height) || 0) > 0 && f.height <= MAX_HEIGHT),
  ).filter((f) => f.size > 0);
  const muxed = byHeight(usable.filter((f) => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none' && f.ext === 'mp4'));
  const audioOnly = usable.filter((f) => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.acodec !== 'none');
  // Pista de audio original (no doblada) si el video tiene varias.
  const note = (f: any) => String(f.format_note ?? '');
  const originals = audioOnly.filter((f) => /original/i.test(note(f)));
  const notDubbed = audioOnly.filter((f) => !/dub/i.test(note(f)));
  const pool = originals.length ? originals : notDubbed.length ? notDubbed : audioOnly;
  const best = (list: any[]) => list.sort((a, b) => rate(b) - rate(a))[0];
  const m4a = best(pool.filter((f) => String(f.acodec).startsWith('mp4a') && (f.ext === 'm4a' || f.ext === 'mp4')));
  const webm = best(pool.filter((f) => f.acodec === 'opus' && f.ext === 'webm'));
  return {
    videoId,
    title: String(data?.title ?? ''),
    durationMs: Math.round((Number(data?.duration) || 0) * 1000),
    adaptive,
    muxed,
    audioM4a: m4a ? file(m4a) : undefined,
    audioWebm: webm ? file(webm) : undefined,
  };
}

export class YtVideo {
  private cache = new Map<string, { at: number; options: YtVideoOptions }>();
  private inflight = new Map<string, Promise<YtVideoOptions>>();
  private lines: string[] = [];

  constructor(private readonly d: YtVideoDeps) {}

  log(line: string) {
    const t = new Date();
    const hh = (n: number) => String(n).padStart(2, '0');
    this.lines.push(`${hh(t.getHours())}:${hh(t.getMinutes())}:${hh(t.getSeconds())} ${line}`);
    if (this.lines.length > 250) this.lines.splice(0, this.lines.length - 250);
    this.d.log?.(line);
  }

  /** Lo último que pasó (lo más reciente primero), para la TV y para Ajustes. */
  dump(max = 80): string {
    return this.lines.slice(-max).reverse().join('\n');
  }

  invalidate(videoId: string) {
    this.cache.delete(videoId);
  }

  /** Calidades del video (una sola consulta a la vez por video; se guardan 90 min). */
  options(videoId: string): Promise<YtVideoOptions> {
    const c = this.cache.get(videoId);
    if (c && Date.now() - c.at < CACHE_MS) return Promise.resolve(c.options);
    const running = this.inflight.get(videoId);
    if (running) return running;
    const t0 = Date.now();
    this.log(`YouTube: ${videoId}: consultando con yt-dlp…`);
    const p = new Promise<YtVideoOptions>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`YouTube tardó más de ${INFO_TIMEOUT_MS / 1000} s en responder. Vuelve a intentarlo.`)), INFO_TIMEOUT_MS);
      this.d
        .info(videoId)
        .then((data) => {
          clearTimeout(timer);
          const o = pickFormats(videoId, data);
          this.log(
            `YouTube: ${videoId}: respondió en ${Date.now() - t0} ms; imagen ${o.adaptive.map((f) => label(f.height)).join('/') || 'ninguna'}, ` +
              `con audio ${o.muxed.length}, M4A ${o.audioM4a ? 'sí' : 'no'}, Opus ${o.audioWebm ? 'sí' : 'no'}`,
          );
          this.cache.set(videoId, { at: Date.now(), options: o });
          resolve(o);
        })
        .catch((err: Error) => {
          clearTimeout(timer);
          this.log(`YouTube: ${videoId}: falló tras ${Date.now() - t0} ms (${err.message})`);
          reject(err);
        });
    }).finally(() => this.inflight.delete(videoId));
    this.inflight.set(videoId, p);
    return p;
  }

  /** Empieza a consultar ya (al pulsar «Ver en la TV»), para que esté listo cuando la TV lo pida. */
  prepare(videoId: string) {
    this.options(videoId).catch(() => undefined);
  }

  /**
   * Cómo ver el video (mismo formato que el teléfono): «adaptive» = imagen y audio por separado,
   * «url» = video con audio incluido (la reserva). [base] es la ruta de los archivos (p. ej. «/pipo/yt»).
   */
  async plan(videoId: string, base: string, query: string, maxHeight: number, forceDirect: boolean) {
    const o = await this.options(videoId);
    const path = (kind: string, height = 0) => `${base}/${videoId}/${kind}${height > 0 ? `/${height}` : ''}${query}`;
    const m4a = o.audioM4a;
    const webm = o.audioWebm;
    const canAdapt = !forceDirect && o.adaptive.length > 0 && !!(m4a || webm);
    const muxed = o.muxed[o.muxed.length - 1];
    if (!canAdapt && !muxed) {
      throw new Error(
        `YouTube no ofreció un formato que se pueda ver (imagen ${o.adaptive.length}, audio M4A ${m4a ? 'sí' : 'no'}, Opus ${webm ? 'sí' : 'no'}, video con audio ${o.muxed.length})`,
      );
    }
    const plan: any = {
      id: `yt:${videoId}`,
      title: o.title,
      startAt: 0,
      durationMs: o.durationMs,
      container: 'native',
      audioIndex: 0,
      audio: [],
      subs: [],
      url: muxed ? path('m', muxed.height) : '',
    };
    if (!canAdapt) {
      return { ...plan, mode: 'direct', reason: `Video con audio de YouTube (${label(muxed!.height)})`, info: `${label(muxed!.height)} · H264` };
    }
    let selected = 0;
    const videos = o.adaptive.map((f, i) => {
      if (maxHeight <= 0 || f.height <= maxHeight) selected = i;
      return {
        label: label(f.height),
        height: f.height,
        fps: f.fps,
        url: path('v', f.height),
        mime: `video/mp4; codecs="${f.codec || 'avc1.640028'}"`,
        bytes: f.size,
      };
    });
    const m4aJson = m4a ? { url: path('a'), mime: 'audio/mp4; codecs="mp4a.40.2"', bytes: m4a.size } : null;
    const webmJson = webm ? { url: path('aw'), mime: 'audio/webm; codecs="opus"', bytes: webm.size } : null;
    const chosen = o.adaptive[selected];
    return {
      ...plan,
      mode: 'adaptive',
      reason: 'Imagen y audio de YouTube por separado',
      info: `${label(chosen.height)}${chosen.fps > 30 ? chosen.fps : ''} · H264 · ${m4a ? 'AAC' : 'Opus'}`,
      adaptive: { audio: m4aJson ?? webmJson, ...(m4aJson && webmJson ? { audioAlt: webmJson } : {}), videos, selected },
    };
  }

  async source(videoId: string, kind: string, height: number): Promise<YtFile | undefined> {
    const o = await this.options(videoId);
    if (kind === 'v') return o.adaptive.find((f) => f.height === height);
    if (kind === 'm') return o.muxed.find((f) => f.height === height);
    if (kind === 'a') return o.audioM4a;
    if (kind === 'aw') return o.audioWebm;
    return undefined;
  }

  private async fetchRange(f: YtFile, from: number, to: number): Promise<Response> {
    return this.d.fetch(f.url, { headers: { ...f.headers, Range: `bytes=${from}-${to}` } });
  }

  /**
   * Entrega un archivo de YouTube con soporte de rangos. Se piden a YouTube trozos de 4 MB a medida
   * que se leen (un solo pedido grande se corta o se estrangula). El primero se pide antes de
   * contestar: si YouTube lo rechaza, se consulta de nuevo el video y se reintenta una vez.
   */
  async serve(videoId: string, kind: string, height: number, range: string | null): Promise<Response> {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    const fail = (status: number, message: string) => {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify({ error: message }), { status, headers });
    };
    const what = `${videoId}/${kind}${height || ''}`;
    let f = await this.source(videoId, kind, height);
    if (!f) return fail(404, 'Esa calidad no está disponible');
    const total = f.size;
    const m = /bytes=(\d*)-(\d*)/.exec(range ?? '');
    const ranged = !!m && !!(m[1] || m[2]) && total > 0;
    let start = 0;
    let end = total > 0 ? total - 1 : Number.MAX_SAFE_INTEGER;
    if (ranged) {
      start = m![1] ? Number(m![1]) : Math.max(0, total - Number(m![2]));
      end = m![1] && m![2] ? Math.min(Number(m![2]), total - 1) : total - 1;
      if (start >= total || start > end) {
        headers.set('Content-Range', `bytes */${total}`);
        return new Response(null, { status: 416, headers });
      }
    }
    const firstEnd = Math.min(end, start + CHUNK - 1);
    let first = await this.fetchRange(f, start, firstEnd).catch((e: Error) => fail(502, e.message));
    if (!first.ok) {
      this.log(`TV: ${what}: YouTube respondió ${first.status}; se consulta de nuevo`);
      this.invalidate(videoId);
      f = await this.source(videoId, kind, height).catch(() => undefined);
      if (!f) return fail(502, `YouTube respondió ${first.status}`);
      first = await this.fetchRange(f, start, firstEnd).catch((e: Error) => fail(502, e.message));
      if (!first.ok) {
        this.log(`TV: ${what}: ERROR YouTube respondió ${first.status}`);
        return fail(502, `YouTube respondió ${first.status}`);
      }
    }
    if (start === 0) this.log(`TV: ${what}: empieza a enviarse (${total > 0 ? `${Math.round(total / 1024)} KB` : 'tamaño desconocido'})`);
    const file = f;
    let pos = start;
    let pending: Response | null = first;
    let current: Response | null = null;
    const body = new ReadableStream<Uint8Array>({
      pull: async (ctrl) => {
        try {
          if (pos > end) return ctrl.close();
          const res: Response = pending ?? (await this.fetchRange(file, pos, Math.min(end, pos + CHUNK - 1)));
          pending = null;
          current = res;
          if (!res.ok) throw new Error(`YouTube respondió ${res.status}`);
          const buf = new Uint8Array(await res.arrayBuffer());
          current = null;
          if (!buf.length) return ctrl.close();
          ctrl.enqueue(buf);
          pos += buf.length;
          if (pos > end) ctrl.close();
        } catch (err) {
          this.log(`TV: ${what}: se cortó (${(err as Error).message})`);
          ctrl.error(err);
        }
      },
      cancel: () => {
        pos = end + 1;
        void current?.body?.cancel().catch(() => undefined);
      },
    });
    headers.set('Content-Type', kind === 'a' ? 'audio/mp4' : kind === 'aw' ? 'audio/webm' : 'video/mp4');
    headers.set('Accept-Ranges', 'bytes');
    if (total > 0) headers.set('Content-Length', String(end - start + 1));
    if (ranged) headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
    return new Response(body, { status: ranged ? 206 : 200, headers });
  }
}
