// Pieces' labels in play (19 L7, chart/fx/v1/castLabels.ts): a window per cast piece on the beat's
// clock, open from its start to its end, then fading over CAST_LABEL_FADE_MS (or straight off in
// reduced motion); overlapping windows take the brightest; a tell's tagged window can be retired when
// its maneuver is dropped; paused, the labels fade out on the wall clock and back on resume; a clear
// (a seek) drops them all (INV-15). While its maneuver plays a plate wears its event's note (22 B6),
// and at most ATTENTION_MAX labels show at once, pieces' plates and named captains together (22 B7,
// C10): a lingering one gives way, crossfading, to one whose maneuver starts or a captain being named;
// any other waits. The budget cases name two captains throughout, so two places are left for pieces.
// Renderer code sits outside this project's tsconfig, so it is loaded by a runtime path (as in
// labelTiers.test.ts).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

interface CastLabels {
  show(pk: string, fromS: number, toS: number, opts?: { tag?: string; holdFromS?: number; holdToS?: number; note?: string; eventKey?: string }): void; showing(tag: string): boolean; retire(tag: string): void;
  step(dtS: number, paused?: boolean, wallS?: number): void; clear(): void; now(fade?: boolean): Map<string, number>;
  notes(): Map<string, { text: string; eventKey: string }>; playing(): string[];
  showCrew(pk: string, fromS: number, toS: number, text: string, eventKey: string, turn?: boolean): void; crew(fade?: boolean, flying?: (pk: string) => number | undefined): Map<string, { u: number; text: string; eventKey: string }>;
}
const FX = resolve(__dirname, '../../src/renderer/src/chart/fx');
const { CastLabels } = (await import(/* @vite-ignore */ `${FX}/v1/castLabels.ts`)) as { CastLabels: new () => CastLabels };
const { CAST_LABEL_FADE_MS } = (await import(/* @vite-ignore */ `${FX}/timing.ts`)) as { CAST_LABEL_FADE_MS: number };
const fadeS = CAST_LABEL_FADE_MS / 1000;
const { ATTENTION_MAX } = (await import(/* @vite-ignore */ resolve(__dirname, '../../src/shared/engine/maneuvers.ts'))) as { ATTENTION_MAX: number };
/** Two captains named throughout (22 C10): of the four places, two are left for pieces. */
const twoNamed = (c: CastLabels) => { c.showCrew('s1', 0, 99, 'Author', 'k1'); c.showCrew('s2', 0, 99, 'Approved', 'k2'); };

describe('cast labels (19 L7)', () => {
  it('opens at its start, holds to its end, then fades out and is dropped', () => {
    const c = new CastLabels();
    c.show('a', 0.5, 2);
    expect(c.now().has('a')).toBe(false);
    c.step(0.6);
    expect(c.now().get('a')).toBe(1);
    c.step(1.4); // at its end
    expect(c.now().get('a')).toBe(1);
    c.step(fadeS / 2);
    expect(c.now().get('a')).toBeCloseTo(0.5, 5);
    c.step(fadeS);
    expect(c.now().size).toBe(0);
  });

  it('goes straight off at its end without a fade (reduced motion)', () => {
    const c = new CastLabels();
    c.show('a', 0, 1);
    c.step(1.01);
    expect(c.now(false).size).toBe(0);
    expect(c.now(true).get('a')).toBeGreaterThan(0);
  });

  it('takes the brightest of a piece\'s overlapping windows, and starts a late-told one now', () => {
    const c = new CastLabels();
    c.show('a', -1, 1); // the tell's lead is already past: open now
    c.show('a', 0.8, 3);
    expect(c.now().get('a')).toBe(1);
    c.step(1 + fadeS / 2); // the first is fading, the second open
    expect(c.now().get('a')).toBe(1);
  });

  it('drops every window on a clear (a seek, INV-15), and ignores an empty one', () => {
    const c = new CastLabels();
    c.show('a', 0, 2);
    c.show('b', 0, 0);
    c.step(0.1);
    expect([...c.now().keys()]).toEqual(['a']);
    c.clear();
    expect(c.now().size).toBe(0);
  });

  it('retires a dropped maneuver\'s told windows: an open one fades, a later one never opens', () => {
    const c = new CastLabels();
    c.show('a', 0, 2, { tag: 'm1' });
    c.show('b', 1, 2, { tag: 'm1' });
    c.show('c', 0, 2, { tag: 'm2' });
    c.step(0.5);
    expect(c.showing('m1')).toBe(true);
    c.retire('m1');
    expect(c.showing('m1')).toBe(false);
    c.step(fadeS / 2);
    expect(c.now().get('a')).toBeCloseTo(0.5, 5);
    expect(c.now().get('c')).toBe(1);
    c.step(1);
    expect([...c.now().keys()]).toEqual(['c']); // b never opened
  });

  it('fades out while paused, holding its window, and fades back on resume', () => {
    const c = new CastLabels();
    c.show('a', 0, 1);
    c.step(0.5);
    c.step(0.5, true, fadeS / 2); // paused: the window holds, the label fades on the wall clock
    expect(c.now().get('a')).toBeCloseTo(0.5, 5);
    expect(c.now(false).size).toBe(0); // reduced motion: straight off
    c.step(10, true, 10);
    expect(c.now().size).toBe(0);
    c.step(fadeS / 4, false, fadeS / 4); // resumed: back, and the window still open
    expect(c.now().get('a')).toBeCloseTo(0.25, 5);
    expect(c.now(false).get('a')).toBe(1);
  });

  it('wears its note while it shows, and names its event as playing until it fades (22 B6)', () => {
    const c = new CastLabels();
    c.show('a', 0, 2, { holdFromS: 0, holdToS: 1, note: 'Assigned to Mara Lind', eventKey: 'e1' });
    c.step(0.1);
    expect(c.notes().get('a')).toEqual({ text: 'Assigned to Mara Lind', eventKey: 'e1' });
    expect(c.playing()).toEqual(['e1']);
    c.step(2 + fadeS / 2); // past its window: fading, still saying it with its plate
    expect(c.playing()).toEqual(['e1']);
    c.step(fadeS);
    expect(c.notes().size).toBe(0);
    expect(c.playing()).toEqual([]);
  });

  it('with two captains named, shows two plates (22 B7, C10): a third waits for a place', () => {
    const c = new CastLabels();
    twoNamed(c);
    c.show('a', 0, 3, { holdFromS: 0, holdToS: 3, eventKey: 'ea', note: 'a' });
    c.show('b', 0, 3, { holdFromS: 0, holdToS: 3, eventKey: 'eb', note: 'b' });
    c.show('c', 0, 5, { holdFromS: 0, holdToS: 5, eventKey: 'ec', note: 'c' });
    c.step(0.1);
    expect([...c.now().keys()].sort()).toEqual(['a', 'b']);
    expect(c.playing()).toEqual(['ea', 'eb']);
    c.step(3); // a and b end; c takes a place as they fade
    c.step(fadeS);
    expect([...c.now().keys()]).toEqual(['c']);
  });

  it('a plate lingering after its maneuver gives way to one starting, crossfading (22 B7)', () => {
    const c = new CastLabels();
    twoNamed(c);
    c.show('a', 0, 3, { holdFromS: 0, holdToS: 1 }); // lingers from 1 s
    c.show('b', 0, 3, { holdFromS: 0, holdToS: 3 });
    c.show('c', 1.5, 4, { holdFromS: 1.5, holdToS: 4 });
    c.step(1.5); // c starts: a, lingering, gives its place up
    c.step(fadeS / 4);
    const now = c.now();
    expect(now.get('c')).toBeCloseTo(0.25, 5); // fading up
    expect(now.get('a')).toBeCloseTo(0.75, 5); // fading down
    expect(now.get('b')).toBe(1);
    c.step(fadeS);
    expect([...c.now().keys()].sort()).toEqual(['b', 'c']);
    expect(c.now().get('c')).toBe(1);
  });

  it('two plates lingering give up one place each, never two for one (review: three at once)', () => {
    const c = new CastLabels();
    twoNamed(c);
    c.show('a', 0, 4, { holdFromS: 0, holdToS: 1 });
    c.show('b', 0, 4, { holdFromS: 0, holdToS: 1 });
    c.step(1.5); // both linger
    c.show('c', 0, 4, { holdFromS: 0, holdToS: 4 });
    c.show('d', 0, 4, { holdFromS: 0, holdToS: 4 });
    c.step(fadeS * 2);
    const up = [...c.now()].filter(([, a]) => a > 0.5).map(([k]) => k).sort();
    expect(up).toEqual(['c', 'd']);
  });

  it('a piece still playing one maneuver never gives its place up for another piece (review)', () => {
    const c = new CastLabels();
    twoNamed(c);
    c.show('x', 0, 4, { holdFromS: 0, holdToS: 0.5, eventKey: 'x1', note: 'one' }); // lingers from 0.5 s
    c.show('x', 0, 4, { holdFromS: 0, holdToS: 4, eventKey: 'x2', note: 'two' }); // still plays
    c.show('b', 0, 4, { holdFromS: 0, holdToS: 4 });
    c.step(1);
    c.show('y', 0, 4, { holdFromS: 0, holdToS: 4 });
    c.step(fadeS);
    expect(c.now().get('x')).toBe(1);
    expect(c.now().has('y')).toBe(false); // it waits
    expect(c.notes().get('x')).toEqual({ text: 'two', eventKey: 'x2' }); // the maneuver playing speaks
  });

  it('says nothing paused, and nothing in a lead (review)', () => {
    const c = new CastLabels();
    c.show('a', 0, 3, { holdFromS: 1, holdToS: 3, eventKey: 'e', note: 'n' });
    c.step(0.5);
    expect(c.now().get('a')).toBe(1); // its lead: the title shows
    expect(c.playing()).toEqual([]); // but no note yet
    c.step(1);
    expect(c.playing()).toEqual(['e']);
    c.step(0, true, 0.1);
    expect(c.playing()).toEqual([]);
    expect(c.notes().size).toBe(0);
  });

  it('an acting captain unfurls for their maneuver, then folds (22 B9)', () => {
    const c = new CastLabels();
    c.show('p1', 0, 4, { holdFromS: 0, holdToS: 4 });
    c.show('p2', 0, 4, { holdFromS: 0, holdToS: 4 });
    c.showCrew('ship', 1, 2, 'Author', 'e1');
    c.step(0.5);
    expect(c.crew().size).toBe(0); // not yet
    c.step(0.76); // 0.26 s into its unfurl: half open
    expect(c.crew().get('ship')).toMatchObject({ text: 'Author', eventKey: 'e1' });
    expect(c.crew().get('ship')!.u).toBeCloseTo(0.5, 1);
    expect([...c.now().keys()].sort()).toEqual(['p1', 'p2']); // three labels in all: room for each
    c.step(0.5);
    expect(c.crew().get('ship')!.u).toBe(1);
    c.step(0.5); // past its end (2 s): folding
    expect(c.crew().get('ship')!.u).toBeLessThan(1);
    c.step(1);
    expect(c.crew().size).toBe(0);
    expect(c.crew(false).size).toBe(0);
  });

  it('a captain’s part folds with a pause and goes on a seek (22 B9, INV-15)', () => {
    const c = new CastLabels();
    c.showCrew('ship', 0, 5, 'Approved', 'e');
    c.step(1);
    expect(c.crew().get('ship')!.u).toBe(1);
    c.step(0, true, fadeS / 2);
    expect(c.crew().get('ship')!.u).toBeCloseTo(0.5, 5);
    expect(c.crew(false).size).toBe(0); // reduced motion: straight off
    c.clear();
    expect(c.crew().size).toBe(0);
  });

  it('a captain on a sortie is named as it flies it, not as planned: shut in flight, open parked (22 B9)', () => {
    const c = new CastLabels();
    c.showCrew('ship', 0, 2, 'Author', 'e');
    c.step(1);
    expect(c.crew(true, () => 0).size).toBe(0); // still in flight, or held back: not named
    expect(c.crew(true, () => 0.5).get('ship')!.u).toBe(0.5); // parked, unfurling
    c.step(4); // past the planned close: a late flight still speaks for it
    expect(c.crew(true, () => 1).get('ship')).toMatchObject({ u: 1, text: 'Author' });
    expect(c.crew(true).size).toBe(0); // as planned, it has folded
  });

  it('a plate fading out keeps its place until it goes: a newcomer crossfades in, never three at once (22 C2)', () => {
    const c = new CastLabels();
    twoNamed(c);
    c.show('a', 0, 1, { holdFromS: 0, holdToS: 1 });
    c.show('b', 0, 3, { holdFromS: 0, holdToS: 3 });
    c.step(1.1); // a fading
    c.show('c', 0, 3, { holdFromS: 0, holdToS: 3 });
    for (let i = 0; i < 10; i++) {
      c.step(0.05);
      expect([...c.now().values()].filter((x) => x > 0.55).length).toBeLessThanOrEqual(2);
    }
    expect([...c.now().keys()].sort()).toEqual(['b', 'c']);
  });

  it('four labels at most (22 C10): four plates, or a merge’s piece with its author and two reviewers', () => {
    expect(ATTENTION_MAX).toBe(4);
    const c = new CastLabels();
    for (const k of ['a', 'b', 'c', 'd', 'e']) c.show(k, 0, 3, { holdFromS: 0, holdToS: 3 });
    c.step(0.1);
    expect([...c.now().keys()].sort()).toEqual(['a', 'b', 'c', 'd']); // e waits
    const m = new CastLabels();
    m.show('piece', 0, 4, { holdFromS: 0, holdToS: 4 });
    for (const s of ['author', 'r1', 'r2']) m.showCrew(s, 0, 4, 'part', 'merge');
    m.show('other', 0, 4, { holdFromS: 0, holdToS: 4 });
    m.step(0.6);
    expect([...m.now().keys()]).toEqual(['piece']); // the other piece waits for the merge's crew
    expect(m.crew().size).toBe(3);
  });

  it('a captain being named takes a lingering plate’s place, crossfading (22 C10)', () => {
    const c = new CastLabels();
    for (const k of ['a', 'b', 'c']) c.show(k, 0, 5, { holdFromS: 0, holdToS: 5 });
    c.show('d', 0, 5, { holdFromS: 0, holdToS: 1 }); // lingers from 1 s
    c.step(1.5);
    c.showCrew('ship', 0, 3, 'Author', 'e');
    c.step(fadeS * 2);
    const up = [...c.now()].filter(([, a]) => a > 0.5).map(([k]) => k).sort();
    expect(up).toEqual(['a', 'b', 'c']);
    expect(c.crew().has('ship')).toBe(true);
  });

  it('a volley’s turn (27 E6) folds on its window though the ship stays parked for the next turns', () => {
    const parked = () => 1; // the sortie holds open through every turn
    const c = new CastLabels();
    c.showCrew('ship', 0, 2, 'Author', 'e1', true);
    c.showCrew('other', 0, 2, 'Author', 'e2'); // a plain window: the flight speaks for it
    c.step(1);
    expect(c.crew(true, parked).get('ship')?.u).toBe(1);
    c.step(1 + fadeS * 4); // past the window and its fold
    expect(c.crew(true, parked).has('ship')).toBe(false);
    expect(c.crew(true, parked).has('other')).toBe(true);
    // And never opens before the flight does.
    const d = new CastLabels();
    d.showCrew('ship', 0, 2, 'Author', 'e1', true);
    d.step(1);
    expect(d.crew(true, () => 0).has('ship')).toBe(false);
  });
});
