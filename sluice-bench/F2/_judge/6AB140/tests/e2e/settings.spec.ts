// Settings (v1, 13 §7, 17 W4-T2, 14 §5 "Settings"): the cog opens a modal whose tabs move on ↑/↓
// (and Home/End), Esc closes it and gives focus back, focus stays inside while it's open, and every
// target is at least 44 pt. The Connection tab is the Connect panel in the same markup, so the
// `.connect…` selectors read it as they read the panel. The viewer chosen under Your captain lives in
// userData/settings.json and survives a relaunch, and the awards are only ever the viewer's, shown on
// the viewer's own ship (18 §1, §3). Fixture data only, invented names (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchApp, settle } from './launch';

/** The tabs, in order (settings/store.ts SETTINGS_TABS). */
const TABS = ['Connection', 'Theme', 'Your captain', 'Captain Avatars', 'How to read the chart'];

const userData = mkdtempSync(join(tmpdir(), 'star-chart-e2e-settings-'));
const env = { STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_USER_DATA: userData };

let app: ElectronApplication;
let page: Page;

const modal = () => page.locator('#settings-modal[role="dialog"]');
const selectedTab = () => page.locator('#settings-modal [role="tab"][aria-selected="true"]');
const focused = () => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null;
  return { inside: !!el?.closest('#settings-modal'), role: el?.getAttribute('role') ?? null, text: el?.textContent?.trim() ?? '', cog: !!el?.classList.contains('settings-button') };
});

/** Galaxy → Tidewater Array's Sprint 13 → Harbor Pod: the region, where the viewer's people and awards are. */
async function openRegion(p: Page): Promise<void> {
  await p.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await p.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await p.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(p);
  await p.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await p.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(p);
}

async function openSettings(): Promise<void> {
  await page.locator('.settings-button').click();
  await expect(modal()).toBeVisible();
}

/** Plays the last few seconds at 4× so the round ends on its recap, and returns the most insignia seen at once. */
async function recapGlyphs(): Promise<number> {
  await page.evaluate(() => {
    const t = window.__starChartTest!;
    t.setScheduleMs(Math.max(0, t.session().totalMs - 2_000));
    t.setRate(4);
    t.play();
  });
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 20_000 });
  let most = 0;
  for (let i = 0; i < 40; i++) {
    most = Math.max(most, (await page.evaluate(() => window.__starChartTest!.fxCensus())).glyphs);
    await page.waitForTimeout(100);
  }
  return most;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ app, page } = await launchApp(env));
  await openRegion(page);
});
test.afterAll(async () => { await app?.close(); });

test('the cog opens Settings; ↑/↓ and Home/End move between tabs; keys stay inside; Esc closes and gives focus back', async () => {
  const cog = page.locator('.settings-button');
  await expect(cog).toHaveAttribute('aria-label', 'Settings');
  await expect(cog).toHaveAttribute('aria-expanded', 'false');
  await openSettings();
  await expect(cog).toHaveAttribute('aria-expanded', 'true');
  // Focus is on the selected tab, and the panel is the one it controls.
  let f = await focused();
  expect(f).toMatchObject({ inside: true, role: 'tab' });
  const first = TABS.indexOf(f.text);
  expect(first).toBeGreaterThanOrEqual(0);
  for (let step = 1; step <= TABS.length; step++) {
    await page.keyboard.press('ArrowDown');
    const want = TABS[(first + step) % TABS.length]!;
    await expect(selectedTab()).toHaveText(want);
    expect((await focused()).text).toBe(want);
    const panel = await selectedTab().getAttribute('aria-controls');
    await expect(page.locator(`#${panel}[role="tabpanel"]`)).toBeVisible();
  }
  await page.keyboard.press('ArrowUp');
  await expect(selectedTab()).toHaveText(TABS[(first - 1 + TABS.length) % TABS.length]!);
  await page.keyboard.press('Home');
  await expect(selectedTab()).toHaveText(TABS[0]!);
  await page.keyboard.press('End');
  await expect(selectedTab()).toHaveText(TABS.at(-1)!);
  // The chart's shortcuts stay quiet behind the modal: Space doesn't play.
  const before = await page.evaluate(() => window.__starChartTest!.session().status);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__starChartTest!.session().status)).toBe(before);
  await page.screenshot({ path: 'test-results/settings-1-modal.png' });
  await page.keyboard.press('Escape');
  await expect(modal()).toHaveCount(0);
  f = await focused();
  expect(f.cog).toBe(true);
  // Esc closed only the modal: the region is still on screen.
  expect(await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey)).toMatch(/^pod:/);
});

test('focus stays inside the modal while it is open (Tab and Shift+Tab wrap)', async () => {
  await openSettings();
  for (const tab of TABS) {
    await page.locator('#settings-modal [role="tab"]', { hasText: tab }).click();
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press(key);
        expect((await focused()).inside, `${tab}: ${key} #${i + 1} left the modal`).toBe(true);
      }
    }
  }
  await page.keyboard.press('Escape');
  await expect(modal()).toHaveCount(0);
});

test('every target in every tab is at least 44 pt, and so is the cog', async () => {
  const cog = (await page.locator('.settings-button').boundingBox())!;
  expect(Math.min(cog.width, cog.height)).toBeGreaterThanOrEqual(44);
  await openSettings();
  for (const tab of TABS) {
    await page.locator('#settings-modal [role="tab"]', { hasText: tab }).click();
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const dialog = document.querySelector('#settings-modal')!;
      const controls = dialog.querySelectorAll<HTMLElement>('button, select, a[href], input, textarea, [role="tab"]');
      for (const el of controls) {
        if (!el.getClientRects().length) continue; // not drawn
        // A radio or checkbox is reached through its label, which is the target.
        const target = el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') ? el.closest('label') ?? el : el;
        const r = target.getBoundingClientRect();
        if (r.height < 43.5 || r.width < 43.5) out.push(`${target.tagName.toLowerCase()}.${[...target.classList].join('.')} "${target.textContent?.trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return out;
    });
    expect(small, `${tab}: targets under 44 pt`).toEqual([]);
  }
  await page.keyboard.press('Escape');
});

test('the Connection tab is the Connect panel: the mode chip opens it, and the .connect… selectors read it', async () => {
  await page.locator('.mode-chip').click();
  await expect(modal()).toBeVisible();
  await expect(selectedTab()).toHaveText('Connection');
  const section = page.locator('section#connect-panel.connect.connect--tab');
  await expect(section).toBeVisible();
  await expect(section.locator('.connect__mode')).toBeVisible();
  await expect(section.locator('.settings__purge-note')).toContainText('Purge deletes cached work data only');
  // One close, in the modal's head: both class names, so v0's selectors and v1's agree.
  await expect(page.locator('.connect__close')).toHaveCount(1);
  await expect(page.locator('.settings__close.connect__close')).toHaveCount(1);
  await page.locator('.connect__close').click();
  await expect(modal()).toHaveCount(0);
  expect(await page.evaluate(() => (JSON.parse(window.__starChartTest!.storeJson()) as { connectOpen: boolean }).connectOpen)).toBe(false);
  // The tab, reached from the cog, is the same section.
  await openSettings();
  await page.locator('#settings-modal [role="tab"]', { hasText: 'Connection' }).click();
  await expect(section).toBeVisible();
  await page.locator('.settings__close').click();
  await expect(modal()).toHaveCount(0);
});

test('the viewer survives a relaunch, and the awards are only ever the viewer’s, on the viewer’s own ship', async () => {
  // Nobody chosen: no awards at all (18 §1), and the recap lights no insignia.
  expect(await page.evaluate(() => window.__starChartTest!.awards())).toEqual([]);
  expect(await recapGlyphs()).toBe(0);

  await openSettings();
  await page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
  const who = page.locator('select[data-log="viewer-choose"]');
  const wren = (await who.locator('option', { hasText: 'Wren Calloway' }).getAttribute('value'))!;
  const ossian = (await who.locator('option', { hasText: 'Ossian Vale' }).getAttribute('value'))!;
  await who.selectOption(wren);
  await expect.poll(() => page.evaluate(() => window.starChart.settings.get().then((s) => Object.values(s.viewer)))).toEqual([wren]);
  await page.keyboard.press('Escape');

  // Relaunch on the same userData: the viewer reads back.
  await app.close();
  ({ app, page } = await launchApp(env));
  await openRegion(page);
  expect(await page.evaluate(() => window.starChart.settings.get().then((s) => Object.values(s.viewer)))).toEqual([wren]);
  await openSettings();
  await page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
  await expect(page.locator('select[data-log="viewer-choose"]')).toHaveValue(wren);
  await expect(page.locator('.settings__award').first()).toBeVisible(); // the fixture's viewer earns awards (18 §5 A1)
  await page.screenshot({ path: 'test-results/settings-2-captain.png' });
  await page.keyboard.press('Escape');

  // Every award is the viewer's and is held by the viewer's ship; the recap lights them there.
  const mine = await page.evaluate(() => window.__starChartTest!.awards().map((a) => ({ id: a.id, holder: (a as { holder?: string }).holder })));
  expect(mine.length).toBeGreaterThan(0);
  expect(mine.every((a) => a.holder === wren)).toBe(true);
  expect(await page.evaluate((k) => window.__starChartTest!.viewGraph()!.nodes.some((n) => n.kind === 'captain' && n.canonicalKey === k), wren)).toBe(true);
  const lit = await recapGlyphs();
  expect(lit).toBeGreaterThan(0);
  expect(lit).toBeLessThanOrEqual(mine.length);

  // Another viewer: the awards follow them, and never carry the first viewer.
  await openSettings();
  await page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
  await page.locator('select[data-log="viewer-choose"]').selectOption(ossian);
  await page.keyboard.press('Escape');
  const theirs = await page.evaluate(() => window.__starChartTest!.awards().map((a) => (a as { holder?: string }).holder));
  expect(theirs.every((h) => h === ossian)).toBe(true);

  // The switch off: nothing at all.
  await openSettings();
  await page.locator('#settings-modal [role="tab"]', { hasText: 'Your captain' }).click();
  await page.locator('#settings-modal label', { hasText: 'Show my achievements' }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__starChartTest!.awards())).toEqual([]);
  expect(await recapGlyphs()).toBe(0);
});
