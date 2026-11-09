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
  const hasFile = t.source === 'local' || isDownloaded(t);
  if (hasFile) {
    items.push(
      { label: 'Compartir (WhatsApp, Bluetooth…)', icon: 'share', run: () => void shareTrack(t) },
      { label: 'Guardar una copia…', icon: 'save', run: () => void saveCopy(t) },
    );
  }
  if (t.videoId) items.push({ label: 'Copiar enlace de YouTube', icon: 'link', run: () => void copyLink(t) });
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

// ── Compartir ──

const SHARE_HINT =
  'Listo: en el Explorador haz clic derecho → «Compartir» (WhatsApp, Uso compartido en proximidad, correo) o «Mostrar más opciones» → «Enviar a» → «Dispositivo Bluetooth». También puedes arrastrar la canción desde Pipo a WhatsApp.';

export async function shareTrack(t: Track) {
  if (await api.shareReveal(t.id)) toast(SHARE_HINT, undefined, 12000);
  else toast('No se encontró el archivo de esta canción');
}

export async function saveCopy(t: Track) {
  const saved = await api.saveCopy(t.id);
  if (saved) toast(`Copia guardada: ${saved}`, undefined, 6000);
}

export async function exportTracks(tracks: Track[]) {
  const withFile = tracks.filter((t) => t.source === 'local' || isDownloaded(t));
  if (!withFile.length) return toast('No hay archivos para guardar: descarga primero las canciones de YouTube');
  const n = await api.exportMany(withFile.map((t) => t.id));
  if (n !== null) {
    const skipped = tracks.length - withFile.length;
    toast(`${n} ${n === 1 ? 'canción guardada' : 'canciones guardadas'}${skipped ? ` (${skipped} de YouTube sin descargar no se incluyeron)` : ''}`, undefined, 6000);
  }
}

async function copyLink(t: Track) {
  try {
    await navigator.clipboard.writeText(`https://youtu.be/${t.videoId}`);
    toast('Enlace copiado: pégalo en WhatsApp o donde quieras');
  } catch {
    toast(`Enlace: https://youtu.be/${t.videoId}`, undefined, 8000);
  }
}
