// Videos de YouTube descargados (MP4) y el estado de las descargas en curso.
import type { Track, VideoDownloadEvent, VideoDownloadInfo } from '../../shared/types';
import { api } from '../api';
import { createStore } from '../lib/store';
import { toast } from './ui';

export interface VideosState {
  downloads: Map<string, VideoDownloadInfo>;
  state: Record<string, VideoDownloadEvent>;
}

export const videos = createStore<VideosState>({ downloads: new Map(), state: {} });

export function videoDownloaded(videoId?: string): VideoDownloadInfo | undefined {
  return videoId ? videos.get().downloads.get(videoId) : undefined;
}

export function videoBusy(videoId?: string): boolean {
  const st = videoId ? videos.get().state[videoId]?.state : undefined;
  return st === 'queued' || st === 'running';
}

export function downloadVideo(t: Track) {
  if (!t.videoId) return;
  void api.ytDownloadVideo({
    videoId: t.videoId,
    title: t.title,
    channel: t.artist,
    durationMs: t.durationMs,
    thumbnail: t.artworkUrl || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
  });
  toast(`Descargando el video «${t.title}»…`);
}

/** Un video descargado como «canción» de YouTube (para el visor, el menú y la TV). */
export function videoTrack(v: VideoDownloadInfo): Track {
  return {
    id: `yt:${v.videoId}`,
    source: 'youtube',
    videoId: v.videoId,
    title: v.title,
    artist: v.channel,
    album: 'YouTube',
    albumArtist: '',
    genre: '',
    trackNo: 0,
    discNo: 0,
    year: 0,
    durationMs: v.durationMs,
    folder: '',
    fileName: '',
    addedAt: v.downloadedAt,
    size: v.size,
    artworkUrl: v.thumbnail,
  };
}

export async function initVideos() {
  const list = await api.ytVideoDownloads();
  videos.set({ downloads: new Map(list.map((d) => [d.videoId, d])) });
  api.onYtVideoDownload((e) => {
    videos.set((s) => {
      const state = { ...s.state, [e.videoId]: e };
      const downloads = new Map(s.downloads);
      if (e.state === 'done' && e.info) downloads.set(e.videoId, e.info);
      if (e.state === 'removed') {
        downloads.delete(e.videoId);
        delete state[e.videoId];
      }
      return { state, downloads };
    });
    if (e.state === 'done') toast(`Video descargado: ${e.info?.title ?? ''}`, { label: 'Abrir carpeta', run: () => void api.ytShowVideoInFolder(e.videoId) }, 7000);
    if (e.state === 'error') toast(`No se pudo descargar el video: ${e.message ?? 'error desconocido'}`, undefined, 8000);
  });
}
