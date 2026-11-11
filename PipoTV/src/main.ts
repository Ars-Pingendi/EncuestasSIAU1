import './polyfills';
import './styles.css';
import { forgetConnection, loadLibrary, savedConnection, Unauthorized, type Connection } from './api';
import { engine } from './audio';
import { h } from './dom';
import { installKeys } from './nav';
import { app, applyEq, emit, eq, initPlayer, next, onChange, previous, restoreQueue, seekBy, togglePlay } from './state';
import { back, confirmExit, mountShell, navigate, openNowPlaying, setNowPlayingFactory, update, type Route, type View } from './ui';
import { connectScreen } from './views/connect';
import { equalizerView } from './views/eq';
import { albumsView, artistsView, genresView, groupView, playlistsView, playlistView, recentView, songsView } from './views/library';
import { nowPlayingView, queueView } from './views/now';
import { settingsView } from './views/settings';

const root = document.getElementById('app')!;
let shellReady = false;

function makeView(route: Route): View {
  switch (route.view) {
    case 'songs': return songsView();
    case 'albums': return albumsView();
    case 'artists': return artistsView();
    case 'genres': return genresView();
    case 'album':
    case 'artist':
    case 'genre': return groupView(route.view, route.key || '');
    case 'playlists': return playlistsView();
    case 'playlist': return playlistView(route.key || '');
    case 'recent': return recentView();
    case 'queue': return queueView();
    case 'equalizer': return equalizerView();
    case 'settings': return settingsView({ reload: () => void start(app.conn!), forget: reconnect });
    default: return songsView();
  }
}

function reconnect() {
  engine.stop();
  forgetConnection();
  shellReady = false;
  connectScreen(root, (c) => void start(c));
}

function loading(text: string) {
  while (root.firstChild) root.removeChild(root.firstChild);
  root.appendChild(h('div', { class: 'loading' }, h('img', { src: 'largeIcon.png', alt: '' }), h('div', { class: 'spinner' }), h('div', null, text)));
}

async function start(conn: Connection) {
  app.conn = conn;
  if (!shellReady) loading(`Cargando la música de «${conn.name}»…`);
  try {
    const payload = await loadLibrary(conn);
    app.library.load(payload);
  } catch (err) {
    if (err instanceof Unauthorized) {
      forgetConnection();
      connectScreen(root, (c) => void start(c), 'La TV ya no está emparejada. Escribe de nuevo el código que muestra Pipo en el PC o en el teléfono.');
      return;
    }
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(
      h(
        'div',
        { class: 'connect' },
        h('img', { class: 'connect-logo', src: 'largeIcon.png', alt: '' }),
        h('h1', null, 'No hay conexión'),
        h('p', { class: 'lead' }, (err as Error).message),
        h(
          'div',
          { class: 'form', 'data-group': 'form' },
          h('button', { class: 'btn primary big', focus: true, onclick: () => void start(conn) }, 'Reintentar'),
          h('button', { class: 'btn big', focus: true, onclick: reconnect }, 'Conectar con otro equipo'),
        ),
      ),
    );
    setTimeout(() => (root.querySelector('[data-focus]') as HTMLElement | null)?.focus(), 50);
    shellReady = false;
    return;
  }
  if (!shellReady) {
    mountShell(root, makeView);
    shellReady = true;
    restoreQueue();
    navigate({ view: 'songs' }, true);
    setTimeout(() => (root.querySelector('.nav-item') as HTMLElement | null)?.focus(), 60);
  } else {
    navigate({ view: 'settings' }, true);
  }
  emit();
}

function boot() {
  initPlayer();
  setNowPlayingFactory(nowPlayingView);
  applyEq();
  onChange(() => {
    if (shellReady) update();
  });
  installKeys({
    back: () => {
      if (!shellReady) return;
      if (!back()) confirmExit();
    },
    playPause: () => togglePlay(),
    play: () => (engine.el.paused ? togglePlay() : undefined),
    pause: () => engine.pause(),
    next: () => next(),
    previous: () => previous(),
    seek: (ms) => seekBy(ms),
  });
  // Al empezar a sonar desde una lista se abre «Reproduciendo» la primera vez.
  let opened = false;
  engine.el.addEventListener('playing', () => {
    if (!opened && shellReady) {
      opened = true;
      openNowPlaying();
    }
  });
  void eq;
  const conn = savedConnection();
  if (conn) void start(conn);
  else connectScreen(root, (c) => void start(c));
}

boot();
