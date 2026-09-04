import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { expectNoAxeViolations } from './test/axe';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function summary(id: number, title: string) {
  return {
    id,
    title,
    createdAt: '2026-09-04T12:00:00.000Z',
    updatedAt: '2026-09-04T12:00:00.000Z',
  };
}

function message(id: number, conversationId: number, role: 'user' | 'assistant', content: string) {
  return {
    id,
    conversationId,
    role,
    content,
    createdAt: '2026-09-04T12:00:00.000Z',
  };
}

type Handler = (
  method: string,
  url: string,
  body: unknown,
) => { status: number; body: unknown } | undefined;

/**
 * Stubs global fetch with a route handler. Returning undefined for a request
 * makes the stub throw, which the client surfaces as a network error.
 */
function stubApi(handler: Handler) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    let body: unknown;
    if (init?.body !== undefined) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = undefined;
      }
    }
    const hit = handler(method, url, body);
    if (hit === undefined) {
      throw new Error(`Unhandled request: ${method} ${url}`);
    }
    return jsonResponse(hit.status, hit.body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('conversation list', () => {
  it('shows the empty state when there are no conversations', async () => {
    stubApi((method, url) =>
      method === 'GET' && url === '/api/v1/conversations'
        ? { status: 200, body: { conversations: [] } }
        : undefined,
    );

    render(<App />);

    expect(await screen.findByText('No conversations yet.')).toBeInTheDocument();
    expect(
      screen.getByText('Start your first conversation to begin chatting.'),
    ).toBeInTheDocument();
  });

  it('lists conversations and opens one to show its stored messages', async () => {
    const conversation = summary(1, 'Ask about the weather');
    const storedMessages = [
      message(1, 1, 'user', 'What is the weather?'),
      message(2, 1, 'assistant', 'Sunny and 21 °C.'),
    ];
    stubApi((method, url) => {
      if (method === 'GET' && url === '/api/v1/conversations') {
        return { status: 200, body: { conversations: [conversation] } };
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        return { status: 200, body: { ...conversation, messages: storedMessages } };
      }
      return undefined;
    });

    render(<App />);

    const item = await screen.findByRole('button', { name: 'Ask about the weather' });
    fireEvent.click(item);

    expect(await screen.findByText('What is the weather?')).toBeInTheDocument();
    expect(screen.getByText('Sunny and 21 °C.')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();
  });
});

describe('sending messages', () => {
  it('auto-creates a conversation, stores the message, and derives a title', async () => {
    const fetchMock = stubApi((method, url, body) => {
      if (method === 'GET' && url === '/api/v1/conversations') {
        return { status: 200, body: { conversations: [summary(1, 'Hello Jarvis')] } };
      }
      if (method === 'POST' && url === '/api/v1/conversations') {
        return { status: 201, body: summary(1, 'New conversation') };
      }
      if (method === 'POST' && url === '/api/v1/conversations/1/messages') {
        const content = (body as { content: string }).content;
        return { status: 201, body: message(1, 1, 'user', content) };
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        return {
          status: 200,
          body: {
            ...summary(1, 'Hello Jarvis'),
            messages: [message(1, 1, 'user', 'Hello Jarvis')],
          },
        };
      }
      return undefined;
    });

    render(<App />);

    const input = await screen.findByLabelText('Message Jarvis');
    fireEvent.change(input, { target: { value: 'Hello Jarvis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // The message content is announced and rendered in the transcript.
    expect(await screen.findByText('You')).toBeInTheDocument();
    expect((await screen.findAllByText('Hello Jarvis')).length).toBeGreaterThanOrEqual(2);

    const calls = fetchMock.mock.calls.map(
      (call) => `${call[1]?.method ?? 'GET'} ${String(call[0])}`,
    );
    expect(calls).toContain('POST /api/v1/conversations');
    expect(calls).toContain('POST /api/v1/conversations/1/messages');
    expect(calls).toContain('GET /api/v1/conversations/1');
  });

  it('keeps the draft and shows an error banner when sending fails', async () => {
    stubApi((method, url) => {
      if (method === 'GET' && url === '/api/v1/conversations') {
        return { status: 200, body: { conversations: [summary(1, 'Existing chat')] } };
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        return { status: 200, body: { ...summary(1, 'Existing chat'), messages: [] } };
      }
      if (method === 'POST' && url === '/api/v1/conversations/1/messages') {
        return {
          status: 500,
          body: { error: { code: 'UNEXPECTED_ERROR', message: 'Internal server error' } },
        };
      }
      return undefined;
    });

    render(<App />);

    const item = await screen.findByRole('button', { name: 'Existing chat' });
    fireEvent.click(item);
    await screen.findByText('No messages yet — send the first one below.');

    const input = screen.getByLabelText('Message Jarvis');
    fireEvent.change(input, { target: { value: 'this must survive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Internal server error')).toBeInTheDocument();
    expect(input).toHaveValue('this must survive');
  });
});

describe('connection failures', () => {
  it('shows an accessible error when the API is unreachable', async () => {
    stubApi(() => undefined);

    render(<App />);

    expect(await screen.findByText('Could not reach the Jarvis API.')).toBeInTheDocument();
  });
});

describe('accessibility audit', () => {
  it('has no violations in the empty state', async () => {
    stubApi((method, url) =>
      method === 'GET' && url === '/api/v1/conversations'
        ? { status: 200, body: { conversations: [] } }
        : undefined,
    );

    const { container } = render(<App />);
    await screen.findByText('No conversations yet.');

    await expectNoAxeViolations(container);
  });

  it('has no violations with a conversation open', async () => {
    const conversation = summary(1, 'Ask about the weather');
    stubApi((method, url) => {
      if (method === 'GET' && url === '/api/v1/conversations') {
        return { status: 200, body: { conversations: [conversation] } };
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        return {
          status: 200,
          body: {
            ...conversation,
            messages: [
              message(1, 1, 'user', 'What is the weather?'),
              message(2, 1, 'assistant', 'Sunny and 21 °C.'),
            ],
          },
        };
      }
      return undefined;
    });

    const { container } = render(<App />);
    const item = await screen.findByRole('button', { name: 'Ask about the weather' });
    fireEvent.click(item);
    await screen.findByText('Sunny and 21 °C.');

    await expectNoAxeViolations(container);
  });

  it('has no violations when the API is unreachable', async () => {
    stubApi(() => undefined);

    const { container } = render(<App />);
    await screen.findByText('Could not reach the Jarvis API.');

    await expectNoAxeViolations(container);
  });
});
