// Block D (22 D1–D7; run with --paradigm solar): the mandala. Fixture data only (INV-18).
// - meridian's Convoy Planning Pod and pod-sprint's Harbor Pod at the round's end and mid-sprint: the
//   whole region, then the three busiest planets close up (pieces on their half-discs, the trophy ring
//   toward the star, the captains on the far side, the name past them);
// - Convoy played at 1× from mid-sprint, a still every 600 ms: sorties parking on the loiter rings.
// Each still's note lists the planet's pieces by side and its captains' slots.
import type { Drive } from '../drive';

export default async function v12D(d: Drive): Promise<void> {
  const { page } = d;
  const off = async () => {
    const b = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(b.x + 4, b.y + b.height - 4);
    await page.waitForTimeout(400);
  };
  const scene = (prefix: string) => page.waitForFunction((p) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(p) === true, prefix, { timeout: 30_000 });
  const enter = async (galaxy: string, sprint: string, pod: string) => {
    await page.evaluate(() => window.__starChartTest!.select(null));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await page.locator('.callout--galaxy', { hasText: galaxy }).first().click();
    await page.waitForTimeout(500);
    await page.locator('.chooser button', { hasText: sprint }).first().click();
    await scene('sprint:');
    await d.settle();
    await page.locator('.callout', { hasText: pod }).first().dblclick();
    await scene('pod:');
    await d.settle();
    await off();
  };
  /** The planets with the most pieces now, busiest first. */
  const busiest = () => page.evaluate(() => {
    const g = window.__starChartTest!.viewGraph()!;
    const seats = g.nodes.filter((n) => n.kind === 'seat');
    const count = (pk: string) => g.lists?.[pk]?.rows?.length ?? 0;
    return seats.sort((a, b) => count(b.projectionKey) - count(a.projectionKey)).slice(0, 3).map((n) => ({ pk: n.projectionKey, label: n.label, x: n.world.x, y: n.world.y }));
  });
  const describe = (seatPk: string) => page.evaluate((pk) => {
    const g = window.__starChartTest!.viewGraph()!;
    const seat = g.nodes.find((n) => n.projectionKey === pk)!;
    const near = (n: { world: { x: number; y: number } }) => Math.hypot(n.world.x - seat.world.x, n.world.y - seat.world.y);
    const pieces = g.nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && near(n) < 2200);
    const onLeft = pieces.filter((n) => !n.platform && n.world.x < seat.world.x).map((n) => n.kind[0]).join('');
    const onRight = pieces.filter((n) => !n.platform && n.world.x >= seat.world.x).map((n) => n.kind[0]).join('');
    const trophies = pieces.filter((n) => n.platform).length;
    const ships = g.nodes.filter((n) => n.kind === 'captain' && n.attach?.to === pk).map((n) => `${n.label}@${n.attach?.loiter}`);
    return { planet: seat.label, left: onLeft, right: onRight, trophies, ships };
  }, seatPk);
  const closeUps = async (name: string) => {
    await d.shot(`${name}-region`);
    const cam = await page.evaluate(() => window.__starChartTest!.camera());
    for (const [i, p] of (await busiest()).entries()) {
      await page.evaluate((s) => window.__starChartTest!.setCamera(s), { x: p.x, y: p.y, scale: Math.max(0.32, cam.scale * 2.6) });
      await page.waitForTimeout(900);
      await d.shot(`${name}-planet${i + 1}`);
      d.note(`${name}-planet${i + 1}: ${JSON.stringify(await describe(p.pk))}`);
    }
    await page.evaluate((s) => window.__starChartTest!.setCamera(s), cam);
    await page.waitForTimeout(600);
  };

  await page.waitForTimeout(1500);
  for (const [galaxy, sprint, pod, tag] of [['Meridian Works', 'Sprint 7', 'Convoy Planning Pod', 'convoy'], ['Tidewater Array', 'Sprint 13', 'Harbor Pod', 'harbor']] as const) {
    await enter(galaxy, sprint, pod);
    await closeUps(`${tag}-end`);
    await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setScheduleMs(t.session().totalMs * 0.5); });
    await d.settle();
    await off();
    await closeUps(`${tag}-mid`);
  }
  // Sorties parking on the loiter rings: Harbor from mid-sprint at 1×.
  await page.evaluate(() => { const t = window.__starChartTest!; t.setRate(1); t.play(); });
  for (let i = 1; i <= 12; i++) {
    await page.waitForTimeout(600);
    await d.shot(`harbor-play-${String(i).padStart(2, '0')}`);
  }
  await page.evaluate(() => window.__starChartTest!.pause());
}
