import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickNode, keyOf, launchApp, openFeature101 } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
});
test.afterAll(async () => {
  await app?.close();
});

test('AC-01: launches with no PAT and reaches the fixture Feature system', { tag: '@keystone' }, async () => {
  await expect(page.locator('.mode-chip')).toHaveText('FIXTURE');
  await openFeature101(page);
  const graph = await page.evaluate(() => window.__starChartTest!.viewGraph());
  expect(graph?.sceneKey).toMatch(/^feature:wi:/);
  expect(graph?.nodes.some((n) => n.kind === 'star')).toBe(true);
  await expect(page.locator('.callout--star')).toHaveCount(1);
});

test('AC-02: select by pointer and keyboard; inspector shows keys (in map debug) and evidence', { tag: '@keystone' }, async () => {
  // The keys are for diagnosing: they show in map debug (D) only (revised 2026-10-04).
  await page.keyboard.press('d');
  // Pointer: clicking a station selects it.
  const station = await keyOf(page, 'station', 'ledger-svc');
  await clickNode(page, station);
  await expect(page.locator('.inspector__title')).toHaveText('ledger-svc');
  await expect(page.locator('.inspector')).toContainText(station);

  // Pointer on a planet selects it; the inspector shows its keys and evidence.
  const planet = await keyOf(page, 'planet', 'Show quote history on the policy page');
  await clickNode(page, planet);
  await expect(page.locator('.inspector__title')).toHaveText('Show quote history on the policy page');
  const node = (await page.evaluate((k) => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.canonicalKey === k), planet))!;
  await expect(page.locator('.inspector')).toContainText(node.canonicalKey);
  await expect(page.locator('.inspector')).toContainText(node.projectionKey);
  await expect(page.locator('.inspector')).toContainText('Resolved');
  await expect(page.locator('.evidence li').first()).toContainText(/wi:\d+:[ru]\d+/);
  await expect(page.locator('.ado-link')).toBeDisabled();
  await page.keyboard.press('d');
  await expect(page.locator('.inspector')).not.toContainText(node.canonicalKey); // hidden again outside map debug
  expect(await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey)).toMatch(/^feature:/); // selecting doesn't zoom

  // Keyboard: move through the object list and press Enter.
  await page.locator(`.object-list button[data-key="${planet}"]`).focus();
  await page.keyboard.press('ArrowDown');
  const focusedKey = await page.evaluate(() => (document.activeElement as HTMLElement).dataset.key);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__starChartTest!.selected())).toBe(focusedKey);
  await expect(page.locator(`.object-list button[data-key="${focusedKey}"]`)).toHaveAttribute('aria-pressed', 'true');
});

test('AC-03: remounting 10 times leaves counts at baseline', { tag: '@keystone' }, async () => {
  const baseline = await page.evaluate(() => window.__starChartTest!.counts());
  for (let i = 0; i < 10; i++) await page.evaluate(() => window.__starChartTest!.remount());
  const after = await page.evaluate(() => window.__starChartTest!.counts());
  expect(after).toEqual(baseline);
});
