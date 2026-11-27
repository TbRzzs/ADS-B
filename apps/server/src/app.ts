import { timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import type {
  AircraftListResponse,
  LiveSnapshot,
  MapStatus,
  ServerMessage,
  Settings,
} from '@adsb/shared/types';
import { ROOT_DIR, type Env } from './env';
import { radiusSchema, SettingsStore, settingsPatchSchema } from './settings-store';
import { ReadsbJsonSource } from './sources/readsb';
import { SbsSource } from './sources/sbs';
import type { AircraftSource, SourceLogger } from './sources/source';
import { Tracker } from './tracker';

const MAP_FONT_PROBE = join('fonts', 'Noto Sans Regular', '0-255.pbf');
const MAP_SPRITES = ['dark', 'light'] as const;
const MAP_PMTILES = 'region.pmtiles';

const aircraftQuerySchema = z.object({
  radiusKm: z.coerce.number().pipe(radiusSchema).optional(),
  inRange: z.enum(['true', 'false']).optional(),
  withPosition: z.enum(['true', 'false']).optional(),
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

function createSource(env: Env, log: SourceLogger): AircraftSource {
  switch (env.SOURCE) {
    case 'readsb':
      return new ReadsbJsonSource(env.READSB_URL, env.READSB_POLL_MS, log);
    case 'sbs':
      return new SbsSource(env.SBS_HOST, env.SBS_PORT, log);
  }
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const dataDir = env.DATA_DIR ?? join(ROOT_DIR, 'data');
  const mapDir = join(dataDir, 'map');
  const webDist = env.WEB_DIST ?? join(ROOT_DIR, 'apps', 'web', 'dist');
  mkdirSync(mapDir, { recursive: true });

  const app = Fastify({ logger: { level: env.LOG_LEVEL } });

  const defaults: Settings = {
    receiver: { lat: env.RECEIVER_LAT, lon: env.RECEIVER_LON },
    receiverSource: 'default',
    radiusKm: env.RADIUS_KM,
  };
  const settings = new SettingsStore(join(dataDir, 'settings.json'), defaults);
  const tracker = new Tracker(() => settings.get(), {
    timeoutS: env.AIRCRAFT_TIMEOUT_S,
    positionStaleS: env.POSITION_STALE_S,
  });
  const source = createSource(env, {
    info: (m) => app.log.info(m),
    warn: (m) => app.log.warn(m),
  });

  // ─── Difusión en vivo (WebSocket) ─────────────────────────────────────────
  const clients = new Set<WebSocket>();
  let lastSnapshotJson = '';

  const buildSnapshot = (now: number): LiveSnapshot => ({
    now,
    settings: settings.get(),
    source: source.status(),
    stats: tracker.stats(),
    aircraft: tracker.list(),
    newEvents: tracker.takeNewEvents(),
  });

  const broadcast = () => {
    const now = Date.now();
    tracker.tick(now);
    const message: ServerMessage = { type: 'snapshot', data: buildSnapshot(now) };
    // Se serializa una sola vez para todos los clientes.
    lastSnapshotJson = JSON.stringify(message);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(lastSnapshotJson);
    }
  };

  const broadcastTimer = setInterval(broadcast, env.BROADCAST_MS);

  /** Tras cambiar ajustes: recalcula distancias si movió el receptor y avisa a todas las pantallas. */
  const applySettingsChange = (receiverChanged: boolean) => {
    if (receiverChanged) tracker.recomputeGeometry();
    broadcast();
  };

  app.addHook('onReady', async () => {
    source.start((updates) => tracker.apply(updates), {
      // Georreferenciación automática: el decodificador anuncia dónde está la antena.
      receiver: (position) => {
        void settings.setDecoderReceiver(position).then((r) => {
          if (r.receiverChanged) {
            app.log.info(`Receptor georreferenciado por el decodificador: ${position.lat}, ${position.lon}`);
          }
          if (r.changed) applySettingsChange(r.receiverChanged);
        });
      },
    });
    app.log.info(`Fuente de datos: ${env.SOURCE} (${source.status().target})`);
  });

  app.addHook('onClose', async () => {
    clearInterval(broadcastTimer);
    await source.stop();
    for (const ws of clients) ws.close(1001, 'server shutdown');
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    methods: ['GET', 'PATCH', 'OPTIONS'],
  });
  await app.register(websocket, { options: { maxPayload: 4096 } });

  // ─── Autenticación opcional para operaciones de escritura ────────────────
  app.addHook('onRequest', async (req, reply) => {
    if (!env.API_TOKEN || req.method === 'GET' || req.method === 'OPTIONS') return;
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!safeEqual(token, env.API_TOKEN)) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Token API inválido' });
    }
  });

  // ─── API REST ─────────────────────────────────────────────────────────────
  app.get('/api/health', async () => ({
    ok: true,
    uptimeS: Math.round(process.uptime()),
    source: source.status(),
    stats: tracker.stats(),
  }));

  app.get('/api/settings', async () => settings.get());

  app.patch('/api/settings', async (req, reply) => {
    const parsed = settingsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    }
    const result = await settings.update(parsed.data);
    applySettingsChange(result.receiverChanged);
    return result.settings;
  });

  app.get('/api/aircraft', async (req, reply) => {
    const parsed = aircraftQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    }
    const { radiusKm: queryRadius, inRange, withPosition } = parsed.data;
    const { receiver, radiusKm: currentRadius } = settings.get();
    const radiusKm = queryRadius ?? currentRadius;
    const all = tracker.list();

    // Un único recorrido para filtrar; luego orden por distancia.
    const aircraft = all.filter((a) => {
      if (withPosition === 'true' && a.distanceKm === undefined) return false;
      if (inRange === undefined) return true;
      // Con radio explícito se filtra por distancia; si no, por el estado del tracker
      // (que además descarta posiciones obsoletas).
      const within =
        queryRadius === undefined
          ? a.inRange
          : a.distanceKm !== undefined && a.distanceKm <= radiusKm;
      return inRange === 'true' ? within : !within;
    });
    aircraft.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

    const body: AircraftListResponse = {
      now: Date.now(),
      receiver,
      radiusKm,
      count: aircraft.length,
      aircraft,
    };
    return body;
  });

  app.get<{ Params: { hex: string } }>('/api/aircraft/:hex', async (req, reply) => {
    const detail = tracker.detail(req.params.hex);
    if (!detail) return reply.code(404).send({ error: 'not_found', message: 'Avión no rastreado' });
    return detail;
  });

  app.get('/api/events', async (req, reply) => {
    const parsed = eventsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bad_request', issues: parsed.error.issues });
    }
    return tracker.recentEvents(parsed.data.limit);
  });

  app.get('/api/map/status', async () => {
    const status: MapStatus = {
      basemap: existsSync(join(mapDir, MAP_PMTILES)),
      glyphs: existsSync(join(mapDir, MAP_FONT_PROBE)),
      sprite: MAP_SPRITES.find((name) => existsSync(join(mapDir, 'sprites', `${name}.json`))) ?? null,
    };
    return status;
  });

  app.get('/ws', { websocket: true }, (socket) => {
    clients.add(socket);
    const hello: ServerMessage = { type: 'events', data: tracker.recentEvents(50) };
    socket.send(JSON.stringify(hello));
    if (lastSnapshotJson) socket.send(lastSnapshotJson);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  // ─── Archivos estáticos: interfaz web compilada + mapa offline ───────────
  const hasWeb = existsSync(join(webDist, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, { root: webDist, prefix: '/', wildcard: false });
  }
  // Soporta peticiones Range (necesarias para PMTiles).
  await app.register(fastifyStatic, {
    root: mapDir,
    prefix: '/map/',
    decorateReply: false,
    maxAge: '1h',
  });

  app.setNotFoundHandler((req, reply) => {
    const isPage =
      req.method === 'GET' &&
      !req.url.startsWith('/api') &&
      !req.url.startsWith('/map/') &&
      (req.headers.accept ?? '').includes('text/html');
    if (hasWeb && isPage) return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });

  return app;
}
