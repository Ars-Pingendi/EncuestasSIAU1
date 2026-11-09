// Reproductor: cola, aleatorio, repetición, temporizador de apagado, estadísticas,
// reanudación al abrir la app y controles multimedia de Windows (teclas y panel del sistema).
import type { Track } from '../../shared/types';
import { api, artUrl, mediaUrl } from '../api';
import { engine } from '../audio/engine';
import { createStore, debounce } from '../lib/store';
import { countPlay, data, rememberRemote, updateSettings } from './data';
import { isDownloaded, lib, lookup } from './library';
import { toast } from './ui';

export type Repeat = 'off' | 'all' | 'one';

export interface PlayerState {
  queue: string[];
  /** Orden original de la cola antes de activar el aleatorio. */
  original: string[] | null;
  index: number;
  playing: boolean;
  loading: boolean;
  position: number;
  duration: number;
  shuffle: boolean;
  repeat: Repeat;
  volume: number;
  muted: boolean;
  sleepEndsAt: number | null;
  sleepEndOfTrack: boolean;
}

export const player = createStore<PlayerState>({
  queue: [],
  original: null,
  index: -1,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  shuffle: false,
  repeat: 'off',
  volume: 0.8,
  muted: false,
  sleepEndsAt: null,
  sleepEndOfTrack: false,
});

export function currentTrack(): Track | undefined {
  const s = player.get();
  return s.index >= 0 ? lookup(s.queue[s.index]) : undefined;
}

let loadToken = 0;
let counted = false;
let errorStreak = 0;

interface SavedQueue {
  queue: string[];
  original: string[] | null;
  index: number;
  position: number;
  shuffle: boolean;
  repeat: Repeat;
}

const saveQueue = debounce(() => {
  const s = player.get();
  const saved: SavedQueue = { queue: s.queue, original: s.original, index: s.index, position: Math.round(engine.el.currentTime * 1000), shuffle: s.shuffle, repeat: s.repeat };
  void api.storeSet('cola', saved);
}, 800);

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function load(index: number, autoplay: boolean, startMs = 0) {
  const s = player.get();
  const id = s.queue[index];
  const track = id ? lookup(id) : undefined;
  const token = ++loadToken;
  counted = false;
  if (!track) {
    engine.stop();
    player.set({ index: -1, playing: false, loading: false, position: 0, duration: 0 });
    publish();
    return;
  }
  player.set({ index, position: startMs, duration: track.durationMs, loading: true });
  updateMediaSession(track);
  publish();
  saveQueue();

  if (track.source === 'youtube' && !isDownloaded(track) && track.videoId) {
    const r = await api.ytPrepare(track.videoId);
    if (token !== loadToken) return;
    if (!r.ok) {
      player.set({ loading: false });
      onLoadError(track, r.message);
      return;
    }
  }
  engine.load(mediaUrl(track));
  if (startMs > 0) {
    const seekOnce = () => {
      engine.el.currentTime = startMs / 1000;
      engine.el.removeEventListener('loadedmetadata', seekOnce);
    };
    engine.el.addEventListener('loadedmetadata', seekOnce);
  }
  if (autoplay) {
    try {
      await engine.play();
    } catch (err) {
      if (token === loadToken && (err as Error).name !== 'AbortError') console.warn('play()', err);
    }
  } else {
    player.set({ loading: false });
  }
}

function onLoadError(track: Track | undefined, message?: string) {
  errorStreak++;
  toast(`No se pudo reproducir «${track?.title ?? 'la canción'}»${message ? `: ${message}` : ''}`, undefined, 6000);
  const s = player.get();
  if (errorStreak < Math.min(5, s.queue.length) && (s.index < s.queue.length - 1 || s.repeat === 'all')) void next(true);
  else player.set({ playing: false, loading: false });
}

// ── Acciones públicas ──

export function playTracks(tracks: Track[], start = 0, opts: { shuffle?: boolean } = {}) {
  if (!tracks.length) return;
  rememberRemote(tracks);
  const ids = tracks.map((t) => t.id);
  const shuffle = opts.shuffle ?? player.get().shuffle;
  if (shuffle) {
    const first = opts.shuffle && start === 0 ? Math.floor(Math.random() * ids.length) : start;
    const rest = ids.filter((_, i) => i !== first);
    player.set({ queue: [ids[first], ...shuffled(rest)], original: ids, shuffle: true });
    errorStreak = 0;
    void load(0, true);
  } else {
    player.set({ queue: ids, original: null, shuffle: false });
    errorStreak = 0;
    void load(start, true);
  }
}

export function playNext(tracks: Track[]) {
  if (!tracks.length) return;
  rememberRemote(tracks);
  const s = player.get();
  if (s.index < 0) return playTracks(tracks);
  const ids = tracks.map((t) => t.id);
  const queue = [...s.queue.slice(0, s.index + 1), ...ids, ...s.queue.slice(s.index + 1)];
  player.set({ queue, original: s.original ? [...s.original, ...ids] : null });
  saveQueue();
  toast(tracks.length === 1 ? `«${tracks[0].title}» sonará a continuación` : `${tracks.length} canciones sonarán a continuación`);
}

export function addToQueue(tracks: Track[]) {
  if (!tracks.length) return;
  rememberRemote(tracks);
  const s = player.get();
  if (s.index < 0) return playTracks(tracks);
  const ids = tracks.map((t) => t.id);
  player.set({ queue: [...s.queue, ...ids], original: s.original ? [...s.original, ...ids] : null });
  saveQueue();
  toast(tracks.length === 1 ? `«${tracks[0].title}» agregada a la cola` : `${tracks.length} canciones agregadas a la cola`);
}

export async function togglePlay() {
  const s = player.get();
  if (s.index < 0) {
    if (s.queue.length) return load(0, true);
    return playTracks(lib.get().tracks);
  }
  if (engine.el.paused) {
    if (!engine.el.src) return load(s.index, true, s.position);
    try {
      await engine.play();
    } catch (err) {
      console.warn(err);
    }
  } else engine.pause();
}

export async function next(auto = false) {
  const s = player.get();
  if (!s.queue.length) return;
  let i = s.index + 1;
  if (i >= s.queue.length) {
    if (s.repeat === 'all' || !auto) i = 0;
    else {
      engine.pause();
      engine.el.currentTime = 0;
      player.set({ playing: false, position: 0 });
      return;
    }
  }
  await load(i, true);
}

export async function previous() {
  const s = player.get();
  if (!s.queue.length) return;
  if (engine.el.currentTime > 3) {
    engine.el.currentTime = 0;
    return;
  }
  let i = s.index - 1;
  if (i < 0) i = s.repeat === 'all' ? s.queue.length - 1 : 0;
  await load(i, true);
}

export function jumpTo(index: number) {
  errorStreak = 0;
  void load(index, true);
}

export function seek(ms: number) {
  if (!engine.el.src) {
    player.set({ position: ms });
    return;
  }
  engine.el.currentTime = Math.max(0, ms / 1000);
  player.set({ position: ms });
}

export function seekBy(deltaMs: number) {
  seek(Math.max(0, Math.min(player.get().duration, engine.el.currentTime * 1000 + deltaMs)));
}

export function setVolume(v: number) {
  const volume = Math.max(0, Math.min(1, v));
  player.set({ volume, muted: false });
  engine.setVolume(volume);
  updateSettings({ volume, muted: false });
}

export function toggleMute() {
  const muted = !player.get().muted;
  player.set({ muted });
  engine.setVolume(muted ? 0 : player.get().volume);
  updateSettings({ muted });
}

export function toggleShuffle() {
  const s = player.get();
  const cur = s.queue[s.index];
  if (!s.shuffle) {
    const rest = s.queue.filter((_, i) => i !== s.index);
    const queue = cur ? [cur, ...shuffled(rest)] : shuffled(s.queue);
    player.set({ shuffle: true, original: s.queue, queue, index: cur ? 0 : -1 });
    toast('Aleatorio activado');
  } else {
    const base = s.original ?? s.queue;
    const extra = s.queue.filter((id) => !base.includes(id));
    const queue = [...base.filter((id) => s.queue.includes(id)), ...extra];
    player.set({ shuffle: false, original: null, queue, index: cur ? queue.indexOf(cur) : -1 });
    toast('Aleatorio desactivado');
  }
  saveQueue();
}

export function cycleRepeat() {
  const order: Repeat[] = ['off', 'all', 'one'];
  const repeat = order[(order.indexOf(player.get().repeat) + 1) % 3];
  player.set({ repeat });
  toast(repeat === 'off' ? 'Repetir: desactivado' : repeat === 'all' ? 'Repetir: toda la cola' : 'Repetir: esta canción');
  saveQueue();
}

export function removeFromQueue(i: number) {
  const s = player.get();
  if (i === s.index) {
    const queue = s.queue.filter((_, k) => k !== i);
    player.set({ queue, original: s.original?.filter((id) => id !== s.queue[i]) ?? null });
    if (queue.length) void load(Math.min(i, queue.length - 1), s.playing);
    else clearQueue();
    return;
  }
  const queue = s.queue.filter((_, k) => k !== i);
  player.set({ queue, index: i < s.index ? s.index - 1 : s.index });
  saveQueue();
}

export function moveInQueue(from: number, to: number) {
  const s = player.get();
  if (from === to) return;
  const queue = [...s.queue];
  const [x] = queue.splice(from, 1);
  queue.splice(to, 0, x);
  let index = s.index;
  if (from === s.index) index = to;
  else if (from < s.index && to >= s.index) index--;
  else if (from > s.index && to <= s.index) index++;
  player.set({ queue, index });
  saveQueue();
}

export function clearQueue() {
  loadToken++;
  engine.stop();
  player.set({ queue: [], original: null, index: -1, playing: false, loading: false, position: 0, duration: 0 });
  publish();
  saveQueue();
}

export function setSleepTimer(minutes: number | 'end' | null) {
  engine.setVolume(player.get().muted ? 0 : player.get().volume);
  if (minutes === null) {
    player.set({ sleepEndsAt: null, sleepEndOfTrack: false });
    toast('Temporizador cancelado');
  } else if (minutes === 'end') {
    player.set({ sleepEndsAt: null, sleepEndOfTrack: true });
    toast('La música se detendrá al terminar esta canción');
  } else {
    player.set({ sleepEndsAt: Date.now() + minutes * 60_000, sleepEndOfTrack: false });
    toast(`La música se detendrá en ${minutes} min`);
  }
}

// ── Eventos del elemento de audio ──

function publish() {
  const t = currentTrack();
  const s = player.get();
  api.sendPlayerState({ playing: s.playing, title: t ? `${t.title} · ${t.artist || 'Artista desconocido'}` : '', hasTrack: !!t });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = t ? (s.playing ? 'playing' : 'paused') : 'none';
}

function updateMediaSession(t: Track) {
  if (!('mediaSession' in navigator)) return;
  const art = artUrl(t);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist || 'Artista desconocido',
    album: t.album,
    artwork: art ? [{ src: art, sizes: '512x512' }] : [],
  });
}

function stopForSleep() {
  engine.pause();
  engine.setVolume(player.get().muted ? 0 : player.get().volume);
  player.set({ sleepEndsAt: null, sleepEndOfTrack: false });
  toast('Temporizador: música detenida');
}

function tick() {
  const s = player.get();
  if (s.sleepEndsAt) {
    const left = s.sleepEndsAt - Date.now();
    if (left <= 0) stopForSleep();
    else if (left < 10_000 && s.playing) {
      engine.setVolume((s.muted ? 0 : s.volume) * (left / 10_000));
    }
  }
  if (s.playing) saveQueue();
}

export function initPlayer() {
  const el = engine.el;
  const settings = data.get().settings;
  player.set({ volume: settings.volume, muted: settings.muted });
  engine.setVolume(settings.muted ? 0 : settings.volume);

  el.addEventListener('playing', () => {
    errorStreak = 0;
    player.set({ playing: true, loading: false });
    publish();
  });
  el.addEventListener('pause', () => {
    player.set({ playing: false });
    publish();
    saveQueue();
  });
  el.addEventListener('waiting', () => player.set({ loading: true }));
  el.addEventListener('canplay', () => player.set({ loading: false }));
  el.addEventListener('durationchange', () => {
    if (Number.isFinite(el.duration)) player.set({ duration: el.duration * 1000 });
  });
  el.addEventListener('timeupdate', () => {
    const pos = el.currentTime * 1000;
    player.set({ position: pos });
    const dur = player.get().duration;
    const t = currentTrack();
    if (!counted && t && pos >= Math.min(30_000, dur * 0.5) && dur > 0) {
      counted = true;
      countPlay(t);
    }
    // Prepara con tiempo la siguiente canción de YouTube.
    if (dur - pos < 25_000 && dur - pos > 24_000) {
      const s = player.get();
      const nextT = lookup(s.queue[s.index + 1]);
      if (nextT?.source === 'youtube' && nextT.videoId && !isDownloaded(nextT)) void api.ytPrepare(nextT.videoId);
    }
    if ('mediaSession' in navigator && dur > 0 && Number.isFinite(el.duration)) {
      try {
        navigator.mediaSession.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: 1 });
      } catch {
        // posición fuera de rango durante un cambio de canción
      }
    }
  });
  el.addEventListener('ended', () => {
    const s = player.get();
    if (s.sleepEndOfTrack) return stopForSleep();
    if (s.repeat === 'one') {
      el.currentTime = 0;
      void engine.play();
      counted = false;
      return;
    }
    void next(true);
  });
  el.addEventListener('error', () => {
    if (!el.getAttribute('src')) return;
    onLoadError(currentTrack(), 'formato no compatible o archivo no disponible');
  });

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => void togglePlay());
    ms.setActionHandler('pause', () => engine.pause());
    ms.setActionHandler('previoustrack', () => void previous());
    ms.setActionHandler('nexttrack', () => void next());
    ms.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime * 1000));
    ms.setActionHandler('seekbackward', () => seekBy(-10_000));
    ms.setActionHandler('seekforward', () => seekBy(10_000));
    ms.setActionHandler('stop', () => engine.pause());
  }
  api.onPlayerCommand((cmd) => {
    if (cmd === 'playpause') void togglePlay();
    if (cmd === 'next') void next();
    if (cmd === 'previous') void previous();
  });
  setInterval(tick, 1000);
}

/** Recupera la cola, la canción y la posición de la última vez (sin empezar a sonar). */
export async function restoreQueue() {
  const saved = await api.storeGet<SavedQueue>('cola');
  if (!saved || !saved.queue?.length) return;
  const queue = saved.queue.filter((id) => !!lookup(id));
  if (!queue.length) return;
  const curId = saved.queue[saved.index];
  const index = Math.max(0, queue.indexOf(curId));
  player.set({
    queue,
    original: saved.original?.filter((id) => !!lookup(id)) ?? null,
    shuffle: saved.shuffle,
    repeat: saved.repeat ?? 'off',
    index,
    position: queue[index] === curId ? saved.position : 0,
    duration: lookup(queue[index])?.durationMs ?? 0,
  });
  const t = currentTrack();
  if (t) {
    updateMediaSession(t);
    publish();
  }
}
