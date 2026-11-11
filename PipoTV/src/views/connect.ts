// Primera vez: conectar la TV con Pipo del PC (dirección + código).
import { pair, savedConnection, type Connection } from '../api';
import { h, icon } from '../dom';
import { focus } from '../nav';

export function connectScreen(container: HTMLElement, onConnected: (c: Connection) => void, message = '') {
  const last = savedConnection();
  const address = h('input', {
    class: 'input',
    type: 'text',
    focus: true,
    placeholder: '192.168.1.20',
    value: last ? last.base.replace(/^http:\/\//, '').replace(/:37373$/, '') : '',
  }) as HTMLInputElement;
  const pin = h('input', { class: 'input code', type: 'number', focus: true, placeholder: '0000', maxlength: 4 }) as HTMLInputElement;
  const status = h('div', { class: `connect-status${message ? ' error' : ''}` }, message);
  const button = h('button', { class: 'btn primary big', focus: true }, icon('link', 38), 'Conectar');
  const run = async () => {
    if (!address.value.trim() || !pin.value.trim()) {
      status.textContent = 'Escribe la dirección y el código que muestra Pipo en el PC.';
      status.className = 'connect-status error';
      return;
    }
    status.textContent = 'Conectando…';
    status.className = 'connect-status';
    try {
      onConnected(await pair(address.value, pin.value));
    } catch (err) {
      status.textContent = (err as Error).message;
      status.className = 'connect-status error';
    }
  };
  button.addEventListener('click', () => void run());
  for (const input of [address, pin]) {
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).keyCode === 13 && input === pin) void run();
    });
  }
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(
    h(
      'div',
      { class: 'connect' },
      h('img', { class: 'connect-logo', src: 'largeIcon.png', alt: '' }),
      h('h1', null, 'Pipo Music Player'),
      h('p', { class: 'lead' }, 'Escucha en la TV la música de tu PC: canciones, álbumes, listas, favoritos y el ecualizador de Pipo.'),
      h(
        'ol',
        { class: 'steps' },
        h('li', null, 'En el PC abre ', h('b', null, 'Pipo › Ajustes › Pipo en la TV'), ' y activa ', h('b', null, '«Compartir mi música con la TV»'), '.'),
        h('li', null, 'Escribe aquí la ', h('b', null, 'dirección'), ' y el ', h('b', null, 'código'), ' que aparecen en el PC.'),
        h('li', null, 'La TV y el PC deben estar en la misma red (Wi-Fi o cable).'),
      ),
      h(
        'div',
        { class: 'form', 'data-group': 'form' },
        h('label', null, h('span', null, 'Dirección del PC'), address),
        h('label', null, h('span', null, 'Código'), pin),
        button,
      ),
      status,
    ),
  );
  setTimeout(() => focus(address.value ? pin : address), 50);
}
