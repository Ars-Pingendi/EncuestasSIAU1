import { useEffect, useMemo, useRef, useState } from 'react';
import type { Track, YtItem } from '../../shared/types';
import { api } from '../api';
import { Empty, Segmented, ViewTitle } from '../components/Common';
import { Icon } from '../components/Icon';
import { TrackList } from '../components/TrackList';
import { plural } from '../lib/format';
import { useStore } from '../lib/store';
import { data, updateSettings } from '../state/data';
import { lib } from '../state/library';
import { navigate } from '../state/ui';

function toTrack(item: YtItem): Track {
  return {
    id: `yt:${item.videoId}`,
    source: 'youtube',
    videoId: item.videoId,
    title: item.title,
    artist: item.artist,
    album: item.album || (item.kind === 'video' ? 'YouTube' : ''),
    albumArtist: '',
    genre: '',
    trackNo: 0,
    discNo: 0,
    year: 0,
    durationMs: item.durationMs,
    folder: '',
    fileName: '',
    addedAt: Date.now(),
    size: 0,
    artworkUrl: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
  };
}

// Los resultados se conservan al cambiar de pantalla.
let lastQuery = '';
let lastResults: Track[] = [];
let lastKind: 'songs' | 'videos' = 'songs';

export function YouTubeView() {
  const kind = useStore(data, (s) => s.settings.ytKind);
  const [q, setQ] = useState(() => sessionStorage.getItem('pipo:ytq') ?? lastQuery);
  const [results, setResults] = useState<Track[]>(lastKind === kind ? lastResults : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const downloads = useStore(lib, (s) => s.downloads);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.appInfo().then((i) => setAvailable(i.ytdlpAvailable));
    const pending = sessionStorage.getItem('pipo:ytq');
    sessionStorage.removeItem('pipo:ytq');
    if (pending) void search(pending, kind);
    else input.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async (text: string, k: 'songs' | 'videos') => {
    const query = text.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const items = await api.ytSearch(query, k);
      const tracks = items.map(toTrack);
      lastQuery = query;
      lastResults = tracks;
      lastKind = k;
      setResults(tracks);
      if (!tracks.length) setError('No hubo resultados.');
    } catch (err) {
      setError((err as Error).message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || 'No se pudo buscar en YouTube.');
    } finally {
      setLoading(false);
    }
  };

  const dlCount = downloads.size;
  const hint = useMemo(() => (kind === 'songs' ? 'Canciones de YouTube Music' : 'Videos de YouTube (solo el audio)'), [kind]);

  return (
    <div className="view">
      <ViewTitle title="YouTube" count={hint}>
        <button type="button" className="btn outline" onClick={() => navigate({ view: 'smart', id: 'downloads' })}>
          <Icon name="downloadDone" size={20} /> Descargadas ({dlCount})
        </button>
      </ViewTitle>
      <form
        className="yt-search"
        onSubmit={(e) => {
          e.preventDefault();
          void search(q, kind);
        }}
      >
        <div className="search-box big">
          <Icon name="search" size={22} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca una canción, un artista o un video" aria-label="Buscar en YouTube" />
        </div>
        <Segmented
          value={kind}
          onChange={(k) => {
            updateSettings({ ytKind: k });
            if (q.trim()) void search(q, k);
          }}
          options={[{ value: 'songs', label: 'Canciones' }, { value: 'videos', label: 'Videos' }]}
        />
        <button type="submit" className="btn filled" disabled={loading || !q.trim()}>
          {loading ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {!available && (
        <div className="notice warn">
          <Icon name="info" size={20} /> Falta el componente de YouTube (yt-dlp). Reinstala la app o actualízalo desde Ajustes.
        </div>
      )}
      {error && <div className="notice">{error}</div>}
      {loading && !results.length ? (
        <div className="loading-block"><div className="spinner" /> Buscando en YouTube…</div>
      ) : results.length ? (
        <>
          <div className="muted small yt-count">
            {plural(results.length, 'resultado', 'resultados')} · doble clic para escuchar · clic derecho para descargar, agregar a una lista o a favoritos
          </div>
          <TrackList tracks={results} />
        </>
      ) : (
        !error && (
          <Empty
            icon="youtube"
            title="Escucha YouTube sin anuncios"
            text="Busca canciones o videos: Pipo reproduce solo el audio, en segundo plano y con tu ecualizador. Puedes guardarlas en listas y favoritos o descargarlas para escuchar sin internet."
          />
        )
      )}
      <p className="legal muted small">
        Esta función usa la API pública de YouTube sin iniciar sesión y puede dejar de funcionar si YouTube cambia algo (la solución suele ser «Actualizar componente de YouTube» en Ajustes).
        Incumple los términos de uso de YouTube; respetar los derechos de autor de lo que se descarga es responsabilidad de quien usa la app.
      </p>
    </div>
  );
}
