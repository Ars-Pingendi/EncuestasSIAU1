import type { LabState, RadiationResult } from "../types";
import { clamp, round } from "./util";
import { calcularViabilidad } from "./viability";

/**
 * Modelo de radiación. Distingue UV, ionizante, partículas estelares e IR.
 * El infrarrojo se trata como aporte térmico, NO como radiación ionizante.
 * La protección depende del tipo de radiación.
 */
export function computeRadiation(state: LabState, extraRepair = 0): RadiationResult {
  const { stellar, environment: env, organism: org, radiation: rad } = state;
  const level = rad.relativeLevel / 100;

  const covering = org.bodyCovering;
  const uvReflect = covering === "reflectante_uv" ? 32 : covering === "piel_pigmentada" ? 14 : 0;
  const mineral = covering === "caparazon_mineral" || covering === "silicea" ? 22 : 0;

  const uvShield = clamp(
    env.environmentalProtection * 0.35 + org.radiationProtection * 0.3 + uvReflect + rad.environmentalShielding * 0.3,
  );
  const ionizingShield = clamp(
    env.environmentalProtection * 0.5 + org.radiationProtection * 0.4 + mineral + rad.environmentalShielding * 0.3,
  );
  const particleShield = clamp(
    stellar.magneticProtection * 0.4 + env.environmentalProtection * 0.4 + org.radiationProtection * 0.2,
  );

  const netUV = clamp(rad.uvIntensity * level * (1 - uvShield / 100));
  const netIon = clamp(rad.ionizingIntensity * level * (1 - ionizingShield / 100));
  const netPart = clamp(rad.stellarParticleIntensity * level * (1 - particleShield / 100));
  const thermalIR = clamp(rad.infraredIntensity * level); // aporte térmico, no genético

  // Exposición: el IR aporta poco al daño genético (solo vía estrés térmico leve).
  const durationFactor = 0.55 + (rad.exposureDuration / 100) * 0.9;
  const exposureIndex = clamp((netUV * 0.9 + netIon * 1.3 + netPart * 1.0 + thermalIR * 0.1) / 3.3 * durationFactor * 1.4);

  const repairCapacity = clamp(org.genetics.repairCapacity + extraRepair);

  // Daño agudo vs acumulado.
  const acuteDamage = clamp(exposureIndex * (1 - repairCapacity / 160));
  const chronicDamage = clamp(rad.eventFrequency * 0.3 * durationFactor);
  const geneticDamage = clamp(org.genetics.accumulatedDamage * 0.5 + acuteDamage * 0.5 + chronicDamage * 0.4);

  const geneticIntegrity = clamp(org.genetics.integrityIndex - geneticDamage * 0.7);
  const mutationFrequency = clamp(org.genetics.mutationRate + (geneticDamage - repairCapacity * 0.4) * 0.5);

  const effects: string[] = [];
  if (netUV > 45) effects.push("Daño molecular por UV probable en tejidos expuestos.");
  if (netIon > 40) effects.push("Rupturas de cadenas por radiación ionizante.");
  if (netPart > 40) effects.push("Eventos de partículas energéticas pueden causar daño agudo puntual.");
  if (thermalIR > 60) effects.push("Carga térmica elevada por infrarrojo (estrés, no daño genético directo).");
  if (geneticDamage < 20) effects.push("Daño genético bajo: la protección y reparación bastan en este escenario.");
  if (repairCapacity > 70) effects.push("Alta reparación molecular mitiga el daño acumulado.");

  const viabilityBefore = calcularViabilidad(state).score;
  const afterState: LabState = {
    ...state,
    organism: {
      ...org,
      radiationProtection: org.radiationProtection,
      genetics: {
        ...org.genetics,
        integrityIndex: geneticIntegrity,
        accumulatedDamage: clamp(org.genetics.accumulatedDamage + acuteDamage * 0.3 + chronicDamage * 0.3),
        mutationRate: mutationFrequency,
      },
    },
  };
  const viabilityAfter = calcularViabilidad(afterState).score;

  return {
    exposureIndex: round(exposureIndex),
    geneticDamage: round(geneticDamage),
    geneticIntegrity: round(geneticIntegrity),
    repairCapacity: round(repairCapacity),
    mutationFrequency: round(mutationFrequency),
    effectiveShielding: round((uvShield + ionizingShield + particleShield) / 3),
    profile: [
      { label: "UV neto", value: round(netUV), evidence: "terrestrial" },
      { label: "Ionizante neto", value: round(netIon), evidence: "terrestrial" },
      { label: "Partículas estelares", value: round(netPart), evidence: "reasonable_extrapolation" },
      { label: "Infrarrojo (térmico)", value: round(thermalIR), evidence: "terrestrial" },
    ],
    effects,
    viabilityBefore,
    viabilityAfter,
  };
}
