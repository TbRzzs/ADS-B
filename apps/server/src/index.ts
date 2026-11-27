import { buildApp } from './app';
import { loadEnv } from './env';

const env = loadEnv();
const app = await buildApp(env);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} recibido, cerrando…`);
  await app.close();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.PORT, host: env.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
