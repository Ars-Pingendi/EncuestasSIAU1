import type {
  LabState,
  Organism,
  MutationEvent,
  MutationClassification,
  BodyCovering,
  Metabolism,
  Sensor,
  EvidenceLevel,
} from "../types";
import { SeededRng } from "./rng";
import { clamp, round } from "./util";
import { calcularViabilidad } from "./viability";
import { LABELS, METABOLISM_META } from "../data/options";

export type MutationIntensity = "leve" | "adaptativa" | "extrema";

const COVERINGS_POOL: BodyCovering[] = [
  "quitina",
  "silicea",
  "membrana_flexible",
  "reflectante_uv",
  "gel_anticongelante",
  "malla_piezoelectrica",
  "caparazon_mineral",
  "piel_pigmentada",
];
const METAB_POOL: Metabolism[] = [
  "quimiosintetico",
  "fotosintesis",
  "fototrofia_ir",
  "metanogenico",
  "termosintetico",
  "electrotrofo",
  "azufre",
];
const SENSOR_POOL: Sensor[] = [
  "ecolocalizacion",
  "electrorecepcion",
  "infrarrojo",
  "quimiorrecepcion",
  "magnetorecepcion",
  "presion",
  "vibracion",
  "fotorecepcion",
  "radiacion",
];

function clone(o: Organism): Organism {
  return { ...o, sensors: [...o.sensors], genetics: { ...o.genetics, mutationHistory: [...o.genetics.mutationHistory] } };
}

interface Change {
  trait: string;
  prev: string | number;
  next: string | number;
  type: string;
  cost: string;
  evidence: EvidenceLevel;
}

function applyChange(org: Organism, rng: SeededRng, intensity: MutationIntensity): Change {
  // Magnitud según intensidad.
  const mag = intensity === "leve" ? 1 : intensity === "adaptativa" ? 1.6 : 3;

  // Conjunto de rasgos candidatos; en "extrema" se incluyen cambios drásticos.
  const options: (() => Change)[] = [
    () => {
      const prev = round(org.bodyWidth, 2);
      org.bodyWidth = clamp(org.bodyWidth + rng.float(-0.25, 0.25) * mag, 0.2, 3);
      return { trait: "Anchura corporal", prev, next: round(org.bodyWidth, 2), type: "proporción", cost: "Afecta soporte y arrastre", evidence: "reasonable_extrapolation" };
    },
    () => {
      const prev = round(org.radiationProtection);
      org.radiationProtection = clamp(org.radiationProtection + rng.float(-10, 12) * mag);
      return { trait: "Protección frente a radiación", prev, next: round(org.radiationProtection), type: "fisiológico", cost: "Mayor protección suele implicar más masa/coste", evidence: "reasonable_extrapolation" };
    },
    () => {
      const prev = round(org.thermalProtection);
      org.thermalProtection = clamp(org.thermalProtection + rng.float(-10, 12) * mag);
      return { trait: "Aislamiento térmico", prev, next: round(org.thermalProtection), type: "fisiológico", cost: "Aislar reduce disipación de calor interno", evidence: "reasonable_extrapolation" };
    },
    () => {
      const prev = org.sensors.length ? LABELS.sensor[org.sensors[0]] : "ninguno";
      const add = rng.pick(SENSOR_POOL);
      if (org.sensors.includes(add) && org.sensors.length > 1) {
        org.sensors = org.sensors.filter((s) => s !== add);
        return { trait: "Sensor", prev, next: `– ${LABELS.sensor[add]}`, type: "sensorial", cost: "Pierde una vía de percepción", evidence: "reasonable_extrapolation" };
      }
      org.sensors = [...org.sensors, add];
      return { trait: "Sensor", prev, next: `+ ${LABELS.sensor[add]}`, type: "sensorial", cost: "Nuevo sensor con coste de mantenimiento", evidence: "speculative" };
    },
  ];

  if (intensity !== "leve") {
    options.push(() => {
      const prev = round(org.sizeMeters, 2);
      org.sizeMeters = clamp(org.sizeMeters * (1 + rng.float(-0.4, 0.5) * (mag / 2)), 0.02, 40);
      org.massKg = clamp(org.massKg * (org.sizeMeters / Math.max(prev, 0.01)) ** 2.3, 0.001, 100000);
      return { trait: "Tamaño corporal", prev, next: round(org.sizeMeters, 2), type: "morfológico", cost: "La masa escala con el cubo del tamaño", evidence: "terrestrial" };
    });
  }

  if (intensity === "extrema") {
    options.push(() => {
      const prev = LABELS.covering[org.bodyCovering];
      org.bodyCovering = rng.pick(COVERINGS_POOL.filter((c) => c !== org.bodyCovering));
      return { trait: "Cubierta corporal", prev, next: LABELS.covering[org.bodyCovering], type: "estructural", cost: "Reorganización radical del tegumento", evidence: "speculative" };
    });
    options.push(() => {
      const prev = LABELS.metabolism[org.metabolism];
      org.metabolism = rng.pick(METAB_POOL.filter((m) => m !== org.metabolism));
      return { trait: "Metabolismo", prev, next: LABELS.metabolism[org.metabolism], type: "metabólico", cost: "Cambio metabólico drástico; puede ser inviable", evidence: METABOLISM_META[org.metabolism].evidence };
    });
  }

  return rng.pick(options)();
}

export function mutateOrganism(
  state: LabState,
  seed: number,
  intensity: MutationIntensity,
  generation = 0,
): { organism: Organism; event: MutationEvent } {
  const before = calcularViabilidad(state).score;
  const rng = new SeededRng(seed);

  let best = clone(state.organism);
  let bestChange = applyChange(best, rng, intensity);
  let bestScore = calcularViabilidad({ ...state, organism: best }).score;

  // En "adaptativa" se prueban varias candidatas y se favorece (sin garantizar)
  // la que mejora, con un coste. Sigue pudiendo no mejorar.
  if (intensity === "adaptativa") {
    for (let i = 0; i < 3; i++) {
      const cand = clone(state.organism);
      const ch = applyChange(cand, rng, intensity);
      const sc = calcularViabilidad({ ...state, organism: cand }).score;
      if (sc > bestScore) {
        best = cand;
        bestChange = ch;
        bestScore = sc;
      }
    }
    // Coste obligatorio: aumenta el consumo energético.
    best.energyUse = clamp(best.energyUse + rng.float(2, 8));
  }

  const after = bestScore;
  const delta = round(after - before);
  best.genetics = { ...best.genetics, mutationRate: clamp(best.genetics.mutationRate + rng.float(-3, 5)) };

  const classification: MutationClassification =
    bestChange.evidence === "speculative" && rng.chance(0.3)
      ? "incierta"
      : delta > 3
        ? "favorable"
        : delta < -3
          ? "perjudicial"
          : "neutra";

  const event: MutationEvent = {
    id: `mut-${seed.toString(16)}-${Date.now().toString(36)}`,
    seed,
    generation,
    trait: bestChange.trait,
    previousValue: bestChange.prev,
    newValue: bestChange.next,
    mutationType: bestChange.type,
    classification,
    viabilityDelta: delta,
    explanation: describeMutation(bestChange, delta, classification),
    cost: bestChange.cost,
    uncertainty: bestChange.evidence,
    timestamp: Date.now(),
  };

  best.genetics.mutationHistory = [...best.genetics.mutationHistory, event];
  return { organism: best, event };
}

function describeMutation(ch: Change, delta: number, cls: MutationClassification): string {
  const dir = delta > 0 ? `+${delta}` : `${delta}`;
  const efecto =
    cls === "favorable"
      ? "podría mejorar la compatibilidad en el entorno actual"
      : cls === "perjudicial"
        ? "reduce la compatibilidad estimada"
        : cls === "incierta"
          ? "tiene un efecto incierto"
          : "tiene un efecto cercano a neutro";
  return `Cambio en ${ch.trait.toLowerCase()} (${ch.prev} → ${ch.next}). En este escenario ${efecto} (Δ ${dir} de compatibilidad del modelo).`;
}
