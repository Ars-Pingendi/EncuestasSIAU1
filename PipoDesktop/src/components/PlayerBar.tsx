import type { MouseEvent } from 'react';
import { formatTime } from '../lib/format';
import { artistOf } from '../lib/group';
import { useStore } from '../lib/store';
import { data, toggleFavTrack } from '../state/data';
import { lookup } from '../state/library';
import {
  cycleRepeat, next, player, previous, seek, setSleepTimer, setVolume, toggleMute, togglePlay, toggleShuffle,
} from '../state/player';
import { navigate, openMenu, ui } from '../state/ui';
import { Artwork } from './Artwork';
import { Range, SeekBar } from './Common';
import { Icon, IconButton } from './Icon';
import { trackMenuItems } from './trackMenu';

export function sleepMenu(e: MouseEvent) {
  const s = player.get();
  const active = s.sleepEndsAt !== null || s.sleepEndOfTrack;
  openMenu(e, [
    ...[15, 30, 45, 60, 90].map((m) => ({ label: `${m} minutos`, icon: 'timer', run: () => setSleepTimer(m) })),
    { label: 'Al terminar la canción', icon: 'note', run: () => setSleepTimer('end') },
    ...(active ? [{ separator: true, label: '' }, { label: 'Cancelar temporizador', icon: 'close', danger: true, run: () => setSleepTimer(null) }] : []),
  ]);
}

export function PlayControls({ big }: { big?: boolean }) {
  const playing = useStore(player, (s) => s.playing);
  const loading = useStore(player, (s) => s.loading);
  const shuffle = useStore(player, (s) => s.shuffle);
  const repeat = useStore(player, (s) => s.repeat);
  const hasQueue = useStore(player, (s) => s.queue.length > 0);
  return (
    <div className={`controls ${big ? 'big' : ''}`}>
      <IconButton name="shuffle" label="Aleatorio" active={shuffle} onClick={toggleShuffle} size={big ? 26 : 20} />
      <IconButton name="prev" label="Anterior (Ctrl+←)" onClick={() => void previous()} size={big ? 34 : 26} disabled={!hasQueue} />
      <button type="button" className={`play-btn ${loading ? 'loading' : ''}`} title={playing ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'} onClick={() => void togglePlay()}>
        <Icon name={playing ? 'pause' : 'play'} size={big ? 40 : 28} />
      </button>
      <IconButton name="next" label="Siguiente (Ctrl+→)" onClick={() => void next()} size={big ? 34 : 26} disabled={!hasQueue} />
      <IconButton
        name={repeat === 'one' ? 'repeatOne' : 'repeat'}
        label={repeat === 'off' ? 'Repetir: no' : repeat === 'all' ? 'Repetir: toda la cola' : 'Repetir: esta canción'}
        active={repeat !== 'off'}
        onClick={cycleRepeat}
        size={big ? 26 : 20}
      />
    </div>
  );
}

export function VolumeControl() {
  const volume = useStore(player, (s) => s.volume);
  const muted = useStore(player, (s) => s.muted);
  return (
    <div className="volume">
      <IconButton name={muted || volume === 0 ? 'volumeOff' : 'volume'} label={muted ? 'Activar sonido (M)' : 'Silenciar (M)'} onClick={toggleMute} size={20} />
      <Range label={`Volumen ${Math.round(volume * 100)} %`} value={muted ? 0 : Math.round(volume * 100)} onChange={(v) => setVolume(v / 100)} className="vol-range" />
    </div>
  );
}

export function PlayerBar() {
  const id = useStore(player, (s) => s.queue[s.index]);
  const position = useStore(player, (s) => s.position);
  const duration = useStore(player, (s) => s.duration);
  const sleep = useStore(player, (s) => s.sleepEndsAt !== null || s.sleepEndOfTrack);
  const queueOpen = useStore(ui, (s) => s.queueOpen);
  const favs = useStore(data, (s) => s.user.favTracks);
  const t = id ? lookup(id) : undefined;
  const fav = t ? favs.includes(t.id) : false;

  return (
    <footer className="player-bar">
      <div className="now">
        {t ? (
          <>
            <button type="button" className="now-art" title="Abrir reproductor" onClick={() => ui.set({ nowPlaying: true })}>
              <Artwork track={t} seed={t.album || t.title} size={56} />
            </button>
            <div className="now-text" onContextMenu={(e) => (e.preventDefault(), openMenu(e, trackMenuItems(t)))}>
              <button type="button" className="t1 link" onClick={() => ui.set({ nowPlaying: true })} title={t.title}>{t.title}</button>
              <button
                type="button"
                className="t2 link"
                onClick={() => t.source === 'local' && navigate({ view: 'artist', key: artistOf(t).toLowerCase() })}
              >
                {artistOf(t)}
              </button>
            </div>
            <IconButton name={fav ? 'heart' : 'heartOutline'} label={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'} active={fav} onClick={() => toggleFavTrack(t)} size={20} />
          </>
        ) : (
          <div className="muted nothing">Elige una canción para empezar</div>
        )}
      </div>
      <div className="center">
        <PlayControls />
        <div className="seek-row">
          <span className="time">{formatTime(position)}</span>
          <SeekBar position={position} duration={duration} onSeek={seek} />
          <span className="time">{formatTime(duration)}</span>
        </div>
      </div>
      <div className="right">
        <IconButton name="timer" label="Temporizador de apagado" active={sleep} onClick={sleepMenu} size={20} />
        <IconButton name="equalizer" label="Ecualizador" onClick={() => navigate({ view: 'equalizer' })} size={20} />
        <IconButton name="queue" label="Cola de reproducción" active={queueOpen} onClick={() => ui.set({ queueOpen: !queueOpen })} size={20} />
        <VolumeControl />
      </div>
    </footer>
  );
}
