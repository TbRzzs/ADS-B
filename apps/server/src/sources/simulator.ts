import { KT_TO_KMH } from '@adsb/shared/constants';
import { bearingDeg, destination, distanceKm } from '@adsb/shared/geo';
import type { AircraftUpdate, LatLon, SourceStatus } from '@adsb/shared/types';
import type { AircraftSource, PushUpdates } from './source';

const AIRLINES = ['AVA', 'LAN', 'CMP', 'AAL', 'IBE', 'UAL', 'DAL', 'KLM', 'AFR', 'JBU', 'VIV', 'ARE'];
const TYPES = ['A320', 'A20N', 'B738', 'B38M', 'A319', 'B788', 'E190', 'AT76', 'A332', 'C208'];
const SPAWN_KM = 55;
const DESPAWN_KM = 70;
const TICK_MS = 1000;

interface SimPlane {
  hex: string;
  flight: string;
  typeCode: string;
  lat: number;
  lon: number;
  trackDeg: number;
  gsKt: number;
  altFt: number;
  vrFpm: number;
  squawk: string;
}

/**
 * Genera tráfico ficticio alrededor del receptor para desarrollar sin antena.
 * Algunos aviones cruzan muy cerca (< 3 km) para poder probar todos los radios.
 */
export class SimulatorSource implements AircraftSource {
  readonly kind = 'simulator' as const;
  private planes: SimPlane[] = [];
  private timer: NodeJS.Timeout | undefined;
  private readonly st: SourceStatus;

  constructor(
    private readonly getReceiver: () => LatLon,
    private readonly count: number,
    private readonly random: () => number = Math.random,
  ) {
    this.st = { kind: this.kind, target: 'simulador', connected: true, messages: 0 };
  }

  start(push: PushUpdates): void {
    const rx = this.getReceiver();
    // Arranque: aviones repartidos por todo el área (no solo en el borde).
    this.planes = Array.from({ length: this.count }, () => this.spawn(rx, this.random() * SPAWN_KM));
    let last = Date.now();
    const step = () => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      push(this.advance(dt, now));
      this.st.messages++;
      this.st.lastDataAt = now;
    };
    step();
    this.timer = setInterval(step, TICK_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  status(): SourceStatus {
    return { ...this.st };
  }

  private advance(dtS: number, now: number): AircraftUpdate[] {
    const rx = this.getReceiver();
    const out: AircraftUpdate[] = [];
    for (let i = 0; i < this.planes.length; i++) {
      let p = this.planes[i]!;
      const km = ((p.gsKt * KT_TO_KMH) / 3600) * dtS;
      const [lon, lat] = destination(p.lat, p.lon, p.trackDeg, km);
      p.lat = lat;
      p.lon = lon;
      p.altFt = Math.max(0, Math.min(41000, p.altFt + (p.vrFpm / 60) * dtS));
      if (p.altFt <= 1000 && p.vrFpm < 0) p.vrFpm = 0;
      // Ligera deriva de rumbo para que las trayectorias no sean perfectamente rectas.
      p.trackDeg = (p.trackDeg + (this.random() - 0.5) * 0.6 + 360) % 360;

      if (distanceKm(rx.lat, rx.lon, p.lat, p.lon) > DESPAWN_KM) {
        p = this.spawn(rx, SPAWN_KM);
        this.planes[i] = p;
      }

      // Simula recepción imperfecta: ~8 % de los ciclos sin mensaje.
      if (this.random() < 0.08) continue;
      out.push({
        hex: p.hex,
        flight: p.flight,
        typeCode: p.typeCode,
        squawk: p.squawk,
        lat: round(p.lat, 5),
        lon: round(p.lon, 5),
        altBaroFt: Math.round(p.altFt / 25) * 25,
        onGround: false,
        groundSpeedKt: Math.round(p.gsKt),
        trackDeg: round(p.trackDeg, 1),
        verticalRateFpm: Math.round(p.vrFpm / 64) * 64,
        rssi: round(-30 + this.random() * 25 - distanceKm(rx.lat, rx.lon, p.lat, p.lon) / 10, 1),
        source: 'sim',
        lastSeen: now,
        lastPos: now,
      });
    }
    return out;
  }

  private spawn(rx: LatLon, distanceKm: number): SimPlane {
    const r = this.random;
    const [lon, lat] = destination(rx.lat, rx.lon, r() * 360, distanceKm);
    // Apunta a un punto aleatorio cercano al receptor; ~25 % pasan a menos de 3 km.
    const passKm = r() < 0.25 ? r() * 3 : r() * 35;
    const [tLon, tLat] = destination(rx.lat, rx.lon, r() * 360, passKm);
    const low = r() < 0.3;
    const altFt = low ? 1500 + r() * 8000 : 15000 + r() * 24000;
    return {
      hex: Math.floor(r() * 0xffffff).toString(16).padStart(6, '0'),
      flight: `${pick(AIRLINES, r)}${Math.floor(100 + r() * 8900)}`,
      typeCode: pick(TYPES, r),
      lat,
      lon,
      trackDeg: bearingDeg(lat, lon, tLat, tLon),
      gsKt: low ? 140 + r() * 120 : 380 + r() * 120,
      altFt,
      vrFpm: low ? (r() < 0.5 ? -800 : 1200) : (r() - 0.5) * 400,
      squawk: r() < 0.01 ? '7700' : String(Math.floor(1000 + r() * 6000)).padStart(4, '0'),
    };
  }
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]!;
}

function round(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
