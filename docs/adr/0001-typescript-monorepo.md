# ADR-0001: TypeScript npm-workspaces monorepo

Status: Accepted (phase 1)

## Context

Jarvis needs an API, a web client, and shared wire contracts. The only
available toolchain is Node 24 in WSL; no Rust/Go toolchains are installed.
The team (human + AI) benefits from a structure that makes cross-boundary
contracts explicit and keeps drift impossible by construction.

## Decision

- One TypeScript monorepo using npm workspaces:
  `apps/api`, `apps/web`, `packages/shared`.
- Strict TypeScript enforced by a shared base tsconfig
  (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`).
- `packages/shared` is consumed as source (exports point at `src/*.ts`);
  each consumer's toolchain (tsx, Vite, tsup) compiles it. No build step
  for shared in phase 1.

## Consequences

- Type-safe contracts prevent silent API/UI drift — the main failure mode
  of vibe-coded frontend/backend pairs.
- One language and one package manager across the repo lowers cognitive
  load; `erasableSyntaxOnly` keeps code runnable by future Node type
  stripping.
- Shared-as-source couples consumers to the shared package's layout;
  acceptable at this scale, revisit if shared grows a public API surface
  for external consumers.
