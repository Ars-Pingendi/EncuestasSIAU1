// Lista de canciones virtualizada (miles de filas sin perder fluidez), con menú contextual,
// favoritos, estado de descarga y reordenamiento arrastrando.
import { useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { Track } from '../../shared/types';
import { api } from '../api';
import { formatTime } from '../lib/format';
import { artistOf } from '../lib/group';
import { useStore } from '../lib/store';
import { data, toggleFavTrack } from '../state/data';
import { lib } from '../state/library';
import { player, playTracks } from '../state/player';
import { openMenu } from '../state/ui';
import { Artwork } from './Artwork';
import { Icon } from './Icon';
import { trackMenuItems, type TrackContext } from './trackMenu';

const ROW = 56;
const OVERSCAN = 10;

export interface TrackListProps {
  tracks: Track[];
  numbered?: boolean;
  showAlbum?: boolean;
  playlistId?: string;
  onReorder?: (from: number, to: number) => void;
  onPlay?: (index: number) => void;
  empty?: string;
  /** Contexto para el menú (por ejemplo, la cola). */
  menuContext?: (index: number) => TrackContext;
  currentIndex?: number;
}

export function TrackList({ tracks, numbered, showAlbum = true, playlistId, onReorder, onPlay, empty, menuContext, currentIndex }: TrackListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 40 });
  const [selected, setSelected] = useState(-1);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const currentId = useStore(player, (s) => s.queue[s.index]);
  const playing = useStore(player, (s) => s.playing);
  const favs = useStore(data, (s) => s.user.favTracks);
  const favSet = useMemo(() => new Set(favs), [favs]);
  const dlState = useStore(lib, (s) => s.dlState);
  const downloads = useStore(lib, (s) => s.downloads);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = (el.closest('.scroll') as HTMLElement | null) ?? document.documentElement;
    const update = () => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const viewStart = Math.max(0, -top);
      const viewEnd = viewStart + scroller.clientHeight;
      const start = Math.max(0, Math.floor(viewStart / ROW) - OVERSCAN);
      const end = Math.min(tracks.length, Math.ceil(viewEnd / ROW) + OVERSCAN);
      setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
    };
    update();
    scroller.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [tracks.length]);

  if (!tracks.length) return <div className="empty">{empty ?? 'No hay canciones.'}</div>;

  const play = (i: number) => (onPlay ? onPlay(i) : playTracks(tracks, i));
  const menu = (e: MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(i);
    openMenu(e, trackMenuItems(tracks[i], menuContext ? menuContext(i) : { list: tracks, index: i, playlistId }));
  };

  const rows = [];
  const end = Math.min(range.end, tracks.length);
  for (let i = Math.min(range.start, end); i < end; i++) {
    const t = tracks[i];
    const isCurrent = currentIndex !== undefined ? i === currentIndex : t.id === currentId;
    const st = t.videoId ? dlState[t.videoId] : undefined;
    const downloaded = t.videoId ? downloads.has(t.videoId) : false;
    const dragProps = onReorder
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
            setDrag({ from: i, over: i });
          },
          onDragOver: (e: DragEvent) => {
            if (!drag) return;
            e.preventDefault();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const over = e.clientY - rect.top > rect.height / 2 ? i + 1 : i;
            if (over !== drag.over) setDrag({ ...drag, over });
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            if (drag) {
              const to = drag.over > drag.from ? drag.over - 1 : drag.over;
              if (to !== drag.from) onReorder(drag.from, to);
            }
            setDrag(null);
          },
          onDragEnd: () => setDrag(null),
        }
      : t.source === 'local' || downloaded
        ? {
            // Arrastrar la canción a WhatsApp, al Explorador, a un correo…
            draggable: true,
            onDragStart: (e: DragEvent) => {
              e.preventDefault();
              api.startDrag(t.id);
            },
          }
        : {};
    rows.push(
      <div
        key={`${t.id}-${i}`}
        className={`track-row ${isCurrent ? 'current' : ''} ${selected === i ? 'selected' : ''} ${drag?.from === i ? 'dragging' : ''} ${
          drag && drag.over === i ? 'drop-before' : ''
        } ${drag && drag.over === i + 1 && i === tracks.length - 1 ? 'drop-after' : ''}`}
        style={{ top: i * ROW }}
        onClick={() => setSelected(i)}
        onDoubleClick={() => play(i)}
        onContextMenu={(e) => menu(e, i)}
        role="row"
        aria-selected={selected === i}
        {...dragProps}
      >
        <div className="c-num">
          {onReorder ? <Icon name="drag" size={18} className="drag-handle" /> : null}
          <span className="num">{isCurrent && playing ? <span className="eq-anim"><i /><i /><i /></span> : numbered ? t.trackNo || i + 1 : i + 1}</span>
          <button type="button" className="row-play" title="Reproducir" onClick={(e) => (e.stopPropagation(), play(i))}>
            <Icon name="play" size={20} />
          </button>
        </div>
        <div className="c-title">
          {!numbered && <Artwork track={t} seed={t.album || t.title} size={40} />}
          <div className="titles">
            <div className="t1">{t.title}</div>
            <div className="t2">
              {t.source === 'youtube' && <span className="badge">YouTube</span>}
              {artistOf(t)}
            </div>
          </div>
        </div>
        {showAlbum && <div className="c-album">{t.album}</div>}
        <div className="c-dl">
          {downloaded ? (
            <span title="Descargada"><Icon name="downloadDone" size={18} /></span>
          ) : st && (st.state === 'running' || st.state === 'queued') ? (
            <span className="dl-progress" title="Descargando">{Math.round((st.progress ?? 0) * 100)}%</span>
          ) : null}
        </div>
        <div className="c-dur">{formatTime(t.durationMs)}</div>
        <button
          type="button"
          className={`c-fav icon-btn ${favSet.has(t.id) ? 'active' : ''}`}
          title={favSet.has(t.id) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
          onClick={(e) => (e.stopPropagation(), toggleFavTrack(t))}
        >
          <Icon name={favSet.has(t.id) ? 'heart' : 'heartOutline'} size={18} />
        </button>
        <button type="button" className="c-more icon-btn" title="Más opciones" onClick={(e) => menu(e, i)}>
          <Icon name="more" size={20} />
        </button>
      </div>,
    );
  }

  return (
    <div
      ref={ref}
      className={`track-list ${showAlbum ? '' : 'no-album'}`}
      style={{ height: tracks.length * ROW }}
      role="grid"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && selected >= 0) play(selected);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelected((s) => Math.min(tracks.length - 1, s + 1));
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelected((s) => Math.max(0, s - 1));
        }
      }}
    >
      {rows}
    </div>
  );
}
