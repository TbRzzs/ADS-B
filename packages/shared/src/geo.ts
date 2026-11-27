/**
 * Geodesia sobre el elipsoide WGS84 (el mismo del GPS y de ADS-B), con las fórmulas de Vincenty.
 * Precisión submilimétrica. Con una esfera (haversine) el error llega al 0,55 % cerca del ecuador:
 * unos 17 m en un radio de 3 km y unos 166 m en uno de 30 km.
 */
const A = 6378137; // semieje mayor (m)
const F = 1 / 298.257223563; // achatamiento
const B = A * (1 - F); // semieje menor (m)
const DEG = Math.PI / 180;
const EPS = 1e-12;
const MAX_ITER = 200;

/** Radio medio (IUGG), solo como respaldo si Vincenty no converge (puntos casi antípodas). */
const MEAN_RADIUS_KM = 6371.0088;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface Inverse {
  km: number;
  /** Azimut inicial en grados [0, 360). */
  azimuth: number;
}

/** Problema inverso de Vincenty: distancia y rumbo inicial entre dos puntos. */
function inverse(lat1: number, lon1: number, lat2: number, lon2: number): Inverse | null {
  const L = (lon2 - lon1) * DEG;
  const U1 = Math.atan((1 - F) * Math.tan(lat1 * DEG));
  const U2 = Math.atan((1 - F) * Math.tan(lat2 * DEG));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let λ = L;
  let sinλ = 0;
  let cosλ = 0;
  let sinσ = 0;
  let cosσ = 0;
  let σ = 0;
  let cos2α = 0;
  let cos2σm = 0;
  for (let i = 0; i < MAX_ITER; i++) {
    sinλ = Math.sin(λ);
    cosλ = Math.cos(λ);
    sinσ = Math.hypot(cosU2 * sinλ, cosU1 * sinU2 - sinU1 * cosU2 * cosλ);
    if (sinσ === 0) return { km: 0, azimuth: 0 }; // mismo punto
    cosσ = sinU1 * sinU2 + cosU1 * cosU2 * cosλ;
    σ = Math.atan2(sinσ, cosσ);
    const sinα = (cosU1 * cosU2 * sinλ) / sinσ;
    cos2α = 1 - sinα * sinα;
    cos2σm = cos2α !== 0 ? cosσ - (2 * sinU1 * sinU2) / cos2α : 0; // línea ecuatorial
    const C = (F / 16) * cos2α * (4 + F * (4 - 3 * cos2α));
    const prev = λ;
    λ = L + (1 - C) * F * sinα * (σ + C * sinσ * (cos2σm + C * cosσ * (-1 + 2 * cos2σm * cos2σm)));
    if (Math.abs(λ - prev) < EPS) {
      const u2 = (cos2α * (A * A - B * B)) / (B * B);
      const k1 = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
      const k2 = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
      const Δσ =
        k2 *
        sinσ *
        (cos2σm +
          (k2 / 4) *
            (cosσ * (-1 + 2 * cos2σm * cos2σm) -
              (k2 / 6) * cos2σm * (-3 + 4 * sinσ * sinσ) * (-3 + 4 * cos2σm * cos2σm)));
      const metres = B * k1 * (σ - Δσ);
      const α1 = Math.atan2(cosU2 * sinλ, cosU1 * sinU2 - sinU1 * cosU2 * cosλ);
      return { km: metres / 1000, azimuth: (α1 / DEG + 360) % 360 };
    }
  }
  return null; // no convergió (casi antípodas)
}

/** Distancia geodésica en km sobre WGS84. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return inverse(lat1, lon1, lat2, lon2)?.km ?? haversineKm(lat1, lon1, lat2, lon2);
}

/** Rumbo inicial de 1 → 2 en grados [0, 360), sobre WGS84. */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const inv = inverse(lat1, lon1, lat2, lon2);
  if (inv) return inv.azimuth;
  const φ1 = lat1 * DEG;
  const φ2 = lat2 * DEG;
  const Δλ = (lon2 - lon1) * DEG;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/** Problema directo de Vincenty: punto a `distanceKm` con rumbo `bearing`. Devuelve [lon, lat]. */
export function destination(
  lat: number,
  lon: number,
  bearing: number,
  distanceKm: number,
): [number, number] {
  const s = distanceKm * 1000;
  const α1 = bearing * DEG;
  const sinα1 = Math.sin(α1);
  const cosα1 = Math.cos(α1);
  const tanU1 = (1 - F) * Math.tan(lat * DEG);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const σ1 = Math.atan2(tanU1, cosα1);
  const sinα = cosU1 * sinα1;
  const cos2α = 1 - sinα * sinα;
  const u2 = (cos2α * (A * A - B * B)) / (B * B);
  const k1 = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const k2 = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));

  let σ = s / (B * k1);
  let sinσ = 0;
  let cosσ = 0;
  let cos2σm = 0;
  for (let i = 0; i < MAX_ITER; i++) {
    cos2σm = Math.cos(2 * σ1 + σ);
    sinσ = Math.sin(σ);
    cosσ = Math.cos(σ);
    const Δσ =
      k2 *
      sinσ *
      (cos2σm +
        (k2 / 4) *
          (cosσ * (-1 + 2 * cos2σm * cos2σm) -
            (k2 / 6) * cos2σm * (-3 + 4 * sinσ * sinσ) * (-3 + 4 * cos2σm * cos2σm)));
    const prev = σ;
    σ = s / (B * k1) + Δσ;
    if (Math.abs(σ - prev) < EPS) break;
  }
  sinσ = Math.sin(σ);
  cosσ = Math.cos(σ);
  cos2σm = Math.cos(2 * σ1 + σ);

  const x = sinU1 * sinσ - cosU1 * cosσ * cosα1;
  const φ2 = Math.atan2(sinU1 * cosσ + cosU1 * sinσ * cosα1, (1 - F) * Math.hypot(sinα, x));
  const λ = Math.atan2(sinσ * sinα1, cosU1 * cosσ - sinU1 * sinσ * cosα1);
  const C = (F / 16) * cos2α * (4 + F * (4 - 3 * cos2α));
  const L = λ - (1 - C) * F * sinα * (σ + C * sinσ * (cos2σm + C * cosσ * (-1 + 2 * cos2σm * cos2σm)));
  const lonOut = (((lon * DEG + L) / DEG + 540) % 360) - 180;
  return [lonOut, φ2 / DEG];
}

/** Anillo cerrado (GeoJSON, [lon, lat]) que representa un círculo geodésico exacto. */
export function circleRing(
  lat: number,
  lon: number,
  radiusKm: number,
  steps = 128,
): [number, number][] {
  const ring: [number, number][] = new Array(steps + 1);
  for (let i = 0; i < steps; i++) {
    ring[i] = destination(lat, lon, (i * 360) / steps, radiusKm);
  }
  ring[steps] = ring[0]!;
  return ring;
}

/** Caja envolvente [minLon, minLat, maxLon, maxLat] de un círculo. */
export function bboxAround(
  lat: number,
  lon: number,
  radiusKm: number,
): [number, number, number, number] {
  const [, north] = destination(lat, lon, 0, radiusKm);
  const [east] = destination(lat, lon, 90, radiusKm);
  const [, south] = destination(lat, lon, 180, radiusKm);
  const [west] = destination(lat, lon, 270, radiusKm);
  return [west, south, east, north];
}
