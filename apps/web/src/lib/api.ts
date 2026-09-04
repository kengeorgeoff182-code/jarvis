import {
  conversationDetailSchema,
  conversationListResponseSchema,
  conversationSummarySchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  messageSchema,
  type ConversationDetail,
  type ConversationListResponse,
  type ConversationSummary,
  type HealthResponse,
  type Message,
} from '@jarvis/shared';

const API_BASE = '/api/v1';

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

async function parseErrorResponse(body: unknown, fallbackMessage: string): Promise<ApiError> {
  const parsed = errorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(parsed.data.error.code, parsed.data.error.message);
  }
  return new ApiError('UNKNOWN_ERROR', fallbackMessage);
}

/** Minimal structural shape of a zod schema — enough for inbound validation. */
interface Parser<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false };
}

/**
 * Shared request path used by every client function. All responses are
 * validated against the shared zod contracts, so a breaking API change
 * surfaces here as a typed error instead of silent undefined access.
 */
async function apiRequest<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; schema: Parser<T> },
): Promise<T> {
  const { method = 'GET', body, schema } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the Jarvis API.');
  }

  const data: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw await parseErrorResponse(data, `Request failed with status ${response.status}`);
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError('INVALID_RESPONSE', 'The API returned an unexpected payload.');
  }
  return parsed.data;
}

export function fetchHealth(): Promise<HealthResponse> {
  return apiRequest(`${API_BASE}/health`, { schema: healthResponseSchema });
}

export function listConversations(): Promise<ConversationListResponse> {
  return apiRequest(`${API_BASE}/conversations`, { schema: conversationListResponseSchema });
}

export function createConversation(): Promise<ConversationSummary> {
  return apiRequest(`${API_BASE}/conversations`, {
    method: 'POST',
    body: {},
    schema: conversationSummarySchema,
  });
}

export function getConversation(id: number): Promise<ConversationDetail> {
  return apiRequest(`${API_BASE}/conversations/${id}`, {
    schema: conversationDetailSchema,
  });
}

export function sendMessage(id: number, content: string): Promise<Message> {
  return apiRequest(`${API_BASE}/conversations/${id}/messages`, {
    method: 'POST',
    body: { content },
    schema: messageSchema,
  });
}
