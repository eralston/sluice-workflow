// Slice 3a — the Task radar (06 §3, INV-14 amended): each Task keeps one spoke angle for the whole
// history; its band follows its displayed stage; seeks are idempotent; no two Tasks share a spoke.
import { describe, expect, it } from 'vitest';
import orbitWeek from '@fixtures/scenarios/orbit-week';
import { scenarioKeys, toHistory } from '@fixtures/dsl';
import { RADAR_ARC, radarAngles, radarBand } from '@shared/scene/layout';
import { projectScene } from '@shared/scene/projectScene';
import { snapshotAt } from '@shared/replay/snapshotAt';
import type { SceneKey } from '@shared/contracts/view';
import { mapping } from '../golden/helpers';

const lantern = toHistory(orbitWeek, mapping, { project: 'Nimbus Deck', area: 'Nimbus Deck\\Lantern Squad' });
const k = scenarioKeys(orbitWeek);
const scene = `body:${k.wi(251)}` as SceneKey;
const graphAt = (t: number) => projectScene(lantern, snapshotAt(lantern, t, 'knownThen'), scene, 1);
/** Every instant something happens in the week, plus the range ends. */
const instants = [lantern.range.startUtc - 1, ...lantern.events.filter((e) => e.occurredAt >= lantern.range.startUtc).map((e) => e.occurredAt), lantern.range.endUtc - 1];

describe('Task radar (06 §3)', () => {
  it('spokes are evenly spread along the front arc, left to right, one per Task ever linked', () => {
    const a = radarAngles(21);
    expect(a).toHaveLength(21);
    for (let i = 1; i < a.length; i++) expect(a[i]!).toBeLessThan(a[i - 1]!); // 210° down through 90° to −30°
    expect(a[0]!).toBeLessThan(RADAR_ARC[0]);
    expect(a.at(-1)!).toBeGreaterThan(RADAR_ARC[1]);
    expect(radarAngles(1)[0]!).toBeCloseTo(Math.PI / 2, 2); // a lone Task sits straight in front
  });

  it('a few Tasks cluster at the front instead of stretching to the ends (slice 6)', () => {
    const three = radarAngles(3);
    const six = radarAngles(6);
    // Three keep six Tasks' spacing, centered: the middle one faces straight ahead and the outer two are inside the six's ends.
    expect(three[1]!).toBeCloseTo(Math.PI / 2, 2);
    expect(three[0]! - three[1]!).toBeCloseTo(six[1]! - six[2]!, 1);
    expect(three[0]!).toBeLessThan(six[0]!);
    expect(three.at(-1)!).toBeGreaterThan(six.at(-1)!);
    // Six is where the whole arc is used again: its ends sit half a slot inside the arc's.
    expect(six[0]! - six[1]!).toBeGreaterThan(0);
  });

  it("a Task's angle is the same at every instant; its band follows its stage", () => {
    const angle = new Map<string, number>();
    for (const t of instants) {
      const g = graphAt(t);
      const snap = snapshotAt(lantern, t, 'knownThen');
      for (const n of g.nodes.filter((x) => x.radar)) {
        const seen = angle.get(n.canonicalKey);
        if (seen === undefined) angle.set(n.canonicalKey, n.radar!.angle);
        else expect(n.radar!.angle).toBe(seen);
        expect(n.radar!.band).toBe(radarBand(snap.workItems.get(n.canonicalKey)!.stage));
      }
    }
    expect(angle.size).toBe(21);
  });

  it('no two Tasks share a spoke', () => {
    const g = graphAt(lantern.range.endUtc - 1);
    const angles = g.nodes.filter((n) => n.radar).map((n) => n.radar!.angle.toFixed(6));
    expect(new Set(angles).size).toBe(angles.length);
  });

  it('a state change moves a Task only along its spoke (radially)', () => {
    let prev = graphAt(instants[0]!);
    for (const t of instants.slice(1)) {
      const g = graphAt(t);
      const before = new Map(prev.nodes.filter((n) => n.radar).map((n) => [n.projectionKey, n]));
      for (const n of g.nodes.filter((x) => x.radar)) {
        const b = before.get(n.projectionKey);
        if (!b) continue;
        // Same direction from the planet (in the band's squashed frame), any radius.
        expect(Math.atan2(n.world.y * 2, n.world.x)).toBeCloseTo(Math.atan2(b.world.y * 2, b.world.x), 6);
      }
      prev = g;
    }
  });

  it('seeking is idempotent: the radar at t is the same after visiting other instants', () => {
    const t = Date.parse('2026-09-17T18:00:00Z');
    const first = JSON.stringify(graphAt(t));
    for (const u of instants) graphAt(u);
    expect(JSON.stringify(graphAt(t))).toBe(first);
  });

  it('a removed Task leaves the radar; the tally counts each band', () => {
    const g = graphAt(lantern.range.endUtc - 1);
    expect(g.nodes.some((n) => n.canonicalKey === k.wi(469))).toBe(false);
    const body = g.nodes.find((n) => n.canonicalKey === k.wi(251))!;
    const total = body.tally!.reduce((s, t) => s + t.count, 0);
    expect(total).toBe(g.nodes.filter((n) => n.radar).length);
    expect(g.radar!.spokes).toBe(21);
  });
});
