// Biblioteca local + descargas de YouTube, con agrupaciones precalculadas.
import type { DownloadEvent, DownloadInfo, LibrarySnapshot, ScanProgress, Track } from '../../shared/types';
import { api } from '../api';
import { buildAlbums, buildArtists, buildFolders, buildGenres, type Album, type Artist, type Group } from '../lib/group';
import { createStore } from '../lib/store';
import { data } from './data';
import { toast } from './ui';

export interface LibState {
  ready: boolean;
  tracks: Track[];
  byId: Map<string, Track>;
  folders: string[];
  scannedAt: number;
  progress: ScanProgress;
  albums: Album[];
  albumByKey: Map<string, Album>;
  artists: Artist[];
  artistByKey: Map<string, Artist>;
  genres: Group[];
  folderGroups: Group[];
  downloads: Map<string, DownloadInfo>;
  dlState: Record<string, DownloadEvent>;
}

export const lib = createStore<LibState>({
  ready: false,
  tracks: [],
  byId: new Map(),
  folders: [],
  scannedAt: 0,
  progress: { scanning: false, done: 0, total: 0 },
  albums: [],
  albumByKey: new Map(),
  artists: [],
  artistByKey: new Map(),
  genres: [],
  folderGroups: [],
  downloads: new Map(),
  dlState: {},
});

function applySnapshot(snap: LibrarySnapshot) {
  const albums = buildAlbums(snap.tracks);
  const artists = buildArtists(snap.tracks, albums);
  lib.set({
    ready: true,
    tracks: snap.tracks,
    byId: new Map(snap.tracks.map((t) => [t.id, t])),
    folders: snap.folders,
    scannedAt: snap.scannedAt,
    albums,
    albumByKey: new Map(albums.map((a) => [a.key, a])),
    artists,
    artistByKey: new Map(artists.map((a) => [a.key, a])),
    genres: buildGenres(snap.tracks),
    folderGroups: buildFolders(snap.tracks),
  });
}

/** Busca una canción por id en la biblioteca, las descargas o las canciones de YouTube guardadas. */
export function lookup(id: string): Track | undefined {
  const s = lib.get();
  const local = s.byId.get(id);
  if (local) return local;
  if (id.startsWith('yt:')) {
    const dl = s.downloads.get(id.slice(3));
    if (dl) return dl.track;
    return data.get().user.remote[id];
  }
  return undefined;
}

export function resolveIds(ids: string[]): Track[] {
  const out: Track[] = [];
  for (const id of ids) {
    const t = lookup(id);
    if (t) out.push(t);
  }
  return out;
}

export function isDownloaded(t: Track): boolean {
  return !!t.videoId && lib.get().downloads.has(t.videoId);
}

export async function initLibrary() {
  applySnapshot(await api.getLibrary());
  api.onLibraryChanged(applySnapshot);
  api.onScanProgress((progress) => lib.set({ progress }));
  const dls = await api.ytDownloads();
  lib.set({ downloads: new Map(dls.map((d) => [d.videoId, d])) });
  api.onYtDownload((e) => {
    lib.set((s) => {
      const dlState = { ...s.dlState, [e.videoId]: e };
      const downloads = new Map(s.downloads);
      if (e.state === 'done' && e.info) downloads.set(e.videoId, e.info);
      if (e.state === 'removed') {
        downloads.delete(e.videoId);
        delete dlState[e.videoId];
      }
      return { dlState, downloads };
    });
    if (e.state === 'done') toast(`Descargada: ${e.info?.track.title ?? ''}`);
    if (e.state === 'error') toast(`No se pudo descargar: ${e.message ?? 'error desconocido'}`, undefined, 7000);
  });
}
