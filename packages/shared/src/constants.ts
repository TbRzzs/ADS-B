/** Radios de detección preconfigurados (km). */
export const RADIUS_PRESETS_KM = [3, 5, 8, 15, 20, 30] as const;

export const MIN_RADIUS_KM = 0.5;
/** Un receptor ADS-B típico llega a 150–400 km con línea de vista. */
export const MAX_RADIUS_KM = 400;
export const DEFAULT_RADIUS_KM = 15;

/** Squawks de emergencia: secuestro, fallo de radio, emergencia general. */
export const EMERGENCY_SQUAWKS: ReadonlySet<string> = new Set(['7500', '7600', '7700']);

export const FT_TO_M = 0.3048;
export const KT_TO_KMH = 1.852;
