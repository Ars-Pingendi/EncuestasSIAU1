import { useEffect } from 'react';
import { api, isWindows } from './api';
import { ContextMenu, DialogHost, Toasts } from './components/Common';
import { NowPlaying } from './components/NowPlaying';
import { PlayerBar } from './components/PlayerBar';
import { QueuePanel } from './components/QueuePanel';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { useStore } from './lib/store';
import { data } from './state/data';
import { navigate, goBack, ui, type Route } from './state/ui';
import { next, player, previous, seekBy, setVolume, toggleMute, togglePlay } from './state/player';
import { FavoritesView, PlaylistsView, PlaylistView, SmartView } from './views/Collections';
import { EqualizerView } from './views/Equalizer';
import { AlbumsView, AlbumView, ArtistsView, ArtistView, GroupsView, GroupView, SongsView } from './views/Library';
import { SearchView } from './views/Search';
import { SettingsView } from './views/Settings';
import { YouTubeView } from './views/YouTube';

function View({ route }: { route: Route }) {
  switch (route.view) {
    case 'songs': return <SongsView />;
    case 'albums': return <AlbumsView />;
    case 'album': return <AlbumView albumKey={route.key} />;
    case 'artists': return <ArtistsView />;
    case 'artist': return <ArtistView artistKey={route.key} />;
    case 'genres': return <GroupsView kind="genres" />;
    case 'genre': return <GroupView kind="genre" groupKey={route.key} />;
    case 'folders': return <GroupsView kind="folders" />;
    case 'folder': return <GroupView kind="folder" groupKey={route.key} />;
    case 'favorites': return <FavoritesView />;
    case 'playlists': return <PlaylistsView />;
    case 'playlist': return <PlaylistView id={route.id} />;
    case 'smart': return <SmartView id={route.id} />;
    case 'search': return <SearchView q={route.q} />;
    case 'youtube': return <YouTubeView />;
    case 'equalizer': return <EqualizerView />;
    case 'settings': return <SettingsView />;
  }
}

function useTheme() {
  const theme = useStore(data, (s) => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      api.setTitleBarColors(dark ? { color: '#12101a', symbolColor: '#e8e3f3' } : { color: '#f6f4fb', symbolColor: '#2a2438' });
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        ui.set({ nowPlaying: false });
        window.dispatchEvent(new Event('pipo:focus-search'));
        return;
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        navigate({ view: 'equalizer' });
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
        return;
      }
      if (e.key === 'Escape' && !ui.get().menu && !ui.get().dialog && ui.get().nowPlaying) {
        ui.set({ nowPlaying: false });
        return;
      }
      const range = (e.target as HTMLElement | null)?.getAttribute?.('type') === 'range';
      if (isTyping(e) && !(range && e.key === ' ')) return;
      if (e.key === ' ' && !(e.target as HTMLElement)?.closest?.('button')) {
        e.preventDefault();
        void togglePlay();
      } else if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        void next();
      } else if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        void previous();
      } else if (e.ctrlKey && e.key === 'ArrowUp') {
        e.preventDefault();
        setVolume(player.get().volume + 0.05);
      } else if (e.ctrlKey && e.key === 'ArrowDown') {
        e.preventDefault();
        setVolume(player.get().volume - 0.05);
      } else if (!e.ctrlKey && !e.altKey && e.key === 'ArrowRight' && !range) {
        seekBy(5000);
      } else if (!e.ctrlKey && !e.altKey && e.key === 'ArrowLeft' && !range) {
        seekBy(-5000);
      } else if (!e.ctrlKey && e.key.toLowerCase() === 'm') {
        toggleMute();
      }
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) goBack();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, []);
}

export function App() {
  const stack = useStore(ui, (s) => s.stack);
  const route = stack[stack.length - 1];
  useTheme();
  useShortcuts();
  return (
    <div className={`app ${isWindows ? 'win' : ''}`} onContextMenu={(e) => (e.target as HTMLElement).closest('input, textarea') || e.preventDefault()}>
      <Sidebar />
      <main className="main">
        <TopBar />
        <div className="content">
          <div className="scroll main-scroll" key={JSON.stringify(route)}>
            <View route={route} />
          </div>
          <QueuePanel />
        </div>
      </main>
      <PlayerBar />
      <NowPlaying />
      <ContextMenu />
      <DialogHost />
      <Toasts />
    </div>
  );
}
