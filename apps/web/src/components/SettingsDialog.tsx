import { useRef, useState, useTransition, type FormEvent } from 'react';
import type { LatLon, ReceiverSource } from '@adsb/shared/types';
import { updateSettings } from '../lib/api';
import { clearLocateStatus, locateReceiver, retryAutoLocate, useLocateStatus } from '../lib/auto-locate';
import { formatAccuracy } from '../lib/geolocation';
import { getPrefs, setPrefs } from '../lib/prefs';
import { IconSettings } from './icons';

interface Props {
  receiver: LatLon;
  source: ReceiverSource;
}

export function SettingsButton({ receiver, source }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="tool"
        title="Ajustes"
        onClick={() => {
          setOpen(true);
          dialogRef.current?.showModal();
        }}
      >
        {IconSettings}
      </button>
      <dialog ref={dialogRef} className="dialog" onClose={() => setOpen(false)}>
        {/* Se monta al abrir para partir siempre de los valores actuales. */}
        {open ? (
          <SettingsForm receiver={receiver} source={source} onDone={() => dialogRef.current?.close()} />
        ) : null}
      </dialog>
    </>
  );
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function SettingsForm({ receiver, source, onDone }: Props & { onDone: () => void }) {
  const [lat, setLat] = useState(String(receiver.lat));
  const [lon, setLon] = useState(String(receiver.lon));
  const [token, setToken] = useState(() => getPrefs().apiToken);
  const [error, setError] = useState<string | null>(null);
  const locateStatus = useLocateStatus();
  const locating = locateStatus.state === 'locating';
  const [locationSaved, setLocationSaved] = useState(false);
  const [saving, startSaving] = useTransition();

  const locate = async () => {
    saveToken();
    setError(null);
    setLocationSaved(false);
    try {
      const settings = await locateReceiver();
      setLat(String(settings.receiver.lat));
      setLon(String(settings.receiver.lon));
      setLocationSaved(true);
    } catch (error) {
      setError(errorText(error));
    }
  };

  const saveToken = () => setPrefs({ apiToken: token.trim() });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const latN = Number(lat.replace(',', '.'));
    const lonN = Number(lon.replace(',', '.'));
    if (!Number.isFinite(latN) || Math.abs(latN) > 90 || !Number.isFinite(lonN) || Math.abs(lonN) > 180) {
      setError('Coordenadas inválidas.');
      return;
    }
    saveToken();
    setError(null);
    startSaving(async () => {
      try {
        await updateSettings({ receiver: { lat: latN, lon: lonN }, receiverSource: 'manual' });
        clearLocateStatus();
        onDone();
      } catch (err) {
        setError(errorText(err));
      }
    });
  };

  const backToAuto = () => {
    saveToken();
    setError(null);
    startSaving(async () => {
      try {
        await updateSettings({ receiverSource: 'auto' });
        retryAutoLocate();
        onDone();
      } catch (err) {
        setError(errorText(err));
      }
    });
  };

  return (
    <form method="dialog" onSubmit={onSubmit} className="settings-form">
      <h2>Ajustes</h2>
      <p className="muted">
        Usa la ubicación de este dispositivo si estás junto a la antena. La precisión depende de Windows
        y del navegador. Si aparece otro lugar, fija las coordenadas correctas aquí.
      </p>
      <div className="grid2">
        <label>
          Latitud
          <input inputMode="decimal" value={lat} onChange={(e) => { setLat(e.currentTarget.value); setLocationSaved(false); }} disabled={locating || saving} required />
        </label>
        <label>
          Longitud
          <input inputMode="decimal" value={lon} onChange={(e) => { setLon(e.currentTarget.value); setLocationSaved(false); }} disabled={locating || saving} required />
        </label>
      </div>
      <button type="button" className="btn ghost" onClick={locate} disabled={locating || saving}>
        {locating ? 'Obteniendo ubicación nueva…' : 'Usar y guardar mi ubicación actual'}
      </button>
      {locateStatus.state === 'done' ? <p className="muted" role="status">
        {locationSaved ? 'Ubicación guardada. ' : ''}Última precisión estimada: ±{formatAccuracy(locateStatus.accuracyM)}.
        {' '}Si el lugar es incorrecto, introduce las coordenadas correctas y pulsa Guardar.
      </p> : null}
      {source === 'manual' ? (
        <button type="button" className="btn ghost" onClick={backToAuto} disabled={saving || locating}>
          Volver a detección automática
        </button>
      ) : null}
      <label>
        Token API <span className="muted">(solo si el servidor define API_TOKEN)</span>
        <input type="password" value={token} onChange={(e) => setToken(e.currentTarget.value)} autoComplete="off" />
      </label>
      {error ? <p className="alert">{error}</p> : null}
      <div className="dialog-actions">
        <button type="button" className="btn ghost" onClick={onDone}>
          Cerrar
        </button>
        <button type="submit" className="btn primary" disabled={saving || locating}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
