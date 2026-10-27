import { useState } from "react";
import type { Lab } from "../state/useLab";
import type { SavedSpecimen } from "../types";
import { CreatureSvg } from "./CreatureSvg";
import { calcularViabilidad, BAND_LABEL } from "../engine/viability";
import { computeRadiation } from "../engine/radiationModel";
import { energyCostEstimate } from "../engine/report";
import { LABELS } from "../data/options";
import { round } from "../engine/util";
import { Save, FolderOpen, Copy, Trash2, RotateCcw, GitCompare } from "lucide-react";

export function Collection({ lab }: { lab: Lab }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const toggleCompare = (id: string) => {
    setCompare((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return cur;
      return [...cur, id];
    });
  };

  const selected = compare
    .map((id) => lab.specimens.find((s) => s.id === id))
    .filter((x): x is SavedSpecimen => Boolean(x));

  return (
    <div className="collection">
      <div className="save-bar">
        <input type="text" placeholder="Nombre del espécimen" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nombre del espécimen" />
        <input type="text" placeholder="Descripción (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} aria-label="Descripción" />
        <button type="button" className="btn primary" onClick={() => { lab.saveCurrent(name, desc); setName(""); setDesc(""); }}>
          <Save size={14} aria-hidden /> Guardar diseño actual
        </button>
        <button type="button" className="btn" onClick={lab.resetCatalog} title="Restaurar el catálogo inicial de ejemplos">
          <RotateCcw size={14} aria-hidden /> Restaurar catálogo
        </button>
      </div>

      {selected.length >= 2 && <CompareTable specimens={selected} onClear={() => setCompare([])} />}

      <div className="specimen-grid">
        {lab.specimens.map((s) => {
          const v = calcularViabilidad(s.state);
          const inCompare = compare.includes(s.id);
          return (
            <div key={s.id} className={`specimen-card${inCompare ? " selected" : ""}`}>
              <div className="specimen-thumb"><CreatureSvg state={s.state} animate={false} idSuffix={`thumb-${s.id}`} /></div>
              <div className="specimen-info">
                <h4>{s.name}</h4>
                <p className="mono small muted">{s.state.organism.scientificName}</p>
                <p className="small">{s.description || "Sin descripción."}</p>
                <div className="specimen-meta small">
                  <span className={`band-${v.band}`}>{v.score}/100</span> · {LABELS.metabolism[s.state.organism.metabolism]} · {LABELS.world[s.state.environment.worldType]}
                </div>
              </div>
              <div className="specimen-actions">
                <button type="button" className="mini-btn" onClick={() => lab.loadSpecimen(s.id)} title="Cargar"><FolderOpen size={14} aria-hidden /></button>
                <button type="button" className="mini-btn" onClick={() => lab.duplicateSpecimen(s.id)} title="Duplicar"><Copy size={14} aria-hidden /></button>
                <button type="button" className={`mini-btn${inCompare ? " active" : ""}`} onClick={() => toggleCompare(s.id)} title="Comparar (máx. 3)"><GitCompare size={14} aria-hidden /></button>
                <button type="button" className="mini-btn danger" onClick={() => setConfirmDelete(s.id)} title="Eliminar"><Trash2 size={14} aria-hidden /></button>
              </div>
              {confirmDelete === s.id && (
                <div className="confirm" role="alertdialog" aria-label="Confirmar eliminación">
                  <span className="small">¿Eliminar “{s.name}”?</span>
                  <div>
                    <button type="button" className="btn danger" onClick={() => { lab.deleteSpecimen(s.id); setConfirmDelete(null); setCompare((c) => c.filter((x) => x !== s.id)); }}>Eliminar</button>
                    <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CompareTable({ specimens, onClear }: { specimens: SavedSpecimen[]; onClear: () => void }) {
  const rows: { label: string; get: (s: SavedSpecimen) => string }[] = [
    { label: "Mundo", get: (s) => LABELS.world[s.state.environment.worldType] },
    { label: "Hábitat", get: (s) => LABELS.habitat[s.state.environment.habitat] },
    { label: "Temperatura", get: (s) => `${round(s.state.environment.temperatureC)} °C` },
    { label: "Gravedad", get: (s) => `${round(s.state.environment.gravityMS2 / 9.81, 2)} g` },
    { label: "Metabolismo", get: (s) => LABELS.metabolism[s.state.organism.metabolism] },
    { label: "Locomoción", get: (s) => LABELS.locomotion[s.state.organism.locomotion] },
    { label: "Tamaño", get: (s) => `${round(s.state.organism.sizeMeters, 2)} m` },
    { label: "Viabilidad", get: (s) => `${calcularViabilidad(s.state).score}/100 (${BAND_LABEL[calcularViabilidad(s.state).band]})` },
    { label: "Coste energético", get: (s) => `~${energyCostEstimate(s.state).value}` },
    { label: "Protección radiativa", get: (s) => `${s.state.organism.radiationProtection}/100` },
    { label: "Integridad genética", get: (s) => `${computeRadiation(s.state).geneticIntegrity}/100` },
    { label: "Incertidumbre", get: (s) => `${calcularViabilidad(s.state).uncertainty}/100` },
  ];
  return (
    <div className="compare-table">
      <div className="compare-head">
        <h3 className="section-title" style={{ margin: 0 }}>Comparación ({specimens.length})</h3>
        <button type="button" className="btn" onClick={onClear}>Limpiar</button>
      </div>
      <div className="compare-scroll">
        <table>
          <thead>
            <tr>
              <th></th>
              {specimens.map((s) => <th key={s.id}>{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="row-label">{r.label}</td>
                {specimens.map((s) => <td key={s.id}>{r.get(s)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
