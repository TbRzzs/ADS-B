import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getFreshPosition, updateSettings } = vi.hoisted(() => ({
  getFreshPosition: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('./geolocation', () => ({ getFreshPosition }));
vi.mock('./api', () => ({ updateSettings }));
vi.mock('./live-store', () => ({ liveStore: { getState: () => ({ snapshot: null }) } }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  getFreshPosition.mockResolvedValue({ coords: { latitude: 6.25, longitude: -75.56, accuracy: 50 } });
  updateSettings.mockImplementation(async (patch) => ({ ...patch, radiusKm: 5 }));
});

describe('usar y guardar ubicación actual', () => {
  it('fija las coordenadas nuevas sin requerir un segundo botón Guardar', async () => {
    const { locateReceiver } = await import('./auto-locate');
    const saved = await locateReceiver();
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      receiver: { lat: 6.25, lon: -75.56 }, receiverSource: 'manual',
    });
    expect(saved.receiver).toEqual({ lat: 6.25, lon: -75.56 });
    await locateReceiver();
    expect(getFreshPosition).toHaveBeenCalledTimes(2);
  });

  it('conserva la ubicación guardada si falla la consulta', async () => {
    getFreshPosition.mockRejectedValue(new Error('Ubicación demasiado imprecisa'));
    const { locateReceiver } = await import('./auto-locate');
    await expect(locateReceiver()).rejects.toThrow('demasiado imprecisa');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('la detección de inicio conserva la prioridad de una posición fijada', async () => {
    const { locateReceiver } = await import('./auto-locate');
    await locateReceiver(false);
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      receiver: { lat: 6.25, lon: -75.56 }, receiverSource: 'device',
    });
  });
});
