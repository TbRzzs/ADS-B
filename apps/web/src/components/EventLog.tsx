import { memo } from 'react';
import type { RangeEvent } from '@adsb/shared/types';
import { formatDistance, formatTime } from '../lib/format';

interface Props {
  events: readonly RangeEvent[];
  onSelect: (hex: string) => void;
}

const VISIBLE = 40;

export const EventLog = memo(function EventLog({ events, onSelect }: Props) {
  if (events.length === 0) return <p className="muted pad">Sin entradas ni salidas todavía.</p>;
  return (
    <ul className="list">
      {events.slice(0, VISIBLE).map((e) => (
        <li key={e.id}>
          <button type="button" className="row" onClick={() => onSelect(e.hex)}>
            <span className="name">
              <span className={e.kind === 'enter' ? 'tag in' : 'tag'}>{e.kind === 'enter' ? 'Entró' : 'Salió'}</span>
              {e.flight ?? e.hex.toUpperCase()}
            </span>
            <span className="num">{formatDistance(e.distanceKm)}</span>
            <time className="num" dateTime={new Date(e.at).toISOString()}>
              {formatTime(e.at)}
            </time>
          </button>
        </li>
      ))}
    </ul>
  );
});
