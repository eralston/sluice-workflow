// Moves (14 §1.1, §2.2; 17 W1-T1): every event of a bundle, normalised once into engine terms, as
// the SDLC pack reads it. One case per event kind, on sprint-mechanics and on hand-built bundles; the
// reading is memoised and frozen; undated observations never move (INV-02).
import { describe, expect, it } from 'vitest';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import { scenario, scenarioKeys, sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import { compareEvents, type AnyTimelineEvent, type EventKind } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import { contractMoves, movedKeys, movesOf, scopeTest } from '@shared/engine/moves';
import { attachmentSignal, resolveSignal } from '@shared/engine/signal';
import { describeMoves, terminology } from '@shared/engine/terminology';
import type { Move } from '@shared/engine/types';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { mapping } from '../golden/helpers';

const sprintBundle = (s: Scenario, sprint: string) => toHistory(s, mapping, sprintScopes(s).find((x) => x.sprint === sprint)!);

const pk = scenarioKeys(sprintMechanics);
const S41 = sprintBundle(sprintMechanics, 'Halcyon Reach\\Sprint 41');
const sdlc = packFor(S41);

// A small sprint with what sprint-mechanics lacks: area moves, a retitle, an unlink, an abandoned PR and
// an undated PR link. Invented names only (INV-18).
const SPRINT = 'Lumen Yard\\Sprint 7';
const KESTREL = 'Lumen Yard\\Kestrel Pod';
const WREN = 'Lumen Yard\\Wren Pod';
const LOOSE = 'Lumen Yard\\Loose Ends';
const mini = scenario('moves-mini', { project: 'Lumen Yard', tz: 'UTC', range: ['2026-05-04T00:00:00Z', '2026-05-11T00:00:00Z'] })
  .area('Lumen Yard', 100)
  .area(KESTREL, 101, { favorite: true, defaultScope: true })
  .area(WREN, 102, { favorite: true })
  .area(LOOSE, 103)
  .iteration(SPRINT, 200, '2026-05-04T00:00:00Z', '2026-05-18T00:00:00Z')
  .repo('yard-api')
  .person('ines', 'Ines Varga')
  .person('olu', 'Olu Brandt')
  .at('2026-05-04T09:00:00Z')
  .feature(1, 'Night shift', { area: 'Lumen Yard', state: 'Active' })
  .story(10, 'Lantern rota', { parent: 1, area: KESTREL, iteration: SPRINT, assignee: 'ines' })
  .bug(11, 'Rota skips Sundays', { area: KESTREL, iteration: SPRINT, assignee: 'olu' })
  .task(12, 'Draft the rota', { parent: 10, iteration: SPRINT, assignee: 'ines' })
  .at('2026-05-05T09:00:00Z').moveArea(10, WREN) // between two regions of the round
  .at('2026-05-05T10:00:00Z').moveArea(10, LOOSE) // out of every region
  .at('2026-05-05T11:00:00Z').moveArea(10, KESTREL) // and back
  .at('2026-05-05T12:00:00Z').retitle(11, 'Rota skips Sundays and holidays')
  .at('2026-05-05T13:00:00Z').unlink(12, 10)
  .at('2026-05-05T14:00:00Z').pr(70, { repo: 'yard-api', author: 'olu', title: 'Sunday rows', links: [11] })
  .at('2026-05-05T15:00:00Z').abandonPr(70, { by: 'olu' })
  .observePrLink(70, 10)
  .observeParent(12, 10)
  .build();
const mk = scenarioKeys(mini);
const MINI = sprintBundle(mini, SPRINT);

/** A bundle with extra hand-built events, sorted as ingest sorts them (02 §5). */
function withEvents(h: ScopeHistory, extra: AnyTimelineEvent[]): ScopeHistory {
  return { ...h, events: [...h.events, ...extra].sort(compareEvents) };
}
const at = (iso: string) => Date.parse(iso);
function handEvent<K extends EventKind>(kind: K, entityKey: AnyTimelineEvent['entityKey'], iso: string, payload: Extract<AnyTimelineEvent, { kind: K }>['payload']): AnyTimelineEvent {
  return {
    eventKey: `${kind}:${entityKey}:hand`, kind, occurredAt: at(iso), observedAt: at(iso), entityKey, projectKey: mk.project(),
    priority: 'low', payload, evidence: [], changedBy: mk.person('olu'),
  } as AnyTimelineEvent;
}
const HAND = withEvents(MINI, [
  handEvent('link_pr_removed', mk.wi(11), '2026-05-05T16:00:00Z', { prKey: mk.pr(70), itemKey: mk.wi(11) }),
  handEvent('link_dependency_added', mk.wi(11), '2026-05-05T17:00:00Z', { predecessorKey: mk.wi(10), successorKey: mk.wi(11) }),
  handEvent('link_dependency_removed', mk.wi(11), '2026-05-05T18:00:00Z', { predecessorKey: mk.wi(10), successorKey: mk.wi(11) }),
]);

/** The moves of the one event of a kind that matches. */
function movesFor(h: ScopeHistory, kind: EventKind, pred: (e: AnyTimelineEvent) => boolean = () => true): Move[] {
  const e = h.events.find((x) => x.kind === kind && pred(x));
  if (!e) throw new Error(`no ${kind} event`);
  return movesOf(h, packFor(h)).get(e.eventKey)!;
}
const sig = (type: string, state: string) => resolveSignal(mapping, type, state);
const covered = new Set<EventKind>();
const track = (kind: EventKind) => covered.add(kind);

describe('moves, one case per event kind', () => {
  it('wi_created: a piece appears with its signal and seat', () => {
    track('wi_created');
    expect(movesFor(S41, 'wi_created', (e) => e.entityKey === pk.wi(9104))).toEqual([
      { m: 'appear', key: pk.wi(9104), role: 'objective', to: sig('User Story', 'New'), seat: pk.person('maren') },
    ]);
    expect(movesFor(S41, 'wi_created', (e) => e.entityKey === pk.wi(9108))[0]).toMatchObject({ role: 'threat', seat: pk.person('teo') });
    expect(movesFor(S41, 'wi_created', (e) => e.entityKey === pk.wi(9202))[0]).toMatchObject({ role: 'step', seat: null });
    expect(movesFor(S41, 'wi_created', (e) => e.entityKey === pk.wi(9001))[0]).toMatchObject({ role: 'container', to: sig('Feature', 'Active') });
  });

  it('wi_state_changed: a climb from the old signal to the new, by its actor', () => {
    track('wi_state_changed');
    expect(movesFor(S41, 'wi_state_changed', (e) => e.kind === 'wi_state_changed' && e.entityKey === pk.wi(9108) && e.payload.to === 'Resolved')).toEqual([
      { m: 'climb', key: pk.wi(9108), role: 'threat', from: sig('Bug', 'Active'), to: sig('Bug', 'Resolved'), actor: pk.person('teo') },
    ]);
  });

  it('wi_assignee_changed: a reseat, from the frontier to a seat', () => {
    track('wi_assignee_changed');
    expect(movesFor(S41, 'wi_assignee_changed', (e) => e.entityKey === pk.wi(9202))).toEqual([
      { m: 'reseat', key: pk.wi(9202), role: 'step', from: null, to: pk.person('dax'), actor: pk.person('dax') },
    ]);
  });

  it('wi_iteration_changed: entering and leaving the round', () => {
    track('wi_iteration_changed');
    expect(movesFor(S41, 'wi_iteration_changed', (e) => e.entityKey === pk.wi(9103))).toEqual([{ m: 'enter', key: pk.wi(9103), role: 'objective' }]);
    expect(movesFor(S41, 'wi_iteration_changed', (e) => e.entityKey === pk.wi(9105))).toEqual([{ m: 'leave', key: pk.wi(9105), role: 'objective' }]);
  });

  it('wi_area_changed: leaving and entering the round’s regions; a move between two of them is neither', () => {
    track('wi_area_changed');
    const area = (to: string) => movesFor(MINI, 'wi_area_changed', (e) => e.kind === 'wi_area_changed' && e.payload.to === to);
    expect(area(WREN)).toEqual([]);
    expect(area(LOOSE)).toEqual([{ m: 'leave', key: mk.wi(10), role: 'objective' }]);
    expect(area(KESTREL)).toEqual([{ m: 'enter', key: mk.wi(10), role: 'objective' }]);
  });

  it('wi_title_changed: a retitle', () => {
    track('wi_title_changed');
    expect(movesFor(MINI, 'wi_title_changed')).toEqual([{ m: 'retitle', key: mk.wi(11) }]);
  });

  it('link_parent_added and _removed: a step binds to its piece, a piece to its container', () => {
    track('link_parent_added');
    track('link_parent_removed');
    expect(movesFor(S41, 'link_parent_added', (e) => e.kind === 'link_parent_added' && e.payload.childKey === pk.wi(9201))).toEqual([
      { m: 'bind', child: pk.wi(9201), parent: pk.wi(9104), rel: 'step' },
    ]);
    expect(movesFor(S41, 'link_parent_added', (e) => e.kind === 'link_parent_added' && e.payload.childKey === pk.wi(9104))).toEqual([
      { m: 'bind', child: pk.wi(9104), parent: pk.wi(9001), rel: 'container' },
    ]);
    expect(movesFor(MINI, 'link_parent_removed')).toEqual([{ m: 'unbind', child: mk.wi(12), parent: mk.wi(10), rel: 'step' }]);
  });

  it('link_pr_added and _removed: an attachment binds to the piece it delivers', () => {
    track('link_pr_added');
    track('link_pr_removed');
    expect(movesFor(S41, 'link_pr_added')).toEqual([{ m: 'bind', child: pk.pr(9501), parent: pk.wi(9108), rel: 'attachment' }]);
    expect(movesFor(HAND, 'link_pr_removed')).toEqual([{ m: 'unbind', child: mk.pr(70), parent: mk.wi(11), rel: 'attachment' }]);
  });

  it('link_dependency_added and _removed: no move (not on the v1 board)', () => {
    track('link_dependency_added');
    track('link_dependency_removed');
    expect(movesFor(HAND, 'link_dependency_added')).toEqual([]);
    expect(movesFor(HAND, 'link_dependency_removed')).toEqual([]);
  });

  it('pr_opened: an attachment arrives at its facility, by its author', () => {
    track('pr_opened');
    expect(movesFor(S41, 'pr_opened')).toEqual([{ m: 'attach', key: pk.pr(9501), facility: pk.repo('booking-web'), author: pk.person('teo') }]);
  });

  it('pr_completed: it settles Accomplished, with the approvers at completion', () => {
    track('pr_completed');
    expect(movesFor(S41, 'pr_completed')).toEqual([{
      m: 'settle', key: pk.pr(9501), facility: pk.repo('booking-web'), to: attachmentSignal(mapping, 'completed'),
      approvers: [pk.person('maren')], actor: pk.person('teo'),
    }]);
  });

  it('pr_abandoned: it settles Off, with no approvers', () => {
    track('pr_abandoned');
    const [m] = movesFor(MINI, 'pr_abandoned');
    expect(m).toEqual({ m: 'settle', key: mk.pr(70), facility: mk.repo('yard-api'), to: attachmentSignal(mapping, 'abandoned'), approvers: [], actor: mk.person('olu') });
    expect(m?.m === 'settle' && m.to.rung).toBe('off');
  });

  it('covers every event kind', () => {
    const all: EventKind[] = [
      'wi_created', 'wi_state_changed', 'wi_assignee_changed', 'wi_area_changed', 'wi_title_changed', 'wi_iteration_changed',
      'link_parent_added', 'link_parent_removed', 'link_dependency_added', 'link_dependency_removed',
      'link_pr_added', 'link_pr_removed', 'pr_opened', 'pr_completed', 'pr_abandoned',
    ];
    expect([...covered].sort()).toEqual([...all].sort());
  });
});

describe('moves, read once', () => {
  it('are memoised per bundle and pack, and frozen', () => {
    const a = movesOf(S41, sdlc);
    expect(movesOf(S41, sdlc)).toBe(a);
    const e = S41.events[0]!;
    expect(contractMoves(S41, e)).toBe(contractMoves(S41, e));
    expect(Object.isFrozen(a.get(e.eventKey))).toBe(true);
    expect(Object.isFrozen(a.get(e.eventKey)![0])).toBe(true);
    // A copy of the bundle is read afresh, to the same moves.
    const copy = structuredClone(S41);
    expect(movesOf(copy, sdlc)).not.toBe(a);
    expect([...movesOf(copy, sdlc)]).toEqual([...a]);
  });

  it('cover exactly the bundle’s events: undated observations never move (INV-02)', () => {
    expect(MINI.observations.length).toBe(2);
    const all = movesOf(MINI, sdlc);
    expect([...all.keys()]).toEqual(MINI.events.map((e) => e.eventKey));
    const binds = [...all.values()].flat().filter((m) => m.m === 'bind');
    // The observed links (PR 70 → 10, 12 → 10 again) bind nothing; only the dated ones do.
    expect(binds).not.toContainEqual(expect.objectContaining({ child: mk.pr(70), parent: mk.wi(10) }));
    expect(binds.filter((m) => m.m === 'bind' && m.child === mk.wi(12))).toHaveLength(1);
  });

  it('an unknown type makes no moves (INV-11), and an event read alone never enters or leaves', () => {
    const odd = withEvents(MINI, [handEvent('wi_created', mk.wi(99), '2026-05-06T09:00:00Z', {
      type: 'Spike', title: 'Mystery', state: 'New', areaPath: KESTREL, assigneeKey: null, iterationPath: SPRINT,
    })]);
    expect(movesFor(odd, 'wi_created', (e) => e.entityKey === mk.wi(99))).toEqual([]);
    const outside = handEvent('wi_area_changed', mk.wi(11), '2026-05-06T10:00:00Z', { from: KESTREL, to: LOOSE });
    expect(contractMoves(MINI, outside)).toEqual([]);
  });

  it('names a piece by its role and title, and a container by its number and title alone (19 review: "item #… joined container #…")', () => {
    const linked = withEvents(MINI, [handEvent('link_parent_added', mk.wi(11), '2026-05-06T10:00:00Z', { childKey: mk.wi(11), parentKey: mk.wi(1) })]);
    const e = linked.events.find((x) => x.kind === 'link_parent_added' && x.payload.childKey === mk.wi(11))!;
    const mv = movesOf(linked, sdlc).get(e.eventKey) ?? [];
    expect(mv[0]).toMatchObject({ m: 'bind', child: mk.wi(11), parent: mk.wi(1) });
    const chart = terminology(sdlc, 'chart', { mapping: linked.stateMapping });
    // The title as of the event: #11 was renamed the day before.
    expect(describeMoves(linked, e, mv, chart).text).toBe('threat #11 · Rota skips Sundays and holidays joined #1 · Night shift');
  });

  it('an unknown state climbs as its raw name, and the chart register names no SDLC type (INV-11; 17 W3-T3)', () => {
    const odd = withEvents(MINI, [handEvent('wi_state_changed', mk.wi(10), '2026-05-06T09:00:00Z', { from: 'New', to: 'Parked' })]);
    const e = odd.events.find((x) => x.kind === 'wi_state_changed' && x.entityKey === mk.wi(10) && x.payload.to === 'Parked')!;
    const [m] = movesFor(odd, 'wi_state_changed', (x) => x.eventKey === e.eventKey);
    expect(m).toMatchObject({ m: 'climb', key: mk.wi(10), to: { unknown: true } });
    const chart = terminology(sdlc, 'chart', { mapping: odd.stateMapping });
    const line = describeMoves(odd, e, [m!], chart).text;
    expect(line).toBe('objective #10 · Lantern rota: Ready → Parked');
    expect(line).not.toMatch(/User Story|Story|Bug|Task|Feature/);
    // A known state still reads as its rung's word, never the source's state name.
    expect(describeMoves(odd, e, [{ ...(m as Extract<Move, { m: 'climb' }>), to: sig('User Story', 'Active') }], chart).text).toBe('objective #10 · Lantern rota: Ready → Underway');
  });

  it('name every key they touch', () => {
    for (const mv of movesOf(S41, sdlc).values()) for (const m of mv) expect(movedKeys(m).length).toBeGreaterThan(0);
  });
});

describe('the scope test', () => {
  it('holds a piece in the round and one of its regions; with a region, that region only', () => {
    const any = scopeTest(S41);
    const comet = scopeTest(S41, pk.area('Halcyon Reach\\Comet Pod'));
    const sprint = S41.scope.sector.kind === 'sprint' ? S41.scope.sector : null;
    const round = scopeTest(S41, sprint!.iterationKey);
    const at = (area: string, iteration: string | null) => ({ area: `Halcyon Reach\\${area}`, iteration: iteration && `Halcyon Reach\\${iteration}` });
    expect(any(at('Nova Pod', 'Sprint 41'))).toBe(true);
    expect(round(at('Nova Pod', 'Sprint 41'))).toBe(true);
    expect(comet(at('Nova Pod', 'Sprint 41'))).toBe(false);
    expect(comet(at('Comet Pod', 'Sprint 41'))).toBe(true);
    expect(comet(at('Comet Pod', 'Sprint 42'))).toBe(false);
    expect(comet(at('Comet Pod', null))).toBe(false);
    expect(any(at('Quasar Pod', 'Sprint 41'))).toBe(false); // not a saved region
    expect(scopeTest(S41, pk.wi(9104))(at('Comet Pod', 'Sprint 41'))).toBe(false); // not a region
  });
});
