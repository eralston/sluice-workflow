// 23 C2: Quasar Pod's idle station goes on standby in play. Walks the beats of the pod, finds where
// `search-api` (the repo whose last PR merges on Wed 16 Sep, while the rest of the pod works on) flips to standby, and shoots just before and
// after, with the tint. Fixture data only (INV-18). Stills are copied to review/v1.3/C/C2-*.png by hand.
import type { Drive } from '../drive';

export default async function c2(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Quasar Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
  const read = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const n = t.viewGraph()!.nodes.find((x) => x.kind === 'facility' && x.label.startsWith('search-api'));
    if (!n) return null;
    return { open: n.piece?.open ?? 0, standby: !!n.piece?.standby, tint: t.viewTints([n.projectionKey])[n.projectionKey], utc: t.session().playheadUtc, act: n.activity ?? 0 };
  });
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes().map((b) => ({ ms: b.startMs, utc: b.sourceUtc })));
  let prev: boolean | null = null; let flip = -1;
  for (let i = 0; i < beats.length; i++) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), beats[i]!.ms + 1);
    const r = await read();
    if (r && prev === false && r.standby) { flip = i; d.note(`flip at beat ${i}: ${new Date(r.utc!).toISOString()}`); break; }
    if (r) prev = r.standby;
  }
  if (flip < 0) { d.note('no flip found'); return; }
  const shoot = async (ms: number, name: string) => {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
    await page.waitForTimeout(1500);
    const r = await read();
    d.note(`${name}: ${new Date(r!.utc!).toISOString()} standby=${r!.standby} open=${r!.open} tint=${r!.tint?.toFixed(2)} activity=${r!.act}`);
    await d.shot(name);
  };
  const thu = beats.filter((b) => b.utc <= Date.parse('2026-09-17T23:59:00Z')).at(-1)!;
  await shoot(thu.ms + 1, 'before');
  await shoot(beats[flip]!.ms + 1, 'after');
  // Monday 21 Sep, mid-morning Pacific: which stations stand by (the weekend quiets most of them).
  const mon = beats.find((b) => b.utc >= Date.parse('2026-09-21T20:00:00Z'))!;
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), mon.ms + 1);
  await page.waitForTimeout(1000);
  const census = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((x) => x.kind === 'facility').map((n) => `${n.label.split(' ')[0]}:${n.piece?.standby ? 'standby' : 'awake'}`));
  d.note(`Monday ${new Date(mon.utc).toISOString()}: ${census.join(' ')}`);
  for (const day of ['2026-09-22T06:00:00Z', '2026-09-23T06:00:00Z', '2026-09-25T06:00:00Z']) {
    const b = beats.filter((x) => x.utc <= Date.parse(day)).at(-1)!;
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.ms + 1);
    await page.waitForTimeout(800);
    const c = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((x) => x.kind === 'facility').map((n) => `${n.label.split(' ')[0]}:${n.piece?.standby ? 'S' : 'A'}`));
    d.note(`census to ${day}: ${c.join(' ')}`);
  }
  const sat = beats.find((b) => b.utc >= Date.parse('2026-09-20T20:00:00Z'))!;
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), sat.ms + 1);
  await page.waitForTimeout(1000);
  const cs = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((x) => x.kind === 'facility').map((n) => `${n.label.split(' ')[0]}:${n.piece?.standby ? 'standby' : 'awake'}`));
  d.note(`Sunday ${new Date(sat.utc).toISOString()}: ${cs.join(' ')}`);
  // Real play: from the beat before, at 4x, until the station stands by; its tint sampled on the way down.
  await page.evaluate((x) => { const t = window.__starChartTest!; t.setScheduleMs(x); t.setRate(4); t.play(); }, beats[flip - 1]!.ms + 1);
  const series: string[] = [];
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(250);
    const r = await read();
    if (r && r.standby) { series.push(`${i}:${r.tint?.toFixed(2)}`); if (series.length >= 14) break; }
  }
  d.note(`tint after it stands by (250 ms steps, in play): ${series.join(' ')}`);
  await page.evaluate(() => { window.__starChartTest!.pause(); window.__starChartTest!.setRate(1); });
  await d.shot('after-in-play');
}
