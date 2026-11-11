// 27 F2, Summon on the fly: the summoner passes the spot beside the new station without stopping, its one
// call blip and the station's jump-in at the same instant; the hold and the fly-back go. Two probes:
//  - the gallery's jump-in cell (acceptance: in full and reduced motion, with no console errors), whose
//    maneuver now lasts its phases (the flight plus the arrival), not the 4.8 s it held with the crew turn;
//  - the app, on Meteor Pod's lone summon (27 F1: PR 21045 into the 37th station, Thu 24 Sep 19:00Z):
//    sampled every frame, the summoner never parks beside the station it summons, and under reduced
//    motion it never flies there at all. Fixture data only (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { PACE_RULES, RULE, spanMs } from '../../src/shared/engine/pace';
import { METEOR_REPOS } from '../../fixtures/scenarios/halcyon/cast';
import { frames, launchApp, launchGallery, settle } from './launch';

interface DemoStats { id: string; rule: string; state: string; loops: number; reducedLoops: number; stuck: number; started: number; peak: number }
type DemoWindow = Window & { __starChartGalleryDemos?: { list(): DemoStats[]; setReduced(on: boolean): void } };

const JUMP_IN_MS = spanMs(PACE_RULES.find((r) => r.id === RULE.facilityEnter)!.phases);

test.describe('27 F2: the gallery\'s jump-in cell', () => {
  let app: ElectronApplication;
  let page: Page;
  const errors: string[] = [];
  test.beforeAll(async () => {
    ({ app, page } = await launchGallery());
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__starChartGallery), undefined, { timeout: 30_000 });
    await page.evaluate(() => window.__starChartGallery!.ready);
  });
  test.afterAll(async () => { await app?.close(); });

  test('A gallery demo cell (the jump-in cell), in full and reduced motion, with no console errors: it plays the flight plus the arrival, no crew hold', async () => {
    test.setTimeout(150_000);
    const demos = () => page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos?.list() ?? []);
    const rule = (await demos()).map((d) => d.rule).find((r) => r === RULE.facilityEnter || r.startsWith(`${RULE.facilityEnter}:`));
    expect(rule, 'a jump-in cell').toBeDefined();
    const stat = async () => (await demos()).find((d) => d.rule === rule)!;
    const cell = page.locator(`[data-art="maneuvers:${rule}"]`).locator('xpath=ancestor::figure[1]');
    await cell.scrollIntoViewIfNeeded();
    // The cell's note gives its planned length: the jump-in's phases, with no crew turn held past the arrival.
    const note = (await cell.locator('figcaption').innerText()).replace(/\s+/g, ' ');
    const ms = Number(/· (\d+) ms ·/.exec(note)?.[1]);
    expect(ms, `the jump-in cell's length (${note})`).toBeLessThanOrEqual(JUMP_IN_MS);

    // Full motion: a loop that ran and cleared.
    await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
    await expect.poll(async () => (await stat()).loops, { timeout: 60_000, intervals: [200] }).toBeGreaterThanOrEqual(1);
    await cell.screenshot({ path: 'test-results/gallery/f2-jump-in-full.png' });
    expect((await stat()).stuck, 'never cleared').toBe(0);
    expect((await stat()).peak, 'issued nothing').toBeGreaterThan(0);
    // Reduced motion: the same, the ship staying put.
    await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(true));
    await expect.poll(async () => (await stat()).reducedLoops, { timeout: 60_000, intervals: [200] }).toBeGreaterThanOrEqual(1);
    await cell.screenshot({ path: 'test-results/gallery/f2-jump-in-reduced.png' });
    expect((await stat()).stuck, 'never cleared under reduced motion').toBe(0);
    await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
    expect(errors).toEqual([]);
  });
});

// ---- The app: Meteor Pod's lone summon ----

const LONE_SUMMON_UTC = Date.parse('2026-09-24T19:00:00.000Z');
const LONE_STATION = METEOR_REPOS[36]!.split(' ')[0]!;

type Node = { projectionKey: string; kind: string; label: string; world: { x: number; y: number; r: number } };
type Sample = { t: number; at: Record<string, [number, number]> };

async function openMeteor(): Promise<{ app: ElectronApplication; page: Page }> {
  const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '' });
  await page.evaluate(() => window.__starChartTest!.freezeAmbient(4));
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
  await page.locator('.callout', { hasText: 'Meteor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
  return { app, page };
}

/** Plays the lone summon's beat from its start, sampling where every captain is drawn each frame for `ms`. */
async function playLoneSummon(page: Page, ms: number): Promise<{ samples: Sample[]; station: Node; stationR: number }> {
  const beat = await page.evaluate((t) => window.__starChartTest!.beatTimes().find((b) => b.sourceUtc === t) ?? null, LONE_SUMMON_UTC);
  expect(beat, 'Meteor Pod plays a beat at Thu 24 Sep 19:00Z (the lone summon)').not.toBeNull();
  // The station after the beat, where it is drawn, and its drawn size (the hit circle, floored, in world units).
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), beat!.startMs + 60_000);
  await frames(page, 4);
  const station = await page.evaluate((label) => window.__starChartTest!.liveNodes().find((n) => n.kind === 'facility' && n.label === label) ?? null, LONE_STATION) as Node | null;
  expect(station, `the lone summon's station, ${LONE_STATION}`).not.toBeNull();
  const stationR = await page.evaluate((pk) => {
    const t = window.__starChartTest!;
    const hit = t.hitCircles().find((c) => c.projectionKey === pk);
    return Math.max(t.liveNodes().find((n) => n.projectionKey === pk)!.world.r, hit ? hit.r / t.camera().scale : 0);
  }, station!.projectionKey);
  // Then from just before the beat, played once.
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), beat!.startMs - 1);
  await frames(page, 4);
  const samples = await page.evaluate((ms) => new Promise<Sample[]>((done) => {
    const out: Sample[] = [];
    window.__starChartTest!.stepBeat();
    const t0 = performance.now();
    const tick = () => {
      const t = performance.now() - t0;
      const at: Record<string, [number, number]> = {};
      for (const n of window.__starChartTest!.liveNodes()) if (n.kind === 'captain') at[n.projectionKey] = [n.world.x, n.world.y];
      out.push({ t, at });
      if (t < ms) requestAnimationFrame(tick);
      else done(out);
    };
    requestAnimationFrame(tick);
  }), ms);
  return { samples, station: station!, stationR };
}

const d = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

/** The summoner: the captain whose drawn path comes nearest the new station. */
function summonerOf(samples: Sample[], at: [number, number]): { pk: string; path: { t: number; at: [number, number] }[] } {
  const pks = [...new Set(samples.flatMap((s) => Object.keys(s.at)))];
  const paths = pks.map((pk) => ({ pk, path: samples.filter((s) => s.at[pk]).map((s) => ({ t: s.t, at: s.at[pk]! })) }));
  return paths.sort((a, b) => Math.min(...a.path.map((x) => d(x.at, at))) - Math.min(...b.path.map((x) => d(x.at, at))))[0]!;
}

/** Spells the ship stood still (no drawn move between frames) for at least `minMs`, with where. */
function stillSpells(path: { t: number; at: [number, number] }[], minMs: number): { from: number; to: number; at: [number, number] }[] {
  const out: { from: number; to: number; at: [number, number] }[] = [];
  let i = 0;
  while (i < path.length - 1) {
    let j = i;
    while (j + 1 < path.length && d(path[j + 1]!.at, path[i]!.at) < 1e-3) j++;
    if (path[j]!.t - path[i]!.t >= minMs) out.push({ from: path[i]!.t, to: path[j]!.t, at: path[i]!.at });
    i = j + 1;
  }
  return out;
}

test.describe('27 F2: the summoner passes without stopping (Meteor Pod\'s lone summon)', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  let app: ElectronApplication;
  let page: Page;
  test.beforeAll(async () => { ({ app, page } = await openMeteor()); });
  test.afterAll(async () => { await app?.close(); });

  test('full motion: the summoner never parks beside the station it summons, and carries on to its next place', async () => {
    await page.evaluate(() => window.__starChartTest!.setReduced(false));
    const { samples, station, stationR } = await playLoneSummon(page, 14_000);
    const at: [number, number] = [station.world.x, station.world.y];
    const { pk, path } = summonerOf(samples, at);
    const nearest = Math.min(...path.map((x) => d(x.at, at)));
    expect(nearest, `${pk} flies to the station (nearest ${nearest.toFixed(1)}, station r ${stationR.toFixed(1)})`).toBeLessThanOrEqual(4 * stationR);
    // Where it ends up (the last spell, to the end of the sample) is its next place; before that, no stop beside the station.
    const spells = stillSpells(path, 200);
    const last = path.at(-1)!;
    const parked = spells.filter((s) => s.to < last.t - 1 && d(s.at, at) <= 3 * stationR);
    expect(parked.map((s) => `${Math.round(s.to - s.from)} ms still at ${d(s.at, at).toFixed(1)} from the station`), 'stops beside the station').toEqual([]);
  });

  test('reduced motion: the summoner doesn\'t fly; the station still arrives', async () => {
    await page.evaluate(() => window.__starChartTest!.setReduced(true));
    try {
      const { samples, station, stationR } = await playLoneSummon(page, 8_000);
      const at: [number, number] = [station.world.x, station.world.y];
      const { pk, path } = summonerOf(samples, at);
      const first = path[0]!.at;
      // Its ship stays at its place: it is never drawn at the spot beside the station unless it rests there.
      const flew = path.some((x) => d(x.at, at) <= 3 * stationR && d(first, at) > 3 * stationR);
      expect(flew, `${pk} flew to the station under reduced motion`).toBe(false);
      const after = await page.evaluate((label) => window.__starChartTest!.liveNodes().some((n) => n.kind === 'facility' && n.label === label), LONE_STATION);
      expect(after, 'the station is drawn after the beat').toBe(true);
    } finally {
      await page.evaluate(() => window.__starChartTest!.setReduced(false));
    }
  });
});
