// 23 E1–E3, Settings: the live ship preview (a Pixi canvas that redraws on a faction, hull or
// colourway change, and leaves no WebGL context behind when Settings closes), the captain file
// (export, then import, through dialogs stubbed by STAR_CHART_CAPTAIN_FILE; bad files get a visible
// message and change nothing), and the remembered view (the developer toggle, across a relaunch).
// Fixture data only, invented names (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, settle } from './launch';

const dir = mkdtempSync(join(tmpdir(), 'star-chart-e2e-captain-'));
const file = join(dir, 'captain.json');
const env = { STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_USER_DATA: join(dir, 'user'), STAR_CHART_CAPTAIN_FILE: file };

let app: ElectronApplication;
let page: Page;
const errors: string[] = [];
test.afterAll(async () => { await app?.close(); });

const tab = (name: string) => page.locator('#settings-modal [role="tab"]', { hasText: name });
const canvas = () => page.locator('.captain-preview__canvas');
const preview = () => page.evaluate(() => window.__starChartTest!.captainPreview());
const styleNow = () => page.evaluate(() => window.starChart.settings.get().then((s) => Object.values(s.captain)[0] ?? null));

async function openCaptain(): Promise<void> {
  await page.locator('.settings-button').click();
  await tab('Your captain').click();
}
async function close(): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-modal')).toHaveCount(0);
}

test.describe.serial('captain settings', () => {
  test('the preview redraws as faction, hull and colourway change, and closing Settings releases the renderer', async () => {
    ({ app, page } = await launchApp(env));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
    await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(page);

    await openCaptain();
    // No captain chosen: no ship to show.
    await expect(canvas()).toHaveCount(0);
    const who = page.locator('select[data-log="viewer-choose"]');
    await who.selectOption({ label: 'Wren Calloway' });
    await expect(canvas()).toHaveCount(1);
    await page.waitForFunction(() => window.__starChartTest!.captainPreview().draws > 0);

    await page.locator('input[name="faction"][value="mecha"]').check();
    await expect.poll(async () => (await preview()).hull).toBeGreaterThanOrEqual(0);
    await expect.poll(styleNow).toMatchObject({ faction: 'mecha' });
    const settled = () => page.waitForTimeout(250);
    await settled();
    const a = await canvas().screenshot();
    const before = await preview();

    // A colourway: the same hull, new pixels.
    await page.locator('input[name="colourway"]').nth(5).check();
    await expect.poll(async () => (await preview()).colourway).toBe(5);
    await settled();
    const b = await canvas().screenshot();
    expect(Buffer.compare(a, b)).not.toBe(0);

    // A hull: new design, new pixels.
    const hulls = page.locator('input[name="hull"]');
    expect(await hulls.count()).toBeGreaterThan(1);
    await hulls.nth(1).check();
    await expect.poll(async () => (await preview()).hull).not.toBe(before.hull);
    await settled();
    const c = await canvas().screenshot();
    expect(Buffer.compare(b, c)).not.toBe(0);
    await page.screenshot({ path: 'review/v1.3/E/E1-preview.png' });

    // Another faction: its first hull.
    await page.locator('input[name="faction"][value="trek"]').check();
    await expect.poll(styleNow).toMatchObject({ faction: 'trek' });
    await settled();
    expect(Buffer.compare(c, await canvas().screenshot())).not.toBe(0);

    // Open and close Settings again and again: one renderer at a time, none left behind.
    await close();
    await expect.poll(async () => (await preview()).live).toBe(0);
    const created0 = (await preview()).created;
    for (let i = 0; i < 5; i++) {
      await openCaptain();
      await expect(canvas()).toHaveCount(1);
      await expect.poll(async () => (await preview()).live).toBe(1);
      await close();
      await expect.poll(async () => (await preview()).live).toBe(0);
    }
    expect((await preview()).created).toBe(created0 + 5);

    // The preview's renderer must not have taken the chart's shared GPU state with it (Pixi's global
    // pools): the main chart still draws, plays and reaches its end, and nothing threw.
    await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await settle(page);
    await page.evaluate(() => {
      const t = window.__starChartTest!;
      t.setScheduleMs(Math.max(0, t.session().totalMs - 2_000));
      t.setRate(4);
      t.play();
    });
    await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('export then import brings the captain back; bad files say so and change nothing', async () => {
    const mine = (await styleNow())!;
    await openCaptain();
    await page.locator('[data-log="captain-export"]').click();
    await expect(page.locator('[data-captain-file="ok"]')).toBeVisible();
    const written = JSON.parse(readFileSync(file, 'utf8'));
    expect(written).toEqual({ v: 1, faction: mine.faction, hull: mine.hull, colourway: mine.colourway });
    await page.screenshot({ path: 'review/v1.3/E/E2-export.png' });

    // Restyle, then import: back to the file's captain.
    await page.locator('input[name="faction"][value="wars"]').check();
    await expect.poll(styleNow).toMatchObject({ faction: 'wars' });
    await page.locator('[data-log="captain-import"]').click();
    await expect.poll(styleNow).toEqual(mine);
    await expect(page.locator('[data-captain-file="ok"]')).toBeVisible();

    // Bad files: unknown faction, a version we do not know, a hull of another faction, not JSON.
    for (const text of [
      JSON.stringify({ v: 1, faction: 'klingon', hull: 0, colourway: 0 }),
      JSON.stringify({ v: 2, faction: mine.faction, hull: mine.hull, colourway: mine.colourway }),
      JSON.stringify({ v: 1, faction: mine.faction === 'trek' ? 'wars' : 'trek', hull: mine.hull, colourway: 0 }),
      'this is not json',
    ]) {
      writeFileSync(file, text);
      await page.locator('[data-log="captain-import"]').click();
      await expect(page.locator('[data-captain-file="error"]')).toBeVisible();
      expect(await styleNow()).toEqual(mine);
    }
    await page.screenshot({ path: 'review/v1.3/E/E2-bad-file.png' });
    await close();
  });

  test('the developer toggle is remembered across a relaunch (13 Q9)', async () => {
    // Choose Sprints (v0) in Settings → Theme.
    await page.locator('.settings-button').click();
    await tab('Theme').click();
    await page.locator('input[data-log="paradigm-sprints"]').click();
    await expect.poll(() => page.evaluate(() => window.starChart.settings.get().then((s) => s.devParadigm))).toBe('sprints');
    await app.close();

    // Relaunch on the same userData, nothing pinned: it opens in Sprints, with the cog to come back.
    ({ app, page } = await launchApp(env));
    expect(await page.evaluate(() => window.starChart.paradigm.get())).toBe('sprints');
    await expect(page.locator('.settings-button')).toBeVisible();
    await page.locator('.settings-button').click();
    await tab('Theme').click();
    await expect(page.locator('input[data-log="paradigm-sprints"]')).toBeChecked();
    await page.screenshot({ path: 'review/v1.3/E/E3-remembered.png' });
    await page.locator('input[data-log="paradigm-solar"]').click();
    await expect.poll(() => page.evaluate(() => window.starChart.settings.get().then((s) => s.devParadigm))).toBe('solar');
    await app.close();

    // And Solar again at the next launch.
    ({ app, page } = await launchApp(env));
    expect(await page.evaluate(() => window.starChart.paradigm.get())).toBe('solar');
  });
});
