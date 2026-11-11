// Cuadrícula de tarjetas (álbumes, artistas, géneros, listas).
import { h } from '../dom';
import { lazyImage } from './images';

export interface CardItem {
  key: string;
  title: string;
  subtitle: string;
  art: string | null;
  round?: boolean;
  icon?: string;
}

export function cardGrid(items: CardItem[], onOpen: (key: string) => void, emptyText = 'No hay nada aquí todavía.'): HTMLElement {
  if (!items.length) return h('div', { class: 'empty' }, emptyText);
  return h(
    'div',
    { class: 'grid', 'data-group': 'grid' },
    items.map((it) =>
      h(
        'div',
        { class: `card${it.round ? ' round' : ''}`, focus: true, onclick: () => onOpen(it.key) },
        lazyImage(it.art, it.title, 'card-art', it.icon),
        h('div', { class: 'card-title' }, it.title),
        h('div', { class: 'card-sub' }, it.subtitle),
      ),
    ),
  );
}
