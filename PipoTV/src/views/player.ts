// Reproductor de video a pantalla completa para la TV.
import { absoluteUrl, fetchPlan, fetchText, subtitleUrl, Unauthorized, type PlanSub, type PlayMode, type TvVideo, type VideoPlan } from '../api';
import { engine } from '../audio';
import { detectCaps } from '../caps';
import { clear, formatTime, h, icon } from '../dom';
import { focus, KEY, setKeyOwner, type Dir } from '../nav';
import { app, toast } from '../state';
import { closeOverlay, openOverlay, setBackHook, type View } from '../ui';
import { getPrefs, resumable, saveProgress, setPrefs } from '../videostate';

interface Cue {
  start: number;
  end: number;
  text: string;
}

export function parseVtt(text: string): Cue[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const stamp = (s: string): number => {
    const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(s.trim());
    return m ? Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4] + '00'.slice(m[4].length - 1)) / 1000 : NaN;
  };
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const arrow = lines[i].indexOf('-->');
    if (arrow < 0) {
      i++;
      continue;
    }
    const start = stamp(lines[i].slice(0, arrow));
    const end = stamp(lines[i].slice(arrow + 3).trim().split(/\s+/)[0]);
    const body: string[] = [];
    i++;
    while (i < lines.length && lines[i].trim() !== '') body.push(lines[i++]);
    if (!isNaN(start) && !isNaN(end) && body.length) cues.push({ start, end, text: body.join('\n') });
  }
  return cues.sort((a, b) => a.start - b.start);
}

/** Cursiva/negrita/subrayado básicos; el resto de etiquetas se descarta. */
function cueNodes(text: string): Node[] {
  const clean = text.replace(/\{\\[^}]*\}/g, '');
  const out: Node[] = [];
  let italic = false, bold = false, under = false;
  for (const part of clean.split(/(<\/?[ibu]>|<[^>]+>)/i)) {
    const tag = /^<(\/?)([ibu])>$/i.exec(part);
    if (tag) {
      const on = tag[1] === '';
      const k = tag[2].toLowerCase();
      if (k === 'i') italic = on;
      else if (k === 'b') bold = on;
      else under = on;
      continue;
    }
    if (!part || part.charAt(0) === '<') continue;
    const span = document.createElement('span');
    span.textContent = part;
    if (italic) span.style.fontStyle = 'italic';
    if (bold) span.style.fontWeight = '700';
    if (under) span.style.textDecoration = 'underline';
    out.push(span);
  }
  return out;
}

interface Attempt {
  mode: PlayMode;
  c: 'mp4' | 'ts';
}

function buildAttempts(first: PlayMode): Attempt[] {
  const pref = getPrefs().container;
  const other = pref === 'mp4' ? 'ts' : 'mp4';
  if (first === 'direct') return [{ mode: 'direct', c: pref }, { mode: 'remux', c: pref }, { mode: 'remux', c: other }, { mode: 'transcode', c: pref }, { mode: 'transcode', c: other }];
  if (first === 'remux') return [{ mode: 'remux', c: pref }, { mode: 'remux', c: other }, { mode: 'transcode', c: pref }, { mode: 'transcode', c: other }];
  return [{ mode: 'transcode', c: pref }, { mode: 'transcode', c: other }];
}

const MODE_LABEL: { [m: string]: string } = {
  direct: 'Reproducción directa',
  remux: 'Audio convertido en el PC',
  transcode: 'Convertido en el PC',
};

/** Abre el reproductor. Si el video tiene un punto de reanudación y `resume` no es false, continúa desde ahí. */
export function playVideo(item: TvVideo, opts: { resume?: boolean } = {}) {
  const r = opts.resume === false ? null : resumable(item.id);
  engine.pause();
  openOverlay(createPlayer(item, r ? r.pos : 0));
}

function createPlayer(startItem: TvVideo, startMs: number): View {
  const conn = app.conn!;
  let item = startItem;
  let plan: VideoPlan | null = null;
  let origin = 0;
  let audioIndex: number | undefined;
  let attempts: Attempt[] = [];
  let attemptIdx = 0;
  let force: PlayMode | undefined;
  let container: 'mp4' | 'ts' = getPrefs().container;
  let loadToken = 0;
  let started = false;
  let cues: Cue[] = [];
  let subId: string | null = null;
  let pending: number | null = null;
  let seekTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let nextTimer: ReturnType<typeof setInterval> | undefined;
  let lastSave = 0;
  let destroyed = false;
  let controlsVisible = true;

  const video = h('video', { class: 'vp-video' }) as HTMLVideoElement;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  const subs = h('div', { class: 'vp-subs' });
  const title = h('div', { class: 'vp-title' });
  const badge = h('div', { class: 'vp-badge' });
  const centerMsg = h('div', { class: 'vp-msg' });
  const spinner = h('div', { class: 'vp-center hidden' }, h('div', { class: 'spinner' }), centerMsg);
  const buffered = h('div', { class: 'vp-buffered' });
  const played = h('div', { class: 'vp-played' });
  const knob = h('div', { class: 'vp-knob' });
  const progress = h('div', { class: 'vp-progress', focus: true, 'data-owner': '', 'data-key': 'vp-progress', onclick: () => toggle() }, h('div', { class: 'vp-track' }, buffered, played, knob));
  const times = h('div', { class: 'vp-times' });
  const playBtn = h('button', { class: 'vp-btn big', focus: true, 'data-key': 'vp-play', onclick: () => toggle() });
  const audioBtn = h('button', { class: 'vp-btn text', focus: true, 'data-key': 'vp-audio', onclick: () => openAudioMenu() }, icon('equalizer', 34), 'Audio');
  const subsBtn = h('button', { class: 'vp-btn text', focus: true, 'data-key': 'vp-subs', onclick: () => openSubsMenu() }, icon('note', 34), 'Subtítulos');
  const nextBtn = h('button', { class: 'vp-btn text', focus: true, 'data-key': 'vp-next', onclick: () => goNext() }, icon('next', 34), 'Siguiente');
  const formatBtn = h('button', { class: 'vp-btn text', focus: true, 'data-key': 'vp-format', onclick: () => openFormatMenu() }, icon('settings', 34), 'Formato');
  const controls = h(
    'div',
    { class: 'vp-controls' },
    progress,
    times,
    h(
      'div',
      { class: 'vp-buttons', 'data-group': 'vp' },
      h('button', { class: 'vp-btn', focus: true, 'data-key': 'vp-back10', onclick: () => nudge(-10) }, icon('prev', 40)),
      playBtn,
      h('button', { class: 'vp-btn', focus: true, 'data-key': 'vp-fwd10', onclick: () => nudge(10) }, icon('next', 40)),
      h('div', { class: 'grow' }),
      audioBtn,
      subsBtn,
      formatBtn,
      nextBtn,
    ),
  );
  const top = h('div', { class: 'vp-top' }, title, badge);
  const root = h('div', { class: 'vplayer', 'data-modal': '' }, video, subs, top, spinner, controls);

  setKeyOwner(progress, {
    handleKey(dir: Dir) {
      if (dir === 'left' || dir === 'right') {
        nudge(dir === 'right' ? 10 : -10);
        return true;
      }
      return false;
    },
  });

  // ───────────── Tiempo ─────────────

  const duration = (): number => (plan && plan.durationMs > 0 ? plan.durationMs / 1000 : isFinite(video.duration) ? video.duration : 0);
  const position = (): number => {
    if (pending !== null) return pending;
    const t = video.currentTime || 0;
    return plan && plan.mode !== 'direct' ? origin + t : t;
  };

  const setBusy = (text: string | null) => {
    spinner.classList.toggle('hidden', text === null);
    centerMsg.textContent = text || '';
  };

  const showControls = () => {
    controlsVisible = true;
    controls.classList.remove('hidden');
    top.classList.remove('hidden');
    root.classList.remove('nocursor');
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!video.paused && !popupOpen() && !nextOverlay) {
        controlsVisible = false;
        controls.classList.add('hidden');
        top.classList.add('hidden');
        root.classList.add('nocursor');
      }
    }, 4500);
  };

  // ───────────── Carga y reintentos ─────────────

  async function start(startSec: number, o: { audio?: number; fallback?: boolean } = {}) {
    const token = ++loadToken;
    started = false;
    setBusy('Preparando el video…');
    if (watchdog) clearTimeout(watchdog);
    let p: VideoPlan;
    try {
      p = await fetchPlan(conn, item.id, { caps: detectCaps(), audio: o.audio !== undefined ? o.audio : audioIndex, start: startSec, force, c: container });
    } catch (err) {
      if (destroyed || token !== loadToken) return;
      if (err instanceof Unauthorized) {
        toast('La TV ya no está emparejada. Vuelve a conectarla desde Ajustes.');
        closeOverlay();
        return;
      }
      setBusy((err as Error).message);
      return;
    }
    if (destroyed || token !== loadToken) return;
    plan = p;
    origin = p.startAt;
    audioIndex = p.audioIndex;
    if (!o.fallback) {
      attempts = buildAttempts(p.mode);
      attemptIdx = 0;
    }
    title.textContent = p.title;
    badge.textContent = `${MODE_LABEL[p.mode] || ''}${p.info ? ` · ${p.info}` : ''}`;
    video.src = absoluteUrl(conn, p.url);
    video.load();
    if (p.mode === 'direct' && startSec > 0) {
      const seek = () => {
        video.removeEventListener('loadedmetadata', seek);
        try {
          video.currentTime = startSec;
        } catch {
          // se intentará de nuevo al empezar
        }
      };
      video.addEventListener('loadedmetadata', seek);
    }
    const playing = video.play();
    if (playing && playing.catch) playing.catch(() => undefined);
    // Si no empieza a sonar a tiempo, se prueba otra forma de reproducir.
    watchdog = setTimeout(() => {
      if (!started && !destroyed && token === loadToken) fail('no empezó a reproducirse');
    }, p.mode === 'direct' ? 30000 : 40000);
    if (!o.fallback && !subId) autoSubtitles(p);
    renderPlayState();
  }

  /** Pasa al siguiente intento: directo → convertido (mp4 / ts) → recodificado. */
  function fail(reason: string) {
    if (destroyed) return;
    const t = position();
    attemptIdx++;
    if (attemptIdx >= attempts.length) {
      video.pause();
      setBusy(`No se pudo reproducir este video en la TV (${reason}). Prueba otro archivo o revisa «Ver registro de video» en Pipo del PC.`);
      return;
    }
    const a = attempts[attemptIdx];
    force = a.mode === 'direct' ? undefined : a.mode;
    container = a.c;
    toast(a.mode === 'remux' ? 'Convirtiendo el audio en el PC…' : a.mode === 'transcode' ? 'Convirtiendo el video en el PC…' : 'Probando otro formato…');
    void start(t, { fallback: true });
  }

  video.addEventListener('error', () => {
    if (destroyed || !video.getAttribute('src')) return;
    fail('error de reproducción');
  });
  video.addEventListener('playing', () => {
    started = true;
    if (watchdog) clearTimeout(watchdog);
    setBusy(null);
    if (attemptIdx > 0 && attempts[attemptIdx] && attempts[attemptIdx].c !== getPrefs().container && attempts[attemptIdx].mode !== 'direct') setPrefs({ container: attempts[attemptIdx].c });
    renderPlayState();
    showControls();
  });
  video.addEventListener('pause', () => {
    renderPlayState();
    showControls();
    persist();
  });
  video.addEventListener('waiting', () => {
    if (started) setBusy('');
  });
  video.addEventListener('seeking', () => {
    if (started) setBusy('');
  });
  video.addEventListener('canplay', () => setBusy(null));
  video.addEventListener('seeked', () => setBusy(null));
  video.addEventListener('ended', () => {
    if (destroyed) return;
    const d = duration();
    // Una conversión que se corta antes de tiempo no es el final: se reintenta donde quedó.
    if (d > 0 && position() < d - 20 && plan && plan.mode !== 'direct') {
      void start(position(), { fallback: true });
      return;
    }
    saveProgress(item.id, d * 1000, d * 1000);
    const next = app.videos.nextEpisode(item);
    if (next) showNext(next);
    else closeOverlay();
  });

  // ───────────── Controles ─────────────

  function toggle() {
    if (video.paused) {
      const p = video.play();
      if (p && p.catch) p.catch(() => undefined);
    } else video.pause();
    showControls();
  }

  function inSeekable(t: number): boolean {
    const s = video.seekable;
    for (let i = 0; i < s.length; i++) if (t >= s.start(i) && t <= s.end(i) - 0.5) return true;
    return false;
  }

  function seekTo(sec: number) {
    const d = duration();
    sec = Math.max(0, d > 0 ? Math.min(sec, d - 1) : sec);
    if (!plan) return;
    if (plan.mode === 'direct') {
      video.currentTime = sec;
      return;
    }
    const rel = sec - origin;
    if (rel >= 0 && inSeekable(rel)) video.currentTime = rel;
    else void start(sec, { fallback: true });
  }

  function nudge(delta: number) {
    const d = duration();
    const base = pending !== null ? pending : position();
    pending = Math.max(0, Math.min(base + delta, d > 0 ? d - 1 : base + delta));
    if (seekTimer) clearTimeout(seekTimer);
    seekTimer = setTimeout(() => {
      const t = pending;
      pending = null;
      if (t !== null) seekTo(t);
    }, 600);
    renderProgress();
    showControls();
  }

  function renderPlayState() {
    clear(playBtn);
    playBtn.appendChild(icon(video.paused ? 'play' : 'pause', 56));
    const hasNext = !!app.videos.nextEpisode(item);
    nextBtn.style.display = hasNext ? '' : 'none';
    audioBtn.style.display = plan && plan.audio.length > 1 ? '' : 'none';
    subsBtn.style.display = plan && plan.subs.length ? '' : 'none';
  }

  function renderProgress() {
    const d = duration();
    const p = position();
    const pct = d > 0 ? Math.max(0, Math.min(100, (p / d) * 100)) : 0;
    played.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    let buf = 0;
    if (plan && video.buffered.length && d > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      buf = Math.min(100, (((plan.mode === 'direct' ? 0 : origin) + end) / d) * 100);
    }
    buffered.style.width = `${buf}%`;
    times.textContent = `${formatTime(p * 1000)}  /  ${formatTime(d * 1000)}${d > 0 ? `   ·   quedan ${formatTime(Math.max(0, d - p) * 1000)}` : ''}`;
  }

  function persist() {
    if (!started || !plan) return;
    const p = position();
    if (p > 5) saveProgress(item.id, p * 1000, duration() * 1000);
  }

  // ───────────── Subtítulos ─────────────

  function renderSubs() {
    clear(subs);
    if (!cues.length || pending !== null) return;
    const t = position();
    // Último subtítulo que ya empezó (búsqueda binaria) y los que se superponen con él.
    let lo = 0, hi = cues.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const active: Cue[] = [];
    for (let i = idx; i >= 0 && i > idx - 4; i--) if (cues[i].end > t) active.unshift(cues[i]);
    active.forEach((c, k) => {
      const line = h('div', { class: 'vp-cue' });
      for (const n of cueNodes(c.text)) line.appendChild(n);
      if (k > 0) subs.appendChild(document.createElement('br'));
      subs.appendChild(line);
    });
  }

  async function loadSub(sub: PlanSub | null) {
    if (!sub) {
      subId = null;
      cues = [];
      renderSubs();
      return;
    }
    subId = sub.id;
    let slow: ReturnType<typeof setTimeout> | undefined;
    if (!sub.external) slow = setTimeout(() => toast('Preparando subtítulos… la primera vez puede tardar un poco'), 1500);
    try {
      const text = await fetchText(subtitleUrl(conn, item.id, sub.id), 180000);
      if (subId !== sub.id) return;
      cues = parseVtt(text);
      if (!cues.length) toast('Este subtítulo está vacío');
    } catch (err) {
      if (subId === sub.id) {
        subId = null;
        toast(`No se pudo cargar el subtítulo: ${(err as Error).message}`);
      }
    } finally {
      if (slow) clearTimeout(slow);
    }
    renderSubs();
  }

  function autoSubtitles(p: VideoPlan) {
    const pref = getPrefs().sub;
    if (!pref) return;
    const audioLang = p.audio.filter((a) => a.active)[0];
    // Si el audio ya está en ese idioma no hacen falta subtítulos.
    if (audioLang && audioLang.lang && audioLang.lang === pref) return;
    const match = p.subs.filter((s) => s.lang === pref && !s.forced)[0] || p.subs.filter((s) => s.lang === pref)[0];
    if (match) void loadSub(match);
  }

  // ───────────── Menús dentro del reproductor ─────────────

  let popup: HTMLElement | null = null;
  const popupOpen = () => !!popup;

  function closePopup() {
    if (popup && popup.parentNode) popup.parentNode.removeChild(popup);
    popup = null;
    focus(progress);
    showControls();
  }

  function openPopup(heading: string, items: { label: string; checked: boolean; run: () => void }[]) {
    closePopup();
    popup = h(
      'div',
      { class: 'vp-popup', 'data-modal': '' },
      h(
        'div',
        { class: 'menu' },
        h('div', { class: 'menu-title' }, heading),
        items.map((it) =>
          h('div', { class: 'menu-item', focus: true, onclick: () => { closePopup(); it.run(); } }, it.checked ? icon('check', 32) : h('span', { style: { width: '32px', display: 'inline-block' } }), h('span', null, it.label)),
        ),
      ),
    );
    root.appendChild(popup);
    showControls();
    const checked = items.map((i) => i.checked).indexOf(true);
    const els = popup.querySelectorAll<HTMLElement>('[data-focus]');
    focus(els[checked >= 0 ? checked : 0]);
  }

  function openAudioMenu() {
    if (!plan) return;
    openPopup('Audio', plan.audio.map((a) => ({ label: a.label, checked: a.active, run: () => void start(position(), { audio: a.index }) })));
  }

  function openSubsMenu() {
    if (!plan) return;
    const items = [{ label: 'Sin subtítulos', checked: subId === null, run: () => { setPrefs({ sub: '' }); void loadSub(null); } }];
    for (const s of plan.subs) {
      items.push({ label: s.label, checked: subId === s.id, run: () => { setPrefs({ sub: s.lang }); void loadSub(s); } });
    }
    openPopup('Subtítulos', items);
  }

  /** Salida de emergencia: elegir a mano cómo se reproduce (si la imagen no se ve o falla el audio). */
  function openFormatMenu() {
    if (!plan) return;
    const current = plan.mode;
    const choose = (label: string, mode: PlayMode | undefined) => ({
      label,
      checked: mode === undefined ? !force && current === (attempts[0] ? attempts[0].mode : current) : force === mode,
      run: () => {
        force = mode;
        if (mode === undefined) {
          container = getPrefs().container;
          void start(position());
        } else {
          attempts = buildAttempts(mode);
          attemptIdx = 0;
          void start(position(), { fallback: true });
        }
      },
    });
    openPopup('Formato de reproducción', [
      choose('Automático (recomendado)', undefined),
      choose('Convertir el audio en el PC (copia la imagen)', 'remux'),
      choose('Convertir todo en el PC (máxima compatibilidad)', 'transcode'),
    ]);
  }

  // ───────────── Siguiente episodio ─────────────

  let nextOverlay: HTMLElement | null = null;

  function loadItem(it: TvVideo, ms: number) {
    persist();
    item = it;
    plan = null;
    audioIndex = undefined;
    force = undefined;
    cues = [];
    subId = null;
    clear(subs);
    started = false;
    void start(ms / 1000);
  }

  function clearNext() {
    if (nextTimer) clearInterval(nextTimer);
    nextTimer = undefined;
    if (nextOverlay && nextOverlay.parentNode) nextOverlay.parentNode.removeChild(nextOverlay);
    nextOverlay = null;
  }

  function goNext() {
    const next = app.videos.nextEpisode(item);
    if (!next) return;
    clearNext();
    loadItem(next, 0);
  }

  /** Canal −: vuelve al principio del episodio o, si apenas empezó, al anterior. */
  function goPrevious() {
    const prev = app.videos.previousEpisode(item);
    if (position() > 10 || !prev) seekTo(0);
    else {
      clearNext();
      loadItem(prev, 0);
    }
  }

  function showNext(next: TvVideo) {
    clearNext();
    let left = 10;
    const label = h('div', { class: 'vp-next-sub' });
    const tick = () => {
      label.textContent = `Empieza en ${left} s`;
      if (left-- <= 0) goNext();
    };
    nextOverlay = h(
      'div',
      { class: 'vp-next', 'data-modal': '' },
      h('div', { class: 'np-kicker' }, 'Siguiente episodio'),
      h('div', { class: 'vp-next-title' }, `T${next.season} E${next.episode}${next.title ? ` · ${next.title}` : ''}`),
      label,
      h(
        'div',
        { class: 'actions', 'data-group': 'next' },
        h('button', { class: 'btn primary big', focus: true, onclick: () => goNext() }, icon('play', 36), 'Reproducir ahora'),
        h('button', { class: 'btn big', focus: true, onclick: () => closeOverlay() }, 'Salir'),
      ),
    );
    root.appendChild(nextOverlay);
    tick();
    nextTimer = setInterval(tick, 1000);
    focus(nextOverlay.querySelector<HTMLElement>('[data-focus]'));
  }

  // ───────────── Teclas ─────────────

  const consume = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onKey = (e: KeyboardEvent) => {
    const k = e.keyCode;
    // Teclas multimedia del control remoto.
    if (k === KEY.PLAY_PAUSE) return consume(e), toggle();
    if (k === KEY.PLAY) return consume(e), video.paused ? toggle() : undefined;
    if (k === KEY.PAUSE || k === KEY.STOP) return consume(e), video.paused ? undefined : toggle();
    if (k === KEY.FAST_FORWARD) return consume(e), nudge(30);
    if (k === KEY.REWIND) return consume(e), nudge(-30);
    if (k === KEY.CH_UP) return consume(e), goNext();
    if (k === KEY.CH_DOWN) return consume(e), goPrevious();
    if (popupOpen() || nextOverlay) return;
    if (!controlsVisible) {
      if (k === KEY.OK) return consume(e), toggle();
      if (k === KEY.LEFT) return consume(e), nudge(-10);
      if (k === KEY.RIGHT) return consume(e), nudge(10);
      if (k === KEY.UP || k === KEY.DOWN) return consume(e), showControls(), focus(progress);
      return;
    }
    showControls();
  };

  // Atrás: cierra el menú o la cuenta atrás y, si no hay nada abierto, sale del reproductor.
  const onBack = (): boolean => {
    if (popup) {
      closePopup();
      return true;
    }
    if (nextOverlay) {
      clearNext();
      closeOverlay();
      return true;
    }
    return false;
  };

  const tickTimer = setInterval(() => {
    renderProgress();
    renderSubs();
    if (started && Date.now() - lastSave > 5000) {
      lastSave = Date.now();
      persist();
    }
  }, 250);

  root.addEventListener('mousemove', showControls);
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target === video || e.target === subs) toggle();
  });
  document.addEventListener('keydown', onKey, true);
  setBackHook(onBack);
  renderPlayState();
  renderProgress();
  void start(startMs / 1000);

  return {
    el: root,
    refreshOnClose: true,
    focus: () => focus(progress),
    destroy: () => {
      destroyed = true;
      persist();
      clearInterval(tickTimer);
      clearNext();
      if (seekTimer) clearTimeout(seekTimer);
      if (hideTimer) clearTimeout(hideTimer);
      if (watchdog) clearTimeout(watchdog);
      document.removeEventListener('keydown', onKey, true);
      setBackHook(null);
      // Soltar el video corta la conexión y el PC detiene la conversión.
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}
