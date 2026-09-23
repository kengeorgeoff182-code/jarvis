# Jarvis — Architecture

Status: phase 2 in progress. Persisted conversations and LLM reply
generation are implemented; voice is planned below but deliberately not
implemented yet.

## 1. System overview

Jarvis is a personal AI assistant. The product is **chat-first**; voice
(STT/TTS) is an explicitly planned later module and the architecture keeps a
seat for it (see §6). Everything runs as a local web application in phase 1.

```
┌────────────────────────────┐         HTTP/JSON over one origin
│  apps/web  React + Vite    │  ──────────────────────────────────┐
│  (presentation only)       │    browser → /api/* proxied to API  │
└────────────────────────────┘                                     ▼
                                                  ┌──────────────────────────────┐
                                                  │ apps/api  Fastify            │
                                                  │ routes (HTTP only)           │
                                                  │   ↓                          │
                                                  │ services (business logic)    │
                                                  │   ↓                          │
                                                  │ ports & adapters (future:    │
                                                  │   LLM provider, memory, ...) │
                                                  └──────────────────────────────┘
        ┌───────────────────────────────────────────────────────────────┐
        │  packages/shared — contracts only                              │
        │  zod schemas + inferred types for every cross-boundary payload │
        └───────────────────────────────────────────────────────────────┘
```

## 2. Architectural boundaries (enforced)

1. **`packages/shared` owns every cross-process payload.** API responses,
   request bodies, and the error envelope are defined here as zod schemas.
   The API validates outbound data with them; the web client parses inbound
   data with them. Neither side defines the other side's wire format.
2. **API layering is one-directional:**
   `routes → services → ports/adapters`.
   - Routes: HTTP only — parse input (Fastify schema/zod), call a service,
     return serializable data. No business logic.
   - Services: business logic only — no framework, no HTTP, no `request`/
     `reply`. They throw `AppError` from the taxonomy.
   - Ports/adapters: interfaces (ports) plus implementations (adapters) for
     anything external (LLM providers, persistence, clock). Services depend
     on ports, never on concrete adapters.
3. **Web layering is one-directional:**
   `pages/views → components → hooks → lib`.
   - `lib/` is the only place that talks HTTP (see `src/lib/api.ts`).
   - Components never call `fetch` directly.
4. **One module boundary rule:** code may only import from lower layers of
   its own app, the sibling layers above it, and `@jarvis/shared`. Cross-app
   imports (`apps/web` importing `apps/api`, or vice versa) are forbidden.

## 3. Modules

| Module               | Purpose                                           | Status     |
| -------------------- | ------------------------------------------------- | ---------- |
| `packages/shared`    | Wire contracts (zod) + inferred types             | ✅ phase 1 |
| `apps/api`           | HTTP API: health, error taxonomy, config, logging | ✅ phase 1 |
| `apps/web`           | SPA shell + typed API client                      | ✅ phase 1 |
| Conversation service | Chat sessions, message store, reply generation    | ✅ phase 2 |
| Memory / persistence | SQLite conversation history behind a store port   | ✅ phase 2 |
| LLM provider         | Provider port + OpenAI-compatible adapter (fetch) | ✅ phase 2 |
| Auth                 | Local single-user identity (see conventions)      | 🔜         |
| Voice                | STT + TTS + wake word as adapters behind ports    | 🔜 phase 3 |

## 4. API conventions (summary)

See `docs/conventions.md` for the full text.

- Versioned prefix: `/api/v1`.
- Every endpoint: `GET`/`POST` + resource nouns, no verbs in paths.
- Success: 2xx with the documented contract payload.
- Failure: the shared error envelope
  `{ "error": { "code", "message", "details?" } }` — never a raw exception.
- Outbound payloads are validated against the shared schema (fail loud, not
  silent).

## 5. Configuration & environment

- Every setting arrives through the environment; nothing is read from
  `process.env` outside `apps/api/src/config.ts`.
- `apps/api/.env.example` documents every variable. Real values live in a
  gitignored `.env`.
- The whole env is validated by one zod schema at startup; the process fails
  fast with a per-variable message if anything is wrong.
- Web has no server-side config in phase 1 (Vite dev proxy is developer
  tooling, not app config).

## 6. Roadmap (design intent — do not build ahead of need)

Implemented in phase 2:

- **Conversation persistence**: SQLite via the built-in `node:sqlite`, behind
  the `ConversationStore` port (`src/ports/conversation-store.ts`); see
  ADR-0005. Storage can graduate to Postgres by adding an adapter, never by
  editing services.
- **LLM reply generation**: the `LLMProvider` port
  (`src/ports/llm-provider.ts`, `chat(messages) → string`) with an
  OpenAI-compatible adapter (`src/adapters/openai-compatible-llm-provider.ts`,
  plain fetch, ADR-0006). Sending a message generates the reply before
  persisting user + assistant turns atomically; provider failures return
  `502 EXTERNAL_SERVICE_ERROR` and persist nothing. New providers are new
  adapters, never edits to services.

Planned next:

- **Streaming replies**: a streaming variant of the `LLMProvider` port
  (`AsyncIterable<Chunk>`) so the transcript can render tokens as they
  arrive instead of waiting for the full turn.
- **Voice**: `speech-to-text` and `text-to-speech` ports + adapters; the
  conversation service does not know whether input came from typing or
  microphone.
- **Auth**: single-user local app; when real auth arrives use a proven
  library (never hand-rolled crypto/sessions).

## 7. Non-goals (phase 1)

- No LLM calls, no chat endpoints, no persistence, no auth, no voice.
- No mock data and no stub services pretending to be features.
- No deployment/CI config yet (no remote repository exists); the verification
  chain is fully scripted locally (`lint → typecheck → test → build`).
