// Vistas de la biblioteca: canciones, álbumes, artistas, géneros, listas y detalles.
import type { TvTrack } from '../api';
import { cardGrid } from '../components/grid';
import { lazyImage } from '../components/images';
import { TrackList } from '../components/tracklist';
import { h, icon, plural } from '../dom';
import type { Group } from '../library';
import { app, artOf, playTracks } from '../state';
import { navigate, openTrackMenu, type View } from '../ui';

function playButtons(tracks: TvTrack[]) {
  return h(
    'div',
    { class: 'actions', 'data-group': 'actions' },
    h('button', { class: 'btn primary', focus: true, 'data-key': 'play-all', onclick: () => playTracks(tracks, 0, false) }, icon('play', 34), 'Reproducir'),
    h('button', { class: 'btn', focus: true, 'data-key': 'shuffle-all', onclick: () => playTracks(tracks, 0, true) }, icon('shuffle', 34), 'Aleatorio'),
  );
}

function listView(title: string, subtitle: string, tracks: TvTrack[], opts: { numbered?: boolean; art?: string | null; empty?: string } = {}): View {
  const list = new TrackList(tracks, {
    numbered: opts.numbered,
    onPlay: (i) => playTracks(tracks, i, false),
    onMore: (i) => openTrackMenu(tracks[i]),
    emptyText: opts.empty,
  });
  const header = h(
    'div',
    { class: 'view-head' },
    opts.art !== undefined ? lazyImage(artOf(opts.art), title, 'head-art', 'album') : null,
    h('div', { class: 'head-text' }, h('h1', null, title), h('div', { class: 'head-sub' }, subtitle), tracks.length ? playButtons(tracks) : null),
  );
  return {
    el: h('div', { class: 'view list-view' }, header, list.el),
    focus: () => (tracks.length ? list.focusFirst() : undefined),
    update: () => list.refreshCurrent(),
  };
}

function totalTime(tracks: TvTrack[]) {
  let ms = 0;
  for (const t of tracks) ms += t.durationMs;
  const min = Math.round(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function songsView(): View {
  const tracks = app.library.tracks;
  return listView('Canciones', plural(tracks.length, 'canción', 'canciones'), tracks, { empty: 'El PC no tiene canciones en su biblioteca.' });
}

function groupGrid(title: string, groups: Group[], kind: string, iconName: string, round = false): View {
  const grid = cardGrid(
    groups.map((g) => ({ key: g.key, title: g.name, subtitle: g.subtitle, art: artOf(g.art), round, icon: iconName })),
    (key) => navigate({ view: kind, key }),
  );
  return {
    el: h('div', { class: 'view scroll' }, h('div', { class: 'view-head small' }, h('h1', null, title), h('div', { class: 'head-sub' }, plural(groups.length, kind === 'album' ? 'álbum' : kind === 'artist' ? 'artista' : 'género', kind === 'album' ? 'álbumes' : kind === 'artist' ? 'artistas' : 'géneros'))), grid),
  };
}

export function albumsView(): View {
  return groupGrid('Álbumes', app.library.albums, 'album', 'album');
}
export function artistsView(): View {
  return groupGrid('Artistas', app.library.artists, 'artist', 'person', true);
}
export function genresView(): View {
  return groupGrid('Géneros', app.library.genres, 'genre', 'genre');
}

export function groupView(kind: string, key: string): View {
  const list = kind === 'album' ? app.library.albums : kind === 'artist' ? app.library.artists : app.library.genres;
  const g = list.filter((x) => x.key === key)[0];
  if (!g) return { el: h('div', { class: 'view empty' }, 'No encontrado') };
  return listView(g.name, `${g.subtitle} · ${plural(g.tracks.length, 'canción', 'canciones')} · ${totalTime(g.tracks)}`, g.tracks, {
    numbered: kind === 'album',
    art: g.art,
  });
}

export function playlistsView(): View {
  const lib = app.library;
  const items = [
    { key: '__fav', title: 'Favoritos', subtitle: plural(lib.favorites.length, 'canción', 'canciones'), art: null, icon: 'heart' },
    ...lib.playlists.map((p) => {
      const tracks = lib.resolve(p.trackIds);
      const withArt = tracks.filter((t) => !!t.art)[0];
      return { key: p.id, title: p.name, subtitle: plural(tracks.length, 'canción', 'canciones'), art: withArt ? artOf(withArt.art) : null, icon: 'playlist' };
    }),
  ];
  return {
    el: h(
      'div',
      { class: 'view scroll' },
      h('div', { class: 'view-head small' }, h('h1', null, 'Listas'), h('div', { class: 'head-sub' }, 'Tus listas y favoritos del PC. Para crearlas o editarlas usa Pipo en el PC.')),
      cardGrid(items, (key) => navigate({ view: 'playlist', key })),
    ),
  };
}

export function playlistView(id: string): View {
  const lib = app.library;
  if (id === '__fav') return listView('Favoritos', plural(lib.favorites.length, 'canción', 'canciones'), lib.favorites, { empty: 'Marca canciones con el corazón en Pipo del PC.' });
  const p = lib.playlists.filter((x) => x.id === id)[0];
  if (!p) return { el: h('div', { class: 'view empty' }, 'Lista no encontrada') };
  const tracks = lib.resolve(p.trackIds);
  return listView(p.name, `${plural(tracks.length, 'canción', 'canciones')} · ${totalTime(tracks)}`, tracks, { empty: 'Esta lista está vacía.' });
}

export function recentView(): View {
  const tracks = app.library.tracks.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 100);
  return listView('Agregadas recientemente', plural(tracks.length, 'canción', 'canciones'), tracks);
}

