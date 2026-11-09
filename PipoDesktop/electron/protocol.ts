// Protocolo propio pipo:// — sirve la interfaz (pipo://app/…) y los medios (pipo://media/…)
// con soporte de peticiones parciales (Range) para poder adelantar y retroceder.
import fs from 'node:fs';
import path from 'node:path';
import { protocol } from 'electron';
import { corsHeaders, fileResponse } from './files';
import type { Library } from './library';
import type { YouTube } from './youtube';

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'pipo',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
    },
  ]);
}

export function handleProtocol(distDir: string, library: Library, youtube: YouTube) {
  protocol.handle('pipo', async (request) => {
    const url = new URL(request.url);
    const range = request.headers.get('range');
    try {
      if (url.host === 'app') {
        let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
        const full = path.normalize(path.join(distDir, rel));
        if (!full.startsWith(path.normalize(distDir))) return new Response('Prohibido', { status: 403 });
        if (!fs.existsSync(full)) rel = 'index.html';
        const target = fs.existsSync(full) ? full : path.join(distDir, 'index.html');
        const res = fileResponse(target, null);
        res.headers.set(
          'Content-Security-Policy',
          "default-src 'self' pipo:; img-src 'self' pipo: https: data: blob:; media-src 'self' pipo: blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' pipo:; font-src 'self' data:",
        );
        return res;
      }
      if (url.host === 'media') {
        const [, kind, rawId] = url.pathname.split('/');
        const id = decodeURIComponent(rawId ?? '');
        if (kind === 'file') {
          const file = library.pathForId(id);
          return file ? fileResponse(file, range) : new Response('No encontrado', { status: 404, headers: corsHeaders() });
        }
        if (kind === 'art') {
          const file = library.artPath(id);
          return file ? fileResponse(file, null, true) : new Response('No encontrado', { status: 404, headers: corsHeaders() });
        }
        if (kind === 'dlart') {
          const file = youtube.downloadArt(id);
          return file ? fileResponse(file, null, true) : new Response('No encontrado', { status: 404, headers: corsHeaders() });
        }
        if (kind === 'yt') {
          if (!/^[\w-]{11}$/.test(id)) return new Response('Id no válido', { status: 400, headers: corsHeaders() });
          const local = youtube.downloadFile(id);
          if (local) return fileResponse(local, range);
          return await youtube.streamResponse(id, range);
        }
      }
      return new Response('No encontrado', { status: 404 });
    } catch (err) {
      console.error('pipo://', request.url, err);
      return new Response(String((err as Error).message ?? err), { status: 500, headers: corsHeaders() });
    }
  });
}
