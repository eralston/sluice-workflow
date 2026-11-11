// HG-3a review scenes (added 2026-10-03): Ember Desk (one person's whole Feature with one PR) and
// Kestrel Team (a bug outbreak). Smoke checks, plus stills at the moments worth watching.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickNode, enterNodeByKey, keyOf, launchApp, settle } from './launch';

let app: ElectronApplication;
let page: Page;

test.describe.configure({ timeout: 120_000 }); // long play-throughs and many stills; slow under a full run

test.afterEach(async () => {
  await app?.close();
});

const stack = () => page.evaluate(() => window.__starChartTest!.stack());

/** Galaxy → Nimbus Deck → a one-Feature squad: the sector passes straight through to its Feature system (AC-48). */
async function openFeature(squad: string, feature: string) {
  ({ app, page } = await launchApp());
  await clickNode(page, await keyOf(page, 'galaxy', 'Nimbus Deck'));
  await page.locator('.chooser button', { hasText: squad }).click();
  await settle(page);
  await expect(page.locator('.breadcrumb [aria-current]')).toContainText(feature);
  await page.mouse.move(0, 0);
}

const beatAt = (iso: string) => page.evaluate((t) => window.__starChartTest!.beatTimes().find((b) => b.sourceUtc === t)!, Date.parse(iso));
async function stepInto(iso: string) {
  const b = await beatAt(iso);
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.startMs - 1);
  await page.waitForTimeout(60);
  await page.evaluate(() => window.__starChartTest!.stepBeat());
}
async function stills(prefix: string, shots: [string, number, string][]) {
  for (const [iso, wait, name] of shots) {
    await stepInto(iso);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `test-results/${prefix}-${name}.png` });
  }
}
const captains = () => page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'captain').length);

test('Ember Desk: one ship, one PR, and the Feature ends Closed (stills: test-results/ember-*.png)', async () => {
  await openFeature('Ember Desk', 'Notes on saved quotes');
  expect(await captains()).toBe(1);
  await stills('ember', [
    ['2026-09-14T16:30:00.000Z', 1200, '1-story-emerges'],
    ['2026-09-15T16:00:00.000Z', 1200, '2-second-task'],
    ['2026-09-15T21:00:00.000Z', 1600, '3-pr-launch'],
    ['2026-09-16T17:30:00.000Z', 1200, '4-third-task-joins'],
    ['2026-09-18T16:30:00.000Z', 1200, '5-merge'],
    ['2026-09-18T22:00:00.000Z', 1400, '6-feature-closed'],
  ]);
  // Alone: the merge has no approvers, so no formation and no guests.
  await stepInto('2026-09-18T16:30:00.000Z');
  await page.waitForTimeout(600);
  expect((await page.evaluate(() => window.__starChartTest!.fxCensus())).guests).toBe(0);
});

test('Kestrel Team: the outbreak plays, and the formation shows pictures, not role chips (stills: test-results/kestrel-*.png)', async () => {
  await openFeature('Kestrel Team', 'Policy renewal reminders');
  expect(await captains()).toBe(2);
  await stills('kestrel', [
    ['2026-09-16T17:00:00.000Z', 1700, '1-first-merge-formation'],
    ['2026-09-16T23:00:00.000Z', 1200, '2-first-bug'],
    ['2026-09-17T18:00:00.000Z', 1700, '3-first-bug-fix-merges'],
    ['2026-09-17T19:00:00.000Z', 1400, '4-first-bug-resolved'],
    ['2026-09-17T20:00:00.000Z', 1200, '5-second-bug'],
    ['2026-09-18T17:00:00.000Z', 1400, '6-two-bugs'],
    ['2026-09-18T20:30:00.000Z', 1700, '7-last-fix-formation'],
    ['2026-09-18T21:30:00.000Z', 1400, '8-bugs-resolved'],
    ['2026-09-19T00:30:00.000Z', 1400, '9-settled'],
  ]);
  // The last fix: Bram resides here, Sana is a guest wearing her picture; nobody wears a role chip.
  await stepInto('2026-09-18T20:30:00.000Z');
  await page.waitForTimeout(900);
  expect((await page.evaluate(() => window.__starChartTest!.fxCensus())).guests).toBe(1);
  await expect(page.locator('.guest-tag .callout__avatar')).toHaveCount(1);
  await expect(page.locator('.role-chip')).toHaveCount(0);
});

test('AC-48 (E): a one-Feature sector passes through on the way in and on the way back', { tag: '@keystone' }, async () => {
  await openFeature('Ember Desk', 'Notes on saved quotes');
  const st = await stack();
  expect(st.map((e) => e.sceneKey.split(':')[0])).toEqual(['galaxy', 'sector', 'feature']);
  await expect(page.locator('.breadcrumb')).toContainText('Nimbus Deck');
  await expect(page.locator('.breadcrumb')).toContainText('Ember Desk');
  // Back passes over the sector: the galaxy, with Nimbus Deck's chooser open.
  await page.keyboard.press('Escape');
  await settle(page);
  expect((await stack()).length).toBe(1);
  await page.locator('.chooser button', { hasText: 'Ember Desk' }).click();
  await settle(page);
  // The team switcher is always there, even in a one-Feature team: switch to Comet Crew from here.
  await expect(page.locator('.team-pill')).toContainText('Ember Desk');
  await page.locator('.team-pill__switch').click();
  await expect(page.locator('.sibling-menu')).toContainText('⬡ Epics');
  await page.locator('.sibling-menu .sibling-menu__item', { hasText: 'Comet Crew' }).click();
  await settle(page);
  expect((await stack()).map((e) => e.sceneKey.split(':')[0])).toEqual(['galaxy', 'sector']); // the team's sky
  await expect(page.locator('.team-pill')).toContainText('Comet Crew');
  // Its name goes to the team's home: in a one-Feature team, that Feature.
  await page.locator('.team-pill__switch').click();
  await page.locator('.sibling-menu .sibling-menu__item', { hasText: 'Ember Desk' }).click();
  await settle(page);
  await enterNodeByKey(page, await keyOf(page, 'planet', 'Add a note to a saved quote'));
  await page.locator('.team-pill__name').click();
  await settle(page);
  expect((await stack()).at(-1)!.sceneKey.startsWith('feature:')).toBe(true);
  await page.screenshot({ path: 'test-results/team-switcher.png' });
});

/** Sample where things are drawn every frame for `ms` of wall time, from now: [t (ms), pk → (x, y)]. */
async function sample(ms: number, pks: string[]) {
  return page.evaluate(([ms, pks]) => new Promise<{ t: number; at: Record<string, [number, number]> }[]>((done) => {
    const out: { t: number; at: Record<string, [number, number]> }[] = [];
    const t0 = performance.now();
    const tick = () => {
      const t = performance.now() - t0;
      const at: Record<string, [number, number]> = {};
      for (const n of window.__starChartTest!.liveNodes()) if (pks.includes(n.projectionKey)) at[n.projectionKey] = [n.world.x, n.world.y];
      out.push({ t, at });
      if (t < ms) requestAnimationFrame(tick);
      else done(out);
    };
    requestAnimationFrame(tick);
  }), [ms, pks] as const);
}
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

for (const rate of [1, 4]) {
  test(`AC-49 (E): at ${rate}×, nothing moves the formation while it plays; the next launch waits for it`, async () => {
    await openFeature('Kestrel Team', 'Policy renewal reminders');
    const merge = await beatAt('2026-09-16T15:00:00.000Z'); // PR 9501: Odile leads, Bram supports
    const launch = await beatAt('2026-09-16T16:00:00.000Z'); // PR 9503 opens (Odile's)
    expect(launch.startMs).toBeGreaterThanOrEqual(merge.startMs + 5100); // the beat holds the whole formation
    // Resolve the projection keys at the launch's state, so the new vessel exists.
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), launch.startMs + 1);
    await page.waitForTimeout(80);
    const k = await page.evaluate(() => window.__starChartTest!.targetNodes().filter((n) => n.kind === 'captain').map((n) => [n.label, n.projectionKey] as const));
    const ships = k.map(([, pk]) => pk);
    const v1 = (await page.evaluate(() => window.__starChartTest!.targetNodes().find((n) => n.kind === 'flight' && n.label === 'Reminder schedule storage')?.projectionKey))!;
    const v3 = (await page.evaluate(() => window.__starChartTest!.targetNodes().find((n) => n.kind === 'flight' && n.label === 'Nightly reminder job and email template')?.projectionKey))!;
    expect(v1 && v3 && ships.length === 2).toBeTruthy();
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), merge.startMs - 1);
    await page.waitForTimeout(80);
    await page.evaluate((r) => { window.__starChartTest!.setRate(r); window.__starChartTest!.play(); }, rate);
    // The formation runs on the accent clock: 5.1 s at 1×, 2.55 s at 4× (accents cap at 2×).
    const formS = 5.1 / Math.min(rate, 2);
    const frames = await sample(formS * 1000 + 600, [v1, v3, ...ships]);
    await page.evaluate(() => window.__starChartTest!.pause());
    const inWindow = (a: number, b: number) => frames.filter((f) => f.t >= a * 1000 && f.t <= b * 1000);
    // While the crew holds the V (gathered, until they leave), each ship keeps its distance from the vessel.
    // Well inside the phase (gathered at 1.2 s, leaving at 4.1 s), so frame timing can't blur its edges.
    const hold = inWindow((1.5 / 5.1) * formS, (3.7 / 5.1) * formS);
    expect(hold.length).toBeGreaterThan(5);
    for (const pk of ships) {
      const d = hold.map((f) => Math.hypot(f.at[pk]![0] - f.at[v1]![0], f.at[pk]![1] - f.at[v1]![1]));
      expect(spread(d)).toBeLessThan(Math.max(6, 0.02 * Math.min(...d))); // a slow settle, never a sweep
    }
    // After its berth, the merged vessel stays put until the formation is over: under 2 px on screen,
    // whatever the zoom (a wide board fits far out, where a world unit is a fraction of a pixel).
    const scale = (await page.evaluate(() => window.__starChartTest!.camera())).scale;
    const still = 2 / scale;
    const berthed = inWindow((3.4 / 5.1) * formS, (5.0 / 5.1) * formS);
    expect(spread(berthed.map((f) => f.at[v1]![0]))).toBeLessThan(still);
    expect(spread(berthed.map((f) => f.at[v1]![1]))).toBeLessThan(still);
    // The next PR's vessel doesn't leave its bay while the formation plays.
    const during = inWindow(0, (5.0 / 5.1) * formS).filter((f) => f.at[v3]);
    if (during.length) {
      expect(spread(during.map((f) => f.at[v3]![0]))).toBeLessThan(still);
      expect(spread(during.map((f) => f.at[v3]![1]))).toBeLessThan(still);
    }
  });
}

test('AC-49 (E): Ember plays its lone merge and its closings through to the end, cleanly', async () => {
  await openFeature('Ember Desk', 'Notes on saved quotes');
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const merge = await beatAt('2026-09-18T16:30:00.000Z');
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), merge.startMs - 1);
  await page.waitForTimeout(80);
  await page.evaluate(() => { window.__starChartTest!.setRate(2); window.__starChartTest!.play(); });
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 30_000 });
  await page.waitForFunction(() => window.__starChartTest!.fx().active === 0, undefined, { timeout: 30_000 });
  expect(errors).toEqual([]);
  const tove = await page.evaluate(() => window.__starChartTest!.targetNodes().find((n) => n.kind === 'captain'));
  const drawn = await page.evaluate(() => window.__starChartTest!.liveNodes().find((n) => n.kind === 'captain'));
  expect(Math.hypot(tove!.world.x - drawn!.world.x, tove!.world.y - drawn!.world.y)).toBeLessThan(2); // thawed: home at the end
});
