# ADR-0002: Fastify for the HTTP API

Status: Accepted (phase 1)

## Context

The API must be small, typed, fast, and testable without binding ports. The
project is TypeScript-first; framework choice should not introduce magic.

## Decision

- **Fastify 5** for `apps/api`.
- Server is built by a `buildApp()` factory (no `listen` inside) so tests
  use `app.inject()` against production wiring.
- Routes are Fastify plugins; versioning via a `/api/v1` prefix at
  registration time.
- Errors flow to one central `setErrorHandler` + `setNotFoundHandler` that
  produce the shared error envelope.

## Consequences

- Fastify's schema support complements zod contracts; outbound payloads are
  validated by `@jarvis/shared` schemas on the way out.
- pino is Fastify's native logger — structured logs come for free.
- Rejected alternatives: Express 5 (less typed, DIY error/logging
  conventions), NestJS (framework weight and decorator magic beyond this
  project's needs), Next.js API routes (couples API to the web app's
  deployment story).
