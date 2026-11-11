// Multi-fire volleys (27 E6, 05 §8.4a M-31, B-21): merges into one facility close together in x on one day play
// as one Power link, their beats fused. Every pod's schedule read back through the planner.
import { describe, expect, it, vi } from 'vitest';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import type { Beat, Volley } from '@shared/contracts/playback';
import { VOLLEY_WINDOW_MS, volleysOf } from '@shared/engine/director';
import { sceneFacts } from '@shared/engine/facts';
import { ATTENTION_MAX, momentsOf, priorityFor, volleyPhases, volleyTurns, VOLLEY_TURN_MS, type VolleyMember } from '@shared/engine/maneuvers';
import { PACE_RULES, pieceAt, RULE } from '@shared/engine/pace';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { packFor } from '@shared/packs/registry';
import { localDay } from '@shared/playback/schedule';
import { planOf, resolvePods, scheduleOf } from '../../scripts/pacing-ledger';

vi.setConfig({ testTimeout: 180_000 });

const pods = resolvePods();
type Pod = (typeof pods)[number];
const memberEvent = (k: string) => k.slice(0, k.lastIndexOf('|'));

/** A pod's schedule with volleys and without, and every played beat's plan. */
function both(rp: Pod) {
  const sch = scheduleOf(rp.h, rp.scene, rp.tz, {});
  const raw = scheduleOf(rp.h, rp.scene, rp.tz, { volleys: false });
  const rawBeat = new Map<string, number>();
  raw.beats.forEach((b, i) => { for (const k of b.eventKeys) rawBeat.set(k, i); });
  const plans = new Map<Beat, PlannedManeuver[]>();
  for (const b of sch.beats.filter((x) => x.durationMs > 0)) plans.set(b, planOf(rp.h, rp.areaKey, b, sch.limelight, {}));
  return { sch, raw, rawBeat, plans, dir: sch.limelight!.direction! };
}

/** The raw beats as `volleysOf` reads them, with the pod's own facts, priority and zone. */
function rawGroups(rp: Pod) {
  const raw = scheduleOf(rp.h, rp.scene, rp.tz, { volleys: false });
  const byKey = new Map(rp.h.events.map((e) => [e.eventKey, e]));
  const f = sceneFacts(paceFacts(rp.h), rp.areaKey);
  const prio: NonNullable<Parameters<typeof momentsOf>[4]> = priorityFor(packFor(rp.h), paceFacts) ?? ((_h, e) => e.priority);
  return { beats: raw.beats.map((b) => b.eventKeys.flatMap((k) => byKey.get(k) ?? [])), f, prio };
}

const sorted = (v: { fuse: readonly (readonly [number, number])[]; volleys: ReadonlyMap<string, Volley> }) =>
  JSON.stringify({ fuse: v.fuse, volleys: [...v.volleys].sort((a, b) => (a[0] < b[0] ? -1 : 1)) });

describe('volleys, on every pod', () => {
  for (const rp of pods) {
    describe(rp.label, () => {
      const { sch, rawBeat, plans, dir } = both(rp);
      const volleys = [...(dir.volleys?.values() ?? [])];
      const f = sceneFacts(paceFacts(rp.h), rp.areaKey);
      const at = new Map(rp.h.events.map((e) => [e.eventKey, e.occurredAt]));

      // Each member's own touches, from its base draft in its raw beat (subject and targets).
      const volleyCasts = new Map<string, CanonicalKey[]>();
      {
        const g = volleys.length ? rawGroups(rp) : undefined;
        for (const v of volleys) for (const k of v.members) {
          const e = memberEvent(k);
          const beat = g!.beats.find((es) => es.some((x) => x.eventKey === e))!;
          const m = momentsOf(rp.h, beat, g!.f, PACE_RULES, g!.prio).find((x) => x.key === k)!;
          volleyCasts.set(e, [...(m.subject ? [m.subject] : []), ...m.targets]);
        }
      }

      it('is deterministic: two fresh builds group alike', () => {
        const again = scheduleOf(rp.h, rp.scene, rp.tz, {}).limelight!.direction!;
        expect(sorted({ fuse: again.fuse ?? [], volleys: again.volleys ?? new Map() })).toBe(sorted({ fuse: dir.fuse ?? [], volleys: dir.volleys ?? new Map() }));
      });

      it('no group spans a day turn; members play within the window; ranges are disjoint', () => {
        for (const v of volleys) {
          const days = new Set(v.members.map((k) => localDay(at.get(memberEvent(k))!, rp.tz)));
          expect(days.size, v.members[0]).toBe(1);
          for (const x of v.atMs) expect(x - v.atMs[0]!).toBeLessThanOrEqual(VOLLEY_WINDOW_MS);
          expect(v.members.length).toBeGreaterThan(1);
        }
        // Each fused beat lies on one day, from its first event to its last.
        for (const b of sch.beats) {
          const first = at.get(b.eventKeys[0]!)!;
          const last = at.get(b.eventKeys.at(-1)!)!;
          if (new Set(b.eventKeys.map((k) => rawBeat.get(k))).size > 1) expect(localDay(first, rp.tz)).toBe(localDay(last, rp.tz));
        }
        const fuse = dir.fuse ?? [];
        fuse.forEach(([a, b], i) => {
          expect(b).toBeGreaterThan(a);
          if (i) expect(a).toBeGreaterThan(fuse[i - 1]![1]);
        });
      });

      it('B-15 end to end: per key a fused beat touches, its plays keep history order', () => {
        for (const [b, ms] of plans) {
          const raws = new Set(b.eventKeys.map((k) => rawBeat.get(k)));
          if (raws.size < 2) continue;
          // agent.light is staggered, not sequenced: it plays alongside, so it is left out.
          const plays = ms.filter((m) => m.id !== RULE.agentLight);
          const touches = (m: PlannedManeuver, key: string) => (m.volley ? m.volley.members : [m.eventKey]).flatMap((e) => {
            // A member touches what its own cast did: its tender and the pieces its work is.
            const mine = m.volley ? volleyCasts.get(e) : [...(m.cast.subject ?? []), ...(m.cast.target ?? [])];
            return (mine ?? []).some((k) => pieceAt(f, k, at.get(e)!) === key) ? [rawBeat.get(e)!] : [];
          });
          const keys = new Set(plays.flatMap((m) => (m.volley ? m.volley.members : [m.eventKey]).flatMap((e) =>
            (m.volley ? volleyCasts.get(e) ?? [] : [...(m.cast.subject ?? []), ...(m.cast.target ?? [])]).map((k) => pieceAt(f, k, at.get(e)!)))));
          for (const key of keys) {
            const seq = plays.map((m) => ({ m, beats: touches(m, key) })).filter((x) => x.beats.length).sort((a, b2) => a.m.afterMs - b2.m.afterMs);
            let prev = -1;
            for (const { m, beats } of seq) {
              const own = Math.max(...beats);
              expect(own, `${key}: ${m.eventKey}|${m.id} plays after a later beat's work`).toBeGreaterThanOrEqual(prev);
              prev = own;
            }
          }
        }
      });

      it('every participant is in its formation', () => {
        if (!volleys.length) return;
        const undirected = scheduleOf(rp.h, rp.scene, rp.tz, { direct: false });
        const plain = new Map<string, PlannedManeuver>();
        for (const b of undirected.beats.filter((x) => x.durationMs > 0)) {
          for (const m of planOf(rp.h, rp.areaKey, b, undirected.limelight, { direct: false })) if (m.id === RULE.attachmentMerge) plain.set(m.eventKey, m);
        }
        const carriers = [...plans.values()].flat().filter((m) => m.volley);
        expect(carriers.length).toBe(volleys.length);
        for (const c of carriers) {
          const v = dir.volleys!.get(`${c.eventKey}|${c.id}`)!;
          expect(c.cast.agent).toEqual([v.lead]);
          // The lead (E6-Q1): the most member merges, then the latest last one.
          const authors = v.members.map((k) => plain.get(memberEvent(k))!.cast.agent?.[0]);
          const n = (a: CanonicalKey | undefined) => authors.filter((x) => x === a).length;
          for (const a of authors) expect(n(a)).toBeLessThanOrEqual(n(v.lead));
          const crew = new Set([...(c.cast.agent ?? []), ...(c.cast.support ?? [])]);
          for (const k of v.members) {
            const p = plain.get(memberEvent(k))!;
            for (const who of [...(p.cast.agent ?? []), ...(p.cast.support ?? [])]) expect(crew.has(who), `${who} flies in ${c.eventKey}`).toBe(true);
            for (const x of p.cast.attachment ?? []) expect(c.cast.attachment).toContain(x);
            for (const x of p.cast.target ?? []) expect(c.cast.target).toContain(x);
          }
          for (const who of c.arc?.holders ?? []) expect(crew.has(who)).toBe(true);
          expect(c.volley!.members).toEqual(v.members.map(memberEvent));
        }
      });

      it('the turns: at most four labels each; everyone named once; every member has a turn', () => {
        for (const c of [...plans.values()].flat().filter((m) => m.volley)) {
          const { turns, members } = c.volley!;
          for (const t of turns) expect(t.plates.length + t.names.length).toBeLessThanOrEqual(ATTENTION_MAX);
          const names = turns.flatMap((t) => t.names.map((x) => x.key));
          expect(new Set(names).size).toBe(names.length);
          expect(new Set(names)).toEqual(new Set([...(c.cast.agent ?? []), ...(c.cast.support ?? [])]));
          for (const e of members) expect(turns.some((t) => t.eventKey === e), e).toBe(true);
          // The echo holds every turn: the disperse comes after the last one opens and folds.
          const act = c.phases.find((p) => p.phase === 'act')!.atMs;
          const disperse = c.phases.find((p) => p.phase === 'disperse')!.atMs;
          expect(disperse).toBeGreaterThanOrEqual(act + turns.length * VOLLEY_TURN_MS);
        }
      });

      it('a joined member plays only in its carrier, and gets no light work', () => {
        const joined = new Set(volleys.flatMap((v) => v.members.slice(1).map(memberEvent)));
        for (const m of [...plans.values()].flat()) expect(joined.has(m.eventKey) && !m.volley, `${m.eventKey}|${m.id}`).toBe(false);
      });
    });
  }

  it('Pulsar has at least one volley', () => {
    const rp = pods.find((p) => p.label === 'Pulsar Pod')!;
    expect(scheduleOf(rp.h, rp.scene, rp.tz, {}).limelight!.direction!.volleys?.size ?? 0).toBeGreaterThan(0);
  });

  it('the B-15 guard refuses at least one candidate on Quasar', () => {
    // The same window and day rule with the guard off group more members: the guard holds some back.
    const rp = pods.find((p) => p.label === 'Quasar Pod')!;
    const g = rawGroups(rp);
    const guarded = volleysOf(rp.h, g.beats, g.f, PACE_RULES, g.prio, rp.tz);
    const unguarded = volleysOf(rp.h, g.beats, g.f, PACE_RULES, g.prio, rp.tz, undefined, undefined, undefined, { guard: false });
    const members = (v: typeof guarded) => [...v.volleys.values()].reduce((n, x) => n + x.members.length, 0);
    expect(members(unguarded)).toBeGreaterThan(members(guarded));
  });
});

describe('volleyTurns and volleyPhases', () => {
  const m = (e: string, author: string, approvers: string[], targets: string[], holders: string[] = []): VolleyMember =>
    ({ eventKey: e, author: author as CanonicalKey, approvers: approvers as CanonicalKey[], targets: targets as CanonicalKey[], holders: holders as CanonicalKey[] });

  it('names each person once, at most four labels a turn, overflow into later turns', () => {
    const members = [m('e1', 'a', ['b', 'c', 'd'], ['p1', 'p2']), m('e2', 'b', ['a', 'e'], ['p1'], ['h'])];
    const turns = volleyTurns(members, new Set(['p1', 'p2'] as unknown as CanonicalKey[]));
    expect(turns.map((t) => t.eventKey)).toEqual(['e1', 'e2', 'e2']);
    expect(turns[0]).toEqual({ eventKey: 'e1', plates: ['p1', 'p2'], names: [{ key: 'a', eventKey: 'e1', part: 'agent' }, { key: 'b', eventKey: 'e1', part: 'support' }] });
    // e2: its plate, then c and d carried over, then e; h waits for a name-only turn.
    expect(turns[1]!.plates).toEqual(['p1']);
    expect(turns[1]!.names.map((x) => x.key)).toEqual(['c', 'd', 'e']);
    expect(turns[2]).toEqual({ eventKey: 'e2', plates: [], names: [{ key: 'h', eventKey: 'e2', part: 'holder' }] });
  });

  it('a pair under the full LINK needs no stretch; more turns lengthen the echo', () => {
    const link = PACE_RULES.find((r) => r.id === RULE.attachmentMerge)!.phases;
    const two = volleyTurns([m('e1', 'a', [], []), m('e2', 'b', [], [])], new Set());
    expect(volleyPhases(link, two)).toBe(link);
    const three = volleyTurns([m('e1', 'a', [], []), m('e2', 'b', [], []), m('e3', 'c', [], [])], new Set());
    const ps = volleyPhases(link, three);
    const act = ps.find((p) => p.phase === 'act')!.atMs;
    expect(ps.find((p) => p.phase === 'disperse')!.atMs).toBe(act + 3 * VOLLEY_TURN_MS);
  });
});
