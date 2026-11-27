import type { AircraftUpdate, LatLon, PositionSource } from '@adsb/shared/types';

/**
 * Subconjunto del formato aircraft.json de readsb / dump1090-fa.
 * Ref: https://github.com/wiedehopf/readsb/blob/dev/README-json.md
 * Las claves se omiten cuando no hay dato.
 */
interface ReadsbAircraft {
  hex?: string;
  type?: string;
  flight?: string;
  r?: string;
  t?: string;
  alt_baro?: number | 'ground';
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  category?: string;
  lat?: number;
  lon?: number;
  seen_pos?: number;
  seen?: number;
  rssi?: number;
}

/** Formato antiguo de dump1090 (MalcolmRobb / forks de Windows): data.json es un array. */
interface LegacyDump1090Aircraft {
  hex?: string;
  flight?: string;
  squawk?: string;
  lat?: number;
  lon?: number;
  validposition?: number;
  altitude?: number;
  vert_rate?: number;
  track?: number;
  validtrack?: number;
  speed?: number;
  seen?: number;
}

const HEX_TILDE = /^~/;

function mapType(type: string | undefined): PositionSource {
  if (!type) return 'other';
  if (type.startsWith('adsb') || type.startsWith('adsr')) return 'adsb';
  if (type === 'mlat') return 'mlat';
  if (type.startsWith('tisb')) return 'tisb';
  if (type === 'mode_s') return 'mode_s';
  return 'other';
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function cleanFlight(flight: string | undefined): string | undefined {
  const f = flight?.trim();
  return f ? f : undefined;
}

export function parseReadsbAircraft(a: ReadsbAircraft, now: number): AircraftUpdate | null {
  if (!a.hex) return null;
  const hasPos = isNum(a.lat) && isNum(a.lon);
  const seenPos = isNum(a.seen_pos) ? a.seen_pos : 0;
  return {
    // "~" marca direcciones no-ICAO (TIS-B); se conserva sin el prefijo para la URL.
    hex: a.hex.toLowerCase().replace(HEX_TILDE, 'tisb-'),
    flight: cleanFlight(a.flight),
    registration: a.r,
    typeCode: a.t,
    category: a.category,
    squawk: a.squawk,
    emergency: a.emergency && a.emergency !== 'none' ? a.emergency : undefined,
    altBaroFt: isNum(a.alt_baro) ? a.alt_baro : undefined,
    altGeomFt: isNum(a.alt_geom) ? a.alt_geom : undefined,
    onGround: a.alt_baro === 'ground' ? true : isNum(a.alt_baro) ? false : undefined,
    groundSpeedKt: isNum(a.gs) ? a.gs : undefined,
    trackDeg: isNum(a.track) ? a.track : undefined,
    verticalRateFpm: isNum(a.baro_rate) ? a.baro_rate : isNum(a.geom_rate) ? a.geom_rate : undefined,
    rssi: isNum(a.rssi) ? a.rssi : undefined,
    source: mapType(a.type),
    lat: hasPos ? a.lat : undefined,
    lon: hasPos ? a.lon : undefined,
    lastPos: hasPos ? now - seenPos * 1000 : undefined,
    lastSeen: now - (isNum(a.seen) ? a.seen : 0) * 1000,
  };
}

function parseLegacy(a: LegacyDump1090Aircraft, now: number): AircraftUpdate | null {
  if (!a.hex) return null;
  const hasPos = a.validposition !== 0 && isNum(a.lat) && isNum(a.lon) && !(a.lat === 0 && a.lon === 0);
  const lastSeen = now - (isNum(a.seen) ? a.seen : 0) * 1000;
  return {
    hex: a.hex.toLowerCase(),
    flight: cleanFlight(a.flight),
    squawk: a.squawk && a.squawk !== '0000' ? a.squawk : undefined,
    altBaroFt: isNum(a.altitude) ? a.altitude : undefined,
    groundSpeedKt: isNum(a.speed) ? a.speed : undefined,
    trackDeg: a.validtrack !== 0 && isNum(a.track) ? a.track : undefined,
    verticalRateFpm: isNum(a.vert_rate) ? a.vert_rate : undefined,
    lat: hasPos ? a.lat : undefined,
    lon: hasPos ? a.lon : undefined,
    lastPos: hasPos ? lastSeen : undefined,
    lastSeen,
    source: 'adsb',
  };
}

const AIRCRAFT_JSON = /aircraft\.json(\?.*)?$/;

/** receiver.json vive junto a aircraft.json en readsb / dump1090-fa / tar1090. */
export function receiverJsonUrl(aircraftUrl: string): string | null {
  return AIRCRAFT_JSON.test(aircraftUrl) ? aircraftUrl.replace(AIRCRAFT_JSON, 'receiver.json') : null;
}

/** Extrae la posición del receptor de receiver.json (solo existe si el decodificador la conoce). */
export function parseReceiverJson(body: unknown): LatLon | null {
  if (!body || typeof body !== 'object') return null;
  const { lat, lon } = body as { lat?: unknown; lon?: unknown };
  if (!isNum(lat) || !isNum(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { lat, lon };
}

/** Acepta aircraft.json (readsb/dump1090-fa/tar1090) o data.json (dump1090 antiguo). */
export function parseAircraftJson(body: unknown, now: number): AircraftUpdate[] {
  if (Array.isArray(body)) {
    return body.flatMap((a: LegacyDump1090Aircraft) => parseLegacy(a, now) ?? []);
  }
  if (body && typeof body === 'object' && Array.isArray((body as { aircraft?: unknown }).aircraft)) {
    const list = (body as { aircraft: ReadsbAircraft[] }).aircraft;
    return list.flatMap((a) => parseReadsbAircraft(a, now) ?? []);
  }
  throw new Error('Respuesta JSON no reconocida (se esperaba { aircraft: [...] } o un array)');
}
