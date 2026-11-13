// Utilidades HTTP compartidas por el servidor de la TV y el servicio de video.
import fs from 'node:fs';
import type http from 'node:http';
import { mimeFor } from './files';

export function cors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, X-Pipo-Token');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': data.length, 'Cache-Control': 'no-store' });
  res.end(data);
}

export interface ServeFileOptions {
  cache?: boolean;
  mime?: string;
}

/** Archivo completo o parcial (206) según la cabecera Range, para poder adelantar. */
export function serveFile(req: http.IncomingMessage, res: http.ServerResponse, file: string, opts: ServeFileOptions = {}) {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return sendJson(res, 404, { error: 'Archivo no disponible' });
  }
  const headers: Record<string, string | number> = { 'Content-Type': opts.mime ?? mimeFor(file), 'Accept-Ranges': 'bytes' };
  if (opts.cache) headers['Cache-Control'] = 'max-age=86400';
  const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range ?? ''));
  const finish = (stream: fs.ReadStream) => {
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  };
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    start = Math.max(0, start);
    end = Math.max(start, end);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return finish(fs.createReadStream(file, { start, end }));
  }
  res.writeHead(200, { ...headers, 'Content-Length': size });
  if (req.method === 'HEAD') return res.end();
  return finish(fs.createReadStream(file));
}
