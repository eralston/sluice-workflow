// 23 D4-D6: Todo and CRM regions play (their scene keys come from their board facts, not v0's User
// Story / Bug membership), and the chrome speaks their own words: a Week or a Quarter, a List or a
// Territory, never Sprint or Area Path. Fixture data only (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { frames, launchApp, settle } from './launch';

const sceneIs = (page: Page, level: string) => page.waitForFunction((l) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(`${l}:`), level, { timeout: 30_000 });
const STILLS = 'review/v1.3/D';

const PACKS = [
  { name: 'crm-quarter', project: 'Larch & Pine Trading', round: 'Q3 2026', region: 'North Territory', roundWord: 'Quarter', regionWord: 'Territory' },
  { name: 'todo-week', project: 'Juniper Household', round: 'Week 41', region: 'House', roundWord: 'Week', regionWord: 'List' },
];

for (const p of PACKS) {
  test.describe(`${p.name}: the region plays, in its own words (D4, D5)`, () => {
    let app: ElectronApplication;
    let page: Page;
    test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: p.name })); });
    test.afterAll(async () => { await app?.close(); });

    test('the round and the region use the pack’s words, and the region has beats to play', async () => {
      await page.locator('.callout--galaxy', { hasText: p.project }).first().click();
      // The project’s list is headed with the pack’s round word once its bundle is open; before that it is the default's.
      await page.locator('.chooser button', { hasText: p.round }).first().click();
      await sceneIs(page, 'sprint');
      await settle(page);
      const crumbs = page.locator('nav.breadcrumb');
      await expect(crumbs).toContainText(p.roundWord);
      await expect(crumbs).not.toContainText('Sprint');
      await page.locator('.callout', { hasText: p.region }).first().dblclick();
      await sceneIs(page, 'pod');
      await settle(page);
      await expect(crumbs).toContainText(p.regionWord);
      await expect(crumbs).not.toContainText('Area Path');
      await page.screenshot({ path: `${STILLS}/${p.name}-region-words.png` });

      // D4: the region has beats (v0's membership found none), and one plays.
      const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
      expect(beats.length).toBeGreaterThan(0);
      const mid = beats[Math.floor(beats.length / 2)]!.startMs;
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), mid - 1);
      await frames(page);
      await page.evaluate(() => window.__starChartTest!.stepBeat());
      await frames(page, 30);
      await page.screenshot({ path: `${STILLS}/${p.name}-region-playing.png` });
    });
  });
}

// D6: under the default fixture (quiet-week active, its range ending Mon 21 Sep) the CRM quarter is a
// served, non-active scenario. The renderer used to ask for the quarter only up to that default range's end.
test.describe('the CRM quarter under the default fixture covers the whole quarter (D6)', () => {
  let app: ElectronApplication;
  let page: Page;
  test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '' })); });
  test.afterAll(async () => { await app?.close(); });

  test('the bundle’s range ends on 1 Oct, not 21 Sep', async () => {
    await page.locator('.callout--galaxy', { hasText: 'Larch & Pine Trading' }).first().click();
    await page.locator('.chooser button', { hasText: 'Q3 2026' }).first().click();
    await sceneIs(page, 'sprint');
    await settle(page);
    const range = await page.evaluate(() => window.__starChartTest!.historyRange());
    expect(new Date(range!.endUtc).toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });
});
