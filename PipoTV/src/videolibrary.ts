// Películas y series recibidas del PC, agrupadas.
import type { TvVideo, VideosPayload } from './api';

export interface Season {
  number: number;
  episodes: TvVideo[];
}

export interface Series {
  key: string;
  name: string;
  seasons: Season[];
  episodes: TvVideo[];
  /** Episodio cuya miniatura/póster representa la serie. */
  cover: TvVideo;
  addedAt: number;
}

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

export class VideoLibrary {
  items: TvVideo[] = [];
  byId: { [id: string]: TvVideo } = {};
  movies: TvVideo[] = [];
  series: Series[] = [];
  seriesByKey: { [key: string]: Series } = {};
  scanning = false;

  load(p: VideosPayload) {
    this.scanning = p.scanning;
    this.items = p.items;
    this.byId = {};
    for (const v of this.items) this.byId[v.id] = v;
    this.movies = this.items.filter((v) => v.kind === 'movie').sort((a, b) => collator.compare(a.title, b.title));
    const groups: { [key: string]: TvVideo[] } = {};
    for (const v of this.items) if (v.kind === 'episode') (groups[v.seriesKey] || (groups[v.seriesKey] = [])).push(v);
    this.series = Object.keys(groups)
      .map((key) => {
        const eps = groups[key].sort((a, b) => a.season - b.season || a.episode - b.episode || collator.compare(a.title, b.title));
        const seasons: Season[] = [];
        for (const e of eps) {
          let s = seasons[seasons.length - 1];
          if (!s || s.number !== e.season) seasons.push((s = { number: e.season, episodes: [] }));
          s.episodes.push(e);
        }
        return { key, name: eps[0].series, seasons, episodes: eps, cover: eps[0], addedAt: Math.max.apply(null, eps.map((e) => e.addedAt)) };
      })
      .sort((a, b) => collator.compare(a.name, b.name));
    this.seriesByKey = {};
    for (const s of this.series) this.seriesByKey[s.key] = s;
  }

  /** Episodio que sigue al indicado (de la misma serie), si lo hay. */
  nextEpisode(v: TvVideo): TvVideo | null {
    if (v.kind !== 'episode') return null;
    const s = this.seriesByKey[v.seriesKey];
    if (!s) return null;
    const i = s.episodes.indexOf(this.byId[v.id]);
    return i >= 0 && i + 1 < s.episodes.length ? s.episodes[i + 1] : null;
  }

  previousEpisode(v: TvVideo): TvVideo | null {
    if (v.kind !== 'episode') return null;
    const s = this.seriesByKey[v.seriesKey];
    if (!s) return null;
    const i = s.episodes.indexOf(this.byId[v.id]);
    return i > 0 ? s.episodes[i - 1] : null;
  }
}
