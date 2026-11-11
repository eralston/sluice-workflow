// 27 E6b: Pulsar Pod's first volley. Run: npm run drive -- tests/drive/steps/e6-volley.ts --paradigm solar
// The volley is found in the app through the volleys() hook (never by ledger index), played from just before its
// fused beat at rate 1, and shot at its act (the formation and the energy chain), through each turn, and at the
// split beam near its end. Fixture data only (INV-18). Stills are copied to docs/progress/v1.4/work/E6/e6-*.png by hand.
import type { Drive } from '../drive';

export default async function e6(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); });
  const vs = await page.evaluate(() => window.__starChartTest!.volleys());
  d.note(`scene ${await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey)}; ${vs.length} volleys`);
  const v = vs[0];
  if (!v) { d.note('no volley in this scene'); return; }
  d.note(`volley 0: ${Math.round(v.startMs)}..${Math.round(v.endMs)} ms, members ${JSON.stringify(v.members)}, people ${v.people}`);
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), v.startMs - 1);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__starChartTest!.play());
  const t0 = Date.now();
  const len = v.endMs - v.startMs;
  // The claim runs first, then each turn opens a VOLLEY_TURN_MS (2540 ms) apart; the split beam lands late.
  const offsets = [1200, 2400, 4900, 7400, 9900, Math.max(10_500, len - 1500)].filter((o) => o < len);
  for (const off of offsets) {
    const wait = off - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const notes = Object.values(await page.evaluate(() => window.__starChartTest!.annotations().notes)).map((n) => n.text);
    d.note(`+${off}: notes ${JSON.stringify(notes)}`);
    await d.shot(`volley-${off}`);
  }
  await page.evaluate(() => window.__starChartTest!.pause());
}
