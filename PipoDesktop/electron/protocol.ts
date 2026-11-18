// Protocolo propio pipo:// — sirve la interfaz (pipo://app/…) y los medios (pipo://media/…)
// con soporte de peticiones parciales (Range) para poder adelantar y retroceder.
import fs from 'node:fs';
import path from 'node:path';
import { protocol } from 'electron';
import { corsHeaders, fileResponse } from './files';
import type { Library } from './library';
import type { YouTube } from './youtube';
import { videoIdOk, type YtVideo } from './ytVideo';

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'pipo',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
    },
  ]);
}

export function handleProtocol(distDir: string, library: Library, youtube: YouTube, ytVideo?: YtVideo) {
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
      if (url.host === 'yt' && ytVideo) {
        // Visor de videos de YouTube: pipo://yt/<id>/play y pipo://yt/<id>/{v,m,a,aw}/<altura>
        const [, id, kind, h] = url.pathname.split('/');
        const json = (status: number, body: unknown) => {
          const headers = corsHeaders();
          headers.set('Content-Type', 'application/json; charset=utf-8');
          return new Response(JSON.stringify(body), { status, headers });
        };
        if (!videoIdOk(id ?? '')) return json(404, { error: 'Video no encontrado' });
        try {
          if (kind === 'play') {
            const plan = await ytVideo.plan(id, 'pipo://yt', '', Number(url.searchParams.get('h') ?? 0) || 0, url.searchParams.get('force') === 'direct');
            ytVideo.log(`App: plan ${id}: ${plan.mode} ${plan.info}`);
            return json(200, plan);
          }
          if (kind === 'v' || kind === 'm' || kind === 'a' || kind === 'aw') return await ytVideo.serve(id, kind, Number(h ?? 0) || 0, range);
        } catch (err) {
          ytVideo.log(`App: yt/${id}: ERROR ${(err as Error).message}`);
          return json(500, { error: (err as Error).message });
        }
        return json(404, { error: 'No encontrado' });
      }
      return new Response('No encontrado', { status: 404 });
    } catch (err) {
      console.error('pipo://', request.url, err);
      return new Response(String((err as Error).message ?? err), { status: 500, headers: corsHeaders() });
    }
  });
}
