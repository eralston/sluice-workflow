import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, launchGallery } from './launch';

// The art gallery: every object in every stage, frozen at fixed instants of the ambient clock.
// Review copies are written to test-results/gallery/ for side-by-side viewing. They're for review
// only, not pixel-exact checks (decided 2026-10-03): the fluid layout follows the window, so renders
// differ across displays. Alignment is checked in gallery-layout.spec.ts instead.

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchGallery());
});
test.afterAll(async () => {
  await app.close();
});

const FAMILIES = ['sky', 'energy', 'galaxy', 'feature', 'story', 'palette', 'bug', 'task', 'flight', 'station', 'ship', 'livery'];
/** Two instants: different phases of the progress pulse, scans, glints, and window lights. */
const FRAMES = [0.8, 1.9];

for (const t of FRAMES) {
  test(`every object in every stage renders in its frame at t = ${t} s (review copies)`, async () => {
    await page.evaluate((s) => window.__starChartGallery!.freeze(s), t);
    await page.waitForTimeout(150); // a few frames at the frozen instant
    for (const family of FAMILIES) {
      const section = page.locator(`.gallery__section[data-family="${family}"]`);
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(50);
      await section.screenshot({ path: `test-results/gallery/${family}-t${t}.png` });
      expect((await page.evaluate(() => window.__starChartGallery!.alignment())).worstPx).toBeLessThan(1);
    }
  });
}

test('the gallery is not reachable from the regular app', async () => {
  const regular = await launchApp();
  try {
    expect(await regular.page.evaluate(() => window.starChart.env.gallery)).toBe(false);
    expect(await regular.page.locator('.gallery').count()).toBe(0);
  } finally {
    await regular.app.close();
  }
});
