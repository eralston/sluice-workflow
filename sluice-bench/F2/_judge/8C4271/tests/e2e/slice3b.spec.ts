// Slice 3b — perspectives, end to end:
// - continuous playback across scenes (AC-20);
// - following a captain (AC-23);
// - the frame-the-action camera;
// - sector glyphs;
// - stage changes landing with their cause;
// - reduced motion (AC-24 = VC-5).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { clickNode, enterNodeByKey, keyOf, launchApp, openCometCrew, settle } from './launch';

let app: ElectronApplication;
let page: Page;

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async () => {
  ({ app, page } = await launchApp());
});
test.afterEach(async () => {
  await app?.close();
});

const session = () => page.evaluate(() => window.__starChartTest!.session());
const fx = () => page.evaluate(() => window.__starChartTest!.fx());
const top = async () => (await page.evaluate(() => window.__starChartTest!.stack())).at(-1)!;
const followState = () => page.evaluate(() => window.__starChartTest!.follow());
const beatAt = (iso: string) => page.evaluate((t) => window.__starChartTest!.beatTimes().find((b) => b.sourceUtc === t)!, Date.parse(iso));
const seek = async (ms: number) => {
  await page.evaluate((x) => window.__starChartTest!.setScheduleMs(x), ms);
  await page.waitForTimeout(80);
};
async function stepInto(iso: string) {
  const b = await beatAt(iso);
  await seek(b.startMs - 1);
  await page.evaluate(() => window.__starChartTest!.stepBeat());
}
const playAt = (rate: number) => page.evaluate((r) => { window.__starChartTest!.setRate(r); window.__starChartTest!.play(); }, rate);
const pause = () => page.evaluate(() => window.__starChartTest!.pause());

test('AC-20 (E, revised 2026-10-08): navigating galaxy → sector → Feature → body while playing stops at each scene’s own end state, with no replay', { tag: '@keystone' }, async () => {
  await openCometCrew(page); // loads the scope
  await page.locator('.breadcrumb button', { hasText: 'All projects' }).click();
  await settle(page);
  await seek(0);
  await playAt(1);
  // Enter through the object list (Enter on a row), not the canvas: while playing, the camera may be
  // framing the action, so a double-click can miss a moving target.
  const enterRow = async (kind: string, label: string) => {
    await page.locator('.view-panel__tab', { hasText: 'In view' }).click(); // playing shows History; pick the list
    const key = await keyOf(page, kind, label);
    const row = page.locator(`.object-list button[data-key="${key}"]`);
    await row.focus();
    await page.keyboard.press('Enter'); // selects
    await page.keyboard.press('Enter'); // enters
    await settle(page);
  };
  const steps: (() => Promise<void>)[] = [
    async () => { await page.locator('.chooser button', { hasText: 'Comet Crew' }).click(); await settle(page); },
    async () => enterRow('star', 'Unified quote ledger'),
    async () => enterRow('planet', 'Show quote history on the policy page'),
    async () => { await page.keyboard.press('Escape'); await settle(page); },
  ];

  for (const go of steps) {
    const from = (await top()).sceneKey;
    await go();
    expect((await top()).sceneKey).not.toBe(from); // the move happened
    const s = await session();
    // Playback is the scene's own (decided 2026-10-08): the move stops it, and the new scene opens on
    // its end state — what ADO would show for that scope now.
    expect(s.status).not.toBe('playing');
    expect(s.x).toBe(s.totalMs);
    // The scene is drawn at that moment…
    const at = await page.evaluate(() => window.__starChartTest!.viewGraph()!.atUtc);
    expect(Math.abs(at - s.stateUtc!)).toBeLessThan(1);
    // …and nothing replays on the way in (INV-15): arriving is a seek, not a playthrough.
    expect((await fx()).active).toBe(0);
    await playAt(1); // and Play there starts its own story from the beginning
    expect((await session()).status).toBe('playing');
    expect((await session()).x).toBeLessThan(s.totalMs);
  }
  await pause();
});

test("AC-23 (E): following plays the captain's story: only their beats, the camera on their Feature system, staying in it (revised 2026-10-08); a pan suspends, Resume returns; work elsewhere shows the note", { tag: '@keystone' }, async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const everyone = (await session()).beats;
  await seek((await beatAt('2026-09-14T16:10:00.000Z')).startMs + 1); // Monday: she has just taken Story 201
  const ava = await keyOf(page, 'captain', 'Ava Lindqvist');
  await clickNode(page, ava);
  expect((await followState())?.captain).toBe(ava);
  // Her story is the schedule now: fewer beats than everyone's.
  expect((await session()).beats).toBeLessThan(everyone);
  await page.locator('.view-panel__tab', { hasText: 'History' }).click();
  await expect(page.locator('.history__intro')).toContainText('Ava Lindqvist worked on');
  await playAt(2);
  // Monday evening she takes Story 211 in Rate card editor: following stays here (decided 2026-10-08),
  // and the note says her work is elsewhere.
  await page.waitForFunction(() => (window.__starChartTest!.follow()?.note ?? '').includes('outside this view'), undefined, { timeout: 30_000 });
  expect((await top()).label).toBe('Unified quote ledger');
  // Her PR 9002 (for Story 201) is here: following picks her story up again.
  await page.waitForFunction(() => (window.__starChartTest!.follow()?.text ?? '').includes('PR 9002'), undefined, { timeout: 30_000 });
  expect((await top()).label).toBe('Unified quote ledger');
  await page.waitForTimeout(1200);
  await pause();
  expect((await top()).sceneKey.startsWith('feature:')).toBe(true); // the stage is the Feature system, not a close-up
  // The camera keeps her ship in view, left of the side panel.
  const p = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), ava))!;
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  expect(p.x).toBeGreaterThan(0);
  expect(p.x).toBeLessThan(box.width - 380);
  expect(p.y).toBeGreaterThan(60);
  expect(p.y).toBeLessThan(box.height);
  await page.screenshot({ path: 'test-results/slice3b-2-following.png' });
  // A manual pan suspends following; Resume brings the camera back to her, with no replay.
  await page.mouse.move(box.x + 60, box.y + box.height - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + box.height - 160, { steps: 4 });
  await page.mouse.up();
  expect((await followState())?.suspended).toBe(true);
  const frozen = (await fx()).active; // the last beat's effects, held by the pause
  await page.locator('.follow-bar__btn--resume').click();
  await settle(page);
  expect((await followState())?.suspended).toBe(false);
  expect((await fx()).active).toBeLessThanOrEqual(frozen); // Resume replays nothing
  // Thursday she takes the uncharted Task 408 (in no Feature): the camera stays, and the note says so.
  const out = await beatAt('2026-09-17T15:00:00.000Z');
  await seek(out.startMs - 800);
  await settle(page);
  const scene = (await top()).sceneKey;
  await playAt(1);
  await page.waitForFunction(() => (window.__starChartTest!.follow()?.note ?? '').includes('outside this view'), undefined, { timeout: 15_000 });
  await pause();
  expect((await top()).sceneKey).toBe(scene);
  await expect(page.locator('.follow-bar__note')).toContainText('is outside this view');
  await page.locator('.follow-bar__btn', { hasText: 'Unfollow' }).click();
  expect(await followState()).toBeNull();
  expect((await session()).beats).toBe(everyone); // everyone's story again
});

test('the camera holds still around a click (E, decided 2026-10-09): pressed, and 1.5 s after, framing waits', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const beat = await beatAt('2026-09-17T20:30:00.000Z'); // Rafe resolves Story 201: framing would pan to it
  await seek(beat.startMs - 2500);
  const story = await keyOf(page, 'planet', 'Show quote history on the policy page');
  const cam = await page.evaluate(() => window.__starChartTest!.camera());
  const at = await page.evaluate((k) => window.__starChartTest!.targetNodes().find((n) => n.canonicalKey === k)!.world, story);
  await page.evaluate(([c, a]) => window.__starChartTest!.setCamera({ x: a.x + 2400 / c.scale, y: a.y, scale: c.scale * 1.6 }), [cam, at] as const);
  const before = await page.evaluate(() => window.__starChartTest!.camera());
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  // The clicks that got us here hold the camera for a moment too: let that pass.
  await page.waitForFunction(() => !window.__starChartTest!.cameraHeld(), undefined, { timeout: 4000 });

  // Press on an empty part of the chart, then play through the beat with the button still down.
  await page.mouse.move(box.x + 120, box.y + 520);
  await page.mouse.down();
  expect(await page.evaluate(() => window.__starChartTest!.cameraHeld())).toBe(true);
  await playAt(1);
  await page.waitForFunction((x) => window.__starChartTest!.session().x > x + 900, beat.startMs, { timeout: 15_000 });
  await pause();
  // The beat came and went, and the camera didn't chase it.
  expect(await page.evaluate(() => window.__starChartTest!.camera())).toEqual(before);

  // Let go: it stays held for a moment (the second click of a double-click), then frees itself.
  await page.mouse.up();
  expect(await page.evaluate(() => window.__starChartTest!.cameraHeld())).toBe(true);
  await page.waitForFunction(() => !window.__starChartTest!.cameraHeld(), undefined, { timeout: 4000 });

  // And with nothing pressed, framing carries on as before.
  await seek(beat.startMs - 2500);
  await playAt(1);
  await page.waitForFunction((x) => window.__starChartTest!.session().x > x + 900, beat.startMs, { timeout: 15_000 });
  await pause();
  const moved = await page.evaluate(() => window.__starChartTest!.camera());
  expect(Math.hypot(moved.x - before.x, moved.y - before.y)).toBeGreaterThan(1);
});

test('a press on a label holds the camera too (E): labels are DOM buttons the canvas never sees', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  await settle(page);
  await page.waitForFunction(() => !window.__starChartTest!.cameraHeld(), undefined, { timeout: 4000 });
  const label = page.locator('.callout').first();
  await label.dispatchEvent('pointerdown');
  expect(await page.evaluate(() => window.__starChartTest!.cameraHeld())).toBe(true);
  await page.mouse.up(); // the release is on the window
  await page.waitForFunction(() => !window.__starChartTest!.cameraHeld(), undefined, { timeout: 4000 });
});

test('frame-the-action (E): a High beat off-screen brings the camera to it (never zooming in); a manual zoom suspends it until Z', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const beat = await beatAt('2026-09-17T20:30:00.000Z'); // Rafe resolves Story 201
  await seek(beat.startMs - 2500);
  const story = await keyOf(page, 'planet', 'Show quote history on the policy page');
  // Zoom in far from Story 201, as a test (not a user pan, so framing stays on).
  const cam = await page.evaluate(() => window.__starChartTest!.camera());
  const at = await page.evaluate((k) => window.__starChartTest!.targetNodes().find((n) => n.canonicalKey === k)!.world, story);
  await page.evaluate(([c, a]) => window.__starChartTest!.setCamera({ x: a.x + 2400 / c.scale, y: a.y, scale: c.scale * 1.6 }), [cam, at] as const);
  const before = await page.evaluate(() => window.__starChartTest!.camera());
  expect(await page.evaluate((k) => {
    const p = window.__starChartTest!.screenOf(k);
    return p ? p.x >= 0 && p.x <= window.innerWidth - 320 : false;
  }, story)).toBe(false);
  await playAt(1);
  await page.waitForFunction((x) => window.__starChartTest!.session().x > x + 900, beat.startMs, { timeout: 15_000 });
  await pause();
  await page.screenshot({ path: 'test-results/slice3b-3-framed.png' });
  const after = await page.evaluate(() => window.__starChartTest!.camera());
  expect(after.scale).toBeLessThanOrEqual(before.scale + 1e-6); // never zooms in
  const p = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), story))!;
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  expect(p.x).toBeGreaterThan(0);
  expect(p.x).toBeLessThan(box.width - 300); // left of the inspector
  // A manual zoom suspends framing; Z turns it back on.
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.wheel(0, -60);
  expect(await page.evaluate(() => window.__starChartTest!.framing())).toBe('suspended');
  await page.keyboard.press('z');
  expect(await page.evaluate(() => window.__starChartTest!.framing())).toBe('on');
});

test('sector glyphs (E): a Story change inside a Feature glints on its star at sector scale', async () => {
  await openCometCrew(page);
  await stepInto('2026-09-14T16:10:00.000Z'); // Story 201 goes Active and is assigned
  await page.waitForTimeout(150);
  expect((await page.evaluate(() => window.__starChartTest!.fxCensus())).glyphs).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/slice3b-1-sector-glyph.png' });
});

test('stage polish (E): a change by someone else keeps its old look until the beam lands, then swaps', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const story = await keyOf(page, 'planet', 'Show quote history on the policy page');
  const pk = await page.evaluate((k) => window.__starChartTest!.targetNodes().find((n) => n.canonicalKey === k)!.projectionKey, story);
  await stepInto('2026-09-17T20:30:00.000Z'); // Rafe flies to Story 201 and resolves it
  await page.waitForTimeout(200);
  const early = (await page.evaluate(() => window.__starChartTest!.shownStages()))[pk];
  expect(early).toBe('story.terraforming');
  await page.waitForFunction((p) => window.__starChartTest!.shownStages()[p] !== 'story.terraforming', pk, { timeout: 10_000 });
  expect((await page.evaluate(() => window.__starChartTest!.shownStages()))[pk]).toBe('story.developed');
});

test('AC-24 (E) = VC-5: in reduced motion nothing travels, every accent has a static outline, and scenes crossfade quickly', async () => {
  await openCometCrew(page);
  await page.evaluate(() => window.__starChartTest!.setReduced(true));
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  for (const iso of ['2026-09-14T16:10:00.000Z', '2026-09-15T17:30:00.000Z', '2026-09-17T20:30:00.000Z', '2026-09-18T17:45:00.000Z']) {
    await stepInto(iso);
    let rings = 0;
    for (let i = 0; i < 8; i++) {
      const c = await page.evaluate(() => window.__starChartTest!.fxCensus());
      expect(c.moves + c.sparks + c.beams + c.guests).toBe(0); // no flights, pings, beams, or guests
      rings = Math.max(rings, c.rings);
      await page.waitForTimeout(60);
    }
    expect(rings).toBeGreaterThan(0); // the static outline
  }
  // A scene change is a short crossfade.
  const t0 = Date.now();
  await enterNodeByKey(page, await keyOf(page, 'planet', 'Show quote history on the policy page'));
  expect(Date.now() - t0).toBeLessThan(1500);
  await page.evaluate(() => window.__starChartTest!.setReduced(false));
});

test('follow polish (E): while playing, the followed ship keeps the compact label like every other ship, even selected; the bar centers on the view into space', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const pr = await beatAt('2026-09-16T16:20:00.000Z');
  await seek(pr.startMs - 6000);
  await clickNode(page, await keyOf(page, 'captain', 'Ava Lindqvist'));
  await playAt(1);
  await page.waitForTimeout(800);
  const ava = page.locator('.callout--captain', { hasText: 'Ava Lindqvist' });
  await expect(ava).toHaveClass(/is-selected/); // selected...
  await expect(ava).toHaveClass(/is-compact/); // ...and still just her picture
  await page.screenshot({ path: 'test-results/follow-step1.png' });
  await pause();
  // The bar's center is the space view's center (the stage left of the side panel and its margin).
  const bar = (await page.locator('.follow-bar').boundingBox())!;
  const stage = (await page.locator('.stage').boundingBox())!;
  const panel = (await page.locator('.sidepanel').boundingBox())!;
  const center = stage.x + (panel.x - 12 - stage.x) / 2;
  expect(Math.abs(bar.x + bar.width / 2 - center)).toBeLessThan(4);
});

test('side panel (E): In view by default; Play shows History; the end returns to the last pick; keys only in map debug', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const tab = (name: string) => page.locator('.view-panel__tab', { hasText: name });
  await expect(tab('In view')).toHaveAttribute('aria-selected', 'true');
  // Inspector: no keys unless map debug (D).
  await expect(page.locator('.inspector')).not.toContainText('Canonical key');
  await page.keyboard.press('d');
  await expect(page.locator('.inspector')).toContainText('Canonical key');
  await page.keyboard.press('d');
  // Play shows History, with the playing card highlighted; pausing leaves it.
  const last = (await page.evaluate(() => window.__starChartTest!.beatTimes())).at(-1)!;
  await seek(last.startMs - 1500);
  await playAt(4);
  await expect(tab('History')).toHaveAttribute('aria-selected', 'true');
  await pause();
  await expect(tab('History')).toHaveAttribute('aria-selected', 'true');
  // Reaching the end returns to the last pick (In view).
  await playAt(4);
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 20_000 });
  await expect(tab('In view')).toHaveAttribute('aria-selected', 'true');
  // A manual pick of History sticks through the end.
  await tab('History').click();
  await seek(last.startMs - 1500);
  await playAt(4);
  await page.waitForFunction(() => window.__starChartTest!.session().status === 'ended', undefined, { timeout: 20_000 });
  await expect(tab('History')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.history-card.is-current')).toHaveCount(1);
  // The player sits at the top of the view into space.
  const player = (await page.locator('.transport').boundingBox())!;
  const stage = (await page.locator('.stage').boundingBox())!;
  expect(player.y - stage.y).toBeLessThan(20);
  await page.screenshot({ path: 'test-results/history-tab.png' });
});

test('label modes (E): full when stopped; while playing every label is compact (the selected one too) and ships are just their captain; pointing opens one', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger')); // leaves the pointer over the star
  await page.mouse.move(5, 300);
  const full = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.labels .callout')]
    .filter((e) => e.style.display !== 'none' && !e.classList.contains('is-compact')).length);
  expect(await full()).toBeGreaterThan(3); // stopped: full
  await seek(5000);
  await playAt(1);
  await page.waitForTimeout(700);
  expect(await full()).toBe(0); // playing: compact, the selected Feature star included
  const ships = page.locator('.callout--captain:visible');
  for (const ship of await ships.all()) await expect(ship).toHaveClass(/is-compact/); // minimal: the captain's picture
  // Pointing at an object while playing opens its label, to be read.
  const p = (await page.evaluate((k) => window.__starChartTest!.screenOf(k), await keyOf(page, 'planet', 'Show quote history on the policy page')))!;
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  await page.mouse.move(box.x + p.x, box.y + p.y);
  await page.waitForTimeout(150);
  expect(await full()).toBe(1);
  await pause();
});

test('abandoning the journey (E): away from the followed ship\'s scene, following ends; leaving while playing pauses, so it ends too (revised 2026-10-08)', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const ava = await keyOf(page, 'captain', 'Ava Lindqvist');
  await clickNode(page, ava);
  expect((await followState())?.captain).toBe(ava);
  // Paused: leaving the scene (Back) ends following.
  await page.keyboard.press('Escape');
  await settle(page);
  expect(await followState()).toBeNull();
  await expect(page.locator('.follow-bar')).toHaveCount(0);
  // Staying in the scene, paused, keeps it. Followed from In view and F, so the assertion doesn't
  // depend on where her ship happens to sit at the scene's end state.
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  await page.locator('.view-panel__tab', { hasText: 'In view' }).click();
  await page.locator(`.object-list button[data-key="${ava}"]`).click();
  await page.keyboard.press('f');
  expect((await followState())?.captain).toBe(ava);
  await page.mouse.click(5, 300); // clicking elsewhere only inspects
  expect((await followState())?.captain).toBe(ava);
  // Playing: leaving pauses (playback is the scene's own), so following ends too.
  await seek(0);
  await playAt(1);
  await page.keyboard.press('Escape');
  await settle(page);
  expect((await session()).status).not.toBe('playing');
  expect(await followState()).toBeNull();
});

test('hero aura (E): the followed ship wears its aura, with a dramatic entrance as play starts', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const hero = () => page.evaluate(() => window.__starChartTest!.hero());
  expect((await hero()).key).toBeNull();
  const pr = await beatAt('2026-09-16T16:20:00.000Z');
  await seek(pr.startMs - 9000);
  await clickNode(page, await keyOf(page, 'captain', 'Ava Lindqvist'));
  await page.waitForTimeout(500);
  expect((await hero()).visible).toBeGreaterThan(0.9); // steady glow while paused
  await page.screenshot({ path: 'test-results/hero-1-steady.png' });
  await playAt(1);
  await page.waitForTimeout(500);
  expect((await hero()).warming).toBe(true); // the entrance has begun
  await page.screenshot({ path: 'test-results/hero-2-gathering.png' });
  await page.waitForTimeout(420);
  await page.screenshot({ path: 'test-results/hero-3-flash.png' });
  await page.waitForTimeout(2700);
  expect((await hero()).warming).toBe(false);
  expect((await hero()).visible).toBeGreaterThan(0.9);
  await page.screenshot({ path: 'test-results/hero-4-settled.png' });
  await pause();
  await page.locator('.follow-bar__btn', { hasText: 'Unfollow' }).click();
  await page.waitForTimeout(600);
  expect((await hero()).visible).toBeLessThan(0.05); // gone once unfollowed
});

test('History (E): the newest card arrives on top, highlighted, and older ones move down; the collapsed bar keeps the big moments as dots', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  await page.locator('.view-panel__tab', { hasText: 'History' }).click();
  const first = await beatAt('2026-09-14T16:10:00.000Z');
  await seek(first.startMs + 1);
  const count0 = await page.locator('.history-card').count();
  const topText0 = await page.locator('.history-card').first().innerText();
  await playAt(4);
  await page.waitForFunction((n) => document.querySelectorAll('.history-card').length > n + 1, count0, { timeout: 20_000 });
  await expect(page.locator('.history-card').first()).toHaveClass(/is-current/);
  expect(await page.locator('.history-card').first().innerText()).not.toBe(topText0);
  expect(await page.locator('.history-card').last().innerText()).toContain(topText0.split('\n')[0]!.slice(0, 20)); // the oldest stays at the bottom
  // The collapsed player keeps small dots for the in-view big moments.
  await page.mouse.move(5, 300);
  await page.waitForFunction(() => document.querySelector('.transport.is-faded'), undefined, { timeout: 8000 });
  expect(await page.locator('.transport__dot').count()).toBeGreaterThan(2);
  await page.screenshot({ path: 'test-results/history-and-dots.png' });
  await pause();
});

test('follow camera principles (E): a PR brings its shuttle and station into frame; within a Feature the frame only widens', async () => {
  await openCometCrew(page);
  await enterNodeByKey(page, await keyOf(page, 'star', 'Unified quote ledger'));
  const pr = await beatAt('2026-09-16T16:20:00.000Z'); // Ava opens PR 9002 (to portal-web)
  const ava = await keyOf(page, 'captain', 'Ava Lindqvist');
  await seek(pr.startMs - 6000);
  await clickNode(page, ava);
  await page.mouse.move(5, 300);
  await playAt(1);
  // Sample the camera through the start, the PR beat, and after it.
  const scales: number[] = [];
  const deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    scales.push((await page.evaluate(() => window.__starChartTest!.camera())).scale);
    await page.waitForTimeout(150);
    if ((await session()).x > pr.startMs + 4000) break;
  }
  await pause();
  // After the opening frame (the first ~1.5 s may zoom in), the camera never zooms in again.
  const after = scales.slice(10);
  for (let i = 1; i < after.length; i++) expect(after[i]!).toBeLessThanOrEqual(after[i - 1]! * 1.001);
  // The shuttle and its station are both in view, left of the side panel and below the player.
  const box = (await page.locator('.chart-host canvas').boundingBox())!;
  const inView = async (kind: string, label: string) => {
    const k = await keyOf(page, kind, label);
    const p = await page.evaluate((key) => window.__starChartTest!.screenOf(key), k);
    return !!p && p.x > 0 && p.x < box.width - 380 && p.y > 50 && p.y < box.height;
  };
  expect(await inView('flight', 'Quote history panel')).toBe(true);
  expect(await inView('station', 'portal-web')).toBe(true);
  await page.screenshot({ path: 'test-results/follow-camera-pr.png' });
});
