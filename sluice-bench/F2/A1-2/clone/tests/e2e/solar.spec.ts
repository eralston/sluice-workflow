// The Solar chain (v1, 13 §2 and 14 §7): unpinned, the app opens in Solar, the paradigm switch is
// hidden, and the chart walks galaxy → round → region, with nothing below the region. Navigation part
// (17, W1-T5): the region draws through the solar layout (17, W2-T1). Navigation runs on
// sprint-mechanics (a round is a sprint, a region one of its pods). The play gate and the VC parts
// (17, W3-T1) run on pod-sprint: the round doesn't play, the region does, and a solar scene keeps
// VC-2, VC-3 and the label contrast, expanded plates' rows included (19 L2). The map key names only
// what Solar draws, in Solar's meanings, in the round and in a region (19 P2). On crm-quarter, a station
// quiet two days with nothing open is on standby (19 M1).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { SOLAR } from '../../src/shared/hierarchy/solar';
import { METEOR_REPOS } from '../../fixtures/scenarios/halcyon/cast';
import { enterNodeByKey, frames, launchApp, settle } from './launch';

const graph = (page: Page) => page.evaluate(() => window.__starChartTest!.viewGraph()!);
const sceneIs = (page: Page, level: string) => page.waitForFunction((l) => window.__starChartTest!.viewGraph()?.sceneKey.startsWith(`${l}:`), level, { timeout: 30_000 });
const paradigm = (page: Page) => page.evaluate(() => (JSON.parse(window.__starChartTest!.storeJson()) as { paradigm: string }).paradigm);

test.describe('Solar navigation in fixture mode', () => {
  test.describe.configure({ mode: 'serial' });
  let app: ElectronApplication;
  let page: Page;
  test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_PODS: 'mechanics', STAR_CHART_PARADIGM: '' })); });
  test.afterAll(async () => { await app?.close(); });

  test('unpinned, the app opens in Solar, with no paradigm switch', async () => {
    expect(await page.evaluate(() => window.starChart.paradigm.get())).toBe('solar');
    expect(await paradigm(page)).toBe('solar');
    expect((await graph(page)).sceneKey).toBe('galaxy');
    await expect(page.locator('.toggle--paradigm')).toHaveCount(0);
    // A round is a sprint: the project plate lists its sprints and pods, not Epics.
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().click();
    await expect(page.locator('.chooser button', { hasText: 'Sprint 41' })).toContainText('current');
    await expect(page.locator('.inspector__h3', { hasText: 'Pods' })).toBeVisible();
    await expect(page.locator('.inspector__h3', { hasText: 'Epics' })).toHaveCount(0);
  });

  test('galaxy → round → region; the round doesn’t play, and nothing opens below the region', async () => {
    await page.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
    await sceneIs(page, 'sprint');
    await settle(page);
    const round = await graph(page);
    const roundAt = SOLAR.resolve(round.sceneKey);
    expect(roundAt?.index).toBe(0);
    expect(roundAt?.def.playable).toBe(false);
    const stars = round.nodes.filter((n) => n.kind === 'star');
    expect(stars.map((n) => n.label)).toEqual(['Comet Pod', 'Nova Pod']);
    expect(stars.every((n) => n.zoomTo?.startsWith('pod:'))).toBe(true);

    await page.locator('.callout', { hasText: 'Comet Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    const region = await graph(page);
    const regionAt = SOLAR.resolve(region.sceneKey);
    expect(regionAt?.index).toBe(SOLAR.levels.length - 1);
    expect(regionAt?.def.layout).toBe('solar');
    expect(regionAt?.def.playable ?? true).toBe(true);
    expect((await page.evaluate(() => window.__starChartTest!.stack())).map((e) => e.sceneKey)).toEqual(['galaxy', round.sceneKey, region.sceneKey]);
    // The solar layout draws the pod's seats and its stories and bugs as pieces (17 W2-T1); none opens a scene.
    const bodies = region.nodes.filter((n) => (n.kind === 'seat' || n.kind === 'objective' || n.kind === 'threat') && n.selectable);
    expect(region.nodes.some((n) => n.kind === 'seat')).toBe(true);
    expect(bodies.length).toBeGreaterThan(0);
    expect(region.nodes.every((n) => n.zoomTo === undefined)).toBe(true);
    await enterNodeByKey(page, bodies[0]!.canonicalKey);
    expect((await graph(page)).sceneKey).toBe(region.sceneKey);
    await page.screenshot({ path: 'test-results/solar-1-region.png' });

    // Back up the chain: region → round → galaxy.
    await page.keyboard.press('Escape');
    await settle(page);
    await sceneIs(page, 'sprint');
    await page.keyboard.press('Escape');
    await settle(page);
    await page.waitForFunction(() => window.__starChartTest!.viewGraph()?.sceneKey === 'galaxy');
  });
});

/** Hit areas under 12 px, or overlapping (VC-3), in the scene on screen. */
async function hitProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hits = window.__starChartTest!.hitCircles();
    const out: string[] = [];
    // A piece's hit may be as small as half the gap to its nearest neighbour: the mandala keeps a crowded
    // planet's slots exact rather than spreading them (22 D1), so its hits are as large as they can be.
    const nearest = (h: (typeof hits)[number]) => Math.min(...hits.filter((o) => o !== h).map((o) => Math.hypot(o.x - h.x, o.y - h.y)));
    for (const h of hits) {
      const allowed = h.kind === 'objective' || h.kind === 'threat' ? Math.min(12, nearest(h) / 2 - 0.5) : 12;
      if (h.r < allowed - 0.01) out.push(`${h.kind} ${h.label} < 12px`);
    }
    for (let i = 0; i < hits.length; i++) {
      for (let j = i + 1; j < hits.length; j++) {
        const a = hits[i]!;
        const b = hits[j]!;
        // A piece, and a ship resting beside one, overlay their planet by design (13 §3, v4).
        if ((a.kind === 'seat' && (b.kind === 'objective' || b.kind === 'threat' || b.kind === 'captain')) || (b.kind === 'seat' && (a.kind === 'objective' || a.kind === 'threat' || a.kind === 'captain'))) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) out.push(`${a.kind} "${a.label}" overlaps ${b.kind} "${b.label}"`);
      }
    }
    return out;
  });
}

/** The worst text contrast over every callout's plate (as slice1's VC-2, over drawn text only), expanded plates' rows included. */
async function worstContrast(page: Page): Promise<{ ratio: number; rows: number; worst: string }> {
  // Read the plates as they rest, not mid-way through a lift's 120 ms background fade (a captain's plate
  // lifts with its planet's: 22 A9 rests the ship by it).
  await page.waitForFunction(() => document.getAnimations().every((a) => !((a.effect as KeyframeEffect | null)?.target as Element | null)?.classList?.contains('callout')));
  return page.evaluate(() => {
    const rgb = (s: string) => s.match(/\d+(\.\d+)?/g)!.map(Number);
    const lum = (c: number[]) => c.slice(0, 3).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
      .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    let worst = Infinity;
    let which = '';
    for (const el of document.querySelectorAll('.callout')) {
      const bg = rgb(getComputedStyle(el).backgroundColor);
      const a = bg[3] ?? 1;
      const over = [0, 1, 2].map((i) => bg[i]! * a + 255 * (1 - a)); // over pure white painting
      for (const textEl of el.querySelectorAll('.callout__title, .callout__meta')) {
        if (!textEl.getClientRects().length) continue; // not drawn (a compact label's hidden lines)
        const fg = rgb(getComputedStyle(textEl).color);
        const fa = fg[3] ?? 1;
        const text = [0, 1, 2].map((i) => fg[i]! * fa + over[i]! * (1 - fa));
        const [l1, l2] = [lum(text), lum(over)].sort((x, y) => y - x) as [number, number];
        const ratio = (l1 + 0.05) / (l2 + 0.05);
        if (ratio < worst) { worst = ratio; which = `${el.className} › ${textEl.className}: ${textEl.textContent?.slice(0, 40)}`; }
      }
    }
    return { ratio: worst, rows: document.querySelectorAll('.callout--holo .holo__row').length, worst: which };
  });
}

/** Moves the pointer onto a drawn node by its projection key. */
/** The map key's object rows: `* ` when that kind is here, then its two words. */
async function keyRows(page: Page): Promise<string[]> {
  return page.locator('.map-key__table tr').evaluateAll((trs) => trs.map((tr) => `${tr.classList.contains('is-here') ? '*' : ' '} ${[...tr.querySelectorAll('td')].slice(1).map((td) => td.textContent).join(' = ')}`));
}

async function pointAt(page: Page, pk: string): Promise<void> {
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const p = await page.evaluate((k) => window.__starChartTest!.displayed().find((d) => d.pk === k) ?? null, pk);
  if (!p) throw new Error(`${pk} isn't drawn`);
  await page.mouse.move(box.x + p.x, box.y + p.y);
}

test.describe('Solar play gate and VC in fixture mode (pod-sprint)', () => {
  test.describe.configure({ mode: 'serial' });
  let app: ElectronApplication;
  let page: Page;
  const session = () => page.evaluate(() => window.__starChartTest!.session());
  test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'pod-sprint' })); });
  test.afterAll(async () => { await app?.close(); });

  test('the galaxy’s plates are holo, rest at T4 Sky, rise to T2 Door pointed at, and keep 4.5:1 (19 L1, L3; 27 B1)', async () => {
    await settle(page);
    const plate = page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first();
    await expect(plate).toHaveClass(/callout--holo/);
    await expect(plate).toHaveAttribute('data-holo-tier', 'sky'); // every plate rests at T4 (27 B1)
    await expect(page.locator('.callout:not(.callout--holo)')).toHaveCount(0); // no navy plate in Solar (19 R1)
    // At rest it's in its Title state: the subtitle isn't drawn, whatever the class says (a CSS order bug once showed it).
    await expect(plate).toHaveClass(/is-compact/);
    await expect(plate.locator('.holo__meta')).toBeHidden();
    // Every galaxy's plate shows, and sits left of the side panel (19 review: one ran under it).
    const galaxies = (await graph(page)).nodes.filter((n) => n.kind === 'galaxy').length;
    await expect(page.locator('.callout--galaxy:visible')).toHaveCount(galaxies);
    const panelLeft = await page.locator('.sidepanel').evaluate((e) => e.getBoundingClientRect().left);
    for (const right of await page.locator('.callout--galaxy:visible').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))) {
      expect(right).toBeLessThanOrEqual(panelLeft);
    }
    const rest = await worstContrast(page);
    expect(rest.ratio, rest.worst).toBeGreaterThanOrEqual(4.5);
    // Pointed at, it lifts and shows its counts, without v0's "Project".
    await plate.hover();
    await expect(plate).toHaveAttribute('data-holo-tier', 'door');
    await expect(plate.locator('.callout__meta')).toHaveText(/^\d+ areas? · /);
    // On screen too: the count leads its word, though the head lays out right to left (19 P1).
    const order = await plate.locator('.holo__meta-head').evaluate((el) => {
      const text = el.firstChild!;
      const at = (i: number): number => {
        const r = document.createRange();
        r.setStart(text, i);
        r.setEnd(text, i + 1);
        return r.getBoundingClientRect().left;
      };
      return { count: at(0), word: at(text.textContent!.indexOf(' ') + 1) };
    });
    expect(order.count).toBeLessThan(order.word);
    const lifted = await worstContrast(page);
    expect(lifted.ratio, lifted.worst).toBeGreaterThanOrEqual(4.5);
  });

  test('the round doesn’t play: the player is a plate, and Space does nothing', async () => {
    await page.locator('.callout--galaxy', { hasText: 'Tidewater Array' }).first().click();
    await page.locator('.chooser button', { hasText: 'Sprint 13' }).click();
    await sceneIs(page, 'sprint');
    await settle(page);
    await expect(page.locator('.transport--gate')).toHaveText('Open an Area Path to play · solar system');
    // The round's pod stars are holo plates (19 L4), T4 Sky (22 A5, the quietest), and keep 4.5:1.
    const star = page.locator('.callout--star', { hasText: 'Harbor Pod' }).first();
    await expect(star).toHaveClass(/callout--holo/);
    await expect(star).toHaveAttribute('data-holo-tier', 'sky');
    await expect(page.locator('.callout:not(.callout--holo)')).toHaveCount(0); // no navy plate in Solar (19 R1)
    const round = await worstContrast(page);
    expect(round.ratio, round.worst).toBeGreaterThanOrEqual(4.5);
    // Its subtitle is its counts by role in ADO's words, then the chart's name, quieter, never its path
    // (22 A3, B1); each star previews its region: its seats' planets, an asteroid cluster and enemy
    // marks, all decorative. There is no Names toggle.
    await expect(star.locator('.callout__meta')).toHaveText('11 User Stories · 5 Bugs · star');
    await expect(star.locator('.holo__metaphor')).toHaveText(' · star');
    await expect(page.locator('.toggle[aria-label="Names"]')).toHaveCount(0);
    await expect(page.locator('.callout--star .callout__meta', { hasText: '\\' })).toHaveCount(0);
    const g = await graph(page);
    const preview = g.nodes.filter((n) => n.projectionKey.includes('|preview|'));
    expect(new Set(preview.map((n) => n.kind))).toEqual(new Set(['seat', 'objective', 'threat']));
    expect(preview.every((n) => !n.selectable && !n.labelled)).toBe(true);
    expect(g.nodes.some((n) => n.kind === 'planet' || n.kind === 'anomaly' || n.kind === 'facility' || n.kind === 'captain')).toBe(false);
    await expect(page.locator('.transport__play')).toHaveCount(0);
    const before = await session();
    expect(before.beats).toBeGreaterThan(0);
    await page.locator('.chart-host canvas').click({ position: { x: 5, y: 300 } }); // focus off any button
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    const after = await session();
    expect(after.status).toBe(before.status);
    expect(after.x).toBe(before.x);
  });

  test('the map key names only what Solar draws, in Solar\'s meanings; the round marks its previews\' kinds as here (19 P2)', async () => {
    await page.keyboard.press('k');
    const key = page.locator('.map-key');
    await expect(key).toBeVisible();
    expect(await keyRows(page)).toEqual([
      '  Sprint = Sprint sector', '  Project = Galaxy', '* Area Path = Star', '  Assigned person = Captain',
      '* Assigned person = Homeworld', '* User Story = Asteroid', '* Bug = Enemy ship', '  Repository = Station',
    ]);
    // A pod star's look reads its pod's work, not a Feature's state; the lines are Solar's.
    await expect(key.locator('.map-key__stages li').first()).toContainText('Area Path · ');
    await expect(key).toContainText('Frontier belt');
    for (const v0 of ['Feature', 'Planet', 'Anomaly', 'Supply station', 'Cargo flight', 'Area sector', 'Epic', 'Task']) await expect(key).not.toContainText(v0);
    await page.keyboard.press('k');
    await expect(key).toBeHidden();
  });

  test('the region plays its maneuvers, and a seek leaves no live commands', async () => {
    await page.locator('.callout', { hasText: 'Harbor Pod' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    await expect(page.locator('.callout:not(.callout--holo)')).toHaveCount(0); // no navy plate in Solar (19 R1)
    // The region's own star: T4 Sky, upright (above it, or below when a planet holds above), never beside
    // it, its name over its counts at rest (22 A3, A5), no path.
    await page.evaluate(() => window.__starChartTest!.select(null));
    const own = page.locator('.callout--star').first();
    await expect(own).toHaveAttribute('data-holo-tier', 'sky');
    // 27 B2: one line at rest, it stands above.
    await expect(own).toHaveAttribute('data-side', 'above');
    // No body's centre sits under the plate. (A hit circle is a 12 px interaction floor, larger than the drawn body, and the plate may graze it:
    // on Harbor a threat's circle is 16 px and its centre 11 px from the plate's edge; the note says so.)
    const covered = await page.evaluate(() => {
      const pl = document.querySelector('.callout--star')!.getBoundingClientRect();
      const c = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
      return window.__starChartTest!.hitCircles()
        .filter((h) => ['objective', 'threat', 'seat', 'captain', 'facility', 'station'].includes(h.kind))
        .filter((h) => { const x = c.left + h.x, y = c.top + h.y; return x >= pl.left && x <= pl.right && y >= pl.top && y <= pl.bottom; })
        .map((h) => `${h.kind} ${h.label}`);
    });
    expect(covered).toEqual([]);
    await expect(own.locator('.holo__meta')).toHaveText(/^\d+ User Stor(y|ies) · \d+ Bugs? · star$/);
    await expect(page.locator('.transport--gate')).toHaveCount(0);
    await expect(page.locator('.transport__play')).toHaveCount(1);
    await page.evaluate(() => { window.__starChartTest!.setRate(4); window.__starChartTest!.setScheduleMs(0); });
    await page.locator('.chart-host canvas').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('Space');
    await expect.poll(async () => (await session()).status).toBe('playing');
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.fxCensus().maneuvers), { timeout: 20_000 }).toBeGreaterThan(0);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await session()).status).toBe('paused');
    await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs));
    await frames(page);
    expect(await page.evaluate(() => window.__starChartTest!.liveCommands())).toBe(0);
    await settle(page);
  });

  test('VC-2 in a solar scene: every object on the chart is listed, and every hit is 12 px or more', async () => {
    await page.locator('#tab-inView').click(); // playing switched the panel to History
    const missing = await page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      const listed = new Set([...document.querySelectorAll<HTMLElement>('.object-list button')].map((b) => b.dataset.key));
      return g.nodes.filter((n) => n.selectable && !listed.has(n.canonicalKey)).map((n) => n.projectionKey);
    });
    expect(missing).toEqual([]);
    expect((await hitProblems(page)).filter((p) => p.endsWith('< 12px'))).toEqual([]);
  });

  test('VC-3 in a solar scene: no two hits overlap', async () => {
    // At the region's fit scale (~0.13) the board is spread in screen terms (W4-T2,
    // scenes/placeFormation.ts): free pieces on a screen-terms moon ring, formations past it, and
    // each station on the first clear spot. The density spec's solar case checks the smallest window.
    expect(await hitProblems(page)).toEqual([]);
  });

  test('a homeworld\'s plate expands in place: from its disc or its plate; a row lights and selects its object; contrast holds (19 L2, L5)', async () => {
    // A seat with a row whose object is drawn (a landed objective is listed but not drawn: no ring).
    const pick = () => page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      const drawn = new Set(g.nodes.map((n) => n.canonicalKey));
      for (const n of g.nodes) {
        const row = g.lists?.[n.projectionKey]?.rows.find((r) => drawn.has(r.key));
        if (n.kind === 'seat' && n.selectable && row) return { pk: n.projectionKey, label: n.label, row: row.key };
      }
      return null;
    });
    // Mid-round first, where seats hold live work; at the end most of it has landed.
    let seat: Awaited<ReturnType<typeof pick>> = null;
    for (const at of [0.5, 0.35, 0.65, 0.2, 0.8, 1]) {
      await page.evaluate((f) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * f), at);
      await settle(page);
      if ((seat = await pick())) break;
    }
    expect(seat).not.toBeNull();
    // At rest the homeworld's plate is T4 Sky, its title alone, no rows; expanded, it is T3 Place.
    const own = page.locator('.callout--seat', { hasText: seat!.label }).first();
    await expect(own).toHaveAttribute('data-holo-tier', 'sky');
    await expect(own.locator('.holo__row')).toHaveCount(0);
    // Pointing at the planet's disc expands that same plate: its rows grow under its title, in its frame.
    await pointAt(page, seat!.pk);
    const plate = page.locator('.callout--seat.is-expanded');
    await expect(plate).toHaveCount(1);
    await expect(plate.locator('.callout__title').first()).toHaveText(seat!.label);
    await expect(plate).toHaveAttribute('data-holo-tier', 'place');
    await expect(page.locator('.callout--mega')).toHaveCount(0); // the navy overlay is retired
    await expect(page.locator('.hover-ring')).toBeHidden();
    // Moving from the disc onto a row (within GRACE_MS) keeps it open, and lights the row's object.
    const row = plate.locator(`.holo__row[data-key="${seat!.row}"]`);
    await row.hover();
    await expect(row).toHaveClass(/is-lit/);
    await expect(page.locator('.hover-ring')).toBeVisible();
    const { ratio, rows, worst } = await worstContrast(page);
    expect(rows).toBeGreaterThan(0);
    expect(ratio, worst).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: 'test-results/solar-2-expanded-plate.png' });
    // Off it, it folds back to its title after the grace.
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await expect(page.locator('.callout--seat.is-expanded')).toHaveCount(0);
    await expect(page.locator('.hover-ring')).toBeHidden();
    // Hovering the plate itself expands it too; pressing a row selects that row's object.
    await own.hover();
    await expect(own).toHaveClass(/is-expanded/);
    await own.locator(`.holo__row[data-key="${seat!.row}"]`).click();
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.selected())).toBe(seat!.row);
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
  });

  test('pieces are hover-only: a seated one opens its planet\'s plate with its row lit, and marks it while selected; a frontier one shows its own T2 plate (19 L7)', async () => {
    // A seated piece drawn and listed by its seat, and a frontier piece (listed by no one), at one playhead.
    const pick = () => page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      // Drawn clear of the side panel and the player, so the pointer reaches the canvas there.
      const w = document.querySelector('.chart-host canvas')!.getBoundingClientRect().width;
      const drawn = new Set(window.__starChartTest!.displayed().filter((d) => d.x > 40 && d.x < w - 420 && d.y > 120).map((d) => d.pk));
      const hostOf = new Map<string, { pk: string; label: string }>();
      for (const n of g.nodes) if (n.kind === 'seat') for (const r of g.lists?.[n.projectionKey]?.rows ?? []) hostOf.set(r.key, { pk: n.projectionKey, label: n.label });
      const pieces = g.nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && drawn.has(n.projectionKey));
      const seated = pieces.find((n) => hostOf.has(n.canonicalKey));
      const frontier = pieces.find((n) => !hostOf.has(n.canonicalKey) && n.piece?.signal.rung !== 'off');
      return seated && frontier ? {
        seated: { pk: seated.projectionKey, key: seated.canonicalKey, kind: seated.kind, host: hostOf.get(seated.canonicalKey)! },
        frontier: { pk: frontier.projectionKey, key: frontier.canonicalKey, label: frontier.label, kind: frontier.kind },
      } : null;
    });
    // The last press revealed its object: back to the region's fit first ('0').
    await page.locator('.chart-host canvas').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('0');
    let at: Awaited<ReturnType<typeof pick>> = null;
    for (const f of [0.35, 0.5, 0.2, 0.65, 0.1, 0.8]) {
      await page.evaluate((x) => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * x), f);
      await settle(page);
      if ((at = await pick())) break;
    }
    expect(at).not.toBeNull();
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    const away = () => page.mouse.move(box.x + 4, box.y + box.height - 4);
    const piecePlates = page.locator('.callout--objective:visible, .callout--threat:visible');
    // A frontier piece has no planet: pointed at, it shows its own T2 plate, its title over its type, number and state.
    await away();
    await pointAt(page, at!.frontier.pk);
    const own = page.locator(`.callout--${at!.frontier.kind}:visible`);
    await expect(own).toHaveCount(1);
    await expect(own).toHaveAttribute('data-holo-tier', 'door');
    // Its frame, pointer and dot wear its role's colour (22 A6).
    const roles = await page.evaluate(() => [...document.querySelectorAll<SVGElement>('.holo')]
      .filter((f) => f.style.display !== 'none' && (f.dataset.holoRole ?? '') !== '').map((f) => f.dataset.holoRole));
    expect(roles).toContain(at!.frontier.kind);
    await expect(own.locator('.callout__title')).toHaveText(at!.frontier.label);
    await expect(own.locator('.callout__meta')).toHaveText(/^(User Story|Bug) · #\d+ · \S.* · (asteroid|enemy ship)$/);
    // Selected, it keeps its plate; no planet's plate opens for it, and no other piece has a plate at rest.
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.selected())).toBe(at!.frontier.key);
    await away();
    await page.waitForTimeout(700); // past the grace
    await expect(page.locator('.callout--seat.is-expanded')).toHaveCount(0);
    await expect(piecePlates).toHaveCount(1);
    await expect(piecePlates.first().locator('.callout__title')).toHaveText(at!.frontier.label);
    // Pointing at the seated piece opens its planet's plate, its own row lit; the piece's own plate stays hidden.
    await pointAt(page, at!.seated.pk);
    const host = page.locator('.callout--seat.is-expanded');
    await expect(host).toHaveCount(1);
    await expect(host.locator('.callout__title').first()).toHaveText(at!.seated.host.label);
    const row = host.locator(`.holo__row[data-key="${at!.seated.key}"]`);
    await expect(row).toHaveClass(/is-lit/);
    await expect(page.locator(`.callout--${at!.seated.kind}:visible`, { hasNotText: at!.frontier.label })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/solar-4-piece-hover.png' });
    // Selected, it keeps its planet's plate open with its row marked, after the pointer has gone.
    await page.mouse.down();
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.selected())).toBe(at!.seated.key);
    await away();
    await page.waitForTimeout(700);
    await expect(host).toHaveCount(1);
    await expect(row).toHaveClass(/is-selected/);
    await expect(row).not.toHaveClass(/is-lit/);
    await expect(piecePlates).toHaveCount(0);
    const { ratio, worst } = await worstContrast(page);
    expect(ratio, worst).toBeGreaterThanOrEqual(4.5);
  });

  test('a selected piece lists its steps in the inspector, in slot order, each with its state and rung mark (19 L7)', async () => {
    await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.5));
    await settle(page);
    const piece = await page.evaluate(() => window.__starChartTest!.viewGraph()!.nodes
      .filter((n) => (n.kind === 'objective' || n.kind === 'threat') && n.selectable && (n.stepKeys?.length ?? 0) > 0)
      .map((n) => ({ key: n.canonicalKey, label: n.label, steps: n.stepKeys!.length }))[0] ?? null);
    expect(piece).not.toBeNull();
    await page.locator('.object-list button', { hasText: piece!.label }).first().click();
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.selected())).toBe(piece!.key);
    const rows = page.locator('.inspector .steps li');
    await expect(rows).toHaveCount(piece!.steps);
    await expect(page.locator('.inspector .inspector__h3', { hasText: /^Tasks · augmentations$/ })).toHaveCount(1);
    for (const r of await rows.all()) {
      await expect(r).toHaveAttribute('data-rung', /^(ready|underway|nearing|accomplished|off)$/);
      await expect(r.locator('.steps__mark')).toHaveText(/^[○◔◕●⊘]$/);
      await expect(r.locator('.muted')).toHaveText(/\S/); // its raw state (INV-11)
    }
  });

  test('a dreadnought\'s plate expands into its PRs: from its hull or its plate; a PR\'s row lights every piece it serves, and a press selects the first (19 L6)', async () => {
    // ledger-sync's one PR (21008, opened late in week two) serves two pieces: at the round's end it's there, merged.
    await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs));
    // The last press revealed its object: back to the region's fit first ('0').
    await page.locator('.chart-host canvas').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('0');
    await settle(page);
    const station = await page.evaluate(() => {
      const g = window.__starChartTest!.viewGraph()!;
      const n = g.nodes.find((x) => x.kind === 'facility' && x.label === 'ledger-sync');
      const row = n ? g.lists?.[n.projectionKey]?.rows[0] : undefined;
      return n && row ? { pk: n.projectionKey, row: row.key, serves: row.serves ?? [] } : null;
    });
    expect(station).not.toBeNull();
    expect(station!.row).toMatch(/^pr:/);
    expect(station!.serves).toHaveLength(2);
    // The fit can leave the hull at the view's edge (under the status bar, the player or the side panel),
    // where the pointer doesn't reach the canvas: pan just far enough to bring it clear, so the pieces it
    // serves stay in view.
    await page.evaluate((pk) => {
      const t = window.__starChartTest!;
      const n = t.viewGraph()!.nodes.find((x) => x.projectionKey === pk)!;
      const p = t.screenOf(n.canonicalKey)!;
      const r = document.querySelector('.chart-host canvas')!.getBoundingClientRect();
      const into = (v: number, lo: number, hi: number) => (v < lo ? v - lo : v > hi ? v - hi : 0);
      const dx = into(p.x, 80, r.width - 460);
      const dy = into(p.y, 160, r.height - 200);
      const cam = t.camera();
      if (dx || dy) t.setCamera({ ...cam, x: cam.x + dx / cam.scale, y: cam.y + dy / cam.scale });
    }, station!.pk);
    await settle(page);
    // Point only once the hull is still: a pointer that doesn't move sends no new events, so a hull
    // still gliding into place under it never reads as hovered (the run under load showed it).
    await expect.poll(async () => {
      const at = () => page.evaluate((pk) => {
        const t = window.__starChartTest!;
        const p = t.screenOf(t.viewGraph()!.nodes.find((x) => x.projectionKey === pk)!.canonicalKey);
        return p ? `${Math.round(p.x)},${Math.round(p.y)}` : '';
      }, station!.pk);
      const a = await at();
      await page.waitForTimeout(150);
      return a !== '' && a === (await at());
    }).toBe(true);
    // Pointing at the hull expands its T1 plate: one row per PR, its number and status, the work it serves beneath. No Feature.
    await pointAt(page, station!.pk);
    const plate = page.locator('.callout--facility.is-expanded');
    await expect(plate).toHaveCount(1);
    await expect(plate.locator('.callout__title').first()).toHaveText('ledger-sync');
    const row = plate.locator(`.holo__row[data-key="${station!.row}"]`);
    await expect(row).toHaveCount(1);
    await expect(row.locator('.callout__title')).toHaveText('Roster and export ledger rows');
    await expect(row.locator('.callout__meta').first()).toHaveText('PR · #21008 · Completed · tender shuttle');
    await expect(row.locator('.holo__sub')).toHaveText('→ User Story #20112, Bug #20221');
    await expect(row.locator('.holo__link')).toHaveCount(0);
    // Its row lights both pieces: each gets a ring.
    await row.hover();
    await expect(row).toHaveClass(/is-lit/);
    await expect(page.locator('.hover-ring:visible')).toHaveCount(2);
    const { ratio, worst } = await worstContrast(page);
    expect(ratio, worst).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: 'test-results/solar-3-dreadnought-prs.png' });
    // Off it, it folds; hovering its plate expands it again, and a press on the row selects the first piece it serves.
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await expect(page.locator('.callout--facility.is-expanded')).toHaveCount(0);
    await expect(page.locator('.hover-ring:visible')).toHaveCount(0);
    const own = page.locator('.callout--facility', { hasText: 'ledger-sync' }).first();
    await own.hover();
    await expect(own).toHaveClass(/is-expanded/);
    await own.locator(`.holo__row[data-key="${station!.row}"]`).click();
    await expect.poll(() => page.evaluate(() => window.__starChartTest!.selected())).toBe(station!.serves[0]);
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
  });

  test('a captain\'s picture is a square: at rest it fills the plate\'s near end, flush, no ring; in play it is the picture alone, clipped, with its frame line (19 L8)', async () => {
    // The plates' squares, measured in the page: where the square sits in its plate, its shape, and the plate's frame.
    const squares = (tier: string) => page.evaluate((t) => [...document.querySelectorAll<HTMLElement>(`.callout--captain[data-tier="${t}"]`)]
      .filter((e) => e.style.display !== 'none' && e.offsetParent).map((e) => {
        const sq = e.querySelector<HTMLElement>('.callout__avatar')!;
        const css = getComputedStyle(sq);
        const frame = [...document.querySelectorAll<SVGSVGElement>('svg.holo')].find((f) => f.style.transform === e.style.transform && f.style.display !== 'none');
        return {
          plate: [e.offsetWidth, e.offsetHeight], square: [sq.offsetWidth, sq.offsetHeight], at: [sq.offsetLeft, sq.offsetTop],
          radius: css.borderRadius, ring: css.boxShadow, clip: e.style.clipPath, outline: !!frame?.querySelector('.holo__outline')?.getAttribute('d'),
          leader: frame?.querySelector('.holo__leader')?.getAttribute('points') ?? null,
        };
      }), tier);
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.locator('.chart-host canvas').click({ position: { x: 5, y: 300 } });
    await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs * 0.35));
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await settle(page);
    const rest = await squares('full');
    expect(rest.length).toBeGreaterThan(0);
    for (const s of rest) {
      expect(s.square[0]).toBe(s.square[1]); // square
      expect(s.square[1]).toBe(s.plate[1]); // the plate's full height
      expect(s.at).toEqual([0, 0]); // flush with the frame at the near end
      expect(s.radius).toBe('0px');
      expect(s.ring).toBe('none');
      expect(s.clip).toMatch(/^polygon/); // the plate's cut corners clip the square too
      expect(s.outline).toBe(true);
    }
    // In play each captain is the picture alone: the square, cut like a plate, with its frame line and no pointer.
    await page.evaluate(() => { const t = window.__starChartTest!; t.setScheduleMs(t.session().totalMs * 0.2); t.setRate(1); t.play(); });
    await expect.poll(async () => (await squares('picture')).length).toBeGreaterThan(0);
    const play = await squares('picture');
    await page.evaluate(() => window.__starChartTest!.pause());
    for (const s of play) {
      expect(s.square[0]).toBe(s.square[1]);
      expect(s.plate).toEqual(s.square);
      expect(s.radius).toBe('0px');
      expect(s.ring).toBe('none');
      expect(s.clip).toMatch(/^polygon/);
      expect(s.outline).toBe(true);
      expect(s.leader).toBe('');
    }
  });

  test('in a region the key marks what is here, and a person pressed as their captain reads as both forms (19 P2)', async () => {
    await page.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs));
    const box = (await page.locator('.chart-host canvas').boundingBox())!;
    await page.mouse.move(box.x + 4, box.y + box.height - 4);
    await settle(page);
    await page.keyboard.press('k');
    expect((await keyRows(page)).filter((r) => r.startsWith('*'))).toEqual([
      '* Area Path = Star', '* Assigned person = Captain', '* Assigned person = Homeworld', '* User Story = Asteroid', '* Bug = Enemy ship', '* Repository = Station',
    ]);
    await page.keyboard.press('k');
    const g = await graph(page);
    const seats = new Set(g.nodes.filter((n) => n.kind === 'seat').map((n) => n.canonicalKey));
    // A seated person's ship, pressed on the chart (one that no piece in front of it takes the press from).
    let pressed = false;
    for (const ship of g.nodes.filter((n) => n.kind === 'captain' && seats.has(n.canonicalKey))) {
      await pointAt(page, ship.projectionKey);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(150);
      if ((pressed = (await page.evaluate(() => window.__starChartTest!.selected())) === ship.canonicalKey)) break;
    }
    expect(pressed).toBe(true);
    await expect(page.locator('.inspector__kind')).toHaveText('Assigned person · captain and homeworld');
    await page.locator('#tab-inView').click(); // playing switched the panel to History
    await expect(page.locator('.object-list__group-head').first()).toContainText('Area Path · star');
  });
});

test.describe('A station on standby in fixture mode (crm-quarter, 19 M1)', () => {
  let app: ElectronApplication;
  let page: Page;
  test.beforeAll(async () => { ({ app, page } = await launchApp({ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'crm-quarter' })); });
  test.afterAll(async () => { await app?.close(); });

  test('a station with nothing open, quiet two days, is on standby: dimmed, its plate at T3, lifted when pointed at; a busy one is not', async () => {
    // A CRM region has no beats of its own, so it shows its round's end (1 Oct): Birchwood Mills' and
    // Osprey Freight's last quotes settled weeks before, and Quillon Dairy's is still out.
    await page.locator('.callout--galaxy', { hasText: 'Larch & Pine Trading' }).first().click();
    await page.locator('.chooser button', { hasText: 'Q3 2026' }).first().click();
    await sceneIs(page, 'sprint');
    await settle(page);
    await page.locator('.callout', { hasText: 'North Territory' }).first().dblclick();
    await sceneIs(page, 'pod');
    await settle(page);
    const stations = await page.evaluate(() => {
      const t = window.__starChartTest!;
      const fs = t.viewGraph()!.nodes.filter((n) => n.kind === 'facility');
      const tints = t.viewTints(fs.map((n) => n.projectionKey));
      return Object.fromEntries(fs.map((n) => [n.label, { pk: n.projectionKey, open: n.piece?.open, standby: !!n.piece?.standby, flag: !!n.flags.standby, tint: tints[n.projectionKey] }]));
    });
    expect(Object.keys(stations).sort()).toEqual(['Birchwood Mills', 'Osprey Freight', 'Quillon Dairy']);
    for (const name of ['Birchwood Mills', 'Osprey Freight']) {
      expect(stations[name], name).toMatchObject({ open: 0, standby: true, flag: true });
      expect(stations[name]!.tint, name).toBeCloseTo(0.7, 2); // STANDBY_HULL (15 §10), landed at once on entering
      await expect(page.locator('.callout--facility', { hasText: name })).toHaveAttribute('data-holo-tier', 'sky'); // at rest (27 B1)
    }
    expect(stations['Quillon Dairy']).toMatchObject({ open: 1, standby: false, flag: false, tint: 1 });
    await expect(page.locator('.callout--facility', { hasText: 'Quillon Dairy' })).toHaveAttribute('data-holo-tier', 'sky');
    // States raise it: pointed at, the standby station's plate rises to T3 Place, not T1 (and is lifted, expanding into its PRs).
    await pointAt(page, stations['Birchwood Mills']!.pk);
    const plate = page.locator('.callout--facility', { hasText: 'Birchwood Mills' }).first();
    await expect(plate).toHaveClass(/is-hover/);
    await expect(plate).toHaveAttribute('data-holo-tier', 'place');
    // A working station rises to its own tier, T1 Lead.
    await pointAt(page, stations['Quillon Dairy']!.pk);
    await expect(page.locator('.callout--facility', { hasText: 'Quillon Dairy' }).first()).toHaveAttribute('data-holo-tier', 'lead');
    await pointAt(page, stations['Birchwood Mills']!.pk);
    const { ratio, worst } = await worstContrast(page);
    expect(ratio, worst).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: 'test-results/solar-4-standby.png' });
  });
});

// Meteor Pod (27 F1): a run of 36 repos beside a 37th on three seats. Every station is drawn, and at each window size no hit is
// under 12 px or overlaps another (VC-3), with the whole run's stations on the board at the end.
// FINDING (F1 build): at 1024×640 the 37 stations' hits fall under the 12 px floor and three captains overlap stations. The packet says
// to report a layout failure, not fix it, so that size is `test.fail`: it goes red the day the layout fits, and then drops the marker.
test.describe('Solar VC-3 on Meteor Pod (halcyon, 27 F1)', () => {
  test.describe.configure({ mode: 'serial' });
  for (const [w, h] of [[1440, 900], [1024, 640]] as const) {
    test(`draws all 37 stations at the end of the sprint, and keeps VC-3 at ${w}×${h}`, async () => {
      test.setTimeout(240_000);
      if (w === 1024) test.fail(true, 'layout finding: Meteor at 1024×640 has hits under 12 px (reported in the F1 build record)');
      const { app: meteorApp, page: mp } = await launchApp({ STAR_CHART_PARADIGM: '' });
      try {
        await mp.evaluate(() => window.__starChartTest!.freezeAmbient(4));
        await mp.locator('.callout--galaxy', { hasText: 'Halcyon Reach' }).first().dblclick();
        await sceneIs(mp, 'sprint');
        await settle(mp);
        await mp.locator('.callout', { hasText: 'Meteor Pod' }).first().dblclick();
        await sceneIs(mp, 'pod');
        await settle(mp);
        await meteorApp.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w, h), [w, h] as const);
        await mp.waitForTimeout(500); // the reflow, the refit, then a frame's layout
        await settle(mp);
        await mp.evaluate(() => window.__starChartTest!.setScheduleMs(window.__starChartTest!.session().totalMs));
        await frames(mp);
        await settle(mp);
        const facilities = (await graph(mp)).nodes.filter((n) => n.kind === 'facility').map((n) => n.label);
        expect(facilities).toHaveLength(37);
        for (const repo of METEOR_REPOS.slice(0, 36)) expect(facilities, repo).toContain(repo.split(' ')[0]);
        expect(await hitProblems(mp), `${w}×${h}`).toEqual([]);
      } finally {
        await meteorApp.close();
      }
    });
  }
});
