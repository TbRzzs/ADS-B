/** Origen de la posición/mensaje según el decodificador. */
export type PositionSource = 'adsb' | 'mlat' | 'tisb' | 'mode_s' | 'other';

export interface LatLon {
  lat: number;
  lon: number;
}

/** Avión normalizado (independiente de la fuente: readsb o SBS). */
export interface Aircraft {
  /** Dirección ICAO de 24 bits en hex minúsculas (p. ej. "a1b2c3"). */
  hex: string;
  /** Indicativo / callsign (p. ej. "AVA123"). */
  flight?: string;
  /** Matrícula (solo si el decodificador tiene base de datos). */
  registration?: string;
  /** Tipo ICAO (p. ej. "A320"), solo con base de datos. */
  typeCode?: string;
  /** Categoría ADS-B (A1..A7, B1.., etc.). */
  category?: string;
  squawk?: string;
  emergency?: string;
  lat?: number;
  lon?: number;
  /** Altitud barométrica en pies. */
  altBaroFt?: number;
  /** Altitud geométrica (GNSS) en pies. */
  altGeomFt?: number;
  onGround?: boolean;
  /** Velocidad sobre el suelo en nudos. */
  groundSpeedKt?: number;
  /** Rumbo verdadero en grados. */
  trackDeg?: number;
  /** Régimen vertical en pies/minuto. */
  verticalRateFpm?: number;
  /** Intensidad de señal en dBFS. */
  rssi?: number;
  source?: PositionSource;
  /** Epoch ms del último mensaje recibido. */
  lastSeen: number;
  /** Epoch ms de la última posición recibida. */
  lastPos?: number;
  /** Distancia al receptor (km); solo si hay posición. */
  distanceKm?: number;
  /** Marcación desde el receptor (grados, 0 = norte). */
  bearingDeg?: number;
  /** Dentro del radio de detección configurado (con posición vigente). */
  inRange: boolean;
}

/** Actualización parcial que producen las fuentes. Los campos ausentes no sobrescriben. */
export type AircraftUpdate = Partial<
  Omit<Aircraft, 'hex' | 'distanceKm' | 'bearingDeg' | 'inRange'>
> & { hex: string };

export interface TrailPoint {
  lat: number;
  lon: number;
  altFt?: number;
  t: number;
}

export type RangeEventKind = 'enter' | 'exit';

/** Evento de entrada/salida del radio de detección. */
export interface RangeEvent {
  id: number;
  kind: RangeEventKind;
  hex: string;
  flight?: string;
  distanceKm?: number;
  altFt?: number;
  at: number;
}

/**
 * De dónde salió la posición del receptor. Prioridad (mayor gana):
 *   manual > decoder > device > default
 * Una fuente automática nunca pisa a una de mayor prioridad.
 */
export type ReceiverSource = 'default' | 'device' | 'decoder' | 'manual';

export const RECEIVER_SOURCE_PRIORITY: Readonly<Record<ReceiverSource, number>> = {
  default: 0,
  device: 1,
  decoder: 2,
  manual: 3,
};

export interface Settings {
  receiver: LatLon;
  receiverSource: ReceiverSource;
  radiusKm: number;
}

export interface SettingsPatch {
  receiver?: LatLon;
  /**
   * Origen de `receiver`: "manual" (por defecto) o "device" (geolocalización del navegador).
   * "auto" descarta la posición manual y vuelve a la detección automática.
   */
  receiverSource?: 'manual' | 'device' | 'auto';
  radiusKm?: number;
}

export type SourceKind = 'readsb' | 'sbs';

export interface SourceStatus {
  kind: SourceKind;
  /** Descripción del destino (URL o host:puerto). */
  target: string;
  connected: boolean;
  lastDataAt?: number;
  /** Lecturas/mensajes procesados desde el arranque. */
  messages: number;
  error?: string;
}

export interface LiveStats {
  tracked: number;
  withPosition: number;
  inRange: number;
}

export interface LiveSnapshot {
  now: number;
  settings: Settings;
  source: SourceStatus;
  stats: LiveStats;
  aircraft: Aircraft[];
  /** Eventos ocurridos desde el snapshot anterior. */
  newEvents: RangeEvent[];
}

export type ServerMessage =
  | { type: 'snapshot'; data: LiveSnapshot }
  | { type: 'events'; data: RangeEvent[] };

export interface MapStatus {
  /** Existe data/map/region.pmtiles (mapa base vectorial offline). */
  basemap: boolean;
  /** Existen las fuentes tipográficas (etiquetas). */
  glyphs: boolean;
  /** Sprite de iconos disponible ("dark" preferido), o null si no hay. */
  sprite: 'light' | 'dark' | null;
}

export interface AircraftDetail {
  aircraft: Aircraft;
  trail: TrailPoint[];
}

export interface AircraftListResponse {
  now: number;
  receiver: LatLon;
  radiusKm: number;
  count: number;
  aircraft: Aircraft[];
}
