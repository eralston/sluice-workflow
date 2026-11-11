// Label tiers and the expanded plate's placement (14 §2.9, 17 W2-T5, W3-T4, 19 L2). `tierFor` must
// reproduce v0's inline label rule exactly (06 §4, decided 2026-10-04): the same labels go compact (the
// Title tier), and the same ships hug their captain's picture (Picture), in every state; only v1 nodes
// (with an asset) reach `expanded`. An expanded holo plate keeps its side and pointer and grows away
// from its object, slides along its pointer's edge into the view, and re-places at most once, when it
// expands; those are pure functions (holoLabel.ts).
// Renderer code sits outside this project's tsconfig, so it is loaded by a runtime path (as in
// signal.test.ts); the modules touch no DOM at import.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ViewNode } from '@shared/contracts/view';
import { ROW_BUDGET } from '@shared/scene/project/lists';

type Tier = 'expanded' | 'full' | 'title' | 'picture';
interface TierState { pointed: boolean; selected: boolean; followed: boolean; recent: boolean; moving: boolean; flashed: boolean }
interface Rect { x0: number; y0: number; x1: number; y1: number }

const CHART = resolve(__dirname, '../../src/renderer/src/chart');
type HTier = 'lead' | 'door' | 'place' | 'sky';
interface RaiseState { pointed: boolean; selected: boolean; followed: boolean; expanded: boolean; cast: boolean; acting: boolean }
const { tierFor, isCompact, raisedTier } = (await import(/* @vite-ignore */ `${CHART}/labelTiers.ts`)) as {
  tierFor(n: ViewNode, s: TierState): Tier; isCompact(t: Tier): boolean; raisedTier(own: HTier, s: RaiseState): HTier;
};
const { formationSides } = (await import(/* @vite-ignore */ `${CHART}/labelTiers.ts`)) as {
  formationSides(m: { pk: string; x: number; y: number }[], viewW: number): Map<string, { axis: 'v' | 'h'; side: 'left' | 'right' | 'above' | 'below' | null }>;
};
const { ownTier } = (await import(/* @vite-ignore */ `${CHART}/labels.ts`)) as {
  ownTier(n: ViewNode, spec: { tier: HTier }): HTier;
};
interface Placement { rect: Rect; side: 'left' | 'right' | 'above' | 'below'; leader: readonly (readonly [number, number])[] }
const { rowsInBudget, GRACE_MS, LONG_PRESS_MS } = (await import(/* @vite-ignore */ `${CHART}/holo/holoRows.ts`)) as {
  rowsInBudget(l: { title: string; rows: unknown[]; more: number }): { rows: unknown[]; more: number }; GRACE_MS: number; LONG_PRESS_MS: number;
};
const holo = (await import(/* @vite-ignore */ `${CHART}/holo/holoLabel.ts`)) as {
  holoCandidates(a: { cx: number; cy: number; r: number; dirX: number; dirY: number }, w: number, h: number): Placement[];
  holoVerticalCandidates(a: { cx: number; cy: number; r: number }, w: number, h: number, prefer?: 'above' | 'below'): Placement[];
  growPlacement(at: Placement, w: number, h: number): Placement;
  slidePlacement(at: Placement, w: number, h: number): Placement;
  expandAt(c: readonly Placement[], k: number, w: number, h: number, vw: number, vh: number, clear?: (r: Rect) => boolean): number;
  inHoloView(r: Rect, w: number, h: number): boolean;
  HOLO: { cut: number };
};
const { overlayIds, registerOverlay, resetOverlays, HOVER_RING } = (await import(/* @vite-ignore */ `${CHART}/overlays.ts`)) as {
  overlayIds(): string[]; registerOverlay(id: string, f: unknown): void; resetOverlays(): void; HOVER_RING: string;
};

const node = (kind: string, labelCompact: boolean, asset: boolean) =>
  ({ kind, labelCompact, ...(asset ? { asset: 'probe' } : {}) }) as unknown as ViewNode;

/** v0's rule, as labels.ts had it inline before the tiers (as committed at HEAD: `compact`, and the hug). */
function v0(n: ViewNode, s: TierState): { compact: boolean; hug: boolean } {
  const pointed = s.pointed && !(n.kind === 'captain' && s.followed);
  const always = !!n.labelCompact && !s.selected;
  const compact = !pointed && (always || s.recent || s.moving || s.flashed);
  return { compact, hug: compact && n.kind === 'captain' };
}

const FLAGS = ['pointed', 'selected', 'followed', 'recent', 'moving', 'flashed'] as const;
const states: TierState[] = Array.from({ length: 1 << FLAGS.length }, (_, i) =>
  Object.fromEntries(FLAGS.map((f, b) => [f, Boolean(i & (1 << b))])) as unknown as TierState);
const KINDS = ['captain', 'planet', 'galaxy', 'star', 'seat', 'objective'];

describe('tierFor reproduces v0', () => {
  it('goes compact, and hugs the captain, exactly where v0 did (every kind, grid, asset and state)', () => {
    let cases = 0;
    for (const kind of KINDS) for (const grid of [false, true]) for (const asset of [false, true]) for (const s of states) {
      const n = node(kind, grid, asset);
      const t = tierFor(n, s);
      const want = v0(n, s);
      const at = `${kind} grid=${grid} asset=${asset} ${JSON.stringify(s)}`;
      expect(isCompact(t), at).toBe(want.compact);
      expect(t === 'picture', at).toBe(want.hug);
      cases++;
    }
    expect(cases).toBe(KINDS.length * 2 * 2 * 64);
  });

  it('never expands a v0 node; a v1 node expands only when full and pointed at or selected', () => {
    for (const kind of KINDS) for (const grid of [false, true]) for (const s of states) {
      expect(tierFor(node(kind, grid, false), s)).not.toBe('expanded');
      const t = tierFor(node(kind, grid, true), s);
      const open = s.pointed && !(kind === 'captain' && s.followed);
      expect(t === 'expanded').toBe(!isCompact(t) && (open || s.selected));
    }
  });

  it('keeps the named cases of 06 §4', () => {
    const off: TierState = { pointed: false, selected: false, followed: false, recent: false, moving: false, flashed: false };
    // Stopped: Full. Playing: Title, ships their Picture. Pointed while playing: Full, to be read.
    expect(tierFor(node('planet', false, false), off)).toBe('full');
    expect(tierFor(node('planet', false, false), { ...off, recent: true })).toBe('title');
    expect(tierFor(node('captain', false, false), { ...off, recent: true })).toBe('picture');
    expect(tierFor(node('planet', false, false), { ...off, recent: true, pointed: true })).toBe('full');
    // The followed ship stays a picture even when pointed at; a selected one too while playing.
    expect(tierFor(node('captain', false, true), { ...off, moving: true, pointed: true, followed: true })).toBe('picture');
    expect(tierFor(node('captain', false, false), { ...off, moving: true, selected: true })).toBe('picture');
    // A dense grid shows its titles unless selected (or pointed).
    expect(tierFor(node('galaxy', true, false), off)).toBe('title');
    expect(tierFor(node('galaxy', true, false), { ...off, selected: true })).toBe('full');
    // A selected seat folds its rows away while playing, and expands when settled; pointed, at once.
    expect(tierFor(node('seat', false, true), { ...off, selected: true, recent: true })).toBe('title');
    expect(tierFor(node('seat', false, true), { ...off, selected: true })).toBe('expanded');
    expect(tierFor(node('seat', false, true), { ...off, pointed: true, recent: true })).toBe('expanded');
  });
});

describe('the expanded plate (19 L2)', () => {
  const W = 800;
  const H = 600;
  const planet = { cx: 300, cy: 300, r: 20, dirX: 1, dirY: 0 };

  it('keeps its side and pointer, and grows away from its object', () => {
    // Beside the object, out to the right: the near (left) edge and the top stay; the rows run down.
    const right = holo.holoCandidates(planet, 120, 20)[0]!;
    expect(right.side).toBe('right');
    const g = holo.growPlacement(right, 260, 180);
    expect(g.side).toBe('right');
    expect(g.leader).toEqual(right.leader);
    expect([g.rect.x0, g.rect.y0, g.rect.x1, g.rect.y1]).toEqual([right.rect.x0, right.rect.y0, right.rect.x0 + 260, right.rect.y0 + 180]);
    // Out to the left: the near edge is the right one.
    const left = holo.holoCandidates({ ...planet, dirX: -1 }, 120, 20)[0]!;
    expect(left.side).toBe('left');
    const gl = holo.growPlacement(left, 260, 180);
    expect(gl.rect.x1).toBe(left.rect.x1);
    expect(gl.rect.x0).toBe(left.rect.x1 - 260);
    // Upright: below grows down from its top edge, above grows up from its bottom edge, both centred.
    const station = { cx: 300, cy: 300, r: 20 };
    const below = holo.holoVerticalCandidates(station, 100, 30, 'below')[0]!;
    const gb = holo.growPlacement(below, 240, 160);
    expect(gb.rect.y0).toBe(below.rect.y0);
    expect((gb.rect.x0 + gb.rect.x1) / 2).toBe((below.rect.x0 + below.rect.x1) / 2);
    const above = holo.holoVerticalCandidates(station, 100, 30, 'above')[0]!;
    const ga = holo.growPlacement(above, 240, 160);
    expect(ga.rect.y1).toBe(above.rect.y1);
    expect(ga.rect.y0).toBe(above.rect.y1 - 160);
  });

  it('slides along its pointer\'s edge into the view, never off the pointer', () => {
    const low = holo.holoCandidates({ ...planet, cy: 560 }, 120, 20)[0]!;
    const grown = holo.growPlacement(low, 200, 180);
    expect(grown.rect.y1).toBeGreaterThan(H);
    const slid = holo.slidePlacement(grown, W, H);
    expect(slid.rect.y1).toBeLessThanOrEqual(H - 4);
    expect(slid.rect.x0).toBe(grown.rect.x0); // only along the edge the pointer meets
    const [, ey] = slid.leader[slid.leader.length - 1]!;
    expect(ey).toBeGreaterThanOrEqual(slid.rect.y0 + holo.HOLO.cut);
    expect(ey).toBeLessThanOrEqual(slid.rect.y1 - holo.HOLO.cut);
    // An upright plate slides sideways.
    const edge = holo.holoVerticalCandidates({ cx: 790, cy: 200, r: 10 }, 60, 20)[0]!;
    const s = holo.slidePlacement(holo.growPlacement(edge, 240, 100), W, H);
    expect(s.rect.x1).toBeLessThanOrEqual(W - 4);
    expect(s.rect.y0).toBe(edge.rect.y0);
  });

  it('stays where it was when its rows fit, and re-places once when they don\'t', () => {
    const cands = holo.holoCandidates(planet, 120, 20);
    expect(holo.expandAt(cands, 0, 260, 180, W, H)).toBe(0);
    // Near the right edge, out to the right: the grown plate won't fit, so it takes the first place
    // whose grown plate does (the other side).
    const edge = holo.holoCandidates({ ...planet, cx: 640 }, 120, 20);
    const k = holo.expandAt(edge, 0, 260, 180, W, H);
    expect(k).not.toBe(0);
    const at = holo.slidePlacement(holo.growPlacement(edge[k]!, 260, 180), W, H);
    expect(holo.inHoloView(at.rect, W, H)).toBe(true);
    expect(at.side).toBe('left');
    // Clear of obstacles when it can be; and when nothing fits, it stays.
    const blocked = (r: Rect) => r.x1 < 640;
    const k2 = holo.expandAt(edge, 0, 260, 180, W, H, (r) => !blocked(r));
    expect(holo.inHoloView(holo.slidePlacement(holo.growPlacement(edge[k2]!, 260, 180), W, H).rect, W, H)).toBe(true);
    expect(holo.expandAt(edge, 0, 2000, 180, W, H)).toBe(0);
  });

  it('shows at most the shared ROW_BUDGET rows and counts the rest; its timings are 15 §6\'s', () => {
    const rows = Array.from({ length: ROW_BUDGET + 4 }, (_, i) => ({ key: `k${i}` }));
    expect(rowsInBudget({ title: 't', rows, more: 2 })).toEqual({ rows: rows.slice(0, ROW_BUDGET), more: 6 });
    expect([GRACE_MS, LONG_PRESS_MS]).toEqual([450, 450]);
  });
});

describe('the overlay registry', () => {
  it('holds only the hover ring now the mega-label overlay is retired (19 L2); resetOverlays keeps it', () => {
    expect(overlayIds()).toEqual([HOVER_RING]);
    registerOverlay('probe', () => ({}));
    expect(overlayIds()).toContain('probe');
    resetOverlays();
    expect(overlayIds()).toEqual([HOVER_RING]);
  });
});

describe('raisedTier (27 B1: every plate rests at T4 Sky)', () => {
  const none: RaiseState = { pointed: false, selected: false, followed: false, expanded: false, cast: false, acting: false };
  it('is sky with every flag false, whatever the own tier', () => {
    for (const own of ['lead', 'door', 'place', 'sky'] as const) expect(raisedTier(own, none)).toBe('sky');
  });
  it('is the own tier when any one flag is set', () => {
    for (const flag of Object.keys(none) as (keyof RaiseState)[]) expect(raisedTier('door', { ...none, [flag]: true }), flag).toBe('door');
  });
  it("raises a standby station to 'place', not its spec's tier", () => {
    const station = { flags: { standby: true } } as unknown as ViewNode;
    expect(raisedTier(ownTier(station, { tier: 'lead' }), { ...none, pointed: true })).toBe('place');
  });
});

describe('formationSides (27 D1: a formation\'s plates stand away from its line)', () => {
  it('is empty for no member or one', () => {
    expect(formationSides([], 1000).size).toBe(0);
    expect(formationSides([{ pk: 'a', x: 1, y: 1 }], 1000).size).toBe(0);
  });
  it('a vertical stack staggered +-5 is v, its members alternating left and right', () => {
    const m = formationSides([{ pk: 'a', x: 105, y: 100 }, { pk: 'b', x: 95, y: 160 }, { pk: 'c', x: 105, y: 220 }, { pk: 'd', x: 95, y: 280 }], 1000);
    expect([...m.values()].map((v) => v.axis)).toEqual(['v', 'v', 'v', 'v']);
    expect([...m.values()].map((v) => v.side)).toEqual(['right', 'left', 'right', 'left']);
  });
  it('a member on the axis goes toward the view middle', () => {
    const mk = (x: number) => [{ pk: 'a', x, y: 100 }, { pk: 'b', x, y: 200 }, { pk: 'c', x, y: 300 }];
    expect(formationSides(mk(100), 1000).get('b')!.side).toBe('right');
    expect(formationSides(mk(900), 1000).get('b')!.side).toBe('left');
  });
  it('a horizontal line is h: above, below, and null on the axis', () => {
    const m = formationSides([{ pk: 'a', x: 100, y: 95 }, { pk: 'b', x: 200, y: 100 }, { pk: 'c', x: 300, y: 105 }], 1000);
    expect([...m.values()].map((v) => v.axis)).toEqual(['h', 'h', 'h']);
    expect([m.get('a')!.side, m.get('b')!.side, m.get('c')!.side]).toEqual(['above', null, 'below']);
  });
  it('a line turned 15 or 60 degrees still alternates its members', () => {
    const line = (deg: number, px = 6) => {
      const t = (deg * Math.PI) / 180, ax = [Math.cos(t), Math.sin(t)], ac = [-Math.sin(t), Math.cos(t)];
      return [0, 1, 2, 3].map((k) => ({ pk: 'p' + k, x: 500 + (ax[0]! * k * 4 + ac[0]! * (k % 2 ? 1 : -1) * 0.6) * px * 3, y: 500 + (ax[1]! * k * 4 + ac[1]! * (k % 2 ? 1 : -1) * 0.6) * px * 3 }));
    };
    for (const deg of [15, 60]) {
      const sides = [...formationSides(line(deg), 1000).values()].map((v) => v.side);
      expect(sides[0], String(deg)).not.toBe(sides[1]);
      expect(sides[1], String(deg)).not.toBe(sides[2]);
      expect(sides[2], String(deg)).not.toBe(sides[3]);
    }
  });
  it('equal extents are h', () => {
    expect(formationSides([{ pk: 'a', x: 0, y: 0 }, { pk: 'b', x: 50, y: 50 }], 1000).get('a')!.axis).toBe('h');
  });
});
