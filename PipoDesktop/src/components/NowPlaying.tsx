import { useEffect, useRef } from 'react';
import { artUrl } from '../api';
import { engine } from '../audio/engine';
import { formatTime } from '../lib/format';
import { artistOf, albumKey } from '../lib/group';
import { useStore } from '../lib/store';
import { data, toggleFavTrack } from '../state/data';
import { eq } from '../state/eq';
import { lib, lookup } from '../state/library';
import { player, seek } from '../state/player';
import { navigate, openMenu, ui } from '../state/ui';
import { Artwork } from './Artwork';
import { SeekBar } from './Common';
import { openAddToPlaylist } from './Dialogs';
import { IconButton } from './Icon';
import { PlayControls, sleepMenu, VolumeControl } from './PlayerBar';
import { trackMenuItems } from './trackMenu';

function Visualizer() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let bins: Uint8Array<ArrayBuffer> | null = null;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current;
      const an = engine.analyser;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      const w = (c.width = c.clientWidth * devicePixelRatio);
      const h = (c.height = c.clientHeight * devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      if (!an) return;
      if (!bins || bins.length !== an.frequencyBinCount) bins = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(bins);
      const bars = 48;
      const gap = 3 * devicePixelRatio;
      const bw = (w - gap * (bars - 1)) / bars;
      const style = getComputedStyle(c);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, style.getPropertyValue('--primary') || '#bba9ff');
      grad.addColorStop(1, style.getPropertyValue('--accent') || '#4dd9c0');
      ctx.fillStyle = grad;
      const nyq = an.context.sampleRate / 2;
      for (let i = 0; i < bars; i++) {
        // Escala logarítmica de 30 Hz a 16 kHz.
        const f0 = 30 * Math.pow(16000 / 30, i / bars);
        const f1 = 30 * Math.pow(16000 / 30, (i + 1) / bars);
        const a = Math.floor((f0 / nyq) * bins.length);
        const b = Math.max(a + 1, Math.floor((f1 / nyq) * bins.length));
        let m = 0;
        for (let k = a; k < b && k < bins.length; k++) m = Math.max(m, bins[k]);
        const bh = Math.max(2 * devicePixelRatio, (m / 255) * h);
        const x = i * (bw + gap);
        ctx.beginPath();
        ctx.roundRect(x, h - bh, bw, bh, Math.min(bw / 2, 4 * devicePixelRatio));
        ctx.fill();
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvas} className="visualizer" aria-hidden="true" />;
}

export function NowPlaying() {
  const open = useStore(ui, (s) => s.nowPlaying);
  const id = useStore(player, (s) => s.queue[s.index]);
  const position = useStore(player, (s) => s.position);
  const duration = useStore(player, (s) => s.duration);
  const queueLen = useStore(player, (s) => s.queue.length);
  const index = useStore(player, (s) => s.index);
  const sleep = useStore(player, (s) => s.sleepEndsAt !== null || s.sleepEndOfTrack);
  const favs = useStore(data, (s) => s.user.favTracks);
  const eqOn = useStore(eq, (s) => s.enabled);
  const eqPreset = useStore(eq, (s) => s.preset);
  useStore(lib, (s) => s.byId);
  if (!open) return null;
  const t = id ? lookup(id) : undefined;
  const bg = artUrl(t);
  const fav = t ? favs.includes(t.id) : false;
  return (
    <div className="now-playing">
      {bg && <div className="np-bg" style={{ backgroundImage: `url("${bg}")` }} />}
      <div className="np-top">
        <IconButton name="expandMore" label="Cerrar (Esc)" onClick={() => ui.set({ nowPlaying: false })} size={28} />
        <div className="grow drag" />
      </div>
      {t ? (
        <div className="np-main">
          <Artwork track={t} seed={t.album || t.title} className="np-art" />
          <div className="np-side">
            <div className="np-titles">
              <h1 title={t.title}>{t.title}</h1>
              <button type="button" className="link np-artist" onClick={() => t.source === 'local' && navigate({ view: 'artist', key: artistOf(t).toLowerCase() })}>
                {artistOf(t)}
              </button>
              {t.album && (
                <button type="button" className="link np-album" onClick={() => t.source === 'local' && navigate({ view: 'album', key: albumKey(t) })}>
                  {t.album}
                  {t.year ? ` · ${t.year}` : ''}
                </button>
              )}
              <div className="muted small">
                Canción {index + 1} de {queueLen}
                {eqOn ? ` · Ecualizador: ${eqPreset ?? 'personalizado'}` : ''}
              </div>
            </div>
            <Visualizer />
            <div className="np-seek">
              <SeekBar position={position} duration={duration} onSeek={seek} />
              <div className="np-times">
                <span>{formatTime(position)}</span>
                <span>-{formatTime(Math.max(0, duration - position))}</span>
              </div>
            </div>
            <PlayControls big />
            <div className="np-actions">
              <IconButton name={fav ? 'heart' : 'heartOutline'} label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'} active={fav} onClick={() => toggleFavTrack(t)} />
              <IconButton name="playlistAdd" label="Agregar a una lista" onClick={() => openAddToPlaylist([t])} />
              <IconButton name="equalizer" label="Ecualizador" onClick={() => navigate({ view: 'equalizer' })} />
              <IconButton name="timer" label="Temporizador de apagado" active={sleep} onClick={sleepMenu} />
              <IconButton name="queue" label="Cola" onClick={() => ui.set({ queueOpen: !ui.get().queueOpen })} />
              <IconButton name="more" label="Más opciones" onClick={(e) => openMenu(e, trackMenuItems(t))} />
              <div className="grow" />
              <VolumeControl />
            </div>
          </div>
        </div>
      ) : (
        <div className="np-main empty">Nada en reproducción</div>
      )}
    </div>
  );
}
