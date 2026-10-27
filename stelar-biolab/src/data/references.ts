import type { ScientificReference } from "../types";

// Catálogo estático de conceptos con referencias reales y verificables.
// No se inventan autores, DOI ni resultados. Si un concepto no tiene una cita
// que se pueda garantizar, se muestra el concepto sin atribución formal.

export const REFERENCES: ScientificReference[] = [
  {
    id: "kleiber",
    concept: "Ley de Kleiber (escalado metabólico ~ masa^0,75)",
    title: "Body size and metabolic rate",
    authorOrInstitution: "Max Kleiber",
    year: 1947,
  },
  {
    id: "square_cube",
    concept: "Ley del cuadrado-cubo y límites de tamaño",
    title: "Dialogues Concerning Two New Sciences",
    authorOrInstitution: "Galileo Galilei",
    year: 1638,
  },
  {
    id: "tardigrada",
    concept: "Tolerancia extrema (criptobiosis en tardígrados)",
    title: "Tardigrades survive exposure to space in low Earth orbit",
    authorOrInstitution: "Jönsson et al., Current Biology",
    year: 2008,
  },
  {
    id: "geobacter",
    concept: "Transferencia extracelular de electrones",
    title: "Extracellular electron transfer in Geobacter",
    authorOrInstitution: "Lovley, Annual Review of Microbiology",
    year: 2012,
  },
  {
    id: "titan",
    concept: "Química de hidrocarburos y lagos de metano/etano en Titán",
    title: "The lakes and seas of Titan",
    authorOrInstitution: "Hayes, Annual Review of Earth and Planetary Sciences",
    year: 2016,
  },
  {
    id: "europa",
    concept: "Océano subglacial y potencial habitabilidad de Europa",
    title: "Europa's ocean and ice shell",
    authorOrInstitution: "NASA / JPL — Misión Europa Clipper",
    url: "https://europa.nasa.gov/",
  },
  {
    id: "enceladus",
    concept: "Penachos hidrotermales y química en Encélado",
    title: "Cassini finds molecular hydrogen in the Enceladus plume",
    authorOrInstitution: "Waite et al., Science",
    year: 2017,
  },
  {
    id: "chemosynthesis",
    concept: "Quimiosíntesis en fuentes hidrotermales",
    title: "Hydrothermal vent communities",
    authorOrInstitution: "Van Dover, The Ecology of Deep-Sea Hydrothermal Vents",
    year: 2000,
  },
  {
    id: "silicon",
    concept: "Límites químicos de una bioquímica basada en silicio",
    title: "The limits of organic life in planetary systems",
    authorOrInstitution: "National Research Council (EE. UU.)",
    year: 2007,
  },
  {
    id: "uv_dna",
    concept: "Daño al ADN por radiación ultravioleta",
    title: "Sunlight and the onset of skin cancer / UV photoproducts",
    authorOrInstitution: "Revisiones de fotobiología (concepto general)",
  },
];

export function referencesForConcepts(ids: string[]): ScientificReference[] {
  return REFERENCES.filter((r) => ids.includes(r.id));
}
