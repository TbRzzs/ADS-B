import { memo, useDeferredValue, useMemo, useState } from 'react';
import type { Aircraft } from '@adsb/shared/types';
import { displayName, formatAltitude, formatDistance, isEmergency } from '../lib/format';

interface Props {
  aircraft: readonly Aircraft[];
  showOutOfRange: boolean;
  selectedHex: string | null;
  onSelect: (hex: string) => void;
}

const byDistance = (a: Aircraft, b: Aircraft) =>
  (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);

export function AircraftList({ aircraft, showOutOfRange, selectedHex, onSelect }: Props) {
  const [query, setQuery] = useState('');
  // La escritura en el buscador se mantiene fluida aunque la lista sea grande.
  const deferredQuery = useDeferredValue(query);

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    // Un solo recorrido para todos los filtros.
    const out = aircraft.filter((a) => {
      if (!showOutOfRange && !a.inRange) return false;
      if (!q) return true;
      return (
        a.hex.includes(q) ||
        (a.flight?.toLowerCase().includes(q) ?? false) ||
        (a.registration?.toLowerCase().includes(q) ?? false) ||
        a.squawk === q
      );
    });
    return out.sort(byDistance);
  }, [aircraft, deferredQuery, showOutOfRange]);

  return (
    <>
      <input
        type="search"
        className="search"
        placeholder="Buscar vuelo, ICAO o squawk"
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      {visible.length === 0 ? (
        <p className="muted pad">{aircraft.length === 0 ? 'Sin aviones detectados.' : 'Ningún avión coincide.'}</p>
      ) : (
        <ul className="list">
          {visible.map((a) => (
            <Row key={a.hex} aircraft={a} selected={a.hex === selectedHex} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </>
  );
}

interface RowProps {
  aircraft: Aircraft;
  selected: boolean;
  onSelect: (hex: string) => void;
}

const Row = memo(function Row({ aircraft: a, selected, onSelect }: RowProps) {
  let cls = 'row';
  if (selected) cls += ' selected';
  if (!a.inRange) cls += ' out';
  return (
    <li>
      <button type="button" className={cls} onClick={() => onSelect(a.hex)}>
        <span className={isEmergency(a) ? 'name danger' : 'name'}>{displayName(a)}</span>
        <span className="num">{formatAltitude(a)}</span>
        <span className="num">{formatDistance(a.distanceKm)}</span>
      </button>
    </li>
  );
});
