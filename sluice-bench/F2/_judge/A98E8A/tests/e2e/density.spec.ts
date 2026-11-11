// Density harness (06 §2 relative scale). Opens the sparse and dense extremes from the fixture, takes
// screenshots, and writes a sizing report: every object's on-screen size in label units, hidden and
// overlapping labels, hit-area collisions, and how much of the viewport the scene uses. Only objective
// failures are asserted; the screenshots and report are for judging the aesthetics side by side.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { FORMATION_PITCH_PX } from '../../src/renderer/src/chart/scenes/placeFormation';
import { clickNode, enterNodeByKey, frames, keyOf, launchApp, settle } from './launch';

let app: ElectronApplication;
let page: Page;
const REPORT = 'test-results/density-report.json';
/** Written after every measurement, so a failure (and Playwright's worker restart) loses nothing. */
function record(name: string, m: unknown) {
  const all = existsSync(REPORT) ? JSON.parse(readFileSync(REPORT, 'utf8')) : {};
  all[name] = m;
  writeFileSync(REPORT, JSON.stringify(all, null, 2));
  writeFileSync('test-results/density-report.md', toMarkdown(all));
}

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
  await page.evaluate(() => window.__starChartTest!.freezeAmbient(4));
});
test.afterAll(async () => {
  await app.close();
});

interface SceneMetrics {
  scene: string;
  labelPx: number;
  labels: { total: number; hidden: number; clipped: number; overlaps: string[]; hiddenKinds: Record<string, number> };
  kinds: Record<string, { count: number; minLabels: number; medianLabels: number }>;
  hitOverlaps: string[];
  offscreen: string[];
  laneViolations: string[];
  viewportFill: number;
}

async function measure(name: string, p: Page = page): Promise<SceneMetrics> {
  await p.mouse.move(0, 0);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `test-results/density-${name}.png` });
  const m = await p.evaluate(() => {
    const t = window.__starChartTest!;
    const canvas = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
    const usableW = canvas.width - 400; // the side panel covers the right edge
    const usableH = canvas.height;
    const scale = t.camera().scale;
    const callouts = [...document.querySelectorAll<HTMLElement>('.callout')];
    const shown = callouts.filter((e) => e.style.display !== 'none');
    const labelPx = shown.length ? shown.map((e) => e.offsetHeight).sort((a, b) => a - b)[Math.floor(shown.length / 2)]! : 40;
    const rects = shown.map((e) => ({ text: e.querySelector('.callout__title')?.textContent ?? '', r: e.getBoundingClientRect(), under: e.classList.contains('callout--seat') && !e.classList.contains('is-expanded') }));
    const labelOverlaps: string[] = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      // A planet's name is the lowest label by design (22 D7): the others may cross it, so it isn't one of the overlaps.
      if (rects[i]!.under || rects[j]!.under) continue;
      const a = rects[i]!.r; const b = rects[j]!.r;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) labelOverlaps.push(`${rects[i]!.text} × ${rects[j]!.text}`);
    }
    // On-screen diameter of each object, in label heights (the UI's unit of size).
    const kinds: Record<string, number[]> = {};
    for (const n of t.liveNodes()) (kinds[n.kind] ??= []).push((2 * n.world.r * scale) / labelPx);
    const hits = t.hitCircles();
    const hitOverlaps: string[] = [];
    for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++) {
      const a = hits[i]!; const b = hits[j]!;
      // A piece, and a ship resting beside one, overlay their planet by design (13 §3, v4): those pairs are not overlaps.
      if ((a.kind === 'seat' && (b.kind === 'objective' || b.kind === 'threat' || b.kind === 'captain')) || (b.kind === 'seat' && (a.kind === 'objective' || a.kind === 'threat' || a.kind === 'captain'))) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) hitOverlaps.push(`${a.kind} "${a.label}" × ${b.kind} "${b.label}"`);
    }
    const offscreen = hits.filter((h) => h.x < 0 || h.y < 0 || h.x > usableW || h.y > usableH).map((h) => `${h.kind} "${h.label}"`);
    // How much of the usable viewport the scene's content spans (labels included).
    const boxes = [...hits.map((h) => ({ l: h.x - h.r, t: h.y - h.r, r: h.x + h.r, b: h.y + h.r })),
      ...rects.map(({ r }) => ({ l: r.left - canvas.left, t: r.top - canvas.top, r: r.right - canvas.left, b: r.bottom - canvas.top }))];
    const l = Math.min(...boxes.map((b) => b.l)); const tp = Math.min(...boxes.map((b) => b.t));
    const rr = Math.max(...boxes.map((b) => b.r)); const bb = Math.max(...boxes.map((b) => b.b));
    const viewportFill = ((Math.min(rr, usableW) - Math.max(l, 0)) * (Math.min(bb, usableH) - Math.max(tp, 0))) / (usableW * usableH);
    // PR lane (06 §3): in-flight vessels sit below every child and above every station.
    const live = t.liveNodes();
    const sceneKind = t.viewGraph()!.sceneKey.split(':')[0];
    const childKinds = sceneKind === 'body' ? ['missionPoint'] : ['planet', 'anomaly'];
    const childBottom = Math.max(-Infinity, ...live.filter((n) => childKinds.includes(n.kind) && n.selectable).map((n) => n.world.y));
    const stationTop = Math.min(Infinity, ...live.filter((n) => n.kind === 'station').map((n) => n.world.y));
    const laneViolations = sceneKind === 'feature' || sceneKind === 'body'
      ? live.filter((n) => n.kind === 'flight' && !(n.world.y > childBottom && n.world.y < stationTop)).map((n) => n.label)
      : [];
    return {
      laneViolations,
      scene: t.viewGraph()!.sceneKey.split(':')[0]!, labelPx,
      labels: {
        total: callouts.length, hidden: callouts.length - shown.length, overlaps: labelOverlaps,
        hiddenKinds: callouts.filter((e) => e.style.display === 'none').reduce((acc, e) => {
          const k = [...e.classList].find((c) => c.startsWith('callout--'))?.slice(9) ?? 'other';
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        clipped: rects.filter(({ r }) => r.left < canvas.left || r.right > canvas.left + usableW || r.top < canvas.top || r.bottom > canvas.bottom).length,
      },
      kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => {
        v.sort((a, b) => a - b);
        return [k, { count: v.length, minLabels: +v[0]!.toFixed(2), medianLabels: +v[Math.floor(v.length / 2)]!.toFixed(2) }];
      })),
      hitOverlaps, offscreen, viewportFill: +viewportFill.toFixed(2),
    };
  });
  record(name, m);
  return m;
}

/** Objective checks every density case must pass. */
function expectUsable(m: SceneMetrics) {
  // Soft: every scene is still measured and screenshotted when an earlier one has a problem.
  expect.soft(m.hitOverlaps, 'hit areas overlap').toEqual([]);
  expect.soft(m.labels.overlaps, 'labels overlap').toEqual([]);
  expect.soft(m.offscreen, 'objects outside the usable viewport').toEqual([]);
  expect.soft(m.laneViolations, 'PR vessels outside the lane between children and stations').toEqual([]);
  // The PR lane is sized in screen pixels, so every PR and station label always fits (06 §3).
  expect.soft(m.labels.hiddenKinds.flight ?? 0, 'hidden PR labels').toBe(0);
  expect.soft(m.labels.hiddenKinds.station ?? 0, 'hidden station labels').toBe(0);
  // Mechanical objects are at least about a label tall (06 §2); mission points in a system view are decorative.
  for (const kind of ['captain', 'flight', 'station'] as const) {
    if (m.kinds[kind]) expect.soft(m.kinds[kind]!.minLabels, `${kind} smaller than a label`).toBeGreaterThanOrEqual(0.95);
  }
  // Radar Task dots are half a label across, accomplished ones about 0.4 (06 §2, §3): the tally summarizes them.
  if (m.scene === 'body' && m.kinds.missionPoint) expect.soft(m.kinds.missionPoint.minLabels, 'radar dots smaller than 0.4 label').toBeGreaterThanOrEqual(0.38);
}

async function openLantern() {
  const t = await page.evaluate(() => window.__starChartTest!.stack().length);
  for (let i = 1; i < t; i++) { await page.locator('.back').click(); await settle(page); }
  await clickNode(page, await keyOf(page, 'galaxy', 'Nimbus Deck'));
  await page.locator('.chooser button', { hasText: 'Lantern Squad' }).click();
  await settle(page);
}

test('sparse extreme: one Story, one Task, one PR, one repo', async () => {
  await openLantern();
  expectUsable(await measure('0-sector'));
  await enterNodeByKey(page, await keyOf(page, 'star', 'Autopay enrollment'));
  expectUsable(await measure('1-sparse-system'));
  await enterNodeByKey(page, await keyOf(page, 'planet', 'Paperless opt-in'));
  expectUsable(await measure('2-sparse-body'));
});

test('dense extreme: 20 Stories and Bugs in one Feature system', async () => {
  await openLantern();
  await enterNodeByKey(page, await keyOf(page, 'star', 'Billing statement redesign'));
  expectUsable(await measure('3-dense-system'));
});

// Slice 1 accepted this as a known limit; the Task radar (slice 3a) fits it.
test('dense extreme close-up: one Story with 20 Tasks and five PRs to five repos', async () => {
  await openLantern();
  await enterNodeByKey(page, await keyOf(page, 'star', 'Billing statement redesign'));
  await enterNodeByKey(page, await keyOf(page, 'planet', 'Statement summary panel'));
  expectUsable(await measure('4-dense-body'));
});

// ---- The solar case (v1, 17 W4-T2, 14 §5): pod-sprint's Harbor Pod, Sprint 13 ----

/** What the solar board adds to the sizing report: the old free-cap backstop (`OLD_FREE_CAP`), formations, the frontier and the stations. */
interface SolarMetrics {
  scale: number;
  /** Free pieces past the old free-cap backstop (`OLD_FREE_CAP`) at one seat, per role (13 §3: the rest form up). */
  capViolations: string[];
  /**
   * Formation members whose hit is under 12 px though their neighbours leave room for it, or whose hits
   * overlap (22 Block D: the mandala keeps every slot exact, so a crowded planet at a far zoom has its
   * hits as large as their spacing allows, never spread).
   */
  formationIssues: string[];
  /** Pieces, formation members and stations whose hit reaches another seat's orbit line. */
  orbitCrossings: string[];
  /** A threat's ship (2r) over a captain's ship, or a station's hull (2r) over a captain's ship or a planet. */
  footprintOverlaps: string[];
  /** Frontier pieces, or the belt itself, outside the usable viewport. */
  frontierOut: string[];
  /** Stations whose hull covers the star, a planet, a piece or another station. */
  stationIssues: string[];
}

/**
 * A backstop from the old 3 + 3 crowding cap (`DomainPack.crowd`, removed in v1.3 F3): since v4 every
 * piece stands in its seat's region groups, so no seat should show free pieces past this.
 */
const OLD_FREE_CAP = 3;

async function solarMeasure(p: Page): Promise<SolarMetrics> {
  return p.evaluate(({ pitchPx, cap }) => {
    const t = window.__starChartTest!;
    const g = t.viewGraph()!;
    const solar = g.solar!;
    const scale = t.camera().scale;
    const live = t.liveNodes();
    const byPk = new Map(live.map((n) => [n.projectionKey, n]));
    const screen = new Map(t.displayed().map((d) => [d.pk, d]));
    const star = live.find((n) => n.kind === 'star')!;
    const starAt = screen.get(star.projectionKey)!;
    const toScreen = (x: number, y: number) => ({ x: starAt.x + (x - star.world.x) * scale, y: starAt.y + (y - star.world.y) * scale });
    const hits = t.hitCircles();
    const hitOf = new Map(hits.map((h) => [h.projectionKey, h]));
    const name = (n: { kind: string; label: string }) => `${n.kind} "${n.label}"`;
    const isPiece = (k: string) => k === 'objective' || k === 'threat';
    // The frontier belt, by its ellipses' ρ (x, and y unsquashed).
    const f = solar.frontier;
    const squash = f.rx0 > 0 ? f.ry0 / f.rx0 : 1;
    const rho = (x: number, y: number) => Math.hypot(x - solar.star.x, (y - solar.star.y) / squash);
    const inBelt = (n: { world: { x: number; y: number; r: number } }) => f.rx1 > f.rx0 && rho(n.world.x, n.world.y) >= f.rx0 - n.world.r && rho(n.world.x, n.world.y) <= f.rx1 + n.world.r;

    // The cap, read from the projection's own places (the plan's), which the screen pass never changes in count.
    const capViolations: string[] = [];
    const free = new Map<string, number>();
    for (const n of g.nodes) {
      if (!isPiece(n.kind) || n.cluster || inBelt(n)) continue;
      const seat = solar.seats.reduce((a, b) => (Math.hypot(b.x - n.world.x, b.y - n.world.y) < Math.hypot(a.x - n.world.x, a.y - n.world.y) ? b : a));
      const k = `${seat.person}|${n.kind}`;
      free.set(k, (free.get(k) ?? 0) + 1);
    }
    for (const [k, count] of free) if (count > cap) capViolations.push(`${k}: ${count} free`);

    // Formations as drawn: every member's hit 12 px, or as large as half the gap to its nearest
    // neighbour allows (the mandala's slots are exact, 22 D1), and no two members' hits overlapping.
    const formationIssues: string[] = [];
    const members = new Map<string, typeof live>();
    for (const n of live) if (n.cluster) members.set(n.cluster.id, [...(members.get(n.cluster.id) ?? []), n]);
    for (const [id, ms] of members) {
      for (const m of ms) {
        const h = hitOf.get(m.projectionKey);
        const here = screen.get(m.projectionKey);
        if (!h || !here) continue;
        const near = hits.filter((o) => o.projectionKey !== m.projectionKey).map((o) => ({ o, d: Math.hypot((screen.get(o.projectionKey)?.x ?? 1e9) - here.x, (screen.get(o.projectionKey)?.y ?? 1e9) - here.y) })).sort((a, b) => a.d - b.d)[0];
        const allowed = Math.min(12, near ? near.d / 2 - 0.5 : 12) - 0.01;
        if (h.r < allowed) {
          const nn = near ? byPk.get(near.o.projectionKey) : undefined;
          formationIssues.push(`${id} member "${m.label}" hit ${h.r.toFixed(1)} px (nearest: ${nn ? name(nn) : '?'} at ${near ? near.d.toFixed(1) : '?'} px)`);
        }
      }
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const a = screen.get(ms[i]!.projectionKey); const b = screen.get(ms[j]!.projectionKey);
        const ha = hitOf.get(ms[i]!.projectionKey); const hb = hitOf.get(ms[j]!.projectionKey);
        if (a && b && ha && hb && Math.hypot(a.x - b.x, a.y - b.y) < ha.r + hb.r - 0.5) formationIssues.push(`${id}: "${ms[i]!.label}" and "${ms[j]!.label}" hits overlap`);
      }
    }
    void pitchPx;

    // Orbit arcs (v2: each seat's orbit is a short arc through its planet), sampled finely, in screen px;
    // each seat's own arc is its home and is allowed.
    const orbits = solar.seats.map((s) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= 360; i++) {
        const a = s.angle - s.arc + (i / 360) * 2 * s.arc;
        pts.push(toScreen(solar.star.x + Math.cos(a) * s.rx, solar.star.y + Math.sin(a) * s.ry));
      }
      return { person: s.person, pts };
    });
    const seatName = (person: string) => g.nodes.find((n) => n.kind === 'seat' && n.canonicalKey === person)?.label ?? person;
    const nearestSeat = (x: number, y: number) => solar.seats.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)).person;
    const orbitCrossings: string[] = [];
    for (const n of live) {
      if (!(isPiece(n.kind) || n.kind === 'facility') || !n.selectable) continue;
      const h = hitOf.get(n.projectionKey);
      if (!h) continue;
      const proj = g.nodes.find((o) => o.projectionKey === n.projectionKey)!;
      const home = n.kind === 'facility' || inBelt(proj) ? null : n.cluster ? solar.formations.find((fm) => fm.id === n.cluster!.id)?.seat ?? null : nearestSeat(proj.world.x, proj.world.y);
      for (const o of orbits) {
        if (o.person === home) continue;
        const d = Math.min(...o.pts.map((q) => Math.hypot(q.x - h.x, q.y - h.y)));
        if (d < h.r) { orbitCrossings.push(`${name(n)}${n.cluster ? ' (formation)' : ''} on ${seatName(o.person)}'s orbit (${d.toFixed(1)} < ${h.r.toFixed(1)} px)`); break; }
      }
    }

    // Footprints: a threat's ship and a station's hull are 2r across, as drawn (r is the floored radius).
    const disc = (n: (typeof live)[number]) => { const s = screen.get(n.projectionKey); return s ? { ...s, r: n.world.r * scale } : null; };
    const footprintOverlaps: string[] = [];
    const hulls = live.filter((n) => n.selectable && (n.kind === 'threat' || n.kind === 'facility'));
    const others = live.filter((n) => n.selectable && (n.kind === 'captain' || n.kind === 'seat'));
    for (const a of hulls) for (const b of others) {
      if (a.kind === 'threat' && b.kind === 'seat') continue; // a threat overlays its planet by design (13 §3, v4)
      const da = disc(a); const db = disc(b);
      if (da && db && Math.hypot(da.x - db.x, da.y - db.y) < da.r + db.r) footprintOverlaps.push(`${name(a)} × ${name(b)}`);
    }

    // The frontier in view: its pieces' hits, and the belt's outer ellipse, inside the usable viewport.
    const canvas = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
    const usableW = canvas.width - 400;
    const frontierOut: string[] = [];
    for (const n of live) {
      const proj = g.nodes.find((o) => o.projectionKey === n.projectionKey);
      if (!proj || !isPiece(n.kind) || !inBelt(proj)) continue;
      const h = hitOf.get(n.projectionKey);
      if (h && (h.x - h.r < 0 || h.y - h.r < 0 || h.x + h.r > usableW || h.y + h.r > canvas.height)) frontierOut.push(name(n));
    }
    if (f.rx1 > f.rx0) {
      const c = toScreen(solar.star.x, solar.star.y);
      const [rx, ry] = [f.rx1 * scale, f.ry1 * scale];
      if (c.x - rx < 0 || c.x + rx > usableW || c.y - ry < 0 || c.y + ry > canvas.height) frontierOut.push(`belt ${Math.round(c.x - rx)}..${Math.round(c.x + rx)} × ${Math.round(c.y - ry)}..${Math.round(c.y + ry)} in ${Math.round(usableW)} × ${Math.round(canvas.height)}`);
    }

    // Stations clear: a hull over no other body's disc.
    const stationIssues: string[] = [];
    const bodies = live.filter((n) => n.selectable && (n.kind === 'star' || n.kind === 'seat' || isPiece(n.kind) || n.kind === 'facility'));
    for (const a of live.filter((n) => n.kind === 'facility')) for (const b of bodies) {
      if (a === b || (b.kind === 'facility' && b.projectionKey < a.projectionKey)) continue;
      const da = disc(a); const db = disc(b);
      if (da && db && Math.hypot(da.x - db.x, da.y - db.y) < da.r + db.r) stationIssues.push(`${name(a)} × ${name(b)}`);
    }
    void byPk;
    return { scale: +scale.toFixed(4), capViolations, formationIssues, orbitCrossings, footprintOverlaps, frontierOut, stationIssues };
  }, { pitchPx: FORMATION_PITCH_PX, cap: OLD_FREE_CAP });
}

/**
 * The solar board's objective checks. Orbit lines: at the smallest window the fit scale is a
 * fraction of the test window's, and where two orbits run level they are closer on screen than one
 * 32 px hit, so a piece or a one-member formation beside an outer seat can't clear its neighbour's
 * line. There the crossings are reported (density-report.md) for the review; formation members'
 * are asserted only where `orbits` is set. Stations and free pieces are always reported only: the
 * plan keeps them off every orbit in world units, and on screen the floors outgrow those gaps.
 */
function expectSolar(m: SolarMetrics, orbits: boolean) {
  expect.soft(m.capViolations, 'a piece outside its seat\'s region groups (there is no free cap in v4, 13 §3)').toEqual([]);
  expect.soft(m.formationIssues, 'formation members with hits smaller than their spacing allows, or overlapping').toEqual([]);
  if (orbits) expect.soft(m.orbitCrossings.filter((c) => c.includes('(formation)')), 'formation members over another seat’s orbit line').toEqual([]);
  expect.soft(m.footprintOverlaps, 'threat ships or station hulls over captains or planets').toEqual([]);
  expect.soft(m.frontierOut, 'frontier outside the view').toEqual([]);
  expect.soft(m.stationIssues, 'stations over other bodies').toEqual([]);
}

test.describe('solar: Harbor Pod on pod-sprint (v1)', () => {
  let solarApp: ElectronApplication;
  let sp: Page;
  test.beforeAll(async () => {
    ({ app: solarApp, page: sp } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint' }));
    await sp.evaluate(() => window.__starChartTest!.freezeAmbient(4));
    await sp.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
    await sp.locator('.chooser button', { hasText: 'Sprint 13' }).click();
    await sp.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('sprint:'), undefined, { timeout: 30_000 });
    await settle(sp);
    await sp.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
    await sp.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey.startsWith('pod:'), undefined, { timeout: 30_000 });
    await settle(sp);
  });
  test.afterAll(async () => { await solarApp?.close(); });

  const seek = async (f: number) => {
    await sp.evaluate((x) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * x), f);
    await frames(sp);
    await settle(sp);
  };
  const resize = async (w: number, h: number) => {
    await solarApp.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w, h), [w, h] as const);
    await sp.waitForTimeout(500); // the reflow, the refit, then a frame's layout
    await settle(sp);
  };

  // The board is fixed over the round (INV-14), but which slots are filled isn't: the round's end,
  // its middle (most pieces live), and its start, at the test window and at the smallest one (VC-3).
  for (const [w, h] of [[1440, 900], [1024, 640]] as const) {
    test(`at ${w}×${h}: every piece is in its seat's region, groups and stations keep clear, the frontier is in view`, async () => {
      await resize(w, h);
      for (const at of [1, 0.5, 0.05]) {
        await seek(at);
        const tag = `5-solar-${w}x${h}-${Math.round(at * 100)}`;
        const m = await measure(tag, sp);
        const s = await solarMeasure(sp);
        record(`${tag}-solar`, s);
        expectUsable(m);
        expectSolar(s, w >= 1440);
      }
    });
  }
});

function toMarkdown(r: Record<string, unknown>): string {
  const lines = ['# Density report', '', 'Sizes are on-screen diameters in label heights (the label is the unit of size, 06 §2).', ''];
  for (const [name, v] of Object.entries(r)) {
    if (v && typeof v === 'object' && 'capViolations' in v) {
      const s = v as SolarMetrics;
      lines.push(`## ${name} (solar board, scale ${s.scale})`, '');
      for (const [k, xs] of Object.entries(s)) if (Array.isArray(xs)) lines.push(`- ${k}: ${xs.length}${xs.length ? ` (${xs.slice(0, 6).join('; ')}${xs.length > 6 ? '; …' : ''})` : ''}`);
      lines.push('');
      continue;
    }
    const m = v as SceneMetrics;
    lines.push(`## ${name} (${m.scene})`, '', `- label height ${m.labelPx}px · labels ${m.labels.total - m.labels.hidden}/${m.labels.total} shown, ${m.labels.clipped} clipped, hidden ${JSON.stringify(m.labels.hiddenKinds)} · viewport fill ${m.viewportFill}`);
    lines.push(`- hit overlaps ${m.hitOverlaps.length}${m.hitOverlaps.length ? ` (${m.hitOverlaps.slice(0, 4).join('; ')})` : ''} · offscreen items ${m.offscreen.slice(0, 3).join('; ')} · label overlaps ${m.labels.overlaps.length} · offscreen ${m.offscreen.length} · off-lane vessels ${m.laneViolations.length}`, '', '| kind | count | min | median |', '|---|---|---|---|');
    for (const [k, s] of Object.entries(m.kinds)) lines.push(`| ${k} | ${s.count} | ${s.minLabels} | ${s.medianLabels} |`);
    lines.push('');
  }
  return lines.join('\n');
}
