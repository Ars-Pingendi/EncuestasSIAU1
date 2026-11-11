import { h, icon, plural } from '../dom';
import { app } from '../state';
import type { View } from '../ui';

export function settingsView(actions: { reload(): void; forget(): void }): View {
  const conn = app.conn;
  const el = h(
    'div',
    { class: 'view scroll settings' },
    h('div', { class: 'view-head small' }, h('h1', null, 'Ajustes')),
    h(
      'div',
      { class: 'panel' },
      h('h2', null, 'Biblioteca'),
      h('p', null, `Conectado a «${app.library.name}» (${conn ? conn.base.replace(/^http:\/\//, '') : ''}) · ${plural(app.library.tracks.length, 'canción', 'canciones')}.`),
      h(
        'div',
        { class: 'actions', 'data-group': 'settings' },
        h('button', { class: 'btn', focus: true, onclick: actions.reload }, icon('refresh', 34), 'Actualizar biblioteca'),
        h('button', { class: 'btn', focus: true, onclick: actions.forget }, icon('computer', 34), 'Conectar con otro PC'),
      ),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h2', null, 'Control remoto'),
      h(
        'ul',
        { class: 'keys' },
        h('li', null, h('b', null, 'Flechas y OK'), ' — moverse y elegir'),
        h('li', null, h('b', null, 'Atrás'), ' — volver'),
        h('li', null, h('b', null, '▶ ⏸'), ' — reproducir o pausar'),
        h('li', null, h('b', null, '⏪ ⏩'), ' — retroceder o adelantar 10 s'),
        h('li', null, h('b', null, 'Canal + / Canal −'), ' — siguiente o anterior canción'),
        h('li', null, h('b', null, 'Botón ⋯ de cada canción'), ' — reproducir a continuación, agregar a la cola, ir al álbum'),
      ),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h2', null, 'Acerca de'),
      h('p', null, 'Pipo Music Player 1.0.0 para LG webOS · Licencia GPL-3.0. Para crear listas, marcar favoritos o descargar de YouTube usa Pipo en el PC: la TV se actualiza con «Actualizar biblioteca».'),
    ),
  );
  return { el };
}
