// Agrupaciones de la biblioteca: álbumes, artistas, géneros y carpetas.
import type { Track } from '../../shared/types';
import { collator } from './format';

export const UNKNOWN_ARTIST = 'Artista desconocido';
export const UNKNOWN_GENRE = 'Sin género';

export interface Album {
  key: string;
  title: string;
  artist: string;
  year: number;
  cover?: Track;
  tracks: Track[];
  durationMs: number;
}

export interface Artist {
  key: string;
  name: string;
  tracks: Track[];
  albums: Album[];
  cover?: Track;
}

export interface Group {
  key: string;
  name: string;
  subtitle?: string;
  tracks: Track[];
  cover?: Track;
}

export function artistOf(t: Track): string {
  return t.artist || t.albumArtist || UNKNOWN_ARTIST;
}

export function albumKey(t: Track): string {
  const a = t.album.toLowerCase();
  return t.albumArtist ? `aa:${t.albumArtist.toLowerCase()}|${a}` : `f:${t.folder.toLowerCase()}|${a}`;
}

export function byDiscTrack(a: Track, b: Track) {
  return a.discNo - b.discNo || a.trackNo - b.trackNo || collator.compare(a.fileName || a.title, b.fileName || b.title);
}

export function buildAlbums(tracks: Track[]): Album[] {
  const map = new Map<string, Track[]>();
  for (const t of tracks) {
    if (t.source !== 'local') continue;
    const k = albumKey(t);
    const list = map.get(k);
    if (list) list.push(t);
    else map.set(k, [t]);
  }
  const albums: Album[] = [];
  for (const [key, list] of map) {
    list.sort(byDiscTrack);
    const counts = new Map<string, number>();
    for (const t of list) counts.set(artistOf(t), (counts.get(artistOf(t)) ?? 0) + 1);
    const first = list[0];
    const artist = first.albumArtist || (counts.size > 2 ? 'Varios artistas' : [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    albums.push({
      key,
      title: first.album,
      artist,
      year: Math.max(...list.map((t) => t.year || 0)),
      cover: list.find((t) => t.artId),
      tracks: list,
      durationMs: list.reduce((s, t) => s + t.durationMs, 0),
    });
  }
  return albums.sort((a, b) => collator.compare(a.title, b.title));
}

export function buildArtists(tracks: Track[], albums: Album[]): Artist[] {
  const map = new Map<string, Artist>();
  for (const t of tracks) {
    if (t.source !== 'local') continue;
    const name = artistOf(t);
    const key = name.toLowerCase();
    let a = map.get(key);
    if (!a) map.set(key, (a = { key, name, tracks: [], albums: [] }));
    a.tracks.push(t);
    if (!a.cover && t.artId) a.cover = t;
  }
  for (const al of albums) {
    const keys = new Set(al.tracks.map((t) => artistOf(t).toLowerCase()));
    for (const k of keys) map.get(k)?.albums.push(al);
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
}

export function buildGenres(tracks: Track[]): Group[] {
  const map = new Map<string, Group>();
  for (const t of tracks) {
    if (t.source !== 'local') continue;
    const name = t.genre || UNKNOWN_GENRE;
    const key = name.toLowerCase();
    let g = map.get(key);
    if (!g) map.set(key, (g = { key, name, tracks: [] }));
    g.tracks.push(t);
    if (!g.cover && t.artId) g.cover = t;
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
}

export function buildFolders(tracks: Track[]): Group[] {
  const map = new Map<string, Group>();
  for (const t of tracks) {
    if (t.source !== 'local') continue;
    const key = t.folder.toLowerCase();
    let g = map.get(key);
    if (!g) {
      const parts = t.folder.split(/[\\/]/).filter(Boolean);
      map.set(key, (g = { key, name: parts[parts.length - 1] || t.folder, subtitle: t.folder, tracks: [] }));
    }
    g.tracks.push(t);
    if (!g.cover && t.artId) g.cover = t;
  }
  for (const g of map.values()) g.tracks.sort((a, b) => collator.compare(a.fileName, b.fileName));
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.subtitle ?? '', b.subtitle ?? ''));
}

export type SongSort = 'title' | 'artist' | 'album' | 'recent' | 'duration';

export function sortTracks(list: Track[], sort: SongSort): Track[] {
  const out = [...list];
  switch (sort) {
    case 'title':
      return out.sort((a, b) => collator.compare(a.title, b.title));
    case 'artist':
      return out.sort((a, b) => collator.compare(artistOf(a), artistOf(b)) || collator.compare(a.album, b.album) || byDiscTrack(a, b));
    case 'album':
      return out.sort((a, b) => collator.compare(a.album, b.album) || byDiscTrack(a, b));
    case 'recent':
      return out.sort((a, b) => b.addedAt - a.addedAt);
    case 'duration':
      return out.sort((a, b) => b.durationMs - a.durationMs);
  }
}
