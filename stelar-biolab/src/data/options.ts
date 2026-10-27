import type {
  StellarType,
  WorldType,
  Habitat,
  BioArchitecture,
  Solvent,
  Locomotion,
  BodyCovering,
  Sensor,
  Metabolism,
  EvidenceLevel,
} from "../types";

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export const STELLAR_TYPES: Option<StellarType>[] = [
  { value: "unica", label: "Estrella única", hint: "Una sola estrella anfitriona." },
  { value: "binaria_circumbinaria", label: "Binaria (circumbinaria)", hint: "El planeta orbita ambas estrellas." },
  { value: "binaria_circumestelar", label: "Binaria (circumestelar)", hint: "El planeta orbita una de las dos." },
  { value: "multiple", label: "Estrellas múltiples", hint: "Tres o más estrellas en el sistema." },
  { value: "enana_roja", label: "Enana roja", hint: "Fría, de baja masa y a menudo activa." },
  { value: "tipo_solar", label: "Tipo solar (G)", hint: "Similar al Sol." },
  { value: "caliente_luminosa", label: "Caliente y luminosa", hint: "Mucha energía y UV; vida corta." },
  { value: "errante", label: "Planeta errante", hint: "Sin estrella anfitriona." },
  { value: "habitat_artificial", label: "Hábitat artificial", hint: "Energía de una fuente seleccionada." },
];

export const WORLD_TYPES: Option<WorldType>[] = [
  { value: "rocoso", label: "Rocoso terrestre" },
  { value: "supertierra", label: "Supertierra" },
  { value: "oceanico", label: "Mundo oceánico" },
  { value: "oceanico_subglacial", label: "Oceánico subglacial" },
  { value: "desertico", label: "Desértico" },
  { value: "helado", label: "Helado" },
  { value: "gigante_gaseoso", label: "Gigante gaseoso" },
  { value: "gigante_hielo", label: "Gigante de hielo" },
  { value: "lava", label: "Mundo de lava" },
  { value: "subterraneo", label: "Subterráneo / cavernas" },
  { value: "errante", label: "Planeta errante" },
  { value: "habitat_artificial", label: "Hábitat artificial" },
  { value: "personalizado", label: "Personalizado" },
];

export const HABITATS: Option<Habitat>[] = [
  { value: "superficie", label: "Superficie" },
  { value: "oceano", label: "Océano" },
  { value: "subsuelo", label: "Subsuelo" },
  { value: "atmosfera", label: "Atmósfera" },
  { value: "subglacial", label: "Subglacial" },
];

export const ARCHITECTURES: Option<BioArchitecture>[] = [
  { value: "carbono_agua", label: "Carbono y agua", hint: "Referencia terrestre." },
  { value: "carbono_solvente_alt", label: "Carbono + solvente alternativo", hint: "Metano, amoníaco…" },
  { value: "hibrida_carbono_silicio", label: "Híbrida carbono-silicio" },
  { value: "silicio", label: "Predominantemente silicio", hint: "Altamente especulativa." },
  { value: "otros_elementos", label: "Otros elementos / redes", hint: "Experimental." },
  { value: "desconocida", label: "Desconocida" },
];

export const SOLVENTS: Option<Solvent>[] = [
  { value: "agua", label: "Agua" },
  { value: "amoniaco", label: "Amoníaco" },
  { value: "metano", label: "Metano líquido" },
  { value: "etano", label: "Etano líquido" },
  { value: "mezcla_hipotetica", label: "Mezcla hipotética" },
  { value: "desconocido", label: "Desconocido / no convencional" },
];

/** Rango líquido aproximado de cada solvente a ~1 atm, en °C. */
export const SOLVENT_LIQUID_RANGE: Record<Solvent, { min: number; max: number } | null> = {
  agua: { min: 0, max: 100 },
  amoniaco: { min: -78, max: -33 },
  metano: { min: -182, max: -161 },
  etano: { min: -183, max: -89 },
  mezcla_hipotetica: { min: -120, max: 40 },
  desconocido: null,
};

export const LOCOMOTIONS: Option<Locomotion>[] = [
  { value: "filtrador_flotante", label: "Filtrador flotante" },
  { value: "hexapodo_blindado", label: "Hexápodo blindado" },
  { value: "serpenteante", label: "Serpenteante" },
  { value: "propulsion_chorro", label: "Propulsión a chorro" },
  { value: "sesil", label: "Sésil (anclado)" },
  { value: "planeador", label: "Planeador / volador" },
  { value: "excavador", label: "Excavador" },
  { value: "nadador", label: "Nadador" },
  { value: "personalizada", label: "Personalizada" },
];

export const COVERINGS: Option<BodyCovering>[] = [
  { value: "quitina", label: "Quitina / polímero endurecido" },
  { value: "silicea", label: "Estructura silícea" },
  { value: "membrana_flexible", label: "Membrana flexible" },
  { value: "reflectante_uv", label: "Cubierta reflectante UV" },
  { value: "gel_anticongelante", label: "Gel anticongelante" },
  { value: "malla_piezoelectrica", label: "Malla piezoeléctrica" },
  { value: "caparazon_mineral", label: "Caparazón mineral" },
  { value: "piel_pigmentada", label: "Piel pigmentada" },
  { value: "personalizada", label: "Personalizada" },
];

export const SENSORS: Option<Sensor>[] = [
  { value: "ecolocalizacion", label: "Ecolocalización" },
  { value: "electrorecepcion", label: "Electrorecepción" },
  { value: "infrarrojo", label: "Sensor infrarrojo" },
  { value: "quimiorrecepcion", label: "Quimiorrecepción" },
  { value: "magnetorecepcion", label: "Detección magnética" },
  { value: "presion", label: "Sensores de presión" },
  { value: "vibracion", label: "Detección de vibraciones" },
  { value: "fotorecepcion", label: "Fotorecepción" },
  { value: "radiacion", label: "Sensor de radiación" },
  { value: "desconocido", label: "Desconocido" },
];

export const METABOLISMS: Option<Metabolism>[] = [
  { value: "quimiosintetico", label: "Quimiosintético" },
  { value: "fotosintesis", label: "Fotosíntesis (luz visible)" },
  { value: "fototrofia_ir", label: "Fototrofía infrarroja" },
  { value: "metanogenico", label: "Metanogénico" },
  { value: "termosintetico", label: "Termosintético (gradientes)" },
  { value: "electrotrofo", label: "Electrótrofo" },
  { value: "azufre", label: "Basado en azufre" },
  { value: "personalizado", label: "Personalizado" },
];

export interface MetabolismMeta {
  energySource: string;
  electronDonor: string;
  electronAcceptor: string;
  reactants: string;
  products: string;
  dependencies: string;
  costs: string;
  evidence: EvidenceLevel;
  /** Dependencia dominante que el motor evalúa. */
  needs: "luz" | "luz_ir" | "quimica" | "gradiente_termico" | "electrico" | "azufre" | "libre";
}

export const METABOLISM_META: Record<Metabolism, MetabolismMeta> = {
  fotosintesis: {
    energySource: "Luz visible",
    electronDonor: "Agua u otro donante",
    electronAcceptor: "CO₂ / carbono inorgánico",
    reactants: "Luz, CO₂, agua",
    products: "Materia orgánica, O₂ (o análogo)",
    dependencies: "Requiere iluminación útil en superficie o aguas someras.",
    costs: "Superficie fotosintética amplia; poco útil sin luz.",
    evidence: "terrestrial",
    needs: "luz",
  },
  fototrofia_ir: {
    energySource: "Luz infrarroja de baja energía",
    electronDonor: "Compuestos reducidos",
    electronAcceptor: "Variable",
    reactants: "Fotones IR, donantes reducidos",
    products: "Materia orgánica (hipotética)",
    dependencies: "Fuente IR estable; pigmentos de baja energía.",
    costs: "Rendimiento energético bajo por fotón.",
    evidence: "speculative",
    needs: "luz_ir",
  },
  quimiosintetico: {
    energySource: "Energía química (redox)",
    electronDonor: "H₂, H₂S, Fe²⁺, CH₄…",
    electronAcceptor: "CO₂, SO₄²⁻, NO₃⁻…",
    reactants: "Donantes y aceptores inorgánicos",
    products: "Materia orgánica, residuos minerales",
    dependencies: "Requiere pares redox disponibles en el entorno.",
    costs: "Depende de recarga geoquímica local.",
    evidence: "terrestrial",
    needs: "quimica",
  },
  metanogenico: {
    energySource: "Reducción de CO₂ con H₂",
    electronDonor: "Hidrógeno",
    electronAcceptor: "CO₂",
    reactants: "H₂ + CO₂",
    products: "Metano (CH₄) + agua",
    dependencies: "Entorno anóxico rico en H₂ y carbono.",
    costs: "Inhibido por oxidantes fuertes.",
    evidence: "terrestrial",
    needs: "quimica",
  },
  termosintetico: {
    energySource: "Gradiente térmico",
    electronDonor: "—",
    electronAcceptor: "—",
    reactants: "Diferencia de temperatura estable",
    products: "Trabajo metabólico",
    dependencies: "Necesita un gradiente mantenido y mecanismo de aprovechamiento.",
    costs: "Eficiencia limitada por termodinámica; presentar con cautela.",
    evidence: "speculative",
    needs: "gradiente_termico",
  },
  electrotrofo: {
    energySource: "Electrones de superficies conductoras",
    electronDonor: "Minerales conductores / electrodos naturales",
    electronAcceptor: "CO₂ u otro",
    reactants: "Flujo de electrones, carbono",
    products: "Materia orgánica",
    dependencies: "Medio conductor y contacto con fuente de electrones.",
    costs: "Movilidad limitada por el contacto eléctrico.",
    evidence: "reasonable_extrapolation",
    needs: "electrico",
  },
  azufre: {
    energySource: "Oxidación/reducción de compuestos de azufre",
    electronDonor: "H₂S, S⁰",
    electronAcceptor: "O₂, SO₄²⁻",
    reactants: "Compuestos de azufre",
    products: "Sulfato o azufre elemental",
    dependencies: "Disponibilidad de azufre reducido.",
    costs: "Residuos potencialmente corrosivos.",
    evidence: "terrestrial",
    needs: "azufre",
  },
  personalizado: {
    energySource: "Definido por el usuario",
    electronDonor: "—",
    electronAcceptor: "—",
    reactants: "Según configuración",
    products: "Según configuración",
    dependencies: "Depende de los parámetros definidos.",
    costs: "Incierto.",
    evidence: "speculative",
    needs: "libre",
  },
};

// Etiquetas de uso general para mostrar valores de enum en fichas e informes.
export const LABELS = {
  stellar: Object.fromEntries(STELLAR_TYPES.map((o) => [o.value, o.label])) as Record<StellarType, string>,
  world: Object.fromEntries(WORLD_TYPES.map((o) => [o.value, o.label])) as Record<WorldType, string>,
  habitat: Object.fromEntries(HABITATS.map((o) => [o.value, o.label])) as Record<Habitat, string>,
  architecture: Object.fromEntries(ARCHITECTURES.map((o) => [o.value, o.label])) as Record<BioArchitecture, string>,
  solvent: Object.fromEntries(SOLVENTS.map((o) => [o.value, o.label])) as Record<Solvent, string>,
  locomotion: Object.fromEntries(LOCOMOTIONS.map((o) => [o.value, o.label])) as Record<Locomotion, string>,
  covering: Object.fromEntries(COVERINGS.map((o) => [o.value, o.label])) as Record<BodyCovering, string>,
  sensor: Object.fromEntries(SENSORS.map((o) => [o.value, o.label])) as Record<Sensor, string>,
  metabolism: Object.fromEntries(METABOLISMS.map((o) => [o.value, o.label])) as Record<Metabolism, string>,
};

export const ELEMENTOS = ["C", "H", "O", "N", "P", "S", "Si", "Fe"] as const;
export const GASES = ["N₂", "CO₂", "O₂", "CH₄", "H₂", "NH₃", "H₂S", "Ar"] as const;
