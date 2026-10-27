import type { BioChemistry, BioArchitecture, Solvent, EvidenceLevel } from "../types";
import { SOLVENT_LIQUID_RANGE } from "../data/options";

export interface SolventPhase {
  ok: boolean;
  reason: string;
}

/**
 * Evalúa si el solvente puede mantenerse líquido en las condiciones dadas.
 * Ajusta de forma heurística el punto de ebullición con la presión: más
 * presión amplía el rango líquido superior. No usa automáticamente los
 * umbrales del agua para otros solventes.
 */
export function solventPhaseOk(
  solvent: Solvent,
  tempC: number,
  pressureKPa: number,
): SolventPhase {
  const range = SOLVENT_LIQUID_RANGE[solvent];
  if (!range) {
    return { ok: true, reason: "Solvente no caracterizado: fase incierta." };
  }
  // Desplazamiento del límite superior por presión (heurístico y acotado).
  const boilShift = Math.max(0, Math.log10(Math.max(pressureKPa, 1) / 101)) * 60;
  const min = range.min;
  const max = range.max + boilShift;
  if (tempC < min) {
    return { ok: false, reason: `Demasiado frío: por debajo de ${min} °C el solvente se congela.` };
  }
  if (tempC > max) {
    return { ok: false, reason: `Demasiado caliente: por encima de ~${Math.round(max)} °C el solvente se evapora.` };
  }
  return { ok: true, reason: "El solvente puede permanecer líquido en estas condiciones." };
}

export function architectureEvidence(arch: BioArchitecture): EvidenceLevel {
  switch (arch) {
    case "carbono_agua":
      return "terrestrial";
    case "carbono_solvente_alt":
    case "hibrida_carbono_silicio":
      return "reasonable_extrapolation";
    case "silicio":
    case "otros_elementos":
      return "speculative";
    case "desconocida":
      return "unknown";
  }
}

export function solventEvidence(solvent: Solvent): EvidenceLevel {
  switch (solvent) {
    case "agua":
      return "terrestrial";
    case "amoniaco":
    case "metano":
    case "etano":
      return "reasonable_extrapolation";
    case "mezcla_hipotetica":
      return "speculative";
    case "desconocido":
      return "unknown";
  }
}

/** Elemento clave para una arquitectura dada. */
export function keyElementsFor(arch: BioArchitecture): string[] {
  switch (arch) {
    case "carbono_agua":
    case "carbono_solvente_alt":
      return ["C", "H", "O"];
    case "hibrida_carbono_silicio":
      return ["C", "Si"];
    case "silicio":
      return ["Si", "O"];
    case "otros_elementos":
      return ["Fe", "S"];
    case "desconocida":
      return [];
  }
}

export function availability(chem: BioChemistry, element: string): number {
  return chem.availableElements[element] ?? 0;
}
