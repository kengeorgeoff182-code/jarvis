import {
  errorEnvelopeSchema,
  healthResponseSchema,
  type HealthResponse,
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

/**
 * Fetches the API health status. All responses are validated against the
 * shared zod contracts, so a breaking API change surfaces here as a typed
 * error instead of silent undefined access.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/health`);
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the Jarvis API.');
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw await parseErrorResponse(body, `Request failed with status ${response.status}`);
  }

  const parsed = healthResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('INVALID_RESPONSE', 'The API returned an unexpected payload.');
  }
  return parsed.data;
}
