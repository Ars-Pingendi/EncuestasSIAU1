// Proceso principal de Pipo Music Player para Windows 10/11.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, session, shell,
  type IpcMainInvokeEvent, type ThumbarButton,
} from 'electron';
import type { DownloadEvent, LibrarySnapshot, PlayerStateMsg, ScanProgress, TitleBarColors, Track, YtSearchKind } from '../shared/types';
import { Library } from './library';
import { handleProtocol, registerScheme } from './protocol';
import { JsonStore } from './store';
import { YouTube } from './youtube';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(here, '..');
const distDir = path.join(appRoot, 'dist');
const resourcesDir = app.isPackaged ? process.resourcesPath : path.join(appRoot, 'resources');

if (process.env.PIPO_USER_DATA) app.setPath('userData', process.env.PIPO_USER_DATA);
app.setAppUserModelId('com.personal.pipomusicplayer');
registerScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
let store: JsonStore;
let library: Library;
let youtube: YouTube;
let lastPlayer: PlayerStateMsg = { playing: false, title: '', hasTrack: false };

function send(channel: string, payload: unknown) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function trusted(e: IpcMainInvokeEvent | Electron.IpcMainEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  return url.startsWith('pipo://app/') || (!app.isPackaged && url.startsWith('http://localhost'));
}

function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => R | Promise<R>) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error('Origen no permitido');
    return fn(...(args as A));
  });
}

function icon(name: string) {
  return nativeImage.createFromPath(path.join(resourcesDir, 'icons', `${name}.png`));
}

function updateThumbar() {
  if (!win || process.platform !== 'win32') return;
  const buttons: ThumbarButton[] = [
    { tooltip: 'Anterior', icon: icon('prev'), click: () => send('player:command', 'previous'), flags: lastPlayer.hasTrack ? [] : ['disabled'] },
    {
      tooltip: lastPlayer.playing ? 'Pausar' : 'Reproducir',
      icon: icon(lastPlayer.playing ? 'pause' : 'play'),
      click: () => send('player:command', 'playpause'),
      flags: lastPlayer.hasTrack ? [] : ['disabled'],
    },
    { tooltip: 'Siguiente', icon: icon('next'), click: () => send('player:command', 'next'), flags: lastPlayer.hasTrack ? [] : ['disabled'] },
  ];
  try {
    win.setThumbarButtons(buttons);
  } catch {
    // la barra de tareas aún no está lista
  }
}

interface WindowState {
  bounds?: Electron.Rectangle;
  maximized?: boolean;
}

function createWindow() {
  const state = store.get<WindowState>('ventana') ?? {};
  win = new BrowserWindow({
    width: state.bounds?.width ?? 1280,
    height: state.bounds?.height ?? 820,
    x: state.bounds?.x,
    y: state.bounds?.y,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'Pipo Music Player',
    backgroundColor: '#12101a',
    icon: path.join(resourcesDir, 'icons', 'app.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#12101a', symbolColor: '#e8e3f3', height: 44 },
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  if (state.maximized) win.maximize();

  win.once('ready-to-show', () => {
    win?.show();
    updateThumbar();
  });

  const saveState = () => {
    if (!win || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    store.set('ventana', { bounds: maximized ? state.bounds : win.getNormalBounds(), maximized });
    if (!maximized) state.bounds = win.getNormalBounds();
  };
  win.on('resize', saveState);
  win.on('move', saveState);
  win.on('close', saveState);
  win.on('closed', () => (win = null));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('pipo://app/') && !url.startsWith('http://localhost')) e.preventDefault();
  });

  const devUrl = !app.isPackaged ? process.env.VITE_DEV_URL : undefined;
  void win.loadURL(devUrl ?? 'pipo://app/index.html');
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  store = new JsonStore(path.join(app.getPath('userData'), 'datos'));

  const musicDirs = process.env.PIPO_MUSIC_DIR
    ? process.env.PIPO_MUSIC_DIR.split(path.delimiter)
    : [app.getPath('music')];
  library = new Library({
    store,
    artDir: path.join(app.getPath('userData'), 'caratulas'),
    defaultFolders: musicDirs,
    onChange: (snap: LibrarySnapshot) => send('library:changed', snap),
    onProgress: (p: ScanProgress) => send('library:progress', p),
  });
  youtube = new YouTube({
    store,
    fetch: (url, init) => net.fetch(url, init),
    binDir: path.join(app.getPath('userData'), 'bin'),
    bundledBinDir: path.join(resourcesDir, 'bin'),
    cacheDir: path.join(app.getPath('userData'), 'ytdlp-cache'),
    downloadsDir: path.join(app.getPath('userData'), 'descargas'),
    streamDir: path.join(app.getPath('userData'), 'cache-audio'),
    logFile: path.join(app.getPath('userData'), 'youtube.log'),
    nodeRuntime: process.platform === 'win32' ? process.execPath : undefined,
    onDownload: (e: DownloadEvent) => send('yt:download', e),
  });

  handleProtocol(distDir, library, youtube);

  // Permisos: solo audio (lista de salidas de audio y selección de altavoz).
  const allowed = new Set(['media', 'speaker-selection', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Biblioteca
  handle('library:get', () => library.snapshot());
  handle('library:rescan', () => library.scan());
  handle('library:addFolder', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Agregar carpeta de música',
      buttonLabel: 'Agregar carpeta',
      properties: ['openDirectory', 'multiSelections'],
    });
    if (r.canceled || !r.filePaths.length) return null;
    let folders = library.getFolders();
    for (const f of r.filePaths) folders = library.addFolder(f);
    return folders;
  });
  handle('library:removeFolder', (folder: string) => library.removeFolder(folder));
  handle('library:showInFolder', (id: string) => {
    const file = id.startsWith('yt:') ? youtube.downloadFile(id.slice(3)) : library.pathForId(id);
    if (file) shell.showItemInFolder(file);
  });

  // Datos del usuario
  handle('store:get', (key: string) => store.get(key));
  handle('store:set', (key: string, value: unknown) => store.set(key, value));

  // YouTube
  handle('yt:search', (q: string, kind: YtSearchKind) => youtube.search(q, kind));
  handle('yt:prepare', (videoId: string) => youtube.prepare(videoId));
  handle('yt:lastError', (videoId: string) => youtube.lastError(videoId));
  handle('yt:openLog', async () => {
    const log = path.join(app.getPath('userData'), 'youtube.log');
    if (!fs.existsSync(log)) fs.writeFileSync(log, '');
    await shell.openPath(log);
  });
  handle('yt:download', (track: Track) => youtube.enqueueDownload(track));
  handle('yt:cancel', (videoId: string) => youtube.cancelDownload(videoId));
  handle('yt:delete', (videoId: string) => youtube.deleteDownload(videoId));
  handle('yt:downloads', () => youtube.listDownloads());
  handle('yt:update', () => youtube.update());
  handle('yt:version', () => youtube.version());
  handle('yt:openFolder', () => shell.openPath(path.join(app.getPath('userData'), 'descargas')).then(() => undefined));

  // Sistema
  handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    userData: app.getPath('userData'),
    downloadsDir: path.join(app.getPath('userData'), 'descargas'),
    ytdlpAvailable: youtube.available(),
  }));
  handle('shell:openExternal', async (url: string) => {
    if (/^https:\/\//.test(url)) await shell.openExternal(url);
  });
  ipcMain.on('win:titleBar', (e, colors: TitleBarColors) => {
    if (!trusted(e) || !win || process.platform === 'darwin') return;
    try {
      win.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor, height: 44 });
    } catch {
      // sin superposición de barra de título
    }
  });
  ipcMain.on('player:state', (e, s: PlayerStateMsg) => {
    if (!trusted(e) || !win) return;
    const changed = s.playing !== lastPlayer.playing || s.hasTrack !== lastPlayer.hasTrack;
    lastPlayer = s;
    win.setTitle(s.title ? `${s.title} — Pipo Music Player` : 'Pipo Music Player');
    if (changed) updateThumbar();
  });

  createWindow();
  library.watch();
  void library.scan();

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  youtube?.stopAll();
  library?.close();
  store?.flush();
});

// Limpieza de archivos temporales de descargas interrumpidas en un cierre anterior.
app.on('ready', () => {
  const dir = path.join(app.getPath('userData'), 'descargas');
  fs.promises
    .readdir(dir)
    .then((files) => files.filter((f) => /\.(part|ytdl|tmp)$/i.test(f)).forEach((f) => fs.rm(path.join(dir, f), () => undefined)))
    .catch(() => undefined);
});
