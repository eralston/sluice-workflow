// Slice 6: pictures you add by hand (91). The user's PAT often can't read teammates' pictures, so
// captains wear initials; here a picture is chosen for one of them, kept under userData beside the
// cache (Purge leaves it), shown on the chart, and removable. The file chooser is a native dialog, so
// test runs name the file in STAR_CHART_PICK_FILE; the picture is a few invented pixels.
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { clickNode, keyOf, launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAGklEQVR4nGNwWHCAKohh1KBRg0YNGjWIMgQAF/FwH80XQcsAAAAASUVORK5CYII=', 'base64');

/** Launch on the fake org, connect, and open Comet Pod, where two captains stand. */
async function openPod(pick: string) {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_PICK_FILE: pick, STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-pictures-')),
  });
  await page.locator('.cosmos__cta').click();
  await page.locator('.connect input[name="org"]').fill('https://dev.azure.com/fixture-org');
  await page.locator('.connect input[name="pat"]').fill(CANARY);
  await page.locator('.connect button[type="submit"]').click();
  await expect(page.locator('.connect__msg--ok')).toContainText('Connected', { timeout: 20_000 });
  await page.locator('.connect__close').click();
  await page.locator('.cosmos button', { hasText: 'show all projects' }).click({ timeout: 20_000 });
  await expect.poll(async () => (await page.evaluate(() => window.__starChartTest!.viewGraph()!)).nodes.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await settle(page);
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.locator('.area-chooser label', { hasText: 'Comet Pod' }).locator('input').check({ timeout: 20_000 });
  await page.locator('.area-chooser .cosmos__cta').click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
  await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
  return { app, page };
}

test('add, keep through Purge, and remove a picture for a captain (91, slice 6)', { tag: '@keystone' }, async () => {
  const pick = join(mkdtempSync(join(tmpdir(), 'sc-pick-')), 'invented-face.png');
  writeFileSync(pick, PNG);
  const { app, page } = await openPod(pick);
  try {
    const teo = page.locator('.callout--captain', { hasText: 'Teo Halvorsen' });
    const maren = page.locator('.callout--captain', { hasText: 'Maren Solis' });
    await expect(teo.locator('.callout__avatar img')).toHaveCount(0); // initials on a colour
    await clickNode(page, await keyOf(page, 'captain', 'Teo Halvorsen'));
    const add = page.locator('.picture-controls button', { hasText: /picture/ }).first();
    await expect(page.locator('.picture-controls button', { hasText: 'Remove picture' })).toHaveCount(0);

    // Add: the chooser is skipped in test runs; the picture arrives with a reload from the cache.
    await add.click();
    await expect(teo.locator('.callout__avatar img')).toHaveCount(1, { timeout: 15_000 });
    await expect(maren.locator('.callout__avatar img')).toHaveCount(0); // only the one person
    await expect(page.locator('.picture-controls button', { hasText: 'Change picture…' })).toBeVisible();
    await page.screenshot({ path: 'test-results/pictures-1-added.png' });

    // It lives beside the cache, keyed by the org and the identity.
    const dir = await app.evaluate(({ app: a }) => a.getPath('userData'));
    const files = () => (existsSync(join(dir, 'pictures')) ? readdirSync(join(dir, 'pictures'), { recursive: true }).map(String).filter((f) => f.endsWith('.png')) : []);
    expect(files()).toHaveLength(1);

    // Nothing about the picture crossed IPC: not its path, not its bytes.
    const log = await app.evaluate(() => (globalThis as { __starChartIpcLog?: { channel: string; args: string; result: string }[] }).__starChartIpcLog ?? []);
    const mine = log.filter((l) => l.channel.includes('pictures'));
    expect(mine.length).toBeGreaterThan(0);
    for (const l of mine) expect(`${l.args}${l.result}`).not.toMatch(/data:image|invented-face|sc-pick-/);

    // Remove: initials again, and the file is gone.
    await page.locator('.picture-controls button', { hasText: 'Remove picture' }).click();
    await expect(teo.locator('.callout__avatar img')).toHaveCount(0, { timeout: 15_000 });
    expect(files()).toHaveLength(0);
    await expect(page.locator('.picture-controls button', { hasText: 'Remove picture' })).toHaveCount(0);

    // Purge empties the cache but not the pictures: add one again, purge, and it is still there.
    await page.locator('.picture-controls button', { hasText: 'Add picture…' }).click();
    await expect(teo.locator('.callout__avatar img')).toHaveCount(1, { timeout: 15_000 });
    await page.evaluate(() => window.starChart.cache.purge());
    expect(files()).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('a file that is not a picture is turned down in words, and nothing is kept', async () => {
  const bad = join(mkdtempSync(join(tmpdir(), 'sc-pick-')), 'not-a-picture.png');
  writeFileSync(bad, 'this is plain text, not an image');
  const { app, page } = await openPod(bad);
  try {
    await clickNode(page, await keyOf(page, 'captain', 'Maren Solis'));
    await page.locator('.picture-controls button', { hasText: /picture/ }).first().click();
    await expect(page.locator('.picture-controls__msg')).toContainText('couldn’t be read as a picture');
    await expect(page.locator('.callout--captain', { hasText: 'Maren Solis' }).locator('.callout__avatar img')).toHaveCount(0);
    const dir = await app.evaluate(({ app: a }) => a.getPath('userData'));
    expect(existsSync(join(dir, 'pictures'))).toBe(false);
  } finally {
    await app.close();
  }
});
