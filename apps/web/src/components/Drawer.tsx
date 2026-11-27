import { useState } from 'react';
import type { Aircraft, RangeEvent } from '@adsb/shared/types';
import { AircraftList } from './AircraftList';
import { EventLog } from './EventLog';
import { IconClose, IconList } from './icons';

interface Props {
  aircraft: readonly Aircraft[];
  events: readonly RangeEvent[];
  inZone: number;
  showOutOfRange: boolean;
  onShowOutOfRange: (v: boolean) => void;
  selectedHex: string | null;
  onSelect: (hex: string) => void;
}

type Tab = 'aircraft' | 'events';

/** Lista plegable: cerrada por defecto para que el mapa ocupe toda la pantalla. */
export function Drawer(props: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('aircraft');

  if (!open) {
    return (
      <button type="button" className="drawer-toggle" onClick={() => setOpen(true)}>
        {IconList}
        Aviones <b>{props.aircraft.length}</b>
        {props.inZone > 0 ? <span className="pill">{props.inZone} en zona</span> : null}
      </button>
    );
  }

  return (
    <aside className="drawer" aria-label="Listado">
      <header>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'aircraft'} onClick={() => setTab('aircraft')}>
            Aviones ({props.aircraft.length})
          </button>
          <button type="button" role="tab" aria-selected={tab === 'events'} onClick={() => setTab('events')}>
            Entradas/salidas
          </button>
        </div>
        <button type="button" className="icon" onClick={() => setOpen(false)} aria-label="Cerrar listado">
          {IconClose}
        </button>
      </header>
      <div className="drawer-body">
        {tab === 'aircraft' ? (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={props.showOutOfRange}
                onChange={(e) => props.onShowOutOfRange(e.currentTarget.checked)}
              />
              Mostrar también los que están fuera del radio
            </label>
            <AircraftList
              aircraft={props.aircraft}
              showOutOfRange={props.showOutOfRange}
              selectedHex={props.selectedHex}
              onSelect={props.onSelect}
            />
          </>
        ) : (
          <EventLog events={props.events} onSelect={props.onSelect} />
        )}
      </div>
    </aside>
  );
}
