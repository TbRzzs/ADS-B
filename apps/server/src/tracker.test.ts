import { describe, expect, it } from 'vitest';
import { destination } from '@adsb/shared/geo';
import type { Settings } from '@adsb/shared/types';
import { Tracker } from './tracker';

const RX = { lat: 4.7, lon: -74.1 };

function setup(radiusKm = 5) {
  const settings: Settings = { receiver: RX, receiverSource: 'manual', radiusKm };
  const tracker = new Tracker(() => settings, { timeoutS: 60, positionStaleS: 30 });
  return { settings, tracker };
}

function at(km: number, bearing = 0) {
  const [lon, lat] = destination(RX.lat, RX.lon, bearing, km);
  return { lat, lon };
}

describe('Tracker', () => {
  it('calcula distancia y marcación', () => {
    const { tracker } = setup();
    tracker.apply([{ hex: 'aaa111', ...at(10, 90) }], 1000);
    const [a] = tracker.list();
    expect(a?.distanceKm).toBeCloseTo(10, 6);
    expect(a?.bearingDeg).toBeCloseTo(90, 2);
  });

  it('emite enter/exit al cruzar el radio', () => {
    const { tracker } = setup(5);
    tracker.apply([{ hex: 'aaa111', ...at(8) }], 1000);
    tracker.tick(1000);
    expect(tracker.takeNewEvents()).toEqual([]);

    tracker.apply([{ hex: 'aaa111', ...at(4) }], 2000);
    tracker.tick(2000);
    const enter = tracker.takeNewEvents();
    expect(enter).toHaveLength(1);
    expect(enter[0]?.kind).toBe('enter');
    expect(tracker.stats().inRange).toBe(1);

    tracker.apply([{ hex: 'aaa111', ...at(6) }], 3000);
    tracker.tick(3000);
    expect(tracker.takeNewEvents().map((e) => e.kind)).toEqual(['exit']);
  });

  it('cambiar el radio reclasifica en el siguiente tick', () => {
    const { settings, tracker } = setup(30);
    tracker.apply([{ hex: 'aaa111', ...at(12) }], 1000);
    tracker.tick(1000);
    expect(tracker.stats().inRange).toBe(1);
    settings.radiusKm = 8;
    tracker.tick(1500);
    expect(tracker.stats().inRange).toBe(0);
  });

  it('una posición obsoleta saca al avión del radio y el timeout lo elimina', () => {
    const { tracker } = setup(5);
    tracker.apply([{ hex: 'aaa111', ...at(2) }], 0);
    tracker.tick(0);
    tracker.apply([{ hex: 'aaa111', squawk: '1200' }], 20_000); // mensaje sin posición
    tracker.tick(31_000);
    expect(tracker.list()[0]?.inRange).toBe(false);
    tracker.tick(81_000);
    expect(tracker.list()).toHaveLength(0);
  });

  it('los campos ausentes no sobrescriben y la estela se acumula', () => {
    const { tracker } = setup();
    tracker.apply([{ hex: 'aaa111', flight: 'AVA1', ...at(10) }], 0);
    tracker.apply([{ hex: 'aaa111', ...at(9) }], 3000);
    tracker.apply([{ hex: 'aaa111', ...at(8) }], 6000);
    const d = tracker.detail('AAA111');
    expect(d?.aircraft.flight).toBe('AVA1');
    expect(d?.trail).toHaveLength(3);
  });
});
