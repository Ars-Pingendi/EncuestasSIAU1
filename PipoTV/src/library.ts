// Biblioteca recibida del PC y sus agrupaciones.
import type { LibraryPayload, TvPlaylist, TvTrack } from './api';

export const UNKNOWN_ARTIST = 'Artista desconocido';

export interface Group {
  key: string;
  name: string;
  subtitle: string;
  art: string | null;
  tracks: TvTrack[];
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byText = (a: string, b: string) => collator.compare(a, b);

export function artistOf(t: TvTrack) {
  return t.artist || t.albumArtist || UNKNOWN_ARTIST;
}

function byDiscTrack(a: TvTrack, b: TvTrack) {
  return a.discNo - b.discNo || a.trackNo - b.trackNo || byText(a.title, b.title);
}

export class Library {
  tracks: TvTrack[] = [];
  byId: { [id: string]: TvTrack } = {};
  albums: Group[] = [];
  artists: Group[] = [];
  genres: Group[] = [];
  playlists: TvPlaylist[] = [];
  favorites: TvTrack[] = [];
  name = '';

  load(p: LibraryPayload) {
    this.name = p.name;
    this.tracks = p.tracks.slice().sort((a, b) => byText(a.title, b.title));
    this.byId = {};
    for (const t of this.tracks) this.byId[t.id] = t;
    this.albums = this.group(
      (t) => (t.albumArtist ? `aa:${t.albumArtist}|${t.album}` : `f:${t.folder}|${t.album}`).toLowerCase(),
      (list) => list[0].album || 'Sin álbum',
      (list) => {
        const first = list[0];
        const artists: { [k: string]: number } = {};
        for (const t of list) artists[artistOf(t)] = (artists[artistOf(t)] || 0) + 1;
        const names = Object.keys(artists);
        const artist = first.albumArtist || (names.length > 2 ? 'Varios artistas' : names.sort((a, b) => artists[b] - artists[a])[0]);
        const year = Math.max.apply(null, list.map((t) => t.year || 0));
        return year ? `${artist} · ${year}` : artist;
      },
      byDiscTrack,
    );
    this.artists = this.group(
      (t) => artistOf(t).toLowerCase(),
      (list) => artistOf(list[0]),
      (list) => `${list.length} ${list.length === 1 ? 'canción' : 'canciones'}`,
      (a, b) => byText(a.album, b.album) || byDiscTrack(a, b),
    );
    this.genres = this.group(
      (t) => (t.genre || 'Sin género').toLowerCase(),
      (list) => list[0].genre || 'Sin género',
      (list) => `${list.length} ${list.length === 1 ? 'canción' : 'canciones'}`,
      (a, b) => byText(a.title, b.title),
    );
    this.playlists = p.playlists;
    this.favorites = this.resolve(p.favTracks);
  }

  resolve(ids: string[]): TvTrack[] {
    const out: TvTrack[] = [];
    for (const id of ids) if (this.byId[id]) out.push(this.byId[id]);
    return out;
  }

  private group(
    keyOf: (t: TvTrack) => string,
    nameOf: (list: TvTrack[]) => string,
    subtitleOf: (list: TvTrack[]) => string,
    order: (a: TvTrack, b: TvTrack) => number,
  ): Group[] {
    const map: { [k: string]: TvTrack[] } = {};
    for (const t of this.tracks) {
      const k = keyOf(t);
      (map[k] || (map[k] = [])).push(t);
    }
    return Object.keys(map)
      .map((key) => {
        const list = map[key].sort(order);
        const withArt = list.filter((t) => !!t.art)[0];
        return { key, name: nameOf(list), subtitle: subtitleOf(list), art: withArt ? withArt.art : null, tracks: list };
      })
      .sort((a, b) => byText(a.name, b.name));
  }
}
