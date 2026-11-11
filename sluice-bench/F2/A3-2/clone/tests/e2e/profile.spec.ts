// Device profiles (v1.4 C4, 15 §11): STAR_CHART_PROFILE=phone changes what is drawn and the pacing
// budget; a broken profile.json falls back to desktop with a notice in Settings; a switch flips in one
// run through the test hook. Fixture data only (INV-18). The beat comparison runs on orbit-week (the
// default fixture) because its budget bites; Pulsar plays the same length at any budget (C4b).
import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clickNode, enterNodeByKey, frames, keyOf, launchApp, settle } from './launch';

/** Open the Billing statement redesign star (a scene with a schedule) and read the session. */
async function sessionInStar(page: Page): Promise<{ totalMs: number; beats: number; accented: number }> {
  await clickNode(page, await keyOf(page, 'galaxy', 'Nimbus Deck'));
  await page.locator('.chooser button', { hasText: 'Lantern Squad' }).click();
  await settle(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Billing statement redesign'));
  await frames(page, 3);
  return page.evaluate(() => {
    const t = window.__starChartTest!;
    return { totalMs: t.session().totalMs, beats: t.session().beats, accented: t.beatTimes().filter((b) => b.accented).length };
  });
}

test('the phone profile turns paint off and shortens the schedule where the budget bites', async () => {
  const desktop = await launchApp();
  const d = await sessionInStar(desktop.page);
  expect(await desktop.page.evaluate(() => window.__starChartTest!.profile().id)).toBe('desktop');
  expect(await desktop.page.evaluate(() => window.__starChartTest!.paintOn())).toBe(true);
  await desktop.app.close();

  const phone = await launchApp({ STAR_CHART_PROFILE: 'phone' });
  const p = await sessionInStar(phone.page);
  const prof = await phone.page.evaluate(() => window.__starChartTest!.profile());
  expect(prof.id).toBe('phone');
  expect(prof.pacing.budgetMs).toBe(30000);
  expect(await phone.page.evaluate(() => window.__starChartTest!.paintOn())).toBe(false);
  // Relative, same rule as the unit case: fewer or shorter beats than the desktop session.
  expect(p.totalMs <= d.totalMs && p.accented <= d.accented, JSON.stringify({ d, p })).toBe(true);
  expect(p.totalMs < d.totalMs || p.accented < d.accented, JSON.stringify({ d, p })).toBe(true);
  await phone.app.close();
});

test('a switch flips in one run, and the ornament, twinkle and cap switches read the profile', async () => {
  const { app, page } = await launchApp();
  await page.evaluate(() => window.__starChartTest!.setProfile({ render: { switches: { paint: false } } }));
  await frames(page, 2);
  expect(await page.evaluate(() => window.__starChartTest!.paintOn())).toBe(false);
  await page.evaluate(() => window.__starChartTest!.setProfile(null));
  await frames(page, 2);
  expect(await page.evaluate(() => window.__starChartTest!.paintOn())).toBe(true);
  await page.evaluate(() => window.__starChartTest!.setProfile({ render: { limits: { maxActiveFx: 3 } } }));
  expect(await page.evaluate(() => window.__starChartTest!.profile().render.limits.maxActiveFx)).toBe(3); // the cap is read back only; that the director culls at it is not asserted here
  await page.evaluate(() => window.__starChartTest!.setProfile(null));
  expect(await page.evaluate(() => [window.__starChartTest!.ornamentPlays(), window.__starChartTest!.twinkleOn()])).toEqual([true, true]);
  await page.evaluate(() => window.__starChartTest!.setProfile({ render: { switches: { ornament: false, twinkle: false } } }));
  await frames(page, 2);
  expect(await page.evaluate(() => [window.__starChartTest!.ornamentPlays(), window.__starChartTest!.twinkleOn()])).toEqual([false, false]);
  await app.close();
});

test('a bad profile.json falls back to desktop and Settings shows the notice', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'star-chart-e2e-profile-'));
  writeFileSync(join(dir, 'profile.json'), '{ "pacing": { "budgetMs": "soon" } }');
  const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint', STAR_CHART_USER_DATA: dir });
  expect(await page.evaluate(() => window.__starChartTest!.profile().id)).toBe('desktop');
  expect(await page.evaluate(() => window.__starChartTest!.profile().pacing.budgetMs)).toBe(45000);
  await page.locator('.settings-button').click();
  await page.locator('#settings-modal [role="tab"]', { hasText: 'Theme' }).click();
  const box = page.locator('[data-testid="device-profile"]');
  await expect(box).toBeVisible();
  await expect(box.locator('[role="status"]')).not.toBeEmpty();
  await app.close();
});

test('Pulsar: the aura bake flips live, reads the same, and the scene draws after the pod reopens', async () => {
  const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '' });
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
  const open = async () => {
    await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await settle(page);
    await page.evaluate(() => { window.__starChartTest!.pause(); window.__starChartTest!.setReduced(true); });
    await frames(page, 4);
  };
  const read = async (bake: boolean) => {
    await page.evaluate((v) => window.__starChartTest!.setProfile({ render: { switches: { auraBake: v } } }), bake);
    await frames(page, 6);
    const a = await page.evaluate(() => window.__starChartTest!.auras());
    return a.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y), rimPx: r.rimPx, blurPx: r.blurPx, rimAlpha: r.rimAlpha, glowAlpha: r.glowAlpha }))
      .sort((p, q) => p.x - q.x || p.y - q.y);
  };
  await open();
  const live = await read(false);
  const baked = await read(true);
  expect(live.length).toBeGreaterThan(0);
  expect(baked.length).toBe(live.length);
  live.forEach((l, i) => {
    const b = baked[i]!;
    for (const k of ['rimPx', 'blurPx', 'rimAlpha', 'glowAlpha'] as const) expect(Math.abs(b[k] - l[k]), `aura ${i} ${k}`).toBeLessThanOrEqual(0.5);
  });
  // Close the pod and reopen it: textures freed with the first view must not take the chart's shared ones along.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
  await open();
  expect((await page.evaluate(() => window.__starChartTest!.auras())).length).toBe(live.length);
  expect(await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.length)).toBeGreaterThan(0);
  await app.close();
});
