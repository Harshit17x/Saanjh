import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Tests never touch the network: the server is built from injected ports and
 * tests pass in-memory fakes. Web tests opt into jsdom with a file docblock.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts', 'server/**/*.ts', 'web/src/**/*.{ts,tsx}'],
      exclude: [
        // Process entry points: wiring only, exercised by the smoke test against a running server.
        'server/index.ts',
        'web/src/main.tsx',
        // Thin client for a managed database; its behaviour is mirrored by the tested in-memory adapter.
        'server/adapters/firestore/**',
      ],
      reporter: ['text-summary', 'text', 'html'],
      thresholds: {
        'shared/**': { lines: 90, functions: 90, branches: 85, statements: 90 },
        'server/**': { lines: 90, functions: 90, branches: 80, statements: 90 },
        'web/src/**': { lines: 80, functions: 75, branches: 70, statements: 80 },
      },
    },
  },
});
