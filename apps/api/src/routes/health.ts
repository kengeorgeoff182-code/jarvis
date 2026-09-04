import type { FastifyPluginAsync } from 'fastify';
import { healthResponseSchema } from '@jarvis/shared';
import { APP_VERSION } from '../version';

/**
 * Liveness endpoint. Payload is validated against the shared contract on the
 * way out, which is what keeps the API and the web client honest.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    const payload = {
      status: 'ok' as const,
      service: 'jarvis-api' as const,
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
    return healthResponseSchema.parse(payload);
  });
};
