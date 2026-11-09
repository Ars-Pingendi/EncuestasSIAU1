// Ecualizador: preajustes, preajustes propios y un ajuste recordado por cada salida de audio.
import { api } from '../api';
import { engine } from '../audio/engine';
import { BUILT_IN_PRESETS, type EqParams, type Preset } from '../audio/presets';
import { createStore, debounce } from '../lib/store';
import { toast } from './ui';

export interface EqProfile extends EqParams {
  preset: string | null;
}

export interface OutputDevice {
  id: string;
  label: string;
}

export interface EqState extends EqProfile {
  custom: Preset[];
  perDevice: boolean;
  profiles: Record<string, EqProfile>;
  /** Salida elegida: 'default' = la predeterminada de Windows. */
  sinkId: string;
  devices: OutputDevice[];
  /** Nombre de la salida que está sonando (clave del perfil). */
  deviceName: string;
}

const FLAT: EqProfile = { enabled: true, preset: 'Plano', bands: Array(10).fill(0), bass: 0, width: 0, loudness: 0 };

export const eq = createStore<EqState>({
  ...FLAT,
  custom: [],
  perDevice: true,
  profiles: {},
  sinkId: 'default',
  devices: [],
  deviceName: '',
});

interface Saved {
  current: EqProfile;
  custom: Preset[];
  perDevice: boolean;
  profiles: Record<string, EqProfile>;
  sinkId: string;
}

const persist = debounce(() => {
  const s = eq.get();
  const saved: Saved = { current: profileOf(s), custom: s.custom, perDevice: s.perDevice, profiles: s.profiles, sinkId: s.sinkId };
  void api.storeSet('ecualizador', saved);
}, 400);

function profileOf(s: EqProfile): EqProfile {
  return { enabled: s.enabled, preset: s.preset, bands: [...s.bands], bass: s.bass, width: s.width, loudness: s.loudness };
}

function push() {
  engine.setEq(eq.get());
}

/** Cambia el ajuste activo y, si corresponde, lo guarda en el perfil de la salida actual. */
export function updateEq(patch: Partial<EqProfile>) {
  eq.set((s) => {
    const next = { ...s, ...patch };
    const profiles = s.perDevice && s.deviceName ? { ...s.profiles, [s.deviceName]: profileOf(next) } : s.profiles;
    return { ...patch, profiles };
  });
  push();
  persist();
}

export function setBand(i: number, db: number) {
  const bands = [...eq.get().bands];
  bands[i] = Math.round(db * 2) / 2;
  updateEq({ bands, preset: null });
}

export function allPresets(): Preset[] {
  return [...BUILT_IN_PRESETS, ...eq.get().custom];
}

export function applyPreset(name: string) {
  const p = allPresets().find((x) => x.name === name);
  if (p) updateEq({ bands: [...p.bands], preset: p.name, enabled: true });
}

export function saveCustomPreset(raw: string) {
  let name = raw.trim();
  if (!name) return;
  if (BUILT_IN_PRESETS.some((p) => p.name.toLowerCase() === name.toLowerCase())) name = `${name} (mío)`;
  const bands = [...eq.get().bands];
  eq.set((s) => ({ custom: [...s.custom.filter((p) => p.name.toLowerCase() !== name.toLowerCase()), { name, bands }] }));
  updateEq({ preset: name });
  toast(`Preajuste «${name}» guardado`);
}

export function deleteCustomPreset(name: string) {
  eq.set((s) => ({ custom: s.custom.filter((p) => p.name !== name), preset: s.preset === name ? null : s.preset }));
  persist();
}

export function resetEq() {
  updateEq({ ...FLAT, enabled: eq.get().enabled });
}

export function setPerDevice(on: boolean) {
  eq.set((s) => ({ perDevice: on, profiles: on && s.deviceName ? { ...s.profiles, [s.deviceName]: profileOf(s) } : s.profiles }));
  persist();
}

// ── Salidas de audio ──

function cleanLabel(label: string): string {
  return label.replace(/^(Predeterminado|Default|Comunicaciones|Communications)\s*-\s*/i, '').trim();
}

async function readDevices(): Promise<OutputDevice[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications')
      .map((d) => ({ id: d.deviceId, label: d.label || (d.deviceId === 'default' ? 'Predeterminado del sistema' : 'Salida de audio') }));
  } catch {
    return [];
  }
}

function nameFor(devices: OutputDevice[], sinkId: string): string {
  const d = devices.find((x) => x.id === sinkId) ?? devices.find((x) => x.id === 'default');
  return d ? cleanLabel(d.label) : '';
}

/** Recalcula la salida actual; si cambió y hay un perfil guardado para ella, lo aplica. */
async function refreshDevices(announce: boolean) {
  const devices = await readDevices();
  const s = eq.get();
  let sinkId = s.sinkId;
  if (sinkId !== 'default' && !devices.some((d) => d.id === sinkId)) sinkId = 'default';
  const deviceName = nameFor(devices, sinkId);
  const changed = deviceName !== s.deviceName;
  eq.set({ devices, sinkId, deviceName });
  if (sinkId !== s.sinkId) void engine.setSink(sinkId);
  if (!changed || !deviceName) return;
  if (s.perDevice) {
    const saved = eq.get().profiles[deviceName];
    if (saved) {
      eq.set({ ...saved, bands: [...saved.bands] });
      push();
      if (announce) toast(`Ecualizador: ajuste de «${deviceName}»`);
    } else {
      eq.set((st) => ({ profiles: { ...st.profiles, [deviceName]: profileOf(st) } }));
    }
    persist();
  }
}

export async function selectOutput(sinkId: string) {
  eq.set({ sinkId });
  await engine.setSink(sinkId);
  await refreshDevices(true);
  persist();
}

export async function initEq() {
  const saved = await api.storeGet<Saved>('ecualizador');
  if (saved) {
    eq.set({
      ...FLAT,
      ...saved.current,
      bands: saved.current?.bands?.length === 10 ? saved.current.bands : FLAT.bands,
      custom: saved.custom ?? [],
      perDevice: saved.perDevice ?? true,
      profiles: saved.profiles ?? {},
      sinkId: saved.sinkId ?? 'default',
    });
  }
  push();
  await engine.setSink(eq.get().sinkId);
  await refreshDevices(false);
  navigator.mediaDevices?.addEventListener?.('devicechange', () => void refreshDevices(true));
}
