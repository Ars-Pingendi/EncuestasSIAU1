// YouTube en la TV: se busca aquí (con el teclado de la TV o la voz del control) y el teléfono
// hace de puente. También se puede mandar un video desde Pipo del teléfono («Ver en la TV»).
import { type TvVideo, type YtResult, ytSearch, Unauthorized } from '../api';
import { lazyImage } from '../components/images';
import { clear, h, icon } from '../dom';
import { focus } from '../nav';
import { app, toast } from '../state';
import { type View } from '../ui';
import { playVideo } from './player';
import { durationText } from './video';

/** Lo último buscado se recuerda mientras la app está abierta (al volver del reproductor). */
const last: { query: string; items: YtResult[]; next: string | null } = { query: '', items: [], next: null };

/** Un resultado de YouTube con la forma que espera el reproductor. */
export function ytVideo(r: { id: string; title: string; durationMs: number }): TvVideo {
  return {
    id: r.id,
    kind: 'movie',
    title: r.title,
    series: '',
    seriesKey: '',
    season: 0,
    episode: 0,
    year: 0,
    durationMs: r.durationMs,
    size: 0,
    addedAt: 0,
    width: 0,
    height: 0,
    vcodec: '',
    langs: [],
    subs: 0,
  };
}

export function youtubeView(): View {
  const conn = app.conn!;
  const input = h('input', { class: 'input yt-input', type: 'text', focus: true, 'data-key': 'yt-q', placeholder: 'Buscar videos en YouTube', value: last.query }) as HTMLInputElement;
  const go = h('button', { class: 'btn primary', focus: true, 'data-key': 'yt-go', onclick: () => void run(false) }, icon('search', 34), 'Buscar');
  const status = h('div', { class: 'yt-status' });
  const grid = h('div', { class: 'vgrid', 'data-group': 'yt-results' });
  const root = h(
    'div',
    { class: 'view scroll' },
    h('div', { class: 'view-head small' }, h('h1', null, 'YouTube'), h('div', { class: 'head-sub' }, `Sin anuncios · desde «${app.library.name}»`)),
    h('div', { class: 'yt-bar', 'data-group': 'yt-bar' }, input, go),
    status,
    grid,
  );
  let busy = false;
  let destroyed = false;

  function card(r: YtResult): HTMLElement {
    return h(
      'div',
      { class: 'vcard', focus: true, 'data-key': `yt-${r.id}`, onclick: () => playVideo(ytVideo(r), { resume: true }) },
      h('div', { class: 'vcard-art' }, lazyImage(r.thumb, r.id, 'vcard-img', 'play')),
      h('div', { class: 'vcard-title' }, r.title),
      h('div', { class: 'vcard-sub' }, [r.channel, durationText(r.durationMs)].filter(Boolean).join(' · ')),
    );
  }

  function render() {
    clear(grid);
    for (const r of last.items) grid.appendChild(card(r));
    if (last.next) grid.appendChild(h('div', { class: 'vcard more', focus: true, 'data-key': 'yt-more', onclick: () => void run(true) }, h('div', { class: 'vcard-art more-art' }, icon('refresh', 60)), h('div', { class: 'vcard-title' }, 'Cargar más')));
    status.textContent = last.items.length ? '' : last.query ? 'Sin resultados.' : 'Escribe qué quieres ver y pulsa Buscar. Con el control mágico también puedes dictar.';
  }

  async function run(more: boolean) {
    if (busy) return;
    const q = more ? last.query : input.value.trim();
    if (!q) {
      status.textContent = 'Escribe qué quieres buscar.';
      return;
    }
    busy = true;
    status.textContent = more ? 'Cargando más…' : 'Buscando en YouTube…';
    try {
      const page = await ytSearch(conn, q, 'videos', more ? last.next : null);
      if (destroyed) return;
      last.query = q;
      last.items = more ? last.items.concat(page.items) : page.items;
      last.next = page.next;
      render();
      if (!more && last.items.length) focus(grid.querySelector<HTMLElement>('[data-focus]'));
    } catch (err) {
      if (destroyed) return;
      if (err instanceof Unauthorized) toast('La TV ya no está emparejada. Vuelve a conectarla desde Ajustes.');
      else status.textContent = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  input.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).keyCode === 13) void run(false);
  });
  render();
  return {
    el: root,
    focus: () => focus(last.items.length ? grid.querySelector<HTMLElement>('[data-focus]') : input),
    destroy: () => {
      destroyed = true;
    },
  };
}
