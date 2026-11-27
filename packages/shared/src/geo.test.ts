import { describe, expect, it } from 'vitest';
import { bboxAround, bearingDeg, circleRing, destination, distanceKm } from './geo';

const dms = (d: number, m: number, s: number) => Math.sign(d) * (Math.abs(d) + m / 60 + s / 3600);

describe('geo: valores de referencia externos (WGS84)', () => {
  // Ejemplo publicado por Geoscience Australia: Flinders Peak → Buninyong.
  // s = 54 972,271 m; azimut inicial = 306° 52' 05,37".
  const lat1 = -dms(37, 57, 3.7203);
  const lon1 = dms(144, 25, 29.5244);
  const lat2 = -dms(37, 39, 10.1561);
  const lon2 = dms(143, 55, 35.3839);

  it('distancia Flinders Peak → Buninyong (error < 1 mm)', () => {
    expect(Math.abs(distanceKm(lat1, lon1, lat2, lon2) * 1000 - 54972.271)).toBeLessThan(0.001);
  });

  it('azimut inicial Flinders Peak → Buninyong', () => {
    expect(bearingDeg(lat1, lon1, lat2, lon2)).toBeCloseTo(dms(306, 52, 5.37), 4);
  });

  it('problema directo devuelve Buninyong (error < 1 mm)', () => {
    const [lon, lat] = destination(lat1, lon1, dms(306, 52, 5.37), 54.972271);
    expect(distanceKm(lat, lon, lat2, lon2) * 1000).toBeLessThan(0.001);
  });

  it('1° de latitud en el ecuador = 110,574 km; 1° de longitud = 111,320 km', () => {
    expect(distanceKm(0, 0, 1, 0)).toBeCloseTo(110.574, 2);
    expect(distanceKm(0, 0, 0, 1)).toBeCloseTo(111.32, 2);
  });
});

describe('geo', () => {
  it('Bogotá → Medellín ≈ 240 km', () => {
    const d = distanceKm(4.711, -74.0721, 6.2442, -75.5812);
    expect(d).toBeGreaterThan(235);
    expect(d).toBeLessThan(245);
  });

  it('mismo punto = 0', () => {
    expect(distanceKm(10, 20, 10, 20)).toBe(0);
  });

  it('bearing: hacia el norte = 0°, hacia el este ≈ 90°', () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5);
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5);
  });

  it('destination es inversa de distancia/rumbo', () => {
    for (const km of [3, 5, 8, 15, 20, 30]) {
      const [lon, lat] = destination(4.7, -74.1, 45, km);
      expect(distanceKm(4.7, -74.1, lat, lon)).toBeCloseTo(km, 6);
      expect(bearingDeg(4.7, -74.1, lat, lon)).toBeCloseTo(45, 3);
    }
  });

  it('circleRing está cerrado y todos los puntos a la distancia dada', () => {
    const ring = circleRing(40, -3, 15, 64);
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
    for (const [lon, lat] of ring) expect(distanceKm(40, -3, lat, lon)).toBeCloseTo(15, 6);
  });

  it('bboxAround contiene el centro', () => {
    const [w, s, e, n] = bboxAround(4.7, -74.1, 30);
    expect(w).toBeLessThan(-74.1);
    expect(e).toBeGreaterThan(-74.1);
    expect(s).toBeLessThan(4.7);
    expect(n).toBeGreaterThan(4.7);
  });
});
