import { useState } from "react";
import type { Lab } from "../state/useLab";
import { buildFichaTexto, downloadText } from "../utils/exporters";
import { Save, Download, RotateCcw, Trash2, FlaskConical, Undo2 } from "lucide-react";

function simStatus(band: string): { label: string; tone: string } {
  if (band === "critica") return { label: "Organismo no viable", tone: "crit" };
  if (band === "incompatible") return { label: "Configuración inconsistente", tone: "risk" };
  return { label: "En simulación", tone: "ok" };
}

export function Header({ lab }: { lab: Lab }) {
  const status = simStatus(lab.viability.band);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <header className="app-header">
      <div className="brand">
        <FlaskConical className="brand-icon" size={26} aria-hidden />
        <div>
          <h1>STELAR BIOLAB</h1>
          <p className="subtitle">Laboratorio Biológico Estelar</p>
        </div>
      </div>

      <div className={`sim-status tone-${status.tone}`} role="status" aria-live="polite">
        <span className="sim-dot" /> {status.label}
      </div>

      <div className="header-actions">
        <button type="button" className="btn" onClick={lab.undo} disabled={!lab.canUndo}><Undo2 size={14} aria-hidden /> Deshacer</button>
        <button type="button" className="btn" onClick={() => lab.setActiveTab("coleccion")}><Save size={14} aria-hidden /> Guardar</button>
        <button type="button" className="btn" onClick={() => downloadText(`ficha-${lab.state.organism.id}.txt`, buildFichaTexto(lab.state))}><Download size={14} aria-hidden /> Exportar</button>
        <button type="button" className="btn" onClick={() => setConfirmReset(true)}><RotateCcw size={14} aria-hidden /> Restablecer</button>
        <button type="button" className="btn ghost" onClick={() => setConfirmClear(true)} title="Borrar todos los datos locales"><Trash2 size={14} aria-hidden /></button>
      </div>

      <p className="header-disclaimer">Modelo especulativo — los resultados son estimaciones, no predicciones biológicas validadas.</p>

      {confirmReset && (
        <ConfirmBar
          text="¿Restablecer el experimento a los valores por defecto? Se perderán los cambios no guardados."
          onConfirm={() => { lab.resetExperiment(); setConfirmReset(false); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
      {confirmClear && (
        <ConfirmBar
          text="¿Borrar TODOS los datos locales (configuración y especímenes guardados)? Esta acción no se puede deshacer."
          danger
          onConfirm={() => { lab.clearLocalData(); setConfirmClear(false); }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </header>
  );
}

function ConfirmBar({ text, onConfirm, onCancel, danger }: { text: string; onConfirm: () => void; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="confirm-bar" role="alertdialog" aria-label="Confirmación">
      <span>{text}</span>
      <div>
        <button type="button" className={`btn ${danger ? "danger" : "primary"}`} onClick={onConfirm}>Confirmar</button>
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
