import type {
  LabState,
  ViabilityResult,
  ViabilityLayer,
  ViabilityFactor,
  ViabilityBand,
} from "../types";
import { clamp, round } from "./util";
import { stellarEnergyIndex, energeticParticleRisk } from "./stellarModel";
import {
  isFluidMedium,
  isLiquidMedium,
  soundPropagationOk,
  conductiveMedium,
  usableLight,
  gravityG,
} from "./environmentModel";
import {
  solventPhaseOk,
  architectureEvidence,
  solventEvidence,
  keyElementsFor,
  availability,
} from "./chemistryModel";
import { METABOLISM_META } from "../data/options";

// ---------------------------------------------------------------------------
// Constructor de capas: arranca en una base neutra y acumula factores.
// Puede registrar un "cap" que limita la puntuación GLOBAL (incompatibilidad
// crítica), evitando duplicar penalizaciones por un mismo factor.
// ---------------------------------------------------------------------------

class LayerBuilder {
  factors: ViabilityFactor[] = [];
  cap: number | null = null;
  constructor(
    public key: string,
    public label: string,
    private base: number,
  ) {}

  add(f: ViabilityFactor): this {
    this.factors.push(f);
    return this;
  }

  fav(label: string, delta: number, evidence: ViabilityFactor["evidence"] = "reasonable_extrapolation") {
    return this.add({ label, delta: Math.abs(delta), kind: "favorable", evidence });
  }
  limit(label: string, delta: number, evidence: ViabilityFactor["evidence"] = "reasonable_extrapolation") {
    return this.add({ label, delta: -Math.abs(delta), kind: "limitacion", evidence });
  }
  pen(label: string, delta: number, evidence: ViabilityFactor["evidence"] = "reasonable_extrapolation") {
    return this.add({ label, delta: -Math.abs(delta), kind: "penalizacion", evidence });
  }
  /** Penalización crítica que además limita la puntuación global. */
  critical(label: string, delta: number, capTo: number, evidence: ViabilityFactor["evidence"] = "reasonable_extrapolation") {
    this.cap = this.cap === null ? capTo : Math.min(this.cap, capTo);
    return this.add({ label, delta: -Math.abs(delta), kind: "penalizacion", evidence });
  }

  build(): { layer: ViabilityLayer; cap: number | null } {
    const sum = this.factors.reduce((a, f) => a + f.delta, 0);
    return {
      layer: { key: this.key, label: this.label, score: round(clamp(this.base + sum)), factors: this.factors },
      cap: this.cap,
    };
  }
}

// ---------------------------------------------------------------------------
// calcularViabilidad — determinista
// ---------------------------------------------------------------------------

export function calcularViabilidad(state: LabState): ViabilityResult {
  const { stellar, environment: env, chemistry: chem, organism: org } = state;
  const builders: LayerBuilder[] = [];

  // --- 1. Sistema estelar y energía ---------------------------------------
  {
    const b = new LayerBuilder("estelar", "Sistema estelar y energía", 65);
    const energy = stellarEnergyIndex(stellar);
    const meta = METABOLISM_META[org.metabolism];
    if (stellar.type === "errante") {
      if (meta.needs === "luz" || meta.needs === "luz_ir") {
        b.critical("Sin estrella: no hay luz para el metabolismo fototrófico", 45, 22, "terrestrial");
      } else {
        b.fav("Metabolismo no depende de la estrella", 10);
      }
      if (env.geothermalEnergy > 50) b.fav("Energía interna/geoquímica disponible", 12);
      else b.limit("Energía disponible limitada sin estrella", 15);
    } else if (stellar.type === "habitat_artificial") {
      b.fav("Energía controlada por el hábitat", 14, "speculative");
    } else {
      if (energy > 0.5 && energy < 3) b.fav("Insolación en rango favorable", 12, "terrestrial");
      else if (energy >= 3) b.limit("Insolación muy alta: estrés térmico y UV", 10);
      else if (energy > 0.1) b.limit("Insolación baja", 8);
      else b.pen("Insolación muy escasa", 16);
    }
    if (stellar.variability > 40) b.pen("Alta variabilidad estelar", clamp(stellar.variability / 4, 0, 18));
    const particleRisk = energeticParticleRisk(stellar);
    if (particleRisk > 50) b.limit("Riesgo elevado de partículas energéticas", clamp(particleRisk / 6, 0, 14));
    builders.push(b);
  }

  // --- 2. Planeta y entorno físico ----------------------------------------
  {
    const b = new LayerBuilder("entorno", "Planeta y entorno físico", 65);
    const g = gravityG(env);
    if (g > 2.5) b.limit(`Gravedad alta (${g.toFixed(1)} g)`, clamp((g - 2.5) * 8, 0, 20));
    else if (g < 0.2) b.limit("Gravedad muy baja: retos de retención y estructura", 8);
    else b.fav("Gravedad en rango manejable", 6);

    if (env.temperatureC > 150) b.pen("Temperatura extremadamente alta para bioquímica compleja", 18, "terrestrial");
    else if (env.temperatureC < -210) b.limit("Temperatura criogénica extrema", 12);

    if (env.pressureKPa > 50000) b.limit("Presión extrema", 10);

    // Coherencia hábitat / mundo
    const habitatOk =
      (env.habitat === "oceano" && isLiquidMedium(env)) ||
      (env.habitat === "subglacial" && isLiquidMedium(env)) ||
      (env.habitat === "atmosfera" && env.mediumDensity > 0.2 && env.mediumDensity < 200) ||
      env.habitat === "superficie" ||
      env.habitat === "subsuelo";
    if (!habitatOk) b.pen("Hábitat incoherente con el medio configurado", 14);
    else b.fav("Hábitat coherente con el medio", 5);

    if (env.nutrientAvailability < 25) b.limit("Nutrientes escasos", 8);
    builders.push(b);
  }

  // --- 3. Fase y disponibilidad del solvente ------------------------------
  {
    const b = new LayerBuilder("solvente", "Fase y disponibilidad del solvente", 70);
    const phase = solventPhaseOk(chem.solvent, env.temperatureC, env.pressureKPa);
    const avail = env.solventAvailability[chem.solvent] ?? 0;
    if (!phase.ok) {
      b.critical(phase.reason, 50, 15, solventEvidence(chem.solvent));
    } else {
      b.fav("Solvente en fase líquida viable", 12, solventEvidence(chem.solvent));
    }
    if (avail < 15 && chem.solvent !== "desconocido") {
      b.pen(`Disponibilidad baja de ${chem.solvent}`, 18);
    } else if (avail > 50) {
      b.fav("Solvente abundante", 8);
    }
    if (chem.solvent === "desconocido") b.limit("Solvente no caracterizado: alta incertidumbre", 6, "unknown");
    builders.push(b);
  }

  // --- 4. Arquitectura bioquímica -----------------------------------------
  {
    const b = new LayerBuilder("bioquimica", "Arquitectura bioquímica", 65);
    const ev = architectureEvidence(chem.architecture);
    if (chem.architecture === "carbono_agua") b.fav("Química carbono-agua bien respaldada", 12, "terrestrial");
    if (chem.architecture === "silicio") {
      b.limit("Vida basada en silicio: enlaces menos versátiles", 16, "speculative");
      if (env.temperatureC < 100) b.pen("Silicio poco favorecido a baja temperatura", 10, "speculative");
    }
    if (chem.architecture === "hibrida_carbono_silicio") b.fav("Silicio en estructura, carbono en química: plausible", 6, "speculative");
    if (chem.architecture === "desconocida") b.limit("Bases moleculares no caracterizadas", 10, "unknown");
    // Elementos clave disponibles
    const keys = keyElementsFor(chem.architecture);
    const faltan = keys.filter((e) => availability(chem, e) < 25);
    if (faltan.length) b.pen(`Elementos clave escasos: ${faltan.join(", ")}`, clamp(faltan.length * 9, 0, 22));
    else if (keys.length) b.fav("Elementos estructurales disponibles", 6);
    void ev;
    builders.push(b);
  }

  // --- 5. Recursos y requisitos del metabolismo ---------------------------
  {
    const b = new LayerBuilder("metabolismo", "Recursos del metabolismo", 60);
    const meta = METABOLISM_META[org.metabolism];
    const light = usableLight(env);
    switch (meta.needs) {
      case "luz":
        if (light > 40) b.fav("Luz visible suficiente para fotosíntesis", 18, "terrestrial");
        else if (light > 12) b.limit("Luz escasa para fotosíntesis", 14, "terrestrial");
        else b.critical("Fotosíntesis sin luz útil en el hábitat", 40, 25, "terrestrial");
        break;
      case "luz_ir": {
        const ir = env.geothermalEnergy * 0.4 + env.lightAvailability * 0.3 + stellar.infraredIntensity * 15;
        if (ir > 30) b.fav("Fuente infrarroja aprovechable (hipotética)", 10, "speculative");
        else b.limit("Aporte infrarrojo insuficiente", 14, "speculative");
        break;
      }
      case "quimica": {
        const redox = (env.reductants + env.oxidants) / 2 + env.geothermalEnergy * 0.3;
        if (org.metabolism === "metanogenico") {
          if (env.oxidants > 55) b.pen("Oxidantes inhiben la metanogénesis", 16, "terrestrial");
          if ((env.atmosphere["H₂"] ?? 0) > 0.1 || env.reductants > 55) b.fav("Hidrógeno/reductores disponibles", 14, "terrestrial");
          else b.limit("Poco hidrógeno para metanogénesis", 12, "terrestrial");
        } else {
          if (redox > 55) b.fav("Pares redox adecuados para quimiosíntesis", 16, "terrestrial");
          else if (redox > 30) b.limit("Recursos redox moderados", 8);
          else b.pen("Reactivos redox insuficientes", 16);
        }
        break;
      }
      case "gradiente_termico":
        if (env.thermalVariationC > 40 || env.geothermalEnergy > 55) b.fav("Gradiente térmico explotable (con cautela)", 8, "speculative");
        else b.limit("Gradiente térmico débil", 14, "speculative");
        break;
      case "electrico":
        if (conductiveMedium(env)) b.fav("Medio conductor para electrotrofía", 12, "reasonable_extrapolation");
        else b.pen("Sin medio conductor adecuado", 18, "reasonable_extrapolation");
        break;
      case "azufre":
        if (availability(chem, "S") > 45 || (env.atmosphere["H₂S"] ?? 0) > 0.05) b.fav("Azufre reducido disponible", 14, "terrestrial");
        else b.pen("Azufre insuficiente", 16, "terrestrial");
        break;
      case "libre":
        b.limit("Metabolismo personalizado: requisitos inciertos", 6, "speculative");
        break;
    }
    builders.push(b);
  }

  // --- 6. Coherencia anatómica y sensorial --------------------------------
  {
    const b = new LayerBuilder("anatomia", "Coherencia anatómica y sensorial", 65);
    // Locomoción vs medio
    const loco = org.locomotion;
    if ((loco === "nadador" || loco === "filtrador_flotante") && !isFluidMedium(env)) {
      b.pen("Locomoción acuática/flotante sin medio fluido", 18);
    }
    if (loco === "planeador" && env.mediumDensity < 1) {
      b.limit("Vuelo difícil en medio poco denso", 12);
    } else if (loco === "planeador" && env.mediumDensity > 2) {
      b.fav("Medio denso favorece el planeo", 8);
    }
    if (loco === "propulsion_chorro" && !isFluidMedium(env)) {
      b.pen("Propulsión a chorro requiere un medio fluido", 14);
    }
    if (loco === "sesil") b.fav("Organismo sésil: bajo coste de locomoción", 4);

    // Sensores vs medio
    for (const s of org.sensors) {
      if (s === "ecolocalizacion" && !soundPropagationOk(env)) b.pen("Ecolocalización sin medio para el sonido", 12);
      if (s === "electrorecepcion" && !conductiveMedium(env)) b.pen("Electrorecepción sin medio conductor", 10);
      if (s === "fotorecepcion" && usableLight(env) < 8) b.limit("Fotorecepción con muy poca luz", 8);
    }
    if (org.sensors.length === 0) b.limit("Sin sistemas sensoriales definidos", 10);
    else b.fav("Conjunto sensorial definido", 4);
    builders.push(b);
  }

  // --- 7. Coste energético y biomecánica ----------------------------------
  {
    const b = new LayerBuilder("biomecanica", "Coste energético y tamaño", 65);
    const g = gravityG(env);
    // Ley cuadrado-cubo: tamaño grande + gravedad alta + apéndices delgados
    const slenderness = org.bodyWidth / Math.max(org.bodyHeight, 0.1);
    if (org.sizeMeters > 2 && g > 1.5 && slenderness < 0.8) {
      b.pen("Cuerpo grande y esbelto bajo gravedad alta (cuadrado-cubo)", clamp(org.sizeMeters * g * 2, 0, 22), "terrestrial");
    } else if (org.sizeMeters > 4 && !isLiquidMedium(env)) {
      b.limit("Tamaño muy grande fuera de un medio que lo sostenga", 10, "terrestrial");
    }
    // Flotabilidad
    if ((org.locomotion === "filtrador_flotante" || env.habitat === "oceano") && org.bodyDensity > 1.1 && org.buoyancyCapacity < 40) {
      b.limit("Densidad corporal alta sin flotación suficiente", 10);
    }
    // Coste metabólico vs consumo declarado (Kleiber como heurística)
    const kleiber = Math.pow(Math.max(org.massKg, 0.01), 0.75);
    const costExpectation = clamp(20 + Math.log10(kleiber + 1) * 30 + org.mobility * 0.2);
    if (org.energyUse < costExpectation - 25) {
      b.limit("Consumo energético declarado bajo para su masa y actividad", 10, "terrestrial");
    } else {
      b.fav("Balance energético plausible", 6, "terrestrial");
    }
    builders.push(b);
  }

  // --- 8. Protección frente a radiación -----------------------------------
  {
    const b = new LayerBuilder("radiacion", "Protección frente a radiación", 65);
    const incidente = clamp(stellar.uvIntensity * 10 + env.backgroundRadiation + energeticParticleRisk(stellar) * 0.5);
    const proteccion = clamp(org.radiationProtection * 0.5 + env.environmentalProtection * 0.5);
    const neto = clamp(incidente - proteccion);
    if (neto > 55) b.pen("Radiación neta alta frente a la protección disponible", clamp(neto / 4, 0, 20));
    else if (neto > 30) b.limit("Radiación moderada", 8);
    else b.fav("Protección adecuada frente a la radiación del escenario", 10);
    if (org.bodyCovering === "reflectante_uv" && stellar.uvIntensity > 1) b.fav("Cubierta reflectante útil frente a UV", 6);
    builders.push(b);
  }

  // --- 9. Estado genético --------------------------------------------------
  {
    const b = new LayerBuilder("genetica", "Estado genético", 60);
    const gen = org.genetics;
    if (gen.integrityIndex > 80) b.fav("Integridad genética alta", 12);
    else if (gen.integrityIndex > 55) b.limit("Integridad genética moderada", 6);
    else b.pen("Integridad genética comprometida", clamp((60 - gen.integrityIndex) / 2, 0, 20));
    if (gen.repairCapacity > 55) b.fav("Buena capacidad de reparación", 8);
    if (gen.accumulatedDamage > 45) b.pen("Daño molecular acumulado elevado", clamp(gen.accumulatedDamage / 4, 0, 16));
    builders.push(b);
  }

  // --- 10. Incertidumbre ---------------------------------------------------
  const evidences = [architectureEvidence(chem.architecture), solventEvidence(chem.solvent), METABOLISM_META[org.metabolism].evidence];
  const uncScore = evidences.reduce((a, e) => {
    if (e === "terrestrial") return a + 5;
    if (e === "reasonable_extrapolation") return a + 25;
    if (e === "speculative") return a + 55;
    return a + 75;
  }, 0) / evidences.length;
  {
    const b = new LayerBuilder("incertidumbre", "Incertidumbre de los supuestos", 100 - uncScore * 0.5);
    const lvl: ViabilityFactor["evidence"] =
      uncScore > 55 ? "speculative" : uncScore > 25 ? "reasonable_extrapolation" : "terrestrial";
    b.add({ label: `Nivel de especulación del escenario: ${round(uncScore)}/100`, delta: 0, kind: "limitacion", evidence: lvl });
    builders.push(b);
  }

  // --- Agregación ----------------------------------------------------------
  const built = builders.map((b) => b.build());
  const layers = built.map((x) => x.layer);
  const caps = built.map((x) => x.cap).filter((c): c is number => c !== null);
  const avg = layers.reduce((a, l) => a + l.score, 0) / layers.length;
  const capped = caps.length ? Math.min(avg, ...caps) : avg;
  const score = round(clamp(capped));

  const allFactors = layers.flatMap((l) => l.factors);
  const criticalLimits = allFactors
    .filter((f) => f.kind === "penalizacion")
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 6);
  const favorable = allFactors
    .filter((f) => f.kind === "favorable")
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 6);

  return {
    score,
    band: scoreBand(score),
    layers,
    uncertainty: round(uncScore),
    criticalLimits,
    favorable,
  };
}

export function scoreBand(score: number): ViabilityBand {
  if (score >= 80) return "alta";
  if (score >= 60) return "moderada";
  if (score >= 40) return "limitada";
  if (score >= 20) return "incompatible";
  return "critica";
}

export const BAND_LABEL: Record<ViabilityBand, string> = {
  alta: "Alta compatibilidad del modelo",
  moderada: "Compatibilidad moderada",
  limitada: "Compatibilidad limitada",
  incompatible: "Incompatibilidades importantes",
  critica: "Incompatibilidad crítica",
};
