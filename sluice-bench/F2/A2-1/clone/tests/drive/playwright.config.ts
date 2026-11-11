import { defineConfig } from '@playwright/test';

// The driver (decided 2026-10-07): not a test suite. One run of a steps script against the built app,
// for looking at a change for real. See tests/drive/README.md.
export default defineConfig({
  testDir: '.',
  testMatch: 'drive.ts',
  timeout: 10 * 60_000,
  workers: 1,
  reporter: [['line']],
  outputDir: '../../test-results/drive/.playwright',
});
