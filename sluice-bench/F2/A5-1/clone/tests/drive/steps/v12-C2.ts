// Story time (22 C2, 05 §8.3a; run with --paradigm solar): on pod-sprint's Harbor Pod (Sprint 13), find
// the beats where a station's merge and a piece's close now play together (an arc, B-12), then play the
// first two from just before at 1× with History open, a still every 700 ms. Each still's note lists the
// beat and History's rows (a moved one shows its real time, "· at …"). Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function v12C2(d: Drive): Promise<void> {
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

  // Beats where a station's merge count goes up and a piece reaches Accomplished in the same beat.
  const arcs = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const mg = (stage: string) => Number(/\|mg=(\d+)/.exec(stage)?.[1] ?? 0);
    const done = (stage: string) => /\|accomplished\b/.test(stage);
    let before = new Map<string, string>();
    const out: { index: number; startMs: number; stations: string[]; closed: string[] }[] = [];
    for (const b of t.beatTimes()) {
      t.setScheduleMs(b.startMs + 1);
      await frame();
      const nodes = t.viewGraph()!.nodes.filter((n) => n.stage !== undefined);
      const stations = nodes.filter((n) => n.kind === 'facility' && before.has(n.projectionKey) && mg(n.stage!) > mg(before.get(n.projectionKey)!)).map((n) => n.label);
      const closed = nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && before.has(n.projectionKey) && done(n.stage!) && !done(before.get(n.projectionKey)!)).map((n) => n.label);
      if (stations.length && closed.length) out.push({ index: b.index, startMs: b.startMs, stations, closed });
      before = new Map(nodes.map((n) => [n.projectionKey, n.stage!]));
    }
    return out;
  });
  d.note(`arcs: ${JSON.stringify(arcs)}`);

  await page.locator('#tab-history').click();
  const rows = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.history-row')]
    .filter((r) => r.offsetParent !== null).slice(0, 8).map((r) => `${r.classList.contains('is-now') ? '▶ ' : ''}${(r.textContent ?? '').replace(/\s+/g, ' ').trim()}`));
  for (const [n, arc] of arcs.slice(0, 2).entries()) {
    await page.evaluate((ms) => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(Math.max(0, ms - 300)); }, arc.startMs);
    await d.settle();
    await page.evaluate(() => window.__starChartTest!.play());
    for (let i = 1; i <= 14; i++) {
      await page.waitForTimeout(700);
      const name = `arc${n + 1}-${String(i).padStart(2, '0')}`;
      await d.shot(name);
      const s = await page.evaluate(() => window.__starChartTest!.session());
      d.note(`${name}: beat ${s.beatIndex}/${s.beats} · ${JSON.stringify(await rows())}`);
    }
    await page.evaluate(() => window.__starChartTest!.pause());
  }
}
