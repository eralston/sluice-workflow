// B1 planner's probe (fixture data only, INV-18): does dropping the holo plates' filters bring Pulsar Pod's
// playing p95 inside 2 vsyncs? Measures rest, play 1x and play 4x as the chart is now, then again with every
// holo frame's `filter` and every title's `text-shadow` forced off by an injected stylesheet (what T4 at rest
// gives the plates not raised). A visible drive window, so compare the two runs with each other only.
// Run: npm run drive -- docs/progress/v1.4/work/B1/probe-filters.ts --paradigm solar
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  const vsync = await page.evaluate(() => new Promise<number>((resolve) => {
    const out: number[] = [];
    let last = performance.now();
    const step = (t: number) => { out.push(t - last); last = t; if (out.length < 65) requestAnimationFrame(step); else { const s = out.slice(5).sort((a, b) => a - b); resolve(s[Math.floor(s.length / 2)]!); } };
    requestAnimationFrame(step);
  }));
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.mouse.move(2, 2);
  const sample = (until: { frames?: number; playheadMs?: number }, cap = 4000) => page.evaluate(({ u, c }) => new Promise<{ n: number; p50: number; p95: number }>((resolve) => {
    const dts: number[] = [];
    const x0 = window.__starChartTest!.session().x;
    let last = performance.now();
    const step = (t: number) => {
      dts.push(t - last); last = t;
      const played = window.__starChartTest!.session().x - x0;
      if (dts.length >= c || (u.frames !== undefined && dts.length >= u.frames) || (u.playheadMs !== undefined && played >= u.playheadMs)) {
        const s = dts.slice(5).sort((a, b) => a - b);
        resolve({ n: s.length, p50: +s[Math.floor(s.length * 0.5)]!.toFixed(1), p95: +s[Math.floor(s.length * 0.95)]!.toFixed(1) });
      } else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), { u: until, c: cap });
  const census = () => page.evaluate(() => {
    const shown = [...document.querySelectorAll<HTMLElement>('.callout--holo')].filter((e) => e.style.display !== 'none' && e.offsetParent !== null);
    const frames = [...document.querySelectorAll<SVGElement>('.holo')].filter((f) => f.style.display !== 'none');
    const filtered = frames.filter((f) => getComputedStyle(f).filter !== 'none').length;
    const tiers: Record<string, number> = {};
    for (const e of shown) tiers[e.dataset.holoTier ?? '-'] = (tiers[e.dataset.holoTier ?? '-'] ?? 0) + 1;
    return { plates: shown.length, frames: frames.length, filtered, tiers };
  });
  const run = async (name: string) => {
    const total = await page.evaluate(() => window.__starChartTest!.session().totalMs);
    await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(0); });
    await page.waitForTimeout(300);
    const c = await census();
    const rest = await sample({ frames: 300 });
    const out: Record<string, unknown> = { name, vsync: +vsync.toFixed(2), budget: +(2 * vsync + 2).toFixed(1), census: c, rest };
    for (const rate of [1, 4]) {
      await page.evaluate(() => window.__starChartTest!.setScheduleMs(0));
      await page.waitForTimeout(200);
      await page.evaluate((r) => { window.__starChartTest!.setRate(r); window.__starChartTest!.play(); }, rate);
      out[`play${rate}x`] = await sample({ playheadMs: Math.min(total * 0.8, rate * 10_000) });
      out[`census${rate}x`] = await census();
      await page.evaluate(() => window.__starChartTest!.pause());
    }
    d.note(JSON.stringify(out));
  };
  await run('as-is');
  await page.addStyleTag({ content: '.holo { filter: none !important; } .callout--holo .callout__title { text-shadow: none !important; }' });
  await run('no-filters');
  await page.evaluate(() => { for (const s of document.querySelectorAll('style')) if (s.textContent?.includes('filter: none !important')) s.remove(); });
  await run('as-is-again');
}
