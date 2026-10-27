import type { LabState } from "../types";
import { LABELS, METABOLISM_META } from "../data/options";
import { round } from "./util";
import { gravityG } from "./environmentModel";

export function organismSummary(state: LabState): string {
  const { organism: o, environment: env, chemistry: chem } = state;
  const meta = METABOLISM_META[o.metabolism];
  return (
    `${o.commonName} (${o.scientificName}) es un organismo de ${round(o.sizeMeters, 2)} m y ~${round(o.massKg, 1)} kg, ` +
    `con locomoción ${LABELS.locomotion[o.locomotion].toLowerCase()} y cubierta de ${LABELS.covering[o.bodyCovering].toLowerCase()}. ` +
    `Obtiene energía por ${LABELS.metabolism[o.metabolism].toLowerCase()} (${meta.energySource.toLowerCase()}) ` +
    `en un entorno de ${LABELS.world[env.worldType].toLowerCase()} (${LABELS.habitat[env.habitat].toLowerCase()}), ` +
    `con bioquímica ${LABELS.architecture[chem.architecture].toLowerCase()} y solvente ${LABELS.solvent[chem.solvent].toLowerCase()}.`
  );
}

export interface EnergyEstimate {
  expr: string;
  value: number;
  note: string;
}

/** Estimación conceptual del coste metabólico basal (aproximación de Kleiber). */
export function energyCostEstimate(state: LabState): EnergyEstimate {
  const m = Math.max(state.organism.massKg, 0.001);
  const g = gravityG(state.environment);
  // Coeficiente ilustrativo; la ley de Kleiber describe organismos terrestres.
  const basal = 70 * Math.pow(m, 0.75);
  const locomotion = basal * (0.2 + state.organism.mobility / 100) * Math.max(1, g * 0.6);
  const total = round(basal + locomotion);
  return {
    expr: "C ≈ 70 · M^0,75  (+ coste de locomoción)",
    value: total,
    note:
      "Aproximación alométrica derivada de organismos terrestres (ley de Kleiber). El metabolismo no escala linealmente con la masa; estas relaciones no deben transferirse automáticamente a una bioquímica radicalmente distinta.",
  };
}

export interface Analogy {
  name: string;
  note: string;
  refId?: string;
}

export function analogies(state: LabState): Analogy[] {
  const out: Analogy[] = [];
  const { organism: o, environment: env } = state;

  if (o.environmentalTolerance > 65 || env.backgroundRadiation > 45) {
    out.push({
      name: "Tardígrados",
      note: "Ilustran tolerancia extrema (criptobiosis), sin implicar supervivencia indefinida en cualquier entorno.",
      refId: "tardigrada",
    });
  }
  if (o.metabolism === "electrotrofo") {
    out.push({ name: "Geobacter", note: "Transferencia extracelular de electrones hacia/desde minerales.", refId: "geobacter" });
  }
  if (o.metabolism === "quimiosintetico" || o.metabolism === "azufre") {
    out.push({ name: "Comunidades de fuentes hidrotermales", note: "Quimiosíntesis sin luz solar.", refId: "chemosynthesis" });
  }
  if (o.metabolism === "metanogenico") {
    out.push({ name: "Arqueas metanógenas", note: "Producen metano a partir de H₂ y CO₂ en ambientes anóxicos.", refId: "enceladus" });
  }
  if (env.habitat === "oceano" || env.habitat === "subglacial") {
    out.push({ name: "Calamar vampiro", note: "Adaptaciones de un organismo de aguas profundas con poca luz y oxígeno.", refId: "europa" });
  }
  if (out.length === 0) {
    out.push({ name: "Extremófilos terrestres", note: "Organismos que prosperan en condiciones adversas para la mayoría de la vida.", refId: "chemosynthesis" });
  }
  return out;
}

export function conceptRefs(state: LabState): string[] {
  const ids = new Set<string>(["kleiber", "square_cube"]);
  for (const a of analogies(state)) if (a.refId) ids.add(a.refId);
  if (state.chemistry.architecture === "silicio" || state.chemistry.architecture === "hibrida_carbono_silicio") ids.add("silicon");
  if (state.environment.worldType === "oceanico_subglacial") ids.add("europa");
  if (state.chemistry.solvent === "metano" || state.chemistry.solvent === "etano") ids.add("titan");
  if (state.radiation.uvIntensity > 30) ids.add("uv_dna");
  return [...ids];
}
