import { useMemo } from 'react';
import { api } from '../api';
import { Card, Empty, PageHeader, ViewTitle } from '../components/Common';
import { openAddToPlaylist } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { TrackList } from '../components/TrackList';
import { collator, formatLong, plural } from '../lib/format';
import { sortTracks, type Album, type SongSort } from '../lib/group';
import { useStore } from '../lib/store';
import { data, toggleFavAlbum, updateSettings } from '../state/data';
import { lib } from '../state/library';
import { addToQueue, playNext, playTracks } from '../state/player';
import { navigate, openMenu, toast } from '../state/ui';

export function PlayButtons({ tracks, extra }: { tracks: import('../../shared/types').Track[]; extra?: React.ReactNode }) {
  return (
    <>
      <button type="button" className="btn filled" disabled={!tracks.length} onClick={() => playTracks(tracks, 0, { shuffle: false })}>
        <Icon name="play" size={20} /> Reproducir
      </button>
      <button type="button" className="btn tonal" disabled={!tracks.length} onClick={() => playTracks(tracks, 0, { shuffle: true })}>
        <Icon name="shuffle" size={20} /> Aleatorio
      </button>
      {extra}
    </>
  );
}

export function NoMusic() {
  const progress = useStore(lib, (s) => s.progress);
  const folders = useStore(lib, (s) => s.folders);
  if (progress.scanning) return <Empty icon="refresh" title="Buscando tu música…" text="Esto solo tarda la primera vez." />;
  return (
    <Empty
      icon="library"
      title="No encontramos música"
      text={folders.length ? `Revisamos: ${folders.join(' · ')}. Agrega la carpeta donde guardas tus canciones.` : 'Agrega la carpeta donde guardas tus canciones.'}
      action={
        <button type="button" className="btn filled" onClick={() => void api.addFolder()}>
          <Icon name="folder" size={20} /> Agregar carpeta de música
        </button>
      }
    />
  );
}

const SORTS: { value: SongSort; label: string }[] = [
  { value: 'title', label: 'Título' },
  { value: 'artist', label: 'Artista' },
  { value: 'album', label: 'Álbum' },
  { value: 'recent', label: 'Agregadas recientemente' },
  { value: 'duration', label: 'Duración' },
];

export function SongsView() {
  const tracks = useStore(lib, (s) => s.tracks);
  const sort = useStore(data, (s) => s.settings.songSort);
  const sorted = useMemo(() => sortTracks(tracks, sort), [tracks, sort]);
  if (!tracks.length) return <NoMusic />;
  return (
    <div className="view">
      <ViewTitle title="Canciones" count={plural(tracks.length, 'canción', 'canciones')}>
        <label className="select">
          <Icon name="sort" size={18} />
          <select value={sort} onChange={(e) => updateSettings({ songSort: e.target.value as SongSort })} aria-label="Ordenar por">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <PlayButtons tracks={sorted} />
      </ViewTitle>
      <TrackList tracks={sorted} />
    </div>
  );
}

function albumMenu(e: React.MouseEvent, a: Album) {
  const fav = data.get().user.favAlbums.includes(a.key);
  openMenu(e, [
    { label: 'Reproducir', icon: 'play', run: () => playTracks(a.tracks, 0, { shuffle: false }) },
    { label: 'Reproducir a continuación', icon: 'playNext', run: () => playNext(a.tracks) },
    { label: 'Agregar a la cola', icon: 'queue', run: () => addToQueue(a.tracks) },
    { label: 'Agregar a una lista…', icon: 'playlistAdd', run: () => openAddToPlaylist(a.tracks) },
    { label: fav ? 'Quitar de favoritos' : 'Agregar a favoritos', icon: fav ? 'heart' : 'heartOutline', run: () => toast(toggleFavAlbum(a.key) ? 'Álbum agregado a favoritos' : 'Álbum quitado de favoritos') },
  ]);
}

export function AlbumGrid({ albums }: { albums: Album[] }) {
  return (
    <div className="grid">
      {albums.map((a) => (
        <Card
          key={a.key}
          title={a.title}
          subtitle={`${a.artist}${a.year ? ` · ${a.year}` : ''}`}
          cover={a.cover ?? null}
          seed={a.title}
          icon="album"
          onOpen={() => navigate({ view: 'album', key: a.key })}
          onPlay={() => playTracks(a.tracks, 0, { shuffle: false })}
          onContext={(e) => albumMenu(e, a)}
        />
      ))}
    </div>
  );
}

export function AlbumsView() {
  const albums = useStore(lib, (s) => s.albums);
  const sort = useStore(data, (s) => s.settings.albumSort);
  const sorted = useMemo(() => {
    const out = [...albums];
    if (sort === 'artist') out.sort((a, b) => collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title));
    if (sort === 'year') out.sort((a, b) => b.year - a.year || collator.compare(a.title, b.title));
    return out;
  }, [albums, sort]);
  if (!albums.length) return <NoMusic />;
  return (
    <div className="view">
      <ViewTitle title="Álbumes" count={plural(albums.length, 'álbum', 'álbumes')}>
        <label className="select">
          <Icon name="sort" size={18} />
          <select value={sort} onChange={(e) => updateSettings({ albumSort: e.target.value as 'title' })} aria-label="Ordenar por">
            <option value="title">Título</option>
            <option value="artist">Artista</option>
            <option value="year">Año</option>
          </select>
        </label>
      </ViewTitle>
      <AlbumGrid albums={sorted} />
    </div>
  );
}

export function AlbumView({ albumKey }: { albumKey: string }) {
  const album = useStore(lib, (s) => s.albumByKey.get(albumKey));
  const favAlbums = useStore(data, (s) => s.user.favAlbums);
  if (!album) return <Empty title="Álbum no encontrado" text="Puede que los archivos se hayan movido." />;
  const fav = favAlbums.includes(album.key);
  return (
    <div className="view">
      <PageHeader
        kicker="Álbum"
        title={album.title}
        cover={album.cover ?? null}
        icon="album"
        subtitle={
          <>
            <button type="button" className="link strong" onClick={() => navigate({ view: 'artist', key: album.artist.toLowerCase() })}>{album.artist}</button>
            {album.year ? ` · ${album.year}` : ''} · {plural(album.tracks.length, 'canción', 'canciones')} · {formatLong(album.durationMs)}
          </>
        }
        actions={
          <PlayButtons
            tracks={album.tracks}
            extra={
              <>
                <button type="button" className={`btn outline ${fav ? 'on' : ''}`} onClick={() => toast(toggleFavAlbum(album.key) ? 'Álbum agregado a favoritos' : 'Álbum quitado de favoritos')}>
                  <Icon name={fav ? 'heart' : 'heartOutline'} size={20} /> {fav ? 'En favoritos' : 'Favorito'}
                </button>
                <button type="button" className="btn outline" onClick={() => openAddToPlaylist(album.tracks)}>
                  <Icon name="playlistAdd" size={20} /> Agregar a lista
                </button>
              </>
            }
          />
        }
      />
      <TrackList tracks={album.tracks} numbered showAlbum={false} />
    </div>
  );
}

export function ArtistsView() {
  const artists = useStore(lib, (s) => s.artists);
  if (!artists.length) return <NoMusic />;
  return (
    <div className="view">
      <ViewTitle title="Artistas" count={plural(artists.length, 'artista', 'artistas')} />
      <div className="grid">
        {artists.map((a) => (
          <Card
            key={a.key}
            title={a.name}
            subtitle={`${plural(a.albums.length, 'álbum', 'álbumes')} · ${plural(a.tracks.length, 'canción', 'canciones')}`}
            cover={a.cover ?? null}
            seed={a.name}
            round
            icon="person"
            onOpen={() => navigate({ view: 'artist', key: a.key })}
            onPlay={() => playTracks(sortTracks(a.tracks, 'album'), 0, { shuffle: false })}
          />
        ))}
      </div>
    </div>
  );
}

export function ArtistView({ artistKey }: { artistKey: string }) {
  const artist = useStore(lib, (s) => s.artistByKey.get(artistKey));
  const tracks = useMemo(() => (artist ? sortTracks(artist.tracks, 'album') : []), [artist]);
  if (!artist) return <Empty title="Artista no encontrado" />;
  return (
    <div className="view">
      <PageHeader
        kicker="Artista"
        title={artist.name}
        cover={artist.cover ?? null}
        round
        icon="person"
        subtitle={`${plural(artist.albums.length, 'álbum', 'álbumes')} · ${plural(artist.tracks.length, 'canción', 'canciones')}`}
        actions={<PlayButtons tracks={tracks} extra={<button type="button" className="btn outline" onClick={() => openAddToPlaylist(tracks)}><Icon name="playlistAdd" size={20} /> Agregar a lista</button>} />}
      />
      {artist.albums.length > 0 && (
        <>
          <h2 className="section-title">Álbumes</h2>
          <AlbumGrid albums={artist.albums} />
        </>
      )}
      <h2 className="section-title">Canciones</h2>
      <TrackList tracks={tracks} />
    </div>
  );
}

export function GroupsView({ kind }: { kind: 'genres' | 'folders' }) {
  const groups = useStore(lib, (s) => (kind === 'genres' ? s.genres : s.folderGroups));
  if (!groups.length) return <NoMusic />;
  const title = kind === 'genres' ? 'Géneros' : 'Carpetas';
  return (
    <div className="view">
      <ViewTitle title={title} count={plural(groups.length, kind === 'genres' ? 'género' : 'carpeta', kind === 'genres' ? 'géneros' : 'carpetas')} />
      {kind === 'genres' ? (
        <div className="grid">
          {groups.map((g) => (
            <Card
              key={g.key}
              title={g.name}
              subtitle={plural(g.tracks.length, 'canción', 'canciones')}
              cover={g.cover ?? null}
              seed={g.name}
              icon="genre"
              onOpen={() => navigate({ view: 'genre', key: g.key })}
              onPlay={() => playTracks(g.tracks, 0, { shuffle: true })}
            />
          ))}
        </div>
      ) : (
        <div className="folder-list">
          {groups.map((g) => (
            <button type="button" key={g.key} className="folder-row" onClick={() => navigate({ view: 'folder', key: g.key })}>
              <Icon name="folder" size={28} />
              <div className="titles">
                <div className="t1">{g.name}</div>
                <div className="t2" title={g.subtitle}>{g.subtitle}</div>
              </div>
              <span className="muted">{plural(g.tracks.length, 'canción', 'canciones')}</span>
              <Icon name="chevronRight" size={20} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GroupView({ kind, groupKey }: { kind: 'genre' | 'folder'; groupKey: string }) {
  const group = useStore(lib, (s) => (kind === 'genre' ? s.genres : s.folderGroups).find((g) => g.key === groupKey));
  if (!group) return <Empty title="No encontrado" />;
  return (
    <div className="view">
      <PageHeader
        kicker={kind === 'genre' ? 'Género' : 'Carpeta'}
        title={group.name}
        cover={group.cover ?? null}
        icon={kind === 'genre' ? 'genre' : 'folder'}
        subtitle={
          <>
            {plural(group.tracks.length, 'canción', 'canciones')}
            {group.subtitle ? <div className="muted small ellipsis">{group.subtitle}</div> : null}
          </>
        }
        actions={<PlayButtons tracks={group.tracks} extra={<button type="button" className="btn outline" onClick={() => openAddToPlaylist(group.tracks)}><Icon name="playlistAdd" size={20} /> Agregar a lista</button>} />}
      />
      <TrackList tracks={group.tracks} />
    </div>
  );
}
