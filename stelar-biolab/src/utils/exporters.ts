import type { LabState } from "../types";
import { calcularViabilidad, BAND_LABEL } from "../engine/viability";
import { computeRadiation } from "../engine/radiationModel";
import { LABELS } from "../data/options";
import { round } from "../engine/util";

const NOTA = "Simulación especulativa; los índices no constituyen predicciones biológicas validadas.";

export function buildFichaTexto(state: LabState): string {
  const v = calcularViabilidad(state);
  const rad = computeRadiation(state);
  const o = state.organism;
  const env = state.environment;
  const chem = state.chemistry;
  const L: string[] = [];
  const line = (k: string, val: string | number) => L.push(`${k}: ${val}`);

  L.push("══════════════════════════════════════");
  L.push("  STELAR BIOLAB — FICHA XENOBIOLÓGICA");
  L.push("══════════════════════════════════════");
  line("Identificador", o.id);
  line("Nombre común", o.commonName);
  line("Nombre científico", o.scientificName);
  line("Fecha", new Date().toLocaleString("es"));
  L.push("");
  L.push("— ESCENARIO —");
  line("Sistema estelar", LABELS.stellar[state.stellar.type]);
  line("Mundo", LABELS.world[env.worldType]);
  line("Hábitat", LABELS.habitat[env.habitat]);
  line("Gravedad", `${round(env.gravityMS2, 2)} m/s² (${round(env.gravityMS2 / 9.81, 2)} g)`);
  line("Temperatura", `${round(env.temperatureC)} °C (${round(env.temperatureC + 273.15)} K)`);
  line("Presión", `${round(env.pressureKPa)} kPa`);
  L.push("");
  L.push("— BIOQUÍMICA —");
  line("Arquitectura", LABELS.architecture[chem.architecture]);
  line("Solvente", LABELS.solvent[chem.solvent]);
  line("Elementos estructurales", chem.structuralElements.join(", ") || "—");
  line("Elementos metabólicos", chem.metabolicElements.join(", ") || "—");
  L.push("");
  L.push("— ORGANISMO —");
  line("Metabolismo", LABELS.metabolism[o.metabolism]);
  line("Locomoción", LABELS.locomotion[o.locomotion]);
  line("Cubierta", LABELS.covering[o.bodyCovering]);
  line("Sensores", o.sensors.map((s) => LABELS.sensor[s]).join(", ") || "—");
  line("Tamaño", `${round(o.sizeMeters, 2)} m`);
  line("Masa", `${round(o.massKg, 2)} kg`);
  line("Peso local", `${round(o.massKg * env.gravityMS2, 1)} N`);
  line("Apéndices", o.appendageCount);
  line("Protección radiativa", `${round(o.radiationProtection)}/100`);
  L.push("");
  L.push("— VIABILIDAD —");
  line("Índice de compatibilidad", `${v.score}/100 — ${BAND_LABEL[v.band]}`);
  line("Incertidumbre", `${v.uncertainty}/100`);
  L.push("Desglose por capa:");
  v.layers.forEach((l) => L.push(`  · ${l.label}: ${l.score}/100`));
  L.push("");
  L.push("— GENÉTICA / RADIACIÓN —");
  line("Integridad genética", `${rad.geneticIntegrity}/100`);
  line("Daño genético estimado", `${rad.geneticDamage}/100`);
  line("Frecuencia de mutación", `${rad.mutationFrequency}/100`);
  line("Capacidad de reparación", `${rad.repairCapacity}/100`);
  if (o.genetics.mutationHistory.length) {
    L.push("Historial de mutaciones:");
    o.genetics.mutationHistory.forEach((m) =>
      L.push(`  · [${m.classification}] ${m.trait}: ${m.previousValue} → ${m.newValue} (Δ ${m.viabilityDelta})`),
    );
  }
  L.push("");
  L.push("— FACTORES —");
  L.push("Favorables:");
  v.favorable.forEach((f) => L.push(`  + ${f.label}`));
  L.push("Limitaciones críticas:");
  v.criticalLimits.forEach((f) => L.push(`  - ${f.label}`));
  L.push("");
  line("Semilla", o.seed);
  L.push("");
  L.push(NOTA);
  return L.join("\n");
}

export function buildJSON(state: LabState): string {
  const v = calcularViabilidad(state);
  const rad = computeRadiation(state);
  return JSON.stringify(
    {
      metadata: { app: "Stelar BioLab", exportedAt: new Date().toISOString(), nota: NOTA },
      state,
      derived: { viability: v, radiation: rad },
    },
    null,
    2,
  );
}

export function downloadText(filename: string, content: string, mime = "text/plain"): void {
  try {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* entorno sin descargas */
  }
}

export function copyToClipboard(text: string): Promise<boolean> {
  try {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** Abre una vista imprimible con diseño claro (no depende del fondo oscuro). */
export function printFicha(state: LabState): void {
  const v = calcularViabilidad(state);
  const o = state.organism;
  const win = window.open("", "_blank", "width=800,height=900");
  if (!win) return;
  const rows = v.layers.map((l) => `<tr><td>${l.label}</td><td style="text-align:right">${l.score}/100</td></tr>`).join("");
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ficha — ${o.commonName}</title>
  <style>
    body{font-family:Georgia,serif;color:#111;background:#fff;margin:40px;line-height:1.5}
    h1{font-size:22px;margin:0} h2{font-size:15px;border-bottom:1px solid #999;padding-bottom:4px;margin-top:24px}
    .mono{font-family:ui-monospace,monospace} table{border-collapse:collapse;width:100%}
    td{padding:3px 6px;border-bottom:1px solid #eee} .big{font-size:40px;font-weight:bold}
    .note{margin-top:24px;font-size:12px;color:#555;font-style:italic}
  </style></head><body>
  <h1>Stelar BioLab — Ficha xenobiológica</h1>
  <p class="mono">${o.scientificName} · “${o.commonName}”</p>
  <div class="big">${v.score}/100</div>
  <p>${BAND_LABEL[v.band]}</p>
  <h2>Desglose de viabilidad</h2>
  <table>${rows}</table>
  <h2>Factores favorables</h2>
  <ul>${v.favorable.map((f) => `<li>${f.label}</li>`).join("")}</ul>
  <h2>Limitaciones</h2>
  <ul>${v.criticalLimits.map((f) => `<li>${f.label}</li>`).join("")}</ul>
  <p class="note">${NOTA}</p>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}
