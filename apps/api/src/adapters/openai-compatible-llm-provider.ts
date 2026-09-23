import { z } from 'zod';
import type { ChatMessage, LLMProvider } from '../ports/llm-provider';
import { externalServiceError } from '../errors';

const completionResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const errorResponseSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
});

export interface OpenAICompatibleLLMProviderOptions {
  /** Provider API key. Empty string disables generation with a clear error. */
  apiKey: string;
  /** Base URL of an OpenAI-compatible API, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  model: string;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
}

/**
 * Chat-completions adapter for any OpenAI-compatible API (OpenAI, Ollama,
 * LM Studio, ... — they differ only in base URL and key). Plain global fetch
 * with an AbortController timeout; zero new dependencies. Every failure mode
 * (unconfigured, network, timeout, HTTP error, malformed or empty reply) is
 * translated to a `EXTERNAL_SERVICE_ERROR` AppError for the central handler.
 */
export class OpenAICompatibleLLMProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options: OpenAICompatibleLLMProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    if (this.apiKey.length === 0) {
      throw externalServiceError(
        'LLM provider is not configured: set LLM_API_KEY to enable replies',
      );
    }

    // One deadline covers the WHOLE upstream exchange - connection, headers,
    // AND body. Clearing the timer once fetch() resolves would leave the body
    // read unguarded: a stalled upstream response hangs the route until an
    // infrastructure-level idle timeout (if any) fires.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response | undefined;
    let rawBody: unknown;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages }),
        signal: controller.signal,
      });
      rawBody = await response.json();
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        throw externalServiceError(`LLM request timed out after ${this.timeoutMs}ms`, cause);
      }
      if (response !== undefined) {
        // Headers arrived but the body could not be read (truncated or
        // malformed payload, connection reset mid-response).
        throw externalServiceError('LLM provider returned an invalid response body', cause);
      }
      throw externalServiceError('Could not reach the LLM provider', cause);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(rawBody);
      const providerMessage = parsed.success ? parsed.data.error?.message : undefined;
      throw externalServiceError(
        providerMessage !== undefined
          ? `LLM provider returned HTTP ${response.status}: ${providerMessage}`
          : `LLM provider returned HTTP ${response.status}`,
        rawBody,
      );
    }

    const parsed = completionResponseSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw externalServiceError('LLM provider returned an unexpected response', rawBody);
    }
    const choice = parsed.data.choices[0];
    if (choice === undefined) {
      throw externalServiceError('LLM provider returned an unexpected response', rawBody);
    }
    const content = choice.message.content.trim();
    if (content.length === 0) {
      throw externalServiceError('LLM provider returned an empty reply', rawBody);
    }
    return content;
  }
}
