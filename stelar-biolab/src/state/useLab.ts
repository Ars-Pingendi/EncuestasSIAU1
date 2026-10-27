import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LabState,
  StellarSystem,
  PlanetEnvironment,
  BioChemistry,
  Organism,
  RadiationProfile,
  SavedSpecimen,
  EvolutionParams,
  EvolutionResult,
} from "../types";
import { calcularViabilidad } from "../engine/viability";
import { computeRadiation } from "../engine/radiationModel";
import { mutateOrganism, type MutationIntensity } from "../engine/mutationModel";
import { runEvolution } from "../engine/evolutionModel";
import { generarNombreComun, generarNombreCientifico } from "../engine/nameGenerator";
import { randomSeed } from "../engine/rng";
import { defaultState } from "../data/scenarios";
import {
  loadState,
  saveState,
  loadSpecimens,
  saveSpecimens,
  loadPrefs,
  savePrefs,
  clearAllData,
  resetSpecimens,
  type UIPrefs,
} from "./storage";

const MAX_HISTORY = 25;

function diffModified(state: LabState, baseline: LabState): Set<string> {
  const out = new Set<string>();
  const sections: (keyof LabState)[] = ["stellar", "environment", "chemistry", "organism", "radiation"];
  for (const section of sections) {
    const a = state[section] as unknown as Record<string, unknown>;
    const b = baseline[section] as unknown as Record<string, unknown>;
    for (const key of Object.keys(a)) {
      if (key === "genetics" || key === "mutationHistory" || key === "id") continue;
      if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) out.add(`${section}.${key}`);
    }
  }
  return out;
}

export function useLab() {
  const [state, setState] = useState<LabState>(() => loadState());
  const [baseline, setBaseline] = useState<LabState>(() => structuredClone(state));
  const [specimens, setSpecimens] = useState<SavedSpecimen[]>(() => loadSpecimens());
  const [prefs, setPrefs] = useState<UIPrefs>(() => loadPrefs());
  const history = useRef<LabState[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // Persistencia
  useEffect(() => {
    saveState(state);
  }, [state]);
  useEffect(() => {
    saveSpecimens(specimens);
  }, [specimens]);
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // Derivados memorizados (funciones puras → determinista)
  const viability = useMemo(() => calcularViabilidad(state), [state]);
  const radiation = useMemo(() => computeRadiation(state), [state]);
  const modified = useMemo(() => diffModified(state, baseline), [state, baseline]);

  const pushHistory = useCallback((snap: LabState) => {
    history.current.push(structuredClone(snap));
    if (history.current.length > MAX_HISTORY) history.current.shift();
    setCanUndo(history.current.length > 0);
  }, []);

  // Setters por sección
  const setStellar = useCallback((patch: Partial<StellarSystem>) => {
    setState((s) => ({ ...s, stellar: { ...s.stellar, ...patch } }));
  }, []);
  const setEnvironment = useCallback((patch: Partial<PlanetEnvironment>) => {
    setState((s) => ({ ...s, environment: { ...s.environment, ...patch } }));
  }, []);
  const setChemistry = useCallback((patch: Partial<BioChemistry>) => {
    setState((s) => ({ ...s, chemistry: { ...s.chemistry, ...patch } }));
  }, []);
  const setOrganism = useCallback((patch: Partial<Organism>) => {
    setState((s) => ({ ...s, organism: { ...s.organism, ...patch } }));
  }, []);
  const setRadiation = useCallback((patch: Partial<RadiationProfile>) => {
    setState((s) => ({ ...s, radiation: { ...s.radiation, ...patch } }));
  }, []);

  const replaceState = useCallback(
    (next: LabState, newBaseline = true) => {
      setState(next);
      if (newBaseline) setBaseline(structuredClone(next));
    },
    [],
  );

  const regenerateName = useCallback((seed?: number) => {
    setState((s) => {
      const newSeed = seed ?? randomSeed();
      return {
        ...s,
        organism: {
          ...s.organism,
          seed: newSeed,
          commonName: generarNombreComun(newSeed, s.organism.metabolism),
          scientificName: generarNombreCientifico(newSeed, s.environment.habitat),
        },
      };
    });
  }, []);

  // Mutación reproducible con semilla
  const mutate = useCallback(
    (intensity: MutationIntensity, seed?: number): number => {
      const usedSeed = seed ?? randomSeed();
      setState((s) => {
        pushHistory(s);
        const { organism } = mutateOrganism(s, usedSeed, intensity);
        return { ...s, organism };
      });
      return usedSeed;
    },
    [pushHistory],
  );

  const undo = useCallback(() => {
    const prev = history.current.pop();
    setCanUndo(history.current.length > 0);
    if (prev) setState(prev);
  }, []);

  const resetOrganismToBaseline = useCallback(() => {
    setState((s) => {
      pushHistory(s);
      return { ...s, organism: structuredClone(baseline.organism) };
    });
  }, [baseline, pushHistory]);

  const resetExperiment = useCallback(() => {
    const d = defaultState();
    history.current = [];
    setCanUndo(false);
    replaceState(d);
    setPrefs((p) => ({ ...p, activeTab: "estelar" }));
  }, [replaceState]);

  const clearLocalData = useCallback(() => {
    clearAllData();
    const list = loadSpecimens();
    setSpecimens(list);
    resetExperiment();
  }, [resetExperiment]);

  // Colección
  const saveCurrent = useCallback(
    (name: string, description: string) => {
      const now = Date.now();
      const spec: SavedSpecimen = {
        id: `spec-${now.toString(36)}`,
        name: name.trim() || state.organism.commonName,
        description: description.trim(),
        createdAt: now,
        updatedAt: now,
        state: structuredClone(state),
      };
      setSpecimens((list) => [spec, ...list]);
      setBaseline(structuredClone(state));
      return spec.id;
    },
    [state],
  );

  const loadSpecimen = useCallback((id: string) => {
    setSpecimens((list) => {
      const found = list.find((x) => x.id === id);
      if (found) {
        const clone = structuredClone(found.state);
        history.current = [];
        setCanUndo(false);
        setState(clone);
        setBaseline(structuredClone(clone));
      }
      return list;
    });
  }, []);

  const duplicateSpecimen = useCallback((id: string) => {
    setSpecimens((list) => {
      const found = list.find((x) => x.id === id);
      if (!found) return list;
      const now = Date.now();
      const copy: SavedSpecimen = {
        ...structuredClone(found),
        id: `spec-${now.toString(36)}`,
        name: `${found.name} (copia)`,
        createdAt: now,
        updatedAt: now,
      };
      return [copy, ...list];
    });
  }, []);

  const deleteSpecimen = useCallback((id: string) => {
    setSpecimens((list) => list.filter((x) => x.id !== id));
  }, []);

  const resetCatalog = useCallback(() => {
    setSpecimens(resetSpecimens());
  }, []);

  // Preferencias UI
  const setActiveTab = useCallback((activeTab: string) => setPrefs((p) => ({ ...p, activeTab })), []);
  const toggleAnimations = useCallback(() => setPrefs((p) => ({ ...p, animations: !p.animations })), []);

  // Evolución
  const runEvo = useCallback((params: EvolutionParams): EvolutionResult => runEvolution(state, params), [state]);
  const adoptEvolvedOrganism = useCallback((organism: Organism) => {
    setState((s) => {
      pushHistory(s);
      return { ...s, organism };
    });
  }, [pushHistory]);

  return {
    state,
    baseline,
    modified,
    viability,
    radiation,
    specimens,
    prefs,
    canUndo,
    setStellar,
    setEnvironment,
    setChemistry,
    setOrganism,
    setRadiation,
    replaceState,
    regenerateName,
    mutate,
    undo,
    resetOrganismToBaseline,
    resetExperiment,
    clearLocalData,
    saveCurrent,
    loadSpecimen,
    duplicateSpecimen,
    deleteSpecimen,
    resetCatalog,
    setActiveTab,
    toggleAnimations,
    runEvo,
    adoptEvolvedOrganism,
  };
}

export type Lab = ReturnType<typeof useLab>;
