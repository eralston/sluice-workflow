import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { clickNode, enterNodeByKey, frames, keyOf, launchApp, settle } from './launch';

// Smooth animation is a requirement alongside the painterly look (09 §7). This measures frame
// times in the densest scenes, painted and plain, and writes test-results/perf-report.json. Budget
// (09 §7, 15 §10): p95 ≤ 2 vsyncs of the display, where the vsync is measured in this window, plus
// the tolerance for requestAnimationFrame jitter. Both numbers come from the active device profile
// (render.budget, 15 §11), read in the app; the check stays soft where it was.

/** The frame budget of the app's active profile, for a measured vsync: vsyncs x vsync + tolerance, ms. */
async function frameBudget(p: Page, vsync: number): Promise<number> {
  const b = await p.evaluate(() => window.__starChartTest!.profile().render.budget);
  return b.frameVsyncs * vsync + b.toleranceMs;
}

/** Each device-profile cut (15 §10, §11) must lower Pulsar's p95 by at least this much, cuts on against off in one run. */
const CUT_GAIN_MIN = 0.2;
/** The cuts, as `render.switches` keys; all on, or all off. */
const CUTS = ['auraBake'] as const;

let app: ElectronApplication;
let page: Page;

// Each describe owns its app (a file-level beforeAll would open both at once, and the idle one's
// window costs the other frames). The `alone` project runs one worker in file order, so no file-level serial
// mode: a miss in the first test must not skip the Pulsar measurement.
test.afterAll(async () => { await app?.close().catch(() => {}); });

/** The display's vsync interval, ms: the median requestAnimationFrame delta over about 60 frames (first 5 dropped). */
async function vsyncMs(p: Page, frames = 60): Promise<number> {
  const dts = await p.evaluate((count) => new Promise<number[]>((resolve) => {
    const out: number[] = [];
    let last = performance.now();
    const step = (t: number) => {
      out.push(t - last);
      last = t;
      if (out.length < count + 5) requestAnimationFrame(step);
      else resolve(out.slice(5));
    };
    requestAnimationFrame(step);
  }), frames);
  const sorted = [...dts].sort((a, b) => a - b);
  return +sorted[Math.floor(sorted.length / 2)]!.toFixed(2);
}

/** Frame-to-frame times over a window of requestAnimationFrame callbacks, in ms. */
async function frameTimes(ms = 2500): Promise<{ mean: number; p95: number; n: number }> {
  const dts = await page.evaluate((window_) => new Promise<number[]>((resolve) => {
    const out: number[] = [];
    let last = performance.now();
    const start = last;
    const step = (t: number) => {
      out.push(t - last);
      last = t;
      if (t - start < window_) requestAnimationFrame(step);
      else resolve(out.slice(5)); // skip warm-up
    };
    requestAnimationFrame(step);
  }), ms);
  const sorted = [...dts].sort((a, b) => a - b);
  const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
  return { mean: +mean.toFixed(2), p95: +sorted[Math.floor(sorted.length * 0.95)]!.toFixed(2), n: dts.length };
}

test('the painted chart animates smoothly in the densest scenes', async () => {
  ({ app, page } = await launchApp());
  const vsync = await vsyncMs(page);
  const budget = await frameBudget(page, vsync);
  await clickNode(page, await keyOf(page, 'galaxy', 'Nimbus Deck'));
  await page.locator('.chooser button', { hasText: 'Lantern Squad' }).click();
  await settle(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Billing statement redesign'));
  const report: Record<string, unknown> = { vsyncMs: vsync, budgetMs: budget };
  for (const scene of ['dense-system', 'dense-body']) {
    if (scene === 'dense-body') await enterNodeByKey(page, await keyOf(page, 'planet', 'Statement summary panel'));
    await page.evaluate(() => window.__starChartTest!.setPaint(false));
    const plain = await frameTimes();
    await page.evaluate(() => window.__starChartTest!.setPaint(true));
    const painted = await frameTimes();
    report[scene] = { plain, painted, paintCostMs: +(painted.mean - plain.mean).toFixed(2) };
    expect.soft(painted.p95, `${scene}: painted p95 frame time within the profile's vsyncs (ms, budget ${budget})`).toBeLessThanOrEqual(budget);
  }
  writeFileSync('test-results/perf-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await app.close();
});

// Pulsar Pod (Halcyon Reach, Sprint 41, 20 captains) is the densest pod (23 F10). Frame times at rest,
// playing at 1x and 4x, and across seeks (each seek's time to land and draw two frames), each bounded by frames drawn or by the playhead, never by
// wall time. Budget: p95 ≤ 2 vsyncs of the display, plus the profile's tolerance (09 §7, *Performance*).
test.describe('Pulsar Pod', () => {
  test.describe.configure({ mode: 'serial' });
  let pApp: ElectronApplication;
  let pPage: Page;
  test.beforeAll(async () => { ({ app: pApp, page: pPage } = await launchApp({ STAR_CHART_PARADIGM: '' })); });
  test.afterAll(async () => { await pApp?.close(); });

  type Stats = { n: number; p50: number; p95: number; max: number; playedMs: number };

  /** Sample frame times until `until` says stop (checked each frame), capped at `cap` frames. */
  async function sample(until: { frames?: number; playheadMs?: number }, cap = 2000): Promise<Stats> {
    const r = await pPage.evaluate(({ until: u, cap: c }) => new Promise<{ dts: number[]; played: number }>((resolve) => {
      const dts: number[] = [];
      const x0 = window.__starChartTest!.session().x;
      let last = performance.now();
      const step = (t: number) => {
        dts.push(t - last);
        last = t;
        const played = window.__starChartTest!.session().x - x0;
        const done = dts.length >= c || (u.frames !== undefined && dts.length >= u.frames) || (u.playheadMs !== undefined && played >= u.playheadMs);
        if (done) resolve({ dts: dts.slice(5), played });
        else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), { until, cap });
    const sorted = [...r.dts].sort((a, b) => a - b);
    const q = (p: number) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!.toFixed(2);
    return { n: r.dts.length, p50: q(0.5), p95: q(0.95), max: +sorted[sorted.length - 1]!.toFixed(2), playedMs: Math.round(r.played) };
  }

  /** Open Pulsar Pod unless a pod is already open. */
  async function ensurePulsar(): Promise<void> {
    if (await pPage.evaluate(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'))) return;
    await pPage.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await pPage.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(pPage);
    await pPage.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
    await pPage.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await settle(pPage);
  }

  // First in the describe, so a red soft line in the absolute test (the known state, 09 §7) can't skip this hard check.
  test('the cuts lower p95 by at least 20% (cuts off and on, same run)', async () => {
    test.setTimeout(240_000);
    await ensurePulsar();
    const vsync = await vsyncMs(pPage);
    const setCuts = (on: boolean) => pPage.evaluate(
      ([keys, v]) => window.__starChartTest!.setProfile({ render: { switches: Object.fromEntries((keys as readonly string[]).map((k) => [k, v])) } }),
      [[...CUTS], on] as const);
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const cuts: Record<string, unknown> = { vsyncMs: vsync, gainMin: CUT_GAIN_MIN };
    for (const rate of [1, 4]) {
      const p95s = { off: [] as number[], on: [] as number[] };
      for (let round = 0; round < 3; round++) {
        for (const on of [false, true]) {
          await pPage.evaluate(() => window.__starChartTest!.pause());
          await setCuts(on);
          await frames(pPage, 20);
          await pPage.evaluate(() => window.__starChartTest!.setScheduleMs(0));
          await frames(pPage, 3);
          await pPage.evaluate((r) => { window.__starChartTest!.setRate(r); window.__starChartTest!.play(); }, rate);
          p95s[on ? 'on' : 'off'].push((await sample({ playheadMs: rate * 6000 }, 4000)).p95);
        }
      }
      await pPage.evaluate(() => { window.__starChartTest!.pause(); window.__starChartTest!.setRate(1); });
      const off = median(p95s.off); const on = median(p95s.on);
      const mean = (xs: number[]) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
      const gain = +(1 - on / off).toFixed(3);
      cuts[`${rate}x`] = { off, on, gain, offRuns: p95s.off, onRuns: p95s.on, offMean: mean(p95s.off), onMean: mean(p95s.on) };
      if (off <= 1.25 * vsync) { console.log(`Pulsar ${rate}x: off p95 ${off} ms is within 1.25 vsyncs (${vsync} ms); nothing to cut`); continue; }
      expect(on, `Pulsar ${rate}x: cuts on p95 ${on} ms vs off ${off} ms (gain ${gain}, floor ${CUT_GAIN_MIN})`).toBeLessThanOrEqual((1 - CUT_GAIN_MIN) * off);
    }
    await setCuts(false); // back to the desktop default (auraBake off), so the next test sees what it always has
    let prior: Record<string, unknown> = {};
    try { prior = JSON.parse(readFileSync('test-results/perf-pulsar-report.json', 'utf8')); } catch { /* none yet */ }
    writeFileSync('test-results/perf-pulsar-report.json', JSON.stringify({ ...prior, cuts }, null, 2));
    console.log(JSON.stringify(cuts, null, 2));
  });

  test('p95 frame time stays within the profile vsync budget at rest, playing at 1x and 4x, and on seeks', async () => {
    const vsync = await vsyncMs(pPage);
    const budget = await frameBudget(pPage, vsync);
    await ensurePulsar();
    expect(await pPage.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'seat').length)).toBe(20);
    await pPage.evaluate(() => window.__starChartTest!.pause());
    await pPage.evaluate(() => window.__starChartTest!.setScheduleMs(0));
    await frames(pPage, 5);

    const report: Record<string, Stats> = {};
    report.rest = await sample({ frames: 300 });

    const total = await pPage.evaluate(() => window.__starChartTest!.session().totalMs);
    for (const rate of [1, 4]) {
      await pPage.evaluate(() => window.__starChartTest!.setScheduleMs(0));
      await frames(pPage, 3);
      await pPage.evaluate((r) => { window.__starChartTest!.setRate(r); window.__starChartTest!.play(); }, rate);
      // Played by the playhead: 10 s of episode at 1x, 40 s at 4x (frames cap guards a stalled clock).
      report[`play ${rate}x`] = await sample({ playheadMs: Math.min(total * 0.8, rate * 10_000) }, 4000);
      await pPage.evaluate(() => window.__starChartTest!.pause());
    }
    await pPage.evaluate(() => window.__starChartTest!.setRate(1));

    // Seeks: each lands, draws a frame, and the frames around it are timed.
    const seekDts: number[] = [];
    for (const f of [0.1, 0.9, 0.3, 0.6, 0.2, 1, 0.5, 0.75]) {
      const dt = await pPage.evaluate(async (ms) => {
        const t0 = performance.now();
        window.__starChartTest!.setScheduleMs(ms);
        await new Promise((r) => requestAnimationFrame(r));
        await new Promise((r) => requestAnimationFrame(r));
        return performance.now() - t0;
      }, Math.round(total * f));
      seekDts.push(dt);
    }
    seekDts.sort((a, b) => a - b);
    const sq = (p: number) => +seekDts[Math.min(seekDts.length - 1, Math.floor(seekDts.length * p))]!.toFixed(2);
    report.seek = { n: seekDts.length, p50: sq(0.5), p95: sq(0.95), max: +seekDts[seekDts.length - 1]!.toFixed(2), playedMs: 0 };
    const out = { vsyncMs: vsync, budgetMs: budget, ...report };
    let prior: Record<string, unknown> = {};
    try { prior = JSON.parse(readFileSync('test-results/perf-pulsar-report.json', 'utf8')); } catch { /* none yet */ }
    const merged = { ...out, ...(prior.cuts ? { cuts: prior.cuts } : {}) };
    writeFileSync('test-results/perf-pulsar-report.json', JSON.stringify(merged, null, 2));
    console.log(JSON.stringify(out, null, 2));
    // Soft: relative gains are judged (27 C3); the absolute budget is reported.
    for (const [state, s] of Object.entries(report)) {
      if (state !== 'seek') expect.soft(s.p95, `Pulsar Pod, ${state}: p95 frame time within the profile's vsyncs (ms, budget ${budget})`).toBeLessThanOrEqual(budget);
    }
    // A seek is one long frame, not a stream of them: its bound is the time to land and draw twice.
    expect.soft(report.seek!.max, 'Pulsar Pod, a seek: ms to land and draw 2 frames').toBeLessThan(250);
  });
});
