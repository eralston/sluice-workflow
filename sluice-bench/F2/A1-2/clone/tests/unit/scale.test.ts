// Scenes that scale (decided 2026-10-07): the galaxy grid, minimum targets, and the page fit.
import { describe, expect, it } from 'vitest';
import crowdedOrg from '@fixtures/scenarios/crowded-org';
import { listProjects } from '@fixtures/dsl';
import { keys } from '@shared/contracts/keys';
import type { ViewNode } from '@shared/contracts/view';
import { gridRows } from '@shared/scene/layout';
import { GALAXY_MAX_COLUMNS, GALAXY_R, galaxyColumns, projectGalaxy } from '@shared/scene/projectScene';
import { hitRadius, MIN_TARGET_PX, pageScale, targetScale, TOUCH_TARGET_PX } from '@shared/scene/sizing';
import { mapping } from '../golden/helpers';

const proj = (name: string, extra: Partial<{ activity: number; favoriteCount: number; pinned: boolean }> = {}) =>
  ({ key: keys.project('org', name.toLowerCase().replace(/\W/g, '-')), name, activity: 0, favoriteCount: 0, ...extra });

describe('the galaxy grid', () => {
  it('rows are full but the last, which is centred', () => {
    expect(gridRows(188, 8)).toEqual([...Array(23).fill(8), 4]);
    expect(gridRows(2, 8)).toEqual([2]);
    expect(gridRows(0, 8)).toEqual([]);
  });
  it('columns grow with the count up to the maximum', () => {
    expect(galaxyColumns(1)).toBe(2);
    expect(galaxyColumns(2)).toBe(2);
    expect(galaxyColumns(188)).toBe(GALAXY_MAX_COLUMNS);
  });
  it('orders pinned first, then A–Z, and never overlaps', () => {
    const g = projectGalaxy([proj('zeta'), proj('Alpha'), proj('beta', { pinned: true }), proj('Gamma')], 0, 1);
    expect(g.nodes.map((n) => n.label)).toEqual(['beta', 'Alpha', 'Gamma', 'zeta']);
    for (const a of g.nodes) for (const b of g.nodes) {
      if (a !== b) expect(Math.hypot(a.world.x - b.world.x, a.world.y - b.world.y)).toBeGreaterThan(2 * GALAXY_R);
    }
  });
  it('188 projects make a tall grid with quiet ones flagged, never resized (INV-19)', () => {
    const projects = listProjects(crowdedOrg, mapping);
    expect(projects).toHaveLength(188);
    const g = projectGalaxy(projects.map((p) => ({ ...p, pinned: false })), 0, 1);
    const xs = new Set(g.nodes.map((n) => n.world.x));
    const ys = new Set(g.nodes.map((n) => n.world.y));
    expect(xs.size).toBe(8); // the centred last row of 4 lands on the same columns
    expect(ys.size).toBe(24);
    expect(new Set(g.nodes.map((n) => n.world.r)).size).toBe(1);
    const quiet = g.nodes.filter((n) => n.flags.quiet).length;
    expect(quiet).toBeGreaterThan(150);
    expect(quiet).toBeLessThan(188);
    expect(g.nodes.every((n) => n.labelCompact)).toBe(true);
  });
});

describe('minimum targets (Apple HIG)', () => {
  const node = (kind: ViewNode['kind'], r: number, extra: Partial<ViewNode> = {}): ViewNode =>
    ({ projectionKey: `${kind}|${r}`, canonicalKey: 'wi:o:1', kind, world: { x: 0, y: 0, r }, stage: '', seed: 0, label: '', openable: false, selectable: true, labelled: true, flags: {}, evidence: [], ...extra }) as ViewNode;
  it('every hit target is at least MIN_TARGET_PX across, but radar Tasks keep their 24 px', () => {
    for (const scale of [0.01, 0.1, 1]) expect(hitRadius(node('planet', 1), scale) * scale * 2).toBeGreaterThanOrEqual(MIN_TARGET_PX);
    const dot = hitRadius(node('missionPoint', 0.1, { radar: { angle: 0, band: 'ready' } }), 1) * 2;
    expect(dot).toBeGreaterThanOrEqual(24);
    expect(dot).toBeLessThan(MIN_TARGET_PX);
  });
  it('the scale that makes what leads somewhere a given size; mechanical objects never limit it', () => {
    const galaxy = node('galaxy', 300);
    expect(targetScale([galaxy], TOUCH_TARGET_PX)).toBeCloseTo(TOUCH_TARGET_PX / (2 * 300 * 0.8));
    expect(targetScale([node('station', 5, { zoomTo: 'feature:wi:o:1' })], TOUCH_TARGET_PX)).toBe(0);
    expect(targetScale([node('planet', 10)], TOUCH_TARGET_PX)).toBe(0); // no scene behind it
  });
  it('page fit: the whole scene while it stays clickable, else a page at the width or touch scale', () => {
    expect(pageScale(0.5, 0.6, 0.1, 0.07)).toEqual({ scale: 0.5, page: false });
    expect(pageScale(0.08, 0.6, 0.1, 0.07)).toEqual({ scale: 0.08, page: false }); // clickable, if not touchable
    expect(pageScale(0.05, 0.22, 0.09, 0.07)).toEqual({ scale: 0.22, page: true });
    expect(pageScale(0.02, 0.03, 0.09, 0.07)).toEqual({ scale: 0.09, page: true });
  });
});

describe('recent projects (decided 2026-10-07)', () => {
  it('pinned come first, newest of your work first, then the rest A–Z', () => {
    const g = projectGalaxy([
      proj('Old pin', { pinned: true }), proj('aardvark'), proj('Fresh pin', { pinned: true }), proj('Mid pin', { pinned: true }),
    ].map((p) => ({ ...p, recentAt: p.name === 'Fresh pin' ? 300 : p.name === 'Mid pin' ? 200 : p.name === 'Old pin' ? 100 : undefined })), 0, 1);
    expect(g.nodes.map((n) => n.label)).toEqual(['Fresh pin', 'Mid pin', 'Old pin', 'aardvark']);
  });
});

describe('the empty cosmos (decided 2026-10-07)', () => {
  it('parses quotes, skipping blanks and comments, and the shipped file has some', async () => {
    const { parseQuotes } = await import('@shared/scene/cosmos');
    expect(parseQuotes('# note\n\n“A.” — Someone, Book\nplain line\n')).toEqual([{ text: '“A.”', by: 'Someone, Book' }, { text: 'plain line', by: '' }]);
    const raw = (await import('node:fs')).readFileSync('config/cosmos-quotes.txt', 'utf8');
    const quotes = parseQuotes(raw);
    expect(quotes.length).toBeGreaterThanOrEqual(8);
    expect(quotes.every((q) => q.text.startsWith('“') && q.by.length > 0)).toBe(true);
  });
  it('the quote stays AA (4.5:1) against the ink and the brightest nebula it can sit on', async () => {
    const { contrast, hex, INK, IVORY, over, QUOTE_ALPHA, QUOTE_WORST_BG } = await import('@shared/scene/cosmos');
    for (const bg of [INK, QUOTE_WORST_BG]) expect(contrast(over(hex(IVORY), QUOTE_ALPHA, hex(bg)), hex(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('request activity (decided 2026-10-07)', () => {
  it('groups calls by kind with a bead each; successes linger then leave; failures stay until dismissed', async () => {
    const { chips, dismiss, emptyActivity, LINGER_MS, PHRASE_AFTER_MS, reduce } = await import('@shared/activity');
    let s = emptyActivity();
    s = reduce(s, { phase: 'start', id: 1, family: 'history', at: 0 });
    s = reduce(s, { phase: 'start', id: 2, family: 'history', at: 10 });
    s = reduce(s, { phase: 'start', id: 3, family: 'items', at: 20 });
    let c = chips(s, 100);
    expect(c.map((x) => [x.family, x.active, x.showPhrase])).toEqual([['history', 2, false], ['items', 1, false]]);
    expect(chips(s, PHRASE_AFTER_MS + 1).find((x) => x.family === 'history')!.showPhrase).toBe(true);
    s = reduce(s, { phase: 'end', id: 1, family: 'history', at: 500, status: 200, ms: 500, attempts: 1 });
    c = chips(s, 600);
    expect(c.find((x) => x.family === 'history')).toMatchObject({ active: 1, done: 1 });
    s = reduce(s, { phase: 'end', id: 2, family: 'history', at: 700, status: 200, ms: 690, attempts: 2 });
    s = reduce(s, { phase: 'fail', id: 3, family: 'items', at: 800, status: 500, ms: 780 });
    expect(chips(s, 800 + LINGER_MS + 1).map((x) => [x.family, x.failed])).toEqual([['items', 1]]); // history left, the failure stays
    expect(s.recent.map((r) => r.id)).toEqual([3, 2, 1]);
    s = dismiss(s, 3);
    expect(chips(s, 800 + LINGER_MS + 1)).toEqual([]);
  });
  it('a throttle wait shows on its chip; quiet PR skips never stick as errors', async () => {
    const { chips, emptyActivity, reduce } = await import('@shared/activity');
    let s = reduce(emptyActivity(), { phase: 'start', id: 1, family: 'history', at: 0 });
    s = reduce(s, { phase: 'throttle', id: 1, family: '', at: 100, waitMs: 5000 });
    expect(chips(s, 1100)[0]).toMatchObject({ waitingMs: 4000, showPhrase: true });
    s = reduce(s, { phase: 'start', id: 2, family: 'prs', at: 0 });
    s = reduce(s, { phase: 'fail', id: 2, family: 'prs', at: 50, status: 404, ms: 50 });
    expect(s.errors).toEqual([]);
  });
});
