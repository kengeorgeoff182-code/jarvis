import pino from 'pino';
import type { AppConfig } from './config';

/**
 * pino options for the API logger. Passed to Fastify's native `logger`
 * option so Fastify owns the instance — Fastify 5 only accepts pino
 * instances through `loggerInstance`, and using that widens the app's
 * logger generic in ways that break the shared `FastifyInstance` type.
 * Never use console.log — see docs/conventions.md#logging.
 */
export function loggerOptions(
  config: Pick<AppConfig, 'NODE_ENV' | 'LOG_LEVEL'>,
): pino.LoggerOptions {
  return {
    level: config.LOG_LEVEL,
    base: { service: 'jarvis-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}
