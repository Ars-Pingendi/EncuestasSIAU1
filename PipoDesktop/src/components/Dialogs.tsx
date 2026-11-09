import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Track } from '../../shared/types';
import { addToPlaylist, createPlaylist, data } from '../state/data';
import { closeDialog, openDialog, toast } from '../state/ui';
import { useStore } from '../lib/store';
import { plural } from '../lib/format';
import { Icon } from './Icon';

function Shell({ title, children, actions, onSubmit }: { title: string; children: ReactNode; actions: ReactNode; onSubmit?: () => void }) {
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeDialog()}>
      <form
        className="dialog"
        role="dialog"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        <h2>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </form>
    </div>
  );
}

export function PromptDialog({
  title, label, initial = '', confirm = 'Aceptar', onSubmit,
}: { title: string; label: string; initial?: string; confirm?: string; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const submit = () => {
    if (!value.trim()) return;
    closeDialog();
    onSubmit(value.trim());
  };
  return (
    <Shell
      title={title}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn text" onClick={closeDialog}>Cancelar</button>
          <button type="submit" className="btn filled" disabled={!value.trim()}>{confirm}</button>
        </>
      }
    >
      <label className="field">
        <span>{label}</span>
        <input ref={ref} value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
      </label>
    </Shell>
  );
}

export function ConfirmDialog({ title, text, confirm, onConfirm }: { title: string; text: string; confirm: string; onConfirm: () => void }) {
  return (
    <Shell
      title={title}
      onSubmit={() => {
        closeDialog();
        onConfirm();
      }}
      actions={
        <>
          <button type="button" className="btn text" onClick={closeDialog}>Cancelar</button>
          <button type="submit" className="btn filled danger" autoFocus>{confirm}</button>
        </>
      }
    >
      <p>{text}</p>
    </Shell>
  );
}

function AddToPlaylist({ tracks }: { tracks: Track[] }) {
  const playlists = useStore(data, (s) => s.user.playlists);
  const add = (id: string, name: string) => {
    closeDialog();
    const n = addToPlaylist(id, tracks);
    toast(n ? `${plural(n, 'canción agregada', 'canciones agregadas')} a «${name}»` : `Ya estaba en «${name}»`);
  };
  return (
    <Shell title="Agregar a una lista" actions={<button type="button" className="btn text" onClick={closeDialog}>Cerrar</button>}>
      <div className="picker">
        <button
          type="button"
          className="picker-item new"
          onClick={() =>
            openDialog(
              <PromptDialog
                title="Nueva lista"
                label="Nombre de la lista"
                confirm="Crear"
                onSubmit={(name) => {
                  createPlaylist(name, tracks);
                  toast(`Lista «${name}» creada`);
                }}
              />,
            )
          }
        >
          <Icon name="add" /> Nueva lista…
        </button>
        {playlists.map((p) => (
          <button type="button" key={p.id} className="picker-item" onClick={() => add(p.id, p.name)}>
            <Icon name="playlist" />
            <span className="grow">{p.name}</span>
            <span className="muted">{plural(p.trackIds.length, 'canción', 'canciones')}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

export function openAddToPlaylist(tracks: Track[]) {
  if (tracks.length) openDialog(<AddToPlaylist tracks={tracks} />);
}

export function openNewPlaylist(tracks: Track[] = [], after?: (id: string) => void) {
  openDialog(
    <PromptDialog
      title="Nueva lista"
      label="Nombre de la lista"
      confirm="Crear"
      onSubmit={(name) => {
        const p = createPlaylist(name, tracks);
        toast(`Lista «${name}» creada`);
        after?.(p.id);
      }}
    />,
  );
}
