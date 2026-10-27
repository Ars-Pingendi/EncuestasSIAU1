export function clamp(x: number, min = 0, max = 100): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

export function round(x: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Convierte °C a K sin permitir valores negativos imposibles. */
export function toKelvin(c: number): number {
  return Math.max(0, c + 273.15);
}

export function pct(x: number): string {
  return `${round(x)}%`;
}
