// 23 C8: Halcyon's Pulsar Pod (the densest) with the most unassigned work on its frontier belt. Seeks
// to the beat with the most frontier pieces, shoots it, and reports the smallest gap between a frontier
// piece's and a station's drawn discs (effective radii, in px at the camera's scale; a hit is a tenth
// more). Run: npm run drive -- tests/drive/steps/c8-frontier.ts --paradigm solar --name c8
// Stills are copied to review/v1.3/C/C8-before.png / C8-after.png by hand. Fixture data only (INV-18).
import type { Drive } from '../drive';

export default async function c8(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(true); t.setRate(1); });
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes().map((b) => b.startMs));
  let best = { ms: 0, n: -1 };
  for (const ms of beats) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms + 1);
    await page.waitForTimeout(60);
    const n = await page.evaluate(() => { const g = window.__starChartTest!.viewGraph(); return (g?.solar?.unassigned.length ?? 0) * 100 + (g?.nodes.filter((x) => x.kind === 'facility').length ?? 0); });
    if (n > best.n) best = { ms: ms + 1, n };
  }
  d.note(`${beats.length} beats; most frontier pieces x100 + stations: ${best.n} at ${best.ms} ms`);
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), best.ms);
  await page.waitForTimeout(1500);
  const gaps = await page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const scale = t.camera().scale;
    const un = new Set(g.solar!.unassigned);
    const eff = t.targetNodes();
    const pieces = eff.filter((n) => un.has(n.projectionKey));
    const hulls = eff.filter((n) => n.kind === 'facility');
    let min = Infinity;
    for (const p of pieces) for (const s of hulls) min = Math.min(min, (Math.hypot(p.world.x - s.world.x, p.world.y - s.world.y) - 1.1 * (p.world.r + s.world.r)) * scale);
    return { pieces: pieces.length, hulls: hulls.length, minGapPx: min, scale };
  });
  d.note(`frontier ${gaps.pieces}, stations ${gaps.hulls}, smallest gap between hits ${gaps.minGapPx.toFixed(1)} px at scale ${gaps.scale.toFixed(3)}`);
  await d.shot('pulsar-frontier');
}
