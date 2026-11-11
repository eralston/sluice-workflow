// Loaded by level (decided 2026-10-07): a team opens on its Features as they are now, a Feature loads
// its children when entered, and history loads only when the player asks for it. Fake ADO with a
// small delay per call, so loading is visible; crowded-org's Pine Team has 15 Features, 14 old.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const dbDir = mkdtempSync(join(tmpdir(), 'sc-explore-'));
const env = { STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'crowded-org', STAR_CHART_START_MODE: '', STAR_CHART_FAKE_DELAY_MS: '150', STAR_CHART_DB_DIR: dbDir };

test.describe.configure({ mode: 'serial' });

let app: ElectronApplication;
let page: Page;
test.beforeAll(async () => { ({ app, page } = await launchApp(env)); });
test.afterAll(async () => { await app?.close(); });

const fakeLog = () => app.evaluate(() => ((globalThis as unknown as { __starChartFakeLog?: { url: string }[] }).__starChartFakeLog ?? []).map((r) => r.url));
const historyCalls = async () => (await fakeLog()).filter((u) => /\/(revisions|updates)(\?|$)/.test(u)).length;
const graph = () => page.evaluate(() => window.__starChartTest!.viewGraph()!);

async function connect(): Promise<void> {
  // The black hole pulls while the app waits on the network, and storms while the cosmos fills.
  const pulled = page.waitForFunction(() => window.__starChartTest!.energy().cosmos !== 'idle', undefined, { timeout: 20_000, polling: 16 });
  const stormed = page.waitForFunction(() => window.__starChartTest!.energy().cosmosPeak === 'storm', undefined, { timeout: 30_000, polling: 16 })
    .then(() => page.waitForTimeout(400)).then(() => page.screenshot({ path: 'test-results/explore-0-storm.png' }));
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
  await page.locator('.connect__close').click();
  await pulled;
  await page.locator('.cosmos__cta', { hasText: 'Add these' }).click({ timeout: 20_000 });
  await stormed;
  await expect.poll(async () => (await graph()).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__starChartTest!.energy().cosmos)).toBe('idle'); // released
  await settle(page);
}

/** Open Juniper Ridge's Pine Team: from its saved area, or from the Area Path plate. */
async function openPine(): Promise<void> {
  await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
  const plate = page.locator('.area-chooser label', { hasText: 'Pine Team' });
  const opened = page.waitForFunction(() => window.__starChartTest!.exploring() || window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 20_000 });
  await Promise.race([opened, plate.waitFor({ timeout: 20_000 }).then(async () => {
    await plate.locator('input').check();
    await page.locator('.area-chooser .cosmos__cta').click();
  })]);
}

test('a team opens on its Features as they are now (E): the galaxy swirls under its loading plate, then the scene; no history calls', { tag: '@keystone' }, async () => {
  await connect();
  const before = await historyCalls();
  // Watched from before the double-click: the team's current state loads in a few calls.
  const swirled = page.waitForFunction(() => window.__starChartTest!.energy().kinds.includes('galaxy') && document.querySelector('.loading-plate')?.textContent?.includes('Opening'), undefined, { timeout: 15_000, polling: 16 })
    .then(() => page.waitForTimeout(350)).then(() => page.screenshot({ path: 'test-results/explore-1-swirl.png' }));
  await openPine();
  await swirled;
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sector:'), undefined, { timeout: 30_000 });
  await settle(page);
  const g = await graph();
  expect(g.nodes.filter((n) => n.kind === 'star')).toHaveLength(10); // the 10 newest
  expect(g.nodes.some((n) => n.role === 'loadMore')).toBe(true);
  // Trail map export's two Stories aren't loaded yet: its miniature says so.
  const trail = g.nodes.find((n) => n.kind === 'star' && n.label === 'Trail map export')!;
  expect(trail.flags.unexplored).toBe(true);
  expect(trail.meta2).toBe('2 items · not yet explored');
  // Its two children stand as faint outlines on its orbit.
  expect(await page.evaluate(() => window.__starChartTest!.liveNodes().filter((n) => n.role === 'unexplored').length)).toBe(2);
  expect(await historyCalls()).toBe(before);
  // The player is a request until this team's history is asked for.
  await expect(page.locator('.transport--request')).toContainText('Load history to play this team');
  await expect(page.locator('.transport__ranges [aria-checked="true"]')).toHaveText('7 days');
  await page.screenshot({ path: 'test-results/explore-2-request.png' });
});

test('Load more (E): In view’s Load more… brings the 5 older Features, in place', async () => {
  await page.locator('.object-list__more', { hasText: 'Load more' }).click();
  await expect.poll(async () => (await graph()).nodes.filter((n) => n.kind === 'star').length, { timeout: 20_000 }).toBe(15);
  expect((await graph()).nodes.some((n) => n.role === 'loadMore')).toBe(false);
  expect(await historyCalls()).toBe(0);
});

test('entering an unexplored Feature (E): its star swirls, then its children; still no history', { tag: '@keystone' }, async () => {
  await page.locator('.callout', { hasText: 'Trail map export' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('feature:'), undefined, { timeout: 30_000 });
  await settle(page);
  const planets = (await graph()).nodes.filter((n) => n.kind === 'planet');
  expect(planets.map((n) => n.label).sort()).toEqual(['Export as PDF', 'Share a trail link']);
  expect(await historyCalls()).toBe(0);
  await expect(page.locator('.transport--request')).toContainText('Load history to play this Feature');
});

test('the player (E): 7 days loads with progress, then plays; Go further back re-times it to 14', { tag: '@keystone' }, async () => {
  // The Feature's sun burns while its history loads.
  const loading = page.waitForFunction(() => document.querySelector('.transport--loading')?.textContent?.includes('Loading 7 days of history') && window.__starChartTest!.energy().kinds.includes('star'), undefined, { timeout: 15_000, polling: 16 })
    .then(() => page.screenshot({ path: 'test-results/explore-3-loading.png' }));
  await page.locator('.transport__load').click();
  await loading;
  await expect(page.locator('.transport__play')).toBeVisible({ timeout: 30_000 });
  expect(await historyCalls()).toBeGreaterThan(0);
  const r7 = (await page.evaluate(() => window.__starChartTest!.historyRange()))!;
  expect(r7.endUtc - r7.startUtc).toBe(7 * 86_400_000);
  expect((await page.evaluate(() => window.__starChartTest!.beatTimes())).length).toBeGreaterThan(0);
  await page.locator('.transport__more').click();
  await page.locator('.transport__further').click();
  await expect.poll(async () => { const r = await page.evaluate(() => window.__starChartTest!.historyRange()); return r ? r.endUtc - r.startUtc : 0; }, { timeout: 30_000 }).toBe(14 * 86_400_000);
  await expect(page.locator('.transport__play')).toBeVisible();
});

test('back to the team while playing (E): playback pauses and the team’s player offers its request', async () => {
  await page.evaluate(() => window.__starChartTest!.play());
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sector:'), undefined, { timeout: 15_000 });
  await expect(page.locator('.transport--request')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(window.__starChartTest!.storeJson()).playback?.status)).not.toBe('playing');
});

test('Esc mid-load cancels (E): the Feature stays unexplored and the scene stays put', async () => {
  // Weather alerts (an older Feature) has no children, so pick one with them: Ranger booking has two.
  const target = page.locator('.callout', { hasText: 'Ranger booking' }).first();
  await target.dblclick();
  await expect(page.locator('.sync-banner')).toContainText('Exploring', { timeout: 10_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.sync-banner')).toHaveCount(0, { timeout: 10_000 });
  await settle(page);
  expect((await graph()).sceneKey).toMatch(/^sector:/);
  expect(await page.evaluate(() => window.__starChartTest!.exploring())).toBe(false);
  await expect(page.locator('.error-banner, [role="alert"]')).toHaveCount(0);
});

test('relaunch (E): the played Feature catches up quietly, and its player is ready', async () => {
  await app.close();
  ({ app, page } = await launchApp(env)); // the same cache; test runs keep the PAT in memory, so connect again
  await page.locator('.cosmos__cta').click();
  await expect(page.locator('.connect input[name="org"]')).toHaveValue('https://dev.azure.com/fixture-org'); // remembered
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
  await page.locator('.connect__close').click();
  await expect.poll(async () => (await graph()).nodes.some((n) => n.label === 'Juniper Ridge'), { timeout: 20_000 }).toBe(true);
  await settle(page);
  const before = await historyCalls();
  await page.locator('.callout--galaxy', { hasText: 'Juniper Ridge' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sector:'), undefined, { timeout: 30_000 });
  // The catch-up runs in the background: history calls happen without the player asking.
  await expect.poll(historyCalls, { timeout: 20_000 }).toBeGreaterThan(before);
  await expect.poll(() => page.evaluate(() => JSON.parse(window.__starChartTest!.storeJson()).catchingUp), { timeout: 20_000 }).toBe(false);
  await settle(page);
  await page.locator('.callout', { hasText: 'Trail map export' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('feature:'), undefined, { timeout: 30_000 });
  await expect(page.locator('.transport__play')).toBeVisible();
  await expect(page.locator('.transport--request')).toHaveCount(0);
  const r = (await page.evaluate(() => window.__starChartTest!.historyRange()))!;
  expect(r.endUtc - r.startUtc).toBe(14 * 86_400_000); // the longest range played here
});
