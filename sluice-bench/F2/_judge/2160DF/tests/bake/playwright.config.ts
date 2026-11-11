import { defineConfig } from '@playwright/test';

// `npm run bake:asteroids` (23 C7): one run of bake.ts against the built app's art gallery.
export default defineConfig({
  testDir: '.',
  testMatch: 'bake.ts',
  timeout: 120_000,
  workers: 1,
  reporter: [['line']],
  outputDir: '../../test-results/bake/.playwright',
});
