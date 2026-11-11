// The strike run, frame by frame (HG-V3', run with --paradigm solar): on pod-sprint's Harbor Pod,
// find the beat where a threat reaches Accomplished, step it at 1×, and shoot it every 250 ms; then
// the same beat under reduced motion. The solar-play spec checks it; this is for looking. Fixture
// data only (INV-18).
import type { Drive } from '../drive';

export default async function solarStrike(d: Drive): Promise<void> {
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

  // The first beat that takes a drawn threat to Accomplished.
  const strike = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    let before = new Map<string, string>();
    for (const b of t.beatTimes()) {
      t.setScheduleMs(b.startMs + 1);
      await frame();
      const threats = t.viewGraph()!.nodes.filter((n) => n.kind === 'threat' && n.piece);
      const hit = threats.find((n) => n.piece!.signal.rung === 'accomplished' && before.has(n.projectionKey) && before.get(n.projectionKey) !== 'accomplished');
      if (hit) return { startMs: b.startMs, label: hit.label };
      before = new Map(threats.map((n) => [n.projectionKey, n.piece!.signal.rung]));
    }
    return null;
  });
  if (!strike) { d.note('no strike beat found'); return; }
  d.note(`strike run: "${strike.label}" at ${strike.startMs} ms`);

  for (const reduced of [false, true]) {
    await page.evaluate((r) => { const t = window.__starChartTest!; t.setReduced(r); t.setRate(1); }, reduced);
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), strike.startMs);
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(250);
      await d.shot(`${reduced ? 'reduced' : 'strike'}-${String(i).padStart(2, '0')}`);
    }
    d.note(`${reduced ? 'reduced' : 'full'}: ${JSON.stringify(await page.evaluate(() => ({ fx: window.__starChartTest!.fxCensus(), live: window.__starChartTest!.liveCommands() })))}`);
  }
  await page.evaluate(() => window.__starChartTest!.setReduced(false));
}
