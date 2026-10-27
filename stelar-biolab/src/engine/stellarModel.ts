import type { StellarSystem } from "../types";
import { clamp } from "./util";

/**
 * Índice relativo de energía estelar que llega a la órbita.
 * Aproximación: luminosidad / distancia². No pretende ser un modelo orbital
 * preciso, solo una heurística coherente.
 */
export function stellarEnergyIndex(s: StellarSystem): number {
  if (s.type === "errante") return 0;
  if (s.type === "habitat_artificial") return s.visibleIntensity; // energía provista
  const d = Math.max(s.orbitalDistance, 0.01);
  return s.luminosityRelative / (d * d);
}

/** Luz visible efectiva relativa (para procesos fotoquímicos). */
export function visibleBudget(s: StellarSystem): number {
  return stellarEnergyIndex(s) * s.visibleIntensity;
}

/** Aporte infrarrojo relativo. */
export function infraredBudget(s: StellarSystem): number {
  if (s.type === "errante") return s.infraredIntensity; // podría venir de calor interno
  return stellarEnergyIndex(s) * s.infraredIntensity;
}

/** Riesgo de partículas energéticas combinando actividad y protección. */
export function energeticParticleRisk(s: StellarSystem): number {
  const exposure = s.energeticParticleActivity * (1 + s.variability / 100);
  return clamp(exposure - s.magneticProtection * 0.6);
}

export function stellarDescription(s: StellarSystem): string {
  const e = stellarEnergyIndex(s);
  if (s.type === "errante") return "Sin estrella anfitriona: no hay insolación estelar.";
  if (s.type === "habitat_artificial") return "Energía controlada por el hábitat artificial.";
  if (e > 4) return "Órbita con insolación muy alta.";
  if (e > 1.4) return "Insolación superior a la terrestre.";
  if (e > 0.5) return "Insolación comparable a la terrestre.";
  if (e > 0.1) return "Insolación baja; energía estelar escasa.";
  return "Insolación muy baja.";
}
