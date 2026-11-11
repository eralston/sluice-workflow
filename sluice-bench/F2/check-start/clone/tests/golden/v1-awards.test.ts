// Achievements (G) (17 W2-T7, 14 §5): every award `pod-sprint`'s Sprint 13 earns, for each person
// as the viewer, in each region and in the whole round, plus the ids each achievement case earns.
// The app only ever computes the chosen viewer's (18 §1); the golden asks for everyone's so a rule
// change shows who it moves. Wren, the intended viewer, earns at least five in Harbor Pod.
import { describe, expect, it } from 'vitest';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { achievementCases, CASE_POD, CASE_SPRINT, CASE_VIEWER } from '@fixtures/scenarios/v1/achievementCases';
import { scenarioKeys, sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import type { CanonicalKey } from '@shared/contracts/keys';
import { achievementsFor } from '@shared/engine/achievements';
import { roundFacts } from '@shared/engine/facts';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { mapping } from './helpers';

const bundleOf = (s: Scenario, sprint: string) => toHistory(s, mapping, sprintScopes(s).find((x) => x.sprint === sprint)!);

const SPRINT = 'Tidewater Array\\Sprint 13';
const k = scenarioKeys(podSprint);
const h = bundleOf(podSprint, SPRINT);
const pack = packFor(h);
const iso = (t: number) => new Date(t).toISOString();

/** The work item or PR number a key ends with, for a readable golden. */
const short = (key: CanonicalKey) => key.slice(key.lastIndexOf(':') + 1);

const regions = [
  { name: 'Harbor Pod', ref: { level: 'pod', key: k.area('Tidewater Array\\Harbor Pod') } },
  { name: 'Lantern Pod', ref: { level: 'pod', key: k.area('Tidewater Array\\Lantern Pod') } },
  { name: 'Sprint 13 (the round)', ref: { level: 'sprint', key: k.iteration(SPRINT) } },
];

const awardsIn = (ref: { level: string; key: CanonicalKey }, viewer: CanonicalKey) =>
  achievementsFor(roundFacts(h, ref, pack), viewer, pack, { tz: podSprint.tz });

describe('achievements (G): pod-sprint', () => {
  it('matches its golden awards, for every viewer in every region', async () => {
    const people = [...h.entities.captains].sort((a, b) => (a.displayName < b.displayName ? -1 : 1));
    const golden = {
      scenario: podSprint.name, sprint: SPRINT, tz: podSprint.tz,
      regions: regions.map(({ name, ref }) => ({
        region: name,
        viewers: people.map((c) => ({
          viewer: c.displayName,
          awards: awardsIn(ref, c.key).map((a) => ({
            id: a.id, at: iso(a.earnedAt.atUtc), event: a.earnedAt.eventKey.split(':')[0], pieces: a.pieces.map(short), reason: a.reason,
          })),
        })),
      })),
      cases: achievementCases.map((c) => {
        const ids = (s: Scenario) => {
          const b = bundleOf(s, CASE_SPRINT);
          const f = roundFacts(b, { level: 'pod', key: scenarioKeys(s).area(CASE_POD) }, packFor(b));
          return achievementsFor(f, scenarioKeys(s).person(CASE_VIEWER), packFor(b), { tz: s.tz }).map((a) => a.id);
        };
        return { id: c.id, edge: c.edge, earn: ids(c.earn), near: ids(c.near) };
      }),
    };
    await expect(JSON.stringify(golden, null, 2) + '\n').toMatchFileSnapshot('./__golden__/v1-awards.json');
  });

  it('gives Wren, the intended viewer, at least five in Harbor Pod, none of them Hat trick: defences', () => {
    const ids = awardsIn(regions[0]!.ref, k.person('wren')).map((a) => a.id);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    // As designed (17 W1-T2): every v1 rule but the defences, since Wren holds no threats.
    expect(ids.sort()).toEqual(['clean-landing', 'clear-skies', 'hat-trick-landings', 'hat-trick-reviews', 'steady-hands', 'swift-passage', 'wingman']);
  });

  it('names the pieces the awards were earned on', () => {
    const wren = awardsIn(regions[0]!.ref, k.person('wren'));
    const by = Object.fromEntries(wren.map((a) => [a.id, a]));
    expect(by['hat-trick-landings']!.pieces).toEqual([20101, 20102, 20103].map(k.wi));
    expect(by['hat-trick-reviews']!.pieces).toEqual([21001, 21000, 21007].map(k.pr));
    expect(by['swift-passage']!.pieces).toEqual([k.wi(20101)]);
    expect(by['clean-landing']!.pieces).toEqual([20101, 20301, 20302].map(k.wi));
    // The first help that landed: her approval of Juno's merge, the instant Juno's Story closed.
    expect(by['wingman']!.pieces).toEqual([k.wi(20121), k.pr(21001)]);
  });

  it('awards nobody without a viewer', () => {
    for (const { ref } of regions) expect(achievementsFor(roundFacts(h, ref, pack), null, pack)).toEqual([]);
  });
});
