// Mismos preajustes que la versión de Android (dB en las 10 bandas ISO).
export const BANDS_HZ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const BAND_LABELS = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
export const MAX_DB = 12;
export const Q = 1.41;

export interface Preset {
  name: string;
  bands: number[];
}

export const BUILT_IN_PRESETS: Preset[] = [
  { name: 'Plano', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Graves potentes', bands: [6, 5.5, 4.5, 2.5, 1, 0, 0, 0, 0, 0] },
  { name: 'Agudos brillantes', bands: [0, 0, 0, 0, 0, 1, 2.5, 4, 5, 5.5] },
  { name: 'Loudness', bands: [5, 4, 2.5, 0, -1.5, -1.5, 0, 2.5, 4.5, 5] },
  { name: 'Vocal', bands: [-3, -2.5, -1.5, 1, 3, 3.5, 3, 1.5, 0, -1] },
  { name: 'Rock', bands: [4.5, 3.5, 2.5, 1, -1, -1.5, 0.5, 2.5, 3.5, 4.5] },
  { name: 'Pop', bands: [-1.5, 0, 1.5, 3, 3.5, 3, 1.5, 0, -1, -1.5] },
  { name: 'Jazz', bands: [3, 2.5, 1, 2, -1.5, -1.5, 0, 1.5, 2.5, 3.5] },
  { name: 'Clásica', bands: [4, 3.5, 2.5, 1.5, -0.5, -0.5, 0, 2, 3, 3.5] },
  { name: 'Electrónica', bands: [5, 4.5, 3.5, 0, -1.5, 1.5, 0.5, 1.5, 4.5, 5] },
  { name: 'Hip hop', bands: [5, 5, 3.5, 3, 0.5, -1, 0.5, 0, 1.5, 3] },
  { name: 'Acústica', bands: [3, 3, 2.5, 1, 1.5, 1.5, 2.5, 3, 2.5, 1.5] },
  { name: 'Menos graves', bands: [-6, -5, -4, -2.5, -1, 0, 0, 0, 0, 0] },
];

export interface EqParams {
  enabled: boolean;
  bands: number[];
  /** 0..100 */
  bass: number;
  /** 0..100 */
  width: number;
  /** 0..100 */
  loudness: number;
}

export const BASS_HZ = 90;
export const BASS_MAX_DB = 10;
export const LOUDNESS_MAX_DB = 9;
export const HEADROOM = 0.7;

export function bassDb(p: EqParams) {
  return (p.bass / 100) * BASS_MAX_DB;
}

/** Reducción automática de ganancia para que los realces no saturen (como en Android). */
export function preampDb(p: EqParams): number {
  if (!p.enabled) return 0;
  const maxBoost = Math.max(0, ...p.bands, bassDb(p) * 0.8);
  return -HEADROOM * maxBoost;
}

// ── Respuesta en frecuencia (fórmulas RBJ, idénticas a BiquadFilterNode) para dibujar la curva ──

function biquadMag(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number, w: number): number {
  const cos1 = Math.cos(w);
  const sin1 = Math.sin(w);
  const cos2 = Math.cos(2 * w);
  const sin2 = Math.sin(2 * w);
  const nr = b0 + b1 * cos1 + b2 * cos2;
  const ni = -(b1 * sin1 + b2 * sin2);
  const dr = a0 + a1 * cos1 + a2 * cos2;
  const di = -(a1 * sin1 + a2 * sin2);
  return Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
}

function peakingDb(f0: number, gainDb: number, q: number, f: number, fs: number): number {
  if (!gainDb) return 0;
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w0) / (2 * q);
  const c = Math.cos(w0);
  const mag = biquadMag(1 + alpha * A, -2 * c, 1 - alpha * A, 1 + alpha / A, -2 * c, 1 - alpha / A, (2 * Math.PI * f) / fs);
  return 20 * Math.log10(mag);
}

function lowShelfDb(f0: number, gainDb: number, f: number, fs: number): number {
  if (!gainDb) return 0;
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const c = Math.cos(w0);
  const alpha = (Math.sin(w0) / 2) * Math.SQRT2;
  const sq = 2 * Math.sqrt(A) * alpha;
  const b0 = A * (A + 1 - (A - 1) * c + sq);
  const b1 = 2 * A * (A - 1 - (A + 1) * c);
  const b2 = A * (A + 1 - (A - 1) * c - sq);
  const a0 = A + 1 + (A - 1) * c + sq;
  const a1 = -2 * (A - 1 + (A + 1) * c);
  const a2 = A + 1 + (A - 1) * c - sq;
  return 20 * Math.log10(biquadMag(b0, b1, b2, a0, a1, a2, (2 * Math.PI * f) / fs));
}

export function responseDb(p: EqParams, f: number, fs = 48000): number {
  if (!p.enabled) return 0;
  let db = preampDb(p);
  BANDS_HZ.forEach((hz, i) => (db += peakingDb(hz, p.bands[i] ?? 0, Q, f, fs)));
  db += lowShelfDb(BASS_HZ, bassDb(p), f, fs);
  return db;
}
