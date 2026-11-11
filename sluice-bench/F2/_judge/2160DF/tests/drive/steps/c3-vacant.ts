// 23 C3: a homeworld that empties during play. pod-sprint's Lantern Pod: Kit Marchetti's planet is
// vacant before work arrives, holds work, then goes vacant when its last piece leaves. Walks the beats to
// find both flips, shoots the planet occupied and vacated (reduced motion off), and samples its tint
// (the surface share, read back from the view) through the dim in real play. Fixture data only (INV-18).
// Stills are copied to review/v1.3/C/C3-*.png by hand.
import type { Drive } from '../drive';

export default async function c3(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Lantern Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
  d.note(`seats: ${JSON.stringify(await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((x) => x.kind === 'seat').map((x) => `${x.label}/${x.meta}`)))}`);
  const WHO = 'Kit Marchetti';
  const readOf = (who: string) => page.evaluate((who) => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const n = g.nodes.find((x) => x.kind === 'seat' && (x.label.startsWith(who) || (x.meta ?? '').startsWith(who)));
    if (!n) return null;
    return { vacant: !!n.piece?.vacant, awaiting: !!n.piece?.awaiting, key: n.canonicalKey, tint: t.viewTints([n.projectionKey])[n.projectionKey], utc: t.session().playheadUtc, seats: g.nodes.filter((x) => x.kind === 'seat').length };
  }, who);
  const read = () => readOf(WHO);
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes().map((b) => ({ ms: b.startMs, utc: b.sourceUtc })));
  const flips: { to: 'vacant' | 'holding'; i: number }[] = [];
  let prev: boolean | null = null;
  const prevAwaiting = new Map<string, boolean>();
  let first: { i: number; key: string; who: string } | null = null; // the first beat where an awaiting seat holds work (v1.4 B4)
  for (let i = 0; i < beats.length; i++) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), beats[i]!.ms + 1);
    await page.waitForTimeout(200);
    const r = await read();
    if (!r) continue;
    if (prev !== null && r.vacant !== prev) flips.push({ to: r.vacant ? 'vacant' : 'holding', i });
    prev = r.vacant;
  }
  // Any seat's first arrival will do (v1.4 B4): scan the seats in turn.
  const whos = ['Kit Marchetti', 'Juno Achterberg'];
  const marks = [0, ...beats.map((b) => b.ms + 1)]; // 0 is the start of the round, before the first beat
  for (let i = 0; i < marks.length && !first; i++) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), marks[i]!);
    await page.waitForTimeout(200);
    for (const who of whos) {
      const r = await readOf(who);
      if (r && prevAwaiting.get(who) && !r.vacant && !first) first = { i, key: r.key, who };
      if (r) prevAwaiting.set(who, r.awaiting);
    }
  }
  d.note(`${WHO}: ${beats.length} beats; flips ${JSON.stringify(flips)}`);
  d.note(`${WHO}: first arrival at beat ${first ? `${first.i} (${first.who})` : 'none'}`);
  const empties = flips.find((f) => f.to === 'vacant');
  if (!empties) d.note('no flip to vacant found');
  if (empties) {
    const shoot = async (ms: number, name: string) => {
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
      await page.waitForTimeout(1500);
      const r = await read();
      d.note(`${name}: ${new Date(r!.utc!).toISOString()} vacant=${r!.vacant} tint=${r!.tint?.toFixed(2)} seats=${r!.seats}`);
      await d.shot(name);
    };
    await shoot(beats[empties.i - 1]!.ms + 1, 'occupied');
    await shoot(beats[empties.i]!.ms + 1, 'vacated');
    // Real play across the flip, at 1x: the surface share sampled every 250 ms (it eases down over ~2 s).
    await page.evaluate((x) => { const t = window.__starChartTest!; t.setScheduleMs(x); t.setRate(1); t.play(); }, beats[empties.i - 1]!.ms + 1);
    const series: string[] = [];
    for (let i = 0; i < 160; i++) {
      await page.waitForTimeout(250);
      const r = await read();
      if (r && r.vacant) { series.push(`${r.tint?.toFixed(2)}`); if (series.length >= 14) break; }
    }
    d.note(`tint after it empties (250 ms steps, in play): ${series.join(' ')}`);
    await page.evaluate(() => window.__starChartTest!.pause());
    // Reduced motion: a seek back and forward lands it at once.
    await page.evaluate((x) => { const t = window.__starChartTest!; t.setReduced(true); t.setScheduleMs(x); }, beats[empties.i - 1]!.ms + 1);
    await page.waitForTimeout(400);
    d.note(`reduced, seek to occupied: ${JSON.stringify(await read())}`);
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), beats[empties.i]!.ms + 1);
    await page.waitForTimeout(400);
    d.note(`reduced, seek to vacated: ${JSON.stringify(await read())}`);
    await page.evaluate(() => window.__starChartTest!.setReduced(false));
  }
  if (first) await firstLight(d, first, marks, () => readOf(first!.who));
}

/** First light (v1.4 B4): play across Kit's first arrival at 1x and shoot a burst of stills of the planet as it comes. */
async function firstLight(
  d: Drive, first: { i: number; key: string; who: string }, marks: number[],
  read: () => Promise<{ vacant: boolean; awaiting: boolean; tint?: number } | null>,
): Promise<void> {
  const { page } = d;
  await page.evaluate((x) => { const t = window.__starChartTest!; t.setReduced(false); t.setScheduleMs(x); t.setRate(1); }, marks[Math.max(0, first.i - 1)]!);
  await page.waitForTimeout(600);
  const before = await read();
  d.note(`before first light: vacant=${before?.vacant} awaiting=${before?.awaiting}`);
  await page.evaluate(() => window.__starChartTest!.play());
  let seen = false;
  for (let i = 0; i < 4000; i++) {
    const r = await read();
    // The graph flips at the beat, but the planet's view takes the new stage when the piece lands: poll its tint for the first lift.
    if (r && !r.vacant && (r.tint ?? 0) > 0.551) { seen = true; break; }
    await page.waitForTimeout(20);
  }
  if (!seen) { d.note('first light: Kit never lit while playing'); await page.evaluate(() => window.__starChartTest!.pause()); return; }
  const flipAt = Date.now();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const at = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), first.key))!;
  const half = 80;
  const clip = { x: box.x + at.x - half, y: box.y + at.y - half, width: half * 2, height: half * 2 };
  const tints: string[] = [];
  for (let i = 0; i < 8; i++) {
    const ms = Date.now() - flipAt;
    await page.screenshot({ clip, path: `test-results/drive/b4/first-light-${String(ms).padStart(4, '0')}.png` });
    tints.push(`${ms}ms:${(await read())?.tint?.toFixed(2)}`);
    await page.waitForTimeout(90); // spread the burst across the 1.4 s of first light
  }
  await page.waitForTimeout(1500);
  d.note(`after 1.5 s more: ${JSON.stringify(await read())}`);
  await page.evaluate(() => window.__starChartTest!.pause());
  d.note(`first light stills (ms since the first lift: tint): ${tints.join(' ')}`);
}
