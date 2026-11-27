import { lazy, Suspense, useCallback, useRef, useState } from 'react';
import { DEFAULT_RADIUS_KM } from '@adsb/shared/constants';
import type { Aircraft, LiveSnapshot, ReceiverSource } from '@adsb/shared/types';
import { AircraftCard } from './components/AircraftCard';
import { Drawer } from './components/Drawer';
import { IconBell, IconBellOff, IconCamera, IconCenter, IconRecenter } from './components/icons';
import { RadiusPicker } from './components/RadiusPicker';
import { SettingsButton } from './components/SettingsDialog';
import { setAlarmEnabled, silenceAlarm, useAlarm } from './lib/alarm';
import { updateSettings } from './lib/api';
import { BRAND } from './lib/brand';
import { locateReceiver, useLocateStatus } from './lib/auto-locate';
import { formatAccuracy } from './lib/geolocation';
import { useLive, type ConnectionStatus } from './lib/live-store';
import { getPrefs, setPrefs } from './lib/prefs';
import type { MapHandle } from './map/MapView';
import { downloadBlob, screenshotFileName } from './map/screenshot';

// MapLibre (~1 MB) se carga en un chunk aparte: la interfaz pinta antes.
const MapView = lazy(() => import('./map/MapView'));

const EMPTY: readonly Aircraft[] = [];
const mapFallback = <div className="map placeholder">Cargando mapa…</div>;

const SOURCE_NAME = { simulator: 'Simulador', readsb: 'Receptor', sbs: 'Receptor' } as const;
const RECEIVER_NAME: Record<ReceiverSource, string> = {
  decoder: 'ubicación del receptor',
  device: 'ubicación del dispositivo',
  manual: 'ubicación fijada',
  default: 'ubicación sin confirmar',
};

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function App() {
  const snapshot = useLive((s) => s.snapshot);
  const connection = useLive((s) => s.connection);
  const events = useLive((s) => s.events);
  const alarm = useAlarm();
  const locate = useLocateStatus();

  const mapRef = useRef<MapHandle>(null);
  const [selectedHex, setSelectedHex] = useState<string | null>(null);
  const [showOutOfRange, setShowOutOfRange] = useState(() => getPrefs().showOutOfRange);
  const [draftRadius, setDraftRadius] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  // Estado derivado durante el render (sin efectos).
  const radiusKm = draftRadius ?? snapshot?.settings.radiusKm ?? DEFAULT_RADIUS_KM;
  const receiver = snapshot?.settings.receiver;
  const receiverSource = snapshot?.settings.receiverSource;
  const selected = selectedHex ? snapshot?.aircraft.find((a) => a.hex === selectedHex) : undefined;

  const changeRadius = useCallback((km: number) => {
    setDraftRadius(km);
    setNotice(null);
    updateSettings({ radiusKm: km })
      .catch((err: unknown) => setNotice(`No se pudo cambiar el radio: ${errorText(err)}`))
      .finally(() => setDraftRadius((d) => (d === km ? null : d)));
  }, []);

  const selectHex = useCallback((hex: string | null) => setSelectedHex(hex), []);

  const locateHere = async () => {
    setNotice(null);
    try {
      await locateReceiver();
      mapRef.current?.recenter();
    } catch (error) {
      setNotice(errorText(error));
    }
  };

  const takeScreenshot = async () => {
    const map = mapRef.current;
    if (!map || capturing) return;
    setCapturing(true);
    try {
      const blob = await map.screenshot();
      if (blob) downloadBlob(blob, screenshotFileName(selected));
    } catch (err) {
      setNotice(`No se pudo tomar la captura: ${errorText(err)}`);
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="app">
      {receiver ? (
        <Suspense fallback={mapFallback}>
          <MapView
            ref={mapRef}
            receiver={receiver}
            radiusKm={radiusKm}
            showOutOfRange={showOutOfRange}
            selectedHex={selectedHex}
            onSelect={selectHex}
          />
        </Suspense>
      ) : (
        <div className="map placeholder">
          {connection === 'closed' ? 'Sin conexión con el servidor. ¿Está en marcha?' : 'Conectando…'}
        </div>
      )}

      <header className="topbar">
        <strong className="brand">{BRAND}</strong>
        <RadiusPicker value={radiusKm} onChange={changeRadius} />
        <Status connection={connection} snapshot={snapshot} receiverSource={receiverSource} />
      </header>

      <nav className="tools" aria-label="Herramientas">
        <button type="button" className="tool" onClick={locateHere}
          disabled={locate.state === 'locating'}
          title={locate.state === 'locating' ? 'Obteniendo ubicación nueva…' : 'Usar y guardar mi ubicación actual'}
          aria-label="Usar y guardar mi ubicación actual">
          {IconCenter}
        </button>
        <button type="button" className="tool" onClick={() => mapRef.current?.recenter()}
          title="Centrar en la antena guardada" aria-label="Centrar en la antena guardada">
          {IconRecenter}
        </button>
        <button
          type="button"
          className="tool"
          onClick={takeScreenshot}
          disabled={capturing || !receiver}
          title={selected ? `Captura de ${selected.flight ?? selected.hex.toUpperCase()}` : 'Captura del mapa'}
        >
          {IconCamera}
        </button>
        <button
          type="button"
          className={alarm.enabled ? 'tool' : 'tool off'}
          onClick={() => setAlarmEnabled(!alarm.enabled)}
          title={alarm.enabled ? 'Alarma activada' : 'Alarma desactivada'}
          aria-pressed={alarm.enabled}
        >
          {alarm.enabled ? IconBell : IconBellOff}
        </button>
        {receiver && receiverSource ? <SettingsButton receiver={receiver} source={receiverSource} /> : null}
      </nav>

      {alarm.ringing ? (
        <button type="button" className="alarm" onClick={silenceAlarm}>
          {alarm.inZone === 1 ? 'Avión dentro del radio' : `${alarm.inZone} aviones dentro del radio`} · Silenciar
        </button>
      ) : null}

      {notice ? (
        <button type="button" className="notice" onClick={() => setNotice(null)}>
          {notice}
        </button>
      ) : null}

      {selectedHex && snapshot ? (
        <AircraftCard hex={selectedHex} aircraft={selected} now={snapshot.now} onClose={() => setSelectedHex(null)} />
      ) : null}

      <Drawer
        aircraft={snapshot?.aircraft ?? EMPTY}
        events={events}
        inZone={snapshot?.stats.inRange ?? 0}
        showOutOfRange={showOutOfRange}
        onShowOutOfRange={(v) => {
          setShowOutOfRange(v);
          setPrefs({ showOutOfRange: v });
        }}
        selectedHex={selectedHex}
        onSelect={selectHex}
      />
    </div>
  );
}

interface StatusProps {
  connection: ConnectionStatus;
  snapshot: LiveSnapshot | null;
  receiverSource: ReceiverSource | undefined;
}

function Status({ connection, snapshot, receiverSource }: StatusProps) {
  const locate = useLocateStatus();
  if (connection !== 'open' || !snapshot) {
    return <span className="status warn">{connection === 'closed' ? 'Sin conexión' : 'Conectando…'}</span>;
  }
  const { source, stats } = snapshot;
  const unconfirmed = receiverSource === 'default' || locate.state === 'failed';
  const locationDetail = locate.state === 'failed' ? locate.reason
    : locate.state === 'done' ? `Precisión estimada: ±${formatAccuracy(locate.accuracyM)}` : '';
  return (
    <span className={!source.connected || unconfirmed ? 'status warn' : 'status'} title={[source.error ?? source.target, locationDetail].filter(Boolean).join(' · ')}>
      {source.connected ? SOURCE_NAME[source.kind] : `${SOURCE_NAME[source.kind]} sin datos`}
      {' · '}
      {stats.inRange} en zona de {stats.tracked}
      {receiverSource ? ` · ${locate.state === 'locating' ? 'detectando ubicación…' : RECEIVER_NAME[receiverSource]}` : ''}
      {locate.state === 'done' ? ` (±${formatAccuracy(locate.accuracyM)})` : null}
      {locate.state === 'failed' ? ' · ubicación sin actualizar' : null}
    </span>
  );
}
