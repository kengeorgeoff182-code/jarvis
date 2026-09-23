import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  clean: true,
  // Bundle the workspace contracts package; everything else stays external.
  noExternal: ['@jarvis/shared'],
  // Keep the `node:` protocol on builtin imports (`node:sqlite` → bare
  // `sqlite` under tsup's default rewriting, and bare `sqlite` cannot be
  // resolved by Node — the builtin has no legacy alias). Without this the
  // production bundle builds but crashes at boot.
  removeNodeProtocol: false,
});
