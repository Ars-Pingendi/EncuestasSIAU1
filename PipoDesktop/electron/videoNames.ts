// Reconoce películas y series por el nombre del archivo y las carpetas.
import path from 'node:path';

export interface ParsedName {
  kind: 'movie' | 'episode';
  /** Película: su título. Episodio: título del episodio (puede estar vacío). */
  title: string;
  series?: string;
  season?: number;
  episode?: number;
  year?: number;
}

const TAGS =
  /\b(?:2160p|1080p|1080i|720p|576p|480p|4k|uhd|hdr10\+?|hdr|dolby ?vision|dv|blu-?ray|bdrip|brrip|webrip|web-?dl|web|hdtv|dvdrip|dvd|x264|x265|h\.?264|h\.?265|hevc|avc|xvid|divx|aac\d?|ac3|e-?ac-?3|ddp?\d?(?:[ .]\d)?|dts(?:-?hd)?(?:-?ma)?|truehd|atmos|flac|remux|proper|repack|extended|unrated|imax|multi|dual|latino|castellano|vose|subs?|10bit|8bit|amzn|nf|dsnp|hmax)\b/i;

const SEASON_DIR = /^(?:season|temporada|temp|series|serie|s)[\s._-]*(\d{1,2})$/i;

/** Quita puntos, corchetes y etiquetas de release («1080p», «BluRay», «x264»…). */
export function cleanTitle(raw: string, cutTags = true): string {
  let t = raw.replace(/[._]+/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
  const tag = cutTags ? TAGS.exec(t) : null;
  if (tag && tag.index > 0) t = t.slice(0, tag.index);
  else if (tag && tag.index === 0) t = '';
  return t.replace(/^[\s\-–—:]+|[\s\-–—:(]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}

function stripYear(name: string): { name: string; year?: number } {
  const m = /[\s(\[]*\b((?:19|20)\d{2})\b[\s)\]]*$/.exec(name);
  if (m && m.index > 0) return { name: name.slice(0, m.index).trim(), year: Number(m[1]) };
  return { name };
}

export function seriesKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Primera carpeta del recorrido (de adentro hacia afuera) que no sea de temporada. */
function ancestorSeries(dirs: string[], rootName: string): string {
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (!SEASON_DIR.test(dirs[i].trim())) {
      const n = stripYear(cleanTitle(dirs[i])).name;
      if (n) return n;
    }
  }
  return stripYear(cleanTitle(rootName)).name || 'Serie sin nombre';
}

/**
 * @param relPath ruta del archivo relativa a la carpeta de videos elegida
 * @param rootName nombre de esa carpeta (sirve de respaldo para el nombre de la serie)
 */
export function parseVideoName(relPath: string, rootName: string): ParsedName {
  const parts = relPath.split(/[\\/]/).filter(Boolean);
  const file = parts[parts.length - 1] ?? relPath;
  const dirs = parts.slice(0, -1);
  const base = path.basename(file, path.extname(file));
  const spaced = base.replace(/[._]+/g, ' ');

  const sxe = /^(.*?)[\s._\-[(]*\bS(\d{1,2})[\s._-]*E(\d{1,3})(?:[\s._-]*(?:E|-E)?\d{1,3})?\b(.*)$/i.exec(base);
  const nxm = sxe ? null : /^(.*?)[\s._\-[(]*\b(\d{1,2})x(\d{2,3})\b(.*)$/i.exec(base);
  const m = sxe ?? nxm;
  if (m) {
    const before = stripYear(cleanTitle(m[1])).name;
    const series = before || ancestorSeries(dirs, rootName);
    return { kind: 'episode', series, season: Number(m[2]), episode: Number(m[3]), title: cleanTitle(m[4]) };
  }

  // «Serie/Temporada 2/03 - Título.mkv»
  const parent = dirs[dirs.length - 1]?.trim() ?? '';
  const sd = SEASON_DIR.exec(parent);
  if (sd) {
    const ep =
      /(?:^|[\s._-])(?:e|ep|episode|episodio|cap|capitulo|capítulo)[\s._-]*(\d{1,3})\b/i.exec(spaced) ??
      /^(\d{1,3})(?=[\s._-])/.exec(spaced);
    if (ep) {
      return {
        kind: 'episode',
        series: ancestorSeries(dirs.slice(0, -1), rootName),
        season: Number(sd[1]),
        episode: Number(ep[1]),
        title: cleanTitle(spaced.replace(ep[0], ' ')),
      };
    }
  }

  // Película: el título llega hasta el último año que no esté al principio.
  let title = spaced;
  let year: number | undefined;
  const years = [...spaced.matchAll(/(?:^|[\s(\[])((?:19|20)\d{2})(?=[\s)\]]|$)/g)].filter((y) => (y.index ?? 0) > 0 || y[0].length > 5);
  const last = years[years.length - 1];
  if (last && last.index !== undefined && last.index > 0) {
    year = Number(last[1]);
    // Con año, todo lo anterior es el título (aunque contenga palabras como «DTS» o «Web»).
    title = cleanTitle(spaced.slice(0, last.index), false);
  } else {
    title = cleanTitle(spaced);
  }
  title = title || cleanTitle(spaced, false) || spaced.trim();
  return { kind: 'movie', title, year };
}
