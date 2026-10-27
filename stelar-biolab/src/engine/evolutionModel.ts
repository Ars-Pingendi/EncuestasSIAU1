import type { LabState, Organism, EvolutionParams, EvolutionResult, GenerationRecord } from "../types";
import { SeededRng } from "./rng";
import { clamp, round } from "./util";
import { calcularViabilidad } from "./viability";

interface Individual {
  radProt: number;
  thermProt: number;
  size: number;
  energyUse: number;
  density: number;
  tol: number;
  fitness: number;
}

function toOrganism(base: Organism, ind: Individual): Organism {
  return {
    ...base,
    radiationProtection: ind.radProt,
    thermalProtection: ind.thermProt,
    sizeMeters: ind.size,
    energyUse: ind.energyUse,
    bodyDensity: ind.density,
    environmentalTolerance: ind.tol,
  };
}

function fitnessOf(state: LabState, base: Organism, ind: Individual, radiation: number): number {
  const v = calcularViabilidad({ ...state, organism: toOrganism(base, ind) }).score;
  // La radiación poblacional penaliza a los menos protegidos.
  const radPenalty = Math.max(0, radiation - ind.radProt) * 0.3;
  return clamp(v - radPenalty);
}

function vary(rng: SeededRng, value: number, amount: number, min: number, max: number): number {
  return clamp(value + (rng.next() - 0.5) * 2 * amount, min, max);
}

function diversityOf(pop: Individual[]): number {
  if (pop.length < 2) return 0;
  const mean = pop.reduce((a, i) => a + i.radProt + i.thermProt + i.size * 10, 0) / pop.length;
  const variance =
    pop.reduce((a, i) => {
      const v = i.radProt + i.thermProt + i.size * 10;
      return a + (v - mean) ** 2;
    }, 0) / pop.length;
  return clamp(Math.sqrt(variance));
}

export function runEvolution(state: LabState, params: EvolutionParams): EvolutionResult {
  const rng = new SeededRng(params.seed);
  const base = state.organism;
  const o = base;

  // Población inicial con variación heredable.
  let pop: Individual[] = [];
  const initVar = (params.heritableVariation / 100) * 20;
  for (let i = 0; i < params.initialPopulation; i++) {
    const ind: Individual = {
      radProt: vary(rng, o.radiationProtection, initVar, 0, 100),
      thermProt: vary(rng, o.thermalProtection, initVar, 0, 100),
      size: vary(rng, o.sizeMeters, (params.heritableVariation / 100) * o.sizeMeters, 0.02, 40),
      energyUse: vary(rng, o.energyUse, initVar, 0, 100),
      density: vary(rng, o.bodyDensity, (params.heritableVariation / 100) * 0.6, 0.4, 2),
      tol: vary(rng, o.environmentalTolerance, initVar, 0, 100),
      fitness: 0,
    };
    pop.push(ind);
  }

  const history: GenerationRecord[] = [];
  const firstMeanRef = { value: 0 };
  let extinct = false;

  const mutAmount = (params.mutationRate / 100) * 16 + (params.heritableVariation / 100) * 6;

  for (let gen = 1; gen <= params.generations; gen++) {
    // Evaluar.
    for (const ind of pop) ind.fitness = fitnessOf(state, base, ind, params.radiationIntensity);
    const meanV = pop.length ? pop.reduce((a, i) => a + i.fitness, 0) / pop.length : 0;
    if (gen === 1) firstMeanRef.value = meanV;

    const diversity = diversityOf(pop);
    const dominant = describeDominant(pop);
    const meanRad = pop.length ? pop.reduce((a, i) => a + i.radProt, 0) / pop.length : 0;

    history.push({
      generation: gen,
      population: pop.length,
      meanViability: round(meanV),
      diversity: round(diversity),
      dominantTrait: dominant,
      meanRadiationProtection: round(meanRad),
      extinct: pop.length === 0,
    });

    if (pop.length === 0) {
      extinct = true;
      break;
    }

    // Selección: supervivencia diferenciada (modelo), con deriva y coste.
    const survivors: Individual[] = [];
    for (const ind of pop) {
      const rel = (ind.fitness - meanV) / 100;
      const driftNoise = (rng.next() - 0.5) * (params.drift / 100);
      const survival = clamp(
        0.5 + rel * (params.selectionPressure / 100) * 2.5 - params.reproductionCost / 400 + driftNoise,
        0,
        1,
      );
      if (rng.next() < survival) survivors.push(ind);
    }

    if (survivors.length === 0) {
      pop = [];
      continue;
    }

    // Reproducción con variación heredable hasta la capacidad de carga.
    const targetBirths = Math.floor(survivors.length * (1.8 - params.reproductionCost / 120));
    const offspring: Individual[] = [];
    for (let i = 0; i < Math.max(0, targetBirths); i++) {
      const parent = survivors[rng.int(0, survivors.length - 1)];
      offspring.push({
        radProt: vary(rng, parent.radProt, mutAmount, 0, 100),
        thermProt: vary(rng, parent.thermProt, mutAmount, 0, 100),
        size: vary(rng, parent.size, (mutAmount / 100) * parent.size, 0.02, 40),
        energyUse: vary(rng, parent.energyUse, mutAmount, 0, 100),
        density: vary(rng, parent.density, (mutAmount / 100) * 0.8, 0.4, 2),
        tol: vary(rng, parent.tol, mutAmount, 0, 100),
        fitness: 0,
      });
    }

    let next = [...survivors, ...offspring];
    if (next.length > params.carryingCapacity) {
      // Presión de capacidad: se favorece a los más aptos, con algo de azar.
      for (const ind of next) ind.fitness = fitnessOf(state, base, ind, params.radiationIntensity);
      next.sort((a, b) => b.fitness - a.fitness + (rng.next() - 0.5) * 10);
      next = next.slice(0, params.carryingCapacity);
    }
    pop = next;
  }

  // Resultado final.
  let finalOrganism: Organism | null = null;
  if (pop.length) {
    for (const ind of pop) ind.fitness = fitnessOf(state, base, ind, params.radiationIntensity);
    const fittest = [...pop].sort((a, b) => b.fitness - a.fitness)[0];
    finalOrganism = toOrganism(base, fittest);
  }

  const last = history[history.length - 1];
  const first = history[0];
  const outcome = classifyOutcome(first, last, extinct);

  return {
    seed: params.seed,
    history,
    finalOrganism,
    outcome,
    summary: summarize(outcome, first, last),
  };
}

function describeDominant(pop: Individual[]): string {
  if (!pop.length) return "—";
  const avgRad = pop.reduce((a, i) => a + i.radProt, 0) / pop.length;
  const avgTherm = pop.reduce((a, i) => a + i.thermProt, 0) / pop.length;
  const avgSize = pop.reduce((a, i) => a + i.size, 0) / pop.length;
  if (avgRad > 65) return "alta protección radiativa";
  if (avgTherm > 65) return "alto aislamiento térmico";
  if (avgSize > 3) return "gran tamaño";
  if (avgSize < 0.3) return "tamaño reducido";
  return "rasgos equilibrados";
}

function classifyOutcome(
  first: GenerationRecord | undefined,
  last: GenerationRecord | undefined,
  extinct: boolean,
): EvolutionResult["outcome"] {
  if (extinct || (last && last.population === 0)) return "extincion";
  if (!first || !last) return "estabilidad";
  if (last.meanViability - first.meanViability > 6) return "adaptacion";
  if (last.population < first.population * 0.5) return "descenso";
  if (last.diversity < first.diversity * 0.5) return "perdida_diversidad";
  return "estabilidad";
}

const OUTCOME_LABEL: Record<EvolutionResult["outcome"], string> = {
  adaptacion: "Adaptación",
  estabilidad: "Estabilidad",
  perdida_diversidad: "Pérdida de diversidad",
  descenso: "Descenso poblacional",
  extincion: "Extinción",
};

export function outcomeLabel(o: EvolutionResult["outcome"]): string {
  return OUTCOME_LABEL[o];
}

function summarize(
  outcome: EvolutionResult["outcome"],
  first: GenerationRecord | undefined,
  last: GenerationRecord | undefined,
): string {
  if (!first || !last) return "Sin datos suficientes.";
  switch (outcome) {
    case "extincion":
      return `La población se extinguió. Partió de ${first.population} individuos y la selección del modelo no sostuvo descendencia viable.`;
    case "adaptacion":
      return `La compatibilidad media subió de ${first.meanViability} a ${last.meanViability}. El modelo muestra adaptación, no una mejora garantizada.`;
    case "descenso":
      return `La población cayó de ${first.population} a ${last.population}. Riesgo de colapso bajo la presión configurada.`;
    case "perdida_diversidad":
      return `La diversidad de rasgos descendió notablemente: la población se homogeneizó.`;
    default:
      return `La población se mantuvo relativamente estable (compatibilidad media ${last.meanViability}).`;
  }
}
