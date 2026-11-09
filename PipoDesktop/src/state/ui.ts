// Navegación, avisos, menús y diálogos.
import type { ReactNode } from 'react';
import type { Track } from '../../shared/types';
import { createStore } from '../lib/store';

export type Route =
  | { view: 'songs' }
  | { view: 'albums' }
  | { view: 'album'; key: string }
  | { view: 'artists' }
  | { view: 'artist'; key: string }
  | { view: 'genres' }
  | { view: 'genre'; key: string }
  | { view: 'folders' }
  | { view: 'folder'; key: string }
  | { view: 'favorites' }
  | { view: 'playlists' }
  | { view: 'playlist'; id: string }
  | { view: 'smart'; id: SmartId }
  | { view: 'search'; q: string }
  | { view: 'youtube' }
  | { view: 'equalizer' }
  | { view: 'settings' };

export type SmartId = 'recent' | 'top' | 'played' | 'downloads';

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  run?: () => void;
  separator?: boolean;
}

export interface UiState {
  stack: Route[];
  nowPlaying: boolean;
  queueOpen: boolean;
  toasts: Toast[];
  menu: { x: number; y: number; items: MenuItem[] } | null;
  dialog: ReactNode | null;
  searchText: string;
  addToPlaylist: Track[] | null;
}

export const ui = createStore<UiState>({
  stack: [{ view: 'songs' }],
  nowPlaying: false,
  queueOpen: false,
  toasts: [],
  menu: null,
  dialog: null,
  searchText: '',
  addToPlaylist: null,
});

export function currentRoute(): Route {
  const s = ui.get().stack;
  return s[s.length - 1];
}

const ROOTS = new Set(['songs', 'albums', 'artists', 'genres', 'folders', 'favorites', 'playlists', 'youtube', 'equalizer', 'settings']);

export function navigate(route: Route) {
  ui.set((s) => {
    const top = s.stack[s.stack.length - 1];
    if (JSON.stringify(top) === JSON.stringify(route)) return { nowPlaying: false };
    if (ROOTS.has(route.view)) return { stack: [route], nowPlaying: false };
    if (route.view === 'search' && top.view === 'search') return { stack: [...s.stack.slice(0, -1), route], nowPlaying: false };
    return { stack: [...s.stack, route].slice(-30), nowPlaying: false };
  });
}

export function goBack() {
  ui.set((s) => {
    if (s.nowPlaying) return { nowPlaying: false };
    return s.stack.length > 1 ? { stack: s.stack.slice(0, -1) } : {};
  });
}

let toastId = 0;
export function toast(text: string, action?: Toast['action'], ms = 4000) {
  const id = ++toastId;
  ui.set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, action }] }));
  setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function openMenu(e: { clientX: number; clientY: number }, items: MenuItem[]) {
  ui.set({ menu: { x: e.clientX, y: e.clientY, items } });
}

export function closeMenu() {
  ui.set({ menu: null });
}

export function openDialog(node: ReactNode) {
  ui.set({ dialog: node });
}

export function closeDialog() {
  ui.set({ dialog: null });
}
