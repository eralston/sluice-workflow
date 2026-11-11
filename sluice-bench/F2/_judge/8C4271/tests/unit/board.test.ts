// The board in the orbit (06 §3, decided 2026-10-09): rings are people's lanes, A–Z from the top,
// and the arc is the board's columns, left to right. Checked at every event instant of the fixture
// weeks: the order, no overlaps, a frame that never moves, and seeks that land where play does.
import { describe, expect, it, vi } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import sprintPods from '@fixtures/scenarios/sprint-pods';
import { scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { SceneKey, ViewGraph, ViewNode } from '@shared/contracts/view';
import { SPRINTS } from '@shared/hierarchy/sprints';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { BOARD, columnOf, slotsOf } from '@shared/scene/board';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

// These sweep whole fixtures at many playheads: slow under load (v1.3 close-out audit 13), so their limit is explicit.
vi.setConfig({ testTimeout: 60_000 });

const DAY = 86_400_000;
const bodiesOf = (g: ViewGraph) => g.nodes.filter((n) => (n.kind === 'planet' || n.kind === 'anomaly') && n.selectable);
const ringOf = (g: ViewGraph, n: ViewNode) => {
  const e = g.edges.find((x) => x.kind === 'orbit' && x.to === n.projectionKey);
  return e?.geometry?.kind === 'ellipse' ? Math.round(e.geometry.rx) : NaN;
};

/** The scenarios that plan by sprint: the mechanics one, and Halcyon Reach's five pods (20 captains in the biggest). */
const SPRINT_SCENARIOS = [sprintMechanics, sprintPods];

/** The systems to check: the busiest Feature of each Backlog scenario, and every Sprints pod. */
function systems(): { name: string; h: ScopeHistory; scene: SceneKey; hier?: typeof SPRINTS }[] {
  const out: { name: string; h: ScopeHistory; scene: SceneKey; hier?: typeof SPRINTS }[] = [];
  for (const s of scenarios.filter((x) => !SPRINT_SCENARIOS.includes(x))) {
    const h = toHistory(s, mapping);
    for (const f of h.entities.workItems.filter((w) => w.type === 'Feature')) out.push({ name: `${s.name} ${f.key}`, h, scene: `feature:${f.key}` as SceneKey });
  }
  for (const s of SPRINT_SCENARIOS) {
    for (const scope of sprintScopes(s)) {
      const h = toHistory(s, mapping, scope);
      const sk = scenarioKeys(s);
      for (const p of scope.pods) out.push({ name: `${s.name} ${scope.sprint} ${p}`, h, scene: SPRINTS.format({ level: 'pod', key: sk.area(p) }) as SceneKey, hier: SPRINTS });
    }
  }
  return out;
}

const instants = (h: ScopeHistory) => [h.range.startUtc, ...new Set((h.events as AnyTimelineEvent[]).filter((e) => e.occurredAt >= h.range.startUtc).map((e) => e.occurredAt)), h.range.endUtc - 1];
const project = (x: ReturnType<typeof systems>[number], t: number) => projectScene(x.h, snapshotAt(x.h, t, 'knownThen'), x.scene, 1, x.hier);

describe('the board (06 §3)', () => {
  const all = systems().filter((x) => bodiesOf(project(x, x.h.range.endUtc - 1)).length > 0);

  it('has systems to check', () => {
    expect(all.length).toBeGreaterThan(3);
  });

  it.each(all.map((x) => [x.name, x] as const))('%s: left to right by column on every ring, at every instant', (_, x) => {
    for (const t of instants(x.h)) {
      const g = project(x, t);
      const rings = new Map<number, ViewNode[]>();
      for (const n of bodiesOf(g)) (rings.get(ringOf(g, n)) ?? rings.set(ringOf(g, n), []).get(ringOf(g, n))!).push(n);
      for (const ring of rings.values()) {
        const byX = [...ring].sort((a, b) => a.world.x - b.world.x);
        for (let i = 1; i < byX.length; i++) expect(columnOf(byX[i]!.stage), `${new Date(t).toISOString()}`).toBeGreaterThanOrEqual(columnOf(byX[i - 1]!.stage));
      }
    }
  });

  it.each(all.map((x) => [x.name, x] as const))('%s: no two bodies overlap, at every instant', (_, x) => {
    for (const t of instants(x.h)) {
      const b = bodiesOf(project(x, t));
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) {
          const d = Math.hypot(b[i]!.world.x - b[j]!.world.x, b[i]!.world.y - b[j]!.world.y);
          expect(d, `${b[i]!.label} / ${b[j]!.label} at ${new Date(t).toISOString()}`).toBeGreaterThanOrEqual(b[i]!.world.r + b[j]!.world.r);
        }
      }
    }
  });

  it.each(all.map((x) => [x.name, x] as const))('%s: the frame is the same at every instant, and a seek lands where play does', (_, x) => {
    const ref = project(x, x.h.range.endUtc - 1);
    let prev: ViewGraph | null = null;
    for (const t of instants(x.h)) {
      const g = project(x, t);
      expect(g.board).toEqual(ref.board);
      // Projecting again, after other instants, is the same (INV-12).
      if (prev) expect(project(x, t)).toEqual(g);
      prev = g;
    }
  // Projects at every instant of the sprint, twice: the 20-captain pod has hundreds of them.
  }, 60_000);
});

describe('lanes only for people on the board (2026-10-09)', () => {
  const all = systems().filter((x) => bodiesOf(project(x, x.h.range.endUtc - 1)).length > 0);
  it.each(all.map((x) => [x.name, x] as const))('%s: every lane belongs to someone whose work shows in the range', (_, x) => {
    const seen = new Set<string | null>();
    for (const t of instants(x.h)) {
      const snap = snapshotAt(x.h, t, 'knownThen');
      for (const n of bodiesOf(project(x, t))) seen.add(snap.workItems.get(n.canonicalKey)?.assigneeKey ?? null);
    }
    const board = project(x, x.h.range.endUtc - 1).board!;
    for (const head of board.heads) for (const p of head.people) expect(seen.has(p), `${head.name}`).toBe(true);
  });
});

describe('lanes and columns', () => {
  const orbit = scenarios.find((s) => s.name === 'orbit-week')!;
  const h = toHistory(orbit, mapping);
  const k = scenarioKeys(orbit);
  const scene = `feature:${k.wi(101)}` as SceneKey;
  const g = projectScene(h, snapshotAt(h, h.range.endUtc - 1, 'knownThen'), scene, 1);
  const names = new Map(h.entities.captains.map((c) => [c.key, c.displayName]));

  it('lanes run A–Z from the inner ring outward, Unassigned last', () => {
    const heads = g.board!.heads;
    const first = heads.map((x) => x.people[0] ?? null);
    const labels = first.filter((p): p is NonNullable<typeof p> => p !== null).map((p) => names.get(p)!);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })));
    if (first.includes(null)) expect(first.at(-1)).toBeNull();
    // Inner (top) first: each lane's head sits below the last.
    for (let i = 1; i < heads.length; i++) expect(heads[i]!.y).toBeGreaterThan(heads[i - 1]!.y);
  });

  it('a body sits on its assignee’s lane, and a reassignment moves it there', () => {
    const snap = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
    const ringOfLane = new Map(g.board!.rings.map((r) => [Math.round(r.rx), r.lane]));
    for (const n of bodiesOf(g)) {
      const who = snap.workItems.get(n.canonicalKey)?.assigneeKey ?? null;
      const lane = g.board!.heads.findIndex((x) => x.people.includes(who));
      expect(ringOfLane.get(ringOf(g, n))).toBe(lane);
    }
    const moved = (h.events as AnyTimelineEvent[]).find((e) => e.kind === 'wi_assignee_changed' && e.occurredAt >= h.range.startUtc && g.nodes.some((n) => n.canonicalKey === e.entityKey));
    if (moved) {
      const before = projectScene(h, snapshotAt(h, moved.occurredAt - 1, 'knownThen'), scene, 1);
      const after = projectScene(h, snapshotAt(h, moved.occurredAt, 'knownThen'), scene, 1);
      const b = before.nodes.find((n) => n.canonicalKey === moved.entityKey && n.selectable);
      const a = after.nodes.find((n) => n.canonicalKey === moved.entityKey && n.selectable);
      if (a && b) expect(ringOf(after, a)).not.toBe(ringOf(before, b));
    }
  });

  it('done long enough ago, a body is drawn smaller and tucked right', () => {
    const done = bodiesOf(g).filter((n) => columnOf(n.stage) === 3);
    const open = bodiesOf(g).filter((n) => columnOf(n.stage) !== 3);
    expect(done.length).toBeGreaterThan(0);
    // At the range's end some were accomplished more than `doneAfterDays` before; those are compact.
    const late = projectScene(h, snapshotAt(h, h.range.endUtc + 30 * DAY, 'knownThen'), scene, 1);
    for (const n of bodiesOf(late).filter((x) => columnOf(x.stage) === 3)) expect(n.world.r).toBeLessThan(110 * BOARD.doneScale + 20);
    for (const n of open) expect(n.world.r).toBeGreaterThan(100);
  });

  it('maps every story and bug stage to a column', () => {
    expect(columnOf('story.uncharted')).toBe(0);
    expect(columnOf('story.terraforming')).toBe(1);
    expect(columnOf('bug.contractedAccept')).toBe(2);
    expect(columnOf('story.lush')).toBe(3);
    expect(columnOf('unknown')).toBe(0); // neutral (INV-11)
  });
});

// B4 (06 §3, 08 §6): the v0 board lays work out in the team board's columns, in its order, a split column as
// two; work with no column keeps the ladder placement.
describe('team board columns (B4)', () => {
  const scope = sprintScopes(sprintPods).find((s) => s.sprint.endsWith('Sprint 41'))!;
  const h = toHistory(sprintPods, mapping, scope);
  const k = scenarioKeys(sprintPods);
  const quasar = SPRINTS.format({ level: 'pod', key: k.area('Halcyon Reach\\Quasar Pod') }) as SceneKey;
  const at = (t: number, hist = h, scene = quasar) => projectScene(hist, snapshotAt(hist, t, 'knownThen'), scene, 1, SPRINTS);
  const end = h.range.endUtc - 1;
  const SLOTS = ['New', 'Ready', 'Active', 'Code Review', 'Resolved: Doing', 'Resolved: Done', 'Closed'];

  it('the slots are the board’s columns in order, a split column as Doing and Done', () => {
    expect(slotsOf(h).names).toEqual(SLOTS);
    expect(slotsOf(h).done).toEqual([false, false, false, false, false, false, true]);
    // Ready and Active are both In Progress on this board: Underway lands on the first, Nearing on the last (the Done half).
    expect(slotsOf(h).ladder).toEqual([0, 1, 5, 6]);
    // One heading per board column: the split one is a single heading with Doing / Done sub-labels.
    expect(at(end).board!.columns!.map((c) => [c.name, c.split])).toEqual([['New', false], ['Ready', false], ['Active', false], ['Code Review', false], ['Resolved', true], ['Closed', false]]);
    expect(at(end).board!.ticks).toHaveLength(SLOTS.length - 1);
  });

  it('the headings run left to right over the first lane', () => {
    const cols = at(end).board!.columns!;
    for (let i = 1; i < cols.length; i++) expect(cols[i]!.x).toBeGreaterThan(cols[i - 1]!.x);
  });

  it('a body sits in its column: Code Review is right of Active and left of Resolved, on every ring', () => {
    const placed = new Map<string, { at: number; column: string; done: boolean }[]>();
    for (const p of h.board!.placements) (placed.get(p.key) ?? placed.set(p.key, []).get(p.key)!).push(p);
    const slotOfName = new Map(SLOTS.map((n, i) => [n, i]));
    let sawReview = 0;
    for (const t of instants(h)) {
      const g = at(t);
      const rings = new Map<number, { x: number; slot: number }[]>();
      for (const n of bodiesOf(g)) {
        const last = (placed.get(n.canonicalKey) ?? []).filter((p) => p.at <= t).at(-1);
        if (!last || !last.column) continue;
        const slot = slotOfName.get(last.column === 'Resolved' ? (last.done ? 'Resolved: Done' : 'Resolved: Doing') : last.column)!;
        if (last.column === 'Code Review') sawReview++;
        const ring = ringOf(g, n);
        (rings.get(ring) ?? rings.set(ring, []).get(ring)!).push({ x: n.world.x, slot });
      }
      for (const ring of rings.values()) {
        const byX = [...ring].sort((a, b) => a.x - b.x);
        for (let i = 1; i < byX.length; i++) expect(byX[i]!.slot, new Date(t).toISOString()).toBeGreaterThanOrEqual(byX[i - 1]!.slot);
      }
    }
    expect(sawReview).toBeGreaterThan(0);
  });

  it('a split column’s Done half sits right of its Doing half', () => {
    const doing = h.board!.placements.find((p) => p.column === 'Resolved' && !p.done)!;
    const done = h.board!.placements.find((p) => p.key === doing.key && p.column === 'Resolved' && p.done);
    expect(done, 'an item that went Resolved then Ready to Accept').toBeDefined();
    const x = (t: number) => at(t).nodes.find((n) => n.canonicalKey === doing.key && n.selectable)?.world.x;
    // The frame is fixed over the history, so the same body is further right once it is in the Done half.
    expect(x(done!.at + 1)!).toBeGreaterThan(x(doing.at + 1)!);
  });

  it('work with no column keeps the ladder placement; so does a column the board doesn’t have', () => {
    const plain = { ...h, board: undefined } as ScopeHistory;
    delete plain.board;
    expect(slotsOf(plain).names).toEqual([...BOARD.columns]);
    expect(slotsOf(plain).ladder).toEqual([0, 1, 2, 3]);
    expect(at(end, plain).board!.columns).toBeUndefined();
    // A board whose columns match nothing a body is in: every body falls back to its ladder slot, on the board's slots.
    const stray = { ...h, board: { columns: h.board!.columns, placements: h.board!.placements.map((p) => ({ ...p, column: 'Gone' })) } } as ScopeHistory;
    const ladder = slotsOf(stray).ladder;
    const g = at(end, stray);
    const onBoard = at(end);
    // Same bodies, and each is where the ladder puts it: the order of stages along a ring is nondecreasing.
    for (const ring of new Set(bodiesOf(g).map((n) => ringOf(g, n)))) {
      const byX = bodiesOf(g).filter((n) => ringOf(g, n) === ring).sort((a, b) => a.world.x - b.world.x);
      for (let i = 1; i < byX.length; i++) expect(ladder[columnOf(byX[i]!.stage)]).toBeGreaterThanOrEqual(ladder[columnOf(byX[i - 1]!.stage)]!);
    }
    expect(bodiesOf(g).length).toBe(bodiesOf(onBoard).length);
  });

  it('the ladder maps monotonically onto boards of 1, 2 and 3 slots, and with a split column', () => {
    const col = (name: string, type: 'incoming' | 'inProgress' | 'outgoing', split = false) => ({ name, type, split });
    const ladder = (cols: ReturnType<typeof col>[]) => slotsOf({ ...h, board: { columns: cols, placements: [] } } as ScopeHistory).ladder;
    expect(ladder([col('A', 'incoming')])).toEqual([0, 0, 0, 0]);
    expect(ladder([col('A', 'incoming'), col('B', 'outgoing')])).toEqual([0, 1, 1, 1]);
    expect(ladder([col('A', 'incoming'), col('B', 'inProgress'), col('C', 'outgoing')])).toEqual([0, 1, 1, 2]);
    expect(ladder([col('A', 'incoming'), col('B', 'inProgress', true), col('C', 'outgoing')])).toEqual([0, 1, 2, 3]);
    for (const cols of [[col('A', 'incoming')], [col('A', 'incoming'), col('B', 'outgoing')], [col('A', 'incoming'), col('B', 'inProgress'), col('C', 'outgoing')], [col('A', 'incoming'), col('B', 'inProgress', true), col('C', 'inProgress'), col('D', 'outgoing')]]) {
      const l = ladder(cols);
      for (let i = 1; i < 4; i++) expect(l[i]!).toBeGreaterThanOrEqual(l[i - 1]!);
    }
  });

  it('every body and the frame still obey the board rules with a board of columns: no overlaps, a frame that never moves', () => {
    const ref = at(end);
    for (const t of instants(h)) {
      const g = at(t);
      expect(g.board!.rings.map((r) => r.rx)).toEqual(ref.board!.rings.map((r) => r.rx));
      expect(g.board!.ticks).toEqual(ref.board!.ticks);
      const b = bodiesOf(g);
      for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
        expect(Math.hypot(b[i]!.world.x - b[j]!.world.x, b[i]!.world.y - b[j]!.world.y)).toBeGreaterThanOrEqual(b[i]!.world.r + b[j]!.world.r);
      }
    }
  });
});
