// Menú contextual de una canción (clic derecho o botón ⋮).
import type { Track } from '../../shared/types';
import { api } from '../api';
import { albumKey, artistOf } from '../lib/group';
import { isFavTrack, removeFromPlaylist, toggleFavTrack } from '../state/data';
import { isDownloaded, lib } from '../state/library';
import { addToQueue, playNext, playTracks, removeFromQueue } from '../state/player';
import { navigate, toast, type MenuItem } from '../state/ui';
import { openAddToPlaylist } from './Dialogs';

export interface TrackContext {
  list?: Track[];
  index?: number;
  playlistId?: string;
  queueIndex?: number;
}

export function trackMenuItems(t: Track, ctx: TrackContext = {}): MenuItem[] {
  const items: MenuItem[] = [];
  if (ctx.queueIndex === undefined) {
    items.push({ label: 'Reproducir', icon: 'play', run: () => playTracks(ctx.list ?? [t], ctx.list ? ctx.index ?? 0 : 0) });
  }
  items.push(
    { label: 'Reproducir a continuación', icon: 'playNext', run: () => playNext([t]) },
    { label: 'Agregar a la cola', icon: 'queue', run: () => addToQueue([t]) },
    { label: 'Agregar a una lista…', icon: 'playlistAdd', run: () => openAddToPlaylist([t]) },
  );
  const fav = isFavTrack(t.id);
  items.push({
    label: fav ? 'Quitar de favoritos' : 'Agregar a favoritos',
    icon: fav ? 'heart' : 'heartOutline',
    run: () => toast(toggleFavTrack(t) ? 'Agregada a favoritos' : 'Quitada de favoritos'),
  });
  items.push({ separator: true, label: '' });
  if (t.source === 'local') {
    const key = albumKey(t);
    if (lib.get().albumByKey.has(key)) items.push({ label: 'Ir al álbum', icon: 'album', run: () => navigate({ view: 'album', key }) });
    const ak = artistOf(t).toLowerCase();
    if (lib.get().artistByKey.has(ak)) items.push({ label: 'Ir al artista', icon: 'person', run: () => navigate({ view: 'artist', key: ak }) });
    items.push({ label: 'Mostrar en el Explorador de archivos', icon: 'folder', run: () => void api.showInFolder(t.id) });
  } else if (t.videoId) {
    const downloaded = isDownloaded(t);
    const st = lib.get().dlState[t.videoId]?.state;
    if (downloaded) {
      items.push({ label: 'Mostrar el archivo descargado', icon: 'folder', run: () => void api.showInFolder(t.id) });
      items.push({ label: 'Eliminar la descarga', icon: 'delete', danger: true, run: () => void api.ytDeleteDownload(t.videoId!) });
    } else if (st === 'queued' || st === 'running') {
      items.push({ label: 'Cancelar la descarga', icon: 'close', run: () => void api.ytCancelDownload(t.videoId!) });
    } else {
      items.push({ label: 'Descargar para escuchar sin internet', icon: 'download', run: () => void api.ytDownload(t) });
    }
    items.push({ label: 'Abrir en YouTube', icon: 'openNew', run: () => void api.openExternal(`https://www.youtube.com/watch?v=${t.videoId}`) });
  }
  if (ctx.playlistId !== undefined && ctx.index !== undefined) {
    const pid = ctx.playlistId;
    const i = ctx.index;
    items.push({ separator: true, label: '' }, { label: 'Quitar de esta lista', icon: 'delete', danger: true, run: () => removeFromPlaylist(pid, i) });
  }
  if (ctx.queueIndex !== undefined) {
    const qi = ctx.queueIndex;
    items.push({ separator: true, label: '' }, { label: 'Quitar de la cola', icon: 'close', danger: true, run: () => removeFromQueue(qi) });
  }
  return items;
}
