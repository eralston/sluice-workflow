import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchGallery } from './launch';

// The v1 gallery sections (17 W4-T1): the asset registry, drawn through each theme asset's own
// factory, and the maneuver demos, each a GraphScene looping one planned maneuver through the
// ManeuverInterpreter. They mount with no console errors, and every maneuver runs and clears
// (activeCount() === 0) at the end of its loop, in full and in reduced motion (INV-20).

/** The demos' test hooks (gallery/maneuverDemos.ts), typed here as the e2e project can't import it. */
interface DemoStats { id: string; rule: string; state: string; loops: number; reducedLoops: number; peak: number; active: number; stuck: number; started: number; flare: number; flarePeak: number; reducedFlarePeak: number }
interface MotionStats { id: string; step: string; loops: number; reducedLoops: number; stuck: number; arrived: number; departed: number; active: number; full: LoopRecord | null; reduced: LoopRecord | null }
interface LoopRecord { stepS: Record<string, number>; peak: number; arrived: number; departed: number }
type DemoWindow = Window & { __starChartGalleryDemos?: { list(): DemoStats[]; setReduced(on: boolean): void; reduced(): boolean }; __starChartGalleryMotion?: { list(): MotionStats[] } };

let app: ElectronApplication;
let page: Page;
const errors: string[] = [];

test.beforeAll(async () => {
  ({ app, page } = await launchGallery());
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Listening from the first module on: load the gallery again with the listeners attached.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__starChartGallery), undefined, { timeout: 30_000 });
  await page.evaluate(() => window.__starChartGallery!.ready);
});
test.afterAll(async () => {
  await app.close();
});

const demos = () => page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos?.list() ?? []);

test('the registry section mounts every theme asset through its samples', async () => {
  const sections = page.locator('.gallery__section[data-family^="registry-"]');
  // world, asteroid, hive, dreadnought, captain (theme/starChart roleAsset).
  expect(await sections.count()).toBe(5);
  for (const family of await sections.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.family!))) {
    expect(await page.locator(`.gallery__section[data-family="${family}"] [data-art]`).count(), family).toBeGreaterThan(0);
  }
  expect((await page.evaluate(() => window.__starChartGallery!.alignment())).worstPx).toBeLessThan(1);
});

test('every maneuver demo runs and clears, in full and reduced motion, with no console errors', async () => {
  test.setTimeout(150_000);
  const cells = await page.locator('.gallery__section[data-family="maneuvers"] [data-art]').count();
  const list = await demos();
  // Every engine rule (shared/engine/pace.ts) plays somewhere in pod-sprint, or (the progress beam, 27 E3)
  // replays one of its merges, and each variant it has there (a facility's first merge, a close its
  // stations beam) has a demo of its own.
  expect(new Set(list.map((d) => d.rule.split(':')[0])).size).toBe(18);
  expect(list.some((d) => d.rule === 'agent.progress')).toBe(true);
  // The sector sweep (27 E7a) plays in pod-sprint's opening creations.
  expect(list.some((d) => d.rule === 'region.sweep')).toBe(true);
  expect(cells).toBe(list.length);
  expect(new Set(list.map((d) => d.rule)).size).toBe(list.length);

  // Full motion: each demo finishes a loop that issued commands, and nothing is left running.
  await expect.poll(async () => (await demos()).filter((d) => d.loops < 1).map((d) => d.rule), { timeout: 60_000, intervals: [500] }).toEqual([]);
  for (const d of await demos()) {
    expect(d.stuck, `${d.rule} never cleared`).toBe(0);
    expect(d.started, `${d.rule} never started`).toBeGreaterThan(0);
    expect(d.peak, `${d.rule} issued nothing`).toBeGreaterThan(0);
  }

  // Reduced motion: each demo restarts, and its maneuver still lands and clears.
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(true));
  await expect.poll(async () => (await demos()).filter((d) => d.reducedLoops < 1).map((d) => d.rule), { timeout: 60_000, intervals: [500] }).toEqual([]);
  for (const d of await demos()) expect(d.stuck, `${d.rule} never cleared under reduced motion`).toBe(0);
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));

  // A demo between loops has nothing live.
  await expect.poll(async () => (await demos()).some((d) => d.state === 'after' && d.active === 0), { timeout: 20_000 }).toBe(true);
  expect(errors).toEqual([]);
});

const motions = () => page.evaluate(() => (window as DemoWindow).__starChartGalleryMotion?.list() ?? []);

test('the Arrive/Depart row and the finale cell loop and clear, in full and reduced motion (v1.3 F7, F8)', async () => {
  test.setTimeout(420_000); // the demos run on the page's own clock, which a loaded machine slows; the waits below are conditions, these are only their ceilings
  const ids = ['arrive-depart:bodies', 'arrive-depart:opening', 'finale'];
  expect((await motions()).map((d) => d.id).sort()).toEqual([...ids].sort());
  expect(await page.locator('.gallery__section[data-family="arrive-depart"] [data-art]').count()).toBe(2);
  expect(await page.locator('.gallery__section[data-family="finale"] [data-art]').count()).toBe(1);

  // Review copies, taken mid-motion: the bodies once they are arriving, the opening and the finale once they play.
  const shoot = async (family: string, id: string, steps: string[], file: string) => {
    const section = page.locator(`.gallery__section[data-family="${family}"]`);
    await section.scrollIntoViewIfNeeded();
    await expect.poll(async () => steps.includes((await motions()).find((d) => d.id === id)?.step ?? ''), { timeout: 150_000, intervals: [100] }).toBe(true);
    await section.screenshot({ path: `test-results/gallery/${file}.png` });
  };
  await shoot('arrive-depart', 'arrive-depart:bodies', ['arrive'], 'arrive-depart-full');
  await shoot('arrive-depart', 'arrive-depart:opening', ['opening'], 'opening-full');
  await shoot('finale', 'finale', ['finale'], 'finale-full');

  // Each demo records its last loop that ran in one motion mode from its first frame to its last (a
  // toggle restarts every demo, so a loop that straddled one is never recorded). Judge only those,
  // waiting for each to exist, never for time.
  const recorded = (mode: 'full' | 'reduced') => expect.poll(async () => (await motions()).filter((d) => !d[mode]).map((d) => d.id), { timeout: 240_000, intervals: [500] }).toEqual([]);
  const by = async (id: string) => (await motions()).find((d) => d.id === id)!;

  // Full motion: each finishes a loop, nothing is left running, Arrive and Depart fly their whole length, the opening plays.
  await recorded('full');
  for (const d of await motions()) expect(d.stuck, `${d.id} never cleared`).toBe(0);
  const bodies = (await by('arrive-depart:bodies')).full!;
  expect(bodies.arrived, 'bodies arrive').toBeGreaterThan(0);
  expect(bodies.departed, 'bodies depart').toBeGreaterThan(0);
  expect(bodies.stepS.arrive, 'full arrive').toBeGreaterThan(0.8);
  expect(bodies.stepS.depart, 'full depart').toBeGreaterThan(0.8);
  expect((await by('arrive-depart:opening')).full!.peak, 'the opening plays in full motion').toBeGreaterThan(0);

  // Reduced motion: the same loop. Flip, then wait for a loop that was reduced throughout.
  await page.evaluate(() => { const h = (window as DemoWindow).__starChartGalleryDemos!; h.setReduced(true); });
  await shoot('arrive-depart', 'arrive-depart:bodies', ['arrive', 'present'], 'arrive-depart-reduced');
  await shoot('finale', 'finale', ['finale'], 'finale-reduced');
  await recorded('reduced');
  for (const d of await motions()) expect(d.stuck, `${d.id} never cleared under reduced motion`).toBe(0);
  // Reduced really differs: every Arrive and Depart takes the cheap path (CHEAP_S 0.3 s, plus a frame or two), and the opening issues nothing.
  const r = (await by('arrive-depart:bodies')).reduced!;
  expect(r.stepS.arrive, 'reduced arrive').toBeLessThan(0.6);
  expect(r.stepS.depart, 'reduced depart').toBeLessThan(0.6);
  expect((await by('arrive-depart:opening')).reduced!.peak, 'the opening issues nothing under reduced motion').toBe(0);
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
  expect(errors).toEqual([]);
});

test('the three victories flare, then settle, in full and reduced motion (27 B3)', async () => {
  test.setTimeout(150_000);
  const ids = ['objective.accomplish', 'threat.accomplish', 'seat.complete'];
  const pick = async (id: string) => {
    const list = await demos();
    return (list.find((d) => d.rule === id) ?? list.find((d) => d.rule.startsWith(`${id}:`)))!;
  };
  const rules: string[] = [];
  for (const id of ids) {
    const d = await pick(id);
    expect(d, `a demo for ${id}`).toBeTruthy();
    rules.push(d.rule);
  }
  const stat = async (rule: string) => (await demos()).find((d) => d.rule === rule)!;
  const cell = (rule: string) => page.locator(`[data-art="maneuvers:${rule}"]`).locator('xpath=ancestor::figure[1]');

  // Full motion: the gold outline reaches its peak, then settles to nothing by the end of the loop.
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
  for (const [i, rule] of rules.entries()) {
    const id = ids[i]!;
    await cell(rule).scrollIntoViewIfNeeded();
    await expect.poll(async () => (await stat(rule)).flare, { timeout: 60_000, intervals: [50] }).toBeGreaterThanOrEqual(0.9);
    await cell(rule).screenshot({ path: `test-results/gallery/victory-${id}-flare.png` });
    await expect.poll(async () => { const d = await stat(rule); return d.state === 'after' && d.flare === 0; }, { timeout: 60_000, intervals: [50] }).toBe(true);
    await cell(rule).screenshot({ path: `test-results/gallery/victory-${id}-settled.png` });
    await expect.poll(async () => (await stat(rule)).flarePeak, { timeout: 60_000, intervals: [100] }).toBeGreaterThanOrEqual(0.9);
  }

  // Reduced motion: no flare, only the resting weight.
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(true));
  for (const [i, rule] of rules.entries()) {
    await cell(rule).scrollIntoViewIfNeeded();
    await expect.poll(async () => (await stat(rule)).reducedLoops, { timeout: 60_000, intervals: [200] }).toBeGreaterThanOrEqual(1);
    expect((await stat(rule)).reducedFlarePeak, `${rule} flared under reduced motion`).toBe(0);
    await cell(rule).screenshot({ path: `test-results/gallery/victory-${ids[i]}-reduced.png` });
  }
  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
  expect(errors).toEqual([]);
});

test('Station jump-in passes through, in full and reduced motion (27 F2)', async () => {
  test.setTimeout(150_000);
  const rule = 'facility.enter';
  const stat = async () => (await demos()).find((d) => d.rule === rule)!;
  expect(await stat(), `a demo for ${rule}`).toBeTruthy();
  const cell = page.locator(`[data-art="maneuvers:${rule}"]`).locator('xpath=ancestor::figure[1]');
  // Mid-motion, the blip and the arrival ring are on screen (the pass is 0.715 s, the call ring 1.2 s).
  const shoot = async (mode: 'full' | 'reduced') => {
    await cell.scrollIntoViewIfNeeded();
    await expect.poll(async () => (await stat()).state, { timeout: 60_000, intervals: [50] }).toBe('play');
    await page.waitForTimeout(350);
    await cell.screenshot({ path: `test-results/gallery/f2-jump-in-${mode}.png` });
  };

  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
  await shoot('full');
  await expect.poll(async () => (await stat()).loops, { timeout: 60_000, intervals: [200] }).toBeGreaterThanOrEqual(1);
  expect((await stat()).stuck, 'full motion never cleared').toBe(0);

  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(true));
  await shoot('reduced');
  await expect.poll(async () => (await stat()).reducedLoops, { timeout: 60_000, intervals: [200] }).toBeGreaterThanOrEqual(1);
  expect((await stat()).stuck, 'reduced motion never cleared').toBe(0);

  await page.evaluate(() => (window as DemoWindow).__starChartGalleryDemos!.setReduced(false));
  expect(errors).toEqual([]);
});
