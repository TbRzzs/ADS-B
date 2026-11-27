import { RADIUS_PRESETS_KM } from '@adsb/shared/constants';

interface Props {
  value: number;
  onChange: (km: number) => void;
}

/** Desplegable con los radios de detección permitidos. */
export function RadiusPicker({ value, onChange }: Props) {
  // Un radio guardado antes que no esté en la lista se muestra igualmente.
  const known = (RADIUS_PRESETS_KM as readonly number[]).includes(value);
  return (
    <label className="radius">
      <span>Radio</span>
      <select value={value} onChange={(e) => onChange(Number(e.currentTarget.value))}>
        {known ? null : <option value={value}>{value} km</option>}
        {RADIUS_PRESETS_KM.map((km) => (
          <option key={km} value={km}>
            {km} km
          </option>
        ))}
      </select>
    </label>
  );
}
