import type { Track, YtItem } from '../../shared/types';

/** Resultado de YouTube → canción de Pipo (id «yt:<videoId>»). */
export function ytItemToTrack(item: YtItem): Track {
  return {
    id: `yt:${item.videoId}`,
    source: 'youtube',
    videoId: item.videoId,
    title: item.title,
    artist: item.artist,
    album: item.album || (item.kind === 'video' ? 'YouTube' : ''),
    albumArtist: '',
    genre: '',
    trackNo: 0,
    discNo: 0,
    year: 0,
    durationMs: item.durationMs,
    folder: '',
    fileName: '',
    addedAt: Date.now(),
    size: 0,
    artworkUrl: item.thumbnail || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
  };
}
