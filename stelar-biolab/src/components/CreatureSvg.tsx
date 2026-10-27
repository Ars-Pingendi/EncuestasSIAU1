import { useMemo } from "react";
import type { LabState, Metabolism, BodyCovering } from "../types";
import { SeededRng } from "../engine/rng";
import { usableLight } from "../engine/environmentModel";
import { clamp } from "../engine/util";

interface Palette {
  base: string;
  dark: string;
  accent: string;
  glow: string;
}

function metabolismColors(m: Metabolism, seed: number): Palette {
  switch (m) {
    case "azufre":
      return { base: "#d9a13b", dark: "#8a5a12", accent: "#f4d35e", glow: "#ffe08a" };
    case "fototrofia_ir":
      return { base: "#8e1b4a", dark: "#4a0c27", accent: "#d6246e", glow: "#ff5c9d" };
    case "metanogenico":
      return { base: "#d98032", dark: "#7a3f12", accent: "#f0a35e", glow: "#ffbe7a" };
    case "electrotrofo":
      return { base: "#22a7c9", dark: "#0b4e63", accent: "#4fd6f0", glow: "#9af0ff" };
    case "quimiosintetico":
      return { base: "#2fae8f", dark: "#114d3f", accent: "#58d6b4", glow: "#9af0da" };
    case "fotosintesis":
      return { base: "#4faa4a", dark: "#1f5a1d", accent: "#86d36f", glow: "#c4f0a0" };
    case "termosintetico":
      return { base: "#b0724b", dark: "#5e3620", accent: "#e0a06a", glow: "#f5c99a" };
    case "personalizado":
    default: {
      const hue = new SeededRng(seed).int(0, 360);
      return {
        base: `hsl(${hue} 55% 52%)`,
        dark: `hsl(${hue} 55% 26%)`,
        accent: `hsl(${(hue + 40) % 360} 70% 62%)`,
        glow: `hsl(${(hue + 40) % 360} 90% 75%)`,
      };
    }
  }
}

interface CoveringStyle {
  stroke: string;
  strokeWidth: number;
  opacity: number;
  pattern: "none" | "facetas" | "rejilla" | "segmentos" | "liso";
  sheen: number;
}

function coveringStyle(c: BodyCovering): CoveringStyle {
  switch (c) {
    case "silicea":
    case "caparazon_mineral":
      return { stroke: "#1a1a22", strokeWidth: 2.5, opacity: 1, pattern: "facetas", sheen: 0.15 };
    case "reflectante_uv":
      return { stroke: "#e8f6ff", strokeWidth: 2, opacity: 0.95, pattern: "liso", sheen: 0.6 };
    case "gel_anticongelante":
      return { stroke: "#bfe9ff", strokeWidth: 1.2, opacity: 0.68, pattern: "liso", sheen: 0.4 };
    case "membrana_flexible":
      return { stroke: "#0a0a0f", strokeWidth: 1.2, opacity: 0.78, pattern: "liso", sheen: 0.25 };
    case "malla_piezoelectrica":
      return { stroke: "#9af0ff", strokeWidth: 1, opacity: 0.9, pattern: "rejilla", sheen: 0.3 };
    case "quitina":
      return { stroke: "#120d08", strokeWidth: 2.5, opacity: 1, pattern: "segmentos", sheen: 0.2 };
    case "piel_pigmentada":
    default:
      return { stroke: "#0a0a0f", strokeWidth: 1.8, opacity: 1, pattern: "none", sheen: 0.2 };
  }
}

export function CreatureSvg({ state, animate, idSuffix = "main" }: { state: LabState; animate: boolean; idSuffix?: string }) {
  const { organism: o, environment: env } = state;

  const svg = useMemo(() => {
    const rng = new SeededRng(o.seed);
    const pal = metabolismColors(o.metabolism, o.seed);
    const cov = coveringStyle(o.bodyCovering);
    const cx = 200;
    const cy = 215;
    const sizeScale = clamp(42 + Math.log10(Math.max(o.sizeMeters, 0.03) + 1) * 58, 30, 150);
    const w = sizeScale * clamp(o.bodyWidth, 0.3, 3);
    const h = sizeScale * clamp(o.bodyHeight, 0.3, 3);
    const n = clamp(o.appendageCount, 0, 24);

    // ¿Tiene bioluminiscencia funcional? No se asume por falta de luz.
    const dark = usableLight(env) < 10;
    const biolum =
      o.metabolism === "electrotrofo" ||
      o.metabolism === "fototrofia_ir" ||
      (o.sensors.includes("fotorecepcion") && dark);

    const appendages: JSX.Element[] = [];
    const extras: JSX.Element[] = [];
    let body: JSX.Element;

    const strokeProps = { stroke: cov.stroke, strokeWidth: cov.strokeWidth, strokeLinejoin: "round" as const };

    switch (o.locomotion) {
      case "filtrador_flotante": {
        // Campana flotante con tentáculos colgantes.
        body = (
          <g className={`cr-float${animate ? " cr-anim" : ""}`}>
            <ellipse cx={cx} cy={cy - h * 0.2} rx={w * 0.9} ry={h * 0.8} fill={`url(#grad-${idSuffix})`} {...strokeProps} opacity={cov.opacity} />
            <path d={`M ${cx - w * 0.9} ${cy - h * 0.2} Q ${cx} ${cy + h * 0.5} ${cx + w * 0.9} ${cy - h * 0.2}`} fill="none" stroke={pal.accent} strokeWidth={2} opacity={0.6} />
          </g>
        );
        const count = Math.max(n, 4);
        for (let i = 0; i < count; i++) {
          const t = (i / (count - 1) - 0.5) * 1.6;
          const x = cx + t * w * 0.8;
          const len = h * (1.1 + rng.float(-0.2, 0.3));
          appendages.push(
            <path key={i} className={`cr-tentacle${animate ? " cr-anim" : ""}`} style={{ animationDelay: `${i * 0.15}s` }}
              d={`M ${x} ${cy + h * 0.45} q ${rng.float(-10, 10)} ${len * 0.5} ${rng.float(-14, 14)} ${len}`}
              fill="none" stroke={pal.dark} strokeWidth={3} strokeLinecap="round" opacity={0.85} />,
          );
        }
        break;
      }
      case "propulsion_chorro": {
        // Manto con cavidad de expulsión.
        body = (
          <g className={`cr-jet${animate ? " cr-anim" : ""}`}>
            <path d={`M ${cx} ${cy - h} C ${cx + w} ${cy - h * 0.6}, ${cx + w * 0.7} ${cy + h * 0.6}, ${cx} ${cy + h}
              C ${cx - w * 0.7} ${cy + h * 0.6}, ${cx - w} ${cy - h * 0.6}, ${cx} ${cy - h} Z`}
              fill={`url(#grad-${idSuffix})`} {...strokeProps} opacity={cov.opacity} />
            <ellipse cx={cx} cy={cy + h * 0.78} rx={w * 0.32} ry={h * 0.16} fill={pal.dark} />
          </g>
        );
        const count = Math.max(n, 4);
        for (let i = 0; i < count; i++) {
          const x = cx + (i / (count - 1) - 0.5) * w * 0.9;
          appendages.push(
            <path key={i} className={`cr-tentacle${animate ? " cr-anim" : ""}`} style={{ animationDelay: `${i * 0.1}s` }}
              d={`M ${x} ${cy + h * 0.9} q ${rng.float(-8, 8)} ${h * 0.4} ${rng.float(-10, 10)} ${h * 0.8}`}
              fill="none" stroke={pal.dark} strokeWidth={2.5} strokeLinecap="round" />,
          );
        }
        break;
      }
      case "serpenteante": {
        const pts: string[] = [];
        const segs = 7;
        for (let i = 0; i <= segs; i++) {
          const yy = cy - h + (i / segs) * h * 2;
          const xx = cx + Math.sin(i * 0.9) * w * 0.7;
          pts.push(`${xx},${yy}`);
        }
        body = (
          <g className={`cr-undulate${animate ? " cr-anim" : ""}`}>
            <polyline points={pts.join(" ")} fill="none" stroke={`url(#grad-${idSuffix})`} strokeWidth={w * 0.7} strokeLinecap="round" strokeLinejoin="round" opacity={cov.opacity} />
            <polyline points={pts.join(" ")} fill="none" stroke={cov.stroke} strokeWidth={1} opacity={0.4} />
          </g>
        );
        break;
      }
      case "hexapodo_blindado":
      case "excavador": {
        const legN = o.locomotion === "excavador" ? Math.max(n, 4) : Math.max(n, 6);
        body = (
          <g className={`cr-breathe${animate ? " cr-anim" : ""}`}>
            <ellipse cx={cx} cy={cy} rx={w} ry={h * 0.7} fill={`url(#grad-${idSuffix})`} {...strokeProps} opacity={cov.opacity} />
            {o.locomotion === "excavador" && (
              <path d={`M ${cx - w} ${cy} q ${-w * 0.5} ${-h * 0.2} ${-w * 0.7} 0 q ${w * 0.2} ${h * 0.2} ${w * 0.7} 0`} fill={pal.dark} {...strokeProps} />
            )}
          </g>
        );
        for (let i = 0; i < legN; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const row = Math.floor(i / 2);
          const rows = Math.ceil(legN / 2);
          const ly = cy - h * 0.4 + (row / Math.max(rows - 1, 1)) * h * 0.8;
          appendages.push(
            <path key={i} className={`cr-leg${animate ? " cr-anim" : ""}`} style={{ animationDelay: `${i * 0.12}s`, transformOrigin: `${cx}px ${ly}px` }}
              d={`M ${cx + side * w * 0.8} ${ly} l ${side * w * 0.6} ${h * 0.25} l ${side * w * 0.3} ${h * 0.4}`}
              fill="none" stroke={pal.dark} strokeWidth={4} strokeLinecap="round" />,
          );
        }
        break;
      }
      case "planeador": {
        body = (
          <g className={`cr-float${animate ? " cr-anim" : ""}`}>
            <ellipse cx={cx} cy={cy} rx={w * 0.5} ry={h} fill={`url(#grad-${idSuffix})`} {...strokeProps} opacity={cov.opacity} />
            <path d={`M ${cx} ${cy - h * 0.3} Q ${cx - w * 2.1} ${cy - h * 0.1} ${cx - w * 0.5} ${cy + h * 0.5} Z`} fill={pal.base} {...strokeProps} opacity={0.8} />
            <path d={`M ${cx} ${cy - h * 0.3} Q ${cx + w * 2.1} ${cy - h * 0.1} ${cx + w * 0.5} ${cy + h * 0.5} Z`} fill={pal.base} {...strokeProps} opacity={0.8} />
          </g>
        );
        break;
      }
      case "nadador": {
        body = (
          <g className={`cr-undulate${animate ? " cr-anim" : ""}`}>
            <path d={`M ${cx - w} ${cy} Q ${cx} ${cy - h} ${cx + w * 0.9} ${cy} Q ${cx} ${cy + h} ${cx - w} ${cy} Z`} fill={`url(#grad-${idSuffix})`} {...strokeProps} opacity={cov.opacity} />
            <path d={`M ${cx - w} ${cy} l ${-w * 0.6} ${-h * 0.5} l 0 ${h} Z`} fill={pal.dark} {...strokeProps} />
          </g>
        );
        const fins = Math.min(Math.max(n, 2), 6);
        for (let i = 0; i < fins; i++) {
          const side = i % 2 === 0 ? -1 : 1;
          const fx = cx + (i / fins - 0.3) * w;
          appendages.push(
            <path key={i} className={`cr-fin${animate ? " cr-anim" : ""}`} style={{ animationDelay: `${i * 0.1}s` }}
              d={`M ${fx} ${cy + side * h * 0.5} q ${w * 0.2} ${side * h * 0.4} ${-w * 0.1} ${side * h * 0.7}`}
              fill={pal.base} stroke={cov.stroke} strokeWidth={1} opacity={0.75} />,
          );
        }
        break;
      }
      case "sesil": {
        body = (
          <g>
            <path d={`M ${cx - w * 0.7} ${cy + h} L ${cx - w * 0.3} ${cy - h} Q ${cx} ${cy - h * 1.3} ${cx + w * 0.3} ${cy - h} L ${cx + w * 0.7} ${cy + h} Z`}
              fill={`url(#grad-${idSuffix})`} {...strokeProps} opacity={cov.opacity} />
            <ellipse cx={cx} cy={cy + h} rx={w} ry={h * 0.18} fill={pal.dark} />
          </g>
        );
        const fronds = Math.max(n, 5);
        for (let i = 0; i < fronds; i++) {
          const t = (i / (fronds - 1) - 0.5) * 1.4;
          appendages.push(
            <path key={i} className={`cr-frond${animate ? " cr-anim" : ""}`} style={{ animationDelay: `${i * 0.2}s` }}
              d={`M ${cx + t * w * 0.4} ${cy - h} q ${t * 20} ${-h * 0.5} ${t * 30} ${-h}`}
              fill="none" stroke={pal.accent} strokeWidth={3} strokeLinecap="round" opacity={0.85} />,
          );
        }
        break;
      }
      default: {
        body = <ellipse cx={cx} cy={cy} rx={w} ry={h} fill={`url(#grad-${idSuffix})`} {...strokeProps} opacity={cov.opacity} />;
      }
    }

    // Sensores (ojos / órganos sensoriales) como pistas visuales.
    if (o.sensors.includes("fotorecepcion") || o.sensors.includes("infrarrojo")) {
      const eyes = o.sensors.includes("infrarrojo") ? "#ff6b4a" : "#eaffff";
      extras.push(<circle key="eye1" cx={cx - w * 0.3} cy={cy - h * 0.3} r={Math.max(3, w * 0.09)} fill={eyes} stroke="#000" strokeWidth={1} />);
      extras.push(<circle key="eye2" cx={cx + w * 0.3} cy={cy - h * 0.3} r={Math.max(3, w * 0.09)} fill={eyes} stroke="#000" strokeWidth={1} />);
    }
    if (o.sensors.includes("ecolocalizacion") || o.sensors.includes("electrorecepcion")) {
      extras.push(
        <g key="antennae" stroke={pal.accent} strokeWidth={2} fill="none" opacity={0.8}>
          <path d={`M ${cx - w * 0.2} ${cy - h * 0.7} q ${-10} ${-20} ${-24} ${-26}`} />
          <path d={`M ${cx + w * 0.2} ${cy - h * 0.7} q ${10} ${-20} ${24} ${-26}`} />
        </g>,
      );
    }

    if (biolum) {
      for (let i = 0; i < 5; i++) {
        const bx = cx + rng.float(-w * 0.7, w * 0.7);
        const by = cy + rng.float(-h * 0.6, h * 0.6);
        extras.push(
          <circle key={`bl${i}`} className={`cr-pulse${animate ? " cr-anim" : ""}`} style={{ animationDelay: `${i * 0.4}s` }}
            cx={bx} cy={by} r={Math.max(2.5, w * 0.06)} fill={pal.glow} />,
        );
      }
    }

    // Patrón de cubierta superpuesto.
    if (cov.pattern === "rejilla") {
      extras.push(<rect key="mesh" x={cx - w} y={cy - h} width={w * 2} height={h * 2} rx={w * 0.4} fill={`url(#mesh-${idSuffix})`} opacity={0.4} />);
    }

    return (
      <svg viewBox="0 0 400 430" role="img" aria-label={`Representación de ${o.commonName}, organismo de tipo ${o.locomotion}.`} className="creature-svg">
        <defs>
          <radialGradient id={`grad-${idSuffix}`} cx="42%" cy="38%" r="70%">
            <stop offset="0%" stopColor={pal.accent} />
            <stop offset="55%" stopColor={pal.base} />
            <stop offset="100%" stopColor={pal.dark} />
          </radialGradient>
          <pattern id={`mesh-${idSuffix}`} width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M12 0 H0 V12" fill="none" stroke={pal.glow} strokeWidth="0.6" />
          </pattern>
          <filter id={`soft-${idSuffix}`}>
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          {biolum && (
            <filter id={`glow-${idSuffix}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
          <style>{CREATURE_CSS}</style>
        </defs>
        {/* Sombra / suelo de la cámara */}
        <ellipse cx={cx} cy={395} rx={w * 1.1} ry={14} fill="#000" opacity={0.35} filter={`url(#soft-${idSuffix})`} />
        {/* Partículas del medio */}
        {env.mediumDensity > 50 &&
          Array.from({ length: 10 }).map((_, i) => (
            <circle key={`p${i}`} className={`cr-particle${animate ? " cr-anim" : ""}`} style={{ animationDelay: `${i * 0.5}s` }}
              cx={40 + rng.float(0, 320)} cy={40 + rng.float(0, 340)} r={rng.float(0.8, 2.2)} fill="#9fe8ff" opacity={0.25} />
          ))}
        <g filter={biolum ? `url(#glow-${idSuffix})` : undefined}>
          {appendages}
          {body}
          {extras}
        </g>
      </svg>
    );
    // Dependencias relevantes para recomputar el SVG.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, env, animate, idSuffix]);

  return svg;
}

const CREATURE_CSS = `
.creature-svg{width:100%;height:100%;display:block}
@keyframes cr-float-k{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes cr-breathe-k{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
@keyframes cr-undulate-k{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
@keyframes cr-jet-k{0%,100%{transform:scaleY(1)}50%{transform:scaleY(0.9) translateY(-6px)}}
@keyframes cr-tentacle-k{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes cr-leg-k{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes cr-fin-k{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@keyframes cr-frond-k{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes cr-pulse-k{0%,100%{opacity:0.25}50%{opacity:1}}
@keyframes cr-particle-k{0%{transform:translateY(0);opacity:0.05}50%{opacity:0.3}100%{transform:translateY(-26px);opacity:0.05}}
.cr-anim.cr-float{animation:cr-float-k 5s ease-in-out infinite}
.cr-anim.cr-breathe{animation:cr-breathe-k 3.5s ease-in-out infinite;transform-origin:200px 215px}
.cr-anim.cr-undulate{animation:cr-undulate-k 4s ease-in-out infinite;transform-origin:200px 215px}
.cr-anim.cr-jet{animation:cr-jet-k 2.4s ease-in-out infinite;transform-origin:200px 215px}
.cr-anim.cr-tentacle{animation:cr-tentacle-k 3s ease-in-out infinite;transform-origin:top center}
.cr-anim.cr-leg{animation:cr-leg-k 1.6s ease-in-out infinite}
.cr-anim.cr-fin{animation:cr-fin-k 1.8s ease-in-out infinite;transform-origin:center}
.cr-anim.cr-frond{animation:cr-frond-k 4.5s ease-in-out infinite;transform-origin:bottom center}
.cr-anim.cr-pulse{animation:cr-pulse-k 2.6s ease-in-out infinite}
.cr-anim.cr-particle{animation:cr-particle-k 6s linear infinite}
@media (prefers-reduced-motion: reduce){.creature-svg *{animation:none !important}}
`;
