// Lo que se escucha en esta TV: cuántas veces sonó cada canción y cuándo (para «Inicio»).
// Una canción cuenta como escuchada a los 30 segundos o a la mitad, lo que llegue primero.
const KEY = 'pipo:escuchas';
const MAX = 4000;

export interface Stat {
  plays: number;
  last: number;
}

let cache: { [id: string]: Stat } | null = null;
let version = 0;

function load(): { [id: string]: Stat } {
  if (cache) return cache;
  cache = {};
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? (JSON.parse(raw) as { [id: string]: [number, number] }) : {};
    for (const id of Object.keys(data)) {
      const v = data[id];
      if (v && v.length === 2) cache[id] = { plays: v[0], last: v[1] };
    }
  } catch {
    // sin historial
  }
  return cache;
}

function save() {
  const all = load();
  let ids = Object.keys(all);
  if (ids.length > MAX) {
    ids = ids.sort((a, b) => all[b].last - all[a].last).slice(0, MAX);
    const kept: { [id: string]: Stat } = {};
    for (const id of ids) kept[id] = all[id];
    cache = kept;
  }
  const out: { [id: string]: [number, number] } = {};
  for (const id of Object.keys(cache!)) out[id] = [cache![id].plays, cache![id].last];
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // sin almacenamiento
  }
}

export function stats(): { [id: string]: Stat } {
  return load();
}

/** Cambia cada vez que se cuenta una reproducción (para recalcular «Inicio»). */
export function statsVersion(): number {
  return version;
}

export function countPlay(id: string, now = Date.now()) {
  const all = load();
  const prev = all[id];
  all[id] = { plays: (prev ? prev.plays : 0) + 1, last: now };
  version++;
  save();
}
