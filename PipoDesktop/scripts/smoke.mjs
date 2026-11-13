// Prueba de humo del ejecutable de Windows ya empaquetado: abre la app con música de ejemplo,
// recorre las pantallas, reproduce, usa el ecualizador y YouTube, y guarda capturas + informe.
// Uso: node scripts/smoke.mjs "<ruta al .exe>" <carpeta de música> <carpeta de salida>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright-core';

const [exe, samples, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'pipo-prueba-'));
const report = { steps: [], consoleErrors: [] };
const log = (name, ok, detail = '') => {
  report.steps.push({ name, ok, detail });
  console.log(`${ok ? 'OK ' : 'FALLA'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Videos de prueba generados con el ffmpeg que incluye la app.
const ffmpegExe = path.join(path.dirname(exe), 'resources', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const videoDir = path.join(userData, 'videos-prueba');
let videosOk = false;
if (fs.existsSync(ffmpegExe)) {
  const { execFileSync } = await import('node:child_process');
  const make = (rel, extra) => {
    const f = path.join(videoDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-g', '25', ...extra, f];
    execFileSync(ffmpegExe, args, { stdio: 'pipe' });
  };
  try {
    make('Peliculas/Prueba Directa (2024).mp4', ['-c:a', 'aac']);
    make('Peliculas/Prueba AC3 (2023).mkv', ['-c:a', 'ac3', '-ac', '6']);
    make('Series/Serie Prueba/Temporada 1/Serie Prueba S01E01 Piloto.mp4', ['-c:a', 'aac']);
    make('Series/Serie Prueba/Temporada 1/Serie Prueba S01E02.mp4', ['-c:a', 'aac']);
    videosOk = true;
  } catch (err) {
    console.log('No se pudieron generar los videos de prueba:', String(err.stderr ?? err.message).slice(0, 300));
  }
}

const app = await electron.launch({
  executablePath: exe,
  env: { ...process.env, PIPO_MUSIC_DIR: samples, PIPO_USER_DATA: userData, PIPO_VIDEO_DIR: videoDir },
  timeout: 120_000,
});
const page = await app.firstWindow();
page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => report.consoleErrors.push(`pageerror: ${e.message}`));
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.setContentSize(1280, 800);
  w.center();
});

const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });
const nav = (label) => page.locator('.sidebar .nav-item', { hasText: label }).first().click();
const step = async (name, fn) => {
  try {
    const detail = await fn();
    log(name, true, detail ?? '');
  } catch (err) {
    log(name, false, String(err?.message ?? err).split('\n')[0]);
    await shot(`error-${report.steps.length}`).catch(() => undefined);
  }
};
const timeText = () => page.locator('.player-bar .seek-row .time').first().textContent();
const toSec = (t) => (t ?? '0:00').split(':').reduce((a, n) => a * 60 + Number(n), 0);

await step('La biblioteca carga la música de ejemplo', async () => {
  await page.waitForSelector('.main-scroll .track-row', { timeout: 90_000 });
  await page.waitForTimeout(1500);
  const count = await page.locator('.view-title .count').textContent();
  await shot('01-canciones');
  const n = Number(/(\d+) canciones/.exec(count ?? '')?.[1] ?? 0);
  if (n < 12) throw new Error(`se esperaban al menos 12 canciones, hay: ${count}`);
  return count;
});

await step('Reproduce un archivo local', async () => {
  await page.locator('.main-scroll .track-row', { hasText: 'Brisa de Barranquilla' }).dblclick();
  await page.waitForTimeout(5000);
  const t = await timeText();
  const title = await page.locator('.player-bar .play-btn').getAttribute('title');
  if (toSec(t) < 2) throw new Error(`la posición no avanza (${t}, botón: ${title})`);
  return `posición ${t}`;
});

await step('Álbumes y detalle de álbum', async () => {
  await nav('Álbumes');
  await page.waitForSelector('.card');
  await shot('02-albumes');
  await page.locator('.card', { hasText: 'Noches de Caribe' }).click();
  await page.waitForSelector('.page-header');
  await shot('03-album');
});

await step('Artistas y géneros', async () => {
  await nav('Artistas');
  await page.waitForSelector('.card');
  await shot('04-artistas');
  await nav('Géneros');
  await page.waitForSelector('.card');
  await shot('05-generos');
});

await step('Crear una lista y agregar canciones', async () => {
  await nav('Canciones');
  const rows = page.locator('.main-scroll .track-row');
  await rows.nth(0).click({ button: 'right' });
  await page.getByText('Agregar a una lista…').click();
  await page.getByText('Nueva lista…').click();
  await page.fill('.dialog input', 'Para trabajar');
  await page.locator('.dialog button[type=submit]').click();
  for (const i of [2, 4, 6, 8]) {
    await rows.nth(i).click({ button: 'right' });
    await page.getByText('Agregar a una lista…').click();
    await page.locator('.picker-item', { hasText: 'Para trabajar' }).click();
  }
  await rows.nth(3).hover();
  await rows.nth(3).locator('.c-fav').click();
  await nav('Para trabajar');
  await page.waitForSelector('.page-header');
  const n = await page.locator('.main-scroll .track-row').count();
  await shot('06-lista');
  if (n !== 5) throw new Error(`la lista tiene ${n} canciones`);
  return `${n} canciones`;
});

await step('Ecualizador con preajuste y efectos', async () => {
  await nav('Ecualizador');
  await page.locator('.chip', { hasText: 'Graves potentes' }).click();
  const bass = page.locator('.effect', { hasText: 'Refuerzo de graves' }).locator('input[type=range]');
  await bass.fill('40');
  await page.waitForTimeout(600);
  await shot('07-ecualizador');
  const devices = await page.locator('.output-row select option').allTextContents();
  return `salidas: ${devices.join(' | ') || 'ninguna'}`;
});

await step('Pantalla «Reproduciendo» y cola', async () => {
  await page.locator('.player-bar .now-art').click();
  await page.waitForTimeout(2500);
  await shot('08-reproduciendo');
  await page.keyboard.press('Escape');
  await page.locator('.player-bar [title="Cola de reproducción"]').click();
  await page.waitForTimeout(500);
  await shot('09-cola');
  await page.locator('.queue-panel [title="Cerrar"]').click();
});

let ytOk = false;
await step('YouTube: búsqueda de canciones', async () => {
  await page.locator('.sidebar .nav-item').filter({ hasText: /^YouTube$/ }).click();
  await page.fill('.yt-search input', 'Carlos Vives La Bicicleta');
  await page.locator('.yt-search button[type=submit]').click();
  await page.waitForSelector('.main-scroll .track-row, .notice', { timeout: 90_000 });
  await page.waitForTimeout(2500);
  await shot('10-youtube');
  const n = await page.locator('.main-scroll .track-row').count();
  if (!n) throw new Error((await page.locator('.notice').first().textContent()) ?? 'sin resultados');
  ytOk = true;
  const first = await page.locator('.main-scroll .track-row').first().locator('.titles').textContent();
  return `${n} resultados; primero: ${first}`;
});

if (ytOk) {
  await step('YouTube: reproducir solo el audio', async () => {
    await page.locator('.main-scroll .track-row').first().dblclick();
    const start = Date.now();
    let last = -1;
    while (Date.now() - start < 75_000) {
      await page.waitForTimeout(2000);
      const toast = await page.locator('.toast').allTextContents();
      const err = toast.find((x) => x.startsWith('No se pudo reproducir'));
      if (err) throw new Error(err);
      const nowTitle = await page.locator('.player-bar .now-text .t1').textContent().catch(() => '');
      const sec = toSec(await timeText());
      // La posición debe avanzar entre dos lecturas y el botón debe estar en pausa (sonando).
      const playing = (await page.locator('.player-bar .play-btn').getAttribute('title'))?.startsWith('Pausar');
      if (playing && last >= 1 && sec > last) return `sonando «${nowTitle}» en ${await timeText()}`;
      last = playing ? sec : -1;
    }
    throw new Error(`no empezó a sonar (posición ${await timeText()})`);
  });
  await shot('11-youtube-sonando');

  await step('YouTube: descargar para escuchar sin internet', async () => {
    await page.locator('.main-scroll .track-row').nth(1).click({ button: 'right' });
    await page.getByText('Descargar para escuchar sin internet').click();
    const start = Date.now();
    while (Date.now() - start < 150_000) {
      await page.waitForTimeout(2000);
      const toast = (await page.locator('.toast').allTextContents()).join(' | ');
      if (/Descargada:/.test(toast)) return toast;
      if (/No se pudo descargar/.test(toast)) throw new Error(toast);
    }
    throw new Error('la descarga no terminó a tiempo');
  });
  await page.locator('.sidebar .nav-item', { hasText: 'Descargadas de YouTube' }).click();
  await page.waitForTimeout(800);
  await shot('12-descargadas');
}

await step('Ajustes', async () => {
  await nav('Ajustes');
  await page.waitForTimeout(2500);
  await shot('13-ajustes');
  return (await page.locator('.panel', { hasText: 'Componente de YouTube' }).locator('.muted.small').first().textContent()) ?? '';
});

await step('Películas y series: servidor de video para la TV', async () => {
  if (!videosOk) throw new Error('no se pudo generar video de prueba (¿ffmpeg incluido?)');
  await nav('Ajustes');
  const panel = page.locator('.panel', { hasText: 'Pipo en la TV (LG webOS)' }).first();
  await panel.locator('input[role=switch]').check();
  await page.waitForSelector('.tv-big.code', { timeout: 20_000 });
  const addr = ((await page.locator('.tv-big').first().textContent()) ?? '').trim();
  const pin = ((await page.locator('.tv-big.code').textContent()) ?? '').trim();
  const port = addr.includes(':') ? addr.split(':')[1] : '37373';
  const base = `http://127.0.0.1:${port}`;
  const pair = await fetch(`${base}/pipo/pair`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ pin }) });
  if (!pair.ok) throw new Error(`no se pudo emparejar (${pair.status})`);
  const token = (await pair.json()).token;
  const api = (p) => fetch(`${base}${p}${p.includes('?') ? '&' : '?'}t=${token}`);
  let catalog = { count: 0, items: [] };
  for (let i = 0; i < 60 && catalog.count < 4; i++) {
    catalog = await (await api('/pipo/videos')).json();
    if (catalog.count < 4) await new Promise((r) => setTimeout(r, 1000));
  }
  if (catalog.count !== 4) throw new Error(`se esperaban 4 videos, hay ${catalog.count}`);
  const movies = catalog.items.filter((i) => i.kind === 'movie').length;
  const series = new Set(catalog.items.filter((i) => i.kind === 'episode').map((i) => i.seriesKey)).size;
  if (movies !== 2 || series !== 1) throw new Error(`reconocimiento incorrecto: ${movies} películas, ${series} series`);
  await shot('15-ajustes-video');

  const caps = encodeURIComponent('v.h264,a.aac,c.mp4,c.mkv');
  const byName = (t) => catalog.items.find((i) => i.title.includes(t));
  const plan = async (item, extra = '') => (await api(`/pipo/video/${encodeURIComponent(item.id)}/play?caps=${caps}${extra}`)).json();
  const direct = await plan(byName('Prueba Directa'));
  if (direct.mode !== 'direct') throw new Error(`MP4 H.264/AAC debía ser directo: ${direct.mode}`);
  const ac3 = await plan(byName('Prueba AC3'));
  if (ac3.mode !== 'remux') throw new Error(`MKV con AC3 debía convertir el audio (remux): ${ac3.mode}`);
  const head = async (url) => {
    const r = await fetch(`${base}${url}`);
    const reader = r.body.getReader();
    const first = await reader.read();
    await reader.cancel();
    return { status: r.status, box: Buffer.from(first.value ?? []).subarray(4, 8).toString() };
  };
  const rangeRes = await fetch(`${base}${direct.url}`, { headers: { Range: 'bytes=0-99' } });
  if (rangeRes.status !== 206) throw new Error(`Range debía responder 206: ${rangeRes.status}`);
  const remux = await head(ac3.url);
  if (remux.status !== 200 || remux.box !== 'ftyp') throw new Error(`remux inválido: ${remux.status} ${remux.box}`);
  const forced = await plan(byName('Prueba Directa'), '&force=transcode');
  const tc = await head(forced.url);
  if (tc.status !== 200 || tc.box !== 'ftyp') throw new Error(`transcode inválido (¿libx264?): ${tc.status} ${tc.box}`);
  const thumb = await api(`/pipo/video/${encodeURIComponent(direct.id)}/thumb`);
  const img = Buffer.from(await thumb.arrayBuffer());
  if (thumb.status !== 200 || img[0] !== 0xff) throw new Error(`miniatura inválida: ${thumb.status}`);
  return `${movies} películas, ${series} serie; directo/remux/transcode/rango/miniatura correctos`;
});

await step('Tema claro', async () => {
  await page.locator('.segmented button', { hasText: 'Claro' }).click();
  await nav('Álbumes');
  await page.waitForTimeout(800);
  await shot('14-tema-claro');
  await nav('Ajustes');
  await page.locator('.segmented button', { hasText: 'Oscuro' }).click();
});

await step('Los datos se guardan al cerrar', async () => {
  await app.close();
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'datos', 'usuario.json'), 'utf8'));
  const lists = saved.playlists.map((p) => `${p.name} (${p.trackIds.length})`).join(', ');
  if (!saved.playlists.length) throw new Error('no se guardó la lista');
  return `listas: ${lists}; favoritos: ${saved.favTracks.length}`;
});

fs.writeFileSync(path.join(out, 'informe.json'), JSON.stringify(report, null, 2));
const failed = report.steps.filter((s) => !s.ok);
console.log(`\n${report.steps.length - failed.length}/${report.steps.length} pasos correctos`);
if (report.consoleErrors.length) console.log('Errores de consola:\n' + report.consoleErrors.join('\n'));
// Las fallas de YouTube dependen de la red del servidor de pruebas; las demás sí detienen el flujo.
const critical = failed.filter((s) => !s.name.startsWith('YouTube'));
process.exit(critical.length ? 1 : 0);
