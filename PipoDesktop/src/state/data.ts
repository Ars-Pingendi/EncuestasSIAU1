// Datos del usuario: listas, favoritos, estadísticas y ajustes (guardados en disco por la app).
import type { Track } from '../../shared/types';
import { api } from '../api';
import type { SongSort } from '../lib/group';
import { createStore, debounce } from '../lib/store';
import { uid } from '../lib/format';

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface UserData {
  playlists: Playlist[];
  favTracks: string[];
  favAlbums: string[];
  stats: Record<string, { plays: number; last: number }>;
  /** Canciones de YouTube guardadas en listas, favoritos, cola o historial. */
  remote: Record<string, Track>;
}

export type Theme = 'system' | 'dark' | 'light';

export interface Settings {
  theme: Theme;
  songSort: SongSort;
  albumSort: 'title' | 'artist' | 'year';
  volume: number;
  muted: boolean;
  ytKind: 'songs' | 'videos';
}

const DEFAULT_USER: UserData = { playlists: [], favTracks: [], favAlbums: [], stats: {}, remote: {} };
const DEFAULT_SETTINGS: Settings = { theme: 'system', songSort: 'title', albumSort: 'title', volume: 0.8, muted: false, ytKind: 'songs' };

export const data = createStore<{ user: UserData; settings: Settings }>({ user: DEFAULT_USER, settings: DEFAULT_SETTINGS });

const saveUser = debounce(() => void api.storeSet('usuario', data.get().user), 300);
const saveSettings = debounce(() => void api.storeSet('ajustes', data.get().settings), 300);

export async function initData() {
  const [user, settings] = await Promise.all([api.storeGet<UserData>('usuario'), api.storeGet<Settings>('ajustes')]);
  data.set({
    user: { ...DEFAULT_USER, ...(user ?? {}) },
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
  });
}

export function updateUser(fn: (u: UserData) => Partial<UserData>) {
  data.set((s) => ({ user: { ...s.user, ...fn(s.user) } }));
  saveUser();
}

export function updateSettings(patch: Partial<Settings>) {
  data.set((s) => ({ settings: { ...s.settings, ...patch } }));
  saveSettings();
}

/** Guarda los datos de una canción de YouTube para poder mostrarla más tarde. */
export function rememberRemote(tracks: Track[]) {
  const yt = tracks.filter((t) => t.source === 'youtube');
  if (!yt.length) return;
  const remote = data.get().user.remote;
  if (yt.every((t) => remote[t.id] && remote[t.id].title === t.title)) return;
  updateUser((u) => ({ remote: { ...u.remote, ...Object.fromEntries(yt.map((t) => [t.id, { ...remote[t.id], ...t }])) } }));
}

// ── Favoritos ──

export function isFavTrack(id: string) {
  return data.get().user.favTracks.includes(id);
}

export function toggleFavTrack(t: Track): boolean {
  rememberRemote([t]);
  const fav = isFavTrack(t.id);
  updateUser((u) => ({ favTracks: fav ? u.favTracks.filter((x) => x !== t.id) : [t.id, ...u.favTracks] }));
  return !fav;
}

export function toggleFavAlbum(key: string): boolean {
  const fav = data.get().user.favAlbums.includes(key);
  updateUser((u) => ({ favAlbums: fav ? u.favAlbums.filter((x) => x !== key) : [key, ...u.favAlbums] }));
  return !fav;
}

// ── Listas ──

export function createPlaylist(name: string, tracks: Track[] = []): Playlist {
  rememberRemote(tracks);
  const p: Playlist = { id: uid(), name: name.trim() || 'Nueva lista', trackIds: tracks.map((t) => t.id), createdAt: Date.now(), updatedAt: Date.now() };
  updateUser((u) => ({ playlists: [...u.playlists, p] }));
  return p;
}

export function renamePlaylist(id: string, name: string) {
  updateUser((u) => ({ playlists: u.playlists.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name, updatedAt: Date.now() } : p)) }));
}

export function deletePlaylist(id: string) {
  updateUser((u) => ({ playlists: u.playlists.filter((p) => p.id !== id) }));
}

/** Agrega canciones a una lista (sin duplicados). Devuelve cuántas se agregaron. */
export function addToPlaylist(id: string, tracks: Track[]): number {
  rememberRemote(tracks);
  let added = 0;
  updateUser((u) => ({
    playlists: u.playlists.map((p) => {
      if (p.id !== id) return p;
      const set = new Set(p.trackIds);
      const extra = tracks.map((t) => t.id).filter((x) => !set.has(x) && (set.add(x), true));
      added = extra.length;
      return { ...p, trackIds: [...p.trackIds, ...extra], updatedAt: Date.now() };
    }),
  }));
  return added;
}

export function removeFromPlaylist(id: string, index: number) {
  updateUser((u) => ({
    playlists: u.playlists.map((p) => (p.id === id ? { ...p, trackIds: p.trackIds.filter((_, i) => i !== index), updatedAt: Date.now() } : p)),
  }));
}

export function movePlaylistItem(id: string, from: number, to: number) {
  updateUser((u) => ({
    playlists: u.playlists.map((p) => {
      if (p.id !== id) return p;
      const ids = [...p.trackIds];
      const [x] = ids.splice(from, 1);
      ids.splice(to, 0, x);
      return { ...p, trackIds: ids, updatedAt: Date.now() };
    }),
  }));
}

// ── Estadísticas ──

export function countPlay(t: Track) {
  rememberRemote([t]);
  updateUser((u) => {
    const prev = u.stats[t.id] ?? { plays: 0, last: 0 };
    return { stats: { ...u.stats, [t.id]: { plays: prev.plays + 1, last: Date.now() } } };
  });
}
