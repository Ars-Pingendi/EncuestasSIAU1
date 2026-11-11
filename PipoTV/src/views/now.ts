// «Reproduciendo» a pantalla completa y la cola de reproducción.
import { engine } from '../audio';
import { lazyImage } from '../components/images';
import { TrackList } from '../components/tracklist';
import { clear, formatTime, h, icon, plural } from '../dom';
import { artistOf } from '../library';
import { setKeyOwner, type Dir } from '../nav';
import { app, art, current, cycleRepeat, eq, jump, next, player, previous, seekBy, togglePlay, toggleShuffle } from '../state';
import { closeOverlay, navigate, type View } from '../ui';

export function nowPlayingView(): View {
  const artBox = h('div', { class: 'np-art-box' });
  const bg = h('div', { class: 'np-bg' });
  const title = h('div', { class: 'np-title' });
  const artist = h('div', { class: 'np-artist' });
  const album = h('div', { class: 'np-album' });
  const fill = h('div', { class: 'np-fill' });
  const knob = h('div', { class: 'np-knob' });
  const times = h('div', { class: 'np-times' });
  const extra = h('div', { class: 'np-extra' });
  const playBtn = h('button', { class: 'np-btn big', focus: true, onclick: () => togglePlay() });
  const shuffleBtn = h('button', { class: 'np-btn', focus: true, onclick: () => toggleShuffle() }, icon('shuffle', 44));
  const repeatBtn = h('button', { class: 'np-btn', focus: true, onclick: () => cycleRepeat() });
  const progress = h('div', { class: 'np-progress', focus: true, 'data-owner': '' }, h('div', { class: 'np-track' }, fill, knob));
  setKeyOwner(progress, {
    handleKey(dir: Dir) {
      if (dir === 'left' || dir === 'right') {
        seekBy(dir === 'right' ? 10000 : -10000);
        return true;
      }
      return false;
    },
  });
  const canvas = h('canvas', { class: 'np-viz', width: 900, height: 120 }) as HTMLCanvasElement;
  let lastId = '';
  let raf = 0;

  const el = h(
    'div',
    { class: 'now' },
    bg,
    h(
      'div',
      { class: 'np-main' },
      artBox,
      h(
        'div',
        { class: 'np-side' },
        h('div', { class: 'np-kicker' }, 'Reproduciendo'),
        title,
        artist,
        album,
        extra,
        canvas,
        progress,
        times,
        h(
          'div',
          { class: 'np-controls', 'data-group': 'np' },
          shuffleBtn,
          h('button', { class: 'np-btn', focus: true, onclick: () => previous() }, icon('prev', 56)),
          playBtn,
          h('button', { class: 'np-btn', focus: true, onclick: () => next() }, icon('next', 56)),
          repeatBtn,
          h('button', { class: 'np-btn text', focus: true, onclick: () => (closeOverlay(false), navigate({ view: 'queue' }, true)) }, icon('queue', 40), 'Cola'),
          h('button', { class: 'np-btn text', focus: true, onclick: () => (closeOverlay(false), navigate({ view: 'equalizer' }, true)) }, icon('equalizer', 40), 'Ecualizador'),
        ),
        h('div', { class: 'np-hint' }, '◀ ▶ sobre la barra: adelantar o retroceder 10 s · Atrás: volver'),
      ),
    ),
  );

  const draw = () => {
    raf = requestAnimationFrame(draw);
    const an = engine.analyser;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!an) return;
    const bins = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(bins);
    const bars = 48;
    const gap = 6;
    const bw = (canvas.width - gap * (bars - 1)) / bars;
    const nyq = an.context.sampleRate / 2;
    for (let i = 0; i < bars; i++) {
      const f0 = 30 * Math.pow(16000 / 30, i / bars);
      const f1 = 30 * Math.pow(16000 / 30, (i + 1) / bars);
      const a = Math.floor((f0 / nyq) * bins.length);
      const b = Math.max(a + 1, Math.floor((f1 / nyq) * bins.length));
      let m = 0;
      for (let k = a; k < b && k < bins.length; k++) m = Math.max(m, bins[k]);
      const bh = Math.max(4, (m / 255) * canvas.height);
      ctx.fillStyle = i % 2 ? '#bba9ff' : '#9d86ff';
      ctx.fillRect(i * (bw + gap), canvas.height - bh, bw, bh);
    }
  };

  const update = () => {
    const t = current();
    if (t && t.id !== lastId) {
      lastId = t.id;
      clear(artBox);
      artBox.appendChild(lazyImage(art(t), t.album || t.title, 'np-art', 'note'));
      const src = art(t);
      bg.style.backgroundImage = src ? `url("${src}")` : 'none';
    }
    title.textContent = t ? t.title : 'Nada en reproducción';
    artist.textContent = t ? artistOf(t) : '';
    album.textContent = t ? [t.album, t.year ? String(t.year) : ''].filter(Boolean).join(' · ') : '';
    extra.textContent = t
      ? `Canción ${player.index + 1} de ${player.queue.length}${eq.enabled ? ` · Ecualizador: ${eq.preset || 'personalizado'}` : ''} · desde ${app.library.name}`
      : '';
    const pct = player.duration > 0 ? Math.min(100, (player.position / player.duration) * 100) : 0;
    fill.style.width = `${pct}%`;
    knob.style.left = `${pct}%`;
    times.textContent = `${formatTime(player.position)}  /  ${formatTime(player.duration)}`;
    clear(playBtn);
    playBtn.appendChild(icon(player.playing ? 'pause' : 'play', 80));
    clear(repeatBtn);
    repeatBtn.appendChild(icon(player.repeat === 'one' ? 'repeatOne' : 'repeat', 44));
    repeatBtn.classList.toggle('on', player.repeat !== 'off');
    shuffleBtn.classList.toggle('on', player.shuffle);
  };
  update();
  draw();
  return {
    el,
    focus: () => playBtn.focus(),
    update,
    destroy: () => cancelAnimationFrame(raf),
  };
}

export function queueView(): View {
  const tracks = app.library.resolve(player.queue);
  const list = new TrackList(tracks, {
    onPlay: (i) => jump(i),
    currentIndex: () => player.index,
    emptyText: 'La cola está vacía. Pulsa OK en cualquier canción para empezar.',
  });
  return {
    el: h(
      'div',
      { class: 'view list-view' },
      h('div', { class: 'view-head small' }, h('h1', null, 'Cola de reproducción'), h('div', { class: 'head-sub' }, plural(tracks.length, 'canción', 'canciones'))),
      list.el,
    ),
    focus: () => (tracks.length ? list.focusIndex(Math.max(0, player.index)) : undefined),
    update: () => list.refreshCurrent(),
  };
}
