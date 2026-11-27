import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM, MIN_RADIUS_KM } from '@adsb/shared/constants';

/** Raíz del monorepo (válido tanto desde src/ en dev como desde dist/ en producción). */
export const ROOT_DIR = fileURLToPath(new URL('../../../', import.meta.url));

const rootEnv = `${ROOT_DIR}.env`;
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SOURCE: z.enum(['simulator', 'readsb', 'sbs']).default('simulator'),
  READSB_URL: z.string().default('http://127.0.0.1:8080/data/aircraft.json'),
  READSB_POLL_MS: z.coerce.number().int().min(250).default(1000),
  SBS_HOST: z.string().default('127.0.0.1'),
  SBS_PORT: z.coerce.number().int().min(1).max(65535).default(30003),
  SIM_AIRCRAFT: z.coerce.number().int().min(1).max(500).default(30),

  RECEIVER_LAT: z.coerce.number().min(-90).max(90).default(4.7016),
  RECEIVER_LON: z.coerce.number().min(-180).max(180).default(-74.1469),
  RADIUS_KM: z.coerce.number().min(MIN_RADIUS_KM).max(MAX_RADIUS_KM).default(DEFAULT_RADIUS_KM),

  BROADCAST_MS: z.coerce.number().int().min(200).default(1000),
  AIRCRAFT_TIMEOUT_S: z.coerce.number().min(5).default(60),
  POSITION_STALE_S: z.coerce.number().min(2).default(30),

  API_TOKEN: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  CORS_ORIGIN: z.string().default('*'),

  DATA_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  WEB_DIST: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuración inválida (.env):\n${issues.join('\n')}`);
  }
  return parsed.data;
}
