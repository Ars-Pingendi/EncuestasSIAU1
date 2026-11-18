import { fetchText } from '../api';
import { h, icon, plural } from '../dom';
import { app } from '../state';
import type { View } from '../ui';

/** YouTube: qué pasó entre la TV, el teléfono y YouTube (para saber por qué un video no carga). */
function logPanel(): HTMLElement {
  const conn = app.conn!;
  const box = h('pre', { class: 'log-box' }, 'Pulsa «Ver registro» para leerlo.');
  const load = async () => {
    box.textContent = 'Cargando…';
    try {
      const text = (await fetchText(`${conn.base}/pipo/log?t=${conn.token}`, 10000)).trim();
      box.textContent = text ? text.split('\n').slice(0, 22).join('\n') : '(todavía no hay nada registrado)';
    } catch (err) {
      box.textContent = `No se pudo leer el registro: ${(err as Error).message}`;
    }
  };
  return h(
    'div',
    { class: 'panel' },
    h('h2', null, 'Registro del teléfono'),
    h('p', null, 'Lo último que pasó entre la TV, el teléfono y YouTube (lo más reciente arriba). Ayuda a saber por qué un video no carga.'),
    h('div', { class: 'actions', 'data-group': 'log' }, h('button', { class: 'btn', focus: true, onclick: () => void load() }, icon('refresh', 34), 'Ver registro')),
    box,
  );
}

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
      h('p', null, `Conectado a «${app.library.name}» (${conn ? conn.base.replace(/^http:\/\//, '') : ''}) · ${plural(app.library.tracks.length, 'canción', 'canciones')}${app.hasVideo ? ` · ${plural(app.videos.movies.length, 'película', 'películas')} · ${plural(app.videos.series.length, 'serie', 'series')}` : ''}.`),
      h(
        'div',
        { class: 'actions', 'data-group': 'settings' },
        h('button', { class: 'btn', focus: true, onclick: actions.reload }, icon('refresh', 34), 'Actualizar biblioteca'),
        h('button', { class: 'btn', focus: true, onclick: actions.forget }, icon('computer', 34), 'Conectar con otro equipo'),
      ),
    ),
    app.hasYoutube || !app.canConvert ? logPanel() : null,
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
      h('p', null, 'Pipo Music Player 1.5.3 para LG webOS · Licencia GPL-3.0. Para crear listas, marcar favoritos o descargar de YouTube usa Pipo en el PC o en el teléfono: la TV se actualiza con «Actualizar biblioteca».'),
    ),
  );
  return { el };
}
