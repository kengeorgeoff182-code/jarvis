import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const instances: FastifyInstance[] = [];

async function buildTestApp(): Promise<FastifyInstance> {
  // In-memory database: tests never touch the filesystem.
  const app = await buildApp({
    config: loadConfig({ NODE_ENV: 'test' }),
    logger: false,
    db: new DatabaseSync(':memory:'),
  });
  instances.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(instances.splice(0).map((app) => app.close()));
});

describe('GET /api/v1/health', () => {
  it('returns an ok envelope conforming to the shared contract', async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      status: 'ok',
      service: 'jarvis-api',
    });
    expect(typeof body.version).toBe('string');
    expect(body.version.length).toBeGreaterThan(0);
    expect(typeof body.uptimeSeconds).toBe('number');
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date');
  });
});

describe('error envelope', () => {
  it('returns a NOT_FOUND envelope for unknown routes', async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
    expect(typeof response.json().error.message).toBe('string');
  });

  it('returns a 500 envelope without leaking internals', async () => {
    const app = await buildTestApp();
    app.get('/api/v1/boom', async () => {
      throw new Error('secret internal detail');
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'UNEXPECTED_ERROR', message: 'Internal server error' },
    });
  });
});
