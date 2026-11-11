// Stills for 19 L2 and L5 (fixture data only, INV-18): the one expandable holo plate. Harbor Pod's
// region mid-round: a homeworld at rest (T3, its title), then pointed at on its disc (its plate grows
// its rows in place, in the same frame), a row hovered (its object lit and ringed), the plate itself
// hovered after the grace, a dreadnought's plate expanded, a piece pointed at (19 L7: its planet's
// plate expands, its row lit), a selected homeworld (it stays expanded while settled), and the same
// while playing (back to its title). Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function v11L2(d: Drive): Promise<void> {
  const { page } = d;
  const off = async () => {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await page.waitForTimeout(700);
  };
  /** Points at a drawn node's disc by its projection key. */
  const pointAt = async (pk: string) => {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const p = await page.evaluate((k) => window.__starChartTest!.displayed().find((x) => x.pk === k) ?? null, pk);
    if (!p) return false;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.waitForTimeout(500);
    return true;
  };
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  // Mid-round, where the homeworlds hold live work.
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.5));
  await d.settle();
  await off();
  await d.shot('rest');
  const pick = (kind: string) => page.evaluate((k) => {
    const g = window.__starChartTest!.viewGraph()!;
    const drawn = new Set(g.nodes.map((n) => n.canonicalKey));
    const n = g.nodes.find((x) => x.kind === k && x.selectable && g.lists?.[x.projectionKey]?.rows.some((r) => drawn.has(r.key)))
      ?? g.nodes.find((x) => x.kind === k && x.selectable && g.lists?.[x.projectionKey]);
    if (!n) return null;
    const row = g.lists![n.projectionKey]!.rows.find((r) => drawn.has(r.key)) ?? g.lists![n.projectionKey]!.rows[0]!;
    return { pk: n.projectionKey, label: n.label, row: row.key };
  }, kind);
  const seat = await pick('seat');
  if (seat && await pointAt(seat.pk)) {
    await d.shot('homeworld-disc-pointed');
    const row = page.locator(`.callout--seat.is-expanded .holo__row[data-key="${seat.row}"]`).first();
    if (await row.count()) {
      await row.hover();
      await page.waitForTimeout(400);
      await d.shot('homeworld-row-lit');
    }
    await off();
    await d.shot('homeworld-folded');
    await page.locator('.callout--seat', { hasText: seat.label }).first().hover();
    await page.waitForTimeout(500);
    await d.shot('homeworld-plate-pointed');
    await d.dump('homeworld-plate-pointed');
  }
  await off();
  const station = await pick('facility');
  if (station && await pointAt(station.pk)) await d.shot('dreadnought-pointed');
  await off();
  // A piece has no list of its own since 19 L7: pointed at, a seated one expands its planet's plate.
  const seated = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const rows = new Set(g.nodes.filter((x) => x.kind === 'seat').flatMap((x) => g.lists?.[x.projectionKey]?.rows.map((r) => r.key) ?? []));
    return g.nodes.find((x) => (x.kind === 'objective' || x.kind === 'threat') && rows.has(x.canonicalKey))?.projectionKey ?? null;
  });
  if (seated && await pointAt(seated)) await d.shot('piece-pointed');
  await off();
  // Selected and settled, a homeworld stays expanded; playing, it folds back to its title.
  if (seat) {
    await page.locator('.object-list button', { hasText: seat.label }).first().click();
    await off();
    await page.waitForTimeout(800);
    await d.shot('homeworld-selected');
    await page.evaluate(() => { window.__starChartTest!.setRate(2); window.__starChartTest!.play(); });
    await page.waitForTimeout(2500);
    await d.shot('homeworld-selected-playing');
  }
}
