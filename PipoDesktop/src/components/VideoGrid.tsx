// Cuadrícula de videos de YouTube: miniatura, duración y botones para ver, escuchar, descargar
// (MP4) o mandar a la TV. Se usa en la búsqueda de videos y en «Videos descargados».
import type { Track } from '../../shared/types';
import { api } from '../api';
import { formatTime } from '../lib/format';
import { useStore } from '../lib/store';
import { sendToTv, tvSharing } from '../lib/tv';
import { playTracks } from '../state/player';
import { openMenu } from '../state/ui';
import { downloadVideo, videos } from '../state/videos';
import { Icon, IconButton } from './Icon';
import { trackMenuItems } from './trackMenu';
import { openVideo } from './VideoPlayer';

export function VideoGrid({ tracks, toTv = false, label }: { tracks: Track[]; toTv?: boolean; label: string }) {
  const { downloads, state } = useStore(videos, (s) => s);
  const tv = tvSharing();
  const watch = (t: Track) => (toTv ? void sendToTv('video', [t]) : openVideo(t));
  return (
    <div className="vgrid" role="list" aria-label={label}>
      {tracks.map((t, i) => {
        const id = t.videoId!;
        const done = downloads.has(id);
        const st = state[id];
        const busy = !done && (st?.state === 'queued' || st?.state === 'running');
        const pct = Math.round((st?.progress ?? 0) * 100);
        return (
          <div
            key={t.id}
            className="vcard"
            role="listitem"
            tabIndex={0}
            title={`${t.title}\nDoble clic: ${toTv ? 'ver en la TV' : 'ver el video'}`}
            onDoubleClick={() => watch(t)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') watch(t);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu(e, trackMenuItems(t, { list: tracks, index: i }));
            }}
          >
            <div className="vcard-thumb">
              {t.artworkUrl ? <img src={t.artworkUrl} alt="" loading="lazy" draggable={false} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <Icon name="youtube" size={48} className="vcard-ph" />}
              {t.durationMs > 0 && <span className="vcard-dur">{formatTime(t.durationMs)}</span>}
              {done && (
                <span className="vcard-badge" title="Descargado: se ve sin internet">
                  <Icon name="downloadDone" size={15} /> Sin internet
                </span>
              )}
              <button type="button" className="vcard-play" aria-label={toTv ? 'Ver en la TV' : 'Ver el video'} onClick={() => watch(t)}>
                <Icon name={toTv ? 'tv' : 'play'} size={30} />
              </button>
              {busy && (
                <div className="vcard-progress" aria-label={`Descargando ${pct} %`}>
                  <div style={{ width: `${Math.max(3, pct)}%` }} />
                </div>
              )}
            </div>
            <div className="vcard-info">
              <div className="vcard-title">{t.title}</div>
              <div className="vcard-sub">{t.artist}</div>
            </div>
            <div className="vcard-actions">
              <IconButton name="note" size={20} label="Escuchar (solo audio, en segundo plano)" onClick={() => playTracks(tracks, i)} />
              {done ? (
                <IconButton name="folder" size={20} label="Mostrar el archivo en la carpeta" onClick={() => void api.ytShowVideoInFolder(id)} />
              ) : busy ? (
                <button type="button" className="vcard-dl busy" title="Cancelar la descarga" onClick={() => void api.ytCancelVideoDownload(id)}>
                  {st?.state === 'queued' ? 'En espera' : `${pct} %`} <Icon name="close" size={16} />
                </button>
              ) : (
                <IconButton name="download" size={20} label="Descargar el video (MP4 hasta 1080p)" onClick={() => downloadVideo(t)} />
              )}
              {tv && !toTv && <IconButton name="tv" size={20} label="Ver en la TV" onClick={() => void sendToTv('video', [t])} />}
              <div className="grow" />
              <IconButton name="more" size={20} label="Más opciones" onClick={(e) => openMenu(e, trackMenuItems(t, { list: tracks, index: i }))} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
