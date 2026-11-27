import type { Aircraft } from '@adsb/shared/types';
import {
  compassPoint,
  displayName,
  formatAgo,
  formatAltitude,
  formatDegrees,
  formatDistance,
  formatSpeed,
  formatVerticalRate,
  isEmergency,
} from '../lib/format';
import { IconClose } from './icons';

interface Props {
  hex: string;
  aircraft: Aircraft | undefined;
  now: number;
  onClose: () => void;
}

/** Ficha compacta del avión seleccionado, flotando sobre el mapa. */
export function AircraftCard({ hex, aircraft: a, now, onClose }: Props) {
  return (
    <section className="card" aria-label="Avión seleccionado">
      <header>
        <div>
          <h2>{a ? displayName(a) : hex.toUpperCase()}</h2>
          <p>
            {hex.toUpperCase()}
            {a?.typeCode ? ` · ${a.typeCode}` : ''}
            {a?.registration ? ` · ${a.registration}` : ''}
          </p>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label="Cerrar">
          {IconClose}
        </button>
      </header>
      {a === undefined ? (
        <p className="muted">Señal perdida.</p>
      ) : (
        <>
          {isEmergency(a) ? <p className="danger">Emergencia · squawk {a.squawk}</p> : null}
          <dl>
            <dt>Altitud</dt>
            <dd>{formatAltitude(a)}</dd>
            <dt>Velocidad</dt>
            <dd>{formatSpeed(a.groundSpeedKt)}</dd>
            <dt>Vertical</dt>
            <dd>{formatVerticalRate(a.verticalRateFpm)}</dd>
            <dt>Rumbo</dt>
            <dd>{formatDegrees(a.trackDeg)}</dd>
            <dt>Distancia</dt>
            <dd>
              {formatDistance(a.distanceKm)} {compassPoint(a.bearingDeg)}
              {a.inRange ? ' · dentro del radio' : ''}
            </dd>
            <dt>Posición</dt>
            <dd>{a.lat !== undefined && a.lon !== undefined ? `${a.lat.toFixed(5)}, ${a.lon.toFixed(5)}` : '—'}</dd>
            <dt>Squawk</dt>
            <dd>{a.squawk ?? '—'}</dd>
            <dt>Último dato</dt>
            <dd>hace {formatAgo(now - a.lastSeen)}</dd>
          </dl>
        </>
      )}
    </section>
  );
}
