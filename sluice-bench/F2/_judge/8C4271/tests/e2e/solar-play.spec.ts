// Solar playback (v1, 17 W4-T2, 14 §5 "Maneuvers"): on pod-sprint's Harbor Pod, the beat where a
// threat reaches Accomplished plays its strike run (13 §6, rule `threat.accomplish`: the grand gold
// flare as the hive ship breaks apart). Seeks back and forward from the middle of it leave no live
// commands, and every resting stage is the view graph's (INV-15). Under reduced motion nothing
// travels, the flare becomes a static ring, and the threat still lands at its new look (INV-20).
// Stations keep one spot over the round at one camera, however the playhead got there (INV-14).
// The hive ship, hover-only at rest, shows its title while the strike run casts it, in reduced motion
// too, and a seek clears it at once (19 L7). The frontier belt is drawn only while unassigned work is
// in it: it fades in as the first of them comes into view, and a seek or reduced motion snaps it (19 S2).
// Fixture data only (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { frames, launchApp, settle } from './launch';

let app: ElectronApplication;
let page: Page;

/** The beat where a threat climbs to Accomplished, with that threat's projection key and its stage there. */
interface StrikeBeat { index: number; startMs: number; pk: string; label: string; stage: string }

const seek = async (ms: number) => {
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
  await frames(page);
};
/** Seek to just before the beat, then step it: exactly that beat plays (as slice3b's stepInto). */
const stepInto = async (b: StrikeBeat) => {
  await seek(b.startMs - 1);
  await page.evaluate(() => window.__starChartTest!.stepBeat());
};
const census = () => page.evaluate(() => window.__starChartTest!.fxCensus());
/** The struck hive ship's own plate (19 L7: it shows only while a maneuver casts it, or pointed at). */
const ownPlate = () => page.locator('.callout--threat', { hasText: strike.label });
/** The pointer off every object, so only the cast shows a piece's plate. */
const pointerAway = async () => {
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height - 4);
};
const live = () => page.evaluate(() => window.__starChartTest!.liveCommands());

/** Nodes whose drawn stage isn't the view graph's: [] when the board rests exactly at the playhead. */
const stageDrift = () => page.evaluate(() => {
  const t = window.__starChartTest!;
  const shown = t.shownStages();
  return t.viewGraph()!.nodes.filter((n) => n.stage !== undefined && shown[n.projectionKey] !== n.stage)
    .map((n) => `${n.kind} "${n.label}": shown ${shown[n.projectionKey]}, graph ${n.stage}`);
});

/** Each drawn station's placed spot (the renderer's target, world units), by projection key. */
const stationSpots = () => page.evaluate(() => Object.fromEntries(window.__starChartTest!.targetNodes()
  .filter((n) => n.kind === 'facility').map((n) => [n.projectionKey, { x: n.world.x, y: n.world.y }])));
/** The stations drawn in both maps whose spots differ by more than a hundredth of a world unit. */
const moved = (a: Record<string, { x: number; y: number }>, b: Record<string, { x: number; y: number }>) =>
  Object.keys(a).filter((pk) => b[pk] && Math.hypot(a[pk]!.x - b[pk]!.x, a[pk]!.y - b[pk]!.y) > 0.01)
    .map((pk) => `${pk}: (${a[pk]!.x.toFixed(1)}, ${a[pk]!.y.toFixed(1)}) vs (${b[pk]!.x.toFixed(1)}, ${b[pk]!.y.toFixed(1)})`);

/** Walks the beats in order and returns the first one that takes a drawn threat to Accomplished. */
async function findStrikeBeat(): Promise<StrikeBeat> {
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  let before = new Map<string, string>();
  for (const b of beats) {
    await seek(b.startMs + 1);
    const threats = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes
      .filter((n) => n.kind === 'threat' && n.piece)
      .map((n) => ({ pk: n.projectionKey, label: n.label, rung: n.piece!.signal.rung, stage: n.stage ?? '' })));
    const hit = threats.find((t) => t.rung === 'accomplished' && before.has(t.pk) && before.get(t.pk) !== 'accomplished');
    if (hit) return { index: b.index, startMs: b.startMs, pk: hit.pk, label: hit.label, stage: hit.stage };
    before = new Map(threats.map((t) => [t.pk, t.rung]));
  }
  throw new Error('no beat takes a drawn threat to Accomplished');
}

let strike: StrikeBeat;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint' }));
  await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
  await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
  await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
  await page.evaluate(() => window.__starChartTest!.setActivity('lively'));
  strike = await findStrikeBeat();
});
test.afterAll(async () => { await app?.close(); });

test('the beat where a threat is defeated plays its strike run, then the board rests at the playhead', async () => {
  await pointerAway();
  await expect(ownPlate()).toBeHidden(); // hover-only at rest (19 L7)
  const started = (await census()).maneuvers;
  await stepInto(strike);
  // The strike run's land is the grand gold flare (only it and a landing raise one).
  await expect.poll(async () => (await census()).grand, { timeout: 10_000 }).toBeGreaterThan(0);
  expect((await census()).maneuvers).toBeGreaterThan(started);
  // The maneuver casts it, so its plate shows: its title alone, as every label in play.
  await expect(ownPlate()).toBeVisible();
  await expect(ownPlate()).toHaveAttribute('data-tier', 'title');
  await page.screenshot({ path: 'test-results/solar-play-1-strike-run.png' });
  // The hive ship's look lands at the maneuver's land: its ruin, as the graph says.
  await expect.poll(async () => (await page.evaluate(() => window.__starChartTest!.shownStages()))[strike.pk], { timeout: 10_000 }).toBe(strike.stage);
  await expect.poll(live, { timeout: 15_000 }).toBe(0);
  expect(await stageDrift()).toEqual([]);
  // A linger after the land, then it fades and the piece is hover-only again.
  await expect(ownPlate()).toBeHidden({ timeout: 10_000 });
});

test('a seek back or forward from the middle of the strike run leaves no live commands, and every stage at rest', async () => {
  for (const to of [() => strike.startMs - 5_000, () => strike.startMs + 60_000]) {
    await stepInto(strike);
    await expect.poll(async () => (await census()).grand, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(await live()).toBeGreaterThan(0); // mid-maneuver
    await expect(ownPlate()).toBeVisible();
    await seek(to());
    expect(await live()).toBe(0);
    await expect(ownPlate()).toBeHidden({ timeout: 100 }); // snapped away with the effects (INV-15)
    expect(await stageDrift()).toEqual([]);
    await settle(page);
  }
  // Forward past the beat the threat rests as its platform; back before it, at its earlier look.
  await seek(strike.startMs + 60_000);
  expect((await page.evaluate(() => window.__starChartTest!.shownStages()))[strike.pk]).toBe(strike.stage);
  await seek(strike.startMs - 5_000);
  expect((await page.evaluate(() => window.__starChartTest!.shownStages()))[strike.pk]).not.toBe(strike.stage);
});

test('reduced motion keeps the information: nothing travels, the flare is a static ring, and the threat still lands', async () => {
  await page.evaluate(() => window.__starChartTest!.setReduced(true));
  try {
    await stepInto(strike);
    await expect(ownPlate()).toBeVisible(); // its label needs no motion (19 L7)
    let rings = 0;
    for (let i = 0; i < 30; i++) {
      const c = await census();
      expect(c.moves + c.sparks + c.beams + c.guests, 'flights, sparks, beams or guests under reduced motion').toBe(0);
      expect(c.grand, 'a grand flare under reduced motion').toBe(0);
      rings = Math.max(rings, c.rings);
      await page.waitForTimeout(60);
    }
    expect(rings).toBeGreaterThan(0); // the static outline where the flare was
    await expect.poll(async () => (await page.evaluate(() => window.__starChartTest!.shownStages()))[strike.pk], { timeout: 10_000 }).toBe(strike.stage);
    await expect.poll(live, { timeout: 15_000 }).toBe(0);
    expect(await stageDrift()).toEqual([]);
    // The defeat is still told: the threat lingers in low orbit on its seat's lit edge, a platform (13 §3, v4).
    const platforms = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'threat' && n.platform).length);
    expect(platforms).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/solar-play-2-reduced.png' });
    await expect(ownPlate()).toBeHidden({ timeout: 10_000 }); // no fade: it just goes
  } finally {
    await page.evaluate(() => window.__starChartTest!.setReduced(false));
  }
});

test('stations keep one spot over the round, and playing then resting puts them where a seek to that time does', async () => {
  // One camera throughout: the screen pass reads the scale, so the spots compare at one scale.
  const cam = await page.evaluate(() => window.__starChartTest!.camera());
  const at = async (ms: number) => {
    await seek(ms);
    await page.evaluate((c) => window.__starChartTest!.setCamera(c), cam);
    await frames(page, 3);
    return stationSpots();
  };
  const total = (await page.evaluate(() => window.__starChartTest!.session())).totalMs;
  // Fixed over the round: a station drawn at two playheads stands in one spot at both, whichever
  // frontier pieces and other stations are drawn beside it.
  const samples = [];
  for (const f of [0.05, 0.25, 0.5, 0.75, 1]) samples.push(await at(Math.round(total * f)));
  const last = samples[samples.length - 1]!;
  expect(Object.keys(last).length, 'stations at the round\'s end').toBeGreaterThan(0);
  for (const s of samples) expect(moved(s, last)).toEqual([]);
  // Seek equals play: play through the strike run, rest, then seek to the same time.
  await at(strike.startMs - 1);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setRate(4); t.play(); });
  await page.waitForFunction((x) => window.__starChartTest!.session().x > x + 4_000, strike.startMs, { timeout: 20_000 });
  // Paused mid-round: maneuvers hold where they are, and the layout under them is the playhead's.
  await page.evaluate(() => window.__starChartTest!.pause());
  await page.evaluate((c) => window.__starChartTest!.setCamera(c), cam);
  await frames(page, 3);
  const played = await stationSpots();
  const x = (await page.evaluate(() => window.__starChartTest!.session())).x;
  expect(moved(played, await at(x))).toEqual([]);
  expect(moved(played, last)).toEqual([]);
});

test('the frontier belt shows only while unassigned work is in it: it fades in as the first piece comes, and a seek snaps it (19 S2)', async () => {
  const belt = () => page.evaluate(() => window.__starChartTest!.guides().solar ?? -1);
  // The first beat that brings unassigned work to the belt (Harbor Pod's first created pieces).
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  let first: (typeof beats)[number] | null = null;
  let none = false;
  for (const b of beats) {
    await seek(b.startMs + 1);
    const unassigned = await page.evaluate(() => window.__starChartTest!.viewGraph()!.solar!.unassigned.length);
    if (!unassigned) none = true;
    else if (none) { first = b; break; }
  }
  expect(first, 'a beat that brings the first unassigned work').not.toBeNull();
  // A seek snaps it either way (INV-15): not drawn before, fully drawn after.
  await seek(first!.startMs - 1);
  expect(await belt()).toBe(0);
  await seek(first!.startMs + 1);
  expect(await belt()).toBe(1);
  await page.screenshot({ path: 'test-results/solar-play-3-belt.png' });
  // Played into, it fades in as the first of its pieces comes into view (its radar contact, its rift),
  // not as the beat lands: sampled every frame with how drawn the belt's pieces are, the belt stays
  // hidden until one of them shows, passes between hidden and shown, and ends shown.
  await stepInto({ ...strike, startMs: first!.startMs });
  const samples = await page.evaluate(() => new Promise<{ belt: number; piece: number }[]>((done) => {
    const out: { belt: number; piece: number }[] = [];
    const t = window.__starChartTest!;
    const pks = t.viewGraph()!.solar!.unassigned;
    const t0 = performance.now();
    const tick = () => {
      out.push({ belt: t.guides().solar ?? -1, piece: Math.max(0, ...Object.values(t.viewAlphas(pks))) });
      if (performance.now() - t0 < 4000) requestAnimationFrame(tick);
      else done(out);
    };
    tick();
  }));
  const trace = samples.map((x) => `${x.belt.toFixed(2)}/${x.piece.toFixed(2)}`).join(' ');
  const firstPiece = samples.findIndex((x) => x.piece > 0);
  expect(firstPiece, `a frontier piece comes into view: ${trace}`).toBeGreaterThanOrEqual(0);
  expect(samples.slice(0, firstPiece).every((x) => x.belt === 0), `no belt before its first piece (belt/piece): ${trace}`).toBe(true);
  expect(samples.some((x) => x.belt > 0 && x.belt < 1), `a fade, not a cut: ${trace}`).toBe(true);
  expect(samples[samples.length - 1]!.belt).toBe(1);
  // Under reduced motion it simply is there.
  await page.evaluate(() => window.__starChartTest!.setReduced(true));
  try {
    await stepInto({ ...strike, startMs: first!.startMs });
    await frames(page, 2);
    expect(await belt()).toBe(1);
  } finally {
    await page.evaluate(() => window.__starChartTest!.setReduced(false));
  }
});

test('while playing no plate sits over a captain’s picture, and at the episode’s end no piece keeps a plate (19 review)', async () => {
  await pointerAway();
  await page.evaluate(() => { const t = window.__starChartTest!; t.setRate(4); t.setScheduleMs(t.session().totalMs * 0.6); t.play(); });
  // Sampled while it plays: every holo plate that isn't pointed at or selected stays off every picture.
  const overlaps: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(300);
    overlaps.push(...await page.evaluate(() => {
      const seen = (e: HTMLElement) => e.style.display !== 'none' && e.offsetParent !== null && getComputedStyle(e).opacity !== '0';
      const all = [...document.querySelectorAll<HTMLElement>('.callout.callout--holo')].filter(seen);
      const pictures = all.filter((e) => e.dataset.tier === 'picture').map((e) => e.getBoundingClientRect());
      const plates = all.filter((e) => e.dataset.tier !== 'picture' && !e.classList.contains('is-selected') && !e.classList.contains('is-hover'));
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      return plates.filter((p) => pictures.some((q) => hit(p.getBoundingClientRect(), q))).map((p) => p.querySelector('.callout__title')?.textContent ?? '?');
    }));
  }
  expect(overlaps, 'plates over a captain’s picture while playing').toEqual([]);
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 60_000 });
  // Past the last cast window's linger and fade: the History panel's light goes with the play (it once stayed).
  await page.waitForTimeout(2500);
  await expect(page.locator('.callout--objective:visible, .callout--threat:visible')).toHaveCount(0);
  // The same with the pointer resting on a homeworld's plate through the end: the light goes back to
  // the pointer's own object, so no piece keeps a plate (the closeout review found it stayed then).
  await page.evaluate(() => { const t = window.__starChartTest!; t.setScheduleMs(t.session().totalMs * 0.8); });
  await page.locator('.callout--seat:visible').first().hover();
  await page.evaluate(() => window.__starChartTest!.play());
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await expect(page.locator('.callout--objective:visible, .callout--threat:visible')).toHaveCount(0);
  await pointerAway();
});

test('the sector sweep\'s note counts the pieces drawn, 16 on Harbor, not the plan\'s 17 (27 E7a, R9)', async () => {
  // The plan's sweep names 17 subjects (20141 is created in another pod and isn't on this board at that beat);
  // the interpreter's noteSweep recounts what is drawn, so the star says 11 Stories + 5 Bugs.
  const beats = await page.evaluate(() => window.__starChartTest!.beatTimes());
  const sweepBeat = beats.find((b) => b.accented)!;
  await pointerAway();
  await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.pause(); });
  await seek(sweepBeat.startMs - 1);
  const before = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => n.projectionKey));
  await page.evaluate(() => window.__starChartTest!.stepBeat());
  let note = '';
  await expect.poll(async () => {
    const notes = await page.evaluate(() => Object.values(window.__starChartTest!.annotations().notes).map((n) => n.text.trim()));
    note = notes.find((t) => /created in Sprint 13/.test(t)) ?? '';
    return note;
  }, { timeout: 10_000, intervals: [100] }).not.toBe('');
  expect(note).toBe('11 User Stories · 5 Bugs created in Sprint 13');
  // R9: the numbers sum to the pieces this beat draws, which the board holds at its end and not before.
  await seek(sweepBeat.startMs + 60_000);
  const after = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => n.projectionKey));
  const drawn = after.filter((pk) => !before.includes(pk)).length;
  const sum = (note.match(/\d+/g) ?? []).slice(0, 2).reduce((a, x) => a + Number(x), 0);
  expect(sum).toBe(16);
  expect(drawn).toBeGreaterThanOrEqual(sum);
  await seek(0);
});
