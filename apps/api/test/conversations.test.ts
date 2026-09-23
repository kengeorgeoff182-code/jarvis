import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DatabaseSync } from 'node:sqlite';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { externalServiceError } from '../src/errors';
import type { LLMProvider } from '../src/ports/llm-provider';

const instances: FastifyInstance[] = [];

// Deterministic fake provider: unit tests never hit a real LLM (and the
// suite would never depend on network state). Tests mutate `chatMock` to
// simulate provider failures.
const chatMock = vi.fn();
const llm: LLMProvider = { chat: chatMock };

let app: FastifyInstance;

async function buildTestApp(): Promise<FastifyInstance> {
  const built = await buildApp({
    config: loadConfig({ NODE_ENV: 'test' }),
    logger: false,
    db: new DatabaseSync(':memory:'),
    llm,
  });
  instances.push(built);
  return built;
}

beforeEach(async () => {
  chatMock.mockReset();
  chatMock.mockResolvedValue('A test reply');
  app = await buildTestApp();
});

afterEach(async () => {
  await Promise.all(instances.splice(0).map((app) => app.close()));
});

async function createConversation(app: FastifyInstance): Promise<{ id: number }> {
  const response = await app.inject({ method: 'POST', url: '/api/v1/conversations', payload: {} });
  return response.json();
}

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

  it('stores the user turn and the generated assistant reply in order, and titles the conversation from its first message', async () => {
    const created = await createConversation(app);

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: {
        content:
          '  Hello Jarvis, this is a long first message that should be shortened for the sidebar title.  ',
      },
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();
    // Whitespace is trimmed before persistence; role is server-stamped.
    expect(firstBody.userMessage).toMatchObject({
      role: 'user',
      conversationId: created.id,
    });
    expect(firstBody.userMessage.content.startsWith('Hello Jarvis')).toBe(true);
    expect(firstBody.assistantMessage).toMatchObject({
      role: 'assistant',
      conversationId: created.id,
      content: 'A test reply',
    });
    expect(firstBody.userMessage.id).toBeLessThan(firstBody.assistantMessage.id);

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

    expect(
      detail.messages.map((m: { role: string; content: string }) => `${m.role}:${m.content}`),
    ).toEqual([
      'user:Hello Jarvis, this is a long first message that should be shortened for the sidebar title.',
      'assistant:A test reply',
      'user:Second message',
      'assistant:A test reply',
    ]);
    // First message became the title, truncated to a 60-char preview.
    expect(detail.title).toBe('Hello Jarvis, this is a long first message that should be sh…');
    expect(detail.messages[0].id).toBeLessThan(detail.messages[1].id);
  });

  it('passes the full message history (including prior replies) to the provider', async () => {
    const created = await createConversation(app);

    await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: { content: 'Hello' },
    });
    expect(chatMock.mock.calls[0]?.[0]).toEqual([{ role: 'user', content: 'Hello' }]);

    await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: { content: 'Again' },
    });
    expect(chatMock.mock.calls[1]?.[0]).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'A test reply' },
      { role: 'user', content: 'Again' },
    ]);
  });

  it('persists nothing and returns a 502 envelope when the provider fails', async () => {
    const created = await createConversation(app);
    chatMock.mockRejectedValueOnce(
      externalServiceError('LLM provider returned HTTP 503: overloaded'),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: { content: 'Will this survive?' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: {
        code: 'EXTERNAL_SERVICE_ERROR',
        message: expect.stringContaining('HTTP 503'),
      },
    });

    // The failed turn was rolled back — the conversation stays untouched.
    const detail = await app
      .inject({ method: 'GET', url: `/api/v1/conversations/${created.id}` })
      .then((r) => r.json());
    expect(detail.messages).toHaveLength(0);
    expect(detail.title).toBe('New conversation');
  });

  it('returns a clear 502 when the LLM is not configured (no injected provider)', async () => {
    // Building without an `llm` override uses the real adapter, whose empty
    // key (config default) must fail before any network call.
    const unconfiguredApp = await buildApp({
      config: loadConfig({ NODE_ENV: 'test' }),
      logger: false,
      db: new DatabaseSync(':memory:'),
    });
    instances.push(unconfiguredApp);
    const created = await createConversation(unconfiguredApp);

    const response = await unconfiguredApp.inject({
      method: 'POST',
      url: `/api/v1/conversations/${created.id}/messages`,
      payload: { content: 'Hello?' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({
      error: {
        code: 'EXTERNAL_SERVICE_ERROR',
        message: expect.stringContaining('LLM_API_KEY'),
      },
    });
  });

  it('lists most recently updated conversations first', async () => {
    const first = await createConversation(app);
    const second = await createConversation(app);

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

  it('orders a same-millisecond touch strictly above untouched conversations', async () => {
    // Regression for the CI failure in run 35844757531: three writes inside
    // one wall-clock millisecond used to share an updated_at, and the id
    // tie-break ranked the untouched (higher-id) conversation first. The
    // monotonic clock makes that tie impossible.
    const first = await createConversation(app);
    const second = await createConversation(app);
    const third = await createConversation(app);

    // No sleeps: everything below very likely lands in the same ms.
    await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${first.id}/messages`,
      payload: { content: 'same-ms burst' },
    });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/conversations',
    });
    const ids = listResponse.json().conversations.map((c: { id: number }) => c.id);
    expect(ids).toEqual([first.id, third.id, second.id]);
  });

  it('rejects empty or oversized message content with a validation envelope', async () => {
    const created = await createConversation(app);

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
