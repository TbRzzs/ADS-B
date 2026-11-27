import type { AircraftDetail, MapStatus, Settings, SettingsPatch } from '@adsb/shared/types';
import { getPrefs } from './prefs';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // cuerpo no JSON
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

const NO_MAP: MapStatus = { basemap: false, glyphs: false, sprite: null };

/**
 * Se inicia en cuanto se carga la app, en paralelo con la descarga del chunk del mapa
 * (evita la cascada "cargar MapLibre → luego preguntar qué mapa hay").
 */
export const mapStatusPromise: Promise<MapStatus> = request<MapStatus>('/api/map/status').catch(
  () => NO_MAP,
);

export function updateSettings(patch: SettingsPatch): Promise<Settings> {
  const token = getPrefs().apiToken;
  return request<Settings>('/api/settings', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(patch),
  });
}

export function fetchAircraftDetail(hex: string, signal?: AbortSignal): Promise<AircraftDetail> {
  return request<AircraftDetail>(`/api/aircraft/${encodeURIComponent(hex)}`, { signal });
}
