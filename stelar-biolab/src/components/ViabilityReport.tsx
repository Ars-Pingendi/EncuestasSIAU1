import { useState } from "react";
import type { Lab } from "../state/useLab";
import type { ViabilityLayer } from "../types";
import { EVIDENCE_LABELS } from "../types";
import { BAND_LABEL } from "../engine/viability";
import { organismSummary, energyCostEstimate, analogies, conceptRefs } from "../engine/report";
import { referencesForConcepts } from "../data/references";
import { buildFichaTexto, buildJSON, downloadText, copyToClipboard, printFicha } from "../utils/exporters";
import { bandTone } from "./controls";
import { Copy, Download, FileJson, Printer, ChevronDown } from "lucide-react";

function ScoreDial({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const tone = bandTone(score);
  return (
    <svg viewBox="0 0 140 140" className="score-dial" role="img" aria-label={`Compatibilidad ${score} de 100`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={r} fill="none" strokeWidth="12" strokeLinecap="round"
        className={`dial-tone tone-${tone}`}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - score / 100)}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="66" textAnchor="middle" className="dial-score">{score}</text>
      <text x="70" y="88" textAnchor="middle" className="dial-sub">/ 100</text>
    </svg>
  );
}

function LayerRow({ layer, expanded }: { layer: ViabilityLayer; expanded: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = bandTone(layer.score);
  return (
    <div className="layer">
      <button type="button" className="layer-head" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
        <span className="layer-name">{layer.label}</span>
        <span className="layer-bar">
          <span className={`layer-fill tone-${tone}`} style={{ width: `${layer.score}%` }} />
        </span>
        <span className="layer-score mono">{layer.score}</span>
        <ChevronDown size={14} className={`chev${open ? " open" : ""}`} aria-hidden />
      </button>
      {(open || expanded) && (
        <ul className="factor-list">
          {layer.factors.length === 0 && <li className="factor neutral">Sin factores destacables.</li>}
          {layer.factors.map((f, i) => (
            <li key={i} className={`factor ${f.kind}`}>
              <span className="factor-sign">{f.delta > 0 ? "+" : f.delta < 0 ? "−" : "•"}</span>
              <span>{f.label}</span>
              <span className={`ev-tag ev-${f.evidence}`}>{EVIDENCE_LABELS[f.evidence]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ViabilityReport({ lab, expanded = false }: { lab: Lab; expanded?: boolean }) {
  const v = lab.viability;
  const state = lab.state;
  const [copied, setCopied] = useState(false);
  const energy = energyCostEstimate(state);
  const anas = analogies(state);
  const refs = referencesForConcepts(conceptRefs(state));

  const doCopy = async () => {
    const ok = await copyToClipboard(buildFichaTexto(state));
    setCopied(ok);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="report">
      <div className="report-dial">
        <ScoreDial score={v.score} />
        <div>
          <div className="band-title" data-band={v.band}>{BAND_LABEL[v.band]}</div>
          <p className="muted small">Índice heurístico de compatibilidad del modelo (0–100), no una probabilidad de supervivencia.</p>
        </div>
      </div>

      <section>
        <h4>Resumen del organismo</h4>
        <p className="summary">{organismSummary(state)}</p>
      </section>

      <section>
        <h4>Desglose por capa</h4>
        <div className="layers">
          {v.layers.map((l) => (
            <LayerRow key={l.key} layer={l} expanded={expanded} />
          ))}
        </div>
      </section>

      <section>
        <h4>Factores favorables</h4>
        {v.favorable.length ? (
          <ul className="bullet fav">{v.favorable.map((f, i) => <li key={i}>{f.label}</li>)}</ul>
        ) : (
          <p className="muted small">Sin factores claramente favorables en esta configuración.</p>
        )}
      </section>

      <section>
        <h4>Limitaciones críticas</h4>
        {v.criticalLimits.length ? (
          <ul className="bullet crit">{v.criticalLimits.map((f, i) => <li key={i}>{f.label}</li>)}</ul>
        ) : (
          <p className="muted small">Sin limitaciones críticas detectadas.</p>
        )}
      </section>

      <section>
        <h4>Coste energético</h4>
        <p className="mono cost-expr">{energy.expr}</p>
        <p className="small">Estimación conceptual: <b>~{energy.value}</b> unidades relativas de mantenimiento + locomoción.</p>
        <p className="muted small">{energy.note}</p>
      </section>

      <section>
        <h4>Parientes terrestres o analogías</h4>
        <ul className="analogies">
          {anas.map((a, i) => (
            <li key={i}><b>{a.name}:</b> {a.note}</li>
          ))}
        </ul>
        <p className="muted small">Una analogía funcional no demuestra que el organismo alienígena sea posible.</p>
      </section>

      {expanded && (
        <>
          <section>
            <h4>Referencias científicas</h4>
            <ul className="refs">
              {refs.map((r) => (
                <li key={r.id}>
                  <span className="ref-concept">{r.concept}</span>
                  <span className="muted small">
                    {" — "}{r.title}. {r.authorOrInstitution}{r.year ? `, ${r.year}` : ""}.
                    {r.url && (
                      <> <a href={r.url} target="_blank" rel="noreferrer">enlace</a></>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted small">Referencias reales y verificables; no se inventan autores ni DOI. Cuando un concepto no tiene cita garantizable, se muestra sin atribución formal.</p>
          </section>

          <section className="export-row">
            <button type="button" className="btn" onClick={doCopy}><Copy size={14} aria-hidden /> {copied ? "¡Copiado!" : "Copiar ficha"}</button>
            <button type="button" className="btn" onClick={() => downloadText(`ficha-${state.organism.id}.txt`, buildFichaTexto(state))}><Download size={14} aria-hidden /> .txt</button>
            <button type="button" className="btn" onClick={() => downloadText(`ficha-${state.organism.id}.json`, buildJSON(state), "application/json")}><FileJson size={14} aria-hidden /> .json</button>
            <button type="button" className="btn" onClick={() => printFicha(state)}><Printer size={14} aria-hidden /> Imprimir</button>
          </section>
        </>
      )}

      <p className="disclaimer small">Simulación especulativa; los índices no constituyen predicciones biológicas validadas.</p>
    </div>
  );
}
