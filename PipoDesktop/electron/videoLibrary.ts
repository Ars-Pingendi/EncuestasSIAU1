// Biblioteca de películas y series: recorre las carpetas de video, analiza cada archivo con
// ffmpeg (solo los nuevos o modificados), reconoce película/serie y vigila los cambios.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { VideoStatus } from '../shared/types';
import type { Ffmpeg, ProbeResult } from './ffmpeg';
import { isInside, samePath } from './library';
import type { JsonStore } from './store';
import { parseVideoName, seriesKey } from './videoNames';

export const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.m4v', '.mov', '.avi', '.ts', '.m2ts', '.mts', '.wmv', '.webm', '.mpg', '.mpeg', '.flv', '.ogv', '.3gp']);
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git', 'extras', 'featurettes', 'behind the scenes', 'deleted scenes', 'trailers', 'sample', 'samples']);
const CACHE_VERSION = 1;

export interface VideoItem {
  id: string;
  fullPath: string;
  relPath: string;
  root: string;
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
  ext: string;
  probe: ProbeResult | null;
}

interface CacheEntry {
  size: number;
  mtimeMs: number;
  addedAt: number;
  probe: ProbeResult | null;
}

interface CacheFile {
  version: number;
  entries: Record<string, CacheEntry>;
}

export interface VideoLibraryOptions {
  store: JsonStore;
  ffmpeg: Ffmpeg;
  defaultFolders: string[];
  onProgress: (s: VideoStatus) => void;
  onChange?: () => void;
}

export function videoIdForPath(file: string): string {
  return 'v:' + crypto.createHash('sha1').update(path.resolve(file).toLowerCase()).digest('hex').slice(0, 16);
}

export class VideoLibrary {
  private entries = new Map<string, CacheEntry>();
  private list: VideoItem[] = [];
  private byIdMap = new Map<string, VideoItem>();
  private folders: string[];
  private scanning: Promise<void> | null = null;
  private rescanRequested = false;
  private progress = { scanning: false, done: 0, total: 0 };
  private watchers: fs.FSWatcher[] = [];
  private watchTimer: NodeJS.Timeout | null = null;
  private lastScan = 0;

  constructor(private readonly o: VideoLibraryOptions) {
    const saved = o.store.get<string[]>('carpetasVideo');
    this.folders = saved ?? o.defaultFolders.filter((f) => fs.existsSync(f));
    const cache = o.store.get<CacheFile>('videos');
    if (cache && cache.version === CACHE_VERSION) {
      for (const [p, e] of Object.entries(cache.entries)) this.entries.set(p, e);
      this.rebuild();
    }
  }

  items(): VideoItem[] {
    return this.list;
  }

  byId(id: string): VideoItem | undefined {
    return this.byIdMap.get(id);
  }

  getFolders(): string[] {
    return [...this.folders];
  }

  /** Para no escanear de nuevo si ya se hizo hace poco. */
  scannedRecently(ms = 60_000): boolean {
    return Date.now() - this.lastScan < ms;
  }

  status(): VideoStatus {
    const movies = this.list.filter((i) => i.kind === 'movie').length;
    const episodes = this.list.length - movies;
    const series = new Set(this.list.filter((i) => i.kind === 'episode').map((i) => i.seriesKey)).size;
    return { folders: [...this.folders], movies, episodes, series, ffmpeg: this.o.ffmpeg.available(), ...this.progress };
  }

  addFolder(folder: string): VideoStatus {
    const resolved = path.resolve(folder);
    if (!this.folders.some((f) => samePath(f, resolved))) {
      this.folders = this.folders.filter((f) => !isInside(f, resolved));
      if (!this.folders.some((f) => isInside(resolved, f))) this.folders.push(resolved);
      this.saveFolders();
      this.watch();
      void this.scan();
    }
    return this.status();
  }

  removeFolder(folder: string): VideoStatus {
    this.folders = this.folders.filter((f) => !samePath(f, folder));
    this.saveFolders();
    this.watch();
    this.rebuild();
    void this.scan();
    return this.status();
  }

  private saveFolders() {
    this.o.store.set('carpetasVideo', this.folders, 0);
  }

  scan(): Promise<void> {
    if (this.scanning) {
      this.rescanRequested = true;
      return this.scanning;
    }
    this.scanning = this.doScan()
      .catch((err) => console.error('Error al escanear videos', err))
      .finally(() => {
        this.scanning = null;
        this.lastScan = Date.now();
        if (this.rescanRequested) {
          this.rescanRequested = false;
          void this.scan();
        }
      });
    return this.scanning;
  }

  private emit() {
    this.o.onProgress(this.status());
  }

  private async doScan(): Promise<void> {
    const files: { file: string; size: number; mtimeMs: number; birthMs: number }[] = [];
    for (const folder of this.folders) await walk(folder, files, 0);
    const seen = new Set(files.map((f) => f.file));

    const todo = files.filter((f) => {
      const e = this.entries.get(f.file);
      return !e || e.size !== f.size || e.mtimeMs !== f.mtimeMs;
    });
    for (const p of [...this.entries.keys()]) {
      if (!seen.has(p) || !this.folders.some((f) => isInside(p, f))) this.entries.delete(p);
    }

    if (todo.length) {
      this.progress = { scanning: true, done: 0, total: todo.length };
      this.emit();
      const queue = [...todo];
      let lastEmit = Date.now();
      const worker = async () => {
        for (;;) {
          const f = queue.shift();
          if (!f) return;
          const probe = await this.o.ffmpeg.probe(f.file).catch(() => null);
          this.entries.set(f.file, {
            size: f.size,
            mtimeMs: f.mtimeMs,
            addedAt: this.entries.get(f.file)?.addedAt ?? f.birthMs,
            probe,
          });
          this.progress.done++;
          if (Date.now() - lastEmit > 400) {
            lastEmit = Date.now();
            this.emit();
          }
        }
      };
      await Promise.all(Array.from({ length: 3 }, worker));
    }

    this.progress = { scanning: false, done: todo.length, total: todo.length };
    this.rebuild();
    if (todo.length || seen.size !== this.list.length) this.saveCache();
    this.emit();
    this.o.onChange?.();
  }

  private saveCache() {
    const cache: CacheFile = { version: CACHE_VERSION, entries: Object.fromEntries(this.entries) };
    this.o.store.set('videos', cache, 1000);
  }

  private rebuild() {
    const items: VideoItem[] = [];
    for (const [file, e] of this.entries) {
      const root = this.folders.find((f) => isInside(file, f));
      if (!root) continue;
      // Archivos que ffmpeg lee pero sin imagen (audio, carátulas) no son videos.
      if (e.probe && !e.probe.video) continue;
      const rel = path.relative(root, file);
      const parsed = parseVideoName(rel, path.basename(root));
      items.push({
        id: videoIdForPath(file),
        fullPath: file,
        relPath: rel,
        root,
        kind: parsed.kind,
        title: parsed.title,
        series: parsed.series ?? '',
        seriesKey: parsed.series ? seriesKey(parsed.series) : '',
        season: parsed.season ?? 0,
        episode: parsed.episode ?? 0,
        year: parsed.year ?? 0,
        durationMs: e.probe?.durationMs ?? 0,
        size: e.size,
        addedAt: e.addedAt,
        ext: path.extname(file).toLowerCase(),
        probe: e.probe,
      });
    }
    // Una misma serie puede escribirse de varias formas: se usa la más frecuente.
    const names = new Map<string, Map<string, number>>();
    for (const it of items) {
      if (it.kind !== 'episode') continue;
      const m = names.get(it.seriesKey) ?? new Map<string, number>();
      m.set(it.series, (m.get(it.series) ?? 0) + 1);
      names.set(it.seriesKey, m);
    }
    for (const it of items) {
      if (it.kind !== 'episode') continue;
      const m = names.get(it.seriesKey)!;
      it.series = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    this.list = items;
    this.byIdMap = new Map(items.map((i) => [i.id, i]));
  }

  /** Vigila las carpetas y vuelve a escanear unos segundos después del último cambio. */
  watch(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    for (const folder of this.folders) {
      try {
        const w = fs.watch(folder, { recursive: true }, (_ev, name) => {
          if (name && !VIDEO_EXTENSIONS.has(path.extname(String(name)).toLowerCase()) && path.extname(String(name))) return;
          if (this.watchTimer) clearTimeout(this.watchTimer);
          this.watchTimer = setTimeout(() => void this.scan(), 6000);
        });
        w.on('error', () => undefined);
        this.watchers.push(w);
      } catch {
        // carpeta inexistente o sin permisos
      }
    }
  }

  close(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    if (this.watchTimer) clearTimeout(this.watchTimer);
    if (this.list.length) this.saveCache();
  }
}

async function walk(dir: string, out: { file: string; size: number; mtimeMs: number; birthMs: number }[], depth: number) {
  if (depth > 12) return;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      await walk(full, out, depth + 1);
    } else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      if (entry.name.startsWith('.')) continue;
      try {
        const st = await fsp.stat(full);
        // Muestras de unos pocos MB («sample») que traen algunas descargas.
        if (st.size < 150 * 1024 * 1024 && /(^|[\s._-])sample([\s._-]|$)/i.test(entry.name)) continue;
        if (st.size < 64 * 1024) continue;
        out.push({ file: full, size: st.size, mtimeMs: Math.round(st.mtimeMs), birthMs: Math.round(st.birthtimeMs || st.mtimeMs) });
      } catch {
        // archivo inaccesible
      }
    }
  }
}
