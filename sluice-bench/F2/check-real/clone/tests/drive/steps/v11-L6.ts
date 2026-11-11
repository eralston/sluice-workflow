// Stills for 19 L6 (fixture data only, INV-18): a dreadnought's plate expands into its PRs. Harbor
// Pod's region, mid-round and at the round's end: tide-gateway pointed at on its hull (one row per PR,
// `Pull Request #n · status`, the work each serves beneath), a row hovered (its piece ringed), then
// ledger-sync's one PR, which serves two pieces (both ringed), its plate hovered after the grace, and
// a press on the row (the first piece it serves is selected). Run with --paradigm solar.
import type { Drive } from '../drive';

export default async function v11L6(d: Drive): Promise<void> {
  const { page } = d;
  const off = async () => {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await page.waitForTimeout(700);
  };
  /** Points at a drawn node's hull by its projection key. */
  const pointAt = async (pk: string) => {
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const p = await page.evaluate((k) => window.__starChartTest!.displayed().find((x) => x.pk === k) ?? null, pk);
    if (!p) return false;
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.waitForTimeout(500);
    return true;
  };
  /** A station by its repo's name, and the first of its rows serving the most pieces. */
  const station = (name: string) => page.evaluate((nm) => {
    const g = window.__starChartTest!.viewGraph()!;
    const n = g.nodes.find((x) => x.kind === 'facility' && x.label === nm);
    const rows = n ? g.lists?.[n.projectionKey]?.rows ?? [] : [];
    const row = [...rows].sort((a, b) => (b.serves?.length ?? 0) - (a.serves?.length ?? 0))[0];
    return n && row ? { pk: n.projectionKey, row: row.key, rows: rows.length } : null;
  }, name);
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).first().click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 20_000 });
  await d.settle();
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 20_000 });
  await d.settle();
  // Mid-round, tide-gateway holds most of its PRs open.
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.6));
  await d.settle();
  await off();
  await d.shot('rest');
  const tide = await station('tide-gateway');
  if (tide && await pointAt(tide.pk)) {
    await d.shot('tide-gateway-hull-pointed');
    const row = page.locator(`.callout--facility.is-expanded .holo__row[data-key="${tide.row}"]`).first();
    if (await row.count()) {
      await row.hover();
      await page.waitForTimeout(400);
      await d.shot('tide-gateway-row-lit');
    }
  }
  await off();
  // The round's end: ledger-sync's PR, merged, serves a Story and a Bug.
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs));
  await d.settle();
  await off();
  const ledger = await station('ledger-sync');
  if (ledger && await pointAt(ledger.pk)) {
    await d.shot('ledger-sync-hull-pointed');
    const row = page.locator(`.callout--facility.is-expanded .holo__row[data-key="${ledger.row}"]`).first();
    if (await row.count()) {
      await row.hover();
      await page.waitForTimeout(400);
      await d.shot('ledger-sync-row-lit-two-rings');
    }
    await off();
    await page.locator('.callout--facility', { hasText: 'ledger-sync' }).first().hover();
    await page.waitForTimeout(500);
    await d.shot('ledger-sync-plate-pointed');
    const own = page.locator(`.callout--facility.is-expanded .holo__row[data-key="${ledger.row}"]`).first();
    if (await own.count()) {
      await own.click();
      await off();
      await page.waitForTimeout(500);
      await d.shot('ledger-sync-row-pressed-selects-piece');
      await d.dump('ledger-sync-row-pressed');
    }
  }
}
