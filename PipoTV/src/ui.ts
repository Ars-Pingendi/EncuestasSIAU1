// Estructura de la app: menú lateral, contenido, barra de reproducción, avisos y menús.
import type { TvTrack } from './api';
import { lazyImage } from './components/images';
import { clear, formatTime, h, icon } from './dom';
import { artistOf } from './library';
import { focus, focusables } from './nav';
import { addToQueue, app, art, current, next, player, playNext, previous, togglePlay } from './state';

export interface View {
  el: HTMLElement;
  focus?(): void;
  update?(): void;
  destroy?(): void;
}

export interface Route {
  view: string;
  key?: string;
}

type ViewFactory = (route: Route) => View;
let factory: ViewFactory;
const stack: { route: Route; focusKey: string | null }[] = [];
let currentView: View | null = null;

let root: HTMLElement;
let content: HTMLElement;
let sidebar: HTMLElement;
let barTitle: HTMLElement, barArtist: HTMLElement, barArt: HTMLElement, barPlay: HTMLElement, barTime: HTMLElement, barFill: HTMLElement;
let barArtKey = '';
let toastEl: HTMLElement;
let overlay: HTMLElement;

const NAV: { view: string; label: string; icon: string }[] = [
  { view: 'songs', label: 'Canciones', icon: 'note' },
  { view: 'albums', label: 'Álbumes', icon: 'album' },
  { view: 'artists', label: 'Artistas', icon: 'person' },
  { view: 'genres', label: 'Géneros', icon: 'genre' },
  { view: 'playlists', label: 'Listas', icon: 'playlist' },
  { view: 'recent', label: 'Recientes', icon: 'history' },
  { view: 'queue', label: 'Cola', icon: 'queue' },
  { view: 'equalizer', label: 'Ecualizador', icon: 'equalizer' },
  { view: 'settings', label: 'Ajustes', icon: 'settings' },
];

export function mountShell(container: HTMLElement, make: ViewFactory) {
  factory = make;
  clear(container);
  sidebar = h(
    'nav',
    { class: 'sidebar', 'data-group': 'nav' },
    h('div', { class: 'brand' }, h('img', { src: 'largeIcon.png', alt: '' }), h('span', null, 'Pipo')),
    NAV.map((n) =>
      h('div', { class: 'nav-item', focus: true, 'data-key': `nav-${n.view}`, 'data-view': n.view, onclick: () => navigate({ view: n.view }, true) }, icon(n.icon, 38), h('span', null, n.label)),
    ),
  );
  content = h('main', { class: 'content', 'data-group': 'content' });
  barArt = h('div', { class: 'bar-art' });
  barTitle = h('div', { class: 'bar-title' }, 'Elige una canción');
  barArtist = h('div', { class: 'bar-artist' }, '');
  barTime = h('div', { class: 'bar-time' }, '');
  barFill = h('div', { class: 'bar-fill' });
  barPlay = h('button', { class: 'bar-btn play', focus: true, 'data-key': 'bar-play', onclick: () => togglePlay() }, icon('play', 48));
  const bar = h(
    'footer',
    { class: 'bar', 'data-group': 'bar' },
    h('div', { class: 'bar-now', focus: true, 'data-key': 'bar-now', onclick: () => current() && openNowPlaying() }, barArt, h('div', { class: 'bar-text' }, barTitle, barArtist)),
    h('button', { class: 'bar-btn', focus: true, 'data-key': 'bar-prev', onclick: () => previous() }, icon('prev', 44)),
    barPlay,
    h('button', { class: 'bar-btn', focus: true, 'data-key': 'bar-next', onclick: () => next() }, icon('next', 44)),
    h('div', { class: 'bar-progress' }, h('div', { class: 'bar-track' }, barFill), barTime),
  );
  toastEl = h('div', { class: 'toast' });
  overlay = h('div', { class: 'overlay' });
  root = h('div', { class: 'shell' }, h('div', { class: 'body' }, sidebar, content), bar, overlay, toastEl);
  container.appendChild(root);
}

export function navigate(route: Route, fromNav = false) {
  const active = document.activeElement as HTMLElement | null;
  if (fromNav) stack.length = 0;
  else if (stack.length) stack[stack.length - 1].focusKey = active?.getAttribute('data-key') ?? null;
  stack.push({ route, focusKey: null });
  show(route, !fromNav);
}

function show(route: Route, focusContent: boolean, focusKey: string | null = null) {
  if (currentView?.destroy) currentView.destroy();
  currentView = factory(route);
  clear(content);
  content.appendChild(currentView.el);
  const root = stack.length ? stack[0].route.view : route.view;
  const items = sidebar.querySelectorAll<HTMLElement>('.nav-item');
  for (let i = 0; i < items.length; i++) items[i].classList.toggle('active', items[i].getAttribute('data-view') === root);
  setTimeout(() => {
    if (focusKey) {
      const el = content.querySelector<HTMLElement>(`[data-key="${focusKey}"]`);
      if (el) return focus(el);
    }
    if (focusContent) {
      if (currentView?.focus) currentView.focus();
      else focus(focusables(content)[0]);
    }
  }, 30);
}

/** Atrás: cierra el menú, «Reproduciendo» o vuelve a la pantalla anterior. Devuelve false en la raíz. */
export function back(): boolean {
  if (overlay.firstChild) {
    closeOverlay();
    return true;
  }
  if (stack.length > 1) {
    stack.pop();
    const prev = stack[stack.length - 1];
    show(prev.route, false, prev.focusKey);
    return true;
  }
  // En la raíz, el foco vuelve primero al menú lateral.
  const active = document.activeElement as HTMLElement | null;
  if (active && !sidebar.contains(active)) {
    focus(sidebar.querySelector<HTMLElement>('.nav-item.active') || sidebar.querySelector<HTMLElement>('.nav-item'));
    return true;
  }
  return false;
}

export function update() {
  const t = current();
  barTitle.textContent = t ? t.title : 'Elige una canción';
  barArtist.textContent = t ? artistOf(t) : 'Pulsa OK en cualquier canción';
  const key = t ? t.id : '';
  if (key !== barArtKey) {
    barArtKey = key;
    clear(barArt);
    if (t) barArt.appendChild(lazyImage(art(t), t.album || t.title, 'bar-img'));
  }
  clear(barPlay);
  barPlay.appendChild(icon(player.playing ? 'pause' : 'play', 48));
  barTime.textContent = t ? `${formatTime(player.position)} / ${formatTime(player.duration)}` : '';
  barFill.style.width = `${player.duration > 0 ? Math.min(100, (player.position / player.duration) * 100) : 0}%`;
  toastEl.textContent = app.toast;
  toastEl.className = `toast${app.toast ? ' show' : ''}`;
  if (currentView?.update) currentView.update();
  if (overlayView?.update) overlayView.update();
}

// ───────────────────────────── Capas: menú y «Reproduciendo» ─────────────────────────────

let overlayView: View | null = null;
let returnFocus: HTMLElement | null = null;

export function openOverlay(view: View, modal = true) {
  closeOverlay(false);
  returnFocus = document.activeElement as HTMLElement | null;
  overlayView = view;
  if (modal) view.el.setAttribute('data-modal', '');
  overlay.appendChild(view.el);
  root.classList.add('overlay-open');
  setTimeout(() => (view.focus ? view.focus() : focus(focusables(view.el)[0])), 30);
}

export function closeOverlay(restore = true) {
  if (overlayView?.destroy) overlayView.destroy();
  overlayView = null;
  clear(overlay);
  root.classList.remove('overlay-open');
  if (restore && returnFocus && document.body.contains(returnFocus)) focus(returnFocus);
}

let nowFactory: (() => View) | null = null;
export function setNowPlayingFactory(f: () => View) {
  nowFactory = f;
}
export function openNowPlaying() {
  if (nowFactory) openOverlay(nowFactory());
}

export function openMenu(title: string, items: { label: string; icon: string; run: () => void }[]) {
  const el = h(
    'div',
    { class: 'menu-layer' },
    h(
      'div',
      { class: 'menu' },
      h('div', { class: 'menu-title' }, title),
      items.map((it) =>
        h('div', { class: 'menu-item', focus: true, onclick: () => (closeOverlay(), it.run()) }, icon(it.icon, 34), h('span', null, it.label)),
      ),
    ),
  );
  openOverlay({ el });
}

export function openTrackMenu(t: TvTrack) {
  const lib = app.library;
  const albumKey = (t.albumArtist ? `aa:${t.albumArtist}|${t.album}` : `f:${t.folder}|${t.album}`).toLowerCase();
  openMenu(t.title, [
    { label: 'Reproducir a continuación', icon: 'next', run: () => playNext([t]) },
    { label: 'Agregar a la cola', icon: 'queue', run: () => addToQueue([t]) },
    ...(lib.albums.some((a) => a.key === albumKey) ? [{ label: 'Ir al álbum', icon: 'album', run: () => navigate({ view: 'album', key: albumKey }) }] : []),
    { label: 'Ir al artista', icon: 'person', run: () => navigate({ view: 'artist', key: artistOf(t).toLowerCase() }) },
  ]);
}

export function confirmExit() {
  openMenu('¿Salir de Pipo?', [
    { label: 'Salir', icon: 'check', run: () => window.close() },
    { label: 'Seguir escuchando', icon: 'play', run: () => undefined },
  ]);
}
