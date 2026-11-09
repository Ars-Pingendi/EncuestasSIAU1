// API simulada para probar la interfaz en un navegador (sin Electron).
import type { DownloadEvent, DownloadInfo, LibrarySnapshot, PipoApi, Track, YtItem } from '../shared/types';

const ARTISTS = [
  { name: 'Los Faroles del Sur', genre: 'Cumbia', albums: ['Noches de puerto', 'Brisa'] },
  { name: 'Marea Azul', genre: 'Pop', albums: ['Océano interior'] },
  { name: 'Trío Candela', genre: 'Bolero', albums: ['Velas encendidas', 'Serenata'] },
  { name: 'Kilómetro Cero', genre: 'Rock', albums: ['Ruta 66 bis'] },
  { name: 'Sintonía Neón', genre: 'Electrónica', albums: ['Pulsos'] },
  { name: 'Ana Llovizna', genre: 'Acústica', albums: ['Cuadernos'] },
];
const WORDS = ['Luna', 'Camino', 'Fuego', 'Ventana', 'Río', 'Silencio', 'Calle', 'Sol', 'Abril', 'Montaña', 'Lejos', 'Café', 'Puerto', 'Niebla'];

function buildTracks(): Track[] {
  const tracks: Track[] = [];
  let n = 0;
  for (const a of ARTISTS) {
    a.albums.forEach((album, ai) => {
      for (let i = 0; i < 6; i++) {
        n++;
        tracks.push({
          id: `f:mock${n}`,
          source: 'local',
          title: `${WORDS[(n * 7) % WORDS.length]} ${WORDS[(n * 3 + i) % WORDS.length].toLowerCase()}`,
          artist: a.name,
          album,
          albumArtist: a.name,
          genre: a.genre,
          trackNo: i + 1,
          discNo: 1,
          year: 2010 + ((n + ai) % 14),
          durationMs: 150_000 + ((n * 37) % 120) * 1000,
          folder: `C:\\Users\\Pipo\\Music\\${a.name}\\${album}`,
          fileName: `${String(i + 1).padStart(2, '0')}.mp3`,
          addedAt: Date.now() - n * 3600_000,
          size: 4_000_000,
        });
      }
    });
  }
  return tracks;
}

const urls = new Map<string, string>();

/** WAV corto con un acorde distinto por canción. */
export function mockMediaUrl(track: Track): string {
  const cached = urls.get(track.id);
  if (cached) return cached;
  const rate = 22050;
  const seconds = 12;
  const samples = rate * seconds;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples * 2, true);
  let h = 0;
  for (const c of track.id) h = (h * 31 + c.charCodeAt(0)) | 0;
  const base = 110 * Math.pow(2, (Math.abs(h) % 12) / 12);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const env = Math.min(1, t * 4) * Math.min(1, (seconds - t) * 2);
    const s = Math.sin(2 * Math.PI * base * t) * 0.3 + Math.sin(2 * Math.PI * base * 1.25 * t) * 0.2 + Math.sin(2 * Math.PI * base * 1.5 * t) * 0.15;
    v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * env)) * 32767, true);
  }
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  urls.set(track.id, url);
  return url;
}

export function createMockApi(): PipoApi {
  const tracks = buildTracks();
  let folders = ['C:\\Users\\Pipo\\Music'];
  const dlListeners = new Set<(e: DownloadEvent) => void>();
  const downloads: DownloadInfo[] = [];
  const snap = (): LibrarySnapshot => ({ tracks, folders, scannedAt: Date.now() });
  const read = (k: string) => {
    try {
      const raw = localStorage.getItem(`pipo:${k}`);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    getLibrary: async () => snap(),
    rescan: async () => undefined,
    addFolder: async () => (folders = [...folders, 'D:\\Música']),
    removeFolder: async (f) => (folders = folders.filter((x) => x !== f)),
    showInFolder: async () => undefined,
    onLibraryChanged: () => () => undefined,
    onScanProgress: () => () => undefined,
    storeGet: async (k) => read(k),
    storeSet: async (k, value) => {
      try {
        localStorage.setItem(`pipo:${k}`, JSON.stringify(value));
      } catch {
        // almacenamiento no disponible
      }
    },
    ytSearch: async (q, kind) => {
      await new Promise((r) => setTimeout(r, 300));
      return Array.from({ length: 12 }, (_, i): YtItem => ({
        videoId: `mock${kind[0]}${i}`.padEnd(11, 'x').slice(0, 11),
        title: `${q} ${kind === 'songs' ? '(canción' : '(video'} ${i + 1})`,
        artist: ARTISTS[i % ARTISTS.length].name,
        album: kind === 'songs' ? ARTISTS[i % ARTISTS.length].albums[0] : '',
        durationMs: 180_000 + i * 7000,
        thumbnail: '',
        kind: kind === 'songs' ? 'song' : 'video',
      }));
    },
    ytPrepare: async () => ({ ok: true }),
    ytDownload: async (track) => {
      const videoId = track.videoId!;
      let p = 0;
      const timer = setInterval(() => {
        p += 0.2;
        if (p >= 1) {
          clearInterval(timer);
          const info: DownloadInfo = { videoId, file: `${videoId}.m4a`, size: 3_500_000, downloadedAt: Date.now(), track };
          downloads.push(info);
          dlListeners.forEach((l) => l({ videoId, state: 'done', progress: 1, info }));
        } else dlListeners.forEach((l) => l({ videoId, state: 'running', progress: p }));
      }, 250);
    },
    ytCancelDownload: async () => undefined,
    ytDeleteDownload: async (id) => {
      const i = downloads.findIndex((d) => d.videoId === id);
      if (i >= 0) downloads.splice(i, 1);
      dlListeners.forEach((l) => l({ videoId: id, state: 'removed' }));
    },
    ytDownloads: async () => [...downloads],
    onYtDownload: (cb) => {
      dlListeners.add(cb);
      return () => dlListeners.delete(cb);
    },
    ytUpdate: async () => 'El componente de YouTube ya está al día.',
    ytVersion: async () => '2026.10.26',
    openDownloadsFolder: async () => undefined,
    appInfo: async () => ({
      version: '1.0.0',
      platform: 'win32',
      electron: '-',
      chrome: '-',
      userData: 'C:\\Users\\Pipo\\AppData\\Roaming\\Pipo Music Player',
      downloadsDir: 'C:\\Users\\Pipo\\AppData\\Roaming\\Pipo Music Player\\descargas',
      ytdlpAvailable: true,
    }),
    setTitleBarColors: () => undefined,
    sendPlayerState: () => undefined,
    onPlayerCommand: () => () => undefined,
    openExternal: async () => undefined,
  };
}
