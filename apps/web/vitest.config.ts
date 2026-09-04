import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Generous timeouts for safety; node_modules is bind-mounted onto WSL
    // ext4 (see docs/adr/0004), so cold loads are fast in practice.
    testTimeout: 30_000,
  },
});
