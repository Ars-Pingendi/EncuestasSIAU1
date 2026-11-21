// Servidor de prueba que se hace pasar por Pipo del PC (puerto 37373) para probar la app de
// Android TV en el emulador: emparejamiento (código 1234), biblioteca, audio con rangos y órdenes
// «Reproducir en la TV». El guion de prueba lo controla con /control/*.
// Uso: node fake-pipo.mjs <carpeta con t1.mp3 t2.mp3 t3.mp3>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const media = process.argv[2] || '.';
const log = [];
let seq = 0;
const commands = [];
let waiting = [];
const tracks = ['t1', 't2', 't3'].map((f, i) => ({
  id: `f:${f}`, title: ['Brisa de Barranquilla', 'Luna de Cartagena', 'Café de la Mañana'][i], artist: 'Banda de Prueba', album: 'Pruebas en la TV',
  albumArtist: 'Banda de Prueba', genre: 'Cumbia', trackNo: i + 1, discNo: 1, year: 2026, durationMs: 60000, folder: 'Pruebas', addedAt: i, source: 'pc', art: null, file: `${f}.mp3`,
}));
const pub = (t) => { const { file, ...rest } = t; return rest; };

const json = (res, data, status = 200) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') return res.end();
  if (!url.pathname.startsWith('/control/')) log.push(`${req.method} ${url.pathname}${req.headers.range ? ` ${req.headers.range}` : ''}`);
  const authed = url.searchParams.get('t') === 'tok';
  if (url.pathname === '/pipo/info') return json(res, { app: 'pipo', name: 'PC de prueba', version: 'test' });
  if (url.pathname === '/pipo/pair' && req.method === 'POST') {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      let pin = '';
      try { pin = JSON.parse(body).pin; } catch { /* nada */ }
      if (pin !== '1234') return json(res, { error: 'código' }, 403);
      json(res, { token: 'tok', name: 'PC de prueba' });
    });
    return;
  }
  if (url.pathname.startsWith('/pipo/') && !authed) return json(res, { error: 'sin emparejar' }, 401);
  if (url.pathname === '/pipo/library') {
    return json(res, { name: 'PC de prueba', version: 'test', tracks: tracks.map(pub), playlists: [], favTracks: [], features: { music: true, video: false, youtube: false, convert: false, remote: true } });
  }
  if (url.pathname === '/pipo/remote') {
    const since = Number(url.searchParams.get('since'));
    const pending = () => commands.filter((c) => c.seq > since);
    if (since < 0 || pending().length) return json(res, { seq, commands: since < 0 ? [] : pending() });
    const w = { res, timer: setTimeout(() => { waiting = waiting.filter((x) => x !== w); json(res, { seq, commands: [] }); }, 20000) };
    waiting.push(w);
    return;
  }
  if (url.pathname.startsWith('/pipo/media/')) {
    const t = tracks.find((x) => x.id === decodeURIComponent(url.pathname.slice('/pipo/media/'.length)));
    if (!t) return json(res, { error: 'no existe' }, 404);
    const file = path.join(media, t.file);
    const size = fs.statSync(file).size;
    let start = 0, end = size - 1;
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (m && (m[1] || m[2])) {
      start = m[1] ? +m[1] : size - +m[2];
      end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  // Control desde el guion de prueba
  if (url.pathname === '/control/play') {
    commands.push({ seq: ++seq, type: 'play', tracks: tracks.map(pub), start: 0 });
    for (const w of waiting) { clearTimeout(w.timer); json(w.res, { seq, commands: commands.slice(-1) }); }
    waiting = [];
    return json(res, { ok: true, seq });
  }
  if (url.pathname === '/control/log') return json(res, log);
  json(res, { error: 'no existe' }, 404);
});
server.listen(37373, '0.0.0.0', () => console.log('Pipo de prueba en el puerto 37373'));
