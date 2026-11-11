// Player: the `All events` chip (23 D1) and the insignia on the beat (23 D2). Fixture data only (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, settle } from './launch';

const userData = mkdtempSync(join(tmpdir(), 'star-chart-e2e-allevents-'));
const env = { STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_USER_DATA: userData };

let app: ElectronApplication;
let page: Page;

/** Galaxy → Tidewater Array's Sprint 13 → Harbor Pod. */
async function openRegion(p: Page): Promise<void> {
  await p.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await p.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await p.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(p);
  await p.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await p.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(p);
}

const chip = () => page.locator('.transport__allevents');
const schedule = () => page.evaluate(() => ({ s: window.__starChartTest!.session(), beats: window.__starChartTest!.beatTimes() }));

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ app, page } = await launchApp(env));
  await openRegion(page);
});
test.afterAll(async () => { await app?.close(); });

test('All events (D1): the chip accents every beat, keeps the playhead, and is for this session only', async () => {
  await expect(chip()).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs / 2));
  await page.waitForTimeout(100);
  const before = await schedule();
  await page.screenshot({ path: 'review/v1.3/D/D1-chip-off.png' });
  await chip().click();
  await expect(chip()).toHaveAttribute('aria-pressed', 'true');
  const after = await schedule();
  expect(after.beats.length).toBe(before.beats.length);
  expect(after.beats.filter((b) => b.accented).length).toBeGreaterThan(before.beats.filter((b) => b.accented).length); // a busy pod: the budget had cut some
  expect(after.s.totalMs).toBeGreaterThanOrEqual(before.s.totalMs);
  expect(Math.abs(after.s.playheadUtc! - before.s.playheadUtc!)).toBeLessThan(2 * 3_600_000); // re-scheduled at the playhead
  await page.screenshot({ path: 'review/v1.3/D/D1-chip-on.png' });
  await chip().click();
  await expect(chip()).toHaveAttribute('aria-pressed', 'false');
  expect((await schedule()).beats.filter((b) => b.accented).length).toBe(before.beats.filter((b) => b.accented).length);

  // Session only: on, then a relaunch, and it is off.
  await chip().click();
  await app.close();
  ({ app, page } = await launchApp(env));
  await openRegion(page);
  await expect(chip()).toHaveAttribute('aria-pressed', 'false');
});

test('Insignia on the beat (D2): a beat’s award lights from the beat’s start, not after the calm wait', async () => {
  await page.locator('.settings-button').click();
  await page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
  const who = page.locator('select[data-log="viewer-choose"]');
  await who.selectOption((await who.locator('option', { hasText: 'Wren Calloway' }).getAttribute('value'))!);
  await page.keyboard.press('Escape');
  const awards = await page.evaluate(() => window.__starChartTest!.awards());
  expect(awards.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__starChartTest!.insignias())).toEqual([]);
  // Step into the beat that holds the first award, and let it play at 1×.
  const at = Math.min(...awards.map((a) => a.earnedAt.atUtc));
  const beat = await page.evaluate((t) => window.__starChartTest!.beatTimes().find((b) => b.sourceUtc >= t)!, at);
  await page.evaluate((ms) => window.__starChartTest!.setScheduleMs(ms), beat.startMs - 1);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__starChartTest!.stepBeat());
  await page.waitForFunction(() => window.__starChartTest!.insignias().length > 0, undefined, { timeout: 6_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'review/v1.3/D/D2-insignia-on-beat.png' });
  const lit = await page.evaluate(() => window.__starChartTest!.insignias());
  expect(lit[0]!.lagMs).not.toBeNull();
  expect(lit[0]!.lagMs!).toBeLessThan(400); // was up to 4.3 s behind the beat
});
