// «Inicio» de la música, al estilo de Spotify: lo escuchado hace poco en esta TV, mixes que se
// renuevan cada día y recomendaciones de la biblioteca del PC o del teléfono.
import type { TvTrack } from '../api';
import { lazyImage } from '../components/images';
import { h, icon, plural } from '../dom';
import { stats, statsVersion } from '../history';
import { artistOf, type Group } from '../library';
import { focus, setKeyOwner, type Dir } from '../nav';
import { buildHome, greeting, type HomeData, type Mix } from '../recommend';
import { app, artOf, playTracks } from '../state';
import { navigate, openTrackMenu, type View } from '../ui';
import { listView } from './library';

let cache: { lib: unknown; tracks: unknown; version: number; day: string; home: HomeData } | null = null;

export function homeData(): HomeData {
  const lib = app.library;
  const d = new Date();
  const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  if (cache && cache.lib === lib && cache.tracks === lib.tracks && cache.version === statsVersion() && cache.day === day) return cache.home;
  const playlists = lib.playlists.map((p) => lib.resolve(p.trackIds));
  const home = buildHome({
    tracks: lib.tracks,
    albums: lib.albums,
    stats: stats(),
    favorites: lib.favorites,
    playlists,
    resolve: (id) => lib.byId[id],
    now: Date.now(),
  });
  cache = { lib, tracks: lib.tracks, version: statsVersion(), day, home };
  return home;
}

// ── Piezas ──

let shelfNo = 0;

function shelf(title: string, subtitle: string | null, cards: HTMLElement[]): HTMLElement {
  return h(
    'section',
    { class: 'shelf' },
    h('h2', null, title),
    subtitle ? h('div', { class: 'shelf-sub' }, subtitle) : null,
    h('div', { class: 'shelf-row', 'data-group': `shelf-${shelfNo++}` }, cards),
  );
}

function card(key: string, title: string, subtitle: string, art: HTMLElement, onOpen: () => void, extra: { round?: boolean; onMore?: () => void } = {}): HTMLElement {
  const el = h('div', { class: `card${extra.round ? ' round' : ''}`, focus: true, 'data-key': key, onclick: onOpen }, art, h('div', { class: 'card-title' }, title), h('div', { class: 'card-sub' }, subtitle));
  // Mantener OK: opciones de la canción (como el botón ⋯ de las listas).
  if (extra.onMore) el.addEventListener('contextmenu', (e) => (e.preventDefault(), extra.onMore!()));
  return el;
}

function trackCard(prefix: string, list: TvTrack[], i: number): HTMLElement {
  const t = list[i];
  return card(`${prefix}-${t.id}`, t.title, artistOf(t), lazyImage(artOf(t.art), t.album || t.title, 'card-art', 'note'), () => playTracks(list, i, false), { onMore: () => openTrackMenu(t) });
}

function albumCard(prefix: string, a: Group, subtitle?: string): HTMLElement {
  return card(`${prefix}-${a.key}`, a.name, subtitle || a.subtitle, lazyImage(artOf(a.art), a.name, 'card-art', 'album'), () => navigate({ view: 'album', key: a.key }));
}

export function mixArt(mix: Pick<Mix, 'covers' | 'artist'>, cls = 'card-art'): HTMLElement {
  const box = h('div', { class: `art mix-art ${cls}` });
  if (mix.covers.length >= 4) {
    box.appendChild(h('div', { class: 'mix-mosaic' }, mix.covers.slice(0, 4).map((c) => lazyImage(artOf(c.art), c.album, 'mix-cell', 'album'))));
  } else {
    const c = mix.covers[0];
    box.appendChild(lazyImage(c ? artOf(c.art) : null, mix.artist, 'mix-cell full', 'note'));
  }
  box.appendChild(h('div', { class: 'mix-band' }, h('span', null, 'MIX'), h('b', null, mix.artist)));
  return box;
}

// ── Inicio ──

export function musicHomeView(): View {
  shelfNo = 0;
  const home = homeData();
  const lib = app.library;
  const shelves: HTMLElement[] = [];

  if (home.recent.length) {
    shelves.push(
      shelf(
        'Escuchado recientemente',
        'En esta TV',
        home.recent.map((r) =>
          r.kind === 'album'
            ? albumCard('rec', r.album, `Álbum · ${artistOf(r.album.tracks[0])}`)
            : trackCard('rec', home.recentTracks, Math.max(0, home.recentTracks.indexOf(r.track))),
        ),
      ),
    );
  }
  if (home.mixes.length) {
    shelves.push(
      shelf(
        home.hasHistory ? 'Tus mixes' : 'Mixes de tu biblioteca',
        'Se renuevan cada día con tus artistas y otros parecidos',
        home.mixes.map((m) => card(`mix-${m.id}`, m.title, m.subtitle, mixArt(m), () => navigate({ view: 'mix', key: m.id }))),
      ),
    );
  }
  if (home.forYou.length) {
    shelves.push(
      shelf(
        home.hasHistory ? 'Canciones para ti' : 'Descubre tu música',
        home.hasHistory ? 'De tus artistas y géneros, que aún no has escuchado' : 'Canciones de tu biblioteca que aún no has escuchado',
        [card('foryou-all', 'Ver todas', plural(home.forYou.length, 'canción', 'canciones'), h('div', { class: 'art card-art see-all' }, icon('playlist', 64)), () => navigate({ view: 'mix', key: 'foryou' }))].concat(
          home.forYou.map((_, i) => trackCard('fy', home.forYou, i)),
        ),
      ),
    );
  }
  if (home.albumsForYou.length) {
    shelves.push(shelf('Álbumes que podrían gustarte', home.hasHistory ? 'Casi sin escuchar, de lo que más te gusta' : null, home.albumsForYou.map((a) => albumCard('afy', a))));
  }
  if (home.topArtists.length) {
    shelves.push(
      shelf(
        'Tus artistas',
        null,
        home.topArtists.map((a) => {
          const libKey = artistOf(a.tracks[0]).toLowerCase();
          const inLib = lib.artists.some((x) => x.key === libKey);
          return card(`art-${a.key}`, a.name, 'Artista', lazyImage(a.cover ? artOf(a.cover.art) : null, a.name, 'card-art', 'person'), () =>
            inLib ? navigate({ view: 'artist', key: libKey }) : playTracks(a.tracks, 0, false), { round: true });
        }),
      ),
    );
  }
  if (home.again.length) {
    shelves.push(
      shelf(
        'Para volver a escuchar',
        'Lo que más te gustó y hace rato no suena',
        [card('again-all', 'Ver todas', plural(home.again.length, 'canción', 'canciones'), h('div', { class: 'art card-art see-all' }, icon('history', 64)), () => navigate({ view: 'mix', key: 'again' }))].concat(
          home.again.map((_, i) => trackCard('ag', home.again, i)),
        ),
      ),
    );
  }
  if (home.added.length) shelves.push(shelf('Agregadas recientemente', null, home.added.map((a) => albumCard('add', a))));

  const head = h(
    'div',
    { class: 'view-head small home-head' },
    h('h1', null, greeting()),
    h('div', { class: 'head-sub' }, home.hasHistory ? `Música de «${lib.name}» elegida para ti` : `Música de «${lib.name}». Lo que escuches aquí hará tus recomendaciones más precisas.`),
  );
  const el = h('div', { class: 'view scroll home', 'data-owner': '' }, head, shelves.length ? shelves : h('div', { class: 'empty' }, 'Todavía no hay música en la biblioteca compartida.'));
  // ↑/↓ pasan siempre a la fila de al lado, a la tarjeta más cercana que se vea (sin saltar filas).
  setKeyOwner(el, {
    handleKey: (dir: Dir, current: HTMLElement) => {
      if (dir !== 'up' && dir !== 'down') return false;
      const rows = Array.prototype.slice.call(el.querySelectorAll('.shelf-row')) as HTMLElement[];
      const row = current.closest('.shelf-row') as HTMLElement | null;
      const i = row ? rows.indexOf(row) : -1;
      const target = rows[dir === 'down' ? i + 1 : i - 1];
      if (i < 0 || !target) return false;
      const cx = current.getBoundingClientRect().left + current.offsetWidth / 2;
      const view = target.getBoundingClientRect();
      const cards = Array.prototype.slice.call(target.querySelectorAll('.card')) as HTMLElement[];
      let best: HTMLElement | null = null;
      let bestScore = Infinity;
      for (const c of cards) {
        const r = c.getBoundingClientRect();
        const inside = r.left >= view.left - 4 && r.right <= view.right + 4;
        const score = Math.abs(r.left + r.width / 2 - cx) + (inside ? 0 : 100000);
        if (score < bestScore) {
          best = c;
          bestScore = score;
        }
      }
      if (!best) return false;
      focus(best);
      return true;
    },
  });
  return {
    el,
    focus: () => focus(el.querySelector<HTMLElement>('.shelf-row .card')),
  };
}

// ── Detalle de un mix o de una lista de Inicio ──

export function mixView(id: string): View {
  const home = homeData();
  let title = '';
  let subtitle = '';
  let tracks: TvTrack[] = [];
  const mix = home.mixes.filter((m) => m.id === id)[0];
  if (mix) {
    title = mix.title;
    subtitle = `Mix diario · ${mix.subtitle}`;
    tracks = mix.tracks;
  } else if (id === 'foryou') {
    title = home.hasHistory ? 'Canciones para ti' : 'Descubre tu música';
    subtitle = 'De tus artistas y géneros, que aún no has escuchado';
    tracks = home.forYou;
  } else if (id === 'again') {
    title = 'Para volver a escuchar';
    subtitle = 'Lo que más te gustó y hace rato no suena';
    tracks = home.again;
  } else {
    return { el: h('div', { class: 'view empty' }, 'Las recomendaciones se renuevan cada día.') };
  }
  const v = listView(title, `${subtitle} · ${plural(tracks.length, 'canción', 'canciones')}`, tracks);
  if (mix) {
    const headEl = v.el.querySelector('.view-head');
    if (headEl) headEl.insertBefore(mixArt(mix, 'head-art'), headEl.firstChild);
  }
  return v;
}
