import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFreshPosition } from './geolocation';

let onPosition: PositionCallback;
let onError: PositionErrorCallback;
const clearWatch = vi.fn();
const watchPosition = vi.fn((success: PositionCallback, error: PositionErrorCallback | null, _options?: PositionOptions) => {
  onPosition = success;
  onError = error!;
  return 7;
});
const position = (accuracy: number, latitude = 4.7): GeolocationPosition => ({
  coords: { latitude, longitude: -74.1, accuracy },
  timestamp: Date.now(),
} as GeolocationPosition);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('window', { isSecureContext: true, setTimeout });
  vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch } });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ubicación nueva del dispositivo', () => {
  it('pide una lectura sin caché y mejora una primera posición aproximada', async () => {
    const result = getFreshPosition();
    expect(watchPosition.mock.calls[0]?.[2]).toEqual({
      enableHighAccuracy: true, maximumAge: 0, timeout: 20_000,
    });
    onPosition(position(8000));
    expect(clearWatch).not.toHaveBeenCalled();
    onPosition(position(40, 6.25));
    expect((await result).coords.latitude).toBe(6.25);
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rechaza una ubicación con varios kilómetros de incertidumbre', async () => {
    const result = getFreshPosition();
    const rejected = expect(result).rejects.toThrow('No se cambió la posición');
    onPosition(position(12000));
    await vi.advanceTimersByTimeAsync(20_000);
    await rejected;
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('conserva la mejor lectura al agotarse el tiempo', async () => {
    const result = getFreshPosition();
    onPosition(position(600));
    onPosition(position(5000));
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await result).coords.accuracy).toBe(600);
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('explica el permiso denegado y libera la consulta', async () => {
    const result = getFreshPosition();
    const rejected = expect(result).rejects.toThrow('Permiso de ubicación denegado');
    onError({ code: 1 } as GeolocationPositionError);
    await rejected;
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    expect(vi.getTimerCount()).toBe(0);
  });
});
