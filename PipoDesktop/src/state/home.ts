// Inicio: recomendaciones calculadas con la biblioteca y lo que se escucha, más canciones parecidas
// de YouTube (radio de YouTube Music) para las semillas que elige el motor.
import { useEffect, useMemo } from 'react';
import type { Track } from '../../shared/types';
import { api } from '../api';
import { buildHome, type HomeData } from '../lib/recommend';
import { createStore, useStore } from '../lib/store';
import { ytItemToTrack } from '../lib/yt';
import { data } from './data';
import { lib, lookup } from './library';

function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

let cache: { key: unknown[]; home: HomeData } | null = null;

/** Datos de Inicio; se recalculan cuando cambia la biblioteca, el historial o el día. */
export function computeHome(): HomeData {
  const l = lib.get();
  const u = data.get().user;
  const key = [l.tracks, l.albums, l.downloads, u.stats, u.favTracks, u.playlists, u.remote, localDay()];
  if (cache && cache.key.every((v, i) => v === key[i])) return cache.home;
  const home = buildHome({
    tracks: l.tracks,
    albums: l.albums,
    stats: u.stats,
    favorites: u.favTracks,
    playlists: u.playlists,
    resolve: lookup,
    now: Date.now(),
  });
  cache = { key, home };
  return home;
}

export function useHome(): HomeData {
  const tracks = useStore(lib, (s) => s.tracks);
  const user = useStore(data, (s) => s.user);
  const downloads = useStore(lib, (s) => s.downloads);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeHome(), [tracks, user, downloads]);
}

// ── Canciones parecidas en YouTube ──

export interface RadioState {
  status: 'loading' | 'ok' | 'error';
  tracks: Track[];
  seed: Track;
  label: string;
}

export const radios = createStore<{ byKey: Record<string, RadioState> }>({ byKey: {} });

export function radioKey(seed: Track): string {
  return seed.videoId ? `v:${seed.videoId}` : `t:${seed.artist}|${seed.title}`.toLowerCase();
}

export function loadRadio(seed: Track, label: string) {
  const key = radioKey(seed);
  const cur = radios.get().byKey[key];
  if (cur && cur.status !== 'error') return;
  const put = (st: Partial<RadioState>) =>
    radios.set((s) => {
      const base: RadioState = s.byKey[key] ?? { seed, label, tracks: [], status: 'loading' };
      return { byKey: { ...s.byKey, [key]: { ...base, ...st } } };
    });
  put({ status: 'loading', label });
  api
    .ytRadio({ videoId: seed.videoId, title: seed.title, artist: seed.artist })
    .then((items) => put({ status: items.length ? 'ok' : 'error', tracks: items.map(ytItemToTrack) }))
    .catch(() => put({ status: 'error' }));
}

export function useRadios(seeds: HomeData['seeds']): RadioState[] {
  const byKey = useStore(radios, (s) => s.byKey);
  const keys = seeds.map((s) => radioKey(s.track)).join('|');
  useEffect(() => {
    for (const s of seeds) loadRadio(s.track, s.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);
  return seeds.map((s) => byKey[radioKey(s.track)]).filter((r): r is RadioState => !!r);
}
