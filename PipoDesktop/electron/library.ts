// Biblioteca local: recorre las carpetas de música, lee las etiquetas (music-metadata),
// guarda las carátulas y vigila los cambios en disco para actualizarse sola.
// No depende de Electron para poder probarse con Node.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseFile } from 'music-metadata';
import type { LibrarySnapshot, ScanProgress, Track } from '../shared/types';
import type { JsonStore } from './store';

export const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.mp4', '.aac', '.flac', '.ogg', '.oga', '.opus', '.wav', '.webm', '.weba',
]);

const COVER_NAMES = ['cover', 'folder', 'front', 'album', 'albumart', 'albumartsmall', 'portada', 'caratula'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git']);

interface CacheEntry {
  mtimeMs: number;
  size: number;
  track: Track;
}

interface CacheFile {
  version: number;
  entries: Record<string, CacheEntry>;
  arts: Record<string, string>;
}

const CACHE_VERSION = 2;

export function trackIdForPath(filePath: string): string {
  return 'f:' + crypto.createHash('sha1').update(path.resolve(filePath).toLowerCase()).digest('hex').slice(0, 16);
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').trim() : '';
}

export interface LibraryOptions {
  store: JsonStore;
  artDir: string;
  defaultFolders: string[];
  onChange: (snap: LibrarySnapshot) => void;
  onProgress: (p: ScanProgress) => void;
}

export class Library {
  private entries = new Map<string, CacheEntry>();
  private arts = new Map<string, string>();
  private byId = new Map<string, string>();
  private folders: string[];
  private scannedAt = 0;
  private scanning: Promise<void> | null = null;
  private rescanRequested = false;
  private watchers: fs.FSWatcher[] = [];
  private watchTimer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: LibraryOptions) {
    fs.mkdirSync(opts.artDir, { recursive: true });
    const saved = opts.store.get<string[]>('carpetas');
    this.folders = saved ?? opts.defaultFolders.filter((f) => fs.existsSync(f));
    const cache = opts.store.get<CacheFile>('biblioteca');
    if (cache && cache.version === CACHE_VERSION) {
      for (const [p, e] of Object.entries(cache.entries)) this.entries.set(p, e);
      for (const [id, p] of Object.entries(cache.arts)) this.arts.set(id, p);
    }
    this.reindex();
  }

  snapshot(): LibrarySnapshot {
    const inFolders = (p: string) => this.folders.some((f) => isInside(p, f));
    const tracks = [...this.entries.entries()].filter(([p]) => inFolders(p)).map(([, e]) => e.track);
    return { tracks, folders: [...this.folders], scannedAt: this.scannedAt };
  }

  pathForId(id: string): string | undefined {
    return this.byId.get(id);
  }

  trackForId(id: string): Track | undefined {
    const p = this.byId.get(id);
    return p ? this.entries.get(p)?.track : undefined;
  }

  artPath(artId: string): string | undefined {
    return this.arts.get(artId);
  }

  getFolders(): string[] {
    return [...this.folders];
  }

  addFolder(folder: string): string[] {
    const resolved = path.resolve(folder);
    if (!this.folders.some((f) => samePath(f, resolved))) {
      // Si la nueva carpeta contiene a otras, éstas sobran.
      this.folders = this.folders.filter((f) => !isInside(f, resolved));
      if (!this.folders.some((f) => isInside(resolved, f))) this.folders.push(resolved);
      this.saveFolders();
      this.watch();
      void this.scan();
    }
    return this.getFolders();
  }

  removeFolder(folder: string): string[] {
    this.folders = this.folders.filter((f) => !samePath(f, folder));
    this.saveFolders();
    this.watch();
    this.opts.onChange(this.snapshot());
    void this.scan();
    return this.getFolders();
  }

  private saveFolders() {
    this.opts.store.set('carpetas', this.folders, 0);
  }

  /** Escanea las carpetas. Si ya hay un escaneo en curso, programa otro al terminar. */
  scan(): Promise<void> {
    if (this.scanning) {
      this.rescanRequested = true;
      return this.scanning;
    }
    this.scanning = this.doScan()
      .catch((err) => console.error('Error al escanear', err))
      .finally(() => {
        this.scanning = null;
        if (this.rescanRequested) {
          this.rescanRequested = false;
          void this.scan();
        }
      });
    return this.scanning;
  }

  private async doScan(): Promise<void> {
    const files: { file: string; mtimeMs: number; size: number; bornMs: number }[] = [];
    for (const folder of this.folders) await walk(folder, files, 0);
    const seen = new Set(files.map((f) => f.file));

    const todo = files.filter((f) => {
      const e = this.entries.get(f.file);
      return !e || e.mtimeMs !== f.mtimeMs || e.size !== f.size;
    });
    let removed = false;
    for (const p of [...this.entries.keys()]) {
      if (!seen.has(p) && this.folders.some((f) => isInside(p, f))) {
        this.entries.delete(p);
        removed = true;
      }
      if (!this.folders.some((f) => isInside(p, f))) {
        // Archivos de carpetas que ya no forman parte de la biblioteca.
        this.entries.delete(p);
        removed = true;
      }
    }

    if (todo.length) {
      this.opts.onProgress({ scanning: true, done: 0, total: todo.length });
      let done = 0;
      let lastEmit = Date.now();
      const queue = [...todo];
      const worker = async () => {
        for (;;) {
          const item = queue.shift();
          if (!item) return;
          const old = this.entries.get(item.file);
          const track = await this.readTrack(item.file, item.size, old?.track.addedAt ?? item.bornMs);
          this.entries.set(item.file, { mtimeMs: item.mtimeMs, size: item.size, track });
          done++;
          if (Date.now() - lastEmit > 250) {
            lastEmit = Date.now();
            this.opts.onProgress({ scanning: true, done, total: todo.length });
          }
          if (done % 300 === 0) {
            this.reindex();
            this.opts.onChange(this.snapshot());
          }
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
    }

    this.scannedAt = Date.now();
    this.reindex();
    if (todo.length || removed) this.saveCache();
    this.opts.onProgress({ scanning: false, done: todo.length, total: todo.length });
    this.opts.onChange(this.snapshot());
  }

  private reindex() {
    this.byId.clear();
    for (const [p, e] of this.entries) this.byId.set(e.track.id, p);
  }

  private saveCache() {
    const cache: CacheFile = {
      version: CACHE_VERSION,
      entries: Object.fromEntries(this.entries),
      arts: Object.fromEntries(this.arts),
    };
    this.opts.store.set('biblioteca', cache, 1000);
  }

  private async readTrack(file: string, size: number, addedAt: number): Promise<Track> {
    const folder = path.dirname(file);
    const fileName = path.basename(file);
    const base = path.basename(file, path.extname(file));
    const track: Track = {
      id: trackIdForPath(file),
      source: 'local',
      title: base,
      artist: '',
      album: '',
      albumArtist: '',
      genre: '',
      trackNo: 0,
      discNo: 0,
      year: 0,
      durationMs: 0,
      folder,
      fileName,
      addedAt,
      size,
    };
    try {
      const meta = await parseFile(file, { duration: false, skipCovers: false });
      const c = meta.common;
      track.title = clean(c.title) || base;
      track.artist = clean(c.artist) || clean(c.artists?.[0]) || clean(c.albumartist);
      track.albumArtist = clean(c.albumartist);
      track.album = clean(c.album);
      track.genre = clean(c.genre?.[0]);
      track.trackNo = c.track?.no ?? 0;
      track.discNo = c.disk?.no ?? 0;
      track.year = c.year ?? 0;
      track.durationMs = Math.round((meta.format.duration ?? 0) * 1000);
      const pic = c.picture?.find((p) => /front|cover/i.test(p.type ?? '')) ?? c.picture?.[0];
      if (pic && pic.data?.length) track.artId = await this.saveArt(pic.data, pic.format);
    } catch {
      // Archivo sin etiquetas legibles: se conservan los datos derivados del nombre.
    }
    if (!track.album) track.album = path.basename(folder);
    if (!track.artId) track.artId = await this.folderArt(folder);
    return track;
  }

  private async saveArt(data: Uint8Array, format: string): Promise<string> {
    const ext = /png/i.test(format) ? '.png' : /webp/i.test(format) ? '.webp' : '.jpg';
    const id = crypto.createHash('sha1').update(data).digest('hex').slice(0, 20) + ext;
    if (!this.arts.has(id)) {
      const target = path.join(this.opts.artDir, id);
      if (!fs.existsSync(target)) await fsp.writeFile(target, data);
      this.arts.set(id, target);
    }
    return id;
  }

  private folderArtCache = new Map<string, string | undefined>();

  private async folderArt(folder: string): Promise<string | undefined> {
    if (this.folderArtCache.has(folder)) return this.folderArtCache.get(folder);
    let result: string | undefined;
    try {
      const names = await fsp.readdir(folder);
      const images = names.filter((n) => IMAGE_EXT.includes(path.extname(n).toLowerCase()));
      const pick =
        images.find((n) => COVER_NAMES.some((c) => path.basename(n, path.extname(n)).toLowerCase().startsWith(c))) ??
        (images.length === 1 ? images[0] : undefined);
      if (pick) {
        const full = path.join(folder, pick);
        result = 'p' + crypto.createHash('sha1').update(full.toLowerCase()).digest('hex').slice(0, 20) + path.extname(pick).toLowerCase();
        this.arts.set(result, full);
      }
    } catch {
      result = undefined;
    }
    this.folderArtCache.set(folder, result);
    return result;
  }

  /** Vigila las carpetas (Windows admite vigilancia recursiva) y reescanea tras unos segundos de calma. */
  watch(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    this.folderArtCache.clear();
    for (const folder of this.folders) {
      try {
        const w = fs.watch(folder, { recursive: true }, (_event, name) => {
          if (name && !AUDIO_EXTENSIONS.has(path.extname(String(name)).toLowerCase()) && path.extname(String(name))) {
            // Cambios en archivos que no son audio (por ejemplo carátulas) también pueden importar.
            if (!IMAGE_EXT.includes(path.extname(String(name)).toLowerCase())) return;
          }
          if (this.watchTimer) clearTimeout(this.watchTimer);
          this.watchTimer = setTimeout(() => {
            this.folderArtCache.clear();
            void this.scan();
          }, 2500);
        });
        w.on('error', () => undefined);
        this.watchers.push(w);
      } catch {
        // Carpeta inexistente o sin permisos.
      }
    }
  }

  close(): void {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    this.saveCache();
  }
}

async function walk(dir: string, out: { file: string; mtimeMs: number; size: number; bornMs: number }[], depth: number) {
  if (depth > 24) return;
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
    } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      try {
        const st = await fsp.stat(full);
        if (st.size > 1024) out.push({ file: full, mtimeMs: Math.round(st.mtimeMs), size: st.size, bornMs: Math.round(st.birthtimeMs || st.mtimeMs) });
      } catch {
        // archivo inaccesible
      }
    }
  }
}

function norm(p: string): string {
  const r = path.resolve(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

export function samePath(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export function isInside(child: string, parent: string): boolean {
  const c = norm(child);
  const p = norm(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}
