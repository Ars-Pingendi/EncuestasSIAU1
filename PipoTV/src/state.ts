// Estado de la app de TV: conexión, biblioteca, reproductor y ecualizador.
import { artUrl, fetchText, mediaUrl, type Connection, type TvTrack } from './api';
import { engine } from './audio';
import { BUILT_IN_PRESETS, type EqParams } from './presets';
import { Library } from './library';
import { VideoLibrary } from './videolibrary';

type Listener = () => void;
const listeners: Listener[] = [];
export function onChange(fn: Listener) {
  listeners.push(fn);
}
export function emit() {
  for (const l of listeners) l();
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sin almacenamiento
  }
}

export type Mode = 'music' | 'video';

export const app = {
  conn: null as Connection | null,
  library: new Library(),
  videos: new VideoLibrary(),
  /** El equipo conectado comparte películas y series (Pipo para Windows). */
  hasVideo: false,
  /** El equipo comparte películas y series propias (PC o videos del teléfono). */
  hasLocalVideos: false,
  /** El teléfono busca y entrega videos de YouTube. */
  hasYoutube: false,
  /** El equipo conectado puede convertir videos que la TV no entiende (el PC sí; el teléfono no). */
  canConvert: true,
  mode: (load<Mode>('pipo:modo', 'music') as Mode),
  toast: '',
};

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  app.toast = text;
  emit();
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    app.toast = '';
    emit();
  }, 3500);
}

export function art(t: TvTrack | null | undefined): string | null {
  return t && app.conn ? artUrl(app.conn, t.art) : null;
}
export function artOf(path: string | null): string | null {
  return app.conn ? artUrl(app.conn, path) : null;
}

// ───────────────────────────── Reproductor ─────────────────────────────

export type Repeat = 'off' | 'all' | 'one';

export const player = {
  queue: [] as string[],
  index: -1,
  playing: false,
  shuffle: false,
  repeat: 'off' as Repeat,
  position: 0,
  duration: 0,
};
let original: string[] | null = null;
let errorStreak = 0;
let recoverRun = 0;
let recoverBusy = false;

export function current(): TvTrack | null {
  return player.index >= 0 ? app.library.byId[player.queue[player.index]] || null : null;
}

function shuffled<T>(a: T[]): T[] {
  const out = a.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function loadIndex(i: number, autoplay = true) {
  const t = app.library.byId[player.queue[i]];
  if (!t || !app.conn) return;
  recoverRun++;
  recoverBusy = false;
  player.index = i;
  player.position = 0;
  player.duration = t.durationMs;
  engine.load(mediaUrl(app.conn, t.id));
  if (autoplay) engine.play().catch(() => undefined);
  saveQueue();
  emit();
}

export function playTracks(tracks: TvTrack[], start = 0, shuffle?: boolean) {
  if (!tracks.length) return;
  const ids = tracks.map((t) => t.id);
  errorStreak = 0;
  if (shuffle) {
    const first = Math.floor(Math.random() * ids.length);
    const rest = ids.filter((_, i) => i !== first);
    original = ids;
    player.queue = [ids[first]].concat(shuffled(rest));
    player.shuffle = true;
    loadIndex(0);
  } else {
    original = null;
    player.queue = ids;
    player.shuffle = false;
    loadIndex(start);
  }
}

export function playNext(tracks: TvTrack[]) {
  if (player.index < 0) return playTracks(tracks);
  player.queue.splice(player.index + 1, 0, ...tracks.map((t) => t.id));
  toast(tracks.length === 1 ? `«${tracks[0].title}» sonará a continuación` : `${tracks.length} canciones a continuación`);
  saveQueue();
  emit();
}

export function addToQueue(tracks: TvTrack[]) {
  if (player.index < 0) return playTracks(tracks);
  player.queue = player.queue.concat(tracks.map((t) => t.id));
  toast(tracks.length === 1 ? `«${tracks[0].title}» agregada a la cola` : `${tracks.length} canciones agregadas a la cola`);
  saveQueue();
  emit();
}

export function togglePlay() {
  if (player.index < 0) {
    if (player.queue.length) loadIndex(0);
    else playTracks(app.library.tracks);
    return;
  }
  if (engine.el.paused) {
    // Tras una caída de red el audio queda en error: se vuelve a pedir desde donde iba.
    if (engine.el.error && engine.el.getAttribute('src')) {
      resumeAt(player.position);
      return;
    }
    if (!engine.el.getAttribute('src')) {
      const pos = player.position;
      loadIndex(player.index);
      if (pos > 0) engine.el.addEventListener('loadedmetadata', function once() {
        engine.el.currentTime = pos / 1000;
        engine.el.removeEventListener('loadedmetadata', once);
      });
      return;
    }
    engine.play().catch(() => undefined);
  } else engine.pause();
}

export function next(auto = false) {
  if (!player.queue.length) return;
  let i = player.index + 1;
  if (i >= player.queue.length) {
    if (player.repeat === 'all' || !auto) i = 0;
    else {
      engine.pause();
      return;
    }
  }
  loadIndex(i);
}

export function previous() {
  if (!player.queue.length) return;
  if (engine.el.currentTime > 3) {
    engine.el.currentTime = 0;
    return;
  }
  let i = player.index - 1;
  if (i < 0) i = player.repeat === 'all' ? player.queue.length - 1 : 0;
  loadIndex(i);
}

export function jump(i: number) {
  errorStreak = 0;
  loadIndex(i);
}

export function seekBy(deltaMs: number) {
  if (!engine.el.getAttribute('src')) return;
  engine.el.currentTime = Math.max(0, Math.min(engine.el.duration || 0, engine.el.currentTime + deltaMs / 1000));
}

export function toggleShuffle() {
  const cur = player.queue[player.index];
  if (!player.shuffle) {
    original = player.queue.slice();
    const rest = player.queue.filter((_, i) => i !== player.index);
    player.queue = cur ? [cur].concat(shuffled(rest)) : shuffled(rest);
    player.index = cur ? 0 : -1;
    player.shuffle = true;
    toast('Aleatorio activado');
  } else {
    const base = original || player.queue;
    player.queue = base.filter((id) => player.queue.indexOf(id) >= 0);
    player.index = cur ? player.queue.indexOf(cur) : -1;
    original = null;
    player.shuffle = false;
    toast('Aleatorio desactivado');
  }
  saveQueue();
  emit();
}

export function cycleRepeat() {
  player.repeat = player.repeat === 'off' ? 'all' : player.repeat === 'all' ? 'one' : 'off';
  toast(player.repeat === 'off' ? 'Repetir desactivado' : player.repeat === 'all' ? 'Repetir toda la cola' : 'Repetir esta canción');
  saveQueue();
  emit();
}

function saveQueue() {
  save('pipo:cola', { queue: player.queue, index: player.index, position: player.position, shuffle: player.shuffle, repeat: player.repeat });
}

export function restoreQueue() {
  const s = load<{ queue: string[]; index: number; position: number; shuffle: boolean; repeat: Repeat } | null>('pipo:cola', null);
  if (!s || !s.queue) return;
  const cur = s.queue[s.index];
  player.queue = s.queue.filter((id) => !!app.library.byId[id]);
  player.index = cur ? player.queue.indexOf(cur) : -1;
  player.position = player.index >= 0 ? s.position : 0;
  player.shuffle = s.shuffle;
  player.repeat = s.repeat || 'off';
  const t = current();
  player.duration = t ? t.durationMs : 0;
}

// ───────────────────────────── Cortes de red ─────────────────────────────
// Con el teléfono bloqueado el Wi-Fi puede dormirse unos segundos. En vez de saltar a la
// siguiente canción (o detenerse), la TV espera a que el teléfono vuelva a responder y
// retoma la misma canción desde donde iba.

const RETRY_DELAYS = [1000, 2000, 3000, 5000, 8000, 10000, 10000, 10000];
const STALL_MS = 12000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function serverReachable(): Promise<boolean> {
  if (!app.conn) return false;
  try {
    await fetchText(`${app.conn.base}/pipo/info`, 4000);
    return true;
  } catch {
    return false;
  }
}

/** Espera a que el audio suene (true) o falle / se agote el tiempo (false). */
function waitForPlaying(ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const el = engine.el;
    const done = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener('playing', onPlaying);
      el.removeEventListener('error', onError);
      resolve(ok);
    };
    const onPlaying = () => done(true);
    const onError = () => done(false);
    const timer = setTimeout(() => done(false), ms);
    el.addEventListener('playing', onPlaying);
    el.addEventListener('error', onError);
  });
}

function resumeAt(posMs: number) {
  const t = current();
  if (!t || !app.conn) return;
  const el = engine.el;
  engine.load(mediaUrl(app.conn, t.id));
  el.addEventListener('loadedmetadata', function once() {
    el.removeEventListener('loadedmetadata', once);
    if (posMs > 1000) {
      try {
        el.currentTime = posMs / 1000;
      } catch {
        // el audio aún no permite buscar
      }
    }
  });
  engine.play().catch(() => undefined);
}

/** Salta una canción que de verdad no se puede reproducir (formato o archivo), no una caída de red. */
function skipBroken(track: TvTrack) {
  toast(`No se pudo reproducir «${track.title}».`);
  errorStreak++;
  if (errorStreak < Math.min(4, player.queue.length) && player.index < player.queue.length - 1) next(true);
}

async function recover() {
  if (recoverBusy) return;
  const track = current();
  if (!track || !app.conn) return;
  recoverBusy = true;
  const run = ++recoverRun;
  const pos = player.position;
  const stale = () => run !== recoverRun || current() !== track || !app.conn;
  let fileFailures = 0;
  let notified = false;
  try {
    for (let i = 0; i < RETRY_DELAYS.length; i++) {
      await sleep(RETRY_DELAYS[i]);
      if (stale()) return;
      if (!(await serverReachable())) {
        if (!notified) {
          notified = true;
          toast('Sin conexión con el teléfono o el PC. Reintentando…');
        }
        continue;
      }
      if (stale()) return;
      resumeAt(pos);
      if (await waitForPlaying(10000)) {
        if (notified) toast('Conexión recuperada');
        return;
      }
      if (stale()) return;
      // El servidor responde pero la canción no suena: el problema es el archivo.
      if (++fileFailures >= 2) {
        skipBroken(track);
        return;
      }
    }
    if (!stale()) {
      engine.pause();
      toast('No se pudo reconectar. Revisa que el teléfono o el PC sigan compartiendo y pulsa Reproducir.');
    }
  } finally {
    if (run === recoverRun) recoverBusy = false;
  }
}

export function initPlayer() {
  const el = engine.el;
  engine.setVolume(1);
  el.addEventListener('playing', () => {
    errorStreak = 0;
    player.playing = true;
    emit();
  });
  el.addEventListener('pause', () => {
    player.playing = false;
    saveQueue();
    emit();
  });
  el.addEventListener('durationchange', () => {
    if (isFinite(el.duration)) player.duration = el.duration * 1000;
  });
  let lastEmit = 0;
  el.addEventListener('timeupdate', () => {
    player.position = el.currentTime * 1000;
    const now = Date.now();
    if (now - lastEmit > 500) {
      lastEmit = now;
      emit();
    }
  });
  el.addEventListener('ended', () => {
    if (player.repeat === 'one') {
      el.currentTime = 0;
      engine.play().catch(() => undefined);
    } else next(true);
  });
  el.addEventListener('error', () => {
    if (!el.getAttribute('src') || !current()) return;
    void recover();
  });
  // Si el audio se queda sin datos y no avanza (el teléfono dejó de responder), se reintenta.
  let lastPos = -1;
  let lastMove = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (el.paused || el.ended || !el.getAttribute('src') || recoverBusy || !current()) {
      lastMove = now;
      return;
    }
    if (el.currentTime !== lastPos) {
      lastPos = el.currentTime;
      lastMove = now;
      return;
    }
    if (el.readyState < 3 && now - lastMove > STALL_MS) {
      lastMove = now;
      void recover();
    }
  }, 3000);
  setInterval(saveQueue, 10000);
}

// ───────────────────────────── Ecualizador ─────────────────────────────

export interface EqState extends EqParams {
  preset: string | null;
  custom: { name: string; bands: number[] }[];
}

export const eq: EqState = load<EqState>('pipo:eq', {
  enabled: true,
  preset: 'Plano',
  bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: 0,
  width: 0,
  loudness: 0,
  custom: [],
});

export function applyEq() {
  engine.setEq(eq);
  save('pipo:eq', eq);
  emit();
}

export function allPresets() {
  return BUILT_IN_PRESETS.concat(eq.custom);
}

export function applyPreset(name: string) {
  const p = allPresets().filter((x) => x.name === name)[0];
  if (!p) return;
  eq.bands = p.bands.slice();
  eq.preset = p.name;
  eq.enabled = true;
  applyEq();
}

export function setBand(i: number, db: number) {
  eq.bands[i] = Math.max(-12, Math.min(12, Math.round(db * 2) / 2));
  eq.preset = null;
  applyEq();
}

export function saveCustomPreset() {
  const n = eq.custom.length + 1;
  const name = `Mi ajuste ${n}`;
  eq.custom.push({ name, bands: eq.bands.slice() });
  eq.preset = name;
  applyEq();
  toast(`Preajuste «${name}» guardado`);
}

export function setMode(mode: Mode) {
  app.mode = mode;
  save('pipo:modo', mode);
}
