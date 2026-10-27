import type { Lab } from "../state/useLab";
import { CreatureSvg } from "./CreatureSvg";
import { LABELS } from "../data/options";
import { BAND_LABEL } from "../engine/viability";
import { round } from "../engine/util";
import { Pause, Play } from "lucide-react";

export function CreatureStage({ lab }: { lab: Lab }) {
  const o = lab.state.organism;
  const env = lab.state.environment;
  const v = lab.viability;
  const weightN = round(o.massKg * env.gravityMS2, 1);

  return (
    <div className="stage">
      <div className="stage-head">
        <div>
          <div className="stage-sci mono">{o.scientificName}</div>
          <div className="stage-common">“{o.commonName}”</div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-pressed={!lab.prefs.animations}
          onClick={lab.toggleAnimations}
          title={lab.prefs.animations ? "Pausar animaciones" : "Reanudar animaciones"}
        >
          {lab.prefs.animations ? <Pause size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {lab.prefs.animations ? "Pausar" : "Animar"}
        </button>
      </div>

      <div className="observation-chamber">
        <div className="chamber-grid" aria-hidden />
        <CreatureSvg state={lab.state} animate={lab.prefs.animations} />
      </div>

      <div className="stage-data">
        <Datum label="Tamaño" value={`${round(o.sizeMeters, 2)} m`} est />
        <Datum label="Masa" value={`${round(o.massKg, 2)} kg`} est />
        <Datum label="Peso local" value={`${weightN} N`} est />
        <Datum label="Metabolismo" value={LABELS.metabolism[o.metabolism]} />
        <Datum label="Hábitat" value={`${LABELS.world[env.worldType]} · ${LABELS.habitat[env.habitat]}`} />
        <Datum label="Viabilidad" value={`${v.score}/100`} tone={v.band} />
        <Datum label="Integridad genética" value={`${lab.radiation.geneticIntegrity}/100`} est />
        <Datum label="Incertidumbre" value={`${v.uncertainty}/100`} />
      </div>
      <div className="band-line" data-band={v.band}>
        {BAND_LABEL[v.band]} · <span className="mono">{v.score}/100 de compatibilidad estimada del modelo</span>
      </div>
    </div>
  );
}

function Datum({ label, value, est, tone }: { label: string; value: string; est?: boolean; tone?: string }) {
  return (
    <div className="datum">
      <span className="datum-label">
        {label} {est && <abbr title="Valor estimado por el modelo">est.</abbr>}
      </span>
      <span className={`datum-value mono${tone ? ` band-${tone}` : ""}`}>{value}</span>
    </div>
  );
}
