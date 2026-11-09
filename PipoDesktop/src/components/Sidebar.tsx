import { useStore } from '../lib/store';
import { data } from '../state/data';
import { lib } from '../state/library';
import { currentRoute, navigate, ui, type Route } from '../state/ui';
import { openNewPlaylist } from './Dialogs';
import { Icon } from './Icon';

function Item({ route, icon, label, extra }: { route: Route; icon: string; label: string; extra?: string }) {
  useStore(ui, (s) => s.stack);
  const cur = currentRoute();
  const active =
    JSON.stringify(cur) === JSON.stringify(route) ||
    (route.view === 'albums' && cur.view === 'album') ||
    (route.view === 'artists' && cur.view === 'artist') ||
    (route.view === 'genres' && cur.view === 'genre') ||
    (route.view === 'folders' && cur.view === 'folder');
  return (
    <button type="button" className={`nav-item ${active ? 'active' : ''}`} onClick={() => navigate(route)}>
      <Icon name={icon} size={20} />
      <span className="grow ellipsis">{label}</span>
      {extra && <span className="nav-extra">{extra}</span>}
    </button>
  );
}

export function Sidebar() {
  const playlists = useStore(data, (s) => s.user.playlists);
  const progress = useStore(lib, (s) => s.progress);
  return (
    <nav className="sidebar">
      <div className="brand">
        <img src="./icon.png" alt="" width={30} height={30} />
        <span>Pipo Music Player</span>
      </div>
      <div className="nav-scroll scroll-thin">
        <div className="nav-section">Biblioteca</div>
        <Item route={{ view: 'songs' }} icon="note" label="Canciones" />
        <Item route={{ view: 'albums' }} icon="album" label="Álbumes" />
        <Item route={{ view: 'artists' }} icon="person" label="Artistas" />
        <Item route={{ view: 'genres' }} icon="genre" label="Géneros" />
        <Item route={{ view: 'folders' }} icon="folder" label="Carpetas" />

        <div className="nav-section">Colecciones</div>
        <Item route={{ view: 'favorites' }} icon="heart" label="Favoritos" />
        <Item route={{ view: 'smart', id: 'recent' }} icon="newRelease" label="Agregadas recientemente" />
        <Item route={{ view: 'smart', id: 'top' }} icon="trending" label="Más reproducidas" />
        <Item route={{ view: 'smart', id: 'played' }} icon="history" label="Reproducidas recientemente" />
        <Item route={{ view: 'smart', id: 'downloads' }} icon="downloadDone" label="Descargadas de YouTube" />

        <div className="nav-section with-action">
          <span>Mis listas</span>
          <button type="button" className="icon-btn small" title="Nueva lista" onClick={() => openNewPlaylist([], (id) => navigate({ view: 'playlist', id }))}>
            <Icon name="add" size={18} />
          </button>
        </div>
        <Item route={{ view: 'playlists' }} icon="playlist" label="Todas las listas" />
        {playlists.map((p) => (
          <Item key={p.id} route={{ view: 'playlist', id: p.id }} icon="queue" label={p.name} extra={String(p.trackIds.length)} />
        ))}

        <div className="nav-section">Más</div>
        <Item route={{ view: 'youtube' }} icon="youtube" label="YouTube" />
        <Item route={{ view: 'equalizer' }} icon="equalizer" label="Ecualizador" />
        <Item route={{ view: 'settings' }} icon="settings" label="Ajustes" />
      </div>
      {progress.scanning && (
        <div className="scan-status">
          <div className="spinner" />
          <span>
            Buscando música… {progress.total ? `${progress.done} de ${progress.total}` : ''}
          </span>
        </div>
      )}
    </nav>
  );
}
