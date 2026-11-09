// Puente seguro entre la interfaz y el proceso principal (contextIsolation + sandbox).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { PipoApi } from '../shared/types';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: PipoApi = {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  rescan: () => ipcRenderer.invoke('library:rescan'),
  addFolder: () => ipcRenderer.invoke('library:addFolder'),
  removeFolder: (folder) => ipcRenderer.invoke('library:removeFolder', folder),
  showInFolder: (id) => ipcRenderer.invoke('library:showInFolder', id),
  onLibraryChanged: (cb) => on('library:changed', cb),
  onScanProgress: (cb) => on('library:progress', cb),

  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),

  ytSearch: (q, kind) => ipcRenderer.invoke('yt:search', q, kind),
  ytPrepare: (id) => ipcRenderer.invoke('yt:prepare', id),
  ytDownload: (track) => ipcRenderer.invoke('yt:download', track),
  ytCancelDownload: (id) => ipcRenderer.invoke('yt:cancel', id),
  ytDeleteDownload: (id) => ipcRenderer.invoke('yt:delete', id),
  ytDownloads: () => ipcRenderer.invoke('yt:downloads'),
  onYtDownload: (cb) => on('yt:download', cb),
  ytUpdate: () => ipcRenderer.invoke('yt:update'),
  ytVersion: () => ipcRenderer.invoke('yt:version'),
  openDownloadsFolder: () => ipcRenderer.invoke('yt:openFolder'),

  appInfo: () => ipcRenderer.invoke('app:info'),
  setTitleBarColors: (colors) => ipcRenderer.send('win:titleBar', colors),
  sendPlayerState: (state) => ipcRenderer.send('player:state', state),
  onPlayerCommand: (cb) => on('player:command', cb),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
};

contextBridge.exposeInMainWorld('pipo', api);
