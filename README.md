# Jarvis

Personal AI assistant — foundation phase.

This repository is the phase-1 engineering baseline for Jarvis: a typed
TypeScript monorepo with an HTTP API, a web client, and shared wire
contracts, plus the architecture and conventions that future phases build
on. It contains **no feature functionality yet** — by design, nothing is
stubbed or mocked.

## Repository layout

```
apps/api        Fastify HTTP API (health endpoint, error taxonomy,
                env validation, structured logging)
apps/web        React + Vite client (typed API client, a11y baseline)
packages/shared Shared zod contracts + inferred types (single source of
                truth for every cross-boundary payload)
docs/           architecture.md, conventions.md, adr/
```

## Prerequisites

- Node.js ≥ 24 (the toolchain lives in WSL Ubuntu on this machine; all npm
  commands below run inside WSL).

## Quick start

From inside WSL (repo is reachable at `/mnt/c/Users/kenge/OneDrive/PES/jarvis`):

```bash
npm install

# Terminal 1 — API on http://localhost:3000
npm run dev:api

# Terminal 2 — web client on http://localhost:5173
npm run dev:web
```

Open http://localhost:5173 — the page shows the live API connection status.

## Verification gates (all must pass before any change is done)

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit across all workspaces
npm run test         # Vitest (api via inject, web via Testing Library)
npm run build        # tsup (api) + vite build (web)
```

## API

| Endpoint | Description |
|---|---|
| `GET /api/v1/health` | Liveness: `{ status, service, version, uptimeSeconds, timestamp }` |

Every non-2xx response uses the error envelope
`{ "error": { "code", "message", "details?" } }`.

## Configuration

Copy `apps/api/.env.example` to `apps/api/.env` and adjust. All variables
are optional locally; the schema in `apps/api/src/config.ts` validates the
environment at startup and fails fast with a per-variable report.

## Conventions

Read `docs/conventions.md` — it is the project's constitution (style,
naming, API, errors, validation, logging, config, security, testing, git).
Architecture and decisions: `docs/architecture.md`, `docs/adr/`.

## Known limitations

- The repo sits inside OneDrive (cloud sync + git is risky). Cold-loading
  `node_modules` from `/mnt/c` is pathologically slow, so the dependency
  tree is bind-mounted onto WSL ext4 by a systemd unit
  (`jarvis-node-modules.service`). Verify with `mountpoint node_modules`
  inside WSL. Dev-server watch mode on `/mnt/c` remains unreliable and the
  WSL VM idle-terminates ~60s after the last `wsl.exe` exits, so keep a
  terminal open while developing. See `docs/adr/0004-repo-location.md`;
  relocation is a planned follow-up.
- No CI yet — no remote repository exists. The local gate chain is the CI
  contract for now.
