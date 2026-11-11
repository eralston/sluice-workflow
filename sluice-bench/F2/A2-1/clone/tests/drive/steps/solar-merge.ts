// The merge, frame by frame (art session 2026-10-12, run with --paradigm solar): on pod-sprint's
// Harbor Pod, find the beat where a station's first PR merges (its stage gains `mg=1`), step it at 1×
// and shoot it every 500 ms: the formation, the energy chain, the transformation, the charge and the
// beam, then the linked piece's own close (merged and closed at once in the fixture). Then the next
// merge into a station that already had one. Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function solarMerge(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);

  // Beats where a station's merge count goes up: from none (its first), and from some (a later one).
  const merges = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const mg = (stage: string) => Number(/\|mg=(\d+)/.exec(stage)?.[1] ?? 0);
    let before = new Map<string, number>();
    const out: { startMs: number; label: string; first: boolean }[] = [];
    for (const b of t.beatTimes()) {
      t.setScheduleMs(b.startMs + 1);
      await frame();
      const fac = t.viewGraph()!.nodes.filter((n) => n.kind === 'facility');
      for (const n of fac) {
        const was = before.get(n.projectionKey);
        if (was !== undefined && mg(n.stage) > was) out.push({ startMs: b.startMs, label: n.label, first: was === 0 });
      }
      before = new Map(fac.map((n) => [n.projectionKey, mg(n.stage)]));
    }
    return out;
  });
  d.note(`merges: ${JSON.stringify(merges)}`);
  const which = process.env.MERGE_PICK ?? 'first,later';
  // MERGE_AT: a beat's start (ms, from the notes) to film instead.
  if (process.env.MERGE_AT) {
    const at = merges.find((m) => m.startMs === Number(process.env.MERGE_AT));
    if (at) merges.splice(0, merges.length, { ...at, first: false });
  }
  const picks = [which.includes('first') ? merges.find((m) => m.first) : undefined, which.includes('later') ? merges.find((m) => !m.first) : undefined].filter((m): m is NonNullable<typeof m> => !!m);
  for (const m of picks) {
    const tag = m.first ? 'first' : 'later';
    d.note(`${tag} merge: "${m.label}" at ${m.startMs} ms`);
    await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), m.startMs);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    const t0 = Date.now();
    for (let i = 0; i < Number(process.env.MERGE_SHOTS ?? 24); i++) {
      await page.waitForTimeout(500);
      await d.shot(`${tag}-${String(i).padStart(2, '0')}`);
      d.note(`${tag}-${String(i).padStart(2, '0')} +${((Date.now() - t0) / 1000).toFixed(1)}s ${JSON.stringify(await page.evaluate(() => window.__starChartTest!.fxCensus()))}`);
    }
    d.note(`${tag}: ${JSON.stringify(await page.evaluate(() => ({ fx: window.__starChartTest!.fxCensus(), live: window.__starChartTest!.liveCommands() })))}`);
  }
}
