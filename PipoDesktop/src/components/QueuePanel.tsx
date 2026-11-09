import { resolveIds } from '../state/library';
import { useStore } from '../lib/store';
import { formatLong, plural } from '../lib/format';
import { clearQueue, jumpTo, moveInQueue, player } from '../state/player';
import { ui } from '../state/ui';
import { openNewPlaylist } from './Dialogs';
import { IconButton } from './Icon';
import { TrackList } from './TrackList';

export function QueuePanel() {
  const open = useStore(ui, (s) => s.queueOpen);
  const queue = useStore(player, (s) => s.queue);
  const index = useStore(player, (s) => s.index);
  if (!open) return null;
  const tracks = resolveIds(queue);
  const rest = tracks.slice(Math.max(0, index));
  return (
    <aside className="queue-panel">
      <div className="queue-head">
        <div>
          <h2>Cola de reproducción</h2>
          <div className="muted small">
            {plural(tracks.length, 'canción', 'canciones')} · quedan {formatLong(rest.reduce((s, t) => s + t.durationMs, 0))}
          </div>
        </div>
        <div className="grow" />
        <IconButton name="save" label="Guardar la cola como lista" onClick={() => openNewPlaylist(tracks)} disabled={!tracks.length} size={20} />
        <IconButton name="delete" label="Vaciar la cola" onClick={clearQueue} disabled={!tracks.length} size={20} />
        <IconButton name="close" label="Cerrar" onClick={() => ui.set({ queueOpen: false })} size={20} />
      </div>
      <div className="scroll queue-scroll">
        <TrackList
          tracks={tracks}
          showAlbum={false}
          currentIndex={index}
          onPlay={jumpTo}
          onReorder={moveInQueue}
          menuContext={(i) => ({ queueIndex: i })}
          empty="La cola está vacía. Reproduce una canción o agrégala desde su menú."
        />
      </div>
      <div className="queue-hint muted small">Arrastra las canciones para cambiar el orden.</div>
    </aside>
  );
}
