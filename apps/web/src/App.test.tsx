import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('auto-creates a conversation, stores the message, and renders the assistant reply', async () => {
    const fetchMock = stubApi((method, url, body) => {
      if (method === 'GET' && url === '/api/v1/conversations') {
        return { status: 200, body: { conversations: [summary(1, 'Hello Jarvis')] } };
      }
      if (method === 'POST' && url === '/api/v1/conversations') {
        return { status: 201, body: summary(1, 'New conversation') };
      }
      if (method === 'POST' && url === '/api/v1/conversations/1/messages') {
        const content = (body as { content: string }).content;
        return {
          status: 201,
          body: {
            userMessage: message(1, 1, 'user', content),
            assistantMessage: message(2, 1, 'assistant', 'A generated reply.'),
          },
        };
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        return {
          status: 200,
          body: {
            ...summary(1, 'Hello Jarvis'),
            messages: [
              message(1, 1, 'user', 'Hello Jarvis'),
              message(2, 1, 'assistant', 'A generated reply.'),
            ],
          },
        };
      }
      return undefined;
    });

    render(<App />);

    const input = await screen.findByLabelText('Message Jarvis');
    fireEvent.change(input, { target: { value: 'Hello Jarvis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // Both the user turn and the generated reply render in the transcript.
    expect(await screen.findByText('You')).toBeInTheDocument();
    expect((await screen.findAllByText('Hello Jarvis')).length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText('A generated reply.')).toBeInTheDocument();
    expect(screen.getByText('Assistant')).toBeInTheDocument();

    // The first-message title refetch happens after the post-send sidebar
    // refresh — wait for it instead of racing the async tail.
    const calls = () =>
      fetchMock.mock.calls.map((call) => `${call[1]?.method ?? 'GET'} ${String(call[0])}`);
    await waitFor(() => expect(calls()).toContain('GET /api/v1/conversations/1'));
    expect(calls()).toContain('POST /api/v1/conversations');
    expect(calls()).toContain('POST /api/v1/conversations/1/messages');
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

  it('clears the draft and keeps the transcript when the send persists but refreshes fail', async () => {
    let listCalls = 0;
    stubApi((method, url) => {
      if (method === 'GET' && url === '/api/v1/conversations') {
        // First call is the initial load; the second is the post-send
        // sidebar refresh, which fails here.
        listCalls += 1;
        return listCalls === 1
          ? { status: 200, body: { conversations: [summary(1, 'Existing chat')] } }
          : { status: 500, body: { error: { code: 'UNEXPECTED_ERROR', message: 'boom' } } };
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        // The open fetch sees an empty transcript; the post-send title
        // refetch fails too — the send itself must still read as successful.
        return listCalls === 1
          ? { status: 200, body: { ...summary(1, 'Existing chat'), messages: [] } }
          : { status: 500, body: { error: { code: 'UNEXPECTED_ERROR', message: 'boom' } } };
      }
      if (method === 'POST' && url === '/api/v1/conversations/1/messages') {
        return {
          status: 201,
          body: {
            userMessage: message(10, 1, 'user', 'persisted turn'),
            assistantMessage: message(11, 1, 'assistant', 'kept reply'),
          },
        };
      }
      return undefined;
    });

    render(<App />);

    const item = await screen.findByRole('button', { name: 'Existing chat' });
    fireEvent.click(item);
    await screen.findByText('No messages yet — send the first one below.');

    const input = screen.getByLabelText('Message Jarvis');
    fireEvent.change(input, { target: { value: 'persisted turn' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // The notice must not claim the send failed.
    expect(
      await screen.findByText('Message sent, but the sidebar could not be refreshed.'),
    ).toBeInTheDocument();
    // A persisted send clears the draft — keeping it would bait a duplicate.
    // (Draft clearing lands a microtask after the banner, so wait for it.)
    await waitFor(() => expect(input).toHaveValue(''));
    // Both turns survive in the transcript from the send response.
    expect(screen.getByText('persisted turn')).toBeInTheDocument();
    expect(screen.getByText('kept reply')).toBeInTheDocument();
  });

  it('renders the conversation the user switched to while a send was in flight', async () => {
    // Deferred routes need raw control over when the Response object is
    // created, so this test stubs fetch directly (stubApi would wrap the
    // pending promise into an immediate bogus response).
    const resolvers = new Map<number, (response: Response) => void>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/v1/conversations') {
        return Promise.resolve(
          jsonResponse(200, { conversations: [summary(1, 'Slow send'), summary(2, 'Other chat')] }),
        );
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        return Promise.resolve(jsonResponse(200, { ...summary(1, 'Slow send'), messages: [] }));
      }
      if (method === 'GET' && url === '/api/v1/conversations/2') {
        return new Promise<Response>((resolve) => {
          resolvers.set(2, resolve);
        });
      }
      if (method === 'POST' && url === '/api/v1/conversations/1/messages') {
        return new Promise<Response>((resolve) => {
          resolvers.set(-1, resolve);
        });
      }
      return Promise.reject(new Error(`Unhandled request: ${method} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: 'Slow send' }));
    await screen.findByText('No messages yet — send the first one below.');

    const input = screen.getByLabelText('Message Jarvis');
    fireEvent.change(input, { target: { value: 'in-flight message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    // User navigates to another conversation while the send hangs.
    fireEvent.click(screen.getByRole('button', { name: 'Other chat' }));

    // The send then resolves and fully completes (draft clears only after
    // the post-send refresh settles).
    resolvers.get(-1)!(
      jsonResponse(201, {
        userMessage: message(30, 1, 'user', 'in-flight message'),
        assistantMessage: message(31, 1, 'assistant', 'slow reply'),
      }),
    );
    await waitFor(() => expect(input).toHaveValue(''));

    // The navigation's own detail fetch lands last — it must win the view.
    resolvers.get(2)!(
      jsonResponse(200, {
        ...summary(2, 'Other chat'),
        messages: [message(40, 2, 'user', 'other chat body')],
      }),
    );
    expect(await screen.findByText('other chat body')).toBeInTheDocument();
    expect(screen.queryByText('in-flight message')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Other chat' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('ignores a stale detail response after the user switches conversations', async () => {
    const resolvers = new Map<number, (response: Response) => void>();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url === '/api/v1/conversations') {
        return Promise.resolve(
          jsonResponse(200, {
            conversations: [summary(1, 'Slow detail'), summary(2, 'Fast detail')],
          }),
        );
      }
      if (method === 'GET' && url === '/api/v1/conversations/1') {
        return new Promise<Response>((resolve) => {
          resolvers.set(1, resolve);
        });
      }
      if (method === 'GET' && url === '/api/v1/conversations/2') {
        return new Promise<Response>((resolve) => {
          resolvers.set(2, resolve);
        });
      }
      return Promise.reject(new Error(`Unhandled request: ${method} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await screen.findByRole('button', { name: 'Slow detail' });
    fireEvent.click(screen.getByRole('button', { name: 'Slow detail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fast detail' }));

    // The fast conversation resolves first and becomes the active view.
    resolvers.get(2)!(
      jsonResponse(200, {
        ...summary(2, 'Fast detail'),
        messages: [message(20, 2, 'user', 'fast conversation body')],
      }),
    );
    await screen.findByText('fast conversation body');

    // The slow response lands afterwards and must be dropped.
    resolvers.get(1)!(
      jsonResponse(200, {
        ...summary(1, 'Slow detail'),
        messages: [message(21, 1, 'user', 'stale conversation body')],
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.queryByText('stale conversation body')).not.toBeInTheDocument();
    expect(screen.getByText('fast conversation body')).toBeInTheDocument();
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
