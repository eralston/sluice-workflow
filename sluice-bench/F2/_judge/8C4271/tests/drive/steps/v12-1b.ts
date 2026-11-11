// Phase 1b (22 C10–C12; run with --paradigm solar): stations on two rings, arriving at first need, and
// four labels at once. Fixture data only (INV-18).
// - meridian's Convoy Planning Pod (12 planets) and Signals Pod, pod-sprint's Harbor Pod: each at rest at
//   the round's end (the rings), and at its start (only the stations needed from the opening).
// - Harbor Pod: the first beat where a station jumps in, played from just before at 1×, a still every
//   500 ms; then its first merge the same way (the piece, its author and reviewers named: up to four).
// Each still's note lists the stations drawn and the labels shown (pieces' plates, named captains).
import type { Drive } from '../drive';

export default async function v121b(d: Drive): Promise<void> {
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
    const shown = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity || '1') > 0.55)
      .map((e) => e.querySelector('.callout__title')?.textContent ?? '');
    const s = t.session();
    return {
      x: Math.round(s.x), beat: `${s.beatIndex}/${s.beats}`,
      stations: g.nodes.filter((n) => n.kind === 'facility').map((n) => n.label),
      pieces: shown('.callout--objective, .callout--threat'), named: shown('.callout--captain.is-acting'),
    };
  });
  const shot = async (name: string) => {
    await d.shot(name);
    d.note(`${name}: ${JSON.stringify(await describe())}`);
  };
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
    await page.evaluate(() => window.__starChartTest!.select(null));
    await off();
  };
  const atRest = async (name: string) => {
    await shot(`${name}-end`);
    await page.evaluate(() => window.__starChartTest!.setScheduleMs(0));
    await d.settle();
    await off();
    await shot(`${name}-start`);
  };

  await page.waitForTimeout(1500);
  await enter('Meridian Works', 'Sprint 7', 'Convoy Planning Pod');
  await atRest('convoy');
  await enter('Meridian Works', 'Sprint 7', 'Signals Pod');
  await atRest('signals');
  await enter('Tidewater Array', 'Sprint 13', 'Harbor Pod');
  await atRest('harbor');

  // Harbor: the beats where a station first appears, and where a station's merge count goes up.
  const marks = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const mg = (stage: string) => Number(/\|mg=(\d+)/.exec(stage)?.[1] ?? 0);
    let before = new Map<string, number>();
    let jump: number | null = null;
    let merge: number | null = null;
    for (const b of t.beatTimes()) {
      t.setScheduleMs(b.startMs + 1);
      await frame();
      const fac = t.viewGraph()!.nodes.filter((n) => n.kind === 'facility');
      if (jump === null && fac.some((n) => !before.has(n.projectionKey)) && b.index > 0) jump = b.startMs;
      if (merge === null && fac.some((n) => before.has(n.projectionKey) && mg(n.stage ?? '') > before.get(n.projectionKey)!)) merge = b.startMs;
      before = new Map(fac.map((n) => [n.projectionKey, mg(n.stage ?? '')]));
    }
    return { jump, merge };
  });
  d.note(`harbor marks: ${JSON.stringify(marks)}`);
  for (const [name, at] of [['jump', marks.jump], ['merge', marks.merge]] as const) {
    if (at === null) continue;
    await page.evaluate((ms) => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(Math.max(0, ms - 400)); }, at);
    await d.settle();
    await page.evaluate(() => window.__starChartTest!.play());
    for (let i = 1; i <= 16; i++) {
      await page.waitForTimeout(500);
      await shot(`harbor-${name}-${String(i).padStart(2, '0')}`);
    }
    await page.evaluate(() => window.__starChartTest!.pause());
  }
}
