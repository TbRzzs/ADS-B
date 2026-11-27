import { describe, expect, it } from 'vitest';
import { parseAircraftJson } from './readsb-parse';
import { parseSbsLine } from './sbs-parse';

const NOW = 1_700_000_000_000;

describe('parseSbsLine', () => {
  it('MSG,3 (posición + altitud)', () => {
    const u = parseSbsLine(
      'MSG,3,1,1,4CA2D6,1,2024/01/01,12:00:00.000,2024/01/01,12:00:00.000,,37000,,,51.50000,-0.10000,,,0,0,0,0',
      NOW,
    );
    expect(u).toMatchObject({
      hex: '4ca2d6',
      altBaroFt: 37000,
      lat: 51.5,
      lon: -0.1,
      lastPos: NOW,
      onGround: false,
    });
  });

  it('MSG,1 (callsign) recorta espacios y no inventa posición', () => {
    const u = parseSbsLine('MSG,1,1,1,A1B2C3,1,2024/01/01,12:00:00.000,2024/01/01,12:00:00.000,AVA123  ,,,,,,,,,,,', NOW);
    expect(u?.flight).toBe('AVA123');
    expect(u?.lat).toBeUndefined();
  });

  it('MSG,4 (velocidad, rumbo, régimen vertical)', () => {
    const u = parseSbsLine('MSG,4,1,1,A1B2C3,1,,,,,,,450,270.5,,,-1024,,,,,0', NOW);
    expect(u).toMatchObject({ groundSpeedKt: 450, trackDeg: 270.5, verticalRateFpm: -1024 });
  });

  it('marca en tierra con -1 y emergencia', () => {
    const u = parseSbsLine('MSG,6,1,1,A1B2C3,1,,,,,,,,,,,,7700,0,-1,0,-1', NOW);
    expect(u).toMatchObject({ squawk: '7700', emergency: 'general', onGround: true });
  });

  it('ignora líneas que no son MSG', () => {
    expect(parseSbsLine('STA,,5,179,400AE7,10103,2008/11/28,14:58:51.153', NOW)).toBeNull();
    expect(parseSbsLine('', NOW)).toBeNull();
  });
});

describe('parseAircraftJson', () => {
  it('formato readsb / dump1090-fa', () => {
    const body = {
      now: NOW / 1000,
      messages: 1,
      aircraft: [
        {
          hex: 'A1B2C3',
          type: 'adsb_icao',
          flight: 'LAN501  ',
          alt_baro: 12000,
          gs: 320.4,
          track: 90,
          baro_rate: -640,
          lat: 4.8,
          lon: -74.0,
          seen_pos: 1.5,
          seen: 0.4,
          rssi: -12.3,
          emergency: 'none',
        },
        { hex: '~123abc', type: 'tisb_other', alt_baro: 'ground', seen: 3 },
        { type: 'mode_s' },
      ],
    };
    const out = parseAircraftJson(body, NOW);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      hex: 'a1b2c3',
      flight: 'LAN501',
      altBaroFt: 12000,
      onGround: false,
      lat: 4.8,
      lon: -74,
      lastPos: NOW - 1500,
      lastSeen: NOW - 400,
      source: 'adsb',
      emergency: undefined,
    });
    expect(out[1]).toMatchObject({ hex: 'tisb-123abc', onGround: true, source: 'tisb' });
    expect(out[1]?.lat).toBeUndefined();
  });

  it('formato antiguo dump1090 (array)', () => {
    const out = parseAircraftJson(
      [
        { hex: 'abc123', flight: 'IBE6', lat: 40, lon: -3, validposition: 1, altitude: 5000, speed: 200, seen: 2 },
        { hex: 'def456', lat: 0, lon: 0, validposition: 0, altitude: 0, seen: 1 },
      ],
      NOW,
    );
    expect(out[0]).toMatchObject({ hex: 'abc123', lat: 40, lon: -3, altBaroFt: 5000, groundSpeedKt: 200 });
    expect(out[1]?.lat).toBeUndefined();
  });

  it('rechaza formatos desconocidos', () => {
    expect(() => parseAircraftJson({ foo: 1 }, NOW)).toThrow();
  });
});
