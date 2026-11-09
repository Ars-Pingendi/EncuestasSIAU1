import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La interfaz se sirve desde el protocolo propio pipo://app/, así que las rutas son relativas.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
