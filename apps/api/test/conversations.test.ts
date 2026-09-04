import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp({
    config: loadConfig({ NODE_ENV: 'test' }),
    logger: false,
    db: new DatabaseSync(':memory:'),
  });
});

afterEach(async () => {
  await app.close();
});

describe('conversations', () => {
  it('creates an untitled conversation and lists it', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      payload: {},
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({ title: 'New conversation' });
    expect(created.id).toBeGreaterThan(0);
    expect(new Date(created.createdAt).toString()).not.toBe('Invalid Date');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().conversations).toHaveLength(1);
    expect(listResponse.json().conversations[0]).toEqual(created);
  });

  it('rejects an empty conversation payload (body must be an empty object)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      payload: { title: 'forbidden' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
  });

  it('returns a 404 envelope for an unknown conversation', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations/999',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('stores messages in order and titles the conversation from its first message', async () => {
    const created = await app
      .inject({ method: 'POST', url: '/api/v1/conversations', payload: {} })
      .then((r) => r.json());

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: {
        content:
          '  Hello Jarvis, this is a long first message that should be shortened for the sidebar title.  ',
      },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ role: 'user', conversationId: created.id });
    // Whitespace is trimmed before persistence.
    expect(first.json().content.startsWith('Hello Jarvis')).toBe(true);

    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: { content: 'Second message' },
    });
    expect(second.statusCode).toBe(201);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${created.id}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json();

    expect(detail.messages.map((m: { content: string }) => m.content)).toEqual([
      'Hello Jarvis, this is a long first message that should be shortened for the sidebar title.',
      'Second message',
    ]);
    // First message became the title, truncated to a 60-char preview.
    expect(detail.title).toBe('Hello Jarvis, this is a long first message that should be sh…');
    expect(detail.messages[0].id).toBeLessThan(detail.messages[1].id);
  });

  it('lists most recently updated conversations first', async () => {
    const first = await app
      .inject({ method: 'POST', url: '/api/v1/conversations', payload: {} })
      .then((r) => r.json());
    const second = await app
      .inject({ method: 'POST', url: '/api/v1/conversations', payload: {} })
      .then((r) => r.json());

    // Touch the older conversation so it becomes the most recently updated.
    await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${first.id}/messages`,
      payload: { content: 'bring me to the top' },
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
    });
    const ids = listResponse.json().conversations.map((c: { id: number }) => c.id);
    expect(ids).toEqual([first.id, second.id]);
  });

  it('rejects empty or oversized message content with a validation envelope', async () => {
    const created = await app
      .inject({ method: 'POST', url: '/api/v1/conversations', payload: {} })
      .then((r) => r.json());

    const empty = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: { content: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const oversized = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: { content: 'x'.repeat(100_001) },
    });
    expect(oversized.statusCode).toBe(400);

    const badId = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/not-a-number/messages',
      payload: { content: 'hi' },
    });
    expect(badId.statusCode).toBe(400);
  });

  it('returns 404 when sending a message to an unknown conversation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/4242/messages',
      payload: { content: 'hello?' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });
});
