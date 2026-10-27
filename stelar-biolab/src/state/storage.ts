import type { LabState, SavedSpecimen } from "../types";
import { SPECIMEN_CATALOG } from "../data/specimens";
import { defaultState } from "../data/scenarios";

const K_STATE = "stelar.biolab.state.v1";
const K_SPECIMENS = "stelar.biolab.specimens.v1";
const K_PREFS = "stelar.biolab.prefs.v1";
const K_SEEDED = "stelar.biolab.seeded.v1";

export interface UIPrefs {
  activeTab: string;
  animations: boolean;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible: el estado vive en memoria */
  }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function loadState(): LabState {
  const raw = safeGet(K_STATE);
  if (!raw) return defaultState();
  try {
    const parsed = JSON.parse(raw) as LabState;
    // Mezcla con defaults para tolerar versiones antiguas sin campos nuevos.
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state: LabState): void {
  safeSet(K_STATE, JSON.stringify(state));
}

export function loadSpecimens(): SavedSpecimen[] {
  const seeded = safeGet(K_SEEDED);
  const raw = safeGet(K_SPECIMENS);
  if (!raw) {
    // Primer uso: sembrar el catálogo inicial.
    if (!seeded) safeSet(K_SEEDED, "1");
    saveSpecimens(SPECIMEN_CATALOG);
    return SPECIMEN_CATALOG;
  }
  try {
    return JSON.parse(raw) as SavedSpecimen[];
  } catch {
    return SPECIMEN_CATALOG;
  }
}

export function saveSpecimens(list: SavedSpecimen[]): void {
  safeSet(K_SPECIMENS, JSON.stringify(list));
}

export function loadPrefs(): UIPrefs {
  const raw = safeGet(K_PREFS);
  const fallback: UIPrefs = { activeTab: "estelar", animations: true };
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<UIPrefs>) };
  } catch {
    return fallback;
  }
}

export function savePrefs(prefs: UIPrefs): void {
  safeSet(K_PREFS, JSON.stringify(prefs));
}

/** Borra todos los datos locales de la aplicación. */
export function clearAllData(): void {
  [K_STATE, K_SPECIMENS, K_PREFS, K_SEEDED].forEach(safeRemove);
}

/** Restaura el catálogo inicial de especímenes. */
export function resetSpecimens(): SavedSpecimen[] {
  saveSpecimens(SPECIMEN_CATALOG);
  return SPECIMEN_CATALOG;
}
