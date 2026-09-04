# ADR-0005: Conversation persistence with node:sqlite

Status: Accepted (phase 2)

## Context

Phase 2 introduces the conversation model: chat sessions and their messages
must survive API restarts. Requirements are modest — a local, single-user
assistant; no multi-process writes, no replication, no cloud. The toolchain
constraints matter: dependencies are installed through a WSL `/mnt/c` mount,
so native compilation is expensive and fragile, and the repo may relocate
(ADR-0004) without the database coupling to a path.

Options considered:

- **Postgres (Docker)**: operationally heavy for a single-user local app;
  adds a container dependency to every dev environment and to CI.
- **better-sqlite3**: excellent library, but a native module (prebuilt
  binaries or node-gyp on install) — brittle in this environment.
- **`node:sqlite`** (built into Node ≥ 22.5): zero install cost, zero native
  build, synchronous API that suits Fastify handlers, file-based persistence.

## Decision

- Persist conversations and messages in **SQLite via the built-in
  `node:sqlite` module** (`DatabaseSync`), stored in a gitignored file at
  `DB_PATH` (default `apps/api/data/jarvis.db`).
- Persistence sits behind the **`ConversationStore` port**
  (`src/ports/conversation-store.ts`); the SQLite implementation is one
  adapter (`src/adapters/sqlite-conversation-store.ts`). Services depend on
  the port, honoring the architecture's one-directional layering, so storage
  can graduate to Postgres without touching business logic.
- Schema creation is idempotent (`CREATE TABLE IF NOT EXISTS`) and applied
  on every boot, including to injected in-memory databases used by tests.
- Column aliasing makes rows match the shared zod contracts directly;
  outbound validation at the route boundary is the final shape guarantee.

## Consequences

- Zero new dependencies; `node:sqlite` requires Node ≥ 22.5 — the repo
  already requires ≥ 24 (`engines`, `.nvmrc`).
- WAL journal mode keeps readers unblocked; foreign keys are enforced.
- The `.db` file lives under the repo and is gitignored — fine while the
  repo stays in OneDrive, but relocation (ADR-0004) should move `data/`
  too, and a future multi-process or multi-user deployment should revisit
  this ADR (SQLite is a single-writer store).
- Schema changes are additive DDL today; a migration story (versioned
  migrations) becomes necessary once the schema evolves past additive
  changes.
