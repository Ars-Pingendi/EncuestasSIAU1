// Carátulas con carga diferida y color de reemplazo.
import { h, hashColor, icon } from '../dom';

let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver | null {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const img = e.target as HTMLImageElement;
        const src = img.getAttribute('data-src');
        if (src) img.src = src;
        img.removeAttribute('data-src');
        observer!.unobserve(img);
      }
    },
    { rootMargin: '400px' },
  );
  return observer;
}

export function lazyImage(src: string | null, seed: string, cls: string, iconName = 'note'): HTMLElement {
  const box = h('div', { class: `art ${cls}`, style: { background: `linear-gradient(135deg, ${hashColor(seed)}, #2e2840)` } }, icon(iconName, 40));
  if (src) {
    const img = h('img', { alt: '' }) as HTMLImageElement;
    img.addEventListener('load', () => box.classList.add('loaded'));
    img.addEventListener('error', () => img.parentNode && img.parentNode.removeChild(img));
    const obs = getObserver();
    if (obs) {
      img.setAttribute('data-src', src);
      obs.observe(img);
    } else img.src = src;
    box.appendChild(img);
  }
  return box;
}
