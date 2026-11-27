import { useSyncExternalStore } from 'react';
import { liveStore } from './live-store';
import { getPrefs, setPrefs } from './prefs';

/**
 * Alarma de zona: suena (sirena de dos tonos) mientras haya algún avión dentro del radio.
 * "Silenciar" la calla para los aviones que ya están dentro; si entra uno nuevo, vuelve a sonar.
 * El sonido se genera con WebAudio: no necesita archivos ni internet.
 */
export interface AlarmState {
  enabled: boolean;
  ringing: boolean;
  /** Aviones dentro del radio ahora mismo. */
  inZone: number;
}

const CYCLE_MS = 1000;

let state: AlarmState = { enabled: getPrefs().sound, ringing: false, inZone: 0 };
const listeners = new Set<() => void>();
let inZone: string[] = [];
const silenced = new Set<string>();
let ctx: AudioContext | null = null;
let timer: number | undefined;
let started = false;

function setState(next: AlarmState): void {
  if (next.enabled === state.enabled && next.ringing === state.ringing && next.inZone === state.inZone) return;
  state = next;
  for (const l of listeners) l();
}

/** Los navegadores solo permiten audio tras una interacción del usuario. */
function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // sin WebAudio
  }
}

function tone(ac: AudioContext, freq: number, start: number, dur: number): void {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
  gain.gain.setValueAtTime(0.22, start + dur - 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Un ciclo de sirena alto-bajo (~1 s). */
function siren(): void {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  tone(ctx, 1050, t, 0.45);
  tone(ctx, 780, t + 0.5, 0.45);
}

function evaluate(): void {
  const ringing = state.enabled && inZone.some((hex) => !silenced.has(hex));
  if (ringing && timer === undefined) {
    siren();
    timer = window.setInterval(siren, CYCLE_MS);
  } else if (!ringing && timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
  setState({ enabled: state.enabled, ringing, inZone: inZone.length });
}

function onSnapshot(): void {
  const snap = liveStore.getState().snapshot;
  if (!snap) return;
  const next: string[] = [];
  for (const a of snap.aircraft) if (a.inRange) next.push(a.hex);
  inZone = next;
  // Un avión que sale olvida su silencio: si vuelve a entrar, sonará otra vez.
  const current = new Set(next);
  for (const hex of silenced) if (!current.has(hex)) silenced.delete(hex);
  evaluate();
}

export function startAlarm(): void {
  if (started) return;
  started = true;
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio, { passive: true });
  liveStore.subscribe(onSnapshot);
}

export function setAlarmEnabled(enabled: boolean): void {
  if (enabled) unlockAudio();
  setPrefs({ sound: enabled });
  state = { ...state, enabled };
  evaluate();
  for (const l of listeners) l();
}

export function silenceAlarm(): void {
  for (const hex of inZone) silenced.add(hex);
  evaluate();
}

export function useAlarm(): AlarmState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
  );
}
