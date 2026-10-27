import { useId, type ReactNode } from "react";
import { Info } from "lucide-react";

export function Field({
  label,
  htmlFor,
  hint,
  modified,
  children,
  value,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  modified?: boolean;
  children: ReactNode;
  value?: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={htmlFor} className="field-label">
          {label}
          {modified && <span className="mod-dot" title="Modificado respecto al espécimen original" aria-label="modificado">●</span>}
          {hint && (
            <span className="hint" tabIndex={0} role="note" aria-label={hint}>
              <Info size={13} aria-hidden /> <span className="hint-bubble">{hint}</span>
            </span>
          )}
        </label>
        {value !== undefined && <span className="field-value mono">{value}</span>}
      </div>
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  hint,
  modified,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
  modified?: boolean;
  format?: (v: number) => string;
}) {
  const id = useId();
  const shown = format ? format(value) : `${value}${unit ? ` ${unit}` : ""}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} modified={modified} value={shown}>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={shown}
      />
    </Field>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  hint,
  modified,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  hint?: string;
  modified?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} modified={modified}>
      <div className="num-wrap">
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isNaN(n)) return;
            let v = n;
            if (min !== undefined) v = Math.max(min, v);
            if (max !== undefined) v = Math.min(max, v);
            onChange(v);
          }}
        />
        {unit && <span className="unit mono">{unit}</span>}
      </div>
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  modified,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  hint?: string;
  modified?: boolean;
}) {
  const id = useId();
  const current = options.find((o) => o.value === value);
  return (
    <Field label={label} htmlFor={id} hint={hint ?? current?.hint} modified={modified}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ChipMulti<T extends string>({
  label,
  values,
  options,
  onChange,
  hint,
}: {
  label: string;
  values: T[];
  options: { value: T; label: string }[];
  onChange: (v: T[]) => void;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => {
          const active = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              className={`chip${active ? " active" : ""}`}
              aria-pressed={active}
              onClick={() => onChange(active ? values.filter((v) => v !== o.value) : [...values, o.value])}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="toggle">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export function Meter({
  label,
  value,
  tone,
  caption,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "risk" | "crit" | "info" | "hyp";
  caption?: string;
}) {
  const t = tone ?? bandTone(value);
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="mono">{Math.round(value)}/100</span>
      </div>
      <div className="meter-track" role="meter" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`meter-fill tone-${t}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      {caption && <div className="meter-caption">{caption}</div>}
    </div>
  );
}

export function bandTone(v: number): "ok" | "warn" | "risk" | "crit" | "info" {
  if (v >= 80) return "ok";
  if (v >= 60) return "info";
  if (v >= 40) return "warn";
  if (v >= 20) return "risk";
  return "crit";
}
