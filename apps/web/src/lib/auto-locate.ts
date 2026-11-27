import { useSyncExternalStore } from 'react';
import { updateSettings } from './api';
import { liveStore } from './live-store';
import { getFreshPosition } from './geolocation';
import type { Settings } from '@adsb/shared/types';

export type LocateStatus =
  | { state: 'idle' }
  | { state: 'locating' }
  | { state: 'done'; accuracyM: number }
  | { state: 'failed'; reason: string };

let status: LocateStatus = { state: 'idle' };
let attempted = false;
let started = false;
let pending: Promise<Settings> | undefined;
const listeners = new Set<() => void>();

function setStatus(next: LocateStatus): void {
  status = next;
  for (const l of listeners) l();
}

/**
 * Si el servidor aún no conoce la posición de la antena (ni por el decodificador ni a mano),
 * se usa la del dispositivo una sola vez y queda guardada en el servidor.
 */
function check(): void {
  const snap = liveStore.getState().snapshot;
  if (attempted || !snap || snap.settings.receiverSource !== 'default') return;
  attempted = true;

  void locateReceiver(false).catch(() => undefined);
}

/** Una selección explícita queda fijada, igual que introducir coordenadas en Ajustes. */
export async function locateReceiver(explicit = true): Promise<Settings> {
  if (pending) return pending;
  setStatus({ state: 'locating' });
  const request = (async () => {
    try {
      const { coords } = await getFreshPosition();
      const settings = await updateSettings({
        receiver: { lat: coords.latitude, lon: coords.longitude },
        receiverSource: explicit ? 'manual' : 'device',
      });
      setStatus({ state: 'done', accuracyM: coords.accuracy });
      return settings;
    } catch (error) {
      setStatus({ state: 'failed', reason: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  })();
  pending = request;
  try {
    return await request;
  } finally {
    if (pending === request) pending = undefined;
  }
}

/** Arranque único por carga de la app. */
export function startAutoLocate(): void {
  if (started) return;
  started = true;
  liveStore.subscribe(check);
  check();
}

/** Permite un nuevo intento (p. ej. tras volver a "automático" en Ajustes). */
export function retryAutoLocate(): void {
  attempted = false;
  setStatus({ state: 'idle' });
  check();
}

export function clearLocateStatus(): void {
  setStatus({ state: 'idle' });
}

export function useLocateStatus(): LocateStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => status,
  );
}
