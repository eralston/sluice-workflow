// Onboarding (decided 2026-10-07): a first launch opens the empty cosmos (a black hole) in ADO mode.
// Connecting offers your recent projects; a project with nothing saved opens its Area Paths over the
// galaxy. Plus the zoom buttons, tooltips, styled checkboxes, and "Add more projects". Fake ADO with
// 188 synthetic projects (crowded-org); no network, invented names only (INV-18).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp, settle } from './launch';

test.describe.configure({ mode: 'serial' });

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'crowded-org', STAR_CHART_START_MODE: '', STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'star-chart-onboarding-')),
  }));
});
test.afterAll(async () => { await app?.close(); });

const galaxies = () => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'galaxy').map((n) => n.label));

test('the empty cosmos (E): a first launch shows the black hole, the call to action, and a turning quote in a script', { tag: '@keystone' }, async () => {
  await expect(page.locator('.mode-chip')).toHaveText('ADO');
  await expect(page.locator('.cosmos__title')).toHaveText('Building Your Cosmos');
  await expect(page.locator('.cosmos__subtitle')).toHaveText('Select your Azure DevOps projects');
  await expect(page.locator('.cosmos__cta')).toHaveText('Connect to Azure DevOps');
  expect(await galaxies()).toEqual([]);
  await expect(page.locator('.zoom-controls')).toHaveCount(0);
  const quote = page.locator('.cosmos__quote blockquote');
  await expect(quote).toHaveText(/^“/);
  expect(await quote.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Caveat/);
  const first = await quote.textContent();
  await expect.poll(() => quote.textContent(), { timeout: 6000 }).not.toBe(first);
  await page.screenshot({ path: 'test-results/onboarding-1-black-hole.png' });
});

test('a demo cosmos (E): the quiet link opens the fixtures; switching back to ADO returns to the black hole', async () => {
  await page.locator('.cosmos button', { hasText: 'or explore a demo cosmos' }).click();
  await expect(page.locator('.mode-chip')).toHaveText('FIXTURE');
  await expect.poll(async () => (await galaxies()).length).toBeGreaterThan(100);
  await page.locator('.mode-chip').click();
  await page.locator('.connect__mode button', { hasText: 'ADO' }).click();
  await page.locator('.connect__close').click();
  await expect(page.locator('.cosmos__title')).toHaveText('Building Your Cosmos');
});

test('your recent projects (E): connecting from the plate lists 10, and Add these 10 charts exactly those, newest first', { tag: '@keystone' }, async () => {
  await page.locator('.cosmos__cta', { hasText: 'Connect to Azure DevOps' }).click();
  await expect(page.locator('.connect')).toBeVisible();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected');
  await page.locator('.connect__close').click();
  const recent = page.locator('.cosmos__recent li');
  await expect(recent).toHaveCount(10);
  const names = await recent.allTextContents();
  await page.screenshot({ path: 'test-results/onboarding-2-recent.png' });
  await page.locator('.cosmos__cta', { hasText: 'Add these 10' }).click();
  await expect.poll(galaxies).toEqual(names);
  await settle(page);
});

test('zoom and tooltips (E): the buttons zoom; a tooltip with its keys appears after a moment', async () => {
  const before = (await page.evaluate(() => window.__starChartTest!.camera())).scale;
  const zoomIn = page.locator('.zoom-controls button[aria-label="Zoom in"]');
  await zoomIn.click();
  await expect.poll(async () => (await page.evaluate(() => window.__starChartTest!.camera())).scale).toBeGreaterThan(before);
  await page.mouse.move(0, 0);
  await zoomIn.hover();
  await expect(page.locator('.tooltip')).toBeVisible();
  await expect(page.locator('.tooltip__text')).toHaveText('Zoom in');
  await expect(page.locator('.tooltip__keys')).toContainText('pinch');
  await page.screenshot({ path: 'test-results/tooltip.png' });
  await page.mouse.move(0, 0);
  await expect(page.locator('.tooltip')).toHaveCount(0);
  await page.keyboard.press('0');
});

test('add more projects (E): the In view link opens the project list, whose checkboxes are styled; recent ones are tagged', async () => {
  await page.locator('.object-list__more').click();
  await expect(page.locator('.connect')).toBeVisible();
  await expect(page.locator('.connect__all')).toBeVisible();
  const box = page.locator('.connect__projects input[type="checkbox"]').first();
  expect(await box.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
  await expect(page.locator('.connect__recent-tag')).toHaveCount(await page.locator('.connect__projects li').filter({ has: page.locator('.connect__recent-tag') }).count());
  expect(await page.locator('.connect__recent-tag').count()).toBeGreaterThanOrEqual(10);
  await page.locator('.connect__close').click();
});

test('Remove from View (E, 19 N1): a selected galaxy unpins its project from the inspector; it Departs, nothing is written', async () => {
  const before = await galaxies();
  expect(before.length).toBe(10);
  const name = before.at(-1)!;
  await page.locator('.object-list button', { hasText: name }).first().click();
  await expect(page.locator('.inspector__title')).toHaveText(name);
  const remove = page.locator('.inspector .enter-link', { hasText: 'Remove from View' });
  await expect(remove).toBeEnabled();
  await expect(page.locator('.inspector')).toContainText('Nothing changes in Azure DevOps');
  const departed = (await page.evaluate(() => window.__starChartTest!.motions())).depart;
  await remove.click();
  await expect.poll(galaxies, { timeout: 20_000 }).toEqual(before.slice(0, -1));
  expect((await page.evaluate(() => window.__starChartTest!.motions())).depart).toBeGreaterThan(departed);
  await expect(page.locator('.inspector__title')).toHaveCount(0); // the selection went with it
  // Only the pin changed: the project is still in the org's list, unpinned.
  const all = await page.evaluate(() => window.starChart.projects.list());
  expect(all.find((p) => p.name === name)?.pinned).toBe(false);
  // Add it back with the + crumb, as the tip says: the same 10, so the tests after see the same sky.
  await page.locator('.crumb--add').click();
  await page.locator('.add-picker input').fill(name);
  await page.locator('.add-picker__row', { hasText: name }).first().click();
  await expect.poll(async () => (await galaxies()).sort(), { timeout: 20_000 }).toEqual([...before].sort());
  await page.keyboard.press('0'); // adding brought it into view: back to the opening view
  await settle(page);
  await page.waitForTimeout(800);
});

test('the empty project (E): its Area Paths A–Z over the galaxy; two saved, the call to action opens the first', async () => {
  const name = (await galaxies())[0]!;
  await page.locator('.callout--galaxy', { hasText: name }).first().dblclick();
  const plate = page.locator('.area-chooser');
  await expect(plate.locator('.cosmos__title')).toHaveText(`Charting ${name}`);
  await expect(plate.locator('.cosmos__cta')).toBeDisabled();
  const paths = await plate.locator('.area-chooser__path').allTextContents();
  expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
  await plate.locator('label', { hasText: 'Field Team' }).locator('input').check();
  await expect(plate.locator('.cosmos__cta')).toHaveText('Chart Field Team');
  await plate.locator('label', { hasText: 'Core Team' }).locator('input').check();
  await expect(plate.locator('.cosmos__cta')).toHaveText('Chart these 2 teams');
  await page.screenshot({ path: 'test-results/onboarding-3-area-chooser.png' });
  // Esc keeps what was saved.
  await page.keyboard.press('Escape');
  await expect(plate).toHaveCount(0);
  await expect(page.locator('.chooser button', { hasText: 'Field Team' })).toBeVisible();
  await expect(page.locator('.chooser button', { hasText: 'Core Team' })).toBeVisible();
  // Entering now opens the first saved (Field Team), with both in the team switcher.
  await page.locator('.callout--galaxy', { hasText: name }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey !== 'galaxy', undefined, { timeout: 30_000 });
  await settle(page);
  await expect(page.locator('.team-pill__name')).toContainText('Field Team');
});
