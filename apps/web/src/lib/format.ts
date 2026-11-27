import { EMERGENCY_SQUAWKS, FT_TO_M, KT_TO_KMH } from '@adsb/shared/constants';
import type { Aircraft } from '@adsb/shared/types';

// Formateadores creados una sola vez (crear Intl.NumberFormat es caro).
const int = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

const DASH = '—';

export function altitudeOf(a: Pick<Aircraft, 'altBaroFt' | 'altGeomFt'>): number | undefined {
  return a.altBaroFt ?? a.altGeomFt;
}

export function formatAltitude(a: Aircraft): string {
  if (a.onGround) return 'En tierra';
  const ft = altitudeOf(a);
  return ft === undefined ? DASH : `${int.format(ft)} ft`;
}

export function formatAltitudeMeters(a: Aircraft): string {
  const ft = altitudeOf(a);
  return ft === undefined || a.onGround ? '' : `${int.format(ft * FT_TO_M)} m`;
}

export function formatSpeed(kt: number | undefined): string {
  return kt === undefined ? DASH : `${int.format(kt)} kt · ${int.format(kt * KT_TO_KMH)} km/h`;
}

export function formatSpeedShort(kt: number | undefined): string {
  return kt === undefined ? DASH : `${int.format(kt * KT_TO_KMH)} km/h`;
}

export function formatDistance(km: number | undefined): string {
  if (km === undefined) return DASH;
  return km < 10 ? `${oneDecimal.format(km)} km` : `${int.format(km)} km`;
}

export function formatVerticalRate(fpm: number | undefined): string {
  if (fpm === undefined) return DASH;
  if (Math.abs(fpm) < 64) return 'Nivelado';
  return `${fpm > 0 ? '↑' : '↓'} ${int.format(Math.abs(fpm))} ft/min`;
}

export function formatDegrees(deg: number | undefined): string {
  return deg === undefined ? DASH : `${int.format(deg)}°`;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function formatTime(epochMs: number): string {
  return time.format(epochMs);
}

export function formatNumber(n: number): string {
  return int.format(n);
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;

export function compassPoint(deg: number | undefined): string {
  return deg === undefined ? '' : COMPASS[Math.round(deg / 45) % 8]!;
}

export function displayName(a: Pick<Aircraft, 'flight' | 'hex'>): string {
  return a.flight ?? a.hex.toUpperCase();
}

export function isEmergency(a: Pick<Aircraft, 'squawk' | 'emergency'>): boolean {
  return a.emergency !== undefined || (a.squawk !== undefined && EMERGENCY_SQUAWKS.has(a.squawk));
}
