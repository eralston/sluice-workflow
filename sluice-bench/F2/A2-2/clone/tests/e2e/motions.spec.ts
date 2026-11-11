// Arrive and Depart (decided 2026-10-08; 05 §5): one motion for an object coming into a scene and one
// for one leaving it. Here in playback: a Bug that's Rejected departs along its orbit and is gone; a
// seek back puts it there at once, with no motion (INV-15).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickNode, enterNodeByKey, keyOf, launchApp, settle } from './launch';

let app: ElectronApplication;
let page: Page;
test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_FIXTURE: 'edge-history' })); });
test.afterAll(async () => { await app?.close(); });

const motions = () => page.evaluate(() => window.__starChartTest!.motions());
const has = (title: string) => page.evaluate((t) => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.label === t && n.selectable), title);

test('a Rejected Bug departs (E): along its orbit, fading, then gone; a seek back has it there with no motion', { tag: '@keystone' }, async () => {
  await clickNode(page, await keyOf(page, 'galaxy', 'Driftwood'));
  await page.locator('.chooser button', { hasText: 'Kelp Team' }).click();
  await settle(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Claims photo upload'));
  await settle(page);
  const beat = await page.evaluate((t) => window.__starChartTest!.beatTimes().find((b) => b.sourceUtc === t)!, Date.parse('2026-09-17T20:00:00Z'));
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), beat.startMs - 1);
  await page.waitForTimeout(60);
  expect(await has('Upload fails for HEIC photos')).toBe(true);
  const before = await motions();
  await page.evaluate(() => window.__starChartTest!.stepBeat());
  await expect.poll(async () => (await motions()).depart).toBeGreaterThan(before.depart);
  expect(await has('Upload fails for HEIC photos')).toBe(false);
  await page.waitForTimeout(450);
  await page.screenshot({ path: 'test-results/motions-1-depart.png' });
  await expect.poll(async () => (await motions()).active, { timeout: 5_000 }).toBe(0);
  // A seek back: it's simply there again (no Arrive on a seek).
  const settled = await motions();
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), beat.startMs - 1);
  await page.waitForTimeout(100);
  expect(await has('Upload fails for HEIC photos')).toBe(true);
  expect(await motions()).toEqual({ ...settled, active: 0 });
});
