import { bearingDeg, distanceKm } from '@adsb/shared/geo';
import type {
  Aircraft,
  AircraftDetail,
  AircraftUpdate,
  LiveStats,
  RangeEvent,
  RangeEventKind,
  Settings,
  TrailPoint,
} from '@adsb/shared/types';

export interface TrackerOptions {
  /** Segundos sin mensajes para olvidar un avión. */
  timeoutS: number;
  /** Segundos sin posición nueva para considerar la posición obsoleta. */
  positionStaleS: number;
  /** Puntos máximos de estela por avión. */
  trailMax?: number;
  /** Eventos que se conservan en memoria. */
  eventsMax?: number;
}

interface Track {
  ac: Aircraft;
  trail: TrailPoint[];
}

/** Intervalo mínimo entre puntos de la estela. */
const TRAIL_MIN_INTERVAL_MS = 2000;

/**
 * Estado de todos los aviones conocidos. Fusiona actualizaciones parciales de cualquier
 * fuente, calcula distancia/marcación al receptor y genera eventos de entrada/salida del radio.
 */
export class Tracker {
  private readonly tracks = new Map<string, Track>();
  private readonly recent: RangeEvent[] = [];
  private pending: RangeEvent[] = [];
  private nextEventId = 1;
  private readonly trailMax: number;
  private readonly eventsMax: number;

  constructor(
    private readonly getSettings: () => Settings,
    private readonly opts: TrackerOptions,
  ) {
    this.trailMax = opts.trailMax ?? 300;
    this.eventsMax = opts.eventsMax ?? 500;
  }

  apply(updates: readonly AircraftUpdate[], now = Date.now()): void {
    const { receiver } = this.getSettings();
    for (const u of updates) {
      let track = this.tracks.get(u.hex);
      if (!track) {
        track = { ac: { hex: u.hex, lastSeen: u.lastSeen ?? now, inRange: false }, trail: [] };
        this.tracks.set(u.hex, track);
      }
      const { ac } = track;
      const prevLat = ac.lat;
      const prevLon = ac.lon;
      assignDefined(ac, u);
      if (u.lastSeen === undefined) ac.lastSeen = now;

      if (ac.lat === undefined || ac.lon === undefined) continue;
      const moved = ac.lat !== prevLat || ac.lon !== prevLon;
      if (!moved) continue;

      if (u.lastPos === undefined) ac.lastPos = now;
      ac.distanceKm = distanceKm(receiver.lat, receiver.lon, ac.lat, ac.lon);
      ac.bearingDeg = bearingDeg(receiver.lat, receiver.lon, ac.lat, ac.lon);
      this.pushTrail(track, ac.lastPos ?? now);
    }
  }

  /**
   * Debe llamarse periódicamente: elimina aviones caducados y reevalúa quién está
   * dentro del radio, emitiendo eventos.
   */
  tick(now = Date.now()): void {
    const { radiusKm } = this.getSettings();
    const timeoutMs = this.opts.timeoutS * 1000;
    const staleMs = this.opts.positionStaleS * 1000;

    for (const [hex, track] of this.tracks) {
      const { ac } = track;
      if (now - ac.lastSeen > timeoutMs) {
        if (ac.inRange) this.emit('exit', ac, now);
        this.tracks.delete(hex);
        continue;
      }
      const fresh = ac.lastPos !== undefined && now - ac.lastPos <= staleMs;
      const inRange = fresh && ac.distanceKm !== undefined && ac.distanceKm <= radiusKm;
      if (inRange !== ac.inRange) {
        ac.inRange = inRange;
        this.emit(inRange ? 'enter' : 'exit', ac, now);
      }
    }
  }

  /** Recalcula distancias tras cambiar la posición del receptor. */
  recomputeGeometry(): void {
    const { receiver } = this.getSettings();
    for (const { ac } of this.tracks.values()) {
      if (ac.lat === undefined || ac.lon === undefined) continue;
      ac.distanceKm = distanceKm(receiver.lat, receiver.lon, ac.lat, ac.lon);
      ac.bearingDeg = bearingDeg(receiver.lat, receiver.lon, ac.lat, ac.lon);
    }
  }

  list(): Aircraft[] {
    return Array.from(this.tracks.values(), (t) => t.ac);
  }

  stats(): LiveStats {
    let withPosition = 0;
    let inRange = 0;
    for (const { ac } of this.tracks.values()) {
      if (ac.distanceKm !== undefined) withPosition++;
      if (ac.inRange) inRange++;
    }
    return { tracked: this.tracks.size, withPosition, inRange };
  }

  detail(hex: string): AircraftDetail | undefined {
    const track = this.tracks.get(hex.toLowerCase());
    return track ? { aircraft: track.ac, trail: track.trail } : undefined;
  }

  /** Devuelve y vacía los eventos generados desde la última llamada. */
  takeNewEvents(): RangeEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  recentEvents(limit = 50): RangeEvent[] {
    return this.recent.slice(-limit).reverse();
  }

  private emit(kind: RangeEventKind, ac: Aircraft, now: number): void {
    const event: RangeEvent = {
      id: this.nextEventId++,
      kind,
      hex: ac.hex,
      flight: ac.flight,
      distanceKm: ac.distanceKm,
      altFt: ac.altBaroFt ?? ac.altGeomFt,
      at: now,
    };
    this.pending.push(event);
    this.recent.push(event);
    if (this.recent.length > this.eventsMax) this.recent.splice(0, this.recent.length - this.eventsMax);
  }

  private pushTrail(track: Track, t: number): void {
    const { ac, trail } = track;
    const last = trail.at(-1);
    if (last && t - last.t < TRAIL_MIN_INTERVAL_MS) return;
    trail.push({ lat: ac.lat!, lon: ac.lon!, altFt: ac.altBaroFt ?? ac.altGeomFt, t });
    if (trail.length > this.trailMax) trail.shift();
  }
}

function assignDefined(target: Aircraft, update: AircraftUpdate): void {
  const t = target as unknown as Record<string, unknown>;
  for (const key in update) {
    const value = (update as Record<string, unknown>)[key];
    if (value !== undefined) t[key] = value;
  }
}
