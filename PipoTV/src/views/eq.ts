// Ecualizador con el control remoto: ▲▼ sobre una banda cambia su nivel; ◀▶ sobre un efecto lo ajusta.
import { BAND_LABELS, MAX_DB, preampDb, responseDb } from '../presets';
import { h, icon } from '../dom';
import { setKeyOwner, type Dir } from '../nav';
import { allPresets, applyEq, applyPreset, eq, saveCustomPreset, setBand } from '../state';
import type { View } from '../ui';

export function equalizerView(): View {
  const toggle = h('button', { class: 'btn', focus: true, 'data-key': 'eq-toggle', onclick: () => ((eq.enabled = !eq.enabled), applyEq()) });
  const presets = h('div', { class: 'chips', 'data-group': 'presets' });
  const curve = h('canvas', { class: 'eq-curve', width: 1400, height: 220 }) as HTMLCanvasElement;
  const bands = h('div', { class: 'bands', 'data-group': 'bands' });
  const effects = h('div', { class: 'effects', 'data-group': 'effects' });
  const info = h('div', { class: 'eq-info' });

  const bandEls: { fill: HTMLElement; value: HTMLElement }[] = [];
  for (let i = 0; i < 10; i++) {
    const fill = h('div', { class: 'band-fill' });
    const value = h('div', { class: 'band-value' });
    const col = h('div', { class: 'band', focus: true, 'data-owner': '', 'data-key': `band-${i}` }, value, h('div', { class: 'band-track' }, h('div', { class: 'band-zero' }), fill), h('div', { class: 'band-label' }, BAND_LABELS[i]));
    setKeyOwner(col, {
      handleKey(dir: Dir) {
        if (dir === 'up' || dir === 'down') {
          setBand(i, eq.bands[i] + (dir === 'up' ? 1 : -1));
          return true;
        }
        return false;
      },
    });
    bandEls.push({ fill, value });
    bands.appendChild(col);
  }

  const effectDefs: { key: 'bass' | 'width' | 'loudness'; label: string }[] = [
    { key: 'bass', label: 'Refuerzo de graves' },
    { key: 'width', label: 'Sonido envolvente' },
    { key: 'loudness', label: 'Amplificación de volumen' },
  ];
  const effectEls: { fill: HTMLElement; value: HTMLElement }[] = [];
  for (const d of effectDefs) {
    const fill = h('div', { class: 'fx-fill' });
    const value = h('span', { class: 'fx-value' });
    const row = h('div', { class: 'fx', focus: true, 'data-owner': '', 'data-key': `fx-${d.key}` }, h('div', { class: 'fx-head' }, h('span', null, d.label), value), h('div', { class: 'fx-track' }, fill));
    setKeyOwner(row, {
      handleKey(dir: Dir) {
        if (dir === 'left' || dir === 'right') {
          eq[d.key] = Math.max(0, Math.min(100, eq[d.key] + (dir === 'right' ? 5 : -5)));
          applyEq();
          return true;
        }
        return false;
      },
    });
    effectEls.push({ fill, value });
    effects.appendChild(row);
  }

  const renderPresets = () => {
    while (presets.firstChild) presets.removeChild(presets.firstChild);
    for (const p of allPresets()) {
      presets.appendChild(
        h('div', { class: `chip${eq.preset === p.name ? ' on' : ''}`, focus: true, 'data-key': `preset-${p.name}`, onclick: () => applyPreset(p.name) }, eq.preset === p.name ? icon('check', 26) : null, p.name),
      );
    }
    presets.appendChild(h('div', { class: 'chip outline', focus: true, 'data-key': 'preset-save', onclick: () => saveCustomPreset() }, 'Guardar ajuste'));
    presets.appendChild(
      h('div', { class: 'chip outline', focus: true, 'data-key': 'preset-reset', onclick: () => applyPreset('Plano') }, 'Restablecer'),
    );
  };

  let lastPreset: string | null | undefined;
  let lastCustom = -1;
  const update = () => {
    toggle.textContent = eq.enabled ? 'Ecualizador: activado' : 'Ecualizador: desactivado';
    toggle.classList.toggle('primary', eq.enabled);
    if (eq.preset !== lastPreset || eq.custom.length !== lastCustom) {
      const focused = document.activeElement?.getAttribute('data-key');
      lastPreset = eq.preset;
      lastCustom = eq.custom.length;
      renderPresets();
      if (focused && focused.startsWith('preset-')) {
        const again = presets.querySelector<HTMLElement>(`[data-key="${focused}"]`);
        if (again) again.focus();
      }
    }
    for (let i = 0; i < 10; i++) {
      const v = eq.bands[i];
      const pct = (Math.abs(v) / MAX_DB) * 50;
      const f = bandEls[i].fill;
      f.style.height = `${pct}%`;
      f.style.bottom = v >= 0 ? '50%' : `${50 - pct}%`;
      bandEls[i].value.textContent = v > 0 ? `+${v}` : String(v);
    }
    effectDefs.forEach((d, k) => {
      effectEls[k].fill.style.width = `${eq[d.key]}%`;
      effectEls[k].value.textContent = `${eq[d.key]} %`;
    });
    info.textContent = `Reducción automática de ganancia ${preampDb(eq).toFixed(1)} dB · limitador activo · ▲▼ cambia la banda · ◀▶ ajusta los efectos`;
    drawCurve();
  };

  const drawCurve = () => {
    const ctx = curve.getContext('2d');
    if (!ctx) return;
    const w = curve.width, ht = curve.height, range = 15;
    ctx.clearRect(0, 0, w, ht);
    const y = (db: number) => ht / 2 - (Math.max(-range, Math.min(range, db)) / range) * (ht / 2 - 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    [-12, -6, 6, 12].forEach((db) => {
      ctx.beginPath();
      ctx.moveTo(0, y(db));
      ctx.lineTo(w, y(db));
      ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(0, y(0));
    ctx.lineTo(w, y(0));
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const f = 20 * Math.pow(1000, i / 160);
      const px = (w * i) / 160;
      const py = y(responseDb(eq, f));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = eq.enabled ? '#bba9ff' : '#777';
    ctx.lineWidth = 4;
    ctx.stroke();
  };

  update();
  const el = h(
    'div',
    { class: 'view scroll eq-view' },
    h('div', { class: 'view-head small' }, h('h1', null, 'Ecualizador'), h('div', { class: 'actions', 'data-group': 'eq-top' }, toggle)),
    presets,
    curve,
    bands,
    info,
    effects,
  );
  return { el, update, focus: () => toggle.focus() };
}
