// Tipos compartidos entre el proceso principal (Electron) y la interfaz (React).

export type TrackSource = 'local' | 'youtube';

export interface Track {
  /** "f:<hash de la ruta>" para archivos locales, "yt:<videoId>" para YouTube. */
  id: string;
  source: TrackSource;
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  genre: string;
  trackNo: number;
  discNo: number;
  year: number;
  durationMs: number;
  /** Carpeta que contiene el archivo (vacío para YouTube). */
  folder: string;
  /** Nombre del archivo (vacío para YouTube). */
  fileName: string;
  addedAt: number;
  size: number;
  /** Carátula local servida por pipo://media/art/<artId>. */
  artId?: string;
  /** Miniatura remota (YouTube). */
  artworkUrl?: string;
  videoId?: string;
}

export interface LibrarySnapshot {
  tracks: Track[];
  folders: string[];
  scannedAt: number;
}

export interface ScanProgress {
  scanning: boolean;
  done: number;
  total: number;
}

export type YtSearchKind = 'songs' | 'videos';

export interface YtItem {
  videoId: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  thumbnail: string;
  kind: 'song' | 'video';
}

export interface DownloadInfo {
  videoId: string;
  file: string;
  size: number;
  downloadedAt: number;
  track: Track;
}

export type DownloadState = 'queued' | 'running' | 'done' | 'error' | 'removed';

export interface DownloadEvent {
  videoId: string;
  state: DownloadState;
  /** 0..1 */
  progress?: number;
  message?: string;
  info?: DownloadInfo;
}

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
  chrome: string;
  userData: string;
  downloadsDir: string;
  ytdlpAvailable: boolean;
}

export interface ResolveResult {
  ok: boolean;
  message?: string;
}

export interface TitleBarColors {
  color: string;
  symbolColor: string;
}

export type PlayerCommand = 'playpause' | 'next' | 'previous';

export interface PlayerStateMsg {
  playing: boolean;
  title: string;
  hasTrack: boolean;
}

export interface PipoApi {
  // Biblioteca local
  getLibrary(): Promise<LibrarySnapshot>;
  rescan(): Promise<void>;
  addFolder(): Promise<string[] | null>;
  removeFolder(folder: string): Promise<string[]>;
  showInFolder(trackId: string): Promise<void>;
  onLibraryChanged(cb: (snap: LibrarySnapshot) => void): () => void;
  onScanProgress(cb: (p: ScanProgress) => void): () => void;

  // Datos del usuario (listas, favoritos, ajustes, ecualizador, cola…)
  storeGet<T>(key: string): Promise<T | undefined>;
  storeSet(key: string, value: unknown): Promise<void>;

  // YouTube
  ytSearch(query: string, kind: YtSearchKind): Promise<YtItem[]>;
  ytPrepare(videoId: string): Promise<ResolveResult>;
  ytLastError(videoId: string): Promise<string | null>;
  ytOpenLog(): Promise<void>;
  ytDownload(track: Track): Promise<void>;
  ytCancelDownload(videoId: string): Promise<void>;
  ytDeleteDownload(videoId: string): Promise<void>;
  ytDownloads(): Promise<DownloadInfo[]>;
  onYtDownload(cb: (e: DownloadEvent) => void): () => void;
  ytUpdate(): Promise<string>;
  ytVersion(): Promise<string>;
  openDownloadsFolder(): Promise<void>;

  // Ventana y sistema
  appInfo(): Promise<AppInfo>;
  setTitleBarColors(colors: TitleBarColors): void;
  sendPlayerState(state: PlayerStateMsg): void;
  onPlayerCommand(cb: (cmd: PlayerCommand) => void): () => void;
  openExternal(url: string): Promise<void>;
}
