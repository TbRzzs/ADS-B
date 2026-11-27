import type { AircraftUpdate } from '@adsb/shared/types';

/**
 * Parser de una línea SBS-1 / BaseStation (puerto 30003 de dump1090/readsb).
 *
 *   MSG,3,1,1,4CA2D6,1,2024/01/01,12:00:00.000,2024/01/01,12:00:00.000,,37000,,,51.5,-0.1,,,0,0,0,0
 *
 * Campos (índice): 1 tipo de transmisión, 4 hex ICAO, 10 callsign, 11 altitud (ft),
 * 12 velocidad suelo (kt), 13 rumbo, 14 lat, 15 lon, 16 régimen vertical (ft/min),
 * 17 squawk, 18 alerta, 19 emergencia, 20 SPI, 21 en tierra.
 */
export function parseSbsLine(line: string, now: number): AircraftUpdate | null {
  if (!line.startsWith('MSG,')) return null;
  const f = line.split(',');
  const hex = f[4]?.trim().toLowerCase();
  if (!hex || f.length < 11) return null;

  const update: AircraftUpdate = { hex, lastSeen: now, source: 'adsb' };

  const flight = f[10]?.trim();
  if (flight) update.flight = flight;

  const alt = num(f[11]);
  if (alt !== undefined) update.altBaroFt = alt;

  const gs = num(f[12]);
  if (gs !== undefined) update.groundSpeedKt = gs;

  const track = num(f[13]);
  if (track !== undefined) update.trackDeg = track;

  const lat = num(f[14]);
  const lon = num(f[15]);
  if (lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0)) {
    update.lat = lat;
    update.lon = lon;
    update.lastPos = now;
  }

  const vr = num(f[16]);
  if (vr !== undefined) update.verticalRateFpm = vr;

  const squawk = f[17]?.trim();
  if (squawk) update.squawk = squawk;

  if (flag(f[19])) update.emergency = 'general';

  const ground = f[21]?.trim();
  if (ground) update.onGround = flag(ground);

  return update;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const s = v.trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** SBS usa "-1" (algunas implementaciones "1") para verdadero y "0" para falso. */
function flag(v: string | undefined): boolean {
  const s = v?.trim();
  return s === '-1' || s === '1';
}
