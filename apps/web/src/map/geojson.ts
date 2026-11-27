import type { Feature, FeatureCollection, LineString, Point, Polygon } from 'geojson';
import { RADIUS_PRESETS_KM } from '@adsb/shared/constants';
import { circleRing, destination } from '@adsb/shared/geo';
import type { LatLon, LiveSnapshot } from '@adsb/shared/types';
import { altitudeOf, displayName, formatNumber, isEmergency } from '../lib/format';

const STALE_MS = 15_000;
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
export const EMPTY_COLLECTION = EMPTY;

export interface AircraftProps {
  hex: string;
  label: string;
  /** Altitud en pies; -1 = en tierra. */
  alt: number;
  track: number;
  inRange: boolean;
  stale: boolean;
  emergency: boolean;
}

/** Convierte el snapshot en puntos GeoJSON en un único recorrido. */
export function aircraftCollection(snap: LiveSnapshot): FeatureCollection<Point, AircraftProps> {
  const features: Feature<Point, AircraftProps>[] = [];
  const { now } = snap;
  for (const a of snap.aircraft) {
    if (a.lat === undefined || a.lon === undefined) continue;
    const alt = altitudeOf(a);
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [a.lon, a.lat] },
      properties: {
        hex: a.hex,
        label: alt === undefined || a.onGround ? displayName(a) : `${displayName(a)}\n${formatNumber(alt)} ft`,
        alt: a.onGround ? -1 : (alt ?? 0),
        track: a.trackDeg ?? 0,
        inRange: a.inRange,
        stale: a.lastPos === undefined || now - a.lastPos > STALE_MS,
        emergency: isEmergency(a),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

export interface RangeGeometry {
  rings: FeatureCollection<LineString, { km: number; active: boolean }>;
  labels: FeatureCollection<Point, { label: string; active: boolean }>;
  area: FeatureCollection<Polygon>;
  spokes: FeatureCollection<LineString>;
  receiver: FeatureCollection<Point>;
}

/** Anillos de alcance (presets + radio activo), sectores cada 30° y receptor. */
export function rangeGeometry(rx: LatLon, radiusKm: number): RangeGeometry {
  const ringKms = new Set<number>(RADIUS_PRESETS_KM);
  ringKms.add(radiusKm);
  const rings: RangeGeometry['rings']['features'] = [];
  const labels: RangeGeometry['labels']['features'] = [];
  for (const km of ringKms) {
    const active = km === radiusKm;
    rings.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: circleRing(rx.lat, rx.lon, km) },
      properties: { km, active },
    });
    labels.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: destination(rx.lat, rx.lon, 0, km) },
      properties: { label: `${km} km`, active },
    });
  }

  const outer = Math.max(radiusKm, RADIUS_PRESETS_KM.at(-1)!);
  const spokes: Feature<LineString>[] = [];
  for (let deg = 0; deg < 360; deg += 30) {
    spokes.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [rx.lon, rx.lat],
          destination(rx.lat, rx.lon, deg, outer),
        ],
      },
      properties: {},
    });
  }

  return {
    rings: { type: 'FeatureCollection', features: rings },
    labels: { type: 'FeatureCollection', features: labels },
    area: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [circleRing(rx.lat, rx.lon, radiusKm)] },
          properties: {},
        },
      ],
    },
    spokes: { type: 'FeatureCollection', features: spokes },
    receiver: {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [rx.lon, rx.lat] }, properties: {} }],
    },
  };
}

export function lineCollection(coords: [number, number][]): FeatureCollection<LineString> {
  if (coords.length < 2) return EMPTY as FeatureCollection<LineString>;
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }],
  };
}
