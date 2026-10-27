import { useState } from "react";
import type { Lab } from "../state/useLab";
import type { EvolutionParams, EvolutionResult, LabState } from "../types";
import { Slider, NumberField } from "./controls";
import { CreatureSvg } from "./CreatureSvg";
import { outcomeLabel } from "../engine/evolutionModel";
import { randomSeed } from "../engine/rng";
import { downloadText } from "../utils/exporters";
import { Play, StepForward, RotateCcw, Download, Check } from "lucide-react";

function LineChart({ data, max, color, label }: { data: number[]; max: number; color: string; label: string }) {
  const w = 280;
  const h = 70;
  if (data.length === 0) return <div className="chart-empty">{label}</div>;
  const n = data.length;
  const pts = data
    .map((v, i) => {
      const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
      const y = h - (Math.max(0, Math.min(max, v)) / max) * (h - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="chart">
      <div className="chart-label">{label} <span className="mono muted">{Math.round(data[data.length - 1])}</span></div>
      <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label={`${label}: valor final ${Math.round(data[data.length - 1])}`}>
        <polyline points={`0,${h} ${pts} ${w},${h}`} fill={`${color}22`} stroke="none" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      </svg>
    </div>
  );
}

export function EvolutionLab({ lab }: { lab: Lab }) {
  const [params, setParams] = useState<EvolutionParams>({
    initialPopulation: 40,
    generations: 30,
    heritableVariation: 40,
    mutationRate: 25,
    selectionPressure: 45,
    radiationIntensity: 30,
    reproductionCost: 30,
    carryingCapacity: 80,
    drift: 20,
    seed: randomSeed(),
  });
  const [result, setResult] = useState<EvolutionResult | null>(null);
  const [view, setView] = useState(0); // generaciones visibles

  const set = (patch: Partial<EvolutionParams>) => setParams((p) => ({ ...p, ...patch }));

  const run = (full: boolean) => {
    const res = lab.runEvo(params);
    setResult(res);
    setView(full ? res.history.length : 1);
  };
  const step = () => {
    if (!result) {
      run(false);
      return;
    }
    setView((v) => Math.min(v + 1, result.history.length));
  };
  const reset = () => {
    setResult(null);
    setView(0);
    set({ seed: randomSeed() });
  };

  const shown = result ? result.history.slice(0, Math.max(1, view)) : [];
  const finalState: LabState | null = result?.finalOrganism ? { ...lab.state, organism: result.finalOrganism } : null;

  return (
    <div className="lab-grid">
      <div className="lab-col">
        <h3 className="section-title">Parámetros de población</h3>
        <NumberField label="Población inicial" value={params.initialPopulation} min={2} max={300} onChange={(v) => set({ initialPopulation: v })} />
        <NumberField label="Número de generaciones" value={params.generations} min={1} max={120} onChange={(v) => set({ generations: v })} />
        <NumberField label="Capacidad de carga" value={params.carryingCapacity} min={2} max={400} onChange={(v) => set({ carryingCapacity: v })} />
        <Slider label="Variabilidad heredable inicial" value={params.heritableVariation} min={0} max={100} onChange={(v) => set({ heritableVariation: v })} />
        <Slider label="Tasa de mutación" value={params.mutationRate} min={0} max={100} onChange={(v) => set({ mutationRate: v })} />
        <Slider label="Presión selectiva" value={params.selectionPressure} min={0} max={100} onChange={(v) => set({ selectionPressure: v })} />
        <Slider label="Intensidad de radiación" value={params.radiationIntensity} min={0} max={100} onChange={(v) => set({ radiationIntensity: v })} />
        <Slider label="Coste de reproducción" value={params.reproductionCost} min={0} max={100} onChange={(v) => set({ reproductionCost: v })} />
        <Slider label="Deriva genética" value={params.drift} min={0} max={100} onChange={(v) => set({ drift: v })} />
        <div className="seed-line mono">Semilla: {params.seed}</div>

        <div className="mutate-row">
          <button type="button" className="btn primary" onClick={() => run(true)}><Play size={14} aria-hidden /> Ejecutar</button>
          <button type="button" className="btn" onClick={step}><StepForward size={14} aria-hidden /> Avanzar 1</button>
          <button type="button" className="btn" onClick={reset}><RotateCcw size={14} aria-hidden /> Reiniciar</button>
        </div>
        <p className="muted small">La selección no dirige las mutaciones. El resultado puede ser adaptación, estabilidad, pérdida de diversidad, descenso o extinción.</p>
      </div>

      <div className="lab-col">
        {!result ? (
          <div className="empty-state">
            <p>Configura los parámetros y pulsa <b>Ejecutar</b> para simular la población a lo largo de las generaciones.</p>
          </div>
        ) : (
          <>
            <div className={`outcome-badge outcome-${result.outcome}`}>{outcomeLabel(result.outcome)}</div>
            <p className="small">{result.summary}</p>

            <LineChart label="Compatibilidad media" data={shown.map((g) => g.meanViability)} max={100} color="#22d3ee" />
            <LineChart label="Tamaño de población" data={shown.map((g) => g.population)} max={Math.max(params.carryingCapacity, params.initialPopulation)} color="#34d399" />
            <LineChart label="Diversidad de rasgos" data={shown.map((g) => g.diversity)} max={60} color="#a78bfa" />
            <LineChart label="Protección radiativa media" data={shown.map((g) => g.meanRadiationProtection)} max={100} color="#f4d35e" />

            <h3 className="section-title">Generación {Math.max(1, view)} / {result.history.length}</h3>
            {shown.length > 0 && (
              <div className="gen-detail small mono">
                pobl: {shown[shown.length - 1].population} · compat: {shown[shown.length - 1].meanViability} · rasgo dominante: {shown[shown.length - 1].dominantTrait}
              </div>
            )}

            {finalState && (
              <>
                <h3 className="section-title">Comparación inicial vs. final</h3>
                <div className="compare-creatures">
                  <div className="cc">
                    <span className="muted small">Inicial</span>
                    <div className="cc-svg"><CreatureSvg state={lab.state} animate={false} idSuffix="evo-init" /></div>
                  </div>
                  <div className="cc">
                    <span className="muted small">Última generación (más apto)</span>
                    <div className="cc-svg"><CreatureSvg state={finalState} animate={false} idSuffix="evo-final" /></div>
                  </div>
                </div>
                <div className="mutate-row">
                  <button type="button" className="btn primary" onClick={() => lab.adoptEvolvedOrganism(result.finalOrganism!)}><Check size={14} aria-hidden /> Adoptar organismo final</button>
                  <button type="button" className="btn" onClick={() => downloadText(`evolucion-${result.seed}.json`, JSON.stringify(result, null, 2), "application/json")}><Download size={14} aria-hidden /> Exportar</button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
