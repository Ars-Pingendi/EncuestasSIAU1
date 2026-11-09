// Empaqueta el proceso principal (ESM, con sus dependencias incluidas) y el preload
// (CommonJS, requerido por el sandbox) con esbuild.
import { build } from 'esbuild';

await build({
  entryPoints: ['electron/main.ts'],
  outfile: 'dist-electron/main.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  external: ['electron'],
  // Algunas dependencias usan require() de módulos de Node dentro de un paquete ESM.
  banner: { js: "import { createRequire as __pipoCreateRequire } from 'node:module'; const require = __pipoCreateRequire(import.meta.url);" },
  legalComments: 'none',
  sourcemap: false,
});

await build({
  entryPoints: ['electron/preload.ts'],
  outfile: 'dist-electron/preload.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
});

console.log('electron: main.mjs y preload.cjs listos');
