import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Generous timeouts for safety; node_modules is bind-mounted onto WSL
    // ext4 (see docs/adr/0004), so cold loads are fast in practice.
    testTimeout: 30_000,
  },
});
