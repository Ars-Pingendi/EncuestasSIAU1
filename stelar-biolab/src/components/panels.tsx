import { useId } from "react";
import type { Lab } from "../state/useLab";
import { Slider, NumberField, SelectField, ChipMulti, Field } from "./controls";
import { SystemMap } from "./SystemMap";
import {
  STELLAR_TYPES,
  WORLD_TYPES,
  HABITATS,
  ARCHITECTURES,
  SOLVENTS,
  LOCOMOTIONS,
  COVERINGS,
  SENSORS,
  METABOLISMS,
  METABOLISM_META,
  ELEMENTOS,
  GASES,
  LABELS,
  type Option,
} from "../data/options";
import { STELLAR_PRESETS, WORLD_PRESETS } from "../data/scenarios";
import { solventPhaseOk, architectureEvidence } from "../engine/chemistryModel";
import { EVIDENCE_LABELS } from "../types";
import { RefreshCw } from "lucide-react";

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function PresetRow<T>({ presets, onApply }: { presets: { id: string; label: string; description: string; apply: () => T }[]; onApply: (v: T) => void }) {
  return (
    <div className="preset-row">
      {presets.map((p) => (
        <button key={p.id} type="button" className="preset-btn" title={p.description} onClick={() => onApply(p.apply())}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Sistema estelar
// ---------------------------------------------------------------------------
export function StellarPanel({ lab }: { lab: Lab }) {
  const s = lab.state.stellar;
  const m = (k: string) => lab.modified.has(`stellar.${k}`);
  const noStar = s.type === "errante";
  const artificial = s.type === "habitat_artificial";
  return (
    <div className="panel-body">
      <h3 className="section-title">Escenarios</h3>
      <PresetRow presets={STELLAR_PRESETS} onApply={(v) => lab.setStellar(v)} />

      <SystemMap stellar={s} animate={lab.prefs.animations} />

      <SelectField label="Tipo de sistema" value={s.type} options={STELLAR_TYPES} onChange={(type) => lab.setStellar({ type })} modified={m("type")} />
      <TextField label="Tipo espectral / categoría" value={s.spectralClass} onChange={(spectralClass) => lab.setStellar({ spectralClass })} />

      {!noStar && !artificial && (
        <>
          <Slider label="Luminosidad relativa (L☉)" value={s.luminosityRelative} min={0} max={30} step={0.1} onChange={(v) => lab.setStellar({ luminosityRelative: v })} modified={m("luminosityRelative")} format={(v) => `${v.toFixed(1)} L☉`} />
          <Slider label="Masa estelar (M☉)" value={s.massRelative} min={0.05} max={5} step={0.05} onChange={(v) => lab.setStellar({ massRelative: v })} modified={m("massRelative")} format={(v) => `${v.toFixed(2)} M☉`} />
          <Slider label="Distancia orbital" value={s.orbitalDistance} min={0.02} max={10} step={0.02} unit="UA" onChange={(v) => lab.setStellar({ orbitalDistance: v })} modified={m("orbitalDistance")} />
          <Slider label="Excentricidad" value={s.eccentricity} min={0} max={0.9} step={0.01} onChange={(v) => lab.setStellar({ eccentricity: v })} modified={m("eccentricity")} />
          <NumberField label="Periodo orbital" value={s.orbitalPeriodDays} min={0} step={1} unit="días" onChange={(v) => lab.setStellar({ orbitalPeriodDays: v })} modified={m("orbitalPeriodDays")} />
        </>
      )}

      <Slider label="Variabilidad estelar" value={s.variability} min={0} max={100} unit="%" onChange={(v) => lab.setStellar({ variability: v })} hint="Fluctuación de la energía emitida; alta en muchas enanas rojas." modified={m("variability")} />
      <h3 className="section-title">Distribución espectral (relativa)</h3>
      <Slider label="Componente UV" value={s.uvIntensity} min={0} max={8} step={0.1} onChange={(v) => lab.setStellar({ uvIntensity: v })} modified={m("uvIntensity")} format={(v) => `${v.toFixed(1)}×`} />
      <Slider label="Componente visible" value={s.visibleIntensity} min={0} max={3} step={0.1} onChange={(v) => lab.setStellar({ visibleIntensity: v })} modified={m("visibleIntensity")} format={(v) => `${v.toFixed(1)}×`} />
      <Slider label="Componente infrarroja" value={s.infraredIntensity} min={0} max={3} step={0.1} onChange={(v) => lab.setStellar({ infraredIntensity: v })} modified={m("infraredIntensity")} format={(v) => `${v.toFixed(1)}×`} />
      <Slider label="Actividad de partículas / llamaradas" value={s.energeticParticleActivity} min={0} max={100} onChange={(v) => lab.setStellar({ energeticParticleActivity: v })} hint="Eventos de actividad estelar como fuente de exposición." modified={m("energeticParticleActivity")} />
      <Slider label="Protección magnética del planeta" value={s.magneticProtection} min={0} max={100} onChange={(v) => lab.setStellar({ magneticProtection: v })} modified={m("magneticProtection")} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Mundo y entorno
// ---------------------------------------------------------------------------
export function EnvironmentPanel({ lab }: { lab: Lab }) {
  const e = lab.state.environment;
  const m = (k: string) => lab.modified.has(`environment.${k}`);
  return (
    <div className="panel-body">
      <h3 className="section-title">Mundos de ejemplo</h3>
      <PresetRow presets={WORLD_PRESETS} onApply={(v) => lab.setEnvironment(v)} />

      <SelectField label="Tipo de mundo" value={e.worldType} options={WORLD_TYPES} onChange={(worldType) => lab.setEnvironment({ worldType })} modified={m("worldType")} />
      <SelectField label="Hábitat del organismo" value={e.habitat} options={HABITATS} onChange={(habitat) => lab.setEnvironment({ habitat })} modified={m("habitat")} />

      <Slider label="Gravedad superficial" value={e.gravityMS2} min={0.05} max={30} step={0.05} onChange={(v) => lab.setEnvironment({ gravityMS2: v })} modified={m("gravityMS2")} format={(v) => `${v.toFixed(2)} m/s² · ${(v / 9.81).toFixed(2)} g`} />
      <Slider label="Temperatura media" value={e.temperatureC} min={-230} max={700} onChange={(v) => lab.setEnvironment({ temperatureC: v })} modified={m("temperatureC")} format={(v) => `${v} °C · ${Math.round(v + 273.15)} K`} />
      <Slider label="Variación térmica estacional" value={e.thermalVariationC} min={0} max={200} unit="°C" onChange={(v) => lab.setEnvironment({ thermalVariationC: v })} modified={m("thermalVariationC")} />
      <NumberField label="Presión ambiental" value={e.pressureKPa} min={0} step={1} unit="kPa" onChange={(v) => lab.setEnvironment({ pressureKPa: v })} hint="1 atm ≈ 101 kPa." modified={m("pressureKPa")} />
      <Slider label="Densidad del medio" value={e.mediumDensity} min={0} max={1200} step={0.1} unit="kg/m³" onChange={(v) => lab.setEnvironment({ mediumDensity: v })} hint="Aire ≈ 1,2 · Agua ≈ 1000." modified={m("mediumDensity")} />
      <Slider label="Iluminación superficial" value={e.lightAvailability} min={0} max={100} onChange={(v) => lab.setEnvironment({ lightAvailability: v })} modified={m("lightAvailability")} />
      <Slider label="Energía geotérmica / química" value={e.geothermalEnergy} min={0} max={100} onChange={(v) => lab.setEnvironment({ geothermalEnergy: v })} modified={m("geothermalEnergy")} />
      <Slider label="Radiación de fondo" value={e.backgroundRadiation} min={0} max={100} onChange={(v) => lab.setEnvironment({ backgroundRadiation: v })} modified={m("backgroundRadiation")} />
      <Slider label="Protección ambiental (atm/agua/hielo/roca)" value={e.environmentalProtection} min={0} max={100} onChange={(v) => lab.setEnvironment({ environmentalProtection: v })} modified={m("environmentalProtection")} />
      <Slider label="Disponibilidad de nutrientes" value={e.nutrientAvailability} min={0} max={100} onChange={(v) => lab.setEnvironment({ nutrientAvailability: v })} modified={m("nutrientAvailability")} />
      <Slider label="Oxidantes" value={e.oxidants} min={0} max={100} onChange={(v) => lab.setEnvironment({ oxidants: v })} modified={m("oxidants")} />
      <Slider label="Reductores" value={e.reductants} min={0} max={100} onChange={(v) => lab.setEnvironment({ reductants: v })} modified={m("reductants")} />

      <h3 className="section-title">Composición atmosférica (%)</h3>
      <div className="grid-2">
        {GASES.map((g) => (
          <Slider key={g} label={g} value={Math.round((e.atmosphere[g] ?? 0) * 100)} min={0} max={100} unit="%"
            onChange={(v) => lab.setEnvironment({ atmosphere: { ...e.atmosphere, [g]: v / 100 } })} />
        ))}
      </div>

      <h3 className="section-title">Disponibilidad de solventes</h3>
      <div className="grid-2">
        {(["agua", "amoniaco", "metano", "etano"] as const).map((sv) => (
          <Slider key={sv} label={LABELS.solvent[sv]} value={e.solventAvailability[sv] ?? 0} min={0} max={100}
            onChange={(v) => lab.setEnvironment({ solventAvailability: { ...e.solventAvailability, [sv]: v } })} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Química de la vida
// ---------------------------------------------------------------------------
export function ChemistryPanel({ lab }: { lab: Lab }) {
  const c = lab.state.chemistry;
  const env = lab.state.environment;
  const m = (k: string) => lab.modified.has(`chemistry.${k}`);
  const phase = solventPhaseOk(c.solvent, env.temperatureC, env.pressureKPa);
  const ev = architectureEvidence(c.architecture);
  const elementOptions: Option<string>[] = ELEMENTOS.map((e) => ({ value: e, label: e }));
  return (
    <div className="panel-body">
      <SelectField label="Arquitectura bioquímica" value={c.architecture} options={ARCHITECTURES} onChange={(architecture) => lab.setChemistry({ architecture })} modified={m("architecture")} />
      <div className={`evidence-badge ev-${ev}`}>Respaldo: {EVIDENCE_LABELS[ev]}</div>

      <SelectField label="Solvente" value={c.solvent} options={SOLVENTS} onChange={(solvent) => lab.setChemistry({ solvent })} modified={m("solvent")} />
      <div className={`phase-status ${phase.ok ? "ok" : "bad"}`} role="status">
        {phase.ok ? "✓ " : "✕ "}
        {phase.reason}
      </div>

      <h3 className="section-title">Disponibilidad de elementos</h3>
      <p className="note-inline">Disponibilidad ambiental simplificada, no una predicción geoquímica. Marcados en ámbar si son escasos.</p>
      <div className="grid-2">
        {ELEMENTOS.map((el) => {
          const val = c.availableElements[el] ?? 0;
          return (
            <Slider key={el} label={val < 25 ? `${el} ⚠` : el} value={val} min={0} max={100}
              onChange={(v) => lab.setChemistry({ availableElements: { ...c.availableElements, [el]: v } })} />
          );
        })}
      </div>

      <ChipMulti label="Elementos estructurales" values={c.structuralElements} options={elementOptions} onChange={(structuralElements) => lab.setChemistry({ structuralElements })} />
      <ChipMulti label="Elementos metabólicos" values={c.metabolicElements} options={elementOptions} onChange={(metabolicElements) => lab.setChemistry({ metabolicElements })} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Diseño del organismo
// ---------------------------------------------------------------------------
export function OrganismPanel({ lab }: { lab: Lab }) {
  const o = lab.state.organism;
  const m = (k: string) => lab.modified.has(`organism.${k}`);
  const meta = METABOLISM_META[o.metabolism];
  return (
    <div className="panel-body">
      <div className="name-row">
        <TextField label="Nombre común" value={o.commonName} onChange={(commonName) => lab.setOrganism({ commonName })} />
        <button type="button" className="icon-btn" title="Regenerar nombre con nueva semilla" onClick={() => lab.regenerateName()}>
          <RefreshCw size={16} aria-hidden /> Regenerar
        </button>
      </div>
      <TextField label="Nombre científico (ficticio)" value={o.scientificName} onChange={(scientificName) => lab.setOrganism({ scientificName })} />
      <div className="seed-line mono">Semilla: {o.seed}</div>

      <SelectField label="Metabolismo" value={o.metabolism} options={METABOLISMS} onChange={(metabolism) => lab.setOrganism({ metabolism })} modified={m("metabolism")} />
      <div className={`meta-card ev-${meta.evidence}`}>
        <div className="meta-grid">
          <span>Fuente de energía</span><b>{meta.energySource}</b>
          <span>Donante e⁻</span><b>{meta.electronDonor}</b>
          <span>Aceptor e⁻</span><b>{meta.electronAcceptor}</b>
          <span>Reactivos</span><b>{meta.reactants}</b>
          <span>Productos</span><b>{meta.products}</b>
          <span>Dependencias</span><b>{meta.dependencies}</b>
          <span>Costes</span><b>{meta.costs}</b>
          <span>Respaldo</span><b>{EVIDENCE_LABELS[meta.evidence]}</b>
        </div>
      </div>

      <SelectField label="Locomoción" value={o.locomotion} options={LOCOMOTIONS} onChange={(locomotion) => lab.setOrganism({ locomotion })} modified={m("locomotion")} />
      <SelectField label="Cubierta corporal" value={o.bodyCovering} options={COVERINGS} onChange={(bodyCovering) => lab.setOrganism({ bodyCovering })} modified={m("bodyCovering")} />
      <ChipMulti label="Sistemas sensoriales" values={o.sensors} options={SENSORS} onChange={(sensors) => lab.setOrganism({ sensors })} hint="Deben ser coherentes con el medio (p. ej. ecolocalización necesita un medio para el sonido)." />

      <h3 className="section-title">Parámetros corporales</h3>
      <Slider label="Longitud / altura" value={o.sizeMeters} min={0.02} max={40} step={0.02} unit="m" onChange={(v) => lab.setOrganism({ sizeMeters: v })} modified={m("sizeMeters")} />
      <NumberField label="Masa estimada" value={o.massKg} min={0.001} step={0.1} unit="kg" onChange={(v) => lab.setOrganism({ massKg: v })} modified={m("massKg")} />
      <NumberField label="Número de apéndices" value={o.appendageCount} min={0} max={24} step={1} onChange={(v) => lab.setOrganism({ appendageCount: v })} modified={m("appendageCount")} />
      <Slider label="Anchura corporal" value={o.bodyWidth} min={0.2} max={3} step={0.05} onChange={(v) => lab.setOrganism({ bodyWidth: v })} modified={m("bodyWidth")} format={(v) => `${v.toFixed(2)}×`} />
      <Slider label="Altura corporal" value={o.bodyHeight} min={0.2} max={3} step={0.05} onChange={(v) => lab.setOrganism({ bodyHeight: v })} modified={m("bodyHeight")} format={(v) => `${v.toFixed(2)}×`} />
      <Slider label="Densidad corporal (rel. medio)" value={o.bodyDensity} min={0.4} max={2} step={0.01} onChange={(v) => lab.setOrganism({ bodyDensity: v })} hint="1 = flotabilidad neutra en el medio." modified={m("bodyDensity")} format={(v) => v.toFixed(2)} />
      <Slider label="Aislamiento térmico" value={o.thermalProtection} min={0} max={100} onChange={(v) => lab.setOrganism({ thermalProtection: v })} modified={m("thermalProtection")} />
      <Slider label="Capacidad de flotación" value={o.buoyancyCapacity} min={0} max={100} onChange={(v) => lab.setOrganism({ buoyancyCapacity: v })} modified={m("buoyancyCapacity")} />
      <Slider label="Movilidad" value={o.mobility} min={0} max={100} onChange={(v) => lab.setOrganism({ mobility: v })} modified={m("mobility")} />
      <Slider label="Consumo energético" value={o.energyUse} min={0} max={100} onChange={(v) => lab.setOrganism({ energyUse: v })} modified={m("energyUse")} />
      <Slider label="Tolerancia ambiental" value={o.environmentalTolerance} min={0} max={100} onChange={(v) => lab.setOrganism({ environmentalTolerance: v })} modified={m("environmentalTolerance")} />
      <Slider label="Capacidad sensorial" value={o.sensoryCapacity} min={0} max={100} onChange={(v) => lab.setOrganism({ sensoryCapacity: v })} modified={m("sensoryCapacity")} />
      <Slider label="Protección frente a radiación" value={o.radiationProtection} min={0} max={100} onChange={(v) => lab.setOrganism({ radiationProtection: v })} modified={m("radiationProtection")} />
      <Slider label="Capacidad de reparación molecular" value={o.genetics.repairCapacity} min={0} max={100} onChange={(v) => lab.setOrganism({ genetics: { ...o.genetics, repairCapacity: v } })} hint="Capacidad hipotética de reparar daño molecular." />
    </div>
  );
}
