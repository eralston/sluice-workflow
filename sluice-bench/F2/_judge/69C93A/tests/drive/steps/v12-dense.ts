// The dense-pod tour (22 Block A, A13; fixture data only, INV-18): meridian-sprint's Convoy Planning
// Pod, 12 homeworlds, the scene every Block A item is checked against. Run with --paradigm solar.
// - The galaxy, Meridian Works selected; the round (Sprint 7) at rest, Convoy pointed at and selected
//   (A1 previews, A3 star labels, A4 the inspector, A5 the star tier).
// - The region at rest mid-round and at its end; each empty homeworld (Rook, Tove, Ulla) selected,
//   with its inspector (A2); the busiest homeworld expanded; a long-titled piece pointed at (A7).
// - Playback from the start at 1×, a still every 1.5 s (A6–A11: titles, role outlines, arrivals,
//   where captains rest and how they approach). Each still's note lists the plates shown and where
//   each captain is against its planet.
import type { Drive } from '../drive';

export default async function v12Dense(d: Drive): Promise<void> {
  const { page } = d;
  const box = async () => (await page.locator('.chart-host canvas').boundingBox())!;
  const off = async () => {
    const b = await box();
    await page.mouse.move(b.x + 4, b.y + b.height - 4);
    await page.waitForTimeout(700);
  };
  /** Drop the selection (Escape goes back a level, and the sky keeps it). */
  const clearPick = async () => {
    await page.evaluate(() => window.__starChartTest!.select(null));
    await off();
  };
  const hover = async (text: string, kind = '') => {
    await page.locator(`.callout${kind}`, { hasText: text }).first().hover();
    await page.waitForTimeout(500);
  };
  const pointAt = async (pk: string) => {
    const b = await box();
    const p = await page.evaluate((k) => window.__starChartTest!.displayed().find((x) => x.pk === k) ?? null, pk);
    if (!p) return false;
    await page.mouse.move(b.x + p.x, b.y + p.y);
    await page.waitForTimeout(600);
    return true;
  };
  const seek = async (share: number) => {
    await page.evaluate((s) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * s), share);
    await d.settle();
  };
  const scene = (prefix: string) => page.waitForFunction((p) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(p) === true, prefix, { timeout: 30_000 });
  /** The shown plates, and each captain's distance from its planet's centre in planet radii. */
  const describe = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((e) => e.style.display !== 'none' && e.offsetParent !== null).map((e) => e.querySelector('.callout__title')?.textContent ?? '');
    const drawn = new Map(t.displayed().map((x) => [x.pk, x]));
    const scale = t.camera().scale;
    const seats = g.nodes.filter((n) => n.kind === 'seat');
    const captains = g.nodes.filter((n) => n.kind === 'captain').map((c) => {
      const at = drawn.get(c.projectionKey);
      if (!at) return `${c.label}: -`;
      const near = seats.map((s) => ({ s, p: drawn.get(s.projectionKey) })).filter((x) => x.p)
        .map((x) => ({ label: x.s.label, d: Math.hypot(x.p!.x - at.x, x.p!.y - at.y) / Math.max(1, x.s.world.r * scale) }))
        .sort((a, b) => a.d - b.d)[0];
      return `${c.label}: ${near ? `${near.d.toFixed(2)}r of ${near.label}` : '?'}`;
    });
    const s = t.session();
    return {
      scene: g.sceneKey.split(':')[0], status: s.status, x: Math.round(s.x * 100) / 100, beat: `${s.beatIndex}/${s.beats}`,
      pieces: shown('.callout--objective, .callout--threat'), people: shown('.callout--captain'), stations: shown('.callout--facility'),
      captains,
    };
  });
  const shot = async (name: string) => {
    await d.shot(name);
    d.note(`${name}: ${JSON.stringify(await describe())}`);
  };
  const inspector = async (name: string) => {
    const text = (await page.locator('.inspector').allInnerTexts()).join(' / ').replace(/\s*\n\s*/g, ' | ');
    d.note(`${name} inspector: ${text}`);
  };

  // ---- The galaxy and the round ----
  await page.waitForTimeout(1500);
  await d.settle();
  await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().click();
  await page.waitForTimeout(700);
  await page.locator('.chooser button', { hasText: 'Sprint 7' }).first().click();
  await scene('sprint:');
  await d.settle();
  await page.waitForTimeout(1500);
  await off();
  await shot('round-rest');
  await hover('Convoy Planning Pod');
  await shot('round-convoy-pointed');
  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().click();
  await off();
  await shot('round-convoy-selected');
  await inspector('round-convoy-selected');

  // ---- Convoy Planning Pod ----
  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().dblclick();
  await scene('pod:');
  await d.settle();
  await clearPick(); // drop the star's selection carried in from the round
  await shot('region-end');
  await seek(0.5);
  await off();
  await shot('region-mid');
  await d.dump('region-mid');

  // The empty homeworlds, each selected, with its inspector (A2).
  for (const who of ['Rook', 'Tove', 'Ulla']) {
    const key = await page.evaluate((w) => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === 'seat' && n.label.includes(w))?.canonicalKey ?? null, who);
    if (!key) { d.note(`homeworld ${who}: not on the chart`); continue; }
    await page.evaluate((k) => window.__starChartTest!.select(k), key);
    await page.waitForTimeout(500);
    await off();
    await shot(`homeworld-${who.toLowerCase()}-selected`);
    await inspector(`homeworld-${who.toLowerCase()}`);
  }
  await clearPick();

  // The busiest homeworld expanded.
  const seat = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    return g.nodes.filter((n) => n.kind === 'seat').map((n) => ({ label: n.label, rows: g.lists?.[n.projectionKey]?.rows.length ?? 0 })).sort((a, b) => b.rows - a.rows)[0]?.label ?? null;
  });
  if (seat) {
    await hover(seat, '--seat');
    await shot('homeworld-expanded');
  }
  await off();

  // A long-titled piece pointed at (A7).
  const long = await page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const drawn = new Set(window.__starChartTest!.displayed().map((x) => x.pk));
    return g.nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && drawn.has(n.projectionKey)).sort((a, b) => b.label.length - a.label.length)[0]?.projectionKey ?? null;
  });
  if (long && await pointAt(long)) await shot('piece-long-title');
  await off();

  // ---- Playback at 1× from the start, a still every 1.5 s ----
  await page.evaluate(() => { const t = window.__starChartTest!; t.setRate(1); t.setScheduleMs(0); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__starChartTest!.play());
  for (let i = 1; i <= 40; i++) {
    await page.waitForTimeout(1500);
    await shot(`playing-${String(i).padStart(2, '0')}`);
    if (await page.evaluate(() => window.__starChartTest!.session().status === 'ended')) break;
  }
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 90_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await shot('end');
  await d.dump('end');
}
