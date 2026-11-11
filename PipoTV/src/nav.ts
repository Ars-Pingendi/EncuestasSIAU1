// Navegación con el control remoto: flechas (navegación espacial), OK, Atrás y teclas multimedia.
// El Magic Remote (puntero) también funciona: el elemento bajo el puntero toma el foco.

export const KEY = {
  LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13,
  BACK: 461, BACKSPACE: 8, ESC: 27,
  PLAY: 415, PAUSE: 19, PLAY_PAUSE: 10252, STOP: 413, REWIND: 412, FAST_FORWARD: 417,
  CH_UP: 33, CH_DOWN: 34,
};

export type Dir = 'left' | 'right' | 'up' | 'down';

/** Controladores que manejan sus propias flechas (listas virtuales, controles deslizantes). */
export interface KeyOwner {
  handleKey(dir: Dir, el: HTMLElement): boolean;
}
const owners = new WeakMap<Element, KeyOwner>();
export function setKeyOwner(el: Element, owner: KeyOwner) {
  owners.set(el, owner);
}

function visible(el: HTMLElement): boolean {
  if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function layer(): HTMLElement {
  // Si hay un menú o diálogo abierto, la navegación se limita a él.
  const modals = document.querySelectorAll<HTMLElement>('[data-modal]');
  return modals.length ? modals[modals.length - 1] : document.body;
}

export function focusables(root: ParentNode = layer()): HTMLElement[] {
  return Array.prototype.slice.call(root.querySelectorAll('[data-focus]')).filter(visible);
}

export function focus(el: HTMLElement | null | undefined) {
  if (!el) return;
  el.focus();
  ensureVisible(el);
}

function ensureVisible(el: HTMLElement) {
  let p = el.parentElement;
  while (p && p !== document.body) {
    const style = getComputedStyle(p);
    const scrollY = /(auto|scroll)/.test(style.overflowY) && p.scrollHeight > p.clientHeight;
    const scrollX = /(auto|scroll)/.test(style.overflowX) && p.scrollWidth > p.clientWidth;
    if (scrollY || scrollX) {
      const pr = p.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const margin = 48;
      if (scrollY) {
        if (r.top < pr.top + margin) p.scrollTop -= pr.top + margin - r.top;
        else if (r.bottom > pr.bottom - margin) p.scrollTop += r.bottom - (pr.bottom - margin);
      }
      if (scrollX) {
        if (r.left < pr.left + margin) p.scrollLeft -= pr.left + margin - r.left;
        else if (r.right > pr.right - margin) p.scrollLeft += r.right - (pr.right - margin);
      }
    }
    p = p.parentElement;
  }
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Elige el elemento más cercano en la dirección indicada, prefiriendo el mismo grupo. */
export function move(dir: Dir): boolean {
  const current = document.activeElement as HTMLElement | null;
  const all = focusables();
  if (!all.length) return false;
  if (!current || all.indexOf(current) < 0) {
    focus(all[0]);
    return true;
  }
  const owner = current.closest('[data-owner]');
  if (owner) {
    const ctl = owners.get(owner);
    if (ctl && ctl.handleKey(dir, current)) return true;
  }
  const cr = current.getBoundingClientRect();
  const c = center(cr);
  const group = current.closest('[data-group]');
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  let bestSameGroup = false;
  for (const el of all) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const p = center(r);
    let primary: number, secondary: number;
    switch (dir) {
      case 'left':
        if (r.right > cr.left + 4) continue;
        primary = cr.left - r.right;
        secondary = Math.abs(p.y - c.y);
        break;
      case 'right':
        if (r.left < cr.right - 4) continue;
        primary = r.left - cr.right;
        secondary = Math.abs(p.y - c.y);
        break;
      case 'up':
        if (r.bottom > cr.top + 4) continue;
        primary = cr.top - r.bottom;
        secondary = Math.abs(p.x - c.x);
        break;
      default:
        if (r.top < cr.bottom - 4) continue;
        primary = r.top - cr.bottom;
        secondary = Math.abs(p.x - c.x);
    }
    const score = Math.max(0, primary) + secondary * 2;
    const sameGroup = !!group && el.closest('[data-group]') === group;
    if ((sameGroup && !bestSameGroup) || (sameGroup === bestSameGroup && score < bestScore)) {
      best = el;
      bestScore = score;
      bestSameGroup = sameGroup;
    }
  }
  if (best) {
    focus(best);
    return true;
  }
  return false;
}

export interface KeyHandlers {
  back(): void;
  playPause(): void;
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  seek(deltaMs: number): void;
}

export function installKeys(handlers: KeyHandlers) {
  document.addEventListener('keydown', (e) => {
    const k = e.keyCode;
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
    const dir: Dir | null = k === KEY.LEFT ? 'left' : k === KEY.RIGHT ? 'right' : k === KEY.UP ? 'up' : k === KEY.DOWN ? 'down' : null;
    if (dir) {
      // En un campo de texto, izquierda/derecha mueven el cursor.
      if (typing && (dir === 'left' || dir === 'right')) return;
      e.preventDefault();
      move(dir);
      return;
    }
    if (k === KEY.OK && target && target.hasAttribute('data-focus') && !typing) {
      e.preventDefault();
      target.click();
      return;
    }
    if (k === KEY.BACK || k === KEY.ESC || (k === KEY.BACKSPACE && !typing)) {
      e.preventDefault();
      handlers.back();
      return;
    }
    if (k === KEY.PLAY_PAUSE) handlers.playPause();
    else if (k === KEY.PLAY) handlers.play();
    else if (k === KEY.PAUSE || k === KEY.STOP) handlers.pause();
    else if (k === KEY.FAST_FORWARD) handlers.seek(10000);
    else if (k === KEY.REWIND) handlers.seek(-10000);
    else if (k === KEY.CH_UP) handlers.next();
    else if (k === KEY.CH_DOWN) handlers.previous();
    else return;
    e.preventDefault();
  });
  // Magic Remote: el puntero enfoca lo que señala.
  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('[data-focus]') as HTMLElement | null;
    if (el && document.activeElement !== el) el.focus();
  });
}
