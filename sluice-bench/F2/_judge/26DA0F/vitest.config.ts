import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@fixtures': resolve(__dirname, 'fixtures'),
      '@config': resolve(__dirname, 'config'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/golden/**/*.test.ts'],
    environment: 'node',
  },
});
