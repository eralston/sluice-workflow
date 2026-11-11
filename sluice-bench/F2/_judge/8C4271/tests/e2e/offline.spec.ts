// Slice 5, AC-31: with ADO out of reach the chart runs from the cache, and the status bar says how
// old it is. Also the two ways a scope refreshes (04 §5 step 7, decided 2026-10-09): reopening it,
// and the Refresh control. The fake transport is taken away mid-run from the main process, so
// nothing test-only reaches production code.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const graph = (page: Page) => page.evaluate(() => window.__starChartTest!.viewGraph()!);
const sceneIs = (page: Page, level: string) => page.waitForFunction((l) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(`${l}:`), level, { timeout: 30_000 });
/** Take ADO away, or give it back: the fake transport lives in the main process in test runs. */
const setOffline = (app: ElectronApplication, on: boolean) => app.evaluate((_electron, state) => {
  const t = (globalThis as { __starChartFakeTransport?: { offline: boolean } }).__starChartFakeTransport;
  if (!t) throw new Error('no fake transport');
  t.offline = state;
}, on);

test('AC-31 (E): offline, a synced scope opens from the cache and the status bar shows its age', { tag: '@keystone' }, async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-offline-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    // Chart the sprint while ADO is there, so there's something cached to fall back to.
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    for (const pod of ['Comet Pod', 'Nova Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    await settle(page);
    const stars = (await graph(page)).nodes.filter((n) => n.kind === 'star').length;
    expect(stars).toBeGreaterThan(0);
    // Online, the status bar says when it synced, and offers Refresh.
    await expect(page.locator('.coverage__when')).toContainText('Synced');
    await expect(page.locator('.coverage__offline')).toHaveCount(0);
    await expect(page.locator('.coverage__refresh')).toBeVisible();

    // Now take ADO away, forget what's loaded, and come back to the sprint.
    await setOffline(app, true);
    await page.evaluate(() => window.__starChartTest!.forgetScopes());
    await page.locator('.breadcrumb button', { hasText: 'All projects' }).click();
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await sceneIs(page, 'sprint');
    await settle(page);
    // It drew from the cache: the same pods, no error, and the bar says it's offline and how old it is.
    expect((await graph(page)).nodes.filter((n) => n.kind === 'star').length).toBe(stars);
    await expect(page.locator('.coverage__offline')).toHaveText('Offline');
    await expect(page.locator('.coverage__when')).toContainText('Synced');
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/offline-1-from-cache.png' });

    // Refresh while offline keeps the chart and stays offline; with ADO back it clears.
    await page.locator('.coverage__refresh').click();
    await expect.poll(async () => page.locator('.coverage__offline').count(), { timeout: 20_000 }).toBe(1);
    expect((await graph(page)).nodes.filter((n) => n.kind === 'star').length).toBe(stars);
    await setOffline(app, false);
    await page.locator('.coverage__refresh').click();
    await expect.poll(async () => page.locator('.coverage__offline').count(), { timeout: 30_000 }).toBe(0);
  } finally {
    await app.close();
  }
});

test('AC-31 (E): a start with no connection opens the galaxy from the cache, then the sprint, and ↻ recovers', { tag: '@keystone' }, async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_PROJECTS_TTL_MS: '1', // a launch has no memo of the project list: ask every time
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-coldstart-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    for (const pod of ['Comet Pod', 'Nova Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    await settle(page);
    const stars = (await graph(page)).nodes.filter((n) => n.kind === 'star').length;

    // The laptop has no connection: start the app's data over, as a launch does.
    await setOffline(app, true);
    await page.evaluate(() => window.__starChartTest!.reboot());
    await settle(page);
    // The galaxy is there — from the cache — and says so. No error, no empty cosmos.
    await expect.poll(async () => (await graph(page)).nodes.filter((n) => n.kind === 'galaxy').length, { timeout: 20_000 }).toBeGreaterThan(0);
    await expect(page.locator('.coverage__offline')).toHaveText('Offline');
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/offline-4-cold-start.png' });
    // And the sprint opens from the cache, with its age.
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await sceneIs(page, 'sprint');
    await settle(page);
    expect((await graph(page)).nodes.filter((n) => n.kind === 'star').length).toBe(stars);
    await expect(page.locator('.coverage__when')).toContainText('Synced');
    await expect(page.locator('.coverage__offline')).toHaveText('Offline');

    // Back at the galaxy, ↻ with ADO still away stays offline…
    await page.locator('.breadcrumb button', { hasText: 'All projects' }).click();
    await settle(page);
    await page.locator('.coverage__refresh').click();
    await page.waitForTimeout(400);
    await expect(page.locator('.coverage__offline')).toHaveCount(1);
    // …and with ADO back, it recovers.
    await setOffline(app, false);
    await page.locator('.coverage__refresh').click();
    await expect.poll(async () => page.locator('.coverage__offline').count(), { timeout: 20_000 }).toBe(0);
  } finally {
    await app.close();
  }
});

test('401 during sync (E): a token that dies mid-fill stops the stream and asks for a new one (04 §6)', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    // Repositories are first asked for *after* the first look, so a 401 there is the token dying mid-fill.
    STAR_CHART_FAKE_FAIL: '/_apis/git/repositories\\?', STAR_CHART_FAKE_FAIL_STATUS: '401',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-refused-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Comet Pod' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    // The first look succeeded, so the sprint is on screen…
    await sceneIs(page, 'sprint');
    // …and then the user is told what happened and what to do, in words.
    await expect(page.locator('.error')).toContainText('ADO refused the token', { timeout: 20_000 });
    await expect(page.locator('.error')).toContainText('Enter a new PAT');
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.stream()), { timeout: 10_000 }).toBeNull(); // no longer "filling in"
    // The coverage chip is honest that it's partial.
    await expect(page.locator('.coverage__when')).toContainText('partial');
    await page.screenshot({ path: 'test-results/offline-5-refused.png' });
  } finally {
    await app.close();
  }
});

test('an item ADO refuses is still drawn, marked "last known" (02 §3)', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    // Bug 9108's history is denied from the start: its last known facts must still show.
    STAR_CHART_FAKE_FAIL: 'workItems/9108/(revisions|updates)', STAR_CHART_FAKE_FAIL_STATUS: '403',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-stale-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await page.locator('.area-chooser label', { hasText: 'Comet Pod' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    // The bug is drawn, and only it is marked: staleness is per object, not per scope.
    await expect.poll(async () => (await graph(page)).nodes.filter((n) => n.flags.stale).length, { timeout: 30_000 }).toBe(1);
    const marked = (await graph(page)).nodes.find((n) => n.flags.stale)!;
    expect(marked.label).toContain('Double-booked');
    await expect(page.locator('.object-list__stale')).toHaveCount(1);
    await expect(page.locator('.coverage__when')).toContainText('partial');
    await page.locator('.coverage__when').click();
    await expect(page.locator('.coverage__panel')).toContainText('last known');
    await page.screenshot({ path: 'test-results/offline-3-stale.png' });
  } finally {
    await app.close();
  }
});

test('coverage tells you what a view is missing: the notes behind "partial"', async () => {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-coverage-')),
  });
  try {
    await page.locator('.cosmos__cta').click();
    await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
    await page.locator('.connect input[name="pat"]').fill(CANARY);
    await page.locator('.connect button[type="submit"]').click();
    await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
    await page.locator('.connect__close').click();
    await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
    await expect.poll(async () => (await graph(page)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await settle(page);
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    for (const pod of ['Comet Pod']) await page.locator('.area-chooser label', { hasText: pod }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
    await sceneIs(page, 'sprint');
    await settle(page);
    await page.locator('.coverage__when').click();
    await expect(page.locator('.coverage__panel')).toContainText('Last full read');
    await page.screenshot({ path: 'test-results/offline-2-coverage.png' });
  } finally {
    await app.close();
  }
});
