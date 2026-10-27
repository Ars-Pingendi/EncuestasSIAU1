import { SeededRng } from "./rng";
import type { Metabolism, Habitat } from "../types";

// Nombres ficticios reproducibles a partir de raíces fonéticas.
// No representan taxones reconocidos.

const PREFIJOS = [
  "Xeno",
  "Astro",
  "Cryo",
  "Pyro",
  "Litho",
  "Hydro",
  "Thermo",
  "Photo",
  "Chemo",
  "Baro",
  "Nocti",
  "Sulfo",
  "Ferro",
  "Silici",
  "Methano",
];

const RAICES = [
  "morph",
  "pod",
  "derm",
  "branch",
  "phore",
  "cyte",
  "bion",
  "trop",
  "saur",
  "teuthis",
  "nema",
  "form",
  "ped",
  "gaster",
];

const SUFIJOS = ["us", "a", "on", "ix", "ella", "oides", "ensis", "ii"];

const EPITETOS_HABITAT: Record<Habitat, string> = {
  superficie: "superficialis",
  oceano: "pelagicus",
  subsuelo: "fossor",
  atmosfera: "volans",
  subglacial: "subglacialis",
};

const COMUN_META: Record<Metabolism, string[]> = {
  quimiosintetico: ["Quimiovoro", "Mineralito", "Reductor"],
  fotosintesis: ["Lumívoro", "Solícola", "Frondado"],
  fototrofia_ir: ["Termoluminoso", "Rojizo profundo", "Infravoro"],
  metanogenico: ["Metanario", "Hidrocarburo errante", "Pantano estelar"],
  termosintetico: ["Gradiente viviente", "Termívoro", "Fumador"],
  electrotrofo: ["Electrívoro", "Conductor vivo", "Chispa orgánica"],
  azufre: ["Sulfuroso", "Ámbar viviente", "Azufrado"],
  personalizado: ["Quimera", "Espécimen libre", "Variante"],
};

export function generarNombreCientifico(seed: number, habitat: Habitat): string {
  const rng = new SeededRng(seed ^ 0x9e3779b9);
  const genero = rng.pick(PREFIJOS) + rng.pick(RAICES) + rng.pick(SUFIJOS);
  const especie = rng.chance(0.5) ? EPITETOS_HABITAT[habitat] : rng.pick(RAICES) + rng.pick(SUFIJOS);
  const g = genero.charAt(0).toUpperCase() + genero.slice(1).toLowerCase();
  return `${g} ${especie.toLowerCase()}`;
}

export function generarNombreComun(seed: number, metabolism: Metabolism): string {
  const rng = new SeededRng(seed ^ 0x85ebca6b);
  const base = rng.pick(COMUN_META[metabolism]);
  const adjetivos = ["estelar", "abisal", "errante", "críptico", "luminiscente", "coriáceo", "espectral"];
  return `${base} ${rng.pick(adjetivos)}`;
}
