// Slice 3a — story grammar, end to end: the Task radar, its radial-only motion, the lead-in, the
// simplified transport and its hotkeys, highlights, and the recap (05 §5; 06 §3, §5).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickNode, enterNodeByKey, keyOf, launchApp, settle } from './launch';

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  ({ app, page } = await launchApp());
  await openStory251(page);
  await page.mouse.move(0, 0);
});
test.afterAll(async () => {
  await app?.close();
});

/** Galaxy → Nimbus Deck → Lantern Squad → Feature 111 → Story 251 (the radar's week). */
async function openStory251(p: Page) {
  await clickNode(p, await keyOf(p, 'galaxy', 'Nimbus Deck'));
  await p.locator('.chooser button', { hasText: 'Lantern Squad' }).click();
  await settle(p);
  await enterNodeByKey(p, await keyOf(p, 'star', 'Billing statement redesign'));
  await enterNodeByKey(p, await keyOf(p, 'planet', 'Statement summary panel'));
}

const radar = () => page.evaluate(() => window.__starChartTest!.radar());
const fx = () => page.evaluate(() => window.__starChartTest!.fx());
const seek = async (ms: number) => {
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
  await page.waitForTimeout(60);
};
/** The beat at a source time. */
const beatAt = (iso: string) => page.evaluate((t) => window.__starChartTest!.beatTimes().find((b) => b.sourceUtc === t)!, Date.parse(iso));
/** Seek to just before a beat, then step into it (its accents play once). */
async function stepInto(iso: string) {
  const b = await beatAt(iso);
  await seek(b.startMs - 1);
  await page.evaluate(() => window.__starChartTest!.stepBeat());
}

test('review stills: the radar wave mid-flight (written to test-results/slice3a-*.png)', async () => {
  const shots: [string, number, string][] = [
    ['2026-09-17T16:30:00.000Z', 120, '1-radar-collapse'],
    ['2026-09-17T16:30:00.000Z', 520, '2-radar-run'],
    ['2026-09-17T16:30:00.000Z', 1300, '3-radar-landed-echo'],
    ['2026-09-18T16:00:00.000Z', 700, '4-reopen-and-close'],
    ['2026-09-18T18:00:00.000Z', 900, '5-pr-delivery'],
    ['2026-09-18T22:00:00.000Z', 900, '6-story-resolved'],
    // The author's visit: Rafe's ship goes to the station and works PR 9202 out of its bay with the tractor beam.
    ['2026-09-16T17:00:00.000Z', 600, '10-visit-arriving'],
    ['2026-09-16T17:00:00.000Z', 1300, '11-tractor-beam'],
    ['2026-09-16T17:00:00.000Z', 2600, '12-launch-intent'],
  ];
  for (const [iso, wait, name] of shots) {
    await stepInto(iso);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `test-results/slice3a-${name}.png` });
  }
});

const session = () => page.evaluate(() => window.__starChartTest!.session());

test('radar (E): across a beat every Task moves only along its spoke, and lands in its new band', async () => {
  const wave = await beatAt('2026-09-17T16:30:00.000Z');
  await seek(wave.startMs - 1);
  await page.waitForTimeout(100);
  const before = new Map((await radar()).map((t) => [t.key, t]));
  await page.evaluate(() => window.__starChartTest!.stepBeat());
  await page.waitForTimeout(150); // the next frame lays out the new state and spawns the accents
  await page.waitForFunction(() => window.__starChartTest!.fx().active === 0, undefined, { timeout: 15_000 });
  const after = await radar();
  let moved = 0;
  for (const t of after) {
    const b = before.get(t.key);
    if (!b) continue;
    expect(t.angle).toBe(b.angle);
    if (b.band !== t.band) {
      moved++;
      expect(Math.atan2(t.y * 2, t.x)).toBeCloseTo(Math.atan2(b.y * 2, b.x), 4);
    }
  }
  expect(moved).toBe(5); // the wave: five Tasks close at once
  expect(after.filter((t) => t.band === 'accomplished').length).toBeGreaterThan([...before.values()].filter((t) => t.band === 'accomplished').length);
});

test('lead-in (E): while playing, the next beat winds up before it lands; a seek mid-lead-in leaves nothing', { tag: '@keystone' }, async () => {
  const wave = await beatAt('2026-09-17T16:30:00.000Z');
  await seek(wave.startMs - 900);
  await page.waitForFunction(() => window.__starChartTest!.fx().active === 0, undefined, { timeout: 15_000 });
  await page.evaluate(() => window.__starChartTest!.play());
  // Inside the lead (the last 400 ms of the gap), before the beat: the tells are running.
  await page.waitForFunction((start) => {
    const t = window.__starChartTest!;
    const s = t.session();
    return s.x > start - 400 && s.x < start && t.fx().active > 0;
  }, wave.startMs, { timeout: 5000, polling: 'raf' });
  await page.evaluate(() => window.__starChartTest!.pause());
  await seek(wave.startMs - 2000);
  expect(await fx()).toEqual({ active: 0, trails: 0 });
});

test('transport (E): hotkeys drive the session', { tag: '@keystone' }, async () => {
  await page.locator('.chart-host canvas').click({ position: { x: 5, y: 5 } }); // focus the page, not a control
  await seek(0);
  await page.keyboard.press('ArrowRight');
  expect((await session()).beatIndex).toBe(0);
  await page.keyboard.press('ArrowRight');
  expect((await session()).beatIndex).toBe(1);
  await page.keyboard.press('ArrowLeft');
  expect((await session()).beatIndex).toBe(0);
  // Shift → skips to the next High beat in this view, and plays it.
  const at = (await session()).beatIndex;
  await page.keyboard.press('Shift+ArrowRight');
  expect((await session()).beatIndex).toBeGreaterThan(at);
  await page.keyboard.press('End');
  expect((await session()).status).toBe('ended');
  await page.keyboard.press('Home');
  expect((await session()).x).toBe(0);
  await page.keyboard.press(']');
  expect((await session()).rate).toBe(2);
  await page.keyboard.press('[');
  await page.keyboard.press('[');
  expect((await session()).rate).toBe(0.5);
  await page.keyboard.press(']');
  await page.keyboard.press('l');
  expect((await session()).lens).toBe('currentObserved');
  await expect(page.locator('.transport__chip')).toBeVisible();
  await page.keyboard.press('l');
  // E switches the side panel between In view and History (at the start History has nothing yet, so
  // check the tab, not the list).
  const tabSelected = (name: string) => expect(page.locator('.view-panel__tab', { hasText: name })).toHaveAttribute('aria-selected', 'true');
  const was = (await page.locator('.view-panel__tab[aria-selected="true"]').innerText()).toLowerCase().includes('history') ? 'History' : 'In view';
  const other = was === 'History' ? 'In view' : 'History';
  await page.keyboard.press('e');
  await tabSelected(other);
  await page.keyboard.press('e');
  await tabSelected(was);
  await page.keyboard.press('?');
  await expect(page.locator('.key-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.key-help')).toHaveCount(0);
  expect((await page.evaluate(() => window.__starChartTest!.stack())).length).toBeGreaterThan(3); // Esc closed the overlay, not the scene
});

test('transport (E): the rate is one chip away, and the bar fades while playing, returning on a mouse move', async () => {
  await page.locator('.transport__rate').click();
  await page.locator('.transport__rates button', { hasText: '½×' }).click();
  expect((await session()).rate).toBe(0.5);
  await expect(page.locator('.transport__rates')).toHaveCount(0);
  await seek(0);
  await page.evaluate(() => window.__starChartTest!.play());
  await expect(page.locator('.transport.is-faded')).toHaveCount(1, { timeout: 5000 });
  await page.mouse.move(300, 300);
  await expect(page.locator('.transport.is-faded')).toHaveCount(0);
  await page.evaluate(() => window.__starChartTest!.pause());
  await page.locator('.transport__rate').click();
  await page.locator('.transport__rates button', { hasText: '1×' }).click();
});

test('highlights (E): H plays only what touches this view, at the same source time', async () => {
  await seek(5000);
  const full = await session();
  await page.keyboard.press('h');
  const hi = await session();
  expect(hi.beats).toBeLessThan(full.beats);
  expect(hi.totalMs).toBeLessThan(full.totalMs);
  expect(Math.abs(hi.playheadUtc! - full.playheadUtc!)).toBeLessThan(60 * 60_000);
  await page.locator('.transport__more').click(); // Highlights lives in ⋯ now
  await expect(page.locator('.transport__highlights[aria-pressed="true"]')).toBeVisible();
  await page.locator('.transport__more').click();
  await page.keyboard.press('h');
  expect((await session()).beats).toBe(full.beats);
});

test('recap (E): playing into the end blooms the week\'s accomplishments; jumping to the end does not', async () => {
  await page.keyboard.press('End');
  await page.waitForTimeout(100);
  expect((await fx()).active).toBe(0);
  const s = await session();
  await seek(s.totalMs - 600);
  await page.waitForFunction(() => window.__starChartTest!.fx().active === 0, undefined, { timeout: 15_000 });
  await page.evaluate(() => window.__starChartTest!.play());
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 5000 });
  await page.waitForTimeout(500);
  expect((await fx()).active).toBeGreaterThan(0);
});

test('review stills: echo and beam in the Feature system (test-results/slice3a-7-*.png)', async () => {
  await page.locator('.back').click();
  await settle(page);
  await page.mouse.move(0, 0);
  for (const [iso, wait, name] of [
    ['2026-09-17T16:30:00.000Z', 700, '7-feature-task-wave-echo'],
    ['2026-09-18T22:00:00.000Z', 450, '8-feature-story-resolved-beam'],
    ['2026-09-18T22:00:00.000Z', 1400, '9-feature-story-resolved-echo'],
  ] as const) {
    await stepInto(iso);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `test-results/slice3a-${name}.png` });
  }
});

// --- Refinement (2026-10-03): pace, continuity, and justified motion -------------------------------

/** Open a work item's scene by search (deterministic, unlike a double-click on a crowded canvas). */
async function openBySearch(id: string) {
  await page.locator('.search input').fill(id);
  await page.locator('.search input').press('Enter');
  await settle(page);
  await page.mouse.move(0, 0);
}

test('continuity (E): while launches re-spread the lane, nothing on screen jumps', async () => {
  await openBySearch('251');
  expect((await page.evaluate(() => window.__starChartTest!.viewGraph()!.sceneKey))).toMatch(/^body:.*:251$/);
  const from = await beatAt('2026-09-15T16:00:00.000Z');
  const to = await beatAt('2026-09-16T20:00:00.000Z');
  await seek(from.startMs - 800);
  await page.evaluate(() => window.__starChartTest!.play());
  // Sample every frame: the fastest any node moves between two frames, in px per second.
  const worst = await page.evaluate((endMs) => new Promise<{ speed: number; pk: string }>((resolve) => {
    const t = window.__starChartTest!;
    let prev = new Map(t.displayed().map((d) => [d.pk, d]));
    let last = performance.now();
    let worst = { speed: 0, pk: '' };
    const tick = () => {
      const now = performance.now();
      const cur = t.displayed();
      const dt = Math.max(1, now - last) / 1000;
      for (const d of cur) {
        const p = prev.get(d.pk);
        if (!p) continue;
        const speed = Math.hypot(d.x - p.x, d.y - p.y) / dt;
        if (speed > worst.speed) worst = { speed, pk: d.pk };
      }
      prev = new Map(cur.map((d) => [d.pk, d]));
      last = now;
      if (t.session().x < endMs) requestAnimationFrame(tick);
      else resolve(worst);
    };
    requestAnimationFrame(tick);
  }), to.startMs + 3000);
  await page.evaluate(() => window.__starChartTest!.pause());
  // A launching vessel tops out around 600 px/s; a teleport is a single-frame leap (thousands).
  expect(worst.speed, `fastest: ${worst.pk}`).toBeLessThan(1500);
});

test('edge reveal (E): a launch holds its routes until their ink has drawn them', async () => {
  await stepInto('2026-09-16T17:00:00.000Z'); // PR 9202 opens
  await page.waitForTimeout(80);
  expect((await page.evaluate(() => window.__starChartTest!.heldEdges())).length).toBeGreaterThan(0);
  await page.waitForFunction(() => window.__starChartTest!.heldEdges().length === 0, undefined, { timeout: 10_000 });
});

test('snap (E): after a seek nothing glides: the new state is simply there', { tag: '@keystone' }, async () => {
  await seek(1000);
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__starChartTest!.glidingCount())).toBe(0);
});

test('tiers (E): a busy scene rations echoes; an overloaded one keeps only the essentials', async () => {
  const census = () => page.evaluate(() => window.__starChartTest!.fxCensus());
  // The Thursday wave: five Tasks land in the inner band, each with an echo when calm.
  const wave = '2026-09-17T16:30:00.000Z';
  let maxSparks = 0;
  let maxMoves = 0;
  const watch = async () => {
    maxSparks = 0;
    maxMoves = 0;
    for (let i = 0; i < 40; i++) {
      const c = await census();
      maxSparks = Math.max(maxSparks, c.sparks);
      maxMoves = Math.max(maxMoves, c.moves);
      await page.waitForTimeout(80);
    }
  };
  await page.evaluate(() => window.__starChartTest!.biasVolatility(11)); // busy
  await stepInto(wave);
  await watch();
  expect(maxSparks).toBeLessThanOrEqual(3);
  await page.evaluate(() => window.__starChartTest!.biasVolatility(20)); // overloaded
  await stepInto(wave);
  await watch();
  expect(maxSparks).toBe(0);
  expect(maxMoves).toBeGreaterThanOrEqual(5); // essentials still play: every Task's radar ping (and ships flying to their work)
  await page.evaluate(() => window.__starChartTest!.biasVolatility(0));
});

test('review formation (E): at a merge the approvers gather, join their beams, then the grand flare; nothing is left behind', async () => {
  await openBySearch('251');
  const census = () => page.evaluate(() => window.__starChartTest!.fxCensus());
  const merge = await beatAt('2026-09-18T18:00:00.000Z'); // PR 9202: approved by Ava, Jo, and Sana (Jo and Sana are guests)
  await seek(merge.startMs - 1);
  await page.waitForFunction(() => window.__starChartTest!.fx().active === 0, undefined, { timeout: 20_000 });
  const baseline = await page.evaluate(() => window.__starChartTest!.counts().displayObjects);
  await page.evaluate(() => window.__starChartTest!.stepBeat());
  let guests = 0;
  let beamsBeforeGrand = 0;
  let sawGrand = false;
  for (let i = 0; i < 60 && !sawGrand; i++) {
    const c = await census();
    guests = Math.max(guests, c.guests);
    if (c.grand > 0) sawGrand = true;
    else beamsBeforeGrand = Math.max(beamsBeforeGrand, c.beams);
    await page.waitForTimeout(80);
  }
  expect(guests).toBe(2);
  await expect(page.locator('.guest-tag')).toHaveCount(2);
  expect(beamsBeforeGrand).toBeGreaterThanOrEqual(3); // every approver's beam joins before the flare
  expect(sawGrand).toBe(true);
  await page.waitForFunction(() => window.__starChartTest!.fx().active === 0, undefined, { timeout: 30_000 });
  await expect(page.locator('.guest-tag')).toHaveCount(0);
  // Back to the same instant: the same objects as before the merge played (no leaked guest ships).
  await seek(merge.startMs - 1);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.__starChartTest!.counts().displayObjects)).toBe(baseline);
});

test('review formation (E): a seek mid-formation leaves no effects and no guest ships', { tag: '@keystone' }, async () => {
  const merge = await beatAt('2026-09-18T18:00:00.000Z');
  await stepInto('2026-09-18T18:00:00.000Z');
  await page.waitForTimeout(700);
  expect((await page.evaluate(() => window.__starChartTest!.fxCensus())).guests).toBe(2);
  await seek(merge.startMs - 3000);
  await page.waitForTimeout(80);
  expect(await fx()).toEqual({ active: 0, trails: 0 });
  await expect(page.locator('.guest-tag')).toHaveCount(0);
});

test('review stills: the formation (test-results/slice3a-13…15)', async () => {
  for (const [wait, name] of [[700, '13-formation-gather'], [1700, '14-formation-beams'], [3100, '15-formation-flare']] as const) {
    await stepInto('2026-09-18T18:00:00.000Z');
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `test-results/slice3a-${name}.png` });
  }
});

test('dynamic labels (E): compact while playing, ships show only their captain, full again once settled', async () => {
  await openBySearch('251');
  const wave = await beatAt('2026-09-17T16:30:00.000Z');
  await seek(wave.startMs - 2000);
  await page.evaluate(() => window.__starChartTest!.play());
  await page.waitForTimeout(600);
  // Focused labels (hovered, selected) deliberately stay full.
  const shown = (sel: string) => page.evaluate((s) => [...document.querySelectorAll<HTMLElement>(s)]
    .filter((e) => e.style.display !== 'none' && !e.classList.contains('is-selected') && !e.classList.contains('is-hover'))
    .map((e) => e.classList.contains('is-compact')), sel);
  const labels = await shown('.callout');
  expect(labels.length).toBeGreaterThan(3);
  expect(labels.every(Boolean)).toBe(true);
  const ships = await shown('.callout--captain');
  expect(ships.length).toBeGreaterThan(0);
  expect(ships.every(Boolean)).toBe(true);
  await page.evaluate(() => window.__starChartTest!.pause());
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.callout')].filter((e) => e.style.display !== 'none').every((e) => !e.classList.contains('is-compact')), undefined, { timeout: 12_000 });
});

test('dynamic labels (E): a Task that changes band flashes its title for a few seconds, then hides', async () => {
  const flashing = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.callout--missionPoint')].filter((e) => e.style.display !== 'none' && e.classList.contains('is-compact')).length);
  await stepInto('2026-09-17T16:30:00.000Z'); // five Tasks land in the inner band (hover-only labels there)
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.callout--missionPoint')].filter((e) => e.style.display !== 'none' && e.classList.contains('is-compact')).length >= 3, undefined, { timeout: 6000 });
  // Then the flashes fade, and once everything has settled no label is compact.
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('.callout--missionPoint')].filter((e) => e.style.display !== 'none' && e.classList.contains('is-compact')).length === 0, undefined, { timeout: 12_000 });
  expect(await flashing()).toBe(0);
});

test('review stills: compact labels mid-play (test-results/slice3a-16-*.png)', async () => {
  const b = await beatAt('2026-09-16T17:00:00.000Z');
  await seek(b.startMs - 1500);
  await page.evaluate(() => window.__starChartTest!.play());
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'test-results/slice3a-16-compact-labels.png' });
  await page.evaluate(() => window.__starChartTest!.pause());
});
