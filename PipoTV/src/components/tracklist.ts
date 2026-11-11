// Lista virtual de canciones: solo dibuja las filas visibles (miles de canciones sin trabarse).
import type { TvTrack } from '../api';
import { formatTime, h, icon } from '../dom';
import { artistOf } from '../library';
import { focus, setKeyOwner, type Dir, type KeyOwner } from '../nav';
import { art, current } from '../state';
import { lazyImage } from './images';

const ROW = 92;

export interface TrackListOptions {
  numbered?: boolean;
  onPlay(index: number): void;
  onMore?(index: number): void;
  currentIndex?: () => number;
  emptyText?: string;
}

export class TrackList implements KeyOwner {
  readonly el: HTMLElement;
  private top = 0;
  private rows = 8;

  constructor(private tracks: TvTrack[], private opts: TrackListOptions) {
    this.el = h('div', { class: 'vlist', 'data-owner': '', 'data-group': 'list' });
    setKeyOwner(this.el, this);
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.scrollTo(this.top + ((e as WheelEvent).deltaY > 0 ? 3 : -3));
    });
    setTimeout(() => this.render(), 0);
  }

  get length() {
    return this.tracks.length;
  }

  private scrollTo(top: number) {
    const max = Math.max(0, this.tracks.length - this.rows);
    this.top = Math.max(0, Math.min(max, top));
    this.render();
  }

  render() {
    this.rows = Math.max(4, Math.floor((this.el.clientHeight || 700) / ROW));
    const active = document.activeElement as HTMLElement | null;
    const focusedIndex = active && this.el.contains(active) ? Number(active.getAttribute('data-i')) : -1;
    const focusedRole = active ? active.getAttribute('data-role') : null;
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild);
    if (!this.tracks.length) {
      this.el.appendChild(h('div', { class: 'empty' }, this.opts.emptyText || 'No hay canciones.'));
      return;
    }
    const curId = current()?.id;
    const curIndex = this.opts.currentIndex ? this.opts.currentIndex() : -1;
    const end = Math.min(this.tracks.length, this.top + this.rows + 1);
    for (let i = this.top; i < end; i++) {
      const t = this.tracks[i];
      const isCurrent = curIndex >= 0 ? i === curIndex : t.id === curId;
      const main = h(
        'div',
        { class: 'row-main', focus: true, 'data-i': i, 'data-role': 'main', onclick: () => this.opts.onPlay(i) },
        this.opts.numbered
          ? h('div', { class: 'row-num' }, String(t.trackNo || i + 1))
          : lazyImage(art(t), t.album || t.title, 'row-art'),
        h('div', { class: 'row-titles' }, h('div', { class: 'row-title' }, t.title), h('div', { class: 'row-sub' }, artistOf(t))),
        h('div', { class: 'row-album' }, t.album),
        h('div', { class: 'row-dur' }, formatTime(t.durationMs)),
      );
      const row = h('div', { class: `row${isCurrent ? ' current' : ''}`, style: { top: `${(i - this.top) * ROW}px` } }, main);
      if (this.opts.onMore) {
        row.appendChild(h('div', { class: 'row-more', focus: true, 'data-i': i, 'data-role': 'more', onclick: () => this.opts.onMore!(i) }, icon('more', 34)));
      }
      this.el.appendChild(row);
    }
    if (focusedIndex >= 0) this.focusIndex(focusedIndex, focusedRole);
  }

  focusIndex(i: number, role: string | null = 'main') {
    if (i < this.top) this.top = i;
    else if (i >= this.top + this.rows) this.top = i - this.rows + 1;
    const el = this.el.querySelector<HTMLElement>(`[data-i="${i}"][data-role="${role || 'main'}"]`);
    if (!el) {
      this.render();
      const again = this.el.querySelector<HTMLElement>(`[data-i="${i}"][data-role="${role || 'main'}"]`);
      if (again) focus(again);
      return;
    }
    focus(el);
  }

  handleKey(dir: Dir, el: HTMLElement): boolean {
    if (dir !== 'up' && dir !== 'down') return false;
    const i = Number(el.getAttribute('data-i'));
    const next = dir === 'down' ? i + 1 : i - 1;
    if (next < 0 || next >= this.tracks.length) return false;
    const role = el.getAttribute('data-role');
    if (next < this.top || next >= this.top + this.rows) {
      this.top = dir === 'down' ? next - this.rows + 1 : next;
      this.render();
    }
    this.focusIndex(next, role);
    return true;
  }

  focusFirst() {
    this.focusIndex(0);
  }

  /** Marca la canción que suena sin redibujar toda la lista. */
  refreshCurrent() {
    const curId = current()?.id;
    const curIndex = this.opts.currentIndex ? this.opts.currentIndex() : -1;
    const rows = this.el.querySelectorAll<HTMLElement>('.row');
    for (let k = 0; k < rows.length; k++) {
      const main = rows[k].querySelector<HTMLElement>('.row-main');
      const i = Number(main?.getAttribute('data-i'));
      const t = this.tracks[i];
      const isCurrent = curIndex >= 0 ? i === curIndex : !!t && t.id === curId;
      rows[k].className = `row${isCurrent ? ' current' : ''}`;
    }
  }
}
