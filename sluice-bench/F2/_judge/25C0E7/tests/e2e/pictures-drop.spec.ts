// 23 E8: a picture dropped on a captain's ship; Settings lists it; remove works; a non-image is turned down.
// The fake org's invented people and a few invented pixels only (INV-18).
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, settle } from './launch';

const CANARY = 'CANARY-PAT-4c1e7a2b-not-a-real-token';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAGklEQVR4nGNwWHCAKohh1KBRg0YNGjWIMgQAF/FwH80XQcsAAAAASUVORK5CYII=';

async function openPod(pickDir: string, solar = false) {
  const { app, page } = await launchApp({
    STAR_CHART_FAKE_ADO: '1', STAR_CHART_FIXTURE: 'sprint-mechanics', STAR_CHART_START_MODE: '', STAR_CHART_PARADIGM: solar ? '' : 'sprints',
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
  {
    await page.locator('.area-chooser label', { hasText: 'Comet Pod' }).locator('input').check({ timeout: 20_000 });
    await page.locator('.area-chooser .cosmos__cta').click();
  }
  if (!solar) { // Solar opens the pod straight from the chooser; the v0 board opens the sprint first
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(page);
    await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
  }
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
  return { app, page };
}

/** Drop a file on the chart at a captain's ship (the point is the ship's, found through the scene). */
async function dropOnShip(page: import('@playwright/test').Page, name: string, file: { name: string; type: string; b64: string } | null, at?: 'sky') {
  await page.evaluate(({ name, file, at }) => {
    const t = window.__starChartTest!;
    const s = t.hitCircles().find((c) => c.kind === 'captain' && c.label.includes(name))!; // the ship as drawn this frame
    const host = document.querySelector('.chart-host') as HTMLElement;
    const r = host.getBoundingClientRect();
    const x = at === 'sky' ? r.left + 2 : r.left + s!.x;
    const y = at === 'sky' ? r.top + 2 : r.top + s!.y;
    const dt = new DataTransfer();
    if (file) dt.items.add(new File([Uint8Array.from(atob(file.b64), (c) => c.charCodeAt(0))], file.name, { type: file.type }));
    for (const type of ['dragenter', 'dragover', 'drop']) host.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }));
  }, { name, file, at });
}

test('drop a picture on a captain\'s ship: it shows, Settings lists it, remove works, a non-image is turned down (23 E8)', async () => {
  const { app, page } = await openPod(mkdtempSync(join(tmpdir(), 'sc-drop-pick-')));
  try {
    const chart = (name: string) => page.locator('.callout--captain', { hasText: name }).locator('.callout__avatar img');
    await expect(chart('Teo Halvorsen')).toHaveCount(0);

    // Not a picture: turned down in words, nothing kept.
    await dropOnShip(page, 'Teo Halvorsen', { name: 'notes.txt', type: 'text/plain', b64: btoa('hello') });
    await expect(page.getByTestId('drop-note')).toContainText('couldn’t be read as a picture');
    await expect(chart('Teo Halvorsen')).toHaveCount(0);
    // A file that says it is a picture but isn't one: the decode check says no.
    await dropOnShip(page, 'Teo Halvorsen', { name: 'fake.png', type: 'image/png', b64: btoa('not really a png') });
    await expect(page.getByTestId('drop-note')).toContainText('couldn’t be read as a picture');
    // A picture dropped on empty sky is not taken.
    await dropOnShip(page, 'Teo Halvorsen', { name: 'a.png', type: 'image/png', b64: PNG_B64 }, 'sky');
    await expect(page.getByTestId('drop-note')).toContainText('onto a captain');
    await expect(chart('Teo Halvorsen')).toHaveCount(0);

    // A picture on the ship: the ship wears it.
    await dropOnShip(page, 'Teo Halvorsen', { name: 'face.png', type: 'image/png', b64: PNG_B64 });
    await expect(page.getByTestId('drop-note')).toContainText('picture is set', { timeout: 15_000 });
    await expect(chart('Teo Halvorsen')).toHaveCount(1, { timeout: 15_000 });
    const dir = await app.evaluate(({ app: a }) => a.getPath('userData'));
    expect(existsSync(join(dir, 'pictures'))).toBe(true);
    await page.screenshot({ path: 'review/v1.3/E/E8-drop-on-ship.png' });

    // Settings lists them (everyone loaded), says where they are, and can remove it.
    await page.evaluate(() => window.__starChartTest!.openSettings('avatars'));
    const tiles = page.locator('.avatars__tile');
    const inView = await tiles.count();
    await page.getByTestId('avatars-everyone').check();
    await expect(page.locator('.avatars .settings__note').first()).toContainText('everything loaded'); // not just this system
    expect(await tiles.count()).toBeGreaterThanOrEqual(inView);
    const teo = page.locator('.avatars__tile', { hasText: 'Teo Halvorsen' });
    await expect(teo).toHaveAttribute('data-picture', 'hand');
    await expect(page.getByTestId('avatars-where')).toContainText('never leave this Mac');
    await page.screenshot({ path: 'review/v1.3/E/E8-people-settings.png' });
    await teo.locator('.avatars__remove').click();
    await expect(teo).toHaveAttribute('data-picture', 'none', { timeout: 15_000 });
    await expect(chart('Teo Halvorsen')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Solar: a picture dropped on a ship sets it; a file dropped off the chart leaves the window where it was (23 E8)', async () => {
  const { app, page } = await openPod(mkdtempSync(join(tmpdir(), 'sc-drop-pick-')), true);
  try {
    const url = page.url();
    // Files dropped on the side panel, the transport and the header never take the window to the file.
    for (const sel of ['.sidepanel', '.transport', '.titlebar']) {
      const prevented = await page.locator(sel).first().evaluate((el) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' }));
        const ev = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
        el.dispatchEvent(ev);
        return ev.defaultPrevented;
      });
      expect(prevented, sel).toBe(true);
    }
    expect(page.url()).toBe(url);

    const captains = await page.evaluate(() => window.__starChartTest!.liveNodes().filter((n) => n.kind === 'captain').map((n) => n.label));
    expect(captains.length).toBeGreaterThan(0);
    await dropOnShip(page, captains[0]!, { name: 'face.png', type: 'image/png', b64: PNG_B64 });
    await expect(page.getByTestId('drop-note')).toContainText('picture is set', { timeout: 15_000 });
    await expect(page.locator('.callout--captain', { hasText: captains[0]! }).locator('.callout__avatar img')).toHaveCount(1, { timeout: 15_000 });
    await page.screenshot({ path: 'review/v1.3/E/E8-solar-drop.png' });

    // And main refuses any navigation away from the app's own page, a file:// URL included (read from main).
    const winUrl = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getURL());
    const before = await winUrl();
    await page.evaluate(() => { setTimeout(() => { location.href = 'file:///etc/hosts'; }, 0); });
    await new Promise((r) => setTimeout(r, 1000));
    expect(await winUrl()).toBe(before);
  } finally {
    await app.close();
  }
});
