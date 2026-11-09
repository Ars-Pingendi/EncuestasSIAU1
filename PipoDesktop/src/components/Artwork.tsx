import { useState } from 'react';
import type { Track } from '../../shared/types';
import { artUrl } from '../api';
import { hashColor } from '../lib/format';
import { Icon } from './Icon';

export function Artwork({
  track, seed, size, round, className = '', icon = 'note',
}: {
  track?: Pick<Track, 'artId' | 'artworkUrl'> | null;
  seed?: string;
  size?: number;
  round?: boolean;
  className?: string;
  icon?: string;
}) {
  const url = artUrl(track);
  const [failed, setFailed] = useState<string | null>(null);
  const style = size ? { width: size, height: size } : undefined;
  const show = url && failed !== url;
  return (
    <div
      className={`art ${round ? 'round' : ''} ${className}`}
      style={{ ...style, background: show ? undefined : `linear-gradient(135deg, ${hashColor(seed ?? '')}, var(--surface-3))` }}
    >
      {show ? (
        <img src={url} alt="" loading="lazy" draggable={false} onError={() => setFailed(url)} />
      ) : (
        <Icon name={icon} size={size ? Math.max(16, size * 0.42) : 40} />
      )}
    </div>
  );
}
