// Protocolo propio pipo:// — sirve la interfaz (pipo://app/…) y los medios (pipo://media/…)
// con soporte de peticiones parciales (Range) para poder adelantar y retroceder.
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import type { Library } from './library';
import { corsHeaders, type YouTube } from './youtube';

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'pipo',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
    },
  ]);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.weba': 'audio/webm',
};

function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export function fileResponse(file: string, range: string | null, cache = false): Response {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return new Response('No encontrado', { status: 404, headers: corsHeaders() });
  }
  const headers = corsHeaders();
  headers.set('Content-Type', mimeFor(file));
  headers.set('Accept-Ranges', 'bytes');
  if (cache) headers.set('Cache-Control', 'max-age=31536000, immutable');
  const size = stat.size;
  const m = /bytes=(\d*)-(\d*)/.exec(range ?? '');
  if (m && (m[1] || m[2])) {
    let start: number;
    let end: number;
    if (!m[1]) {
      // sufijo: los últimos N bytes
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    }
    if (start >= size || start > end) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(body, { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { status: 200, headers });
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
