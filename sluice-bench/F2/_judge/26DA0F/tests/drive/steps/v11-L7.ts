// Stills for 19 L7 (fixture data only, INV-18): stories and bugs hover-only, both ways with their
// planet's list, and labelled around their maneuvers in play. Harbor Pod's region mid-round: at rest
// (no piece has a plate), a seated piece pointed at (its planet's plate expanded, its row lit), the
// same piece selected after the pointer leaves (its row marked), a frontier piece pointed at (its own
// T2 plate), a piece with Tasks selected (the inspector lists its steps), then the strike run's beat
// stepped into (the hive ship's title while the maneuver casts it), a few frames of plain play at 1×
// (whichever pieces the beats cast), and paused (the cast labels fade out). Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function v11L7(d: Drive): Promise<void> {
  const { page } = d;
  const off = async () => {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await page.waitForTimeout(700);
  };
  /** Points at a drawn node by its projection key. */
  const pointAt = async (pk: string) => {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const p = await page.evaluate((k) => window.__starChartTest!.displayed().find((x) => x.pk === k) ?? null, pk);
    if (!p) return false;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.waitForTimeout(500);
    return true;
  };
  const piecePlates = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--objective, .callout--threat')]
    .filter((e) => e.style.display !== 'none').map((e) => e.querySelector('.callout__title')?.textContent ?? ''));
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.35));
  await d.settle();
  await off();
  await d.shot('rest');
  d.note(`piece plates at rest: ${JSON.stringify(await piecePlates())}`);
  const pick = () => page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const w = document.querySelector('.chart-host canvas')!.getBoundingClientRect().width;
    const drawn = new Set(window.__starChartTest!.displayed().filter((x) => x.x > 40 && x.x < w - 420 && x.y > 120).map((x) => x.pk));
    const hosted = new Set<string>();
    for (const n of g.nodes) if (n.kind === 'seat') for (const r of g.lists?.[n.projectionKey]?.rows ?? []) hosted.add(r.key);
    const pieces = g.nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && drawn.has(n.projectionKey));
    return {
      seated: pieces.find((n) => hosted.has(n.canonicalKey) && n.piece?.signal.rung !== 'accomplished')?.projectionKey ?? null,
      frontier: pieces.find((n) => !hosted.has(n.canonicalKey) && n.piece?.signal.rung !== 'off')?.projectionKey ?? null,
    };
  });
  const at = await pick();
  if (at.seated && await pointAt(at.seated)) {
    await d.shot('seated-pointed');
    await page.mouse.down();
    await page.mouse.up();
    await off();
    await d.shot('seated-selected');
    await d.dump('seated-selected');
  }
  if (at.frontier && await pointAt(at.frontier)) await d.shot('frontier-pointed');
  await off();
  // A piece with Tasks selected from the object list: the inspector lists its steps (the chart has no list of them).
  const stepped = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes
    .find((n) => (n.kind === 'objective' || n.kind === 'threat') && n.selectable && (n.stepKeys?.length ?? 0) > 0)?.label ?? null);
  if (stepped) {
    await page.locator('.object-list button', { hasText: stepped }).first().click();
    await off();
    await d.shot('steps-in-inspector');
  }
  // In play: the beat where a hive ship is defeated, stepped into; the strike run casts it.
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  let before = new Map<string, string>();
  for (const b of beats) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.startMs + 1);
    await page.waitForTimeout(60);
    const threats = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes
      .filter((n) => n.kind === 'threat' && n.piece).map((n) => [n.projectionKey, n.piece!.signal.rung] as [string, string]));
    const hit = threats.find(([pk, rung]) => rung === 'accomplished' && before.has(pk) && before.get(pk) !== 'accomplished');
    if (hit) {
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), b.startMs - 1);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__starChartTest!.stepBeat());
      await page.waitForTimeout(900);
      await d.shot('strike-cast');
      d.note(`piece plates in the strike run: ${JSON.stringify(await piecePlates())}`);
      await page.waitForTimeout(5000);
      await d.shot('strike-after');
      d.note(`piece plates after it: ${JSON.stringify(await piecePlates())}`);
      break;
    }
    before = new Map(threats);
  }
  // Plain play at 1× from early in the round: whichever pieces the beats cast show their titles.
  await page.evaluate(() => { const t = window.__starChartTest!; t.setScheduleMs(t.session().totalMs * 0.1); t.setRate(1); t.play(); });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(1500);
    await d.shot(`playing-${i + 1}`);
    d.note(`piece plates playing ${i + 1}: ${JSON.stringify(await piecePlates())}`);
  }
  // Paused, the cast labels fade out (outside play, pieces are hover-only).
  await page.evaluate(() => window.__starChartTest!.pause());
  await page.waitForTimeout(800);
  await d.shot('paused');
  d.note(`piece plates paused: ${JSON.stringify(await piecePlates())}`);
}
