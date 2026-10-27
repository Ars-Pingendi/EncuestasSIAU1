// =============================================================================
// Stelar BioLab — Modelo de datos (fuente única de verdad)
// -----------------------------------------------------------------------------
// Guardamos solo parámetros fuente. Los valores derivados (viabilidad,
// exposición, informe) se calculan con funciones puras del motor.
// =============================================================================

/** Nivel de respaldo científico de una afirmación del modelo. */
export type EvidenceLevel =
  | "terrestrial" // Conocido en la Tierra
  | "reasonable_extrapolation" // Extrapolación razonable
  | "speculative" // Hipótesis especulativa
  | "unknown"; // Desconocido

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  terrestrial: "Conocido en la Tierra",
  reasonable_extrapolation: "Extrapolación razonable",
  speculative: "Hipótesis especulativa",
  unknown: "Desconocido",
};

// ---------------------------------------------------------------------------
// Sistema estelar
// ---------------------------------------------------------------------------

export type StellarType =
  | "unica"
  | "binaria_circumbinaria"
  | "binaria_circumestelar"
  | "multiple"
  | "enana_roja"
  | "tipo_solar"
  | "caliente_luminosa"
  | "errante"
  | "habitat_artificial";

export interface StellarSystem {
  type: StellarType;
  /** Tipo espectral o categoría: O, B, A, F, G, K, M, artificial… */
  spectralClass: string;
  /** Luminosidad relativa al Sol (L☉). */
  luminosityRelative: number;
  /** Masa estelar relativa al Sol (M☉). */
  massRelative: number;
  /** Semieje mayor / distancia orbital en UA. */
  orbitalDistance: number;
  /** Excentricidad orbital 0..1. */
  eccentricity: number;
  /** Periodo orbital en días terrestres. */
  orbitalPeriodDays: number;
  /** Variabilidad estelar 0..100 (% de fluctuación relativa). */
  variability: number;
  /** Intensidad relativa de la componente UV (1 = referencia solar en la órbita). */
  uvIntensity: number;
  /** Intensidad relativa de la componente visible. */
  visibleIntensity: number;
  /** Intensidad relativa de la componente infrarroja. */
  infraredIntensity: number;
  /** Actividad de partículas energéticas / llamaradas 0..100. */
  energeticParticleActivity: number;
  /** Protección magnética/atmosférica estimada del planeta 0..100. */
  magneticProtection: number;
}

// ---------------------------------------------------------------------------
// Planeta y entorno físico
// ---------------------------------------------------------------------------

export type WorldType =
  | "rocoso"
  | "supertierra"
  | "oceanico"
  | "oceanico_subglacial"
  | "desertico"
  | "helado"
  | "gigante_gaseoso"
  | "gigante_hielo"
  | "lava"
  | "subterraneo"
  | "errante"
  | "habitat_artificial"
  | "personalizado";

/** Medio en el que vive principalmente el organismo. */
export type Habitat = "superficie" | "oceano" | "subsuelo" | "atmosfera" | "subglacial";

export interface PlanetEnvironment {
  worldType: WorldType;
  habitat: Habitat;
  /** Gravedad superficial en m/s². */
  gravityMS2: number;
  /** Temperatura ambiental media en °C. */
  temperatureC: number;
  /** Variación térmica estacional en °C (amplitud). */
  thermalVariationC: number;
  /** Presión ambiental en kPa. */
  pressureKPa: number;
  /** Densidad del medio en kg/m³ (aire terrestre ≈ 1.2, agua ≈ 1000). */
  mediumDensity: number;
  /** Composición atmosférica, fracción 0..1 por gas. */
  atmosphere: Record<string, number>;
  /** Disponibilidad de solventes/líquidos 0..100. */
  solventAvailability: Record<string, number>;
  /** Iluminación superficial 0..100 (100 = plena luz tipo solar). */
  lightAvailability: number;
  /** Energía geotérmica / química local disponible 0..100. */
  geothermalEnergy: number;
  /** Radiación ambiental de fondo 0..100. */
  backgroundRadiation: number;
  /** Protección por atmósfera, agua, hielo o roca 0..100. */
  environmentalProtection: number;
  /** Disponibilidad de nutrientes / elementos 0..100. */
  nutrientAvailability: number;
  /** Presencia de oxidantes 0..100. */
  oxidants: number;
  /** Presencia de reductores 0..100. */
  reductants: number;
}

// ---------------------------------------------------------------------------
// Química de la vida
// ---------------------------------------------------------------------------

export type BioArchitecture =
  | "carbono_agua"
  | "carbono_solvente_alt"
  | "hibrida_carbono_silicio"
  | "silicio"
  | "otros_elementos"
  | "desconocida";

export type Solvent =
  | "agua"
  | "amoniaco"
  | "metano"
  | "etano"
  | "mezcla_hipotetica"
  | "desconocido";

export interface BioChemistry {
  architecture: BioArchitecture;
  solvent: Solvent;
  /** Disponibilidad ambiental simplificada de elementos 0..100. */
  availableElements: Record<string, number>;
  /** Elementos usados en la estructura del organismo. */
  structuralElements: string[];
  /** Elementos usados en el metabolismo. */
  metabolicElements: string[];
}

// ---------------------------------------------------------------------------
// Organismo
// ---------------------------------------------------------------------------

export type Locomotion =
  | "filtrador_flotante"
  | "hexapodo_blindado"
  | "serpenteante"
  | "propulsion_chorro"
  | "sesil"
  | "planeador"
  | "excavador"
  | "nadador"
  | "personalizada";

export type BodyCovering =
  | "quitina"
  | "silicea"
  | "membrana_flexible"
  | "reflectante_uv"
  | "gel_anticongelante"
  | "malla_piezoelectrica"
  | "caparazon_mineral"
  | "piel_pigmentada"
  | "personalizada";

export type Sensor =
  | "ecolocalizacion"
  | "electrorecepcion"
  | "infrarrojo"
  | "quimiorrecepcion"
  | "magnetorecepcion"
  | "presion"
  | "vibracion"
  | "fotorecepcion"
  | "radiacion"
  | "desconocido";

export type Metabolism =
  | "quimiosintetico"
  | "fotosintesis"
  | "fototrofia_ir"
  | "metanogenico"
  | "termosintetico"
  | "electrotrofo"
  | "azufre"
  | "personalizado";

export interface GeneticState {
  /** Integridad genética 0..100. */
  integrityIndex: number;
  /** Capacidad de reparación molecular 0..100. */
  repairCapacity: number;
  /** Daño molecular acumulado 0..100. */
  accumulatedDamage: number;
  /** Frecuencia de mutación relativa 0..100. */
  mutationRate: number;
  mutationHistory: MutationEvent[];
}

export interface Organism {
  id: string;
  commonName: string;
  scientificName: string;
  locomotion: Locomotion;
  bodyCovering: BodyCovering;
  metabolism: Metabolism;
  sensors: Sensor[];
  /** Longitud o altura en metros. */
  sizeMeters: number;
  /** Masa estimada en kg. */
  massKg: number;
  /** Número de apéndices (patas, tentáculos, aletas…). */
  appendageCount: number;
  /** Anchura corporal relativa 0.2..3 respecto a una referencia. */
  bodyWidth: number;
  /** Altura corporal relativa 0.2..3. */
  bodyHeight: number;
  /** Densidad corporal relativa al medio 0.5..2 (1 = flotabilidad neutra). */
  bodyDensity: number;
  /** Aislamiento térmico 0..100. */
  thermalProtection: number;
  /** Capacidad de flotación 0..100. */
  buoyancyCapacity: number;
  /** Movilidad 0..100. */
  mobility: number;
  /** Consumo energético relativo 0..100. */
  energyUse: number;
  /** Tolerancia ambiental 0..100. */
  environmentalTolerance: number;
  /** Capacidad sensorial agregada 0..100. */
  sensoryCapacity: number;
  /** Protección frente a radiación del cuerpo 0..100. */
  radiationProtection: number;
  /** Semilla reproducible del organismo. */
  seed: number;
  genetics: GeneticState;
}

// ---------------------------------------------------------------------------
// Radiación
// ---------------------------------------------------------------------------

export interface RadiationProfile {
  /** Nivel relativo global 0..200 (% respecto a la referencia del escenario). */
  relativeLevel: number;
  uvIntensity: number; // 0..100
  ionizingIntensity: number; // 0..100
  stellarParticleIntensity: number; // 0..100
  infraredIntensity: number; // 0..100 (aporte térmico, no ionizante)
  /** Duración de exposición en horas relativas 0..100. */
  exposureDuration: number;
  /** Frecuencia de episodios intensos 0..100. */
  eventFrequency: number;
  /** Protección ambiental configurada en el laboratorio 0..100. */
  environmentalShielding: number;
}

// ---------------------------------------------------------------------------
// Mutación y evolución
// ---------------------------------------------------------------------------

export type MutationClassification =
  | "perjudicial"
  | "neutra"
  | "favorable"
  | "incierta";

export interface MutationEvent {
  id: string;
  seed: number;
  generation: number;
  trait: string;
  previousValue: string | number;
  newValue: string | number;
  mutationType: string;
  classification: MutationClassification;
  viabilityDelta: number;
  explanation: string;
  cost: string;
  uncertainty: EvidenceLevel;
  timestamp: number;
}

export interface GenerationRecord {
  generation: number;
  population: number;
  meanViability: number;
  diversity: number; // 0..100 diversidad de rasgos
  dominantTrait: string;
  meanRadiationProtection: number;
  extinct: boolean;
}

export interface EvolutionResult {
  seed: number;
  history: GenerationRecord[];
  finalOrganism: Organism | null;
  outcome: "adaptacion" | "estabilidad" | "perdida_diversidad" | "descenso" | "extincion";
  summary: string;
}

export interface EvolutionParams {
  initialPopulation: number;
  generations: number;
  heritableVariation: number; // 0..100
  mutationRate: number; // 0..100
  selectionPressure: number; // 0..100
  radiationIntensity: number; // 0..100
  reproductionCost: number; // 0..100
  carryingCapacity: number;
  drift: number; // 0..100
  seed: number;
}

// ---------------------------------------------------------------------------
// Resultados del motor de viabilidad
// ---------------------------------------------------------------------------

export interface ViabilityFactor {
  label: string;
  /** Impacto en puntos (positivo o negativo). */
  delta: number;
  kind: "favorable" | "limitacion" | "penalizacion";
  evidence: EvidenceLevel;
}

export interface ViabilityLayer {
  key: string;
  label: string;
  /** Puntuación parcial 0..100. */
  score: number;
  factors: ViabilityFactor[];
}

export interface ViabilityResult {
  /** Índice heurístico global 0..100. */
  score: number;
  band: ViabilityBand;
  layers: ViabilityLayer[];
  /** Nivel de incertidumbre global 0..100 (mayor = menos respaldo). */
  uncertainty: number;
  criticalLimits: ViabilityFactor[];
  favorable: ViabilityFactor[];
}

export type ViabilityBand = "alta" | "moderada" | "limitada" | "incompatible" | "critica";

export interface RadiationResult {
  exposureIndex: number; // 0..100
  geneticDamage: number; // 0..100
  geneticIntegrity: number; // 0..100
  repairCapacity: number; // 0..100
  mutationFrequency: number; // 0..100
  effectiveShielding: number; // 0..100
  profile: { label: string; value: number; evidence: EvidenceLevel }[];
  effects: string[];
  viabilityBefore: number;
  viabilityAfter: number;
}

// ---------------------------------------------------------------------------
// Estado completo del laboratorio
// ---------------------------------------------------------------------------

export interface LabState {
  stellar: StellarSystem;
  environment: PlanetEnvironment;
  chemistry: BioChemistry;
  organism: Organism;
  radiation: RadiationProfile;
}

export interface SavedSpecimen {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  state: LabState;
}

export interface ScientificReference {
  id: string;
  concept: string;
  title: string;
  authorOrInstitution: string;
  year?: number;
  url?: string;
}
