import { useMemo } from 'react';
import { BAND_LABELS, BUILT_IN_PRESETS, MAX_DB, preampDb, responseDb } from '../audio/presets';
import { Range, Switch, ViewTitle } from '../components/Common';
import { ConfirmDialog, PromptDialog } from '../components/Dialogs';
import { Icon } from '../components/Icon';
import { useStore } from '../lib/store';
import {
  applyPreset, deleteCustomPreset, eq, resetEq, saveCustomPreset, selectOutput, setBand, setPerDevice, updateEq,
} from '../state/eq';
import { openDialog } from '../state/ui';

const W = 720;
const H = 200;
const DB_RANGE = 15;

function Curve() {
  const s = useStore(eq, (x) => x);
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 160; i++) {
      const f = 20 * Math.pow(1000, i / 160);
      const db = Math.max(-DB_RANGE, Math.min(DB_RANGE, responseDb(s, f)));
      const x = (i / 160) * W;
      const y = H / 2 - (db / DB_RANGE) * (H / 2 - 8);
      pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [s]);
  const grid = [-12, -6, 0, 6, 12];
  const freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  return (
    <svg className={`eq-curve ${s.enabled ? '' : 'off'}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Curva del ecualizador">
      <defs>
        <linearGradient id="eqfill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((g) => {
        const y = H / 2 - (g / DB_RANGE) * (H / 2 - 8);
        return <line key={g} x1={0} x2={W} y1={y} y2={y} className={g === 0 ? 'zero' : 'grid'} />;
      })}
      {freqs.map((f) => {
        const x = (Math.log(f / 20) / Math.log(1000)) * W;
        return <line key={f} x1={x} x2={x} y1={0} y2={H} className="grid" />;
      })}
      <path d={`${path} L${W},${H} L0,${H} Z`} fill="url(#eqfill)" />
      <path d={path} className="line" />
    </svg>
  );
}

export function EqualizerView() {
  const s = useStore(eq, (x) => x);
  const pre = preampDb(s);
  const presets = [...BUILT_IN_PRESETS, ...s.custom];
  const isCustom = (name: string) => s.custom.some((p) => p.name === name);
  return (
    <div className="view eq-view">
      <ViewTitle title="Ecualizador">
        <span className="muted">{s.enabled ? 'Activado' : 'Desactivado'}</span>
        <Switch checked={s.enabled} onChange={(v) => updateEq({ enabled: v })} label="Activar ecualizador" />
      </ViewTitle>

      <section className="panel">
        <div className="panel-row output-row">
          <Icon name="speaker" size={22} />
          <div className="grow">
            <div className="strong">Salida de audio</div>
            <div className="muted small">
              {s.perDevice ? `Cada salida recuerda su propio ajuste. Ahora: ${s.deviceName || 'salida predeterminada'}.` : 'El mismo ajuste para todas las salidas.'}
            </div>
          </div>
          <label className="select">
            <select value={s.sinkId} onChange={(e) => void selectOutput(e.target.value)} aria-label="Salida de audio">
              {s.devices.length === 0 && <option value="default">Predeterminado del sistema</option>}
              {s.devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id === 'default' ? `Predeterminado de Windows (${d.label.replace(/^(Predeterminado|Default)\s*-\s*/i, '')})` : d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-switch">
            <span className="small">Ajuste por salida</span>
            <Switch checked={s.perDevice} onChange={setPerDevice} label="Recordar un ajuste por cada salida" />
          </label>
        </div>
      </section>

      <section className={`panel ${s.enabled ? '' : 'disabled'}`}>
        <div className="presets">
          {presets.map((p) => (
            <button
              type="button"
              key={p.name}
              className={`chip ${s.preset === p.name ? 'on' : ''}`}
              onClick={() => applyPreset(p.name)}
              onContextMenu={(e) => {
                if (!isCustom(p.name)) return;
                e.preventDefault();
                openDialog(<ConfirmDialog title="Eliminar preajuste" text={`¿Eliminar «${p.name}»?`} confirm="Eliminar" onConfirm={() => deleteCustomPreset(p.name)} />);
              }}
              title={isCustom(p.name) ? 'Preajuste propio (clic derecho para eliminar)' : p.name}
            >
              {s.preset === p.name && <Icon name="check" size={16} />}
              {p.name}
            </button>
          ))}
          {!s.preset && <span className="chip on static">Personalizado</span>}
          <button
            type="button"
            className="chip outline"
            onClick={() => openDialog(<PromptDialog title="Guardar preajuste" label="Nombre del preajuste" confirm="Guardar" onSubmit={saveCustomPreset} />)}
          >
            <Icon name="save" size={16} /> Guardar como…
          </button>
          <button type="button" className="chip outline" onClick={resetEq}>
            <Icon name="refresh" size={16} /> Restablecer
          </button>
        </div>

        <Curve />

        <div className="bands">
          <div className="band-scale">
            <span>+{MAX_DB}</span>
            <span>0</span>
            <span>−{MAX_DB}</span>
          </div>
          {s.bands.map((db, i) => (
            <div className="band" key={i}>
              <div className="band-value">{db > 0 ? `+${db}` : db}</div>
              <Range
                vertical
                label={`${BAND_LABELS[i]} Hz: ${db} dB`}
                min={-MAX_DB}
                max={MAX_DB}
                step={0.5}
                value={db}
                onChange={(v) => setBand(i, v)}
              />
              <div className="band-label" onDoubleClick={() => setBand(i, 0)} title="Doble clic para volver a 0 dB">
                {BAND_LABELS[i]}
              </div>
            </div>
          ))}
        </div>
        <div className="muted small center-text">
          Bandas de 31 Hz a 16 kHz, ±{MAX_DB} dB · Reducción automática de ganancia: {pre.toFixed(1)} dB · Limitador suave activo
        </div>
      </section>

      <section className={`panel effects ${s.enabled ? '' : 'disabled'}`}>
        <Effect icon="equalizer" title="Refuerzo de graves" value={s.bass} onChange={(v) => updateEq({ bass: v })} />
        <Effect icon="speaker" title="Sonido envolvente" value={s.width} onChange={(v) => updateEq({ width: v })} />
        <Effect icon="volume" title="Amplificación de volumen" value={s.loudness} onChange={(v) => updateEq({ loudness: v })} />
      </section>
    </div>
  );
}

function Effect({ icon, title, value, onChange }: { icon: string; title: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="effect">
      <div className="effect-head">
        <Icon name={icon} size={20} />
        <span className="grow">{title}</span>
        <span className="muted">{value} %</span>
      </div>
      <Range label={title} value={value} onChange={onChange} />
    </div>
  );
}
