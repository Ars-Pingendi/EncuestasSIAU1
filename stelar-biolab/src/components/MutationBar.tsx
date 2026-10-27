import { useState } from "react";
import type { Lab } from "../state/useLab";
import type { MutationIntensity } from "../engine/mutationModel";
import { Shuffle, Undo2, CornerUpLeft } from "lucide-react";

const INTENSITIES: { value: MutationIntensity; label: string; hint: string }[] = [
  { value: "leve", label: "Leve", hint: "Cambios pequeños en color, proporciones o sensores secundarios." },
  { value: "adaptativa", label: "Adaptativa", hint: "Cambios que podrían mejorar la compatibilidad, con costes y límites." },
  { value: "extrema", label: "Extrema", hint: "Cambios drásticos; puede producir un organismo inviable." },
];

export function MutationBar({ lab }: { lab: Lab }) {
  const [intensity, setIntensity] = useState<MutationIntensity>("leve");
  const [seedInput, setSeedInput] = useState("");
  const [lastSeed, setLastSeed] = useState<number | null>(null);

  const history = lab.state.organism.genetics.mutationHistory;
  const last = history[history.length - 1];

  const generate = () => {
    const seed = seedInput.trim() ? Number(seedInput.trim()) >>> 0 : undefined;
    const used = lab.mutate(intensity, seed);
    setLastSeed(used);
  };

  return (
    <div className="mutation-bar">
      <div className="mb-row">
        <div className="segmented" role="group" aria-label="Intensidad de la variación">
          {INTENSITIES.map((i) => (
            <button
              key={i.value}
              type="button"
              className={`seg${intensity === i.value ? " active" : ""}`}
              aria-pressed={intensity === i.value}
              title={i.hint}
              onClick={() => setIntensity(i.value)}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-row">
        <input
          type="text"
          inputMode="numeric"
          className="seed-input"
          placeholder="Semilla (opcional)"
          value={seedInput}
          onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, ""))}
          aria-label="Semilla de variación"
        />
        <button type="button" className="btn primary" onClick={generate}><Shuffle size={14} aria-hidden /> Generar variación</button>
        <button type="button" className="btn" onClick={lab.undo} disabled={!lab.canUndo}><Undo2 size={14} aria-hidden /> Deshacer</button>
        <button type="button" className="btn" onClick={lab.resetOrganismToBaseline} title="Volver a la versión original cargada"><CornerUpLeft size={14} aria-hidden /> Original</button>
      </div>
      <div className="mb-meta small muted">
        {lastSeed !== null && <>Semilla usada: <span className="mono">{lastSeed}</span>. </>}
        {last && <>Último cambio: <b className={`mut-tag ${last.classification}`}>{last.classification}</b> en {last.trait} (Δ {last.viabilityDelta > 0 ? `+${last.viabilityDelta}` : last.viabilityDelta}).</>}
        {!last && <>La mutación no garantiza una mejora. Usa la misma semilla para reproducir el resultado.</>}
      </div>
    </div>
  );
}
