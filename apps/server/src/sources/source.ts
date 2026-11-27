import type { AircraftUpdate, LatLon, SourceKind, SourceStatus } from '@adsb/shared/types';

export type PushUpdates = (updates: AircraftUpdate[]) => void;

export interface SourceHooks {
  /** La fuente conoce la posición de la antena (p. ej. readsb receiver.json). */
  receiver?: (position: LatLon) => void;
}

/** Una fuente de datos ADS-B (decodificador real o simulador). */
export interface AircraftSource {
  readonly kind: SourceKind;
  start(push: PushUpdates, hooks?: SourceHooks): void;
  stop(): Promise<void> | void;
  status(): SourceStatus;
}

export interface SourceLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    return cause instanceof Error ? `${err.message}: ${cause.message}` : err.message;
  }
  return String(err);
}
