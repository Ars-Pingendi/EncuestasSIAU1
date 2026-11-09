import { useEffect, useRef } from 'react';
import { useStore } from '../lib/store';
import { goBack, navigate, ui } from '../state/ui';
import { Icon, IconButton } from './Icon';

export function TopBar() {
  const stack = useStore(ui, (s) => s.stack);
  const nowPlaying = useStore(ui, (s) => s.nowPlaying);
  const text = useStore(ui, (s) => s.searchText);
  const input = useRef<HTMLInputElement>(null);
  const top = stack[stack.length - 1];

  useEffect(() => {
    const focus = () => input.current?.focus();
    window.addEventListener('pipo:focus-search', focus);
    return () => window.removeEventListener('pipo:focus-search', focus);
  }, []);

  const onChange = (q: string) => {
    ui.set({ searchText: q });
    if (q.trim()) navigate({ view: 'search', q });
    else if (top.view === 'search') goBack();
  };

  return (
    <div className="topbar">
      <IconButton name="back" label="Atrás (Alt+←)" onClick={goBack} disabled={stack.length < 2 && !nowPlaying} className="no-drag" />
      <div className="search-box no-drag">
        <Icon name="search" size={20} />
        <input
          ref={input}
          value={text}
          placeholder="Buscar canciones, álbumes o artistas"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onChange('');
              input.current?.blur();
            }
          }}
          aria-label="Buscar"
        />
        {text && <IconButton name="close" label="Borrar búsqueda" size={18} onClick={() => onChange('')} />}
      </div>
      <div className="grow drag" />
    </div>
  );
}
