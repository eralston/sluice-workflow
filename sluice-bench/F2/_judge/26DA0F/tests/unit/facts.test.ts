// Round facts (14 §1.1, §2.2, §3 step 3; 17 W1-T1): one region's round, folded once over the bundle.
// Intervals for membership, seat and signal; seats in first-held order; attachments with their
// approvers at completion; memoised; undated observations ignored (INV-02).
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { scenario, scenarioKeys, sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { coversAt, entryAt, memberAt, roundFacts, seatAtEvent, seatAtTime, signalAtTime } from '@shared/engine/facts';
import type { PieceFacts, RoundFacts } from '@shared/engine/types';
import { attachmentSignal, resolveSignal } from '@shared/engine/signal';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { mapping } from '../golden/helpers';

const sprintBundle = (s: Scenario, sprint: string) => toHistory(s, mapping, sprintScopes(s).find((x) => x.sprint === sprint)!);
const at = (iso: string) => Date.parse(iso);
const sig = (type: string, state: string) => resolveSignal(mapping, type, state);

const k = scenarioKeys(sprintMechanics);
const S41 = sprintBundle(sprintMechanics, 'Halcyon Reach\\Sprint 41');
const sdlc = packFor(S41);
const COMET = k.area('Halcyon Reach\\Comet Pod');
const NOVA = k.area('Halcyon Reach\\Nova Pod');
const region = (h: ScopeHistory, key: CanonicalKey) => roundFacts(h, { level: 'pod', key }, sdlc);
const comet = region(S41, COMET);

describe('round facts: membership', () => {
  it('holds the region’s objectives, threats and their steps, and nothing from another region', () => {
    expect([...comet.pieces.keys()]).toEqual([9103, 9104, 9105, 9108, 9201, 9202, 9203].map(k.wi).sort());
    expect([...region(S41, NOVA).pieces.keys()]).toEqual([9106, 9107, 9204].map(k.wi).sort());
    expect(comet.round).toEqual(S41.range);
    expect(comet.region).toBe(COMET);
    expect(comet.pieces.get(k.wi(9104))).toMatchObject({ role: 'objective', parent: k.wi(9001), steps: [k.wi(9201), k.wi(9202)] });
    expect(comet.pieces.get(k.wi(9108))).toMatchObject({ role: 'threat', steps: [] });
    expect(comet.pieces.get(k.wi(9203))).toMatchObject({ role: 'step', parent: k.wi(9103) });
  });

  it('gives each piece its intervals in the region: a carry-over enters, a story leaves for the next sprint', () => {
    expect(comet.pieces.get(k.wi(9103))!.member).toEqual([{ from: at('2026-09-14T15:00:00Z'), to: null }]);
    expect(comet.pieces.get(k.wi(9105))!.member).toEqual([{ from: at('2026-09-14T17:00:00Z'), to: at('2026-09-18T20:00:00Z') }]);
    expect(comet.pieces.get(k.wi(9108))!.member).toEqual([{ from: at('2026-09-16T17:00:00Z'), to: null }]);
    // A step is in the region while its piece is: Task 9203 from the carry-over's arrival.
    expect(comet.pieces.get(k.wi(9203))!.member).toEqual([{ from: at('2026-09-14T17:00:00Z'), to: null }]);
  });

  it('agrees with the snapshot at every event time', () => {
    const sprint = S41.scope.sector.kind === 'sprint' ? S41.scope.sector : null;
    const pod = sprint!.pods.find((p) => p.areaKey === COMET)!;
    const under = (path: string, root: string) => path === root || path.startsWith(`${root}\\`);
    for (const t of [...new Set(S41.events.map((e) => e.occurredAt))].filter((x) => x >= S41.range.startUtc)) {
      const s = snapshotAt(S41, t, 'knownThen');
      for (const [key, p] of comet.pieces) {
        if (p.role === 'step') continue;
        const wi = s.workItems.get(key);
        const inPod = !!wi && under(wi.iterationPath ?? '', sprint!.path) && under(wi.areaPath, pod.path);
        expect(memberAt(p, t), `${key} at ${new Date(t).toISOString()}`).toBe(inPod);
        expect(seatAtTime(p, t)).toBe(wi?.assigneeKey ?? null);
      }
    }
  });

  it('a piece that leaves every region and comes back has two intervals; its unlinked step has one', () => {
    const SPRINT = 'Lumen Yard\\Sprint 7';
    const KESTREL = 'Lumen Yard\\Kestrel Pod';
    const mini = scenario('facts-mini', { project: 'Lumen Yard', tz: 'UTC', range: ['2026-05-04T00:00:00Z', '2026-05-11T00:00:00Z'] })
      .area('Lumen Yard', 100).area(KESTREL, 101, { favorite: true, defaultScope: true }).area('Lumen Yard\\Loose Ends', 103)
      .iteration(SPRINT, 200, '2026-05-04T00:00:00Z', '2026-05-18T00:00:00Z')
      .person('ines', 'Ines Varga')
      .at('2026-05-04T09:00:00Z')
      .story(10, 'Lantern rota', { area: KESTREL, iteration: SPRINT, assignee: 'ines' })
      .task(12, 'Draft the rota', { parent: 10, iteration: SPRINT })
      // Moved out and back at one instant: never seen out, so one interval runs on.
      .at('2026-05-05T09:00:00Z').moveArea(10, 'Lumen Yard\\Loose Ends').moveArea(10, KESTREL)
      .at('2026-05-05T10:00:00Z').moveArea(10, 'Lumen Yard\\Loose Ends')
      .at('2026-05-05T11:00:00Z').moveArea(10, KESTREL)
      .at('2026-05-05T13:00:00Z').unlink(12, 10)
      .observeParent(12, 10)
      .build();
    const mkk = scenarioKeys(mini);
    const h = sprintBundle(mini, SPRINT);
    const f = roundFacts(h, { level: 'pod', key: mkk.area(KESTREL) }, sdlc);
    expect(f.pieces.get(mkk.wi(10))!.member).toEqual([
      { from: at('2026-05-04T09:00:00Z'), to: at('2026-05-05T10:00:00Z') },
      { from: at('2026-05-05T11:00:00Z'), to: null },
    ]);
    // The step follows its piece out and back, then leaves when unlinked; the undated re-link
    // (an observation) never brings it back (INV-02).
    expect(f.pieces.get(mkk.wi(12))!.member).toEqual([
      { from: at('2026-05-04T09:00:00Z'), to: at('2026-05-05T10:00:00Z') },
      { from: at('2026-05-05T11:00:00Z'), to: at('2026-05-05T13:00:00Z') },
    ]);
    expect(f.pieces.get(mkk.wi(12))!.parent).toBeNull();
    expect(f.pieces.get(mkk.wi(10))!.steps).toEqual([mkk.wi(12)]); // a step slot is kept ever (INV-14)
  });
});

describe('round facts: seats and signals', () => {
  it('records each piece’s seat over time, from the frontier to a seat', () => {
    expect(comet.pieces.get(k.wi(9202))!.seatAt).toEqual([
      { from: at('2026-09-14T17:00:00Z'), seat: null },
      { from: at('2026-09-20T17:00:00Z'), seat: k.person('dax') },
    ]);
    expect(comet.pieces.get(k.wi(9105))!.seatAt).toEqual([{ from: at('2026-09-14T17:00:00Z'), seat: null }]);
  });

  it('records each piece’s signal over time, one entry per change', () => {
    expect(comet.pieces.get(k.wi(9103))!.signalAt).toEqual([
      { from: at('2026-08-31T16:00:00Z'), signal: sig('User Story', 'New') },
      { from: at('2026-09-01T17:00:00Z'), signal: sig('User Story', 'Active') },
      { from: at('2026-09-17T19:00:00Z'), signal: sig('User Story', 'Resolved') },
      { from: at('2026-09-19T17:00:00Z'), signal: sig('User Story', 'Closed') },
    ]);
    const p = comet.pieces.get(k.wi(9103))!;
    expect(signalAtTime(p, at('2026-09-18T00:00:00Z'))?.rung).toBe('nearing');
    expect(signalAtTime(p, at('2026-08-01T00:00:00Z'))).toBeNull();
  });

  it('seats everyone who held an objective or threat here in the round, in first-held order', () => {
    // Teo holds the carry-over from 15:00 on the first day; Maren her story from 17:00. Dax holds
    // only a step here, and Priya is in another region.
    expect(comet.seats).toEqual([k.person('teo'), k.person('maren')]);
    // Two people first holding at one instant: by key.
    expect(region(S41, NOVA).seats).toEqual([k.person('priya'), k.person('dax')].sort());
    // The round itself holds every region's seats.
    const sprint = S41.scope.sector.kind === 'sprint' ? S41.scope.sector : null;
    const all = roundFacts(S41, { level: 'sprint', key: sprint!.iterationKey }, sdlc);
    expect([...all.seats].sort()).toEqual([k.person('teo'), k.person('maren'), k.person('priya'), k.person('dax')].sort());
  });
});

describe('round facts: the current state', () => {
  it('starts an item known only from the current state as it is now, from the start (decided 2026-10-07)', () => {
    const key = k.wi(9300);
    const history = [...S41.entities.workItems.map((w) => w.key), ...S41.entities.prs.map((p) => p.key)];
    const h: ScopeHistory = {
      ...S41,
      coverage: { ...S41.coverage, history },
      entities: { ...S41.entities, workItems: [...S41.entities.workItems, { key, type: 'User Story', adoUrl: '' }] },
      current: {
        at: S41.range.endUtc, prs: [], links: [{ kind: 'parent', fromKey: key, toKey: k.wi(9001) }],
        workItems: [{
          key, type: 'User Story', title: 'Seat map', state: 'Active', areaPath: 'Halcyon Reach\\Comet Pod',
          assigneeKey: k.person('priya'), createdAt: at('2026-09-02T00:00:00Z'), changedAt: at('2026-09-03T00:00:00Z'),
          iterationPath: 'Halcyon Reach\\Sprint 41',
        }],
      },
    };
    const f = region(h, COMET);
    const origin = Math.min(h.range.startUtc, h.events[0]!.occurredAt);
    expect(f.pieces.get(key)).toEqual({
      key, role: 'objective', member: [{ from: origin, to: null }], seatAt: [{ from: origin, seat: k.person('priya') }],
      signalAt: [{ from: origin, signal: sig('User Story', 'Active') }], steps: [], parent: k.wi(9001),
      parentAt: [{ from: origin, parent: k.wi(9001) }],
    });
    // Held since before the round, so Priya's seat comes first.
    expect(f.seats).toEqual([k.person('priya'), k.person('teo'), k.person('maren')]);
  });
});

describe('round facts: attachments', () => {
  it('records an attachment’s facility, author, open interval, links, and the approvers at completion', () => {
    expect([...comet.attachments.keys()]).toEqual([k.pr(9501)]);
    expect(comet.attachments.get(k.pr(9501))).toEqual({
      key: k.pr(9501), facility: k.repo('booking-web'), author: k.person('teo'),
      open: { from: at('2026-09-16T20:00:00Z'), to: at('2026-09-18T17:00:00Z') },
      links: [k.wi(9108)], approvers: [k.person('maren')],
      signalAt: [
        { from: at('2026-09-16T20:00:00Z'), signal: attachmentSignal(mapping, 'active') },
        { from: at('2026-09-18T17:00:00Z'), signal: attachmentSignal(mapping, 'completed') },
      ],
    });
    // Another region's pieces aren't linked to it, so it isn't there.
    expect(region(S41, NOVA).attachments.size).toBe(0);
  });
});

describe('round facts: moves and memo', () => {
  it('keeps the moves that touch the board, by event key, in event order', () => {
    const keys = [...comet.moves.keys()];
    const order = S41.events.map((e) => e.eventKey).filter((e) => comet.moves.has(e));
    expect(keys).toEqual(order);
    expect(keys.some((e) => e.includes(k.wi(9106)))).toBe(false); // a Nova story
    expect([...comet.moves.values()].flat()).toContainEqual(expect.objectContaining({ m: 'settle', key: k.pr(9501) }));
  });

  it('is memoised per bundle, pack and region', () => {
    expect(region(S41, COMET)).toBe(comet);
    expect(region(S41, NOVA)).not.toBe(comet);
    expect(region(structuredClone(S41), COMET)).toEqual(comet);
  });

  it('a region the round doesn’t have holds nothing', () => {
    const f = region(S41, k.area('Halcyon Reach\\Quasar Pod'));
    expect(f.pieces.size).toBe(0);
    expect(f.seats).toEqual([]);
  });
});

describe('the seat at an event', () => {
  it('a reseat to the frontier earlier in the same millisecond leaves the piece unheld', () => {
    // Hand-built: held by u:a from 0; at t=10 e1 unassigns it, then e2 climbs it. The null seat is a
    // seat, so the climb reads no holder (not the seat that had just let go).
    const p = { key: 'wi:1', seatAt: [{ from: 0, seat: 'u:a' }, { from: 10, seat: null }] } as unknown as PieceFacts;
    const f = {
      at: new Map([['e1', 10], ['e2', 10]]),
      moves: new Map([
        ['e1', [{ m: 'reseat', key: 'wi:1', from: 'u:a', to: null }]],
        ['e2', [{ m: 'climb', key: 'wi:1' }]],
      ]),
    } as unknown as RoundFacts;
    expect(seatAtEvent(f, p, 'e1')).toBeNull();
    expect(seatAtEvent(f, p, 'e2')).toBeNull();
  });
});

describe('the interval helpers', () => {
  it('read from inclusive, to exclusive', () => {
    const iv = [{ from: 10, to: 20 }, { from: 30, to: null }];
    expect([9, 10, 19, 20, 29, 30, 1e15].map((x) => coversAt(iv, x))).toEqual([false, true, true, false, false, true, true]);
    const series = [{ from: 10, v: 'a' }, { from: 20, v: 'b' }];
    expect([5, 10, 15, 20, 25].map((x) => entryAt(series, x)?.v)).toEqual([undefined, 'a', 'a', 'b', 'b']);
  });
});
