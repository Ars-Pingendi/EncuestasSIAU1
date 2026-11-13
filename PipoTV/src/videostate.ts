// Lo que ya viste, dónde te quedaste y tus preferencias de audio/subtítulos (se guarda en la TV).
import type { TvVideo } from './api';
import type { Series, VideoLibrary } from './videolibrary';

export interface Progress {
  /** Posición en ms. */
  pos: number;
  dur: number;
  at: number;
  done: boolean;
}

const PROGRESS_KEY = 'pipo:video:progreso';
const PREFS_KEY = 'pipo:video:ajustes';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento
  }
}

let progress: { [id: string]: Progress } = read(PROGRESS_KEY, {});

export function getProgress(id: string): Progress | null {
  return progress[id] || null;
}

/** Guarda la posición; al llegar casi al final se marca como visto. */
export function saveProgress(id: string, posMs: number, durMs: number) {
  if (!(durMs > 0) || posMs < 0) return;
  // Visto: queda menos de 90 s (o el 5 % si el video es corto) o ya pasó el 95 %.
  const done = posMs >= durMs - Math.min(90000, durMs * 0.05) || posMs / durMs >= 0.95;
  progress[id] = { pos: done ? 0 : Math.floor(posMs), dur: durMs, at: Date.now(), done };
  write(PROGRESS_KEY, progress);
}

export function setWatched(id: string, done: boolean, durMs = 0) {
  if (done) progress[id] = { pos: 0, dur: durMs || (progress[id] ? progress[id].dur : 0), at: Date.now(), done: true };
  else delete progress[id];
  write(PROGRESS_KEY, progress);
}

/** ¿Tiene un punto de reanudación? */
export function resumable(id: string): Progress | null {
  const p = progress[id];
  return p && !p.done && p.pos > 10000 ? p : null;
}

/** «Continuar viendo»: lo que quedó a medias, lo más reciente primero (un episodio por serie). */
export function continueWatching(lib: VideoLibrary): TvVideo[] {
  const ids = Object.keys(progress)
    .filter((id) => lib.byId[id] && resumable(id))
    .sort((a, b) => progress[b].at - progress[a].at);
  const out: TvVideo[] = [];
  const seen: { [k: string]: boolean } = {};
  for (const id of ids) {
    const v = lib.byId[id];
    if (v.kind === 'episode') {
      if (seen[v.seriesKey]) continue;
      seen[v.seriesKey] = true;
    }
    out.push(v);
    if (out.length >= 12) break;
  }
  return out;
}

/** Episodio que toca ver: el que quedó a medias, el siguiente al último visto o el primero. */
export function nextToWatch(s: Series): TvVideo {
  let last: TvVideo | null = null;
  let lastAt = 0;
  for (const e of s.episodes) {
    const p = progress[e.id];
    if (p && p.at > lastAt) {
      last = e;
      lastAt = p.at;
    }
  }
  if (!last) return s.episodes[0];
  if (!progress[last.id].done) return last;
  const i = s.episodes.indexOf(last);
  return i + 1 < s.episodes.length ? s.episodes[i + 1] : s.episodes[0];
}

export function seriesProgress(s: Series): { watched: number; total: number } {
  let watched = 0;
  for (const e of s.episodes) if (progress[e.id] && progress[e.id].done) watched++;
  return { watched, total: s.episodes.length };
}

// ───────────────────────────── Preferencias ─────────────────────────────

export interface VideoPrefs {
  /** Idioma de subtítulos preferido ('' = sin subtítulos). */
  sub: string;
  /** Formato de las conversiones que mejor funcionó en esta TV. */
  container: 'mp4' | 'ts';
}

let prefs: VideoPrefs = read(PREFS_KEY, { sub: '', container: 'mp4' });

export function getPrefs(): VideoPrefs {
  return prefs;
}

export function setPrefs(patch: Partial<VideoPrefs>) {
  prefs = { sub: patch.sub !== undefined ? patch.sub : prefs.sub, container: patch.container || prefs.container };
  write(PREFS_KEY, prefs);
}
