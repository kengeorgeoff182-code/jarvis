# Jarvis — Engineering Conventions

These are the project's constitution. A change that violates a convention is
a defect, not a preference. Where tooling can enforce a convention, it is
wired into the gate chain (`lint → typecheck → test → build`).

## 1. Repository & modules

- npm workspaces monorepo: `apps/*` (deployables), `packages/*` (libraries).
- Every package is `private: true`. Internal packages are named
  `@jarvis/<name>`.
- A package may only import from `@jarvis/shared`, its own tree, and
  dependencies declared in its own `package.json` — never from sibling apps.
- One lockfile at the root (`package-lock.json`); commits never include
  `node_modules/` or build output.

## 2. Code style (enforced: prettier, eslint)

- Prettier is the only formatter (config: single quotes, semicolons, trailing
  commas, width 100). `npm run format` to apply, `format:check` in the gate.
- ESLint flat config at the root covers all packages; new files must lint
  clean. No `eslint-disable` without a comment explaining why.
- **Strict TypeScript everywhere** (base tsconfig): `strict`, unchecked index
  access, unused locals/params are errors, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`. Type-only imports use `import type`.
- Ban `any` in new code; reach for `unknown` + narrowing instead.
- Prefer explicit discriminated unions over boolean flags in state.

## 3. Naming

| Thing                      | Convention                              | Example                   |
| -------------------------- | --------------------------------------- | ------------------------- |
| Files                      | `kebab-case`                            | `conversation-service.ts` |
| Functions, variables       | `camelCase`, verbs for functions        | `getConversation`         |
| Types, classes, components | `PascalCase`, nouns                     | `ConversationSummary`     |
| Constants (module-level)   | `SCREAMING_SNAKE`                       | `MAX_MESSAGE_LENGTH`      |
| Environment variables      | `SCREAMING_SNAKE`, app-prefixed         | `JARVIS_LLM_API_KEY`      |
| Test files                 | `*.test.ts(x)`, colocated or in `test/` | `health.test.ts`          |
| React components           | function components only                | `ConversationList`        |

Abbreviations stay all-caps where conventional (`API`, `HTTP`, `LLM`).

## 4. API conventions

- Versioned prefix `/api/v1`; bump the version segment for breaking changes
  (do not version individual endpoints).
- Resources are nouns; methods express intent (`GET /conversations/{id}`).
- Every payload (request and response) has a zod contract in
  `packages/shared`, and responses are validated on the way out.
- Clients receive the error envelope on any non-2xx:
  `{ error: { code, message, details? } }`.
- Unknown routes → `404 NOT_FOUND` envelope (never an HTML error page).

## 5. Error handling

- All domain errors are `AppError` from the taxonomy
  (`apps/api/src/errors.ts`): `VALIDATION_ERROR`, `NOT_FOUND`,
  `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`,
  `EXTERNAL_SERVICE_ERROR`, `UNEXPECTED_ERROR`.
- Services throw; **one** central handler (`error-handler.ts`) maps taxonomy
  → HTTP status + envelope. Handlers never guess.
- `details` are only serialized when explicitly marked safe to expose.
- Unknown errors become a generic 500 envelope; full context goes to logs,
  never to the client.
- Do not swallow errors: `catch` only to translate, log, or recover. Empty
  catches require a comment justifying them.

## 6. Validation

- zod is the single validation library (shared + API). No bespoke validators.
- Validate at every boundary, once: env on boot, HTTP input in routes,
  outbound payloads against contracts. Business logic runs on validated data
  and does not re-validate.
- Fail fast: startup with a broken config must crash with a readable message.

## 7. Logging

- pino structured JSON everywhere in the API; no `console.log` in source.
- Levels express severity only: `info` lifecycle, `warn` recoverable
  anomalies, `error` failures (with `err`/stack context attached).
- Attach request context via the Fastify logger; never log secrets, tokens,
  or full request bodies.

## 8. Configuration

- All config is environment-driven; default values must be safe for local
  development. `.env.example` is the documentation; real `.env` is never
  committed.
- Secrets never appear in code, tests, logs, or docs.
- The web client has no runtime configuration story yet (no env vars are
  read in the browser).

## 9. Security

- CORS is an explicit allowlist from config — never `*`.
- Helmet default headers are on.
- No secrets in the repo; `npm audit` runs as part of dependency hygiene.
- Future auth must use a maintained library (e.g. Passport/`@fastify/jwt` +
  proper hashing) — never hand-rolled sessions, tokens, or password storage.
- Treat all external input as untrusted; zod parsing is the choke point.
- Logs and error envelopes must not leak internal state.

## 10. Testing

- Vitest; run with `npm test` from the root (api and web suites).
- Unit tests never hit the network, a real LLM, or the filesystem.
- API tests use Fastify `app.inject()` against the same `buildApp()` wiring
  as production; an LLM provider is injected as a deterministic fake, and
  the real adapter is tested against a stubbed `fetch`.
- Web tests render with Testing Library, assert on user-visible text/roles,
  and stub `fetch`.
- Web a11y: every rendered UI state is also audited with axe-core
  (`expectNoAxeViolations` in `src/test/axe.ts`) — see the
  `accessibility audit` describe block in `App.test.tsx`.
- A change is not done until `format`, `lint`, `typecheck`, `test`, and
  `build` pass.

## 11. Git & commits

- Conventional Commits style: `feat:`, `fix:`, `refactor:`, `docs:`,
  `chore:`, `test:` (+ optional scope).
- Keep commits focused; one logical change each.
- When a remote exists, `main` must stay green and CI runs the same five
  gates as the local scripts.

## 12. React components (from phase 2 on)

- Function components + hooks only; typed props via `interface`.
- Small components; presentational components stay state-free where possible.
- Semantic HTML first (`<main>`, `<nav>`, `<button>`, labels) — no div soup;
  every interactive element reachable by keyboard.
- No inline styles beyond tokens defined in the stylesheet.
- Text that changes asynchronously is announced (`role="status"` +
  `aria-live`) — see `App.tsx` for the pattern.

## 13. Accessibility

- `lang` on `<html>`, one `h1` per page, meaningful `aria-label`s only where
  the visible text is insufficient.
- Focus must never be trapped or lost; visible focus styles are required.
- Color is never the only signal (error text includes an icon or wording).
- Automated axe audits are part of the web test suite (see §10); treat a
  new violation like a failed test — fix the UI, never silence the check.

## 14. Performance

- No premature optimization, but no accidental costs either: stream LLM
  replies once latency matters (currently one request covers the full turn),
  no unbounded client state, indexes before any query in the store, and
  bundle-size awareness in the web app.
