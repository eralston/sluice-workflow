// B1 planner's probe 2 (fixture data only, INV-18): where Pulsar Pod's frame time goes while playing at 4x.
// Chrome's cumulative metrics (script, layout, style recalc, task) per frame, and a CPU profile's top self
// times, as the chart is now and with the holo filters off. Then with the label layer hidden, and with paint off.
// Run: npm run drive -- docs/progress/v1.4/work/B1/probe-cost.ts --paradigm solar --name b1-cost
import type { Drive } from '../../../../../tests/drive/drive';

export default async function probe(d: Drive): Promise<void> {
  const { page } = d;
  // HIDE=1: hide the window, as the e2e harness never shows it (backgroundThrottling is off in test mode).
  if (process.env.HIDE === '1') await d.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.hide());
  const vsync = await page.evaluate(() => new Promise<number>((resolve) => {
    const out: number[] = []; let last = performance.now();
    const step = (t: number) => { out.push(t - last); last = t; if (out.length < 65) requestAnimationFrame(step); else { const s = out.slice(5).sort((a, b) => a - b); resolve(+s[Math.floor(s.length / 2)]!.toFixed(2)); } };
    requestAnimationFrame(step);
  }));
  d.note(`vsync ${vsync} ms, hidden ${process.env.HIDE === '1'}`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.mouse.move(2, 2);
  const metrics = async () => Object.fromEntries(((await cdp.send('Performance.getMetrics')) as { metrics: { name: string; value: number }[] }).metrics.map((m) => [m.name, m.value]));
  const run = async (name: string, rate: number, profile: boolean) => {
    await page.evaluate((r) => { const t = window.__starChartTest!; t.pause(); t.setRate(r); t.setScheduleMs(0); }, rate);
    await page.waitForTimeout(300);
    const before = await metrics();
    const f0 = await page.evaluate(() => new Promise<number>((r) => requestAnimationFrame((t) => r(t))));
    if (profile) await cdp.send('Profiler.start');
    await page.evaluate(() => window.__starChartTest!.play());
    const frames = await page.evaluate(() => new Promise<{ n: number; p50: number; p95: number }>((resolve) => {
      const dts: number[] = []; let last = performance.now();
      const step = (t: number) => { dts.push(t - last); last = t; if (dts.length < 250) requestAnimationFrame(step); else { const s = dts.slice(5).sort((a, b) => a - b); resolve({ n: s.length, p50: +s[Math.floor(s.length / 2)]!.toFixed(1), p95: +s[Math.floor(s.length * 0.95)]!.toFixed(1) }); } };
      requestAnimationFrame(step);
    }));
    let top: string[] = [];
    if (profile) {
      const { profile: p } = (await cdp.send('Profiler.stop')) as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number } ; hitCount?: number }[]; samples: number[]; timeDeltas: number[] } };
      const byId = new Map(p.nodes.map((n) => [n.id, n]));
      const self = new Map<string, number>();
      p.samples.forEach((id, i) => {
        const n = byId.get(id)!; const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
        self.set(k, (self.get(k) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000);
      });
      const totalMs = [...self.values()].reduce((a, b) => a + b, 0);
      top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / totalMs * 100).toFixed(1)}% ${k}`);
    }
    await page.evaluate(() => window.__starChartTest!.pause());
    const after = await metrics();
    const f1 = await page.evaluate(() => new Promise<number>((r) => requestAnimationFrame((t) => r(t))));
    const n = frames.n + 5;
    const per = (k: string) => +(((after[k] ?? 0) - (before[k] ?? 0)) * 1000 / n).toFixed(2);
    d.note(JSON.stringify({ name, rate, frames, wallMs: Math.round(f1 - f0), perFrameMs: { task: per('TaskDuration'), script: per('ScriptDuration'), layout: per('LayoutDuration'), style: per('RecalcStyleDuration') }, layouts: per('LayoutCount') / 1000, styles: per('RecalcStyleCount') / 1000 }));
    if (top.length) d.note(`${name} top self:\n  ${top.join('\n  ')}`);
  };
  await run('as-is', 4, true);
  await run('as-is', 1, false);
  await page.addStyleTag({ content: '.holo { filter: none !important; } .callout--holo .callout__title { text-shadow: none !important; }' });
  await run('no-filters', 4, false);
  await run('no-filters', 1, false);
  await page.addStyleTag({ content: '.chart-labels, .callout, .holo { visibility: hidden !important; }' });
  await run('labels-hidden', 4, false);
  await page.evaluate(() => window.__starChartTest!.setPaint(false));
  await run('labels-hidden-paint-off', 4, false);
}
