import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchGallery } from './launch';

// 27 F2, summon on the fly: the gallery's jump-in cell (the `facility.enter` maneuver demo, pod-sprint) loops in
// full and in reduced motion with no console errors. In full motion the summoner passes its spot without
// stopping: from its first move to its last its ship never sits still (no hold, no fly-back after one). Under
// reduced motion it doesn't fly at all: the blip and the arrival play at its place. Fixture data only (INV-18).

/**
 * The demos' test hooks (gallery/maneuverDemos.ts), typed here as the e2e project can't import it. F2 adds three
 * fields to every demo's stats, over its last finished loop: `agentStillMs`, the longest the cast's first agent's
 * ship sat still between its first move and its last (ms, 0 when it never moved), and `agentTravel` /
 * `reducedAgentTravel`, how far (world units) that ship travelled in the last loop in full / reduced motion.
 */
interface DemoStats {
  id: string; rule: string; state: string; loops: number; reducedLoops: number; stuck: number; started: number; peak: number;
  agentStillMs?: number; agentTravel?: number; reducedAgentTravel?: number;
}
type DemoWindow = Window & { __starChartGalleryDemos?: { list(): DemoStats[]; setReduced(on: boolean): void; reduced(): boolean } };

let app: ElectronApplication;
let page: Page;
const errors: string[] = [];

test.beforeAll(async () => {
  ({ app, page } = await launchGallery());
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Listening from the first module on: load the gallery again with the listeners attached.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__starChartGallery), undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__starChartGallery!.ready);
});
test.afterAll(async () => {
  await app.close();
});

const RULE = 'facility.enter';
const jumpIn = async () => (await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos?.list() ?? [])).find((d) => d.rule === RULE);

test('the jump-in cell: the summoner passes without stopping, and under reduced motion doesn\'t fly; no console errors (27 F2)', async () => {
  test.setTimeout(240_000); // the demos run on the page's own clock, which a loaded machine slows; the waits are conditions
  const cell = page.locator(`[data-art="maneuvers:${RULE}"]`);
  await expect(cell, 'the jump-in cell').toHaveCount(1);
  await cell.scrollIntoViewIfNeeded();

  // Full motion: a loop that started and cleared, flown with no hold.
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
  await expect.poll(async () => (await jumpIn())?.loops ?? 0, { timeout: 120_000, intervals: [250] }).toBeGreaterThan(0);
  const full = (await jumpIn())!;
  expect(full.stuck, 'the jump-in never cleared').toBe(0);
  expect(full.started, 'the jump-in never started').toBeGreaterThan(0);
  expect(full.agentTravel, 'the summoner flies (agentTravel)').toBeGreaterThan(0);
  // A frame of the gallery's clock is at most 100 ms (maneuverDemos.ts): a stop is anything longer than about one.
  expect(full.agentStillMs, 'no hold between the flight and its rest (agentStillMs)').toBeLessThanOrEqual(120);
  await expect.poll(async () => (await jumpIn())?.state, { timeout: 60_000, intervals: [100] }).toBe('play');
  await cell.screenshot({ path: 'test-results/gallery/f2-jump-in-full.png' });

  // Reduced motion: the demo restarts; a loop that was reduced throughout lands and clears, and the ship stays put.
  const before = (await jumpIn())!.reducedLoops;
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(true));
  await expect.poll(async () => (await jumpIn())?.reducedLoops ?? 0, { timeout: 120_000, intervals: [250] }).toBeGreaterThan(before);
  const reduced = (await jumpIn())!;
  expect(reduced.stuck, 'the jump-in never cleared under reduced motion').toBe(0);
  expect(reduced.reducedAgentTravel, 'the ship doesn\'t fly under reduced motion (reducedAgentTravel)').toBeLessThan(1e-3);
  await expect.poll(async () => (await jumpIn())?.state, { timeout: 60_000, intervals: [100] }).toBe('play');
  await cell.screenshot({ path: 'test-results/gallery/f2-jump-in-reduced.png' });
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));

  expect(errors).toEqual([]);
});
