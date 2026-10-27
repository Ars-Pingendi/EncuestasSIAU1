// Generador de números pseudoaleatorios reproducible (mulberry32).
// La misma semilla produce siempre la misma secuencia.

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Normaliza la semilla a un entero de 32 bits no negativo.
    this.state = (seed >>> 0) || 1;
  }

  /** Flotante en [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entero en [min, max]. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Flotante en [min, max). */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Elige un elemento de un arreglo. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** true con probabilidad p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Crea una semilla aleatoria de 32 bits. */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
