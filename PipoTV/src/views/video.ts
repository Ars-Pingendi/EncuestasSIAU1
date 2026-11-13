// Pantallas de video: inicio, películas, series y sus detalles.
import type { TvVideo } from '../api';
import { videoImageUrl } from '../api';
import { lazyImage } from '../components/images';
import { clear, formatTime as clock, h, icon, plural } from '../dom';
import type { Series } from '../videolibrary';
import { app } from '../state';
import { navigate, openMenu, type View } from '../ui';
import { continueWatching, getProgress, nextToWatch, resumable, seriesProgress, setWatched } from '../videostate';
import { playVideo } from './player';

export function durationText(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return '';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

function resolutionText(v: TvVideo): string {
  if (v.height >= 2000) return '4K';
  if (v.height >= 1000) return '1080p';
  if (v.height >= 700) return '720p';
  return v.height ? `${v.height}p` : '';
}

function movieTitle(v: TvVideo): string {
  return v.year ? `${v.title} (${v.year})` : v.title;
}

function episodeTitle(v: TvVideo): string {
  return `T${v.season} E${v.episode}${v.title ? ` · ${v.title}` : ''}`;
}

function card(key: string, title: string, subtitle: string, artUrl: string | null, seed: string, onOpen: () => void, v?: TvVideo): HTMLElement {
  const p = v ? getProgress(v.id) : null;
  const pct = p && !p.done && p.dur > 0 ? Math.min(100, (p.pos / p.dur) * 100) : 0;
  return h(
    'div',
    { class: 'vcard', focus: true, 'data-key': `v-${key}`, onclick: onOpen },
    h(
      'div',
      { class: 'vcard-art' },
      lazyImage(artUrl, seed, 'vcard-img', 'play'),
      pct > 0 ? h('div', { class: 'vcard-bar' }, h('div', { class: 'vcard-fill', style: { width: `${pct}%` } })) : null,
      p && p.done ? h('div', { class: 'vcard-done' }, icon('check', 28)) : null,
    ),
    h('div', { class: 'vcard-title' }, title),
    h('div', { class: 'vcard-sub' }, subtitle),
  );
}

function thumb(v: TvVideo): string | null {
  return app.conn ? videoImageUrl(app.conn, v.id) : null;
}

function movieCard(v: TvVideo): HTMLElement {
  const bits = [v.year ? String(v.year) : '', durationText(v.durationMs), resolutionText(v)].filter(Boolean);
  return card(v.id, v.title, bits.join(' · '), thumb(v), v.title, () => navigate({ view: 'movie', key: v.id }), v);
}

function seriesCard(s: Series): HTMLElement {
  const seasons = s.seasons.length;
  const sub = `${plural(seasons, 'temporada', 'temporadas')} · ${plural(s.episodes.length, 'episodio', 'episodios')}`;
  return card(`s-${s.key}`, s.name, sub, app.conn ? videoImageUrl(app.conn, s.cover.id, true) : null, s.name, () => navigate({ view: 'show', key: s.key }));
}

function continueCard(v: TvVideo): HTMLElement {
  const p = getProgress(v.id);
  const left = p ? Math.max(0, p.dur - p.pos) : 0;
  const title = v.kind === 'episode' ? v.series : movieTitle(v);
  const sub = `${v.kind === 'episode' ? `${episodeTitle(v)} · ` : ''}quedan ${durationText(left) || '1 min'}`;
  return card(v.id, title, sub, thumb(v), title, () => playVideo(v, { resume: true }), v);
}

function section(title: string, cards: HTMLElement[]): HTMLElement {
  return h('div', { class: 'vsection' }, h('h2', null, title), h('div', { class: 'vgrid', 'data-group': `s-${title}` }, cards));
}

function emptyHelp(): HTMLElement {
  const msg = app.videos.scanning
    ? 'Pipo del PC está analizando tus videos. Vuelve en un momento y pulsa «Actualizar biblioteca» en Ajustes.'
    : 'En el PC abre Pipo › Ajustes › Películas y series y agrega la carpeta donde guardas tus videos. Luego pulsa «Actualizar biblioteca» en los Ajustes de la TV.';
  return h('div', { class: 'empty-help' }, icon('play', 64), h('h2', null, 'Todavía no hay videos'), h('p', null, msg));
}

function firstFocus(root: HTMLElement): void {
  const el = root.querySelector<HTMLElement>('[data-focus]');
  if (el) el.focus();
}

// ───────────────────────────── Inicio y listas ─────────────────────────────

export function videoHomeView(): View {
  const lib = app.videos;
  const root = h('div', { class: 'view scroll' }, h('div', { class: 'view-head small' }, h('h1', null, 'Video'), h('div', { class: 'head-sub' }, `${plural(lib.movies.length, 'película', 'películas')} · ${plural(lib.series.length, 'serie', 'series')} · ${app.library.name}`)));
  if (!lib.items.length) {
    root.appendChild(emptyHelp());
    return { el: root };
  }
  const cont = continueWatching(lib);
  if (cont.length) root.appendChild(section('Continuar viendo', cont.map(continueCard)));
  const movies = lib.movies.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 8);
  if (movies.length) root.appendChild(section('Películas agregadas recientemente', movies.map(movieCard)));
  const series = lib.series.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 8);
  if (series.length) root.appendChild(section('Series', series.map(seriesCard)));
  return { el: root, focus: () => firstFocus(root) };
}

export function moviesView(): View {
  const lib = app.videos;
  const root = h('div', { class: 'view scroll' }, h('div', { class: 'view-head small' }, h('h1', null, 'Películas'), h('div', { class: 'head-sub' }, plural(lib.movies.length, 'película', 'películas'))));
  if (!lib.movies.length) root.appendChild(emptyHelp());
  else root.appendChild(h('div', { class: 'vgrid', 'data-group': 'movies' }, lib.movies.map(movieCard)));
  return { el: root, focus: () => firstFocus(root) };
}

export function showsView(): View {
  const lib = app.videos;
  const root = h('div', { class: 'view scroll' }, h('div', { class: 'view-head small' }, h('h1', null, 'Series'), h('div', { class: 'head-sub' }, plural(lib.series.length, 'serie', 'series'))));
  if (!lib.series.length) root.appendChild(emptyHelp());
  else root.appendChild(h('div', { class: 'vgrid', 'data-group': 'shows' }, lib.series.map(seriesCard)));
  return { el: root, focus: () => firstFocus(root) };
}

// ───────────────────────────── Película ─────────────────────────────

export function movieDetailView(id: string): View {
  const v = app.videos.byId[id];
  if (!v) return { el: h('div', { class: 'view empty' }, 'Película no encontrada') };
  const buttons = h('div', { class: 'actions', 'data-group': 'movie-actions' });
  const hero = h('div', { class: 'movie-hero' });
  const render = () => {
    clear(buttons);
    const r = resumable(v.id);
    const p = getProgress(v.id);
    buttons.appendChild(
      h('button', { class: 'btn primary big', focus: true, 'data-key': 'play', onclick: () => playVideo(v, { resume: true }) }, icon('play', 38), r ? `Continuar desde ${clock(r.pos)}` : 'Reproducir'),
    );
    if (r) buttons.appendChild(h('button', { class: 'btn big', focus: true, onclick: () => playVideo(v, { resume: false }) }, icon('refresh', 34), 'Desde el principio'));
    buttons.appendChild(
      h(
        'button',
        { class: 'btn big', focus: true, onclick: () => { setWatched(v.id, !(p && p.done), v.durationMs); render(); } },
        icon('check', 34),
        p && p.done ? 'Marcar como no vista' : 'Marcar como vista',
      ),
    );
  };
  render();
  const meta = [v.year ? String(v.year) : '', durationText(v.durationMs), resolutionText(v), v.vcodec ? v.vcodec.toUpperCase() : ''].filter(Boolean).join('  ·  ');
  hero.appendChild(lazyImage(thumb(v), v.title, 'movie-art', 'play'));
  hero.appendChild(
    h(
      'div',
      { class: 'movie-text' },
      h('div', { class: 'np-kicker' }, 'Película'),
      h('h1', null, v.title),
      h('div', { class: 'head-sub' }, meta),
      h('div', { class: 'movie-tracks' }, v.langs.length ? `Audio: ${v.langs.join(', ')}` : '', v.subs ? `${v.langs.length ? '   ·   ' : ''}Subtítulos: ${v.subs}` : ''),
      buttons,
    ),
  );
  const root = h('div', { class: 'view' }, hero);
  return { el: root, focus: () => (root.querySelector('[data-key="play"]') as HTMLElement | null)?.focus(), update: undefined };
}

// ───────────────────────────── Serie ─────────────────────────────

export function showDetailView(key: string): View {
  const s = app.videos.seriesByKey[key];
  if (!s) return { el: h('div', { class: 'view empty' }, 'Serie no encontrada') };
  const next = nextToWatch(s);
  let season = next.season;
  const seasonsBar = h('div', { class: 'chips', 'data-group': 'seasons' });
  const list = h('div', { class: 'eplist', 'data-group': 'episodes' });
  const actions = h('div', { class: 'actions', 'data-group': 'show-actions' });

  const renderEpisodes = () => {
    clear(list);
    const sn = s.seasons.filter((x) => x.number === season)[0] || s.seasons[0];
    for (const e of sn.episodes) {
      const p = getProgress(e.id);
      const pct = p && !p.done && p.dur > 0 ? Math.min(100, (p.pos / p.dur) * 100) : 0;
      const row = h(
        'div',
        { class: 'ep-row', 'data-key': `ep-${e.id}` },
        h(
          'div',
          { class: 'ep-main', focus: true, 'data-key': `epm-${e.id}`, onclick: () => playVideo(e, { resume: true }) },
          h('div', { class: 'ep-art' }, lazyImage(thumb(e), e.title || s.name, 'ep-img', 'play'), pct > 0 ? h('div', { class: 'vcard-bar' }, h('div', { class: 'vcard-fill', style: { width: `${pct}%` } })) : null),
          h('div', { class: 'ep-num' }, `E${e.episode}`),
          h('div', { class: 'ep-titles' }, h('div', { class: 'ep-title' }, e.title || `Episodio ${e.episode}`), h('div', { class: 'ep-sub' }, [durationText(e.durationMs), resolutionText(e)].filter(Boolean).join(' · '))),
          p && p.done ? h('div', { class: 'ep-done' }, icon('check', 32)) : null,
        ),
        h(
          'div',
          {
            class: 'row-more',
            focus: true,
            'data-key': `epx-${e.id}`,
            onclick: () =>
              openMenu(episodeTitle(e), [
                { label: 'Reproducir desde el principio', icon: 'play', run: () => playVideo(e, { resume: false }) },
                p && p.done
                  ? { label: 'Marcar como no visto', icon: 'check', run: () => { setWatched(e.id, false); renderEpisodes(); } }
                  : { label: 'Marcar como visto', icon: 'check', run: () => { setWatched(e.id, true, e.durationMs); renderEpisodes(); } },
              ]),
          },
          icon('more', 34),
        ),
      );
      list.appendChild(row);
    }
  };

  const renderSeasons = () => {
    clear(seasonsBar);
    for (const sn of s.seasons) {
      seasonsBar.appendChild(
        h(
          'div',
          { class: `chip${sn.number === season ? ' on' : ''}`, focus: true, 'data-key': `season-${sn.number}`, onclick: () => { season = sn.number; renderSeasons(); renderEpisodes(); (seasonsBar.querySelector(`[data-key="season-${sn.number}"]`) as HTMLElement | null)?.focus(); } },
          sn.number ? `Temporada ${sn.number}` : 'Especiales',
        ),
      );
    }
  };

  const renderActions = () => {
    clear(actions);
    const n = nextToWatch(s);
    const r = resumable(n.id);
    const label = r ? `Continuar T${n.season} E${n.episode} (${clock(r.pos)})` : seriesProgress(s).watched ? `Siguiente: T${n.season} E${n.episode}` : `Reproducir T${n.season} E${n.episode}`;
    actions.appendChild(h('button', { class: 'btn primary big', focus: true, 'data-key': 'play', onclick: () => playVideo(n, { resume: true }) }, icon('play', 38), label));
  };

  renderActions();
  renderSeasons();
  renderEpisodes();
  const pr = seriesProgress(s);
  const root = h(
    'div',
    { class: 'view scroll' },
    h(
      'div',
      { class: 'view-head' },
      lazyImage(app.conn ? videoImageUrl(app.conn, s.cover.id, true) : null, s.name, 'head-art', 'play'),
      h('div', { class: 'head-text' }, h('div', { class: 'np-kicker' }, 'Serie'), h('h1', null, s.name), h('div', { class: 'head-sub' }, `${plural(s.seasons.length, 'temporada', 'temporadas')} · ${plural(s.episodes.length, 'episodio', 'episodios')}${pr.watched ? ` · ${pr.watched} vistos` : ''}`), actions),
    ),
    seasonsBar,
    list,
  );
  return { el: root, focus: () => (root.querySelector('[data-key="play"]') as HTMLElement | null)?.focus() };
}
