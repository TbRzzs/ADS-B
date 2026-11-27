import { mkdirSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { MAX_RADIUS_KM, MIN_RADIUS_KM } from '@adsb/shared/constants';
import {
  RECEIVER_SOURCE_PRIORITY,
  type LatLon,
  type ReceiverSource,
  type Settings,
  type SettingsPatch,
} from '@adsb/shared/types';

export const latLonSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const radiusSchema = z.number().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM);

export const settingsPatchSchema = z
  .object({
    receiver: latLonSchema.optional(),
    receiverSource: z.enum(['manual', 'device', 'auto']).optional(),
    radiusKm: radiusSchema.optional(),
  })
  .strict()
  .refine((p) => p.receiverSource !== 'device' || p.receiver !== undefined, {
    message: 'receiverSource "device" requiere receiver',
  });

const settingsSchema = z.object({
  receiver: latLonSchema,
  // Archivos antiguos sin este campo: se tratan como no confirmados (se permite autodetectar).
  receiverSource: z.enum(['default', 'device', 'decoder', 'manual']).default('default'),
  radiusKm: radiusSchema,
});

export interface UpdateResult {
  settings: Settings;
  /** Algo cambió (y se persistió). */
  changed: boolean;
  /** Cambiaron las coordenadas del receptor. */
  receiverChanged: boolean;
}

const sameLatLon = (a: LatLon, b: LatLon) => a.lat === b.lat && a.lon === b.lon;

/** Ajustes en tiempo de ejecución, persistidos en JSON (sobreviven reinicios). */
export class SettingsStore {
  private current: Settings;
  /** Última posición publicada por el decodificador (para volver a "automático"). */
  private decoderReceiver: LatLon | undefined;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly file: string,
    defaults: Settings,
  ) {
    this.current = this.load(defaults);
  }

  get(): Settings {
    return this.current;
  }

  async update(patch: SettingsPatch): Promise<UpdateResult> {
    const prev = this.current;
    let { receiver, receiverSource } = prev;

    if (patch.receiverSource === 'auto') {
      if (this.decoderReceiver) {
        receiver = this.decoderReceiver;
        receiverSource = 'decoder';
      } else {
        receiverSource = 'default';
      }
    } else if (patch.receiver) {
      const source: ReceiverSource = patch.receiverSource ?? 'manual';
      if (canOverride(source, prev.receiverSource)) {
        receiver = patch.receiver;
        receiverSource = source;
      }
    }

    return this.commit({ receiver, receiverSource, radiusKm: patch.radiusKm ?? prev.radiusKm });
  }

  /** Posición anunciada por el decodificador (readsb receiver.json). */
  async setDecoderReceiver(position: LatLon): Promise<UpdateResult> {
    this.decoderReceiver = position;
    const prev = this.current;
    // Una posición manual tiene prioridad; commit() ignora además repeticiones idénticas.
    if (!canOverride('decoder', prev.receiverSource)) {
      return { settings: prev, changed: false, receiverChanged: false };
    }
    return this.commit({ ...prev, receiver: position, receiverSource: 'decoder' });
  }

  private async commit(next: Settings): Promise<UpdateResult> {
    const prev = this.current;
    const unchanged =
      sameLatLon(prev.receiver, next.receiver) &&
      prev.receiverSource === next.receiverSource &&
      prev.radiusKm === next.radiusKm;
    if (unchanged) return { settings: prev, changed: false, receiverChanged: false };

    this.current = next;
    // Serializa las escrituras para que nunca se pisen entre sí.
    this.writeChain = this.writeChain.then(() => this.persist(next)).catch(() => undefined);
    await this.writeChain;
    return { settings: next, changed: true, receiverChanged: !sameLatLon(prev.receiver, next.receiver) };
  }

  private load(defaults: Settings): Settings {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      const parsed = settingsSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // No existe o está corrupto: se usan los valores por defecto (.env).
    }
    return defaults;
  }

  private async persist(settings: Settings): Promise<void> {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(settings, null, 2), 'utf8');
    await rename(tmp, this.file);
  }
}

function canOverride(incoming: ReceiverSource, current: ReceiverSource): boolean {
  return RECEIVER_SOURCE_PRIORITY[incoming] >= RECEIVER_SOURCE_PRIORITY[current];
}
