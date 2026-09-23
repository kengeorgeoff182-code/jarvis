# ADR-0006: LLM reply generation through a provider port

Status: Accepted (phase 2)

## Context

The chat core persists conversations and messages, but assistant replies do
not exist: `POST /conversations/:id/messages` stores only the user turn. The
roadmap (ADR-0003, architecture.md §6) reserves an LLM provider port; this
ADR settles how reply generation is wired into the message endpoint and how
providers are plugged in.

## Decision

- **New port** `ports/llm-provider.ts` with
  `chat(messages: ChatMessage[]) → Promise<string>`. Services depend on the
  interface, never on a concrete adapter, honoring the one-directional
  layering (`routes → services → ports/adapters`).
- **First adapter** `OpenAICompatibleLLMProvider`: plain global `fetch`
  against `<LLM_BASE_URL>/chat/completions` with an `AbortController`
  timeout. OpenAI-compatible APIs (OpenAI, Ollama, LM Studio, ...) differ
  only in base URL and key, so one adapter covers them — zero new
  dependencies (Node 24 ships fetch and AbortController).
- **Config via env** (validated by the existing zod schema, documented in
  `.env.example`): `LLM_BASE_URL` (default `https://api.openai.com/v1`),
  `LLM_API_KEY` (empty by default), `LLM_MODEL` (default `gpt-4o-mini`),
  `LLM_TIMEOUT_MS` (default 30000).
- **Generate-then-persist, atomically.** Sending a message generates the
  reply BEFORE any write, then stores the user and assistant turns in one
  transaction (the store port grew `addMessages`, replacing the single
  `addMessage`). A provider failure therefore persists nothing and returns
  `502 EXTERNAL_SERVICE_ERROR`; the web client keeps its draft, so nothing
  is lost and nothing is fabricated.
- **Unconfigured is a clear 502, not a crash.** An empty `LLM_API_KEY` is
  allowed at boot (history still serves); sending then fails with a message
  naming the missing variable, before any network call.
- **Streaming is deliberately out of this slice.** The port's synchronous
  shape is a subset of the roadmap's `AsyncIterable<Chunk>` design; a
  streaming variant can be added without reshaping services.
- Provider negotiation via a `LLM_PROVIDER` env switch is deferred until a
  genuinely different API shape (e.g. Anthropic) lands.

## Consequences

- `POST /conversations/:id/messages` response changed from a single
  `Message` to `{ userMessage, assistantMessage }` — a breaking change to
  the v1 contract (no external consumers yet; both fields are validated by
  `appendMessageResponseSchema` in `@jarvis/shared`).
- Reply generation is synchronous: the HTTP request covers LLM latency, and
  the Composer stays disabled with "Sending…" until the full turn returns.
  Streaming + typing indicators are the natural next step.
- Tests inject a deterministic fake provider through `buildApp({ llm })`
  (never a real LLM or network); the real adapter is unit-tested against a
  stubbed `fetch`, covering request shape, HTTP errors, timeouts, and
  malformed/empty replies.
- The transcript renders any stored role (user/assistant/system), so no UI
  changes were needed beyond appending both messages from the new response.
