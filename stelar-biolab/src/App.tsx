import { useLab } from "./state/useLab";
import { Header } from "./components/Header";
import { StellarPanel, EnvironmentPanel, ChemistryPanel, OrganismPanel } from "./components/panels";
import { CreatureStage } from "./components/CreatureStage";
import { ViabilityReport } from "./components/ViabilityReport";
import { RadiationLab } from "./components/RadiationLab";
import { EvolutionLab } from "./components/EvolutionLab";
import { Collection } from "./components/Collection";
import { MutationBar } from "./components/MutationBar";
import { Sun, Globe2, FlaskRound, Bug, Radiation, Dna, FileText, Library } from "lucide-react";

const TABS = [
  { key: "estelar", label: "Sistema estelar", Icon: Sun },
  { key: "mundo", label: "Mundo y entorno", Icon: Globe2 },
  { key: "quimica", label: "Química de la vida", Icon: FlaskRound },
  { key: "organismo", label: "Diseño del organismo", Icon: Bug },
  { key: "radiacion", label: "Radiación y genética", Icon: Radiation },
  { key: "evolucion", label: "Evolución", Icon: Dna },
  { key: "informe", label: "Informe xenobiológico", Icon: FileText },
  { key: "coleccion", label: "Colección", Icon: Library },
] as const;

const CONFIG_TABS = ["estelar", "mundo", "quimica", "organismo"];

export default function App() {
  const lab = useLab();
  const tab = lab.prefs.activeTab;

  const panel =
    tab === "estelar" ? <StellarPanel lab={lab} /> :
    tab === "mundo" ? <EnvironmentPanel lab={lab} /> :
    tab === "quimica" ? <ChemistryPanel lab={lab} /> :
    tab === "organismo" ? <OrganismPanel lab={lab} /> :
    null;

  return (
    <div className="app">
      <div className="starfield" aria-hidden />
      <Header lab={lab} />

      <nav className="tabbar" aria-label="Módulos del laboratorio">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            className={`tab${tab === key ? " active" : ""}`}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => lab.setActiveTab(key)}
          >
            <Icon size={15} aria-hidden /> <span>{label}</span>
          </button>
        ))}
      </nav>

      <main className="workspace">
        {CONFIG_TABS.includes(tab) && (
          <div className="layout-three">
            <aside className="col panel-card" aria-label="Configuración">{panel}</aside>
            <section className="col-center">
              <CreatureStage lab={lab} />
              <MutationBar lab={lab} />
            </section>
            <aside className="col panel-card" aria-label="Informe de viabilidad"><ViabilityReport lab={lab} /></aside>
          </div>
        )}

        {tab === "radiacion" && (
          <div className="panel-card wide">
            <h2 className="tab-title">Laboratorio de radiación y genética</h2>
            <RadiationLab lab={lab} />
          </div>
        )}

        {tab === "evolucion" && (
          <div className="panel-card wide">
            <h2 className="tab-title">Evolución por generaciones</h2>
            <EvolutionLab lab={lab} />
          </div>
        )}

        {tab === "informe" && (
          <div className="layout-two">
            <section className="col-center">
              <CreatureStage lab={lab} />
              <MutationBar lab={lab} />
            </section>
            <aside className="col panel-card"><ViabilityReport lab={lab} expanded /></aside>
          </div>
        )}

        {tab === "coleccion" && (
          <div className="panel-card wide">
            <h2 className="tab-title">Colección y comparación</h2>
            <Collection lab={lab} />
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>Stelar BioLab · herramienta de exploración xenobiológica especulativa.</span>
        <span className="muted">Todo se ejecuta en el navegador. Los datos se guardan localmente.</span>
      </footer>
    </div>
  );
}
