// Settings → Captain Avatars: a square per captain in the open scene; a click chooses a picture, a drop
// from Finder gives one in a single gesture, a paste onto a focused square does too; several dropped
// together are matched to captains by file name (confirmed first), and what matches nobody waits in the
// tray to be dragged onto a square. Undo, remove, an optional crop, and copy-out / read-in of the
// folder. The fake org's invented people and a few invented pixels only (INV-18). Drops are dispatched
// as DragEvents carrying a DataTransfer, which is what Finder's drag becomes in the page.
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAGklEQVR4nGNwWHCAKohh1KBRg0YNGjWIMgQAF/FwH80XQcsAAAAASUVORK5CYII=';

async function openPod(pickDir: string) {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: 'sprints',
    STAR_CHART_PICK_DIR: pickDir, STAR_CHART_DB_DIR: mkdtempSync(join(tmpdir(), 'sc-avatars-')),
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

/** Dispatch the events a Finder drag becomes: enter, over, drop, with the files (or a tray item) in a DataTransfer. */
async function drop(target: Locator, payload: { files?: string[]; tray?: string }) {
  await target.evaluate((el, { payload, b64 }) => {
    const dt = new DataTransfer();
    for (const name of payload.files ?? []) dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'image/png' }));
    if (payload.tray) dt.setData('application/x-star-chart-tray', payload.tray);
    for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, { payload, b64: PNG_B64 });
}

test('give captains pictures by click, drop, paste and file name; undo, remove, crop, and copy out and in (13 §7)', { tag: '@keystone' }, async () => {
  const pickDir = mkdtempSync(join(tmpdir(), 'sc-avatars-pick-'));
  const png = join(mkdtempSync(join(tmpdir(), 'sc-avatars-file-')), 'invented-face.png');
  writeFileSync(png, Buffer.from(PNG_B64, 'base64'));
  const { app, page } = await openPod(pickDir);
  try {
    await page.evaluate(() => window.__starChartTest!.openSettings('avatars'));
    await expect(page.locator('#settings-modal [role="tab"][aria-selected="true"]')).toHaveText('Captain Avatars');
    const tile = (name: string) => page.locator('.avatars__tile', { hasText: name });
    const teo = tile('Teo Halvorsen');
    const maren = tile('Maren Solis');
    const chart = (name: string) => page.locator('.callout--captain', { hasText: name }).locator('.callout__avatar img');

    // One square per captain in this system, each with initials on a colour.
    await expect(teo).toHaveCount(1);
    await expect(maren).toHaveCount(1);
    await expect(teo).toHaveAttribute('data-picture', 'none');
    await expect(teo.locator('.avatars__initials')).toHaveText('TH');
    await expect(teo.locator('img')).toHaveCount(0);

    // A click opens the file chooser for that captain.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), teo.locator('.avatars__pic').click()]);
    await chooser.setFiles(png);
    await expect(teo.locator('img')).toHaveCount(1, { timeout: 15_000 });
    await expect(teo).toHaveAttribute('data-picture', 'hand');
    await expect(chart('Teo Halvorsen')).toHaveCount(1); // the chart behind wears it too
    const dir = await app.evaluate(({ app: a }) => a.getPath('userData'));
    const files = () => (existsSync(join(dir, 'pictures')) ? readdirSync(join(dir, 'pictures'), { recursive: true }).map(String).filter((f) => f.endsWith('.png')) : []);
    expect(files()).toHaveLength(1);
    await page.screenshot({ path: 'test-results/avatars-1-chosen.png' });

    // A drop onto a square is one gesture; Undo puts the initials back.
    await drop(maren, { files: ['anything.png'] });
    await expect(maren.locator('img')).toHaveCount(1, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(maren.locator('img')).toHaveCount(0, { timeout: 15_000 });
    expect(files()).toHaveLength(1);

    // A paste onto a focused square.
    await maren.locator('.avatars__pic').focus();
    await page.evaluate((b64) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'image.png', { type: 'image/png' }));
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
    }, PNG_B64);
    await expect(maren.locator('img')).toHaveCount(1, { timeout: 15_000 });
    await page.locator('.avatars__remove[aria-label*="Maren"]').click();
    await expect(maren.locator('img')).toHaveCount(0, { timeout: 15_000 });

    // Several dropped on the grid: matched by file name and confirmed; the stranger waits in the tray.
    await drop(page.locator('.avatars__grid'), { files: ['maren-solis.png', 'teo halvorsen.png', 'mystery.png'] });
    const review = page.getByRole('group', { name: 'Pictures matched to captains' });
    await expect(review.locator('li')).toHaveCount(2);
    await expect(review.locator('li', { hasText: 'Teo Halvorsen' })).toContainText('replaces their picture');
    await expect(page.locator('.avatars__stray')).toHaveCount(1);
    await review.getByRole('button', { name: /^Apply 2/ }).click();
    await expect(maren.locator('img')).toHaveCount(1, { timeout: 15_000 });
    await expect(review).toHaveCount(0);
    expect(files()).toHaveLength(2);

    // The stray goes onto a captain by dragging it from the tray.
    await page.getByRole('button', { name: /Remove Maren/ }).click();
    await expect(maren.locator('img')).toHaveCount(0, { timeout: 15_000 });
    const trayId = await page.locator('.avatars__stray').getAttribute('data-tray-id');
    await drop(maren, { tray: trayId! });
    await expect(maren.locator('img')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('.avatars__stray')).toHaveCount(0);

    // Copy the pictures out, drop one, read them back in.
    await page.getByRole('button', { name: /Copy all to a folder/ }).click();
    await expect(page.locator('.avatars__note')).toContainText('Copied 2 pictures', { timeout: 15_000 });
    expect(readdirSync(join(pickDir, 'star-chart-pictures')).filter((f) => f.endsWith('.png'))).toHaveLength(2);
    await page.getByRole('button', { name: /Remove Teo/ }).click();
    await expect(teo.locator('img')).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole('button', { name: /Read from a folder/ }).click();
    await expect(page.locator('.avatars__note')).toContainText('Read 2 pictures', { timeout: 15_000 });
    await expect(teo.locator('img')).toHaveCount(1, { timeout: 15_000 });
    await expect(chart('Teo Halvorsen')).toHaveCount(1);

    // The crop option puts a crop step before a single picture.
    await page.getByRole('button', { name: /Remove Teo/ }).click();
    await expect(teo.locator('img')).toHaveCount(0, { timeout: 15_000 });
    await page.getByLabel('Adjust the crop of a single picture first').check();
    await drop(teo, { files: ['teo.png'] });
    await expect(page.getByRole('heading', { name: 'Crop the picture for Teo Halvorsen' })).toBeVisible();
    await page.screenshot({ path: 'test-results/avatars-2-crop.png' });
    await page.getByRole('button', { name: 'Use this crop' }).click();
    await expect(teo.locator('img')).toHaveCount(1, { timeout: 15_000 });
    await drop(teo, { files: ['again.png'] });
    // The crop opens after the dropped file is read: wait for it (and its focus), or Escape lands before it exists and it opens afterwards.
    await expect(page.getByRole('heading', { name: 'Crop the picture for Teo Halvorsen' })).toBeVisible();
    await expect(page.locator('.crop__view')).toBeFocused();
    await page.keyboard.press('Escape'); // cancels the crop, not Settings
    await expect(page.locator('#settings-modal')).toBeVisible();
    await expect(page.locator('.crop')).toHaveCount(0);

    // Only the keys and the sizes of pictures crossed; the bytes never reached the log.
    const log = await app.evaluate(() => (globalThis as { __starChartIpcLog?: { channel: string; args: string; result: string }[] }).__starChartIpcLog ?? []);
    for (const l of log.filter((x) => x.channel.includes('pictures.set'))) expect(l.args).toBe('[key, bytes]');
    await page.screenshot({ path: 'test-results/avatars-3-done.png' });

    // The filter, and Purge leaves the pictures.
    await page.getByLabel('Only captains without a picture').check();
    await expect(teo).toHaveCount(0); // both wear pictures now
    await expect(maren).toHaveCount(0);
    await expect(page.locator('.avatars__tile[data-picture="none"]')).toHaveCount(await page.locator('.avatars__tile').count());
    await page.evaluate(() => window.starChart.cache.purge());
    expect(files().length).toBeGreaterThan(0);
  } finally {
    rmSync(pickDir, { recursive: true, force: true });
    await app.close();
  }
});

test('fixtures show the captains read-only', async () => {
  const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_USER_DATA: mkdtempSync(join(tmpdir(), 'sc-avatars-fx-')) });
  try {
    await settle(page);
    await page.locator('.settings-button').click();
    await page.locator('#settings-tab-avatars').click();
    await expect(page.locator('.avatars')).toBeVisible();
    await expect(page.locator('.avatars')).toContainText('connected to ADO');
    for (const b of await page.locator('.avatars__pic').all()) await expect(b).toBeDisabled();
  } finally {
    await app.close();
  }
});
