# Jarvis Roadmap

Phased delivery plan for Jarvis, a personal AI assistant (chat first, voice
later — ADR-0003). Each phase ships in small, independently verifiable
slices; every slice must pass the five gates (format · lint · typecheck ·
test · build) and be exercised end-to-end against the real built artifacts
before it is considered done. Status is kept honest: nothing is marked done
until its acceptance criteria are demonstrably met.

## How each slice proceeds

1. **Design** — decide the approach, write or amend an ADR when the choice
   is architectural and not obvious from the conventions docs.
2. **Implement** — shared contracts first, then API (port → adapter →
   service → route), then web (typed client → view). Follow
   `docs/conventions.md`; do not invent parallel patterns.
3. **Test** — unit tests per layer, integration tests through `app.inject()`
   with in-memory databases and fake providers, web tests with stubbed
   fetch, axe audits for every rendered state.
4. **Verify live** — boot the production bundle, exercise the changed paths
   over real HTTP (and in a real browser for UI work), including failure
   modes, not only the happy path.
5. **Review** — adversarial pass over the diff: boundary conditions, state
   desync, error mapping, resource leaks. Fix defects in the slice; report
   out-of-scope findings without expanding the diff.
6. **Commit** — focused conventional commits (`feat:`, `fix:`, `chore:`,
   `docs:`); CI runs the same five gates on every push.

## Definition of done (every slice)

- [ ] Five gates green locally on the exact committed tree.
- [ ] New behavior covered by tests, including at least one failure path.
- [ ] Live-verified against the built artifacts, failure modes included.
- [ ] Docs updated where behavior or conventions changed (README,
      architecture, conventions, ADR if applicable).
- [ ] Accessibility audited for any new or changed UI state.

## Phase 1 — Engineering foundation ✅

Monorepo skeleton, shared zod contracts, Fastify API with error taxonomy and
env validation, React client skeleton, Vitest suites, ESLint + Prettier +
typecheck gates, GitHub Actions CI, architecture/conventions docs, ADRs
0001–0004.

**Accepted:** gates green, CI wired, application boots and serves health.

## Phase 2 — Conversation core ✅

Persisted conversations end to end: SQLite store behind a `ConversationStore`
port (ADR-0005), conversation CRUD + message append over `/api/v1`,
first-message titling, chat UI (sidebar, transcript, composer, draft
retention), typed client, axe a11y audits, LLM replies through an
`OpenAICompatibleLLMProvider` port (ADR-0006) with atomic generate-then-
persist turns and explicit 502 handling for unconfigured/failing providers.

**Accepted:** 28 tests green, live-verified persistence across restart,
replies generated through a mock OpenAI-compatible upstream, production
bundle boots (tsup `node:sqlite` fix).

## Phase 3 — State integrity & reliability ← current

Goal: the client can never lose or duplicate a persisted message, and no
request path can hang.

- **3.1 Send-flow state machine** _(this slice)_ — post-send refreshes are
  best-effort: a failed sidebar/title refresh after a successful persist
  shows a notice but does not report the send as failed (the draft must not
  survive a persisted turn — that is the duplicate-send trap). Stale async
  detail fetches can no longer clobber a conversation the user switched to.
- **3.2 API timeout hardening** — LLM provider deadline already covers the
  full response (headers + body) after the adversarial review; add a request
  body size limit and server-level request timeout as belt-and-braces.
- **3.3 Provider resilience** — bounded retry with backoff for transient
  upstream failures (429/5xx/network), only when safe (no side effects yet);
  explicit non-retryable classification.

**Acceptance:** regression tests prove no duplicate-send path exists; live
failure-mode probes (stalled upstream, refresh failure) behave as specified;
gates green.

## Phase 4 — Operations hardening

Goal: safe to run unattended.

- Rate limiting on message-send (protect the LLM budget).
- Request IDs in logs; structured request/response logging with redaction
  review (never log message content or keys).
- Graceful shutdown (drain connections, close SQLite cleanly).
- Health endpoint gains a readiness view (DB reachable, provider configured).
- CI: workflow runs on PRs too; artifact retention and concurrency settings.

**Acceptance:** kill -TERM drains cleanly; logs carry request IDs; limits
verified by probe scripts.

## Phase 5 — Conversation UX depth

Goal: a chat client that feels finished.

- Delete and rename conversations (shared contracts + API + UI).
- Markdown rendering in assistant messages (sanitized; axe-audited).
- Streaming assistant replies (amend ADR-0006; port gains a streaming
  variant; UI renders incrementally with a cancel path).
- Optimistic user-message rendering with rollback on failure.
- Keyboard navigation and focus management polish; empty/error state copy.

**Acceptance:** every new UI state axe-clean; streaming verified against a
chunked mock upstream; gates green.

## Phase 6 — Multi-user foundation

Goal: more than one user, safely.

- Session auth (cookie-based), user-scoped data (schema migration adding
  `user_id`), per-user conversation isolation enforced in services.
- Storage graduation path exercised: the store port makes a Postgres adapter
  a drop-in (ADR-0005 follow-up when actually needed).

**Acceptance:** cross-user access attempts return 404; migration tested
against a copy of real data; gates green.

## Phase 7 — Assistant capabilities (voice later)

Goal: from chat transcript to actual assistant.

- Tool-use framework behind a port (providers declare tools; service
  orchestrates calls with per-tool validation and timeouts).
- Voice input/output per ADR-0003 (speech-to-text first, TTS after).

**Acceptance:** a scripted tool conversation works end-to-end with a mock
provider; voice slice only after chat capabilities are stable.

## Standing rules

- Five gates before any commit; CI must stay green on `main`.
- No mock data in production paths; providers faked only in tests.
- Every architectural decision gets an ADR before the code lands.
- Working tree stays clean of unrelated changes; commits stay focused.
