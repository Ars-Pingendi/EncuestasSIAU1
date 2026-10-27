import type { PlanetEnvironment, Habitat } from "../types";

/** El medio tiene suficiente densidad para nadar/flotar (líquido o gas denso). */
export function isFluidMedium(env: PlanetEnvironment): boolean {
  return env.mediumDensity >= 0.8;
}

/** Medio líquido propiamente dicho (densidad alta). */
export function isLiquidMedium(env: PlanetEnvironment): boolean {
  return env.mediumDensity >= 200;
}

/** Medio gaseoso (hay atmósfera apreciable pero no líquido). */
export function isGaseousMedium(env: PlanetEnvironment): boolean {
  return env.mediumDensity > 0 && env.mediumDensity < 200;
}

/** ¿Puede propagarse sonido de forma útil? Requiere un medio material. */
export function soundPropagationOk(env: PlanetEnvironment): boolean {
  return env.mediumDensity >= 0.3;
}

/** ¿Es un medio conductor donde se puedan detectar/usar señales eléctricas? */
export function conductiveMedium(env: PlanetEnvironment): boolean {
  const waterRich = (env.solventAvailability["agua"] ?? 0) > 40 && isLiquidMedium(env);
  return waterRich || env.reductants > 60;
}

/** Luz útil en el hábitat del organismo (combina iluminación y profundidad). */
export function usableLight(env: PlanetEnvironment): number {
  const factorHabitat: Record<Habitat, number> = {
    superficie: 1,
    atmosfera: 0.9,
    oceano: 0.35,
    subsuelo: 0.02,
    subglacial: 0.01,
  };
  return env.lightAvailability * factorHabitat[env.habitat];
}

export function gravityG(env: PlanetEnvironment): number {
  return env.gravityMS2 / 9.81;
}
