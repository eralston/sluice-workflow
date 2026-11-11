// 27 E7a: Harbor Pod's sector sweep. Run: npm run drive -- tests/drive/steps/e7-sweep.ts --paradigm solar
// Opens Tidewater Array's Sprint 13 and Harbor Pod (as c11-labels does), finds the first accented beat in
// beatTimes() (the opening's creations), plays it at rate 1 from just before, and shoots at the tell, mid-act and
// the act's end, noting the star's note and when each new piece's body is drawn (viewAlphas). Then pauses, seeks to
// the beat's end and shoots again: the same board. Fixture data only (INV-18). Stills are copied to
// docs/progress/v1.4/work/E7/e7-*.png by hand.
import type { Drive } from '../drive';

export default async function e7(d: Drive): Promise<void> {
  const { page } = d;
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  const sprint13 = page.locator('.chooser button', { hasText: 'Sprint 13' });
  if (await sprint13.count()) await sprint13.first().click();
  else await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); t.pause(); });

  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  const i = beats.findIndex((b) => b.accented);
  const b = beats[i];
  if (!b) { d.note('no accented beat in this scene'); return; }
  const endMs = (beats[i + 1]?.startMs ?? b.startMs + 4000) - 1;
  d.note(`scene ${await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey)}; first accented beat ${b.index} at ${Math.round(b.startMs)} ms, next beat at ${Math.round(endMs + 1)} ms`);

  // The pieces this beat brings: on the board at its end, not drawn just before it.
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), endMs);
  await d.settle();
  const after = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => n.projectionKey));
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.startMs - 1);
  await page.waitForTimeout(400);
  const pre = await page.evaluate((pks) => window.__starChartTest!.viewAlphas(pks), after);
  const fresh = after.filter((pk) => (pre[pk] ?? 0) < 0.3);
  d.note(`${fresh.length} pieces arrive in this beat`);

  // Play from just before the beat; sample each new piece's alpha every frame, and shoot on the way.
  await page.evaluate(() => window.__starChartTest!.play());
  const sampling = page.evaluate(async (pks) => {
    const t = window.__starChartTest!;
    const seen: Record<string, number> = {};
    const t0 = performance.now();
    while (performance.now() - t0 < 4500) {
      const a = t.viewAlphas(pks);
      for (const pk of pks) if (seen[pk] === undefined && (a[pk] ?? 0) >= 0.5) seen[pk] = Math.round(performance.now() - t0);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return seen;
  }, fresh);
  const t0 = Date.now();
  for (const [name, off] of [['tell', 150], ['mid-act', 1500], ['act-end', 3200]] as const) {
    const wait = off - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    const notes = Object.values(await page.evaluate(() => window.__starChartTest!.annotations().notes)).map((n) => n.text);
    d.note(`+${off} (${name}): notes ${JSON.stringify(notes)}`);
    await d.shot(`sweep-${name}`);
  }
  const seen = await sampling;
  const times = Object.values(seen).sort((x, y) => x - y);
  d.note(`revealed ${times.length} of ${fresh.length}; first at +${times[0] ?? '-'} ms, last at +${times.at(-1) ?? '-'} ms`);
  await page.evaluate(() => window.__starChartTest!.pause());

  // Seek to the beat's end: the same board as the play left.
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), endMs);
  await d.settle();
  const post = await page.evaluate((pks) => window.__starChartTest!.viewAlphas(pks), fresh);
  d.note(`after the seek: ${fresh.filter((pk) => (post[pk] ?? 0) >= 0.5).length} of ${fresh.length} drawn`);
  await d.shot('sweep-seek-end');
}
