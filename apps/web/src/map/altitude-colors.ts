/** Escala de color por altitud (pies). Tonos vivos para que resalten sobre el mapa oscuro. */
export const ALTITUDE_STOPS: readonly (readonly [number, string])[] = [
  [0, '#fb923c'],
  [2000, '#facc15'],
  [6000, '#a3e635'],
  [10000, '#4ade80'],
  [20000, '#22d3ee'],
  [30000, '#818cf8'],
  [40000, '#e879f9'],
];

export const GROUND_COLOR = '#9ca3af';
export const EMERGENCY_COLOR = '#ef4444';
export const ACCENT = '#60a5fa';
