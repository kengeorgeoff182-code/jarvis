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
});
