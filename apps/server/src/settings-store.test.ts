import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Settings } from '@adsb/shared/types';
import { SettingsStore } from './settings-store';
import { parseReceiverJson, receiverJsonUrl } from './sources/readsb-parse';

const DEFAULTS: Settings = { receiver: { lat: 4.7, lon: -74.1 }, receiverSource: 'default', radiusKm: 15 };
const dirs: string[] = [];

function store() {
  const dir = mkdtempSync(join(tmpdir(), 'adsb-settings-'));
  dirs.push(dir);
  const file = join(dir, 'settings.json');
  return { s: new SettingsStore(file, DEFAULTS), file };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('SettingsStore: georreferenciación', () => {
  it('el decodificador fija la posición automáticamente', async () => {
    const { s, file } = store();
    const r = await s.setDecoderReceiver({ lat: 6.25, lon: -75.56 });
    expect(r).toMatchObject({ changed: true, receiverChanged: true });
    expect(s.get()).toMatchObject({ receiver: { lat: 6.25, lon: -75.56 }, receiverSource: 'decoder' });
    expect(JSON.parse(readFileSync(file, 'utf8')).receiverSource).toBe('decoder');
  });

  it('repetir la misma posición no reescribe nada', async () => {
    const { s } = store();
    await s.setDecoderReceiver({ lat: 6.25, lon: -75.56 });
    expect((await s.setDecoderReceiver({ lat: 6.25, lon: -75.56 })).changed).toBe(false);
  });

  it('el navegador no pisa la posición del decodificador', async () => {
    const { s } = store();
    await s.setDecoderReceiver({ lat: 6.25, lon: -75.56 });
    await s.update({ receiver: { lat: 1, lon: 1 }, receiverSource: 'device' });
    expect(s.get().receiverSource).toBe('decoder');
    expect(s.get().receiver.lat).toBe(6.25);
  });

  it('el navegador sí reemplaza la posición por defecto', async () => {
    const { s } = store();
    await s.update({ receiver: { lat: 3.45, lon: -76.53 }, receiverSource: 'device' });
    expect(s.get()).toMatchObject({ receiver: { lat: 3.45 }, receiverSource: 'device' });
  });

  it('manual gana a todo y "auto" vuelve a la del decodificador', async () => {
    const { s } = store();
    await s.setDecoderReceiver({ lat: 6.25, lon: -75.56 });
    await s.update({ receiver: { lat: 10.4, lon: -75.5 } });
    expect(s.get().receiverSource).toBe('manual');
    await s.setDecoderReceiver({ lat: 6.25, lon: -75.56 });
    expect(s.get().receiver.lat).toBe(10.4);

    await s.update({ receiverSource: 'auto' });
    expect(s.get()).toMatchObject({ receiver: { lat: 6.25 }, receiverSource: 'decoder' });
  });

  it('"auto" sin decodificador deja la posición pendiente de detectar', async () => {
    const { s } = store();
    await s.update({ receiver: { lat: 10.4, lon: -75.5 } });
    await s.update({ receiverSource: 'auto' });
    expect(s.get().receiverSource).toBe('default');
  });
});

describe('receiver.json', () => {
  it('deriva la URL desde aircraft.json', () => {
    expect(receiverJsonUrl('http://pi:8080/data/aircraft.json')).toBe('http://pi:8080/data/receiver.json');
    expect(receiverJsonUrl('http://pi/tar1090/data/aircraft.json')).toBe('http://pi/tar1090/data/receiver.json');
    expect(receiverJsonUrl('http://pi/data.json')).toBeNull();
  });

  it('solo acepta coordenadas válidas', () => {
    expect(parseReceiverJson({ version: 'x', refresh: 1000, lat: 4.7, lon: -74.1 })).toEqual({ lat: 4.7, lon: -74.1 });
    expect(parseReceiverJson({ version: 'x', refresh: 1000 })).toBeNull();
    expect(parseReceiverJson({ lat: 0, lon: 0 })).toBeNull();
    expect(parseReceiverJson(null)).toBeNull();
  });
});
