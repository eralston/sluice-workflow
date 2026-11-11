import { defineConfig } from '@playwright/test';

// Specs run in parallel, one Electron app per worker, each with its own userData (tests/e2e/launch.ts;
// decided 2026-10-07). Tests inside a spec stay in order: most share one app and walk a story.
// The pixel baselines (slice1's toHaveScreenshot) and the frame-time budget (perf) run alone,
// afterwards (npm run e2e runs the two projects in turn): GPU contention from the other workers would
// make them flaky. No project dependency: that would drag every spec into a one-spec run.
const ALONE = ['**/slice1.spec.ts', '**/perf.spec.ts'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  workers: Number(process.env.E2E_WORKERS ?? 4),
  reporter: [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  outputDir: 'test-results',
  // Baselines keep their names whichever project runs them (no project in the file name).
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}',
  projects: [
    { name: 'parallel', testIgnore: ALONE },
    { name: 'alone', testMatch: ALONE, fullyParallel: false, workers: 1 },
  ],
});
