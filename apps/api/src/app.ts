import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { loggerOptions } from './logger';
import { loadConfig, type AppConfig } from './config';
import { registerErrorHandlers } from './error-handler';
import { healthRoutes } from './routes/health';

const API_PREFIX = '/api/v1';

export interface BuildAppOptions {
  config?: AppConfig;
  /** `false` silences logging (tests); default is Fastify's pino logger from env config. */
  logger?: boolean;
}

/**
 * Builds a configured Fastify instance without listening, so tests can use
 * `app.inject()` against the exact same wiring as production.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const app = Fastify({
    // Fastify 5 only accepts a pino *instance* via `loggerInstance` (which
    // widens the logger generic and breaks shared types), so hand it a
    // config object and let Fastify construct the logger itself.
    logger: options.logger === false ? false : loggerOptions(config),
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: config.CORS_ORIGINS,
  });

  registerErrorHandlers(app);

  await app.register(healthRoutes, { prefix: API_PREFIX });

  return app;
}
