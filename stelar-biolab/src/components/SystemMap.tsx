import type { StellarSystem } from "../types";
import { clamp } from "../engine/util";

function starColor(s: StellarSystem): string {
  switch (s.type) {
    case "enana_roja":
      return "#ff6b4a";
    case "caliente_luminosa":
      return "#bcd4ff";
    case "habitat_artificial":
      return "#7fe0ff";
    case "tipo_solar":
      return "#ffd36b";
    default:
      return "#ffd36b";
  }
}

export function SystemMap({ stellar, animate }: { stellar: StellarSystem; animate: boolean }) {
  const cx = 150;
  const cy = 110;
  const col = starColor(stellar);
  // Radio de órbita en el lienzo (acotado para que siempre sea visible).
  const orbitR = clamp(30 + stellar.orbitalDistance * 22, 34, 120);
  const starR = clamp(8 + stellar.luminosityRelative * 2.2, 6, 28);
  const errante = stellar.type === "errante";
  const binaria = stellar.type.startsWith("binaria") || stellar.type === "multiple";
  const artificial = stellar.type === "habitat_artificial";

  // Posición del planeta sobre la órbita (excentricidad desplaza el centro).
  const ecc = clamp(stellar.eccentricity, 0, 0.9);
  const planetX = cx + orbitR * (1 - ecc * 0.4);
  const planetY = cy;

  return (
    <svg viewBox="0 0 300 220" className="system-map" role="img" aria-label="Mapa esquemático del sistema estelar seleccionado.">
      <rect width="300" height="220" fill="#06060c" rx="10" />
      {Array.from({ length: 26 }).map((_, i) => (
        <circle key={i} cx={(i * 53) % 300} cy={(i * 97) % 220} r={((i % 3) + 1) * 0.5} fill="#6b7a99" opacity={0.5} />
      ))}

      {!errante && !artificial && (
        <>
          <ellipse cx={cx} cy={cy} rx={orbitR} ry={orbitR * 0.55} fill="none" stroke="#3a4a66" strokeDasharray="3 4" />
          <circle cx={cx} cy={cy} r={starR + 10} fill={col} opacity={0.18}>
            {animate && <animate attributeName="r" values={`${starR + 8};${starR + 14};${starR + 8}`} dur="4s" repeatCount="indefinite" />}
          </circle>
          {binaria ? (
            <>
              <circle cx={cx - 7} cy={cy} r={starR * 0.7} fill={col} />
              <circle cx={cx + 7} cy={cy} r={starR * 0.55} fill="#ffb199" />
            </>
          ) : (
            <circle cx={cx} cy={cy} r={starR} fill={col} />
          )}
        </>
      )}

      {artificial && (
        <>
          <circle cx={cx} cy={cy} r={26} fill="none" stroke="#7fe0ff" strokeWidth={3} opacity={0.8}>
            {animate && <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="18s" repeatCount="indefinite" />}
          </circle>
          <rect x={cx - 4} y={cy - 30} width={8} height={60} fill="#9af0ff" opacity={0.6} />
          <rect x={cx - 30} y={cy - 4} width={60} height={8} fill="#9af0ff" opacity={0.6} />
          <text x={cx} y={cy + 56} textAnchor="middle" fill="#7fe0ff" fontSize="10" className="mono">
            Hábitat artificial
          </text>
        </>
      )}

      {errante ? (
        <>
          <circle cx={cx} cy={cy} r={16} fill="#2b3550" stroke="#4a5a7a" />
          <circle cx={cx - 5} cy={cy - 4} r={5} fill="#1b2238" />
          <text x={cx} y={cy + 40} textAnchor="middle" fill="#8893aa" fontSize="10" className="mono">
            Planeta errante
          </text>
        </>
      ) : (
        <g className={animate ? "orbit-spin" : ""} style={{ transformOrigin: `${cx}px ${cy}px` }}>
          <circle cx={planetX} cy={planetY} r={9} fill="#5aa0e0" stroke="#bcd8ff" strokeWidth={1} />
          <circle cx={planetX - 3} cy={planetY - 3} r={3} fill="#bfe0ff" opacity={0.6} />
        </g>
      )}

      <text x="10" y="210" fill="#6b7a99" fontSize="9" className="mono">
        {stellar.spectralClass} · {stellar.orbitalDistance} UA · e={stellar.eccentricity}
      </text>
    </svg>
  );
}
