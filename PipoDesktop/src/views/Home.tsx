// Inicio, al estilo de Spotify: lo escuchado hace poco, mixes que se renuevan cada día, canciones
// parecidas de YouTube y recomendaciones de tu propia biblioteca.
import { useMemo, useRef, type ReactNode } from 'react';
import type { Track } from '../../shared/types';
import { Artwork } from '../components/Artwork';
import { Card, Empty } from '../components/Common';
import { openAddToPlaylist, openNewPlaylist } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { TrackList } from '../components/TrackList';
import { trackMenuItems } from '../components/trackMenu';
import { formatLong, plural } from '../lib/format';
import type { Album } from '../lib/group';
import { greeting, type Mix } from '../lib/recommend';
import { useStore } from '../lib/store';
import { data } from '../state/data';
import { radios, useHome, useRadios, type RadioState } from '../state/home';
import { resolveIds } from '../state/library';
import { playTracks } from '../state/player';
import { navigate, openMenu, toast } from '../state/ui';
import { albumMenu, PlayButtons } from './Library';

// ── Piezas ──

function Shelf({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: { label: string; run: () => void }; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="shelf" aria-label={title}>
      <div className="shelf-head">
        <div className="grow">
          <h2>{title}</h2>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        {action && (
          <button type="button" className="link-btn" onClick={action.run}>
            {action.label}
          </button>
        )}
        <button type="button" className="icon-btn small shelf-arrow" aria-label="Anteriores" onClick={() => scroll(-1)}>
          <Icon name="back" size={18} />
        </button>
        <button type="button" className="icon-btn small shelf-arrow" aria-label="Siguientes" onClick={() => scroll(1)}>
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
      <div className="shelf-row scroll-thin" ref={row}>
        {children}
      </div>
    </section>
  );
}

function TrackCard({ list, index }: { list: Track[]; index: number }) {
  const t = list[index];
  return (
    <Card
      title={t.title}
      subtitle={t.artist}
      cover={t}
      seed={t.album || t.title}
      onOpen={() => playTracks(list, index, { shuffle: false })}
      onPlay={() => playTracks(list, index, { shuffle: false })}
      onContext={(e) => openMenu(e, trackMenuItems(t, { list, index }))}
    />
  );
}

function AlbumCard({ album, subtitle }: { album: Album; subtitle?: string }) {
  return (
    <Card
      title={album.title}
      subtitle={subtitle ?? album.artist}
      cover={album.cover ?? null}
      seed={album.title}
      icon="album"
      onOpen={() => navigate({ view: 'album', key: album.key })}
      onPlay={() => playTracks(album.tracks, 0, { shuffle: false })}
      onContext={(e) => albumMenu(e, album)}
    />
  );
}

/** Portada de mix: mosaico de 4 carátulas (o una sola) con el nombre encima. */
export function MixArt({ mix, size }: { mix: Pick<Mix, 'covers' | 'artist'>; size?: number }) {
  const covers = mix.covers;
  return (
    <div className="mix-art" style={size ? { width: size, height: size } : undefined}>
      {covers.length >= 4 ? (
        <div className="mix-mosaic">
          {covers.slice(0, 4).map((c) => (
            <Artwork key={c.id} track={c} seed={c.album} />
          ))}
        </div>
      ) : (
        <Artwork track={covers[0] ?? null} seed={mix.artist} />
      )}
      <div className="mix-band">
        <span>Mix</span>
        <b>{mix.artist}</b>
      </div>
    </div>
  );
}

function MixCard({ mix }: { mix: Mix }) {
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={() => navigate({ view: 'mix', id: mix.id })}
      onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'mix', id: mix.id })}
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e, [
          { label: 'Reproducir', icon: 'play', run: () => playTracks(mix.tracks, 0, { shuffle: false }) },
          { label: 'Guardar como lista…', icon: 'playlistAdd', run: () => openNewPlaylist(mix.tracks, (id) => navigate({ view: 'playlist', id })) },
          { label: 'Agregar a una lista…', icon: 'playlistAdd', run: () => openAddToPlaylist(mix.tracks) },
        ]);
      }}
    >
      <div className="card-art">
        <MixArt mix={mix} />
        <button
          type="button"
          className="card-play"
          title="Reproducir"
          onClick={(e) => {
            e.stopPropagation();
            playTracks(mix.tracks, 0, { shuffle: false });
          }}
        >
          <Icon name="play" size={26} />
        </button>
      </div>
      <div className="card-title" title={mix.title}>{mix.title}</div>
      <div className="card-sub" title={mix.subtitle}>{mix.subtitle}</div>
    </div>
  );
}

function QuickTile({ title, cover, seed, icon, art, onOpen, onPlay }: { title: string; cover?: Track | null; seed: string; icon?: string; art?: ReactNode; onOpen: () => void; onPlay: () => void }) {
  return (
    <div className="quick-tile" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      {art ?? <Artwork track={cover ?? null} seed={seed} icon={icon} />}
      <span className="quick-title" title={title}>{title}</span>
      <button
        type="button"
        className="quick-play"
        title="Reproducir"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
      >
        <Icon name="play" size={22} />
      </button>
    </div>
  );
}

function RadioShelf({ radio, index }: { radio: RadioState; index: number }) {
  if (radio.status === 'error') return null;
  return (
    <Shelf
      title={radio.label}
      subtitle="Canciones parecidas en YouTube"
      action={radio.tracks.length ? { label: 'Ver todo', run: () => navigate({ view: 'mix', id: `radio:${index}` }) } : undefined}
    >
      {radio.status === 'loading'
        ? Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card skeleton" aria-hidden="true">
              <div className="card-art" />
              <div className="sk-line" />
              <div className="sk-line short" />
            </div>
          ))
        : radio.tracks.map((t, i) => <TrackCard key={t.id} list={radio.tracks} index={i} />)}
    </Shelf>
  );
}

// ── Inicio ──

export function HomeView() {
  const home = useHome();
  const radioRows = useRadios(home.seeds);
  const favs = useStore(data, (s) => s.user.favTracks);
  const playlists = useStore(data, (s) => s.user.playlists);
  const hello = greeting();

  const quick = useMemo(() => {
    const tiles: { key: string; node: ReactNode }[] = [];
    if (favs.length)
      tiles.push({
        key: 'fav',
        node: (
          <QuickTile
            title="Favoritos"
            seed="Favoritos"
            art={<div className="art quick-fav"><Icon name="heart" size={26} /></div>}
            onOpen={() => navigate({ view: 'favorites' })}
            onPlay={() => playTracks(resolveIds(favs), 0, { shuffle: false })}
          />
        ),
      });
    for (const r of home.recent) {
      if (tiles.length >= 6) break;
      if (r.kind === 'album') {
        const a = r.album;
        tiles.push({ key: `a${a.key}`, node: <QuickTile title={a.title} cover={a.cover ?? null} seed={a.title} icon="album" onOpen={() => navigate({ view: 'album', key: a.key })} onPlay={() => playTracks(a.tracks, 0, { shuffle: false })} /> });
      }
    }
    for (const p of [...playlists].sort((a, b) => b.updatedAt - a.updatedAt)) {
      if (tiles.length >= 4) break;
      tiles.push({ key: `p${p.id}`, node: <QuickTile title={p.name} seed={p.name} icon="queue" onOpen={() => navigate({ view: 'playlist', id: p.id })} onPlay={() => playTracks(resolveIds(p.trackIds), 0, { shuffle: false })} /> });
    }
    for (const m of home.mixes) {
      if (tiles.length >= 6) break;
      tiles.push({ key: m.id, node: <QuickTile title={m.title} seed={m.artist} art={<MixArt mix={m} />} onOpen={() => navigate({ view: 'mix', id: m.id })} onPlay={() => playTracks(m.tracks, 0, { shuffle: false })} /> });
    }
    return tiles;
  }, [favs, playlists, home]);

  const nothing = !home.hasHistory && !home.mixes.length && !home.forYou.length && !home.added.length;
  if (nothing) {
    return (
      <div className="view home">
        <h1 className="home-greet">{hello}</h1>
        <Empty
          icon="home"
          title="Aquí verás tus recomendaciones"
          text="Agrega tu música o escucha canciones de YouTube: Pipo aprende lo que te gusta y te muestra lo escuchado hace poco, mixes diarios y canciones parecidas."
          action={
            <button type="button" className="btn filled" onClick={() => navigate({ view: 'youtube' })}>
              <Icon name="youtube" size={20} /> Buscar en YouTube
            </button>
          }
        />
      </div>
    );
  }

  const shelves: ReactNode[] = [];
  if (home.recent.length)
    shelves.push(
      <Shelf key="recent" title="Escuchado recientemente" action={{ label: 'Ver todo', run: () => navigate({ view: 'smart', id: 'played' }) }}>
        {home.recent.map((r) =>
          r.kind === 'album' ? (
            <AlbumCard key={`a${r.album.key}`} album={r.album} subtitle={`Álbum · ${r.album.artist}`} />
          ) : (
            <TrackCard key={r.track.id} list={home.recentTracks} index={Math.max(0, home.recentTracks.indexOf(r.track))} />
          ),
        )}
      </Shelf>,
    );
  if (home.mixes.length)
    shelves.push(
      <Shelf key="mixes" title={home.hasHistory ? 'Tus mixes' : 'Mixes de tu biblioteca'} subtitle="Se renuevan cada día con tus artistas y otros parecidos">
        {home.mixes.map((m) => <MixCard key={m.id} mix={m} />)}
      </Shelf>,
    );
  if (radioRows[0]) shelves.push(<RadioShelf key="radio0" radio={radioRows[0]} index={0} />);
  if (home.forYou.length)
    shelves.push(
      <Shelf
        key="foryou"
        title={home.hasHistory ? 'Canciones para ti' : 'Descubre tu música'}
        subtitle={home.hasHistory ? 'De tus artistas y géneros, que aún no has escuchado' : 'Canciones de tu biblioteca que aún no has escuchado'}
        action={{ label: 'Ver todo', run: () => navigate({ view: 'mix', id: 'foryou' }) }}
      >
        {home.forYou.map((t, i) => <TrackCard key={t.id} list={home.forYou} index={i} />)}
      </Shelf>,
    );
  if (home.albumsForYou.length)
    shelves.push(
      <Shelf key="albums" title="Álbumes que podrían gustarte" subtitle={home.hasHistory ? 'Casi sin escuchar, de lo que más te gusta' : undefined}>
        {home.albumsForYou.map((a) => <AlbumCard key={a.key} album={a} />)}
      </Shelf>,
    );
  if (home.topArtists.length)
    shelves.push(
      <Shelf key="artists" title="Tus artistas">
        {home.topArtists.map((a) => (
          <Card
            key={a.name}
            title={a.name}
            subtitle="Artista"
            cover={a.cover ?? null}
            seed={a.name}
            round
            icon="person"
            onOpen={() => {
              if (a.libKey) navigate({ view: 'artist', key: a.libKey });
              else {
                sessionStorage.setItem('pipo:ytq', a.name);
                navigate({ view: 'youtube' });
              }
            }}
          />
        ))}
      </Shelf>,
    );
  if (radioRows[1]) shelves.push(<RadioShelf key="radio1" radio={radioRows[1]} index={1} />);
  if (home.again.length)
    shelves.push(
      <Shelf key="again" title="Para volver a escuchar" subtitle="Lo que más te gustó y hace rato no suena" action={{ label: 'Ver todo', run: () => navigate({ view: 'mix', id: 'again' }) }}>
        {home.again.map((t, i) => <TrackCard key={t.id} list={home.again} index={i} />)}
      </Shelf>,
    );
  if (home.added.length)
    shelves.push(
      <Shelf key="added" title="Agregadas recientemente" action={{ label: 'Ver todo', run: () => navigate({ view: 'smart', id: 'recent' }) }}>
        {home.added.map((a) => <AlbumCard key={a.key} album={a} />)}
      </Shelf>,
    );

  return (
    <div className="view home">
      <h1 className="home-greet">{hello}</h1>
      {quick.length > 0 && <div className="quick-grid">{quick.map((q) => <div key={q.key}>{q.node}</div>)}</div>}
      {shelves}
    </div>
  );
}

// ── Detalle de un mix o de una lista de Inicio ──

export function MixView({ id }: { id: string }) {
  const home = useHome();
  const byKey = useStore(radios, (s) => s.byKey);
  const view = useMemo(() => {
    if (id.startsWith('mix:')) {
      const m = home.mixes.find((x) => x.id === id);
      return m && { kicker: 'Mix diario', title: m.title, subtitle: m.subtitle, tracks: m.tracks, mix: m };
    }
    if (id === 'foryou') return { kicker: 'Para ti', title: home.hasHistory ? 'Canciones para ti' : 'Descubre tu música', subtitle: 'De tus artistas y géneros, que aún no has escuchado', tracks: home.forYou };
    if (id === 'again') return { kicker: 'Para ti', title: 'Para volver a escuchar', subtitle: 'Lo que más te gustó y hace rato no suena', tracks: home.again };
    if (id.startsWith('radio:')) {
      const seed = home.seeds[Number(id.slice(6))];
      const r = seed && Object.values(byKey).find((x) => x.seed.id === seed.track.id);
      return r && { kicker: 'Canciones parecidas en YouTube', title: r.label, subtitle: `A partir de «${r.seed.title}» de ${r.seed.artist}`, tracks: r.tracks };
    }
    return undefined;
  }, [id, home, byKey]);

  if (!view) return <div className="view"><Empty icon="home" title="Esta lista ya no está" text="Las recomendaciones se renuevan cada día." /></div>;
  const dur = view.tracks.reduce((s, t) => s + t.durationMs, 0);
  return (
    <div className="view">
      <header className="page-header">
        {'mix' in view && view.mix ? <MixArt mix={view.mix} size={176} /> : <PageHeaderArt tracks={view.tracks} />}
        <div className="page-header-text">
          <div className="kicker">{view.kicker}</div>
          <h1 title={view.title}>{view.title}</h1>
          <div className="subtitle">
            {view.subtitle} · {plural(view.tracks.length, 'canción', 'canciones')}
            {dur ? ` · ${formatLong(dur)}` : ''}
          </div>
          <div className="actions">
            <PlayButtons
              tracks={view.tracks}
              extra={
                <button
                  type="button"
                  className="btn outline"
                  disabled={!view.tracks.length}
                  onClick={() =>
                    openNewPlaylist(view.tracks, (pid) => {
                      toast('Lista guardada');
                      navigate({ view: 'playlist', id: pid });
                    })
                  }
                >
                  <Icon name="playlistAdd" size={20} /> Guardar como lista
                </button>
              }
            />
          </div>
        </div>
      </header>
      <TrackList tracks={view.tracks} />
    </div>
  );
}

function PageHeaderArt({ tracks }: { tracks: Track[] }) {
  const covers: Track[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    const k = t.artId ?? t.artworkUrl;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    covers.push(t);
    if (covers.length >= 4) break;
  }
  return covers.length >= 4 ? (
    <div className="mix-art hero-art" style={{ width: 176, height: 176 }}>
      <div className="mix-mosaic">
        {covers.map((c) => (
          <Artwork key={c.id} track={c} seed={c.album} />
        ))}
      </div>
    </div>
  ) : (
    <Artwork track={covers[0] ?? null} seed={tracks[0]?.title ?? 'Para ti'} size={176} className="hero-art" />
  );
}

