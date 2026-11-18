// «Reproducir / Ver en la TV» desde Pipo para Windows.
import type { Track } from '../../shared/types';
import { api } from '../api';
import { toast } from '../state/ui';

let sharing = false;

/** ¿Está activado «Compartir mi música con la TV»? (se consulta cada pocos segundos). */
export function tvSharing(): boolean {
  return sharing;
}

export async function refreshTv() {
  try {
    sharing = (await api.tvStatus()).running;
  } catch {
    sharing = false;
  }
}

let started = false;
export function initTv() {
  if (started) return;
  started = true;
  void refreshTv();
  setInterval(() => void refreshTv(), 10_000);
}

export async function sendToTv(type: 'play' | 'playNext' | 'enqueue' | 'video', tracks: Track[], start = 0) {
  if (!tracks.length) return;
  const r = await api.tvSend(type, tracks, start);
  if (!r.running) toast('Activa «Compartir mi música con la TV» en Ajustes para usar la TV.');
  else if (!r.delivered) toast('La TV no está conectada. Abre Pipo en la TV y conéctala a este PC.');
  else toast(type === 'video' ? 'Abriendo el video en la TV' : type === 'play' ? 'Sonando en la TV' : type === 'playNext' ? 'Sonará a continuación en la TV' : 'Agregada a la cola de la TV');
}
