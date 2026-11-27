import { useSyncExternalStore } from 'react';
import type { LiveSnapshot, RangeEvent, ServerMessage } from '@adsb/shared/types';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export interface LiveState {
  connection: ConnectionStatus;
  snapshot: LiveSnapshot | null;
  /** Eventos de entrada/salida, más recientes primero. */
  events: RangeEvent[];
}

const MAX_EVENTS = 100;

let state: LiveState = { connection: 'connecting', snapshot: null, events: [] };
const listeners = new Set<() => void>();

function setState(patch: Partial<LiveState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function mergeEvents(incoming: readonly RangeEvent[]): RangeEvent[] {
  if (incoming.length === 0) return state.events;
  const seen = new Set(state.events.map((e) => e.id));
  const fresh = incoming.filter((e) => !seen.has(e.id)).toSorted((a, b) => b.id - a.id);
  return fresh.concat(state.events).slice(0, MAX_EVENTS);
}

function handleMessage(msg: ServerMessage): void {
  if (msg.type === 'events') {
    setState({ events: mergeEvents(msg.data) });
    return;
  }
  setState({ snapshot: msg.data, events: mergeEvents(msg.data.newEvents) });
}

let socket: WebSocket | null = null;
let retryMs = 1000;
let started = false;

function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  socket = ws;
  setState({ connection: 'connecting' });

  ws.onopen = () => {
    retryMs = 1000;
    setState({ connection: 'open' });
  };
  ws.onmessage = (ev) => {
    try {
      handleMessage(JSON.parse(ev.data as string) as ServerMessage);
    } catch {
      // mensaje corrupto: se ignora
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    setState({ connection: 'closed' });
    setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, 15_000);
  };
}

/** Abre la conexión una sola vez por carga de la app (no por montaje de componente). */
export function startLive(): void {
  if (started) return;
  started = true;
  connect();
}

export const liveStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState(): LiveState {
    return state;
  },
};

/**
 * Suscripción con selector. El selector debe devolver un valor ya existente en el estado
 * (no crear objetos nuevos) para que React pueda comparar por referencia.
 */
export function useLive<T>(selector: (s: LiveState) => T): T {
  return useSyncExternalStore(liveStore.subscribe, () => selector(state));
}
