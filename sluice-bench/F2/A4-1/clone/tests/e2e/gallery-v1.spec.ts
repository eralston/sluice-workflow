import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { launchGallery } from './launch';

// The v1 gallery families (13-game-design.md §4): every cycling cell pinned to each of its steps in
// turn, so one screenshot per step shows every state and colourway. Review copies only (decided
// 2026-10-03), like gallery.spec.ts. GALLERY_FAMILY limits the run to one family; GALLERY_SHOTS
// moves the output folder (default test-results/gallery-v1).

const FAMILIES = (process.env.GALLERY_FAMILY ?? 'v1-worlds,v1-asteroids,v1-swarm,v1-stations,v1-fleet').split(',');
const OUT = process.env.GALLERY_SHOTS ?? 'test-results/gallery-v1';
/** Instants within each step to capture (GALLERY_FRAMES, comma-separated seconds); one by default. */
const FRAMES = (process.env.GALLERY_FRAMES ?? '1.2').split(',').map(Number);

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchGallery());
  mkdirSync(OUT, { recursive: true });
});
test.afterAll(async () => {
  await app.close();
});

for (const family of FAMILIES) {
  test(`${family}: every step of every cycling cell renders in its frame (review copies)`, async () => {
    // The stations family alone takes about 50 s (one screenshot per step of every cell, and the
    // transformation cells keep growing), so the default 60 s times out under the full parallel run.
    test.setTimeout(150_000);
    const section = page.locator(`.gallery__section[data-family="${family}"]`);
    if (!(await section.count())) test.skip(true, `${family} has no art yet`);
    const steps = Math.max(1, await page.evaluate((f) => window.__starChartGallery!.cycleLength(f), family));
    for (let i = 0; i < steps; i++) {
      await page.evaluate((n) => window.__starChartGallery!.setCycle(n), i);
      for (const [f, t] of FRAMES.entries()) {
        await page.evaluate((s) => window.__starChartGallery!.freeze(s), t);
        await page.waitForTimeout(150); // a few frames at the pinned step and instant
        await section.scrollIntoViewIfNeeded();
        await page.waitForTimeout(50);
        await section.screenshot({ path: `${OUT}/${family}-c${i}${FRAMES.length > 1 ? `-f${f}` : ''}.png` });
        expect((await page.evaluate(() => window.__starChartGallery!.alignment())).worstPx).toBeLessThan(1);
      }
    }
    await page.evaluate(() => window.__starChartGallery!.setCycle(null));
  });
}
