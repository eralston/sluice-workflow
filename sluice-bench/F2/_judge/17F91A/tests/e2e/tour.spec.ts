// 23 E7: the guided tour. Offered once on a first launch (and not again after a relaunch on the same
// userData), always from Settings › How to read the chart; seven steps play Halcyon's Comet Pod and each
// anchors to a drawn object; Esc closes; ←/→ step; from ADO mode it uses the fixture and puts ADO back.
// Stills of every step go to review/v1.3/E/E7-step-N.png. Fixture data only (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp } from './launch';

test.describe.configure({ mode: 'serial', timeout: 240_000 });

const db = mkdtempSync(join(tmpdir(), 'star-chart-e2e-tour-'));
const env = { STAR_CHART_PARADIGM: '', STAR_CHART_TOUR_OFFER: '1', STAR_CHART_DB_DIR: db };
const KINDS = ['star', 'seat', 'objective', 'threat', 'facility', 'captain', null] as const;

let app: ElectronApplication;
let page: Page;
test.afterAll(async () => { await app?.close(); });

/** The drawn object under the tour's ring: its node kind, found through the scene's own screen positions. */
const ringKind = (p: Page) => p.evaluate(() => {
  const ring = document.querySelector('.tour__ring');
  if (!ring) return null;
  const cx = Number(ring.getAttribute('cx')); const cy = Number(ring.getAttribute('cy')); const r = Number(ring.getAttribute('r'));
  const t = window.__starChartTest!;
  const kinds = new Map(t.viewGraph()!.nodes.map((n) => [n.projectionKey, n.kind]));
  const nearPks = t.displayed().filter((d) => Math.hypot(d.x - cx, d.y - cy) <= r).map((d) => d.pk);
  const alpha = t.viewAlphas(nearPks);
  // Only what is actually drawn counts: a node can be in the scene before its entrance has made it visible.
  return nearPks.filter((pk) => (alpha[pk] ?? 0) >= 0.95).map((pk) => kinds.get(pk));
});

test('a first launch offers the tour once; taking it plays seven steps, each pointing at a drawn object', async () => {
  ({ app, page } = await launchApp(env));
  const offer = page.getByTestId('tour-offer');
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Take the tour' }).click();
  await expect(page.locator('.tour[data-step="0"]')).toBeVisible({ timeout: 60_000 });
  expect((await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey))).toMatch(/^pod:/);
  expect(await page.evaluate(() => window.starChart.mode.get())).toBe('fixture');
  for (let i = 0; i < KINDS.length; i++) {
    const tour = page.locator(`.tour[data-step="${i}"]`);
    await expect(tour).toBeVisible();
    await expect(tour).toHaveAttribute('data-anchored', 'true', { timeout: 40_000 });
    await expect(tour.locator('.tour__wait')).toHaveCount(0, { timeout: 40_000 }); // held on its object
    if (KINDS[i]) expect(await ringKind(page), `step ${i + 1} ring`).toContain(KINDS[i]);
    await expect(page.locator('.tour__title')).not.toBeEmpty();
    await page.waitForTimeout(400); // the pointer settles before the still
    await page.screenshot({ path: `review/v1.3/E/E7-step-${i + 1}.png` });
    await page.locator('[data-tour="next"]').click();
  }
  await expect(page.locator('.tour')).toHaveCount(0);
  // The offer was made once: it is marked, and a relaunch on the same userData doesn't offer again.
  await expect.poll(() => page.evaluate(() => window.starChart.settings.get().then((s) => s.tourOffered))).toBe(true);
  await app.close();
  ({ app, page } = await launchApp(env));
  await page.evaluate(() => window.starChart.settings.get());
  await page.waitForTimeout(800);
  await expect(page.getByTestId('tour-offer')).toHaveCount(0);
});

test('Settings › How to read the chart always has the tour; ←/→ step and Esc closes', async () => {
  await page.evaluate(() => window.__starChartTest!.setReduced(true)); // reduced motion: no pulse, beats step by hand
  await page.evaluate(() => window.__starChartTest!.openSettings('read'));
  await page.locator('[data-log="tour-start"]').click();
  await expect(page.locator('.tour[data-step="0"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#settings-modal')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tour[data-step="1"]')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.tour[data-step="0"]')).toBeVisible();
  const state = await page.evaluate(() => window.__starChartTest!.stack().length);
  expect(state).toBeGreaterThan(1); // ← did not take the chart back a level, nor Esc until now
  await expect(page.locator('.tour[data-step="0"]')).toHaveAttribute('data-anchored', 'true', { timeout: 40_000 }); // a new step's ring comes back once it's anchored
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.tour__ring')!).animationName)).toBe('none');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('from ADO mode the tour uses the fixture and puts ADO back when it closes', async () => {
  await app.close();
  const adoEnv = { STAR_CHART_PARADIGM: '', STAR_CHART_TOUR_OFFER: '1', STAR_CHART_START_MODE: 'ado', STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'star-chart-e2e-tour-ado-')) };
  ({ app, page } = await launchApp(adoEnv));
  expect(await page.evaluate(() => window.starChart.mode.get())).toBe('ado');
  await page.getByTestId('tour-offer').getByRole('button', { name: 'Take the tour' }).click();
  await expect(page.locator('.tour[data-step="0"]')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.starChart.mode.get())).toBe('fixture');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.starChart.mode.get())).toBe('ado');
});

test('quitting mid-tour from ADO mode boots back into ADO (the tour\u2019s Fixture is never saved)', async () => {
  const adoEnv = { STAR_CHART_PARADIGM: '', STAR_CHART_TOUR_OFFER: '1', STAR_CHART_START_MODE: 'ado', STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'star-chart-e2e-tour-quit-')) };
  await app.close();
  ({ app, page } = await launchApp(adoEnv));
  await page.getByTestId('tour-offer').getByRole('button', { name: 'Take the tour' }).click();
  await expect(page.locator('.tour[data-step="0"]')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => window.starChart.mode.get())).toBe('fixture');
  await app.close(); // as Cmd-Q mid-tour would
  ({ app, page } = await launchApp({ ...adoEnv, STAR_CHART_TOUR_OFFER: '' }));
  expect(await page.evaluate(() => window.starChart.mode.get())).toBe('ado');
});
