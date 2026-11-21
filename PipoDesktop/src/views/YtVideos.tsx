// «Videos descargados»: los videos de YouTube guardados en MP4 para verlos sin internet.
import { useMemo } from 'react';
import { api } from '../api';
import { Empty, ViewTitle } from '../components/Common';
import { Icon } from '../components/Icon';
import { VideoGrid } from '../components/VideoGrid';
import { formatBytes, plural } from '../lib/format';
import { useStore } from '../lib/store';
import { navigate } from '../state/ui';
import { videos, videoTrack } from '../state/videos';

export function YtVideosView() {
  const { downloads, state } = useStore(videos, (s) => s);
  const list = useMemo(() => [...downloads.values()].sort((a, b) => b.downloadedAt - a.downloadedAt), [downloads]);
  const tracks = useMemo(() => list.map(videoTrack), [list]);
  const size = useMemo(() => list.reduce((s, d) => s + d.size, 0), [list]);
  const pending = Object.values(state).filter((e) => !downloads.has(e.videoId) && (e.state === 'queued' || e.state === 'running')).length;
  return (
    <div className="view">
      <ViewTitle title="Videos descargados" count={list.length ? `${plural(list.length, 'video', 'videos')} · ${formatBytes(size)}` : undefined}>
        <button type="button" className="btn outline" onClick={() => void api.ytOpenVideosFolder()}>
          <Icon name="folder" size={20} /> Abrir la carpeta
        </button>
        <button type="button" className="btn outline" onClick={() => navigate({ view: 'youtube' })}>
          <Icon name="search" size={20} /> Buscar videos
        </button>
      </ViewTitle>
      {pending > 0 && (
        <div className="notice">
          <div className="spinner small" /> {plural(pending, 'video descargándose', 'videos descargándose')}: aparecerán aquí al terminar.
        </div>
      )}
      {tracks.length ? (
        <>
          <div className="muted small yt-count">
            Se ven sin internet · doble clic para verlo · clic derecho para más opciones. Quedan en la carpeta Videos › Pipo Music Player, y la TV también los muestra en «Películas».
          </div>
          <VideoGrid tracks={tracks} label="Videos descargados" />
        </>
      ) : (
        <Empty
          icon="movie"
          title="Aún no has descargado videos"
          text="En YouTube, cambia a «Videos», busca y pulsa el botón de descarga de un video (o clic derecho › «Descargar el video»). Se guarda en MP4 hasta 1080p para verlo sin internet."
        />
      )}
    </div>
  );
}
