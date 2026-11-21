// Banners para estados de WhatsApp de Pipo Music Player: 1080 × 1920 px, zona segura de 250 px
// arriba y abajo, logo oficial del cocker como protagonista. Se arman en HTML/CSS y se
// fotografían con Chromium a tamaño exacto.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire('/tmp/claude-0/ui-test.cjs')('playwright');

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = process.argv[2] || path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const font = (pkg, file) => fs.readFileSync(path.join(HERE, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64');
const FONTS = `
@font-face { font-family: 'Fredoka'; font-weight: 600; src: url(data:font/woff2;base64,${font('fredoka', 'fredoka-latin-600-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Fredoka'; font-weight: 700; src: url(data:font/woff2;base64,${font('fredoka', 'fredoka-latin-700-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Nunito'; font-weight: 800; src: url(data:font/woff2;base64,${font('nunito', 'nunito-latin-800-normal.woff2')}) format('woff2'); }
@font-face { font-family: 'Nunito'; font-weight: 900; src: url(data:font/woff2;base64,${font('nunito', 'nunito-latin-900-normal.woff2')}) format('woff2'); }`;

const Y = '#ffd25a'; // amarillo cálido
const L = '#9b7bff'; // lila de la app

// ─────────────── Adornos (SVG) ───────────────
const box = (x, y, w, h, rot = 0, op = 1, extra = '') => `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);opacity:${op};${extra}`;
const paw = (x, y, s, rot, op = 0.18, c = '#fff') =>
  `<svg style="${box(x, y, s, s, rot, op)}" viewBox="0 0 100 100"><g fill="${c}"><ellipse cx="50" cy="66" rx="24" ry="20"/><ellipse cx="22" cy="42" rx="10" ry="13"/><ellipse cx="40" cy="25" rx="10" ry="13"/><ellipse cx="60" cy="25" rx="10" ry="13"/><ellipse cx="78" cy="42" rx="10" ry="13"/></g></svg>`;
const note1 = (x, y, s, rot, c = Y, op = 1) =>
  `<svg style="${box(x, y, s, s, rot, op)}" viewBox="0 0 64 64"><g fill="${c}"><rect x="34" y="6" width="7" height="40" rx="3"/><path d="M41 6c8 4 15 9 14 21-3-7-8-10-14-11z"/><ellipse cx="27" cy="47" rx="13" ry="10" transform="rotate(-22 27 47)"/></g></svg>`;
const note2 = (x, y, s, rot, c = '#fff', op = 1) =>
  `<svg style="${box(x, y, s, s, rot, op)}" viewBox="0 0 64 64"><g fill="${c}"><rect x="20" y="14" width="6" height="34" rx="3"/><rect x="50" y="8" width="6" height="34" rx="3"/><path d="M20 14 56 6v10L20 24z"/><ellipse cx="15" cy="49" rx="11" ry="8.5" transform="rotate(-22 15 49)"/><ellipse cx="45" cy="43" rx="11" ry="8.5" transform="rotate(-22 45 43)"/></g></svg>`;
const waves = (x, y, s, rot, c = '#fff', op = 0.7) =>
  `<svg style="${box(x, y, s, s, rot, op)}" viewBox="0 0 100 100" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round"><path d="M30 35a22 22 0 0 1 0 30"/><path d="M45 22a40 40 0 0 1 0 56"/><path d="M60 10a58 58 0 0 1 0 80"/></svg>`;
const eq = (x, y, w, h, heights, op = 1, gap = 14) => {
  const bw = (w - gap * (heights.length - 1)) / heights.length;
  return `<div style="${box(x, y, w, h, 0, op)}display:flex;align-items:flex-end;gap:${gap}px">${heights
    .map((v) => `<div style="width:${bw}px;height:${v * h}px;border-radius:${bw / 2}px;background:linear-gradient(180deg,${Y} 0%,#ff9e5a 35%,${L} 100%)"></div>`)
    .join('')}</div>`;
};
const emoji = (x, y, s, rot, ch, op = 1) => `<div class="emo" style="${box(x, y, s * 1.2, s * 1.2, rot, op)}font-size:${s}px">${ch}</div>`;
// Tira decorativa de ecualizador en la zona segura de arriba y de abajo (no hay texto ahí).
const frame = () =>
  eq(90, 120, 900, 70, [0.4, 0.7, 0.5, 0.9, 0.6, 1, 0.55, 0.8, 0.45, 0.7, 0.5, 0.85, 0.6, 0.4, 0.75, 0.5, 0.95, 0.6], 0.35, 12) +
  eq(90, 1740, 900, 70, [0.6, 0.4, 0.8, 0.5, 0.95, 0.6, 0.75, 0.45, 1, 0.55, 0.7, 0.4, 0.85, 0.5, 0.65, 0.9, 0.45, 0.7], 0.35, 12) +
  paw(40, 1820, 70, -20, 0.22) + paw(950, 1815, 70, 18, 0.22) + paw(960, 40, 64, 24, 0.18) + paw(56, 36, 60, -16, 0.18);

// ─────────────── Utilería para el cocker (coordenadas del logo: 1024 × 1024) ───────────────
const furPaw = (cx, cy, rot, s = 1) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
    <defs><linearGradient id="pf${cx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc768"/><stop offset="1" stop-color="#e48c2e"/></linearGradient></defs>
    <path d="M-78 40 C-92 -30 -70 -96 -40 -112 C-26 -134 2 -136 14 -116 C28 -136 58 -132 66 -106 C92 -98 100 -54 88 -8 C84 52 52 104 2 108 C-46 110 -74 82 -78 40Z" fill="url(#pf${cx})" stroke="#9a5416" stroke-width="8"/>
    <path d="M-30 -104 C-34 -80 -32 -64 -22 -50" fill="none" stroke="#9a5416" stroke-width="7" stroke-linecap="round"/>
    <path d="M30 -110 C26 -86 26 -70 34 -56" fill="none" stroke="#9a5416" stroke-width="7" stroke-linecap="round"/>
    <path d="M-50 10 C-30 30 0 38 28 30" fill="none" stroke="#fff3d6" stroke-width="8" stroke-linecap="round" opacity=".55"/>
  </g>`;

function dog(src, { size, x, y, rot = 0, overlay = '', flip = false, shadow = true }) {
  return `<div style="${box(x, y, size, size, rot)}">
    <img src="${src}" style="width:100%;height:100%;${flip ? 'transform:scaleX(-1);' : ''}${shadow ? 'filter:drop-shadow(0 26px 32px rgba(0,0,0,.5));' : ''}">
    <svg viewBox="0 0 1024 1024" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">${overlay}</svg>
  </div>`;
}
const glow = (cx, cy, r, op = 0.55) => `<div style="position:absolute;left:${cx - r}px;top:${cy - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:radial-gradient(circle, rgba(155,123,255,${op}) 0%, rgba(155,123,255,0) 70%)"></div>`;

// ─────────────── Plantilla ───────────────
function page(content) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${FONTS}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1080px; height: 1920px; overflow: hidden; background: #12101a; }
body { font-family: 'Nunito', 'Noto Color Emoji', sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
.banner { position: relative; width: 1080px; height: 1920px; overflow: hidden;
  background: linear-gradient(180deg, #12101a 0%, #181229 24%, #241a48 50%, #3a2a85 72%, #6a52d6 88%, #9b7bff 100%); }
.emo { font-family: 'Noto Color Emoji'; line-height: 1; text-align: center; }
.t { position: absolute; left: 60px; right: 60px; text-align: center; }
.h1 { font-family: 'Fredoka', 'Noto Color Emoji', sans-serif; font-weight: 700; font-size: 100px; line-height: 1.06; letter-spacing: -1px; text-shadow: 0 6px 0 rgba(0,0,0,.28); }
.h1 .y, .y { color: ${Y}; }
.body { font-weight: 800; font-size: 54px; line-height: 1.24; text-shadow: 0 4px 0 rgba(0,0,0,.3); }
.body b { font-weight: 900; color: ${Y}; }
.pill { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; padding: 20px 46px; border-radius: 999px;
  background: rgba(18,16,26,.82); border: 4px solid ${Y}; font-family: 'Fredoka', 'Noto Color Emoji'; font-weight: 600; font-size: 52px; color: ${Y}; box-shadow: 0 12px 30px rgba(0,0,0,.35); }
.small { font-weight: 800; font-size: 34px; line-height: 1.3; color: #e6defc; }
</style></head><body><div class="banner">${frame()}${content}</div></body></html>`;
}

// ─────────────── Los 6 banners ───────────────
const B = [];

// 1 · Presentación: el cocker moviendo la cabeza al ritmo, rodeado de notas
B.push(page(`
  <div class="t h1" style="top:268px">¡Guau! 🐶🎧</div>
  ${glow(540, 820, 450)}
  ${dog('perro.png', { size: 720, x: 180, y: 430, rot: -9 })}
  <svg style="${box(120, 540, 840, 560)}" viewBox="0 0 780 560" fill="none" stroke="${Y}" stroke-width="9" stroke-linecap="round" opacity=".9">
    <path d="M70 170 C30 240 30 330 70 400"/><path d="M30 130 C-20 230 -20 340 30 440" opacity=".55"/>
    <path d="M710 150 C750 220 750 310 710 380"/><path d="M750 110 C800 210 800 320 750 420" opacity=".55"/>
  </svg>
  ${note2(90, 450, 120, -14)}${note1(880, 420, 130, 12)}${note1(50, 960, 110, -20, '#fff')}${note2(910, 930, 120, 10, Y)}
  ${note1(250, 400, 80, 8, '#c4b1ff')}${note2(790, 1110, 90, -8, '#c4b1ff')}
  <div class="t" style="top:1200px;font-family:'Fredoka';font-weight:700;font-size:76px;line-height:1.1;color:${Y};text-shadow:0 5px 0 rgba(0,0,0,.3)">Pipo Music Player.</div>
  <div class="t body" style="top:1295px;font-size:56px">Tu música, como te gusta oírla.</div>
  <div class="pill" style="top:1490px;font-size:48px;padding:20px 38px">Disponible para Android y Windows 📱💻</div>
`));

// 2 · Sonido: orejas al viento frente a barras de ecualizador gigantes
B.push(page(`
  <div class="t h1" style="top:268px">¿Tus audífonos<br>suenan <span class="y">meh</span>? 😒</div>
  ${eq(70, 560, 940, 560, [0.35, 0.6, 0.85, 0.5, 1, 0.7, 0.9, 0.55, 0.8, 0.45], 0.9, 22)}
  ${glow(540, 860, 380, 0.45)}
  ${dog('perro.png', { size: 580, x: 250, y: 560, rot: 7 })}
  <svg style="${box(0, 620, 1080, 520)}" viewBox="0 0 1080 520" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".9">
    <path d="M30 230 C90 214 140 250 210 232"/><path d="M14 318 C80 300 128 340 196 322"/><path d="M44 404 C100 388 140 420 196 410"/>
    <path d="M880 262 C930 246 980 282 1050 258"/><path d="M890 350 C940 334 990 368 1060 344"/><path d="M880 434 C924 420 964 448 1020 432"/>
  </svg>
  ${emoji(860, 470, 96, 12, '🔊')}
  <div class="t body" style="top:1190px">Ecualizador de <b>10 bandas</b>, más graves y ajuste por audífono, parlante o Bluetooth.</div>
  <div class="pill" style="top:1510px">Pipo le sube el sabor a tu música 🔊🔥</div>
`));

// 3 · Organización y TV: bibliotecario con lentes, pila de discos y televisor
const glasses = `
  <g fill="rgba(255,255,255,.14)" stroke="#2a2140" stroke-width="18">
    <circle cx="388" cy="398" r="86"/><circle cx="660" cy="360" r="86"/>
  </g>
  <path d="M472 384 C505 358 548 352 576 360" fill="none" stroke="#2a2140" stroke-width="16" stroke-linecap="round"/>
  <path d="M340 350 a60 60 0 0 1 40 -22" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>
  <path d="M612 312 a60 60 0 0 1 40 -22" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" opacity=".8"/>
  <g transform="translate(512 968)"><path d="M-10 0 L-120 -62 L-120 62Z M10 0 L120 -62 L120 62Z" fill="${Y}" stroke="#2a2140" stroke-width="12" stroke-linejoin="round"/><rect x="-30" y="-30" width="60" height="60" rx="16" fill="#ffb84a" stroke="#2a2140" stroke-width="12"/></g>`;
const discs = (x, y) => `<svg style="${box(x, y, 300, 330)}" viewBox="0 0 300 330">
  ${[0, 1, 2, 3].map((i) => {
    const yy = 250 - i * 62, rot = [-6, 5, -3, 7][i], col = [L, Y, '#ff8fb3', '#7fd6ff'][i];
    return `<g transform="rotate(${rot} 150 ${yy})"><rect x="22" y="${yy - 30}" width="256" height="62" rx="12" fill="#1c1630" stroke="#fff" stroke-opacity=".25" stroke-width="4"/><rect x="34" y="${yy - 20}" width="80" height="42" rx="8" fill="${col}"/><circle cx="200" cy="${yy + 1}" r="26" fill="#0b0a10" stroke="#3a3350" stroke-width="5"/><circle cx="200" cy="${yy + 1}" r="9" fill="${col}"/></g>`;
  }).join('')}</svg>`;
const tv = (x, y) => `<svg style="${box(x, y, 330, 300)}" viewBox="0 0 330 300">
  <rect x="10" y="10" width="310" height="200" rx="26" fill="#1c1630" stroke="#c4b1ff" stroke-width="8"/>
  <rect x="30" y="30" width="270" height="160" rx="14" fill="url(#scr)"/>
  <defs><linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L}"/><stop offset="1" stop-color="#2b2058"/></linearGradient></defs>
  <circle cx="165" cy="110" r="44" fill="rgba(255,255,255,.18)"/><path d="M150 86 L190 110 L150 134Z" fill="#fff"/>
  <g fill="${Y}"><rect x="44" y="44" width="14" height="10" rx="2"/><rect x="44" y="64" width="14" height="10" rx="2"/><rect x="44" y="146" width="14" height="10" rx="2"/><rect x="44" y="166" width="14" height="10" rx="2"/><rect x="272" y="44" width="14" height="10" rx="2"/><rect x="272" y="64" width="14" height="10" rx="2"/><rect x="272" y="146" width="14" height="10" rx="2"/><rect x="272" y="166" width="14" height="10" rx="2"/></g>
  <path d="M120 212 L100 270 M210 212 L230 270" stroke="#c4b1ff" stroke-width="10" stroke-linecap="round"/><rect x="80" y="266" width="170" height="14" rx="7" fill="#c4b1ff"/></svg>`;
B.push(page(`
  <div class="t h1" style="top:268px">Tu música,<br><span class="y">ordenadita</span> 🧹🎶</div>
  ${glow(540, 830, 400)}
  ${discs(30, 740)}
  ${tv(720, 700)}
  ${dog('perro.png', { size: 560, x: 260, y: 520, rot: -3, overlay: glasses })}
  ${note1(170, 560, 90, -12)}${note2(850, 560, 90, 10, '#c4b1ff')}
  <div class="t body" style="top:1150px">Álbumes, artistas, listas, favoritos y temporizador para dormir. <span class="y">¡Y tus películas y series en la TV LG!</span></div>
  <div class="pill" style="top:1525px">Celular, PC y televisor 📺</div>
`));

// 4 · YouTube sin anuncios: tapándose los oídos frente a un cartel tachado
const sign = (x, y) => `<svg style="${box(x, y, 420, 300, 8)}z-index:3" viewBox="0 0 420 300">
  <rect x="200" y="200" width="18" height="100" fill="#8d82aa"/>
  <rect x="10" y="20" width="400" height="190" rx="24" fill="#fff8e6" stroke="#2a2140" stroke-width="10"/>
  <text x="210" y="138" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="74" fill="#2a2140">ANUNCIO</text>
  <path d="M30 176 L390 54" stroke="#2a2140" stroke-width="34" stroke-linecap="round"/>
  <path d="M30 176 L390 54" stroke="${Y}" stroke-width="20" stroke-linecap="round"/></svg>`;
const covering = furPaw(150, 470, 18, 1.15) + furPaw(880, 440, -18, 1.15);
B.push(page(`
  <div class="t h1" style="top:268px">¿Otra vez<br>un <span class="y">anuncio</span>? 😤📢</div>
  ${glow(450, 900, 380)}
  ${dog('perro.png', { size: 560, x: 120, y: 620, rot: -6, overlay: covering })}
  ${sign(590, 505)}
  ${emoji(70, 560, 84, -10, '🔇')}${emoji(880, 960, 90, 8, '🙉')}
  <div class="t body" style="top:1180px">Escucha y mira <b>YouTube sin anuncios</b>, en segundo plano y con tu ecualizador. ¡Descarga y escucha sin internet!</div>
  <div class="t small" style="top:1565px">La función de YouTube depende del servicio y se actualiza si YouTube cambia algo.</div>
`));

// 5 · Precio: tirando a la basura un papel que dice «Mensualidad»
const trash = (x, y) => `<svg style="${box(x, y, 300, 360)}" viewBox="0 0 300 360">
  <g transform="rotate(-24 70 70)"><rect x="20" y="60" width="250" height="34" rx="14" fill="#c4b1ff" stroke="#2a2140" stroke-width="8"/><rect x="115" y="38" width="60" height="28" rx="10" fill="#c4b1ff" stroke="#2a2140" stroke-width="8"/></g>
  <path d="M40 130 H260 L240 345 H60Z" fill="#3a2f66" stroke="#c4b1ff" stroke-width="8" stroke-linejoin="round"/>
  <g stroke="#c4b1ff" stroke-width="8" stroke-linecap="round" opacity=".7"><path d="M100 170 L108 310"/><path d="M150 170 V310"/><path d="M200 170 L192 310"/></g></svg>`;
const paper = (x, y) => `<svg style="${box(x, y, 380, 190, -14)}" viewBox="0 0 380 190">
  <path d="M14 20 L360 8 L372 170 L22 182 Z" fill="#fffdf6" stroke="#2a2140" stroke-width="8" stroke-linejoin="round"/>
  <g stroke="#cfc6e6" stroke-width="5" fill="none"><path d="M60 30 L90 170"/><path d="M250 16 L300 175"/><path d="M20 100 L370 86"/></g>
  <text x="192" y="112" text-anchor="middle" font-family="Fredoka" font-weight="700" font-size="50" fill="#2a2140">Mensualidad</text></svg>`;
B.push(page(`
  <div class="t h1" style="top:268px">Cero suscripciones.<br><span class="y">Cero sustos.</span> 🙅‍♂️💸</div>
  ${glow(400, 840, 360)}
  ${dog('perro.png', { size: 500, x: 70, y: 560, rot: 6, overlay: furPaw(900, 640, -40, 1.1) })}
  <svg style="${box(470, 560, 360, 200)}" viewBox="0 0 360 200" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="4 26" opacity=".8"><path d="M20 180 C120 40 240 20 340 60"/></svg>
  ${paper(560, 520)}
  ${trash(720, 760)}
  <div class="t body" style="top:1140px;font-size:60px">Pagas <b>UNA</b> sola vez:</div>
  <div class="t" style="top:1214px;font-family:'Fredoka';font-weight:700;font-size:156px;line-height:1;color:${Y};text-shadow:0 8px 0 rgba(0,0,0,.35)">$10.000 COP</div>
  <div class="t body" style="top:1384px;font-size:60px">y es tuya para siempre.</div>
  <div class="pill" style="top:1525px;font-size:48px;padding:20px 36px">Sin cobros mensuales. Sin letra pequeña.</div>
`));

// 6 · Llamado a comprar: guiño y señalando hacia abajo
const pointing = furPaw(905, 820, 160, 1.05) + `
  <path d="M972 950 C1002 990 1000 1030 970 1066" fill="none" stroke="${Y}" stroke-width="26" stroke-linecap="round"/>
  <path d="M916 1036 L966 1080 L1012 1026" fill="none" stroke="${Y}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>`;
B.push(page(`
  <div class="t h1" style="top:268px">¿Listo para<br>mover la <span class="y">cola</span>? 🐾</div>
  ${glow(520, 800, 360)}
  ${dog('perro-guino.png', { size: 520, x: 230, y: 490, rot: -5, overlay: pointing })}
  ${note2(150, 560, 96, -12)}${note1(110, 820, 84, 10, '#c4b1ff')}${emoji(830, 520, 80, 14, '✨')}
  <div class="t body" style="top:1075px;font-size:52px;line-height:1.22"><span class="y">Pipo Music Player</span><br>Android + Windows<br>Tu música + YouTube sin anuncios.</div>
  <div class="pill" style="top:1300px;font-size:66px;padding:22px 52px;background:${Y};color:#1a1430;border-color:#fff">$10.000 COP · pago único</div>
  <div class="t h1" style="top:1468px;font-size:64px;line-height:1.15;font-weight:600">Escríbeme 👇 y te la envío hoy.</div>
  <svg style="${box(500, 1570, 80, 90)}" viewBox="0 0 80 90"><path d="M40 6 V70 M12 46 L40 76 L68 46" fill="none" stroke="${Y}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>
`));

// ─────────────── Render y verificación ───────────────
const browser = await chromium.launch();
const page1 = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
const report = [];
for (let i = 0; i < B.length; i++) {
  const html = path.join(HERE, `banner-${i + 1}.html`);
  fs.writeFileSync(html, B[i]);
  await page1.goto(`file://${html}`);
  await page1.evaluate(() => document.fonts.ready);
  await page1.waitForTimeout(300);
  // Zona segura: ningún texto entre 0–250 px ni 1670–1920 px; tamaños mínimos de letra.
  const check = await page1.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.t, .pill')) {
      const r = el.getBoundingClientRect();
      const fs = parseFloat(getComputedStyle(el).fontSize);
      out.push({ text: el.textContent.trim().slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), size: fs, words: el.textContent.trim().split(/\s+/).filter((w) => /[\p{L}\p{N}$]/u.test(w)).length, cls: el.className });
    }
    return out;
  });
  const file = path.join(OUT, `pipo-estado-0${i + 1}.png`);
  await page1.screenshot({ path: file, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
  report.push({ banner: i + 1, check });
}
await browser.close();
for (const r of report) {
  const main = r.check.filter((c) => !c.cls.includes('small'));
  const words = main.reduce((a, c) => a + c.words, 0);
  const bad = r.check.filter((c) => c.top < 250 || c.bottom > 1670 || c.left < 0 || c.right > 1080);
  console.log(`Banner ${r.banner}: ${words} palabras (sin letra pequeña)${bad.length ? ' · FUERA DE ZONA: ' + bad.map((b) => `«${b.text}» ${b.top}-${b.bottom}`).join('; ') : ' · zona segura OK'}`);
  for (const c of r.check) console.log(`   ${String(c.size).padStart(3)} px  ${c.top}–${c.bottom}  ${c.words} pal.  ${c.text}`);
}
