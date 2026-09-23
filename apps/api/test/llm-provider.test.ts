import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleLLMProvider } from '../src/adapters/openai-compatible-llm-provider';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function provider(
  overrides: Partial<{ apiKey: string; baseUrl: string; model: string; timeoutMs: number }> = {},
) {
  return new OpenAICompatibleLLMProvider({
    apiKey: 'sk-test',
    baseUrl: 'http://llm.test/v1',
    model: 'test-model',
    timeoutMs: 5_000,
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAICompatibleLLMProvider', () => {
  it('sends a well-formed chat completion request and returns the trimmed reply', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        choices: [{ message: { role: 'assistant', content: '  Hello there!  ' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const reply = await provider().chat([{ role: 'user', content: 'Hi' }]);

    expect(reply).toBe('Hello there!');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://llm.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      authorization: 'Bearer sk-test',
    });
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'test-model',
      messages: [{ role: 'user', content: 'Hi' }],
    });
  });

  it('fails fast without touching the network when no API key is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const unconfigured = provider({ apiKey: '' });

    await expect(unconfigured.chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: expect.stringContaining('LLM_API_KEY'),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps provider error responses to 502 external service errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { error: { message: 'Incorrect API key provided' } })),
    );

    await expect(provider().chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: expect.stringContaining('HTTP 401'),
    });
  });

  it('rejects malformed and empty completions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { choices: [] })),
    );
    await expect(provider().chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { choices: [{ message: { content: '   ' } }] })),
    );
    await expect(provider().chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: expect.stringContaining('empty reply'),
    });
  });

  it('maps network failures and timeouts to 502 external service errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(provider().chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: expect.stringContaining('Could not reach'),
    });

    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw abortError;
      }),
    );
    await expect(provider().chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: expect.stringContaining('timed out'),
    });
  });

  it('applies the timeout to the response body read, not just the headers', async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
          controller.enqueue(new TextEncoder().encode('{"choices":['));
          // Never closed: the upstream stalls mid-body.
        },
      }),
      { status: 200 },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: unknown, init?: RequestInit) => {
        // Real fetch propagates an abort into the in-flight body read; the
        // stub must reproduce that wiring for the test to be meaningful.
        init?.signal?.addEventListener('abort', () => {
          streamController?.error(init.signal?.reason);
        });
        return Promise.resolve(response);
      }),
    );

    await expect(provider({ timeoutMs: 50 }).chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: expect.stringContaining('timed out'),
    });
  });

  it('maps a truncated or malformed success body to a 502 external service error', async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"choices": ['));
          controller.error(new Error('connection reset'));
        },
      }),
      { status: 200 },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response),
    );

    await expect(provider().chat([])).rejects.toMatchObject({
      code: 'EXTERNAL_SERVICE_ERROR',
      message: expect.stringContaining('invalid response body'),
    });
  });
});
