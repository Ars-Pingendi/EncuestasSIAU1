import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Track } from '../../shared/types';
import { useStore } from '../lib/store';
import { closeMenu, ui } from '../state/ui';
import { Artwork } from './Artwork';
import { Icon } from './Icon';

export function Range({
  value, min = 0, max = 100, step = 1, onChange, onCommit, label, className = '', vertical, style,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  className?: string;
  vertical?: boolean;
  style?: CSSProperties;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  // Los controles con rango negativo (bandas del ecualizador) se rellenan desde el centro.
  const centered = min < 0 && max > 0;
  const zero = centered ? ((0 - min) / (max - min)) * 100 : 0;
  const lo = centered ? Math.min(pct, zero) : 0;
  const hi = centered ? Math.max(pct, zero) : pct;
  return (
    <input
      type="range"
      className={`range ${vertical ? 'vertical' : ''} ${className}`}
      aria-label={label}
      title={label}
      min={min}
      max={max}
      step={step}
      value={value}
      style={{ ...style, ['--lo' as string]: `${lo}%`, ['--hi' as string]: `${hi}%` }}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

/** Barra de progreso que no salta mientras se arrastra. */
export function SeekBar({ position, duration, onSeek, className = '' }: { position: number; duration: number; onSeek: (ms: number) => void; className?: string }) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  return (
    <Range
      className={`seek ${className}`}
      label="Posición"
      min={0}
      max={Math.max(1, duration)}
      step={250}
      value={dragValue ?? Math.min(position, duration || position)}
      onChange={setDragValue}
      onCommit={(v) => {
        onSeek(v);
        setDragValue(null);
      }}
    />
  );
}

export function PageHeader({
  title, subtitle, cover, seed, round, actions, kicker, icon,
}: {
  title: string;
  subtitle?: ReactNode;
  cover?: Track | null;
  seed?: string;
  round?: boolean;
  actions?: ReactNode;
  kicker?: string;
  icon?: string;
}) {
  return (
    <header className="page-header">
      {(cover !== undefined || seed) && <Artwork track={cover} seed={seed ?? title} size={176} round={round} icon={icon} className="hero-art" />}
      <div className="page-header-text">
        {kicker && <div className="kicker">{kicker}</div>}
        <h1 title={title}>{title}</h1>
        {subtitle && <div className="subtitle">{subtitle}</div>}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </header>
  );
}

export function ViewTitle({ title, count, children }: { title: string; count?: string; children?: ReactNode }) {
  return (
    <div className="view-title">
      <h1>{title}</h1>
      {count && <span className="count">{count}</span>}
      <div className="grow" />
      {children}
    </div>
  );
}

export function Card({
  title, subtitle, cover, seed, round, onOpen, onPlay, onContext, icon,
}: {
  title: string;
  subtitle?: string;
  cover?: Track | null;
  seed?: string;
  round?: boolean;
  onOpen: () => void;
  onPlay?: () => void;
  onContext?: (e: React.MouseEvent) => void;
  icon?: string;
}) {
  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      onContextMenu={(e) => {
        if (onContext) {
          e.preventDefault();
          onContext(e);
        }
      }}
    >
      <div className="card-art">
        <Artwork track={cover} seed={seed ?? title} round={round} icon={icon} />
        {onPlay && (
          <button
            type="button"
            className="card-play"
            title="Reproducir"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            <Icon name="play" size={26} />
          </button>
        )}
      </div>
      <div className="card-title" title={title}>{title}</div>
      {subtitle && <div className="card-sub" title={subtitle}>{subtitle}</div>}
    </div>
  );
}

export function Empty({ icon = 'note', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={56} />
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button type="button" key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="track"><span className="thumb" /></span>
    </label>
  );
}

export function ContextMenu() {
  const menu = useStore(ui, (s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = () => closeMenu();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  if (!menu) return null;
  return (
    <div className="menu-layer" onMouseDown={closeMenu} onContextMenu={(e) => (e.preventDefault(), closeMenu())}>
      <div ref={ref} className="menu" style={{ left: pos.x || menu.x, top: pos.y || menu.y }} onMouseDown={(e) => e.stopPropagation()} role="menu">
        {menu.items.map((it, i) =>
          it.separator ? (
            <div key={i} className="menu-sep" />
          ) : (
            <button
              type="button"
              key={i}
              role="menuitem"
              className={`menu-item ${it.danger ? 'danger' : ''}`}
              disabled={it.disabled}
              onClick={() => {
                closeMenu();
                it.run?.();
              }}
            >
              {it.icon ? <Icon name={it.icon} size={18} /> : <span style={{ width: 18 }} />}
              {it.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.text}</span>
          {t.action && (
            <button type="button" className="btn text" onClick={t.action.run}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function DialogHost() {
  const dialog = useStore(ui, (s) => s.dialog);
  return <>{dialog}</>;
}
