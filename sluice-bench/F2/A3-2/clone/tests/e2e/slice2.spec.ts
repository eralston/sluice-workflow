// Slice 2 — replay, end to end: the transport, seeking, stepping, accents, jump trails, the lens,
// the event strip, and leak checks after a full play (05; 06 §5).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { enterNodeByKey, frames, keyOf, launchApp, openFeature101, settle } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
  await openFeature101(page);
  await page.mouse.move(0, 0);
});
test.afterAll(async () => {
  await app?.close();
});

const session = () => page.evaluate(() => window.__starChartTest!.session());
const fx = () => page.evaluate(() => window.__starChartTest!.fx());
const counts = () => page.evaluate(() => window.__starChartTest!.counts());
const seek = async (ms: number) => {
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
  await page.waitForTimeout(50);
};
/** Step until the given beat index is current (from the start). */
async function stepTo(index: number) {
  await seek(0);
  for (let i = 0; i <= index; i++) await page.evaluate(() => window.__starChartTest!.stepBeat());
  await page.waitForTimeout(80);
}
/**
 * The beat holding a source moment, by its time: a scene plays only its own events (decided
 * 2026-10-08), so beat indices differ from scene to scene and aren't worth hard-coding.
 */
async function beatIndexAt(iso: string) {
  const i = await page.evaluate((t) => window.__starChartTest!.beatTimes().find((b) => b.sourceUtc === t)?.index ?? -1, Date.parse(iso));
  expect(i, `no beat at ${iso}`).toBeGreaterThanOrEqual(0);
  return i;
}
/** The rate lives in a popover now (06 §5): open it and pick. */
const setRate = async (label: string) => {
  await page.locator('.transport__rate').click();
  await page.locator('.transport__rates button', { hasText: label }).click();
};

test('the session starts at the end of the range, and the transport shows its beats', { tag: '@keystone' }, async () => {
  const s = await session();
  expect(s.status).toBe('ended');
  expect(s.beats).toBeGreaterThan(8);
  expect(s.x).toBeCloseTo(s.totalMs, 0);
  await expect(page.locator('.transport')).toBeVisible();
  expect(await page.locator('.transport__tick').count()).toBe(s.beats);
});

test('AC-19 (E): a seek plays no accents and leaves no effects', { tag: '@keystone' }, async () => {
  await stepTo(3);
  // The launch is playing: waited for, not read after a fixed 100 ms, which under load could pass
  // before the step's first frame drew it (23 F5).
  await expect.poll(async () => (await fx()).active, { timeout: 10_000 }).toBeGreaterThan(0);
  // A seek clears it: read as soon as the seek has drawn, so the launch can't simply have finished.
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(12_000));
  await frames(page);
  expect(await fx()).toEqual({ active: 0, trails: 0 });
});

test('stepping shows the beat\'s state and plays its accents once, then pauses', { tag: '@keystone' }, async () => {
  await stepTo(0);
  const s = await session();
  expect(s.status).toBe('paused');
  expect(s.beatIndex).toBe(0);
  const story = await keyOf(page, 'planet', 'Show quote history on the policy page');
  const node = await page.evaluate((k) => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.canonicalKey === k)!.stage, story);
  expect(node).toBe('story.terraforming');
  // The step's accents start on its first drawn frame, not after a fixed time: wait until they play.
  await expect.poll(async () => (await fx()).active, { timeout: 10_000 }).toBeGreaterThan(0);
});

test('AC-21 (E): a concurrent assignment elsewhere never relocates the ship here, and no longer spends a beat on it (revised 2026-10-08)', async () => {
  // Resting places: layout targets (a visit goes and comes back, and glides ease in, 06 §5).
  const rest = async () => {
    await page.waitForTimeout(150);
    return page.evaluate(() => {
      const s = window.__starChartTest!.targetNodes().find((x) => x.kind === 'captain' && x.label === 'Ava Lindqvist');
      return s ? { x: Math.round(s.world.x), y: Math.round(s.world.y), to: s.attach?.to ?? null } : null;
    });
  };
  await stepTo(1);
  const before = await rest();
  // Ava also takes Story 211, in Feature 102. That's outside this scene, so it gets no beat here
  // (decided 2026-10-08) — but its state still applies, and her ship must not move for it.
  const at = Date.parse('2026-09-14T18:00:00.000Z');
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  expect(beats.some((b) => b.sourceUtc === at)).toBe(false); // no beat here spends time on it
  // Straddle the moment: her resting place is the same before it and just before the next beat here.
  const prev = [...beats].reverse().find((b) => b.sourceUtc < at)!;
  const next = beats.find((b) => b.sourceUtc > at)!;
  await seek(prev.startMs);
  const across = await rest();
  await seek(next.startMs - 1);
  expect(await rest()).toEqual(across);
  expect(across).toEqual(before);
});

test('a captain who leaves the scene leaves a jump trail; Go follows them to their destination', async () => {
  // Story 202 passes from Mina to Ava; Mina's other work is Story 221, in Feature 104.
  await stepTo(await beatIndexAt('2026-09-17T20:30:00.000Z'));
  await page.waitForFunction(() => window.__starChartTest!.fx().trails === 1, undefined, { timeout: 3000 }); // after the departure flight
  const trail = page.locator('.jump-trail');
  await expect(trail).toContainText('#221');
  await trail.locator('button', { hasText: 'Go' }).click();
  await settle(page);
  const top = await page.evaluate(() => window.__starChartTest!.stack().slice(-1)[0]!.sceneKey);
  expect(top).toMatch(/^body:.*:221$/);
  expect((await fx()).trails).toBe(0); // the new scene starts clean
  // Go opened Story 221 under its own Feature (104): back up to the sector and return to 101.
  await page.locator('.back').click();
  await settle(page);
  await page.locator('.back').click();
  await settle(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  await page.mouse.move(0, 0);
});

test('jump trails age on the playback clock: they hold while paused, fade as it runs, and hold at the end', async () => {
  await stepTo(await beatIndexAt('2026-09-17T20:30:00.000Z')); // Mina leaves Feature 101
  await page.waitForFunction(() => window.__starChartTest!.fx().trails === 1, undefined, { timeout: 5000 });
  const opacity = () => page.locator('.jump-trail').evaluate((el) => Number((el as HTMLElement).style.opacity));
  await page.waitForTimeout(600); // paused: the trail holds, however long the wall clock runs
  expect(await opacity()).toBe(1);
  // It ages on the playback clock, not the wall clock: once it runs, the trail fades through its
  // last seconds and then is gone. Polled while playing, because the fade is a window in schedule
  // time, not at a beat boundary.
  await setRate('4×');
  await page.locator('.transport__play').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('.jump-trail') as HTMLElement | null;
    return !!el && Number(el.style.opacity) < 1;
  }, undefined, { timeout: 20_000, polling: 16 });
  await page.waitForFunction(() => window.__starChartTest!.fx().trails === 0, undefined, { timeout: 20_000, polling: 16 });
  // Playing to the end holds the last frame: whatever is drawn there stops changing, so a departure
  // seen near the end stays followable (05 §5).
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 20_000 });
  await page.waitForTimeout(200);
  const held = await fx();
  const at = held.trails ? await opacity() : null;
  await page.waitForTimeout(600);
  expect((await fx()).trails).toBe(held.trails);
  if (at !== null) expect(await opacity()).toBeCloseTo(at, 3);
  await setRate('1×');
});

test('the History tab lists the beats so far, newest first; picking one seeks to it with no accents (revised 2026-10-04)', { tag: '@keystone' }, async () => {
  await page.locator('.view-panel__tab', { hasText: 'History' }).click();
  await expect(page.locator('.history')).toBeVisible();
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(1e9)); // the end: every beat has happened
  await page.waitForTimeout(100);
  const total = (await session()).beats;
  expect(await page.locator('.history-card').count()).toBe(total);
  await expect(page.locator('.history-card').first()).toHaveClass(/is-current/); // the newest is on top
  const want = await page.locator('.history-card', { hasText: /PR · #9003 · .* — Opened · by Mina Sato/ }).getAttribute('data-beat');
  await page.locator('.history-card', { hasText: /PR · #9003 · .* — Opened · by Mina Sato/ }).click();
  await page.waitForTimeout(100);
  const s = await session();
  expect(String(s.beatIndex)).toBe(want); // the card's own beat, whatever its index in this scene
  expect(s.beatIndex).toBeLessThan(total - 1);
  expect(await fx()).toEqual({ active: 0, trails: 0 });
  // Later beats are gone from the list; the chosen one is now on top, highlighted.
  expect(await page.locator('.history-card').count()).toBe(s.beatIndex + 1);
  await expect(page.locator('.history-card').first()).toHaveClass(/is-current/);
  await expect(page.locator('.history-card').first()).toContainText(/PR · #9003 · .* — Opened · by Mina Sato/);
  // The next three beats are listed above it, dimmed, nearest lowest; at the very end there are none (slice 6).
  const next = page.locator('.history-next');
  expect(await next.count()).toBe(Math.min(3, total - 1 - s.beatIndex));
  await expect(next.last()).toHaveAttribute('data-beat', String(s.beatIndex + 1));
  expect(Number(await next.last().evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.6);
  await next.last().click(); // picking one seeks to it, like any card
  await page.waitForTimeout(100);
  expect((await session()).beatIndex).toBe(s.beatIndex + 1);
  await expect(page.locator('.history-card').first()).toHaveClass(/is-current/);
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(1e9));
  await page.waitForTimeout(100);
  await expect(page.locator('.history-next')).toHaveCount(0);
  await page.locator('.view-panel__tab', { hasText: 'In view' }).click();
});

test('the retrospective lens is labelled and toggles without accents', async () => {
  await page.locator('.transport__more').click();
  await page.locator('.transport__lens button', { hasText: 'Retrospective' }).click();
  expect((await session()).lens).toBe('currentObserved');
  await expect(page.locator('.transport__lens button[aria-pressed="true"]')).toHaveText('Retrospective');
  await page.locator('.transport__more').click(); // close the menu: the non-default lens stays shown as a chip
  await expect(page.locator('.transport__chip')).toContainText('Retrospective');
  expect((await fx()).active).toBe(0);
  await page.locator('.transport__chip').click();
  expect((await session()).lens).toBe('knownThen');
  await expect(page.locator('.transport__chip')).toHaveCount(0);
});

test('a full play at 4× ends with the final state and leaves no effects or objects behind', async () => {
  await seek(0);
  const baseline = await counts();
  await setRate('4×');
  await page.locator('.transport__play').click();
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 30_000 });
  await page.waitForFunction(() => window.__starChartTest!.fx().active === 0, undefined, { timeout: 30_000 });
  const end = await session();
  expect(end.beatIndex).toBe(end.beats - 1);
  // Seeking back to the start restores the start's object count exactly (no leaked effects).
  await seek(0);
  await page.waitForTimeout(100);
  const again = await counts();
  expect(again.displayObjects).toBe(baseline.displayObjects);
  expect(again.activeFx).toBe(0);
  await setRate('1×');
});

test('review stills: the key accents mid-flight (written to test-results/slice2-*.png)', async () => {
  const shots: [number, number, string][] = [
    [0, 500, '1-active-flare-and-arrival'],
    [3, 350, '2-launch-and-route-ink'],
    [11, 260, '3-nearing-flare-and-departure'],
    [11, 900, '4-jump-trail'],
    [12, 700, '5-completion-flares'],
  ];
  for (const [beat, wait, name] of shots) {
    await stepTo(beat);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `test-results/slice2-${name}.png` });
  }
});
