// Stills for 19 S2 (fixture data only, INV-18): the frontier belt only when needed, never red. Harbor
// Pod's region: at the round's start, with nothing unassigned (no belt); the beat that brings the
// first unassigned pieces, stepped into (no belt until the first piece shows, then it fades in with
// them); a seek back (gone at once); the beat where a frontier piece is reassigned (the belt holds
// through the route, the piece flies); then All clear, the beat where the last open threat falls,
// through its sweep (hero blue, no red on the belt). Each shot notes the belt's presence (0..1). Run
// with --paradigm solar.
import type { Drive } from '../drive';

/** When the All clear stills start after the beat is stepped into, ms (`S2_CLEAR_FROM`). */
const ALL_CLEAR_FROM_MS = Number(process.env.S2_CLEAR_FROM ?? 3800);

export default async function v11S2(d: Drive): Promise<void> {
  const { page } = d;
  const t = () => page.evaluate(() => window.__starChartTest!.session());
  const belt = () => page.evaluate(() => window.__starChartTest!.guides().solar ?? -1);
  const shot = async (name: string) => {
    await d.shot(name);
    const c = await page.evaluate(() => window.__starChartTest!.fxCensus());
    d.note(`${name}: belt ${(await belt()).toFixed(2)}, unassigned ${await page.evaluate(() => window.__starChartTest!.viewGraph()?.solar?.unassigned.length)}, maneuvers ${c.maneuvers}, grand ${c.grand}, rings ${c.rings}, live ${await page.evaluate(() => window.__starChartTest!.liveCommands())}`);
  };
  const seek = async (ms: number) => {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
    await page.waitForTimeout(80);
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
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height - 4);

  // Each beat's unassigned count and open threats, read by seeking just past it.
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  const facts: { startMs: number; unassigned: number; open: number; frontier: string[] }[] = [];
  for (const b of beats) {
    await seek(b.startMs + 1);
    facts.push({ startMs: b.startMs, ...await page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      const pieces = g.nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && n.piece);
      return {
        unassigned: g.solar!.unassigned.length,
        open: pieces.filter((n) => n.kind === 'threat' && n.piece!.signal.rung !== 'accomplished' && n.piece!.signal.rung !== 'off').length,
        frontier: pieces.filter((n) => n.labelSide === 'below').map((n) => n.canonicalKey),
      };
    }) });
  }
  d.note(`beats: ${facts.map((f, i) => `${i}:${f.unassigned}/${f.open}`).join(' ')} (unassigned/open threats)`);

  // At the start, nothing unassigned: no belt.
  await seek(0);
  await page.waitForTimeout(400);
  await shot('start-no-belt');

  // The first unassigned work arrives: the belt fades in as its first piece comes into view.
  const first = facts.findIndex((f, i) => f.unassigned > 0 && (i === 0 || facts[i - 1]!.unassigned === 0));
  if (first >= 0) {
    await seek(facts[first]!.startMs - 1);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    await page.waitForTimeout(150);
    await shot('arrive-before-pieces');
    // The belt waits for the first of its pieces to come into view, then fades in with it.
    await page.waitForFunction(() => (window.__starChartTest!.guides().solar ?? 0) > 0, undefined, { timeout: 5000 });
    await page.waitForTimeout(200);
    await shot('arrive-fading-in');
    await page.waitForTimeout(1600);
    await shot('arrive-shown');
    await seek(facts[first]!.startMs - 1);
    await page.waitForTimeout(100);
    await shot('seek-back-gone');
  }

  // A frontier piece reassigned: the belt holds while the route inks, then the piece flies.
  const reseat = facts.findIndex((f, i) => i > 0 && facts[i - 1]!.frontier.some((k) => !f.frontier.includes(k)) && f.frontier.length < facts[i - 1]!.frontier.length);
  if (reseat >= 0) {
    await seek(facts[reseat]!.startMs - 1);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    for (const [i, ms] of [[1, 400], [2, 900], [3, 1200]] as const) {
      await page.waitForTimeout(ms);
      await shot(`reseat-${i}`);
    }
  }

  // All clear: the beat after which no threat is open.
  const clear = facts.findIndex((f, i) => i > 0 && f.open === 0 && facts[i - 1]!.open > 0);
  if (clear >= 0) {
    await seek(facts[clear]!.startMs - 1);
    await page.waitForTimeout(300);
    // First a timeline of the live commands every 100 ms (the strike run, then All clear), noted.
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    const live = await page.evaluate(() => new Promise<string>((done) => {
      const out: string[] = [];
      const id = setInterval(() => {
        const c = window.__starChartTest!.fxCensus();
        out.push(`${window.__starChartTest!.liveCommands()}/${c.maneuvers}`);
        if (out.length >= 90) { clearInterval(id); done(out.join(' ')); }
      }, 100);
    }));
    d.note(`all clear: live commands / maneuvers every 100 ms: ${live}`);
    // Then again, with stills through the strike run's end and All clear's sweep.
    await seek(facts[clear]!.startMs - 1);
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    await page.waitForTimeout(ALL_CLEAR_FROM_MS);
    for (let i = 0; i < 8; i++) {
      await shot(`all-clear-${i + 1}`);
      await page.waitForTimeout(150);
    }
    d.note(`all clear at schedule ${(await t()).x}`);
  }
}
