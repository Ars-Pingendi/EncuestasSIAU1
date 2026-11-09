import { useMemo, useState } from 'react';
import type { Track } from '../../shared/types';
import { Card, Empty, PageHeader, Segmented, ViewTitle } from '../components/Common';
import { ConfirmDialog, openAddToPlaylist, openNewPlaylist, PromptDialog } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { TrackList } from '../components/TrackList';
import { exportTracks } from '../components/trackMenu';
import { formatBytes, formatLong, plural } from '../lib/format';
import { useStore } from '../lib/store';
import { data, deletePlaylist, movePlaylistItem, renamePlaylist } from '../state/data';
import { lib, resolveIds } from '../state/library';
import { playTracks } from '../state/player';
import { navigate, openDialog, toast, type SmartId } from '../state/ui';
import { AlbumGrid, PlayButtons } from './Library';

export function FavoritesView() {
  const [tab, setTab] = useState<'songs' | 'albums'>('songs');
  const favTracks = useStore(data, (s) => s.user.favTracks);
  const favAlbums = useStore(data, (s) => s.user.favAlbums);
  const byId = useStore(lib, (s) => s.byId);
  const albumByKey = useStore(lib, (s) => s.albumByKey);
  const tracks = useMemo(() => resolveIds(favTracks), [favTracks, byId]);
  const albums = useMemo(() => favAlbums.map((k) => albumByKey.get(k)).filter((a) => !!a), [favAlbums, albumByKey]);
  return (
    <div className="view">
      <ViewTitle title="Favoritos" count={tab === 'songs' ? plural(tracks.length, 'canción', 'canciones') : plural(albums.length, 'álbum', 'álbumes')}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'songs', label: 'Canciones' }, { value: 'albums', label: 'Álbumes' }]} />
        {tab === 'songs' && <PlayButtons tracks={tracks} />}
      </ViewTitle>
      {tab === 'songs' ? (
        tracks.length ? <TrackList tracks={tracks} /> : <Empty icon="heartOutline" title="Aún no tienes canciones favoritas" text="Toca el corazón de cualquier canción para guardarla aquí." />
      ) : albums.length ? (
        <AlbumGrid albums={albums} />
      ) : (
        <Empty icon="heartOutline" title="Aún no tienes álbumes favoritos" text="Abre un álbum y toca «Favorito»." />
      )}
    </div>
  );
}

const SMART: Record<SmartId, { title: string; icon: string; text: string }> = {
  recent: { title: 'Agregadas recientemente', icon: 'newRelease', text: 'Las últimas canciones que llegaron a tu biblioteca.' },
  top: { title: 'Más reproducidas', icon: 'trending', text: 'Tus canciones con más reproducciones.' },
  played: { title: 'Reproducidas recientemente', icon: 'history', text: 'Lo último que escuchaste.' },
  downloads: { title: 'Descargadas de YouTube', icon: 'downloadDone', text: 'Disponibles sin conexión a internet.' },
};

export function useSmartTracks(id: SmartId): Track[] {
  const tracks = useStore(lib, (s) => s.tracks);
  const downloads = useStore(lib, (s) => s.downloads);
  const stats = useStore(data, (s) => s.user.stats);
  return useMemo(() => {
    if (id === 'recent') return [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 100);
    if (id === 'downloads') return [...downloads.values()].sort((a, b) => b.downloadedAt - a.downloadedAt).map((d) => d.track);
    const entries = Object.entries(stats).filter(([, v]) => v.plays > 0);
    if (id === 'top') entries.sort((a, b) => b[1].plays - a[1].plays || b[1].last - a[1].last);
    else entries.sort((a, b) => b[1].last - a[1].last);
    return resolveIds(entries.slice(0, 100).map(([k]) => k));
  }, [id, tracks, downloads, stats]);
}

export function SmartView({ id }: { id: SmartId }) {
  const meta = SMART[id];
  const tracks = useSmartTracks(id);
  const downloads = useStore(lib, (s) => s.downloads);
  const size = useMemo(() => [...downloads.values()].reduce((s, d) => s + d.size, 0), [downloads]);
  return (
    <div className="view">
      <PageHeader
        kicker="Lista automática"
        title={meta.title}
        seed={meta.title}
        icon={meta.icon}
        subtitle={
          <>
            {meta.text} {plural(tracks.length, 'canción', 'canciones')}
            {id === 'downloads' && tracks.length ? ` · ${formatBytes(size)}` : ''}
          </>
        }
        actions={
          <PlayButtons
            tracks={tracks}
            extra={
              <>
                <button type="button" className="btn outline" disabled={!tracks.length} onClick={() => openAddToPlaylist(tracks)}>
                  <Icon name="playlistAdd" size={20} /> Agregar a lista
                </button>
                {id === 'downloads' && (
                  <button type="button" className="btn outline" disabled={!tracks.length} onClick={() => void exportTracks(tracks)}>
                    <Icon name="share" size={20} /> Guardar copias en una carpeta…
                  </button>
                )}
              </>
            }
          />
        }
      />
      <TrackList
        tracks={tracks}
        empty={id === 'downloads' ? 'Aún no has descargado canciones. En YouTube, abre el menú de una canción y elige «Descargar».' : 'Todavía no hay canciones aquí.'}
      />
    </div>
  );
}

export function PlaylistsView() {
  const playlists = useStore(data, (s) => s.user.playlists);
  const byId = useStore(lib, (s) => s.byId);
  void byId;
  const smartIds: SmartId[] = ['recent', 'top', 'played', 'downloads'];
  return (
    <div className="view">
      <ViewTitle title="Listas" count={plural(playlists.length, 'lista', 'listas')}>
        <button type="button" className="btn filled" onClick={() => openNewPlaylist([], (id) => navigate({ view: 'playlist', id }))}>
          <Icon name="add" size={20} /> Nueva lista
        </button>
      </ViewTitle>
      <h2 className="section-title">Mis listas</h2>
      {playlists.length ? (
        <div className="grid">
          {playlists.map((p) => {
            const tracks = resolveIds(p.trackIds);
            return (
              <Card
                key={p.id}
                title={p.name}
                subtitle={plural(p.trackIds.length, 'canción', 'canciones')}
                cover={tracks.find((t) => t.artId || t.artworkUrl) ?? null}
                seed={p.name}
                icon="playlist"
                onOpen={() => navigate({ view: 'playlist', id: p.id })}
                onPlay={tracks.length ? () => playTracks(tracks, 0, { shuffle: false }) : undefined}
              />
            );
          })}
        </div>
      ) : (
        <Empty icon="playlist" title="Aún no tienes listas" text="Crea una y agrega canciones desde su menú (clic derecho)." />
      )}
      <h2 className="section-title">Listas automáticas</h2>
      <div className="grid">
        {smartIds.map((id) => (
          <Card key={id} title={SMART[id].title} subtitle={SMART[id].text} seed={SMART[id].title} icon={SMART[id].icon} cover={null} onOpen={() => navigate({ view: 'smart', id })} />
        ))}
      </div>
    </div>
  );
}

export function PlaylistView({ id }: { id: string }) {
  const playlist = useStore(data, (s) => s.user.playlists.find((p) => p.id === id));
  const byId = useStore(lib, (s) => s.byId);
  const downloads = useStore(lib, (s) => s.downloads);
  const remote = useStore(data, (s) => s.user.remote);
  const tracks = useMemo(() => (playlist ? resolveIds(playlist.trackIds) : []), [playlist, byId, downloads, remote]);
  if (!playlist) return <Empty title="Lista no encontrada" />;
  const missing = playlist.trackIds.length - tracks.length;
  // Si faltan canciones (archivos movidos), los índices de la lista no coinciden: se reordena por id.
  const reorder = (from: number, to: number) => {
    if (!missing) return movePlaylistItem(playlist.id, from, to);
    const fromIdx = playlist.trackIds.indexOf(tracks[from].id);
    const toIdx = playlist.trackIds.indexOf(tracks[to].id);
    movePlaylistItem(playlist.id, fromIdx, toIdx);
  };
  return (
    <div className="view">
      <PageHeader
        kicker="Lista"
        title={playlist.name}
        cover={tracks.find((t) => t.artId || t.artworkUrl) ?? null}
        seed={playlist.name}
        icon="playlist"
        subtitle={
          <>
            {plural(tracks.length, 'canción', 'canciones')} · {formatLong(tracks.reduce((s, t) => s + t.durationMs, 0))}
            {missing > 0 ? ` · ${plural(missing, 'canción no disponible', 'canciones no disponibles')}` : ''}
          </>
        }
        actions={
          <PlayButtons
            tracks={tracks}
            extra={
              <>
                <button type="button" className="btn outline" disabled={!tracks.length} onClick={() => void exportTracks(tracks)}>
                  <Icon name="share" size={20} /> Guardar copias…
                </button>
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => openDialog(<PromptDialog title="Cambiar nombre" label="Nombre de la lista" initial={playlist.name} confirm="Guardar" onSubmit={(n) => renamePlaylist(playlist.id, n)} />)}
                >
                  <Icon name="edit" size={20} /> Renombrar
                </button>
                <button
                  type="button"
                  className="btn outline danger"
                  onClick={() =>
                    openDialog(
                      <ConfirmDialog
                        title="Eliminar lista"
                        text={`¿Eliminar «${playlist.name}»? Las canciones no se borran de tu equipo.`}
                        confirm="Eliminar"
                        onConfirm={() => {
                          deletePlaylist(playlist.id);
                          navigate({ view: 'playlists' });
                          toast('Lista eliminada');
                        }}
                      />,
                    )
                  }
                >
                  <Icon name="delete" size={20} /> Eliminar
                </button>
              </>
            }
          />
        }
      />
      <TrackList
        tracks={tracks}
        playlistId={missing ? undefined : playlist.id}
        onReorder={reorder}
        empty="Esta lista está vacía. Agrega canciones con clic derecho → «Agregar a una lista…»."
      />
      {tracks.length > 1 && <div className="hint muted small">Arrastra las canciones para cambiar el orden.</div>}
    </div>
  );
}
