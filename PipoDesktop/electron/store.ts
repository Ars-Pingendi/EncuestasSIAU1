// Almacén clave-valor en archivos JSON dentro de la carpeta de datos del usuario.
// Cada clave se guarda en su propio archivo; la escritura es atómica (archivo temporal + rename)
// y se agrupa con un pequeño retardo para no escribir en disco en cada cambio.
import fs from 'node:fs';
import path from 'node:path';

const SAFE_KEY = /^[a-zA-Z0-9_-]{1,64}$/;

export class JsonStore {
  private cache = new Map<string, unknown>();
  private pending = new Map<string, NodeJS.Timeout>();

  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private file(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error(`Clave no válida: ${key}`);
    return path.join(this.dir, `${key}.json`);
  }

  get<T>(key: string): T | undefined {
    if (this.cache.has(key)) return this.cache.get(key) as T;
    const file = this.file(key);
    for (const candidate of [file, `${file}.bak`]) {
      try {
        const value = JSON.parse(fs.readFileSync(candidate, 'utf8')) as T;
        this.cache.set(key, value);
        return value;
      } catch {
        // archivo inexistente o dañado: se intenta con la copia de respaldo
      }
    }
    return undefined;
  }

  set(key: string, value: unknown, delayMs = 400): void {
    this.file(key); // valida la clave
    this.cache.set(key, value);
    const prev = this.pending.get(key);
    if (prev) clearTimeout(prev);
    this.pending.set(
      key,
      setTimeout(() => {
        this.pending.delete(key);
        this.write(key);
      }, delayMs),
    );
  }

  private write(key: string): void {
    const file = this.file(key);
    const tmp = `${file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.cache.get(key) ?? null));
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
      fs.renameSync(tmp, file);
    } catch (err) {
      console.error('No se pudo guardar', key, err);
    }
  }

  flush(): void {
    for (const [key, timer] of this.pending) {
      clearTimeout(timer);
      this.write(key);
    }
    this.pending.clear();
  }
}
