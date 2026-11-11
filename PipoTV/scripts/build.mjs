// Compila la app para televisores LG: un solo archivo JavaScript sin módulos, compatible
// con el navegador de webOS 4.0 (Chromium 53) en adelante.
import { build } from 'esbuild';
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
  target: ['chrome53'],
  minify: true,
  legalComments: 'none',
  loader: { '.css': 'css' },
});
for (const f of fs.readdirSync('public')) fs.copyFileSync(`public/${f}`, `dist/${f}`);
console.log('dist listo:', fs.readdirSync('dist').join(', '));
