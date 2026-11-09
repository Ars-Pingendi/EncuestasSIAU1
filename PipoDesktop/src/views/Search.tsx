import { useDeferredValue, useMemo } from 'react';
import { Card, Empty, ViewTitle } from '../components/Common';
import { Icon } from '../components/Icon';
import { TrackList } from '../components/TrackList';
import { norm, plural } from '../lib/format';
import { artistOf } from '../lib/group';
import { useStore } from '../lib/store';
import { lib } from '../state/library';
import { playTracks } from '../state/player';
import { navigate } from '../state/ui';
import { AlbumGrid } from './Library';

export function SearchView({ q }: { q: string }) {
  const query = useDeferredValue(q);
  const tracks = useStore(lib, (s) => s.tracks);
  const albums = useStore(lib, (s) => s.albums);
  const artists = useStore(lib, (s) => s.artists);
  const res = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    const match = (text: string) => {
      const n = norm(text);
      return words.every((w) => n.includes(w));
    };
    return {
      tracks: tracks.filter((t) => match(`${t.title} ${artistOf(t)} ${t.album} ${t.genre}`)).slice(0, 300),
      albums: albums.filter((a) => match(`${a.title} ${a.artist}`)).slice(0, 24),
      artists: artists.filter((a) => match(a.name)).slice(0, 24),
    };
  }, [query, tracks, albums, artists]);
  const none = !res.tracks.length && !res.albums.length && !res.artists.length;
  return (
    <div className="view">
      <ViewTitle title={`Resultados para «${q}»`}>
        <button type="button" className="btn outline" onClick={() => navigate({ view: 'youtube' })} onMouseDown={() => sessionStorage.setItem('pipo:ytq', q)}>
          <Icon name="youtube" size={20} /> Buscar en YouTube
        </button>
      </ViewTitle>
      {none && <Empty icon="search" title="Sin resultados en tu biblioteca" text="Prueba con otras palabras o búscalo en YouTube." />}
      {res.artists.length > 0 && (
        <>
          <h2 className="section-title">Artistas</h2>
          <div className="grid">
            {res.artists.map((a) => (
              <Card
                key={a.key}
                title={a.name}
                subtitle={plural(a.tracks.length, 'canción', 'canciones')}
                cover={a.cover ?? null}
                round
                icon="person"
                onOpen={() => navigate({ view: 'artist', key: a.key })}
                onPlay={() => playTracks(a.tracks, 0, { shuffle: false })}
              />
            ))}
          </div>
        </>
      )}
      {res.albums.length > 0 && (
        <>
          <h2 className="section-title">Álbumes</h2>
          <AlbumGrid albums={res.albums} />
        </>
      )}
      {res.tracks.length > 0 && (
        <>
          <h2 className="section-title">Canciones · {res.tracks.length}</h2>
          <TrackList tracks={res.tracks} />
        </>
      )}
    </div>
  );
}
