// Achievements (18 §5, 14 §2.9; 17 W2-T7): one earn and one near miss per v1 rule, on the mini
// sprints in fixtures/scenarios/v1/achievementCases.ts. No viewer, no awards; undated observations
// earn nothing; the pack's bars are the ones read; the same facts always earn the same awards.
// Then probes for reading at the event: the holder, the step's parent, the clearing move, the time.
import { describe, expect, it } from 'vitest';
import { scenario, scenarioKeys, sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import { achievementCases, CASE_POD, CASE_SPRINT, CASE_VIEWER } from '@fixtures/scenarios/v1/achievementCases';
import type { ScopeHistory } from '@shared/contracts/history';
import { achievementRule, achievementsFor, ACHIEVEMENT_RULES } from '@shared/engine/achievements';
import { roundFacts } from '@shared/engine/facts';
import { resolveSignal } from '@shared/engine/signal';
import { terminology } from '@shared/engine/terminology';
import type { DomainPack, RoundFacts } from '@shared/engine/types';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { mapping } from '../golden/helpers';

const TZ = 'America/Los_Angeles';
const bundle = (s: Scenario): ScopeHistory => toHistory(s, mapping, sprintScopes(s).find((x) => x.sprint === CASE_SPRINT)!);
const factsOf = (s: Scenario, h = bundle(s)): RoundFacts => roundFacts(h, { level: 'pod', key: scenarioKeys(s).area(CASE_POD) }, packFor(h));
const viewerOf = (s: Scenario) => scenarioKeys(s).person(CASE_VIEWER);
const awardsOf = (s: Scenario, pack?: DomainPack) => {
  const h = bundle(s);
  return achievementsFor(factsOf(s, h), viewerOf(s), pack ?? packFor(h), { tz: TZ });
};
const ids = (s: Scenario, pack?: DomainPack) => awardsOf(s, pack).map((a) => a.id);

describe('achievements: the v1 rule set (18 §5 A1)', () => {
  it('has the eight rules, each with its own insignia shape', () => {
    expect(ACHIEVEMENT_RULES.map((r) => r.id)).toEqual([
      'clear-skies', 'hat-trick-landings', 'hat-trick-defences', 'hat-trick-reviews', 'swift-passage', 'steady-hands', 'clean-landing', 'wingman',
    ]);
    expect(new Set(ACHIEVEMENT_RULES.map((r) => r.shape)).size).toBe(ACHIEVEMENT_RULES.length);
    expect(achievementRule('wingman')?.shape).toBe('wings');
    expect(achievementRule('nope')).toBeUndefined();
  });

  it('has one case per rule', () => {
    expect(achievementCases.map((c) => c.id).sort()).toEqual(ACHIEVEMENT_RULES.map((r) => r.id).sort());
  });
});

describe.each(achievementCases.map((c) => [c.id, c] as const))('achievements: %s', (id, c) => {
  it('is earned', () => {
    expect(ids(c.earn)).toContain(id);
  });
  it(`is a near miss when ${c.edge}`, () => {
    expect(ids(c.near)).not.toContain(id);
  });
  it('names a dated event of the round, and pieces of the region', () => {
    const s = c.earn;
    const h = bundle(s);
    const f = factsOf(s, h);
    const a = awardsOf(s).find((x) => x.id === id)!;
    const e = h.events.find((x) => x.eventKey === a.earnedAt.eventKey)!;
    expect(e.occurredAt).toBe(a.earnedAt.atUtc);
    expect(a.earnedAt.atUtc).toBeGreaterThanOrEqual(h.range.startUtc);
    expect(a.earnedAt.atUtc).toBeLessThan(h.range.endUtc);
    expect(a.pieces.length).toBeGreaterThan(0);
    for (const k of a.pieces) expect(f.pieces.has(k) || f.attachments.has(k)).toBe(true);
    expect(a.reason).toMatch(/Accomplished/);
  });
});

describe('achievements: what each rule reads', () => {
  const byId = Object.fromEntries(achievementCases.map((c) => [c.id, c]));

  it('awards no one when there is no viewer, and only the viewer when there is', () => {
    const s = byId['clear-skies']!.earn;
    const h = bundle(s);
    expect(achievementsFor(factsOf(s, h), null, packFor(h))).toEqual([]);
    // Teodor holds nothing here, so he earns nothing.
    expect(achievementsFor(factsOf(s, h), scenarioKeys(s).person('teodor'), packFor(h), { tz: TZ })).toEqual([]);
  });

  it('pins the hat tricks to the third arrival, in order', () => {
    const s = byId['hat-trick-landings']!.earn;
    const k = scenarioKeys(s);
    const a = awardsOf(s).find((x) => x.id === 'hat-trick-landings')!;
    expect(a.pieces).toEqual([23211, 23212, 23213].map(k.wi));
    expect(a.earnedAt.atUtc).toBe(Date.parse('2026-10-09T16:00:00Z'));
    const rs = byId['hat-trick-reviews']!.earn;
    const r = awardsOf(rs).find((x) => x.id === 'hat-trick-reviews')!;
    expect(r.pieces).toEqual([23501, 23502, 23503].map(scenarioKeys(rs).pr));
  });

  it('reads Swift passage and Steady hands from the pack’s bars', () => {
    const sdlc = packFor(bundle(byId['swift-passage']!.earn));
    const strict: DomainPack = { ...sdlc, thresholds: { ...sdlc.thresholds, swiftDays: 2 } };
    expect(ids(byId['swift-passage']!.earn, strict)).not.toContain('swift-passage');
    const lenient: DomainPack = { ...sdlc, thresholds: { ...sdlc.thresholds, swiftDays: 5 } }; // 52.8 ≤ 60
    expect(ids(byId['swift-passage']!.near, lenient)).toContain('swift-passage');
    const tight: DomainPack = { ...sdlc, thresholds: { ...sdlc.thresholds, wipK: 1 } };
    expect(ids(byId['steady-hands']!.earn, tight)).not.toContain('steady-hands');
    expect(ids(byId['steady-hands']!.near, { ...sdlc, thresholds: { ...sdlc.thresholds, wipK: 3 } })).toContain('steady-hands');
  });

  it('weighs Swift passage in working hours, in the team’s time zone', () => {
    // Tue 16:00 → Fri 10:00 Pacific: 30 working hours there (33.6 weighted), but in UTC the span
    // takes all of Friday's morning and none of Tuesday's afternoon (37.2), past the 36-hour bar.
    const s = scenario('achievement-swift-tz', { project: 'Quillmoor', tz: TZ, range: ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'] })
      .area('Quillmoor', 23000).area(CASE_POD, 23001, { favorite: true, defaultScope: true })
      .iteration(CASE_SPRINT, 23100, '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z')
      .person('vesna', 'Vesna Holloway')
      .at('2026-10-05T16:00:00Z').story(23285, 'Gold leaf', { area: CASE_POD, iteration: CASE_SPRINT, assignee: 'vesna' })
      .at('2026-10-06T23:00:00Z').state(23285, 'Active')
      .at('2026-10-09T17:00:00Z').state(23285, 'Closed')
      .build();
    const h = bundle(s);
    const swift = (tz: string) => achievementsFor(factsOf(s, h), viewerOf(s), packFor(h), { tz }).some((a) => a.id === 'swift-passage');
    expect(swift(TZ)).toBe(true);
    expect(swift('UTC')).toBe(false);
  });

  it('needs at least one landing for Steady hands: an idle round earns nothing', () => {
    const idle = scenario('achievement-idle', { project: 'Quillmoor', tz: TZ, range: ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'] })
      .area('Quillmoor', 23000).area(CASE_POD, 23001, { favorite: true, defaultScope: true })
      .iteration(CASE_SPRINT, 23100, '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z')
      .person('vesna', 'Vesna Holloway')
      .at('2026-10-05T16:00:00Z').story(23281, 'Pumice tray', { area: CASE_POD, iteration: CASE_SPRINT, assignee: 'vesna' })
      .build();
    expect(ids(idle)).toEqual([]);
  });

  it('counts a merge for Wingman when the viewer approved it for another seat’s piece that landed', () => {
    const s = byId['hat-trick-reviews']!.earn;
    expect(ids(s)).not.toContain('wingman'); // Teodor's Stories never land
    const landed = scenario('achievement-wingman-review', { project: 'Quillmoor', tz: TZ, range: ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'] })
      .area('Quillmoor', 23000).area(CASE_POD, 23001, { favorite: true, defaultScope: true })
      .iteration(CASE_SPRINT, 23100, '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z')
      .repo('quill-core').person('vesna', 'Vesna Holloway').person('teodor', 'Teodor Brask')
      .at('2026-10-05T16:00:00Z').story(23291, 'Ink wells', { area: CASE_POD, iteration: CASE_SPRINT, assignee: 'teodor' })
      .at('2026-10-06T16:00:00Z').state(23291, 'Active').pr(23591, { repo: 'quill-core', author: 'teodor', title: 'Well sizes', links: [23291] })
      .at('2026-10-07T16:00:00Z').completePr(23591, { approvedBy: ['vesna'] })
      .at('2026-10-08T16:00:00Z').state(23291, 'Closed')
      .build();
    const k = scenarioKeys(landed);
    const w = awardsOf(landed).find((a) => a.id === 'wingman')!;
    expect(w.pieces).toEqual([k.wi(23291), k.pr(23591)]);
    // At the landing, which came after the help.
    expect(w.earnedAt.atUtc).toBe(Date.parse('2026-10-08T16:00:00Z'));
  });

  it('ignores undated observations (INV-02): an observed link earns nothing', () => {
    // The reviews near miss, plus a PR linked only by an undated observation and approved by Vesna.
    const story = (observed: boolean) => {
      const b = scenario(`achievement-observed-${observed}`, { project: 'Quillmoor', tz: TZ, range: ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'] })
        .area('Quillmoor', 23000).area(CASE_POD, 23001, { favorite: true, defaultScope: true })
        .iteration(CASE_SPRINT, 23100, '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z')
        .repo('quill-core').person('vesna', 'Vesna Holloway').person('teodor', 'Teodor Brask')
        .at('2026-10-05T16:00:00Z').story(23295, 'Sealing wax', { area: CASE_POD, iteration: CASE_SPRINT, assignee: 'teodor' })
        .task(23395, 'Wax colours', { iteration: CASE_SPRINT, assignee: 'teodor' })
        .at('2026-10-06T16:00:00Z')
        .pr(23595, { repo: 'quill-core', author: 'teodor', title: 'Wax one', links: [23295] })
        .pr(23596, { repo: 'quill-core', author: 'teodor', title: 'Wax two', links: [23295] })
        .pr(23597, { repo: 'quill-core', author: 'teodor', title: 'Wax three', links: [] })
        .at('2026-10-07T16:00:00Z').completePr(23595, { approvedBy: ['vesna'] }).completePr(23596, { approvedBy: ['vesna'] })
        .completePr(23597, { approvedBy: ['vesna'] })
        // Vesna closes a Task that's tied to Teodor's Story only by an undated link.
        .state(23395, 'Closed', { by: 'vesna' })
        .at('2026-10-08T16:00:00Z').state(23295, 'Closed');
      return (observed ? b.observePrLink(23597, 23295).observeParent(23395, 23295) : b).build();
    };
    const plain = awardsOf(story(false));
    const seen = awardsOf(story(true));
    expect(bundle(story(true)).observations.length).toBe(2);
    expect(seen).toEqual(plain);
    expect(seen.map((a) => a.id)).not.toContain('hat-trick-reviews');
  });

  it('is deterministic: the same facts, and a rebuilt bundle, earn the same awards', () => {
    for (const c of achievementCases) {
      const h = bundle(c.earn);
      const f = factsOf(c.earn, h);
      const once = achievementsFor(f, viewerOf(c.earn), packFor(h), { tz: TZ });
      expect(achievementsFor(f, viewerOf(c.earn), packFor(h), { tz: TZ })).toEqual(once);
      expect(awardsOf(c.earn)).toEqual(once);
    }
  });

  it('writes its reasons in the words it’s given, in engine words by default', () => {
    const s = byId['clean-landing']!.earn;
    const h = bundle(s);
    const pack = packFor(h);
    const plain = achievementsFor(factsOf(s, h), viewerOf(s), pack, { tz: TZ }).find((a) => a.id === 'clean-landing')!;
    expect(plain.reason).toBe('One of your objectives reached Accomplished with all its steps already Accomplished');
    const t = terminology(pack, 'chart', { chart: { role: { objective: { one: 'rock', many: 'rocks' } } } });
    const themed = achievementsFor(factsOf(s, h), viewerOf(s), pack, { tz: TZ, terms: t }).find((a) => a.id === 'clean-landing')!;
    expect(themed.reason).toMatch(/^One of your rocks /);
  });

  it('orders awards by when they were earned', () => {
    for (const c of achievementCases) {
      const at = awardsOf(c.earn).map((a) => a.earnedAt.atUtc);
      expect(at).toEqual([...at].sort((a, b) => a - b));
    }
  });
});

describe('achievements: read at the event, not after it (17 W3-T3)', () => {
  // One pod's one-week sprint, as the cases have it: Vesna the viewer, Teodor and Ilse beside her.
  const mini = (name: string) => scenario(`achievement-probe-${name}`, { project: 'Quillmoor', tz: TZ, range: ['2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z'] })
    .area('Quillmoor', 23000).area(CASE_POD, 23001, { favorite: true, defaultScope: true })
    .iteration(CASE_SPRINT, 23100, '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z')
    .repo('quill-core').person('vesna', 'Vesna Holloway').person('teodor', 'Teodor Brask').person('ilse', 'Ilse Marrow')
    .at('2026-10-05T16:00:00Z');
  const IN = { area: CASE_POD, iteration: CASE_SPRINT };
  const awardOf = (s: Scenario, id: string, who = CASE_VIEWER) => {
    const h = bundle(s);
    return achievementsFor(factsOf(s, h), scenarioKeys(s).person(who), packFor(h), { tz: TZ }).find((a) => a.id === id);
  };
  const eventOf = (s: Scenario, eventKey: string) => bundle(s).events.find((e) => e.eventKey === eventKey)!;

  it('keeps an unknown-state step in Clean landing: it isn’t known to be Off, so it spoils the landing (INV-11)', () => {
    expect(resolveSignal(mapping, 'Task', 'Blocked').unknown).toBe(true);
    const story = (blocked: boolean) => mini(`clean-unknown-${blocked}`)
      .story(23461, 'Seal press', { ...IN, assignee: 'vesna' })
      .task(23462, 'Press plate', { parent: 23461, iteration: CASE_SPRINT, assignee: 'vesna' })
      .task(23463, 'Wax feed', { parent: 23461, iteration: CASE_SPRINT, assignee: 'ilse' })
      .at('2026-10-06T16:00:00Z').state(23461, 'Active').state(23462, 'Active').state(23463, 'Active')
      .at('2026-10-07T16:00:00Z').state(23462, 'Closed').state(23463, blocked ? 'Blocked' : 'Closed')
      .at('2026-10-08T16:00:00Z').state(23461, 'Closed')
      .build();
    expect(awardOf(story(false), 'clean-landing')).toBeDefined();
    expect(awardOf(story(true), 'clean-landing')).toBeUndefined();
  });

  it('reads the holder at the landing’s own event, before a reseat in the same millisecond', () => {
    // Vesna's third Story closes and goes to Teodor in one millisecond: the close sorts first
    // (03 §3), so the landing is hers, not his.
    const s = mini('same-ms-reseat')
      .story(23471, 'Nib grades', { ...IN, assignee: 'vesna' })
      .story(23472, 'Ink recipes', { ...IN, assignee: 'vesna' })
      .story(23473, 'Paper weights', { ...IN, assignee: 'vesna' })
      .at('2026-10-06T16:00:00Z').state(23471, 'Active').state(23472, 'Active').state(23473, 'Active')
      .at('2026-10-07T16:00:00Z').state(23471, 'Closed').state(23472, 'Closed')
      .at('2026-10-08T16:00:00Z').state(23473, 'Closed').assign(23473, 'teodor')
      .build();
    const k = scenarioKeys(s);
    const f = factsOf(s);
    // After every event of that instant the Story is Teodor's: the fold alone would credit him.
    expect(f.pieces.get(k.wi(23473))!.seatAt.at(-1)).toEqual({ from: Date.parse('2026-10-08T16:00:00Z'), seat: k.person('teodor') });
    const hat = awardOf(s, 'hat-trick-landings')!;
    expect(hat.pieces).toEqual([23471, 23472, 23473].map(k.wi));
    expect(eventOf(s, hat.earnedAt.eventKey).kind).toBe('wi_state_changed');
    expect(awardOf(s, 'hat-trick-landings', 'teodor')).toBeUndefined();
  });

  it('earns Clear skies at the move that cleared the seat, when that came after the last landing', () => {
    // Vesna lands one Story on Tuesday; her other open one goes to Teodor on Thursday, which clears her seat.
    const s = (clear: 'reseat' | 'off' | 'none') => mini(`clear-at-move-${clear}`)
      .story(23481, 'Ruled sheets', { ...IN, assignee: 'vesna' })
      .story(23482, 'Spare nibs', { ...IN, assignee: 'vesna' })
      .at('2026-10-06T16:00:00Z').state(23481, 'Active').state(23482, 'Active')
      .at('2026-10-07T16:00:00Z').state(23481, 'Closed')
      .at('2026-10-09T16:00:00Z')
      .apply((b) => (clear === 'reseat' ? b.assign(23482, 'teodor') : clear === 'off' ? b.state(23482, 'Removed') : b))
      .build();
    const thursday = Date.parse('2026-10-09T16:00:00Z');
    const reseat = s('reseat');
    const a = awardOf(reseat, 'clear-skies')!;
    expect(a.earnedAt.atUtc).toBe(thursday);
    expect(eventOf(reseat, a.earnedAt.eventKey).kind).toBe('wi_assignee_changed');
    expect(a.pieces).toEqual([scenarioKeys(reseat).wi(23481)]);
    const off = s('off');
    const b = awardOf(off, 'clear-skies')!;
    expect(b.earnedAt.atUtc).toBe(thursday);
    expect(eventOf(off, b.earnedAt.eventKey).kind).toBe('wi_state_changed');
    expect(awardOf(s('none'), 'clear-skies')).toBeUndefined();
  });

  it('binds a step to the parent it had at the instant, not its final one', () => {
    // A Task still Active when Vesna's Story lands, moved to Teodor's Story afterwards: it spoiled
    // the landing then. Moved before the landing, it no longer does.
    const s = (after: boolean) => {
      const b = mini(`step-parent-${after}`)
        .story(23491, 'Folio covers', { ...IN, assignee: 'vesna' })
        .story(23492, 'Folio spines', { ...IN, assignee: 'teodor' })
        .task(23493, 'Cover cloth', { parent: 23491, iteration: CASE_SPRINT, assignee: 'vesna' })
        .task(23494, 'Corner caps', { parent: 23491, iteration: CASE_SPRINT, assignee: 'ilse' })
        .at('2026-10-06T16:00:00Z').state(23491, 'Active').state(23493, 'Active').state(23494, 'Active')
        .at('2026-10-07T16:00:00Z').state(23493, 'Closed');
      const move = (x: typeof b) => x.unlink(23494, 23491).link(23494, 23492);
      return (after
        ? b.at('2026-10-08T16:00:00Z').state(23491, 'Closed').at('2026-10-09T16:00:00Z').apply(move)
        : b.at('2026-10-07T18:00:00Z').apply(move).at('2026-10-08T16:00:00Z').state(23491, 'Closed')).build();
    };
    const late = s(true);
    expect(factsOf(late).pieces.get(scenarioKeys(late).wi(23494))!.parent).toBe(scenarioKeys(late).wi(23492));
    expect(awardOf(late, 'clean-landing')).toBeUndefined();
    const early = s(false);
    expect(awardOf(early, 'clean-landing')?.pieces).toEqual([23491, 23493].map(scenarioKeys(early).wi));
  });

  it('credits Wingman to the piece a step served then, though it later moves to the viewer’s own', () => {
    const s = mini('wingman-step-parent')
      .story(23495, 'Gilt edges', { ...IN, assignee: 'teodor' })
      .story(23496, 'Gilt brushes', { ...IN, assignee: 'vesna' })
      .task(23497, 'Leaf sizing', { parent: 23495, iteration: CASE_SPRINT, assignee: 'ilse' })
      .at('2026-10-06T16:00:00Z').state(23495, 'Active').state(23497, 'Active')
      .at('2026-10-07T16:00:00Z').state(23497, 'Closed', { by: 'vesna' })
      .at('2026-10-08T16:00:00Z').unlink(23497, 23495).link(23497, 23496)
      .at('2026-10-09T16:00:00Z').state(23495, 'Closed')
      .build();
    const k = scenarioKeys(s);
    const w = awardOf(s, 'wingman')!;
    expect(w.pieces).toEqual([k.wi(23495), k.wi(23497)]);
    expect(w.earnedAt.atUtc).toBe(Date.parse('2026-10-09T16:00:00Z'));
  });

  it('times an arrival by its own event (RoundFacts.at): two climbs in one millisecond land at the second', () => {
    const s = mini('two-climbs')
      .story(23498, 'Blotting sand', { ...IN, assignee: 'vesna' })
      .at('2026-10-07T16:00:00Z').state(23498, 'Active').state(23498, 'Closed')
      .build();
    const h = bundle(s);
    const f = factsOf(s, h);
    expect([...f.moves.keys()].every((k) => f.at!.get(k) === h.events.find((e) => e.eventKey === k)!.occurredAt)).toBe(true);
    const a = awardOf(s, 'clear-skies')!;
    const e = eventOf(s, a.earnedAt.eventKey);
    expect(e.kind === 'wi_state_changed' && e.payload.to).toBe('Closed');
    // The Active between was never seen, so it's no dated first start: no Swift passage.
    expect(awardOf(s, 'swift-passage')).toBeUndefined();
  });

  it('of three climbs in one millisecond that land, reopen and land again, only the last is the arrival', () => {
    const s = mini('three-climbs')
      .story(23499, 'Sealing wax', { ...IN, assignee: 'vesna' })
      .story(23500, 'Quill knives', { ...IN, assignee: 'vesna' })
      .story(23501, 'Ink wells', { ...IN, assignee: 'vesna' })
      .at('2026-10-06T16:00:00Z').state(23499, 'Active').state(23500, 'Active').state(23501, 'Active')
      .at('2026-10-07T16:00:00Z').state(23500, 'Closed').state(23501, 'Closed')
      .at('2026-10-08T16:00:00Z').state(23499, 'Closed').state(23499, 'Active').state(23499, 'Closed')
      .build();
    const k = scenarioKeys(s);
    const closes = bundle(s).events.filter((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(23499) && (e.payload as { to: string }).to === 'Closed');
    expect(closes).toHaveLength(2);
    // The hat trick's third landing is the last close of that millisecond, not the first.
    expect(awardOf(s, 'hat-trick-landings')!.earnedAt.eventKey).toBe(closes[1]!.eventKey);
  });
});
