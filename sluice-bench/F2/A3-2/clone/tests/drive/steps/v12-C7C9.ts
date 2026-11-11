// Phase 4 (22 C7–C9; run with --paradigm solar): guests come and go, and the hand-off. Fixture data only
// (INV-18). In meridian's Convoy Planning Pod (12 planets):
// - the first beat a guest ship (no planet here) appears: it should drop out of hyperspace where it
//   parks, not warp in at a rest and fly over;
// - the first beat a guest leaves: it should warp out, not vanish;
// - the first reassign to a planet: the new holder's ship meets the piece at their planet (*Takes it*).
// Each played from just before at 1×, a still every 300 ms. Each still's note lists the guests drawn
// (with how drawn) and the captains named.
import type { Drive } from '../drive';

export default async function v12C7C9(d: Drive): Promise<void> {
  const { page } = d;
  const off = async () => {
    const b = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(b.x + 4, b.y + b.height - 4);
    await page.waitForTimeout(500);
  };
  const scene = (prefix: string) => page.waitForFunction((p) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(p) === true, prefix, { timeout: 30_000 });
  const describe = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const seated = new Set(g.nodes.filter((n) => n.kind === 'seat').map((n) => n.canonicalKey));
    const guests = g.nodes.filter((n) => n.kind === 'captain' && !seated.has(n.canonicalKey));
    const alpha = t.viewAlphas(guests.map((n) => n.projectionKey));
    const named = [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')]
      .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity || '1') > 0.55)
      .map((e) => `${e.querySelector('.callout__title')?.textContent ?? ''}${e.querySelector('.holo__note')?.textContent ? ` (${e.querySelector('.holo__note')!.textContent})` : ''}`);
    const s = t.session();
    return { x: Math.round(s.x), beat: `${s.beatIndex}/${s.beats}`, guests: guests.map((n) => `${n.label} ${Math.round((alpha[n.projectionKey] ?? 0) * 100)}%`), named };
  });
  const shot = async (name: string) => {
    await d.shot(name);
    d.note(`${name}: ${JSON.stringify(await describe())}`);
  };

  await page.waitForTimeout(1500);
  await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().click();
  await page.waitForTimeout(500);
  await page.locator('.chooser button', { hasText: 'Sprint 7' }).first().click();
  await scene('sprint:');
  await d.settle();
  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().dblclick();
  await scene('pod:');
  await d.settle();
  await page.evaluate(() => window.__starChartTest!.select(null));
  await off();

  // The beats where a guest first arrives, where one first leaves, and the first reassign to a planet.
  const marks = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const at = () => {
      const g = t.viewGraph()!;
      const seated = new Set(g.nodes.filter((n) => n.kind === 'seat').map((n) => n.canonicalKey));
      const guests = new Set(g.nodes.filter((n) => n.kind === 'captain' && !seated.has(n.canonicalKey)).map((n) => n.canonicalKey));
      const holder = new Map<string, string>();
      for (const n of g.nodes) if (n.kind === 'seat') for (const r of g.lists?.[n.projectionKey]?.rows ?? []) holder.set(r.key, n.canonicalKey);
      return { guests, holder };
    };
    let before = at();
    let arrive: number | null = null;
    let leave: number | null = null;
    let handOff: number | null = null;
    for (const b of t.beatTimes()) {
      t.setScheduleMs(b.startMs + 1);
      await frame();
      const now = at();
      if (arrive === null && [...now.guests].some((k) => !before.guests.has(k))) arrive = b.startMs;
      if (leave === null && [...before.guests].some((k) => !now.guests.has(k))) leave = b.startMs;
      if (handOff === null && [...now.holder].some(([k, h]) => before.holder.has(k) && before.holder.get(k) !== h)) handOff = b.startMs;
      before = now;
    }
    return { arrive, leave, handOff };
  });
  d.note(`convoy marks: ${JSON.stringify(marks)}`);
  for (const [name, ms] of [['arrive', marks.arrive], ['leave', marks.leave], ['handoff', marks.handOff]] as const) {
    if (ms === null) continue;
    await page.evaluate((x) => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(Math.max(0, x - 400)); }, ms);
    await d.settle();
    await off();
    await page.evaluate(() => window.__starChartTest!.play());
    for (let i = 1; i <= 12; i++) {
      await page.waitForTimeout(300);
      await shot(`convoy-${name}-${String(i).padStart(2, '0')}`);
    }
    await page.evaluate(() => window.__starChartTest!.pause());
  }
}
