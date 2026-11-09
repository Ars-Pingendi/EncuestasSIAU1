import type { PipoApi, Track } from '../shared/types';
import { createMockApi, mockMediaUrl } from './mock';

declare global {
  interface Window {
    pipo?: PipoApi;
  }
}

/** Fuera de Electron (navegador, pruebas) se usa una API simulada con música generada. */
export const isMock = !window.pipo;
export const api: PipoApi = window.pipo ?? createMockApi();
export const isWindows = /Windows/i.test(navigator.userAgent);

export function mediaUrl(track: Track): string {
  if (isMock) return mockMediaUrl(track);
  if (track.source === 'youtube') return `pipo://media/yt/${track.videoId}`;
  return `pipo://media/file/${encodeURIComponent(track.id)}`;
}

export function artUrl(track: Pick<Track, 'artId' | 'artworkUrl'> | undefined | null): string | undefined {
  if (!track) return undefined;
  if (track.artworkUrl) return track.artworkUrl;
  if (track.artId) return isMock ? undefined : `pipo://media/art/${encodeURIComponent(track.artId)}`;
  return undefined;
}
