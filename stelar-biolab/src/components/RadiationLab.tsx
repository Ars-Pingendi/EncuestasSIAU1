import { useState } from "react";
import type { Lab } from "../state/useLab";
import type { MutationIntensity } from "../engine/mutationModel";
import { Slider, Meter } from "./controls";
import { EVIDENCE_LABELS } from "../types";
import { randomSeed } from "../engine/rng";
import { Zap, Undo2 } from "lucide-react";

export function RadiationLab({ lab }: { lab: Lab }) {
  const r = lab.state.radiation;
  const o = lab.state.organism;
  const rad = lab.radiation;
  const [seedInput, setSeedInput] = useState("");
  const [lastSeed, setLastSeed] = useState<number | null>(null);

  const induceMutation = () => {
    const seed = seedInput.trim() ? Number(seedInput.trim()) >>> 0 : randomSeed();
    // La intensidad del evento depende de la exposición resultante.
    const intensity: MutationIntensity = rad.exposureIndex > 60 ? "extrema" : rad.exposureIndex > 30 ? "adaptativa" : "leve";
    lab.mutate(intensity, seed);
    setLastSeed(seed);
  };

  const history = o.genetics.mutationHistory;

  return (
    <div className="lab-grid">
      <div className="lab-col">
        <h3 className="section-title">Intensidad y exposición</h3>
        <Slider
          label="Nivel de radiación relativo"
          value={r.relativeLevel}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => lab.setRadiation({ relativeLevel: v })}
          hint="100% = nivel de referencia del escenario activo, no un umbral biológico universal."
        />
        <p className="note-inline">El 100% corresponde a las condiciones del escenario actual (estrella + entorno). No es un umbral universal.</p>

        <h3 className="section-title">Tipos de radiación</h3>
        <Slider label="Ultravioleta (UV)" value={r.uvIntensity} min={0} max={100} onChange={(v) => lab.setRadiation({ uvIntensity: v })} hint="Daño molecular y genético según longitud de onda, dosis y protección." />
        <Slider label="Ionizante (X, γ, partículas)" value={r.ionizingIntensity} min={0} max={100} onChange={(v) => lab.setRadiation({ ionizingIntensity: v })} />
        <Slider label="Partículas energéticas estelares" value={r.stellarParticleIntensity} min={0} max={100} onChange={(v) => lab.setRadiation({ stellarParticleIntensity: v })} />
        <Slider label="Infrarrojo (aporte térmico)" value={r.infraredIntensity} min={0} max={100} onChange={(v) => lab.setRadiation({ infraredIntensity: v })} hint="Se trata como energía térmica, no como radiación ionizante." />

        <h3 className="section-title">Duración y protección</h3>
        <Slider label="Duración de la exposición" value={r.exposureDuration} min={0} max={100} onChange={(v) => lab.setRadiation({ exposureDuration: v })} />
        <Slider label="Frecuencia de episodios intensos" value={r.eventFrequency} min={0} max={100} onChange={(v) => lab.setRadiation({ eventFrequency: v })} />
        <Slider label="Protección ambiental (laboratorio)" value={r.environmentalShielding} min={0} max={100} onChange={(v) => lab.setRadiation({ environmentalShielding: v })} />
        <Slider label="Protección corporal del organismo" value={o.radiationProtection} min={0} max={100} onChange={(v) => lab.setOrganism({ radiationProtection: v })} />
        <Slider label="Reparación molecular hipotética" value={o.genetics.repairCapacity} min={0} max={100} onChange={(v) => lab.setOrganism({ genetics: { ...o.genetics, repairCapacity: v } })} />
      </div>

      <div className="lab-col">
        <h3 className="section-title">Indicadores</h3>
        <Meter label="Índice de exposición" value={rad.exposureIndex} tone="info" />
        <Meter label="Daño genético estimado" value={rad.geneticDamage} tone={rad.geneticDamage > 50 ? "risk" : "warn"} />
        <Meter label="Integridad genética" value={rad.geneticIntegrity} />
        <Meter label="Capacidad de reparación" value={rad.repairCapacity} tone="info" />
        <Meter label="Frecuencia de mutación" value={rad.mutationFrequency} tone="hyp" caption="Una mutación no es necesariamente heredable, beneficiosa ni visible." />
        <Meter label="Blindaje efectivo (promedio)" value={rad.effectiveShielding} tone="info" />

        <h3 className="section-title">Perfil de radiación (neto tras protección)</h3>
        <div className="rad-profile">
          {rad.profile.map((p) => (
            <div key={p.label} className="rad-bar">
              <span className="rad-label">{p.label}</span>
              <span className="rad-track"><span className="rad-fill" style={{ width: `${p.value}%` }} /></span>
              <span className="mono rad-val">{p.value}</span>
            </div>
          ))}
        </div>

        <div className="before-after">
          <div><span className="muted small">Compatibilidad antes</span><div className="ba-num mono">{rad.viabilityBefore}</div></div>
          <div className="ba-arrow">→</div>
          <div><span className="muted small">después</span><div className="ba-num mono">{rad.viabilityAfter}</div></div>
        </div>

        {rad.effects.length > 0 && (
          <ul className="effects">
            {rad.effects.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}

        <h3 className="section-title">Inducir mutación</h3>
        <div className="mutate-row">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Semilla (opcional)"
            value={seedInput}
            onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, ""))}
            aria-label="Semilla de mutación"
          />
          <button type="button" className="btn primary" onClick={induceMutation}><Zap size={14} aria-hidden /> Inducir mutación</button>
          <button type="button" className="btn" onClick={lab.undo} disabled={!lab.canUndo}><Undo2 size={14} aria-hidden /> Deshacer</button>
        </div>
        {lastSeed !== null && <p className="muted small">Última semilla usada: <span className="mono">{lastSeed}</span> (reutilízala para reproducir el evento).</p>}

        <h3 className="section-title">Registro genético</h3>
        {history.length === 0 ? (
          <p className="muted small">Sin eventos de mutación todavía.</p>
        ) : (
          <ol className="mut-log">
            {[...history].reverse().map((m) => (
              <li key={m.id} className={`mut ${m.classification}`}>
                <div className="mut-top">
                  <span className={`mut-tag ${m.classification}`}>{m.classification}</span>
                  <span className="mut-trait">{m.trait}</span>
                  <span className="mono mut-delta">Δ {m.viabilityDelta > 0 ? `+${m.viabilityDelta}` : m.viabilityDelta}</span>
                </div>
                <div className="small">{m.previousValue} → {m.newValue}. {m.explanation}</div>
                <div className="muted small">Coste: {m.cost} · {EVIDENCE_LABELS[m.uncertainty]} · semilla <span className="mono">{m.seed}</span></div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
