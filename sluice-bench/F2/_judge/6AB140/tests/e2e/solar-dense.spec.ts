// The dense pod (22 Block A; A13's meridian-sprint, Convoy Planning Pod: 12 homeworlds), Block A's
// guards where the crowding is real:
// - A3, A5: the round's stars and the region's own are T4 Sky plates, their name over their counts.
// - A7: while playing, every holo plate's title is at most two lines, and none runs past its plate: the
//   text and its "…" keep the plate's side padding (the review saw titles clipped at both ends).
// - B5–B8, C10: in busy play, at most four labels show at once (piece plates and named captains), each
//   piece wearing its event's note, and History marks the same events *now*, in the same words.
// Fixture data only (INV-18).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { frames, launchApp, settle } from './launch';

let app: ElectronApplication;
let page: Page;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'meridian-sprint' }));
  await page.locator('.callout--galaxy', { hasText: 'Meridian Works' }).first().click();
  await page.locator('.chooser button', { hasText: 'Sprint 7' }).click();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
  await settle(page);
});
test.afterAll(async () => { await app?.close(); });

/** Into Convoy Planning Pod, unless already there (so each test can run alone, `-g`). */
async function toRegion(): Promise<void> {
  if (await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey.startsWith('pod:'))) return;
  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
}

/** Every shown holo plate's title that breaks the two-line rule or runs past its plate's padding. */
const titleProblems = () => page.evaluate(() => {
  const out: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>('.callout--holo')) {
    if (el.style.display === 'none' || el.offsetParent === null) continue;
    const t = el.querySelector<HTMLElement>(':scope > .callout__title, :scope > .callout__lines > .callout__title');
    if (!t || !t.textContent || t.getBoundingClientRect().width === 0) continue; // a captain's picture alone hides its title
    const lh = parseFloat(getComputedStyle(t).lineHeight);
    const lines = Math.round(t.getBoundingClientRect().height / lh);
    const plate = el.getBoundingClientRect();
    const box = t.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // A captain's picture sits flush at the plate's near end (19 L8): its title starts after the picture.
    const avatar = el.querySelector<HTMLElement>('.callout__avatar');
    const left = avatar ? avatar.getBoundingClientRect().right : plate.left + parseFloat(cs.paddingLeft);
    const right = plate.right - parseFloat(cs.paddingRight);
    if (lines > 2) out.push(`${t.textContent}: ${lines} lines`);
    if (t.scrollWidth > t.clientWidth + 1) out.push(`${t.textContent}: runs ${t.scrollWidth - t.clientWidth}px past its line`);
    if (box.left < left - 1 || box.right > right + 1) out.push(`${t.textContent}: outside its padding (${Math.round(box.left - left)}, ${Math.round(right - box.right)})`);
  }
  return out;
});

test('the round names each star and counts its work: T4 Sky, no path (22 A3, A5)', async () => {
  const convoy = page.locator('.callout--star', { hasText: 'Convoy Planning Pod' }).first();
  await expect(convoy).toHaveAttribute('data-holo-tier', 'sky');
  await expect(convoy.locator('.callout__meta')).toHaveText(/^\d+ User Stories · \d+ Bugs · star$/);
  await expect(page.locator('.callout--star .callout__meta', { hasText: 'Logistics' })).toHaveCount(0);
});

test('while playing, every title is two lines at most and stays inside its plate (22 A7)', async () => {
  await page.locator('.callout', { hasText: 'Convoy Planning Pod' }).first().dblclick();
  await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
  await settle(page);
  expect(await titleProblems()).toEqual([]);
  await page.evaluate(() => { const t = window.__starChartTest!; t.setRate(2); t.setScheduleMs(0); t.play(); });
  const seen = new Set<string>();
  let wrapped = 0;
  // 24 s at 2×: with named captains in the budget (22 C10) the first long title comes up at about 13 s.
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(400);
    for (const p of await titleProblems()) seen.add(p);
    wrapped = Math.max(wrapped, await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--holo > .callout__title')]
      .filter((t) => t.offsetParent !== null && t.getBoundingClientRect().height > parseFloat(getComputedStyle(t).lineHeight) * 1.5).length));
  }
  await page.evaluate(() => window.__starChartTest!.pause());
  expect([...seen]).toEqual([]);
  // The long titles did come up, on two lines (so the check above had something to check).
  expect(wrapped).toBeGreaterThan(0);
});

test('an empty homeworld says why it is there: what it held, and what became of it (22 A2)', async () => {
  await toRegion();
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs));
  await settle(page);
  const rook = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes.find((n) => n.kind === 'seat' && n.label.includes('Rook'))?.canonicalKey ?? null);
  expect(rook).not.toBeNull();
  await page.evaluate((k) => window.__starChartTest!.select(k), rook);
  await expect(page.locator('.inspector .seat-why')).toHaveText(/^Held #55181 · Parking permit lookup until .+, then moved out, now in Signals Pod\. Nothing held here now\.$/);
  await page.evaluate(() => window.__starChartTest!.select(null));
});

test('a ship or station arrives before its plate: no plate floats where its body isn\'t drawn yet (22 A8)', async () => {
  await toRegion();
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(0); });
  await settle(page);
  /** The ships and stations whose plate shows while their body is still mostly undrawn. */
  const floating = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const bodies = g.nodes.filter((n) => n.kind === 'captain' || n.kind === 'facility');
    const alpha = t.viewAlphas(bodies.map((n) => n.projectionKey));
    const plates = [...document.querySelectorAll<HTMLElement>('.callout--captain, .callout--facility')]
      .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity) > 0.3)
      .map((e) => e.querySelector('.callout__title')?.textContent ?? e.title);
    return bodies.filter((n) => (alpha[n.projectionKey] ?? 1) < 0.3 && plates.includes(n.label)).map((n) => n.label);
  });
  let hidden = 0;
  const seen = new Set<string>();
  await page.evaluate(() => window.__starChartTest!.play());
  // Play puts the bodies' entrances in place on the next frame, and the plates follow on the one after;
  // until they are drawn the plates are the seek's, and a sample taken before then (it was 60 ms of wall
  // time, which under load is before the first frame) sees plates with no bodies (23 F-leftovers).
  await frames(page, 3);
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(60);
    for (const f of await floating()) seen.add(f);
    hidden = Math.max(hidden, await page.evaluate(() => {
      const t = window.__starChartTest!;
      const ps = t.viewGraph()!.nodes.filter((n) => n.kind === 'captain').map((n) => n.projectionKey);
      return Object.values(t.viewAlphas(ps)).filter((a) => a < 0.3).length;
    }));
  }
  // And the other way (review): once in, a ship keeps its plate while it flies its work; only an
  // entrance holds a plate back. Sampled through the first beats, when many captains sortie.
  let shown = 0;
  let drawn = 0;
  let flying = 0;
  await page.evaluate(() => window.__starChartTest!.setRate(2));
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(100);
    const c = await page.evaluate(() => {
      const t = window.__starChartTest!;
      const ships = t.viewGraph()!.nodes.filter((n) => n.kind === 'captain');
      const alpha = t.viewAlphas(ships.map((n) => n.projectionKey));
      const on = new Set([...document.querySelectorAll<HTMLElement>('.callout--captain')].filter((e) => e.style.display !== 'none' && e.offsetParent !== null).map((e) => e.querySelector('.callout__title')?.textContent ?? ''));
      // A ship away from its place is flying (a sortie or a hold), not arriving: its view is fully drawn.
      const live = new Map(t.liveNodes().map((n) => [n.projectionKey, n.world]));
      const goal = new Map(t.targetNodes().map((n) => [n.projectionKey, n.world]));
      const away = (pk: string) => { const a = live.get(pk); const b = goal.get(pk); return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) > 30; };
      const there = ships.filter((n) => (alpha[n.projectionKey] ?? 0) >= 0.99);
      return { drawn: there.length, shown: there.filter((n) => on.has(n.label)).length, flying: there.filter((n) => away(n.projectionKey)).length };
    });
    drawn += c.drawn;
    shown += c.shown;
    flying += c.flying;
  }
  await page.evaluate(() => window.__starChartTest!.pause());
  expect([...seen]).toEqual([]);
  expect(hidden).toBeGreaterThan(0); // the opening did bring ships in, so there was something to check
  expect(flying).toBeGreaterThan(0); // ships did fly in the window, so there was something to check
  expect(shown / drawn).toBeGreaterThan(0.98); // with the old entrance test, flying ships lost theirs (0.95)
});

test('captains rest off the planets: no ship stands on a planet\'s face, at any playhead (22 A9)', async () => {
  const onPlanets = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const scale = t.camera().scale;
    const at = new Map(t.displayed().map((x) => [x.pk, x]));
    const out: string[] = [];
    for (const ship of g.nodes.filter((n) => n.kind === 'captain')) {
      const s = at.get(ship.projectionKey);
      if (!s) continue;
      for (const seat of g.nodes.filter((n) => n.kind === 'seat')) {
        const p = at.get(seat.projectionKey);
        if (p && Math.hypot(s.x - p.x, s.y - p.y) < seat.world.r * scale) out.push(`${ship.label} on ${seat.label}`);
      }
    }
    return out;
  });
  await toRegion();
  for (const share of [0.15, 0.4, 0.65, 1]) {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * x), share);
    await settle(page);
    await page.waitForTimeout(1500); // the ships glide to their places (τ 0.3 s)
    expect(await onPlanets(), `at ${share}`).toEqual([]);
  }
});

test('ships and stations point the way they travel (22: facing follows motion)', async () => {
  test.setTimeout(120_000);
  await toRegion();
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(2); t.setScheduleMs(0); });
  await settle(page);
  // A ship or station moving decisively sideways must face that way. Sampled in the page on drawn
  // frames, judged over steps of the chart's own clock (the playhead), and played until there is enough
  // travel to judge (or the round ends), not for a fixed time: a loaded machine draws fewer, longer
  // frames (its clock advances at most 100 ms a frame), so a fixed window (it was 160 samples 60 ms
  // apart) judged fewer moves the busier the machine, and a parallel run fell short of 20 (23 F5).
  const r = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const pks = g.nodes.filter((n) => n.kind === 'captain' || n.kind === 'facility').map((n) => n.projectionKey);
    /** The fully drawn ones' places (an entrance places a hidden ship before it shows, which isn't travel). */
    const sample = () => {
      const at = new Map(t.displayed().map((x) => [x.pk, x]));
      const alpha = t.viewAlphas(pks);
      return new Map(pks.flatMap((pk) => (at.get(pk) && (alpha[pk] ?? 0) >= 0.99 ? [[pk, { x: at.get(pk)!.x, y: at.get(pk)!.y }] as const] : [])));
    };
    const STEP_MS = 120; // a step of playhead: 60 ms of wall time at 2×, the old sampling interval
    const ENOUGH = 30; // decisive steps judged before it stops (more than the 20 asked for below)
    const wrong: string[] = [];
    let moving = 0;
    let last = sample();
    let lastX = t.session().x;
    t.play();
    const wallCap = performance.now() + 90_000; // only a stuck clock reaches this
    while (moving < ENOUGH && t.session().status === 'playing' && performance.now() < wallCap) {
      await new Promise((res) => requestAnimationFrame(res));
      const x = t.session().x;
      if (x - lastX < STEP_MS) continue;
      const now = sample();
      const f = t.facings(pks);
      for (const [pk, p] of now) {
        const q = last.get(pk);
        const face = f[pk];
        if (!q || face === undefined) continue;
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        // One step apart: 10 px sideways and clearly more than any vertical drift is decisive travel.
        if (Math.abs(dx) < 10 || Math.abs(dx) < 1.5 * Math.abs(dy) || Math.hypot(dx, dy) > 200) continue;
        moving++;
        // The heading may lag one sample behind the turn.
        if (Math.sign(dx) !== face) wrong.push(`${pk.slice(-12)} @${Math.round(x)}`);
      }
      last = now;
      lastX = x;
    }
    t.pause();
    return { moving, wrong: [...new Set(wrong)], reached: t.session().x, total: t.session().totalMs };
  });
  const { moving } = r;
  const wrong = new Set(r.wrong);
  console.log(`facing: ${moving} decisive steps judged, ${wrong.size} wrong, to playhead ${Math.round(r.reached)} of ${Math.round(r.total)} ms`);
  expect(moving).toBeGreaterThan(20); // there was travel to judge
  expect(wrong.size / moving).toBeLessThan(0.05);
});

test('a plate unfurls from its ship after a glance: hidden, then revealed from its object, nothing flying (22 A8)', async () => {
  await toRegion();
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(0); });
  await settle(page);
  await page.evaluate(() => window.__starChartTest!.play());
  await frames(page, 3); // the entrances and the plates' reply to them are drawn before the first sample (see the other 22 A8 test)
  type Row = { pk: string; at: number; drawn: boolean; shown: boolean; mask: string; scale: string; dash: boolean; moved: number };
  const rows: Row[] = [];
  const pos = new Map<string, string>();
  const t0 = Date.now();
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(25);
    const r = await page.evaluate(() => {
      const t = window.__starChartTest!;
      const ships = t.viewGraph()!.nodes.filter((n) => n.kind === 'captain');
      const alpha = t.viewAlphas(ships.map((n) => n.projectionKey));
      return ships.map((n) => {
        const el = [...document.querySelectorAll<HTMLElement>('.callout--captain')].find((e) => e.querySelector('.callout__title')?.textContent === n.label);
        const frame = el?.nextElementSibling as SVGElement | null; // its frame follows the plate in the DOM
        const outline = frame?.querySelector<SVGElement>('.holo__outline');
        return {
          pk: n.projectionKey, drawn: (alpha[n.projectionKey] ?? 0) >= 0.99, shown: !!el && el.style.display !== 'none',
          mask: el?.style.maskImage ?? '', scale: el?.style.scale ?? '', tf: el?.style.transform ?? '',
          dash: !!outline && outline.style.strokeDasharray !== '',
        };
      });
    });
    for (const s of r) {
      const moved = pos.has(s.pk) && pos.get(s.pk) !== s.tf && s.mask !== '' ? 1 : 0; // the plate's own place moved while unfurling
      pos.set(s.pk, s.tf);
      rows.push({ pk: s.pk, at: Date.now() - t0, drawn: s.drawn, shown: s.shown, mask: s.mask, scale: s.scale, dash: s.dash, moved });
    }
  }
  await page.evaluate(() => window.__starChartTest!.pause());
  // Never scaled (it unfurls, it doesn't grow), and the unfurl was seen: a mask and a tracing frame.
  expect(rows.every((r) => r.scale === '')).toBe(true);
  expect(rows.some((r) => r.mask !== '' && r.shown)).toBe(true);
  expect(rows.some((r) => r.dash)).toBe(true);
  // A plate is never shown before its ship is drawn, and not the instant it is: it waits out a glance.
  expect(rows.filter((r) => r.shown && !r.drawn)).toEqual([]);
  const glance: number[] = [];
  for (const pk of new Set(rows.map((r) => r.pk))) {
    const mine = rows.filter((r) => r.pk === pk);
    if (mine[0]!.drawn) continue; // already in when we began: no arrival to time
    const drawnAt = mine.find((r) => r.drawn)?.at;
    const shownAt = mine.find((r) => r.shown)?.at;
    if (drawnAt !== undefined && shownAt !== undefined) glance.push(shownAt - drawnAt);
  }
  expect(glance.length).toBeGreaterThan(0);
  expect(Math.min(...glance)).toBeGreaterThanOrEqual(350); // the object is seen first (450 ms, less a sample or two)
});

test('History and the scene explain the same events: at most four labels, each note its History row’s action (22 B5–B8, C10; 27 B1)', async () => {
  await toRegion();
  await page.mouse.move(2, 2); // nothing pointed at: only the play lights plates
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(2); t.setScheduleMs(0); });
  await settle(page);
  await page.evaluate(() => window.__starChartTest!.play());
  await expect(page.locator('#tab-history[aria-selected="true"]')).toHaveCount(1); // play opens History
  let samples = 0;
  let noted = 0;
  let agree = 0;
  let most = 0;
  let missing = 0;
  const wrong: string[] = [];
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(80);
    const s = await page.evaluate(() => {
      const a = window.__starChartTest!.annotations();
      const plates = [...document.querySelectorAll<HTMLElement>('.callout--objective, .callout--threat')]
        .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity || '1') > 0.55);
      // Each note shown names its event; History's row for that event, marked now, says the same.
      const notes = plates.flatMap((e) => { const n = e.querySelector<HTMLElement>('.holo__note'); return n ? [{ key: n.dataset.eventKey ?? '', text: n.textContent ?? '', cut: n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1 }] : []; });
      const rows = [...document.querySelectorAll<HTMLElement>('.history-row.is-now')];
      // Tiers (27 B1): playback raises its plates; the rest rest at T4 Sky (a plate whose rows are open is raised: expanded).
      const shownNow = (e: HTMLElement) => e.style.display !== 'none' && e.offsetParent !== null;
      const tiers: string[] = [];
      for (const e of document.querySelectorAll<HTMLElement>('.callout--holo')) {
        if (!shownNow(e)) continue;
        const t = e.dataset.holoTier;
        const acting = e.classList.contains('callout--captain') && e.classList.contains('is-acting');
        const name = e.querySelector('.callout__title')?.textContent ?? '?';
        if (acting) { if (t !== 'lead') tiers.push(`${name}: acting captain at ${t}`); }
        // A noted piece reads at T2 Door. The star wearing a sector sweep's note (27 E7a) keeps its own tier, T4 Sky (15 §6).
        else if (e.querySelector('.holo__note')) { if (t !== (e.matches('.callout--star') ? 'sky' : 'door')) tiers.push(`${name}: noted plate at ${t}`); }
        else if (e.matches('.callout--seat, .callout--star, .callout--facility, .callout--captain') && !e.classList.contains('is-expanded') && t !== 'sky') tiers.push(`${name}: at rest, ${t} (${e.className})`);
      }
      // Captains named while acting (22 B9) count in the same budget (22 C10).
      const acting = [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')]
        .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity || '1') > 0.55).length;
      return {
        plates: plates.length, acting, notes, tiers, lit: Object.values(a.lit).filter((x) => x > 0.55).length,
        scene: [...a.playing].sort().join('|'),
        history: rows.map((r) => r.dataset.eventKey ?? '').sort().join('|'),
        lines: Object.fromEntries(rows.map((r) => [r.dataset.eventKey ?? '', r.querySelector('.history-card__text')?.textContent ?? ''])),
      };
    });
    samples++;
    most = Math.max(most, s.plates + s.acting, s.lit + s.acting);
    for (const t of s.tiers) wrong.push(t);
    if (s.scene) noted++;
    if (s.scene === s.history) agree++;
    // A note is its own event's action (a PR's: the PR named, then its action), as its History row says.
    for (const n of s.notes) {
      if (n.cut) wrong.push(`${n.text}: cut short on its plate`); // a note is read whole (review: a PR's lost its action)
      const line = s.lines[n.key];
      const cut = n.text.lastIndexOf(' — ');
      const action = cut >= 0 ? n.text.slice(cut + 3) : n.text;
      const pr = /^PR (#\d+)/.exec(n.text)?.[1];
      if (!line) missing++; // History draws a frame after the plate: allowed now and then, below
      else if (!line.includes(`— ${action}`) || (pr && !line.startsWith(`PR · ${pr}`))) wrong.push(`${n.text} (${n.key}) ≠ ${line}`);
    }
  }
  await page.evaluate(() => window.__starChartTest!.pause());
  expect(noted).toBeGreaterThan(samples / 4); // the play did note events, so there was something to check
  expect(most).toBeLessThanOrEqual(4); // the attention budget (22 B7, C10): pieces' plates and named captains together
  expect(agree / samples).toBeGreaterThan(0.95); // History's *now* rows are the scene's noted events (a frame's lag aside)
  expect(wrong.slice(0, 5)).toEqual([]);
  expect(missing).toBeLessThan(samples * 0.05); // a note's row is *now* in History, a frame's lag aside
});

test('an acting captain’s plate unfurls to their name and part for the maneuver, then folds to the picture (22 B9)', async () => {
  await toRegion();
  await page.mouse.move(2, 2);
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(2); t.setScheduleMs(0); });
  await settle(page);
  await page.evaluate(() => window.__starChartTest!.play());
  let named = 0;
  let maxNamed = 0;
  let partial = 0;
  const wrong: string[] = [];
  const everNamed = new Set<string>();
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(80);
    const s = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--captain')]
      .filter((e) => e.style.display !== 'none' && e.offsetParent !== null)
      .map((e) => ({
        who: e.querySelector('.callout__title')?.textContent ?? '', tier: e.dataset.tier ?? '',
        shown: (e.querySelector<HTMLElement>('.callout__lines') ? getComputedStyle(e.querySelector<HTMLElement>('.callout__lines')!).display : '') !== 'none',
        note: e.querySelector<HTMLElement>('.holo__note')?.textContent ?? '', mask: e.style.maskImage !== '',
      })));
    const open = s.filter((c) => c.tier === 'title' && c.shown);
    named += open.length ? 1 : 0;
    maxNamed = Math.max(maxNamed, open.length);
    partial += s.some((c) => c.mask) ? 1 : 0;
    for (const c of open) { everNamed.add(c.who); if (!c.note) wrong.push(`${c.who}: named with no part`); }
  }
  await page.evaluate(() => window.__starChartTest!.pause());
  expect(named).toBeGreaterThan(20); // captains were named while their maneuvers played
  expect(everNamed.size).toBeGreaterThan(2);
  expect(partial).toBeGreaterThan(0); // and the plate was seen unfurling or folding
  expect(wrong.slice(0, 5)).toEqual([]);
  // After the play, every captain is back to the picture.
  await page.waitForTimeout(1500);
  await expect(page.locator('.callout--captain[data-tier="title"]:visible')).toHaveCount(0);
});

test('a captain’s turn: named once parked, held a second past the work, folded before leaving; plates hold their places (22 B9)', async () => {
  await toRegion();
  await page.mouse.move(2, 2);
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(1); t.setScheduleMs(t.session().totalMs * 0.2); });
  await settle(page);
  await page.evaluate(() => window.__starChartTest!.play());
  type Open = { from: number; to: number; moved: number; at: { x: number; y: number } | null };
  const episodes = new Map<string, Open[]>();
  const sides = new Map<string, { side: string; flips: number; shown: number }>();
  let overWork = 0;
  let opens = 0;
  let baseFac: Set<string> | null = null; // the stations on the board at the first sample
  const newFac = new Set<string>(); // stations that came in during the sample: each is at most one summon
  const t0 = Date.now();
  for (let i = 0; i < 420; i++) {
    await page.waitForTimeout(60);
    const s = await page.evaluate(() => {
      const t = window.__starChartTest!;
      const byTitle = new Map(t.viewGraph()!.nodes.filter((n) => n.kind === 'captain').map((n) => [n.label, n.projectionKey]));
      const scale = t.camera().scale;
      const shown = [...document.querySelectorAll<HTMLElement>('.callout--holo')].filter((e) => e.style.display !== 'none' && e.offsetParent !== null);
      const acting = shown.filter((e) => e.classList.contains('is-acting') && e.style.maskImage === '').map((e) => {
        const pk = byTitle.get(e.querySelector('.callout__title')?.textContent ?? '') ?? '';
        const drawn = t.displayed().find((x) => x.pk === pk); // where the ship is drawn, screen px (a sortie's offset in)
        const w = drawn ? { x: drawn.x / scale, y: drawn.y / scale } : undefined;
        const key = e.querySelector('.holo__note')?.getAttribute('data-event-key') ?? '';
        // Its work's plate (a piece plate noting the same event), and where the ship is drawn on screen.
        const work = [...shown].find((x) => !x.classList.contains('callout--captain') && x.querySelector('.holo__note')?.getAttribute('data-event-key') === key)?.getBoundingClientRect();
        const d = t.displayed().find((x) => x.pk === pk);
        const host = document.querySelector('.chart-host')!.getBoundingClientRect();
        const over = !!work && !!d && d.x + host.x > work.left && d.x + host.x < work.right && d.y + host.y > work.top && d.y + host.y < work.bottom;
        return { pk, at: w ? { x: w.x * scale, y: w.y * scale } : null, over };
      });
      const plates = shown.filter((e) => e.classList.contains('is-acting') || e.querySelector('.holo__note')).map((e) => ({ id: (e.querySelector('.callout__title')?.textContent ?? '') + (e.classList.contains('callout--captain') ? '|c' : '|p'), side: e.dataset.side ?? '' }));
      return { acting, plates, fac: t.viewGraph()!.nodes.filter((n) => n.kind === 'facility').map((n) => n.projectionKey) };
    });
    const now = Date.now() - t0;
    if (!baseFac) baseFac = new Set(s.fac);
    for (const k of s.fac) if (!baseFac.has(k)) newFac.add(k);
    for (const a of s.acting) {
      const list = episodes.get(a.pk) ?? [];
      const last = list.at(-1);
      if (last && now - last.to < 200) {
        last.to = now;
        if (last.at && a.at) last.moved = Math.max(last.moved, Math.hypot(a.at.x - last.at.x, a.at.y - last.at.y));
      } else list.push({ from: now, to: now, moved: 0, at: a.at });
      episodes.set(a.pk, list);
      if (a.over) overWork++;
      opens++;
    }
    for (const p of s.plates) {
      const was = sides.get(p.id);
      if (!was) sides.set(p.id, { side: p.side, flips: 0, shown: 1 });
      else { if (was.side !== p.side) was.flips++; was.side = p.side; was.shown++; }
    }
  }
  await page.evaluate(() => window.__starChartTest!.pause());
  const end = Date.now() - t0;
  // The opens seen whole: begun after the first sample, ended before the last.
  const seen = [...episodes.values()].flat().filter((e) => e.from > 100 && e.to < end - 300);
  // A summon (27 F2, `passes`) holds no turn: its ship flies on with its plate open for NOTE_MIN_MS (1.8 s), so it
  // moves while named. Any other plate travelling with its ship is a failure, and a summon's rides no longer than that.
  const riding = seen.filter((e) => e.moved >= 12);
  const whole = seen.filter((e) => e.moved < 12);
  expect(riding.length, 'plates riding with their ships: at most one per station that came in').toBeLessThanOrEqual(newFac.size);
  for (const e of riding) expect(e.to - e.from, 'a plate rides with its ship only for a summon, NOTE_MIN_MS').toBeLessThan(2200);
  expect(whole.length).toBeGreaterThan(2);
  // Whole (unfurled, not folding) at least CREW_OPEN_MIN_MS, 1.5 s at 1×, less the sampling step: the
  // animations count toward no minimum (22 B9, the user's second look).
  expect(Math.min(...whole.map((e) => e.to - e.from))).toBeGreaterThan(1400);
  // Parked while named: the ship doesn't travel with its plate open (a few screen px of drift at most).
  expect(Math.max(...whole.map((e) => e.moved))).toBeLessThan(12);
  // Not parked over its work's plate, and the noted plates hold their sides (no fighting).
  expect(overWork / Math.max(1, opens)).toBeLessThan(0.05);
  const flips = [...sides.values()].reduce((n, v) => n + v.flips, 0);
  const frames = [...sides.values()].reduce((n, v) => n + v.shown, 0);
  expect(flips / Math.max(1, frames)).toBeLessThan(0.02);
});

test('story time: a seek draws exactly what playing drew, through the day’s arcs (22 C2, INV-15)', async () => {
  await toRegion();
  await page.mouse.move(2, 2);
  /** Nodes whose drawn stage isn't the view graph's at the playhead. */
  const drift = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const shown = t.shownStages();
    return t.viewGraph()!.nodes.filter((n) => n.stage !== undefined && shown[n.projectionKey] !== n.stage)
      .map((n) => `${n.label}: shown ${shown[n.projectionKey]}, graph ${n.stage}`);
  });
  // Play beat by beat through a stretch of the sprint (each step plays its beat, then pauses), letting
  // every look land; the board then rests on the graph at x. (Paused mid-beat it shows the beat in flight.)
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setScheduleMs(t.session().totalMs * 0.3); });
  await settle(page);
  await page.locator('#tab-history').click();
  let moved = 0; // History rows story time moved, seen on the way: the stretch crosses an arc or a story's day
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.__starChartTest!.stepBeat());
    await expect.poll(drift, { timeout: 12_000 }).toEqual([]);
    moved += await page.locator('.history-row__real').count();
  }
  expect(moved).toBeGreaterThan(0);
  const x = await page.evaluate(() => window.__starChartTest!.session().x);
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(0));
  await settle(page);
  await page.evaluate((ms) => window.__starChartTest!.setScheduleMs(ms), x);
  await settle(page);
  expect(await drift()).toEqual([]); // sought: the same graph
});

test('a close glides to its platform: no closing piece jumps (22 C3, G-2)', async () => {
  await toRegion();
  await page.mouse.move(2, 2);
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(3); t.setScheduleMs(t.session().totalMs * 0.25); });
  await settle(page);
  // Every frame for 30 s of play at 3× from a quarter in, where each piece is drawn; a close is a piece whose stage
  // turns accomplished. Its fastest step, in screen px per 16.7 ms frame, is the glide's.
  const r = await page.evaluate(async () => {
    const t = window.__starChartTest!;
    const pieces = new Set(t.viewGraph()!.nodes.filter((n) => n.kind === 'objective' || n.kind === 'threat').map((n) => n.projectionKey));
    const before = t.shownStages();
    const last = new Map<string, { x: number; y: number; at: number }>();
    // World units at the scale the play starts on: the directed camera's pan and zoom (E9) aren't the piece moving.
    const s0 = t.camera().scale;
    const steps = new Map<string, { at: number; v: number }[]>();
    const closedAt = new Map<string, number>();
    t.play();
    const t0 = performance.now();
    while (performance.now() - t0 < 30_000) {
      await new Promise((res) => requestAnimationFrame(res));
      const now = performance.now();
      const stages = t.shownStages();
      for (const n of t.liveNodes()) {
        const d = { pk: n.projectionKey, x: n.world.x * s0, y: n.world.y * s0 };
        if (!pieces.has(d.pk)) continue;
        if (/\|accomplished\b/.test(stages[d.pk] ?? '') && !/\|accomplished\b/.test(before[d.pk] ?? '') && !closedAt.has(d.pk)) closedAt.set(d.pk, now);
        const was = last.get(d.pk);
        if (was && now > was.at) steps.set(d.pk, [...(steps.get(d.pk) ?? []), { at: now, v: (Math.hypot(d.x - was.x, d.y - was.y) * 16.7) / (now - was.at) }]);
        last.set(d.pk, { x: d.x, y: d.y, at: now });
      }
    }
    t.pause();
    // The close itself: from just before its look turns to 2.5 s after (the swap, the glide, the blossom);
    // its other moves (a montage reassign flies quicker) aren't the close.
    return { closes: [...closedAt].map(([pk, t]) => Math.max(0, ...(steps.get(pk) ?? []).filter((x) => x.at >= t - 200 && x.at <= t + 2500).map((x) => x.v))) };
  });
  expect(r.closes.length).toBeGreaterThan(2); // the play did close pieces
  // The glide's spring at its fastest moves a few px a frame; a jump to the platform was 22–74 px in one.
  expect(Math.max(...r.closes)).toBeLessThan(12);
});

test('guests come and go: in at their work, never flying out from a rest, gone when not needed; planet captains stay (22 C8)', async () => {
  await toRegion();
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setRate(2); t.setScheduleMs(0); });
  await settle(page);
  const s0 = await page.evaluate(() => window.__starChartTest!.camera().scale);
  /** The region's ships now: who, whether seated, how drawn, and where (world units at the starting scale), live and at rest. */
  const sample = () => page.evaluate((s0) => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const seated = new Set(g.nodes.filter((n) => n.kind === 'seat').map((n) => n.canonicalKey));
    const ships = g.nodes.filter((n) => n.kind === 'captain');
    const alpha = t.viewAlphas(ships.map((n) => n.projectionKey));
    const live = new Map(t.liveNodes().map((n) => [n.projectionKey, n.world]));
    const s = s0; // the scale at the start: the directed camera's zoom (E9) isn't a ship moving
    return {
      seated: [...seated],
      ships: ships.map((n) => ({ key: n.canonicalKey, guest: !seated.has(n.canonicalKey), alpha: alpha[n.projectionKey] ?? 0, x: (live.get(n.projectionKey)?.x ?? 0) * s, y: (live.get(n.projectionKey)?.y ?? 0) * s })),
      status: t.session().status,
    };
  }, s0);
  const first = await sample();
  await page.evaluate(() => window.__starChartTest!.play());
  const missing = new Set<string>(); // seated captains ever off the board
  /** Each arrival being watched: null until drawn, then its first drawn place and furthest move within 300 ms. */
  const watch = new Map<string, { x: number; y: number; at: number; far: number } | null>();
  const arrivals: { far: number }[] = [];
  let prev = new Set(first.ships.filter((x) => x.guest).map((x) => x.key));
  let left = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 40_000) {
    await page.waitForTimeout(50);
    const c = await sample();
    const now = Date.now();
    for (const k of c.seated) if (!c.ships.some((x) => x.key === k)) missing.add(k);
    const guests = c.ships.filter((x) => x.guest);
    for (const k of prev) {
      if (guests.some((x) => x.key === k)) continue;
      left++;
      const w = watch.get(k);
      if (w) arrivals.push(w);
      watch.delete(k); // if they come back, that's a new arrival
    }
    for (const x of guests) {
      if (!prev.has(x.key) && !watch.has(x.key)) watch.set(x.key, null);
      const w = watch.get(x.key);
      if (w === null && x.alpha >= 0.5) watch.set(x.key, { x: x.x, y: x.y, at: now, far: 0 });
      else if (w && now - w.at <= 300) w.far = Math.max(w.far, Math.hypot(x.x - w.x, x.y - w.y));
    }
    prev = new Set(guests.map((x) => x.key));
    if (c.status === 'ended') break;
  }
  await page.evaluate(() => window.__starChartTest!.pause());
  for (const w of watch.values()) if (w) arrivals.push(w);
  expect([...missing], 'a planet captain left the region').toEqual([]);
  expect(arrivals.length, 'no guest arrived in the play').toBeGreaterThan(0);
  // In at the work: the ship is first drawn where it parks (the jump's last slide is under ~60 px), not at
  // a rest it then flies out from (a sortie's out leg crosses hundreds of px in 300 ms at 2×).
  expect(Math.max(...arrivals.map((a) => a.far)), 'a guest flew out after arriving').toBeLessThan(90);
  expect(left, 'no guest ever left').toBeGreaterThan(0);
});

test('a seek while a guest waits to jump in draws it, as a seek to there would (22 C8 review, INV-15)', async () => {
  await toRegion();
  // The first beat after the opening where a guest ship is new and flies in (an approver's merge).
  await page.evaluate(() => window.__starChartTest!.pause());
  /** The guest ships (captains not seated) at a playhead, read once a seek there has drawn. */
  const guests = async (ms: number) => {
    await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
    await frames(page);
    return page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      const seated = new Set(g.nodes.filter((n) => n.kind === 'seat').map((n) => n.canonicalKey));
      return g.nodes.filter((n) => n.kind === 'captain' && !seated.has(n.canonicalKey)).map((n) => n.canonicalKey);
    });
  };
  let at: number | null = null;
  let before = new Set<string>();
  for (const b of await page.evaluate(() => window.__starChartTest!.beatTimes())) {
    const now = new Set(await guests(b.startMs + 1));
    if (b.index > 2 && [...now].some((k) => !before.has(k))) { at = b.startMs; break; }
    before = now;
  }
  expect(at).not.toBeNull();
  await page.evaluate((x) => { const t = window.__starChartTest!; t.setRate(1); t.setScheduleMs(x - 300); t.play(); }, at!);
  await page.waitForTimeout(600); // into the beat, before the guest's jump (its gather is later)
  await page.evaluate(() => { const t = window.__starChartTest!; t.pause(); t.setScheduleMs(t.session().x); });
  await settle(page);
  const hidden = await page.evaluate(() => {
    const t = window.__starChartTest!;
    const ships = t.viewGraph()!.nodes.filter((n) => n.kind === 'captain');
    const a = t.viewAlphas(ships.map((n) => n.projectionKey));
    return ships.filter((n) => (a[n.projectionKey] ?? 1) < 0.99).map((n) => n.label);
  });
  expect(hidden).toEqual([]);
});

test('the mandala: captains on their loiter slots, stories on the left half of a planet, bugs on the right (22 D1, D3)', async () => {
  await toRegion();
  const problems = () => page.evaluate(() => {
    const t = window.__starChartTest!;
    const nodes = t.targetNodes();
    const seats = new Map(nodes.filter((n) => n.kind === 'seat').map((n) => [n.projectionKey, n]));
    const out: string[] = [];
    let ships = 0;
    for (const s of nodes.filter((n) => n.kind === 'captain' && n.attach?.loiter !== undefined)) {
      const p = seats.get(s.attach!.to);
      if (!p?.loiterR) continue;
      ships++;
      const d = Math.hypot(s.world.x - p.world.x, s.world.y - p.world.y);
      if (Math.abs(d - p.loiterR) > 1) out.push(`${s.label}: ${d.toFixed(0)} from its planet, ring ${p.loiterR.toFixed(0)}`);
      // Slot 0 on the far side from the star (at the origin), the rest either side of it.
      const far = Math.atan2(p.world.y, p.world.x);
      const off = Math.atan2(Math.sin(Math.atan2(s.world.y - p.world.y, s.world.x - p.world.x) - far), Math.cos(Math.atan2(s.world.y - p.world.y, s.world.x - p.world.x) - far));
      const j = s.attach!.loiter!;
      const want = j === 0 ? 0 : j % 2 === 1 ? -1 : 1; // odd slots turn to the screen's left of the far side (a negative angle, y down)
      if (j === 0 ? Math.abs(off) > 1e-3 : Math.sign(off) !== Math.sign(want) && Math.abs(off) > 1e-3) out.push(`${s.label}: slot ${j} at ${off.toFixed(3)} rad off the far side`);
    }
    for (const n of nodes.filter((x) => (x.kind === 'objective' || x.kind === 'threat') && x.cluster)) {
      const seat = [...seats.values()].find((p) => n.cluster!.id.startsWith(`${p.canonicalKey}|`));
      if (!seat) continue;
      const left = n.world.x < seat.world.x;
      if (left !== (n.kind === 'objective')) out.push(`${n.kind} "${n.label}" on the ${left ? 'left' : 'right'} of its planet`);
    }
    return { out, ships };
  });
  for (const share of [0.2, 0.5, 0.8, 1]) {
    await page.evaluate((x) => { const t = window.__starChartTest!; t.pause(); t.setScheduleMs(t.session().totalMs * x); }, share);
    await settle(page);
    const r = await problems();
    expect(r.ships, `ships resting at ${share}`).toBeGreaterThan(3);
    expect(r.out, `at ${share}`).toEqual([]);
  }
});

test('a planet\'s name sits half over the planet\'s bottom edge, with no pointer, under every other label (22 D7)', async () => {
  await toRegion();
  await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs));
  await settle(page);
  const found = await page.evaluate(() => {
    const t = window.__starChartTest!;
    const scale = t.camera().scale;
    const out: { label: string; gap: number; off: number; z: string; open: boolean; leader: boolean }[] = [];
    for (const n of t.viewGraph()!.nodes.filter((m) => m.kind === 'seat')) {
      const el = [...document.querySelectorAll<HTMLElement>('.callout--seat')].find((e) => e.style.display !== 'none' && e.querySelector('.callout__title')?.textContent === n.label);
      if (!el) continue;
      const c = t.screenOf(n.canonicalKey)!;
      const box = el.getBoundingClientRect();
      const host = el.parentElement!.getBoundingClientRect();
      const frame = el.nextElementSibling as SVGElement | null;
      out.push({
        label: n.label,
        gap: Math.round(box.top - host.top - (c.y + n.world.r * scale) + box.height / 2), // its middle on the planet's rim
        off: Math.round(box.left - host.left + box.width / 2 - c.x),
        z: getComputedStyle(el).zIndex,
        open: el.classList.contains('is-expanded'),
        leader: !!frame?.querySelector('.holo__leader')?.getAttribute('points'),
      });
    }
    return out;
  });
  expect(found.length).toBeGreaterThan(0);
  for (const f of found) {
    expect(Math.abs(f.gap), `${f.label} has its middle on the planet's bottom edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(f.off), `${f.label} is centred under it`).toBeLessThanOrEqual(1);
    // The lowest label, until it is opened into its rows (then it lifts over the rest to be read).
    expect(f.z, `${f.label} is the lowest label`).toBe(f.open ? '3' : '-1');
    expect(f.leader, `${f.label} has no pointer`).toBe(false);
  }
});

// 27 D1: a Power link's crew (the author and approvers, one line through the station) names its members in
// plates that never overlap each other nor another member's ship; beside each ship, away from the line,
// when the line runs closer to vertical, above or below it when closer to horizontal. Halcyon's Quasar and Pulsar
// pods, where merges have crews. Fixture data only (INV-18).
test.describe('formation plates (27 D1)', () => {
  test.setTimeout(300_000);
  let fApp: ElectronApplication;
  let fPage: Page;
  // A fresh app per pod: Pulsar's renderer crashed once after Quasar's long run in the same window.
  test.beforeEach(async () => {
    ({ app: fApp, page: fPage } = await launchApp({ STAR_CHART_PARADIGM: '' }));
    await fPage.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await fPage.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(fPage);
  });
  test.afterEach(async () => { await fApp?.close(); });

  for (const pod of ['Quasar Pod', 'Pulsar Pod']) {
    test(`${pod}: through its merges no formation plate covers a plate or another member's ship, and plates stand away from the line`, async () => {
      await fPage.locator('.callout', { hasText: pod }).first().dblclick();
      await fPage.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
      await settle(fPage);
      await fPage.mouse.move(2, 2);
      // Every merge: a facility's merge count rises at a beat; its orientation is the station's against the star (powerLink.ts).
      const merges = await fPage.evaluate(async () => {
        const t = window.__starChartTest!;
        const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const mg = (stage: string) => Number(/\|mg=(\d+)/.exec(stage)?.[1] ?? 0);
        let before = new Map<string, number>();
        const out: { startMs: number; label: string; horizontal: boolean }[] = [];
        for (const b of t.beatTimes()) {
          t.setScheduleMs(b.startMs + 1);
          await frame();
          const g = t.viewGraph()!;
          const star = g.solar!.star;
          const fac = g.nodes.filter((n) => n.kind === 'facility');
          for (const n of fac) {
            const was = before.get(n.projectionKey);
            if (was !== undefined && mg(n.stage) > was) out.push({ startMs: b.startMs, label: n.label, horizontal: Math.abs((n.world.y - star.y) / 0.7) >= Math.abs(n.world.x - star.x) });
          }
          before = new Map(fac.map((n) => [n.projectionKey, mg(n.stage)]));
        }
        return out;
      });
      expect(merges.length, 'the pod has merges').toBeGreaterThan(0);
      let inAxis = 0, total = 0;
      const seen = { v: 0, h: 0 };
      for (const orient of ['v', 'h'] as const) {
        const tries = merges.filter((m) => m.horizontal === (orient === 'h')).slice(0, 4);
        for (const m of tries) {
          if (seen[orient] > 0) break;
          await fPage.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
          await fPage.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), m.startMs);
          await fPage.waitForTimeout(300);
          await fPage.evaluate(() => window.__starChartTest!.stepBeat());
          let formed = false;
          for (let i = 0; i < 140; i++) {
            await fPage.waitForTimeout(100);
            const s = await fPage.evaluate(() => {
              const t = window.__starChartTest!;
              const scale = t.camera().scale;
              const byLabel = new Map(t.viewGraph()!.nodes.filter((n) => n.kind === 'captain').map((n) => [n.label, n]));
              const pos = new Map(t.displayed().map((x) => [x.pk, x]));
              const host = document.querySelector('.chart-host')!.getBoundingClientRect();
              const plates = [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')]
                .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && e.style.opacity !== '0')
                .map((e) => {
                  const r = e.getBoundingClientRect();
                  const title = e.querySelector('.callout__title')?.textContent ?? '';
                  const n = byLabel.get(title);
                  const p = n ? pos.get(n.projectionKey) : undefined;
                  return { title, side: e.dataset.side ?? '', x0: r.left - host.x, y0: r.top - host.y, x1: r.right - host.x, y1: r.bottom - host.y, ship: p && n ? { x: p.x, y: p.y, r: n.world.r * scale } : null };
                });
              return plates;
            });
            if (s.length < 2) continue;
            formed = true;
            const ys = s.flatMap((p) => (p.ship ? [p.ship.y] : [])), xs = s.flatMap((p) => (p.ship ? [p.ship.x] : []));
            const vertical = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs);
            for (let a = 0; a < s.length; a++) for (let b = a + 1; b < s.length; b++) {
              const A = s[a]!, B = s[b]!;
              const ov = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 0 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0;
              expect(ov, `${A.title} and ${B.title} plates overlap at +${i * 100} ms`).toBe(false);
            }
            for (const p of s) for (const q of s) {
              if (p === q || !q.ship) continue;
              const nx = Math.max(p.x0, Math.min(q.ship.x, p.x1)), ny = Math.max(p.y0, Math.min(q.ship.y, p.y1));
              expect(Math.hypot(nx - q.ship.x, ny - q.ship.y) < q.ship.r, `${p.title}'s plate covers ${q.title}'s ship at +${i * 100} ms`).toBe(false);
            }
            for (const p of s) {
              total++;
              if (vertical ? p.side === 'left' || p.side === 'right' : p.side === 'above' || p.side === 'below') inAxis++;
            }
          }
          if (formed) seen[orient]++;
        }
        // Not every pod has both orientations; the formation is required of the first merge that shows one.
        if (merges.some((m) => m.horizontal === (orient === 'h'))) expect(seen[orient], `a ${orient === 'v' ? 'vertical' : 'horizontal'} merge shows a formation`).toBeGreaterThan(0);
      }
      expect(total, 'plates sampled').toBeGreaterThan(0);
      expect(inAxis / total, `${inAxis} of ${total} plates stand on the side their formation's axis asks`).toBeGreaterThanOrEqual(0.9);
      await fPage.keyboard.press('Escape');
      await settle(fPage);
    });
  }
});

// 27 D2: a Power link's crew forms on the board, so every member is on screen during its act at the two
// window sizes. Halcyon's Pulsar Pod (the busiest crews). Fixture data only (INV-18).
test.describe('formations stay on screen (27 D2)', () => {
  test.setTimeout(300_000);
  for (const [w, h] of [[1440, 900], [1024, 640]] as const) {
    test(`at ${w}×${h}: through Pulsar Pod's merges every crew member is inside the chart`, async () => {
      const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '' });
      try {
        await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
        await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
        await settle(page);
        await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
        await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
        await settle(page);
        await app.evaluate(({ BrowserWindow }, [cw, ch]) => BrowserWindow.getAllWindows()[0]!.setContentSize(cw, ch), [w, h] as const);
        await page.waitForTimeout(500);
        await settle(page);
        await page.mouse.move(2, 2);
        const merges = await page.evaluate(async () => {
          const t = window.__starChartTest!;
          const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const mg = (stage: string) => Number(/\|mg=(\d+)/.exec(stage)?.[1] ?? 0);
          let before = new Map<string, number>();
          const out: { startMs: number; horizontal: boolean }[] = [];
          for (const b of t.beatTimes()) {
            t.setScheduleMs(b.startMs + 1);
            await frame();
            const g = t.viewGraph()!;
            const star = g.solar!.star;
            const fac = g.nodes.filter((n) => n.kind === 'facility');
            for (const n of fac) {
              const was = before.get(n.projectionKey);
              if (was !== undefined && mg(n.stage) > was) out.push({ startMs: b.startMs, horizontal: Math.abs((n.world.y - star.y) / 0.7) >= Math.abs(n.world.x - star.x) });
            }
            before = new Map(fac.map((n) => [n.projectionKey, mg(n.stage)]));
          }
          return out;
        });
        expect(merges.length, 'the pod has merges').toBeGreaterThan(0);
        const tries = [...merges.filter((m) => m.horizontal).slice(0, 2), ...merges.filter((m) => !m.horizontal).slice(0, 2)];
        let sampled = 0, together = 0;
        for (const m of tries) {
          await page.evaluate(() => { const t = window.__starChartTest!; t.setReduced(false); t.setRate(1); });
          await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x - 1), m.startMs);
          await page.waitForTimeout(300);
          await page.evaluate(() => window.__starChartTest!.stepBeat());
          let most = 0;
          for (let i = 0; i < 36; i++) { // 9 s in 250 ms: the gather, the act, the echo and the disperse
            await page.waitForTimeout(250);
            const s = await page.evaluate(() => {
              const t = window.__starChartTest!;
              const byLabel = new Map(t.viewGraph()!.nodes.filter((n) => n.kind === 'captain').map((n) => [n.label, n]));
              const pos = new Map(t.displayed().map((x) => [x.pk, x]));
              const host = document.querySelector('.chart-host')!.getBoundingClientRect();
              return [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')]
                .filter((e) => e.style.display !== 'none' && e.offsetParent !== null && e.style.opacity !== '0')
                .flatMap((e) => {
                  const title = e.querySelector('.callout__title')?.textContent ?? '';
                  const n = byLabel.get(title);
                  const p = n ? pos.get(n.projectionKey) : undefined;
                  return p ? [{ title, x: p.x, y: p.y, w: host.width, h: host.height }] : [];
                });
            });
            most = Math.max(most, s.length);
            for (const p of s) {
              sampled++;
              expect(p.x >= 0 && p.x <= p.w && p.y >= 0 && p.y <= p.h, `${p.title} at (${Math.round(p.x)}, ${Math.round(p.y)}) is outside the ${p.w}×${p.h} chart at +${i * 250} ms`).toBe(true);
            }
          }
          if (most >= 2) together++;
        }
        expect(sampled, 'crew members sampled').toBeGreaterThan(0);
        expect(together, 'a merge showed two or more members at once').toBeGreaterThan(0);
      } finally {
        await app.close();
      }
    });
  }
});

// 27 E6 (M-31): a volley names each cause in turns. Every member merge's note shows (its event, History's
// words), at most four labels at once (plates and named captains together, P-6), and every drawn person its
// turns name is named. Halcyon's Pulsar Pod (four volleys, each a pair), a fresh app as in 27 D1. Fixture data only (INV-18).
test.describe('volleys name each cause (27 E6)', () => {
  test.setTimeout(300_000);
  test('Pulsar Pod: its first two volleys note every member, name every drawn person, and keep to four labels', async () => {
    const { app, page } = await launchApp({ STAR_CHART_PARADIGM: '' });
    try {
      await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
      await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
      await settle(page);
      await page.locator('.callout', { hasText: 'Pulsar Pod' }).first().dblclick();
      await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
      await settle(page);
      await page.mouse.move(2, 2); // nothing pointed at: only the play lights plates
      const volleys = await page.evaluate(() => window.__starChartTest!.volleys());
      expect(volleys.length, 'Pulsar has volleys').toBeGreaterThanOrEqual(2);
      for (const [n, v0] of volleys.slice(0, 2).entries()) {
        await page.evaluate((x) => { const t = window.__starChartTest!; t.pause(); t.setReduced(false); t.setRate(1); t.setScheduleMs(x - 1); }, v0.startMs);
        await settle(page);
        // People are counted against the captains drawn as it starts.
        const v = (await page.evaluate(() => window.__starChartTest!.volleys()))[n]!;
        // Sampled in the page every frame (no round trip per sample), so a busy machine cannot step over a turn.
        await page.evaluate(() => {
          type Rec = { noted: Set<string>; named: Set<string>; most: number; samples: number; on: boolean };
          const rec: Rec = { noted: new Set(), named: new Set(), most: 0, samples: 0, on: true };
          (window as unknown as { __e6: Rec }).__e6 = rec;
          const shown = (e: HTMLElement) => e.style.display !== 'none' && e.offsetParent !== null && Number(getComputedStyle(e).opacity || '1') > 0.55;
          const tick = () => {
            if (!rec.on) return;
            const plates = [...document.querySelectorAll<HTMLElement>('.callout--objective, .callout--threat')].filter(shown);
            const acting = [...document.querySelectorAll<HTMLElement>('.callout--captain.is-acting')].filter(shown);
            rec.samples++;
            rec.most = Math.max(rec.most, plates.length + acting.length);
            for (const e of plates) { const k = e.querySelector<HTMLElement>('.holo__note')?.dataset.eventKey; if (k) rec.noted.add(k); }
            for (const e of acting) rec.named.add(e.title || (e.querySelector('.callout__title')?.textContent ?? '?')); // its full label when the title is capped
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          window.__starChartTest!.play();
        });
        await page.waitForFunction((end) => window.__starChartTest!.session().x >= end, v.endMs, { timeout: 120_000, polling: 100 });
        const { noted, named, most, samples } = await page.evaluate(() => {
          const rec = (window as unknown as { __e6: { noted: Set<string>; named: Set<string>; most: number; samples: number; on: boolean } }).__e6;
          rec.on = false;
          return { noted: [...rec.noted], named: [...rec.named], most: rec.most, samples: rec.samples };
        }).then((r) => ({ ...r, noted: new Set(r.noted), named: new Set(r.named) }));
        await page.evaluate(() => window.__starChartTest!.pause());
        expect(samples, 'sampled the volley').toBeGreaterThan(10);
        expect(v.members.filter((k) => !noted.has(k)), `volley ${n}: every member's event shows on a note`).toEqual([]);
        expect(most, `volley ${n}: at most four labels at once`).toBeLessThanOrEqual(4);
        // Each drawn person the turns name is seen acting, by name (other maneuvers' crews in the fused beat don't count).
        expect(v.names, `volley ${n}: its turns name drawn people`).toHaveLength(v.people);
        expect(v.names.filter((x) => !named.has(x)), `volley ${n}: named ${[...named].join(', ')}; every one of its ${v.people} drawn people among them`).toEqual([]);
      }
    } finally {
      await app.close();
    }
  });
});
