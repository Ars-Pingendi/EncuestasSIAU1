import type {
  LabState,
  StellarSystem,
  PlanetEnvironment,
  BioChemistry,
  Organism,
  RadiationProfile,
} from "../types";
import { generarNombreComun, generarNombreCientifico } from "../engine/nameGenerator";

// ---------------------------------------------------------------------------
// Constructores con valores por defecto seguros
// ---------------------------------------------------------------------------

export function defaultStellar(): StellarSystem {
  return {
    type: "tipo_solar",
    spectralClass: "G2V",
    luminosityRelative: 1,
    massRelative: 1,
    orbitalDistance: 1,
    eccentricity: 0.02,
    orbitalPeriodDays: 365,
    variability: 6,
    uvIntensity: 1,
    visibleIntensity: 1,
    infraredIntensity: 1,
    energeticParticleActivity: 15,
    magneticProtection: 60,
  };
}

export function defaultEnvironment(): PlanetEnvironment {
  return {
    worldType: "rocoso",
    habitat: "superficie",
    gravityMS2: 9.81,
    temperatureC: 15,
    thermalVariationC: 20,
    pressureKPa: 101,
    mediumDensity: 1.2,
    atmosphere: { "N₂": 0.78, "O₂": 0.21, "CO₂": 0.004, Ar: 0.009 },
    solventAvailability: { agua: 70, amoniaco: 0, metano: 0, etano: 0 },
    lightAvailability: 80,
    geothermalEnergy: 20,
    backgroundRadiation: 15,
    environmentalProtection: 55,
    nutrientAvailability: 60,
    oxidants: 55,
    reductants: 35,
  };
}

export function defaultChemistry(): BioChemistry {
  return {
    architecture: "carbono_agua",
    solvent: "agua",
    availableElements: { C: 80, H: 90, O: 85, N: 70, P: 45, S: 50, Si: 60, Fe: 55 },
    structuralElements: ["C", "H", "O", "N"],
    metabolicElements: ["C", "O", "H"],
  };
}

export function defaultRadiation(): RadiationProfile {
  return {
    relativeLevel: 100,
    uvIntensity: 30,
    ionizingIntensity: 20,
    stellarParticleIntensity: 15,
    infraredIntensity: 40,
    exposureDuration: 30,
    eventFrequency: 10,
    environmentalShielding: 50,
  };
}

export function defaultOrganism(seed = 123456): Organism {
  const metabolism = "fotosintesis" as const;
  return {
    id: "org-default",
    commonName: generarNombreComun(seed, metabolism),
    scientificName: generarNombreCientifico(seed, "superficie"),
    locomotion: "hexapodo_blindado",
    bodyCovering: "quitina",
    metabolism,
    sensors: ["fotorecepcion", "quimiorrecepcion"],
    sizeMeters: 0.6,
    massKg: 12,
    appendageCount: 6,
    bodyWidth: 1.1,
    bodyHeight: 0.8,
    bodyDensity: 1.05,
    thermalProtection: 45,
    buoyancyCapacity: 20,
    mobility: 60,
    energyUse: 50,
    environmentalTolerance: 55,
    sensoryCapacity: 55,
    radiationProtection: 40,
    seed,
    genetics: {
      integrityIndex: 92,
      repairCapacity: 55,
      accumulatedDamage: 6,
      mutationRate: 18,
      mutationHistory: [],
    },
  };
}

export function defaultState(): LabState {
  return {
    stellar: defaultStellar(),
    environment: defaultEnvironment(),
    chemistry: defaultChemistry(),
    organism: defaultOrganism(),
    radiation: defaultRadiation(),
  };
}

// ---------------------------------------------------------------------------
// Presets de sistema estelar (parciales)
// ---------------------------------------------------------------------------

export interface Preset<T> {
  id: string;
  label: string;
  description: string;
  apply: () => T;
}

export const STELLAR_PRESETS: Preset<StellarSystem>[] = [
  {
    id: "sol",
    label: "Análogo solar",
    description: "Estrella tipo G estable a 1 UA.",
    apply: () => defaultStellar(),
  },
  {
    id: "enana_roja",
    label: "Enana roja activa",
    description: "Fría, luminosidad baja, llamaradas frecuentes.",
    apply: () => ({
      ...defaultStellar(),
      type: "enana_roja",
      spectralClass: "M4V",
      luminosityRelative: 0.02,
      massRelative: 0.3,
      orbitalDistance: 0.12,
      orbitalPeriodDays: 24,
      variability: 45,
      uvIntensity: 0.6,
      visibleIntensity: 0.4,
      infraredIntensity: 1.6,
      energeticParticleActivity: 75,
      magneticProtection: 40,
    }),
  },
  {
    id: "caliente",
    label: "Estrella caliente tipo A",
    description: "Luminosa, alto UV, zona habitable lejana.",
    apply: () => ({
      ...defaultStellar(),
      type: "caliente_luminosa",
      spectralClass: "A5V",
      luminosityRelative: 14,
      massRelative: 1.8,
      orbitalDistance: 3.6,
      orbitalPeriodDays: 1900,
      variability: 10,
      uvIntensity: 5,
      visibleIntensity: 1.6,
      infraredIntensity: 0.7,
      energeticParticleActivity: 35,
      magneticProtection: 50,
    }),
  },
  {
    id: "errante",
    label: "Planeta errante",
    description: "Sin estrella; energía interna o química.",
    apply: () => ({
      ...defaultStellar(),
      type: "errante",
      spectralClass: "—",
      luminosityRelative: 0,
      massRelative: 0,
      orbitalDistance: 0,
      orbitalPeriodDays: 0,
      variability: 0,
      uvIntensity: 0,
      visibleIntensity: 0,
      infraredIntensity: 0.05,
      energeticParticleActivity: 25,
      magneticProtection: 35,
    }),
  },
  {
    id: "binaria",
    label: "Binaria circumbinaria",
    description: "El mundo orbita dos estrellas.",
    apply: () => ({
      ...defaultStellar(),
      type: "binaria_circumbinaria",
      spectralClass: "G8V + K5V",
      luminosityRelative: 1.3,
      massRelative: 1.6,
      orbitalDistance: 1.4,
      eccentricity: 0.12,
      orbitalPeriodDays: 540,
      variability: 22,
      uvIntensity: 1.2,
      visibleIntensity: 1.2,
      infraredIntensity: 1,
      energeticParticleActivity: 30,
      magneticProtection: 55,
    }),
  },
  {
    id: "habitat",
    label: "Hábitat artificial",
    description: "Energía controlada de una fuente seleccionada.",
    apply: () => ({
      ...defaultStellar(),
      type: "habitat_artificial",
      spectralClass: "Artificial",
      luminosityRelative: 1,
      massRelative: 0,
      orbitalDistance: 0,
      orbitalPeriodDays: 0,
      variability: 2,
      uvIntensity: 0.1,
      visibleIntensity: 1,
      infraredIntensity: 0.8,
      energeticParticleActivity: 5,
      magneticProtection: 90,
    }),
  },
];

// ---------------------------------------------------------------------------
// Presets de mundo (parciales de entorno)
// ---------------------------------------------------------------------------

export const WORLD_PRESETS: Preset<PlanetEnvironment>[] = [
  {
    id: "europa",
    label: "Océano subglacial de Europa",
    description: "Océano bajo hielo, sin luz superficial, energía química local.",
    apply: () => ({
      ...defaultEnvironment(),
      worldType: "oceanico_subglacial",
      habitat: "subglacial",
      gravityMS2: 1.31,
      temperatureC: -2,
      thermalVariationC: 3,
      pressureKPa: 20000,
      mediumDensity: 1030,
      atmosphere: {},
      solventAvailability: { agua: 95, amoniaco: 15, metano: 0, etano: 0 },
      lightAvailability: 1,
      geothermalEnergy: 70,
      backgroundRadiation: 10,
      environmentalProtection: 95,
      nutrientAvailability: 55,
      oxidants: 25,
      reductants: 65,
    }),
  },
  {
    id: "titan",
    label: "Desierto de Titán",
    description: "Criogénico, rico en hidrocarburos, lagos de metano/etano.",
    apply: () => ({
      ...defaultEnvironment(),
      worldType: "desertico",
      habitat: "superficie",
      gravityMS2: 1.35,
      temperatureC: -179,
      thermalVariationC: 4,
      pressureKPa: 146,
      mediumDensity: 5.3,
      atmosphere: { "N₂": 0.95, "CH₄": 0.05 },
      solventAvailability: { agua: 0, amoniaco: 0, metano: 80, etano: 40 },
      lightAvailability: 10,
      geothermalEnergy: 15,
      backgroundRadiation: 20,
      environmentalProtection: 60,
      nutrientAvailability: 45,
      oxidants: 10,
      reductants: 70,
    }),
  },
  {
    id: "supertierra_arida",
    label: "Supertierra árida",
    description: "Gravedad elevada, seca, radiación superficial intensa.",
    apply: () => ({
      ...defaultEnvironment(),
      worldType: "supertierra",
      habitat: "superficie",
      gravityMS2: 18,
      temperatureC: 46,
      thermalVariationC: 35,
      pressureKPa: 180,
      mediumDensity: 1.8,
      atmosphere: { "CO₂": 0.7, "N₂": 0.28, Ar: 0.02 },
      solventAvailability: { agua: 20, amoniaco: 0, metano: 0, etano: 0 },
      lightAvailability: 90,
      geothermalEnergy: 30,
      backgroundRadiation: 60,
      environmentalProtection: 30,
      nutrientAvailability: 40,
      oxidants: 45,
      reductants: 30,
    }),
  },
  {
    id: "gigante_hielo",
    label: "Atmósfera de gigante de hielo",
    description: "Medio gaseoso, gradientes de presión; organismos flotantes hipotéticos.",
    apply: () => ({
      ...defaultEnvironment(),
      worldType: "gigante_hielo",
      habitat: "atmosfera",
      gravityMS2: 11.2,
      temperatureC: -120,
      thermalVariationC: 40,
      pressureKPa: 400,
      mediumDensity: 2.6,
      atmosphere: { "H₂": 0.8, "CH₄": 0.15, "NH₃": 0.05 },
      solventAvailability: { agua: 10, amoniaco: 35, metano: 25, etano: 10 },
      lightAvailability: 25,
      geothermalEnergy: 45,
      backgroundRadiation: 35,
      environmentalProtection: 50,
      nutrientAvailability: 35,
      oxidants: 10,
      reductants: 80,
    }),
  },
  {
    id: "enceladus",
    label: "Cuevas de Encélado",
    description: "Entorno oscuro y protegido; agua, roca y compuestos reducidos.",
    apply: () => ({
      ...defaultEnvironment(),
      worldType: "subterraneo",
      habitat: "subsuelo",
      gravityMS2: 0.11,
      temperatureC: -5,
      thermalVariationC: 2,
      pressureKPa: 500,
      mediumDensity: 1000,
      atmosphere: {},
      solventAvailability: { agua: 90, amoniaco: 20, metano: 5, etano: 0 },
      lightAvailability: 0,
      geothermalEnergy: 65,
      backgroundRadiation: 8,
      environmentalProtection: 90,
      nutrientAvailability: 50,
      oxidants: 15,
      reductants: 75,
    }),
  },
  {
    id: "lava",
    label: "Mundo de lava",
    description: "Temperatura extrema; hábitats muy restringidos y hostiles.",
    apply: () => ({
      ...defaultEnvironment(),
      worldType: "lava",
      habitat: "superficie",
      gravityMS2: 10.5,
      temperatureC: 620,
      thermalVariationC: 120,
      pressureKPa: 300,
      mediumDensity: 3,
      atmosphere: { "CO₂": 0.5, "H₂S": 0.2, "N₂": 0.3 },
      solventAvailability: { agua: 0, amoniaco: 0, metano: 0, etano: 0 },
      lightAvailability: 95,
      geothermalEnergy: 100,
      backgroundRadiation: 50,
      environmentalProtection: 20,
      nutrientAvailability: 40,
      oxidants: 60,
      reductants: 55,
    }),
  },
  {
    id: "errante",
    label: "Planeta errante",
    description: "Sin iluminación estelar; energía interna o química.",
    apply: () => ({
      ...defaultEnvironment(),
      worldType: "errante",
      habitat: "subsuelo",
      gravityMS2: 9.2,
      temperatureC: -40,
      thermalVariationC: 5,
      pressureKPa: 90,
      mediumDensity: 1.1,
      atmosphere: { "N₂": 0.6, "CO₂": 0.3, "CH₄": 0.1 },
      solventAvailability: { agua: 30, amoniaco: 25, metano: 10, etano: 0 },
      lightAvailability: 0,
      geothermalEnergy: 75,
      backgroundRadiation: 25,
      environmentalProtection: 70,
      nutrientAvailability: 45,
      oxidants: 20,
      reductants: 65,
    }),
  },
  {
    id: "personalizado",
    label: "Mundo personalizado",
    description: "Valores libres a partir de un rocoso templado.",
    apply: () => ({ ...defaultEnvironment(), worldType: "personalizado" }),
  },
];
