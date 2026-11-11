// A region plays only its own PR work (22 C12, 05 §8 B-20): a PR's events belong to a region only while
// the PR serves a story or bug (or one of its Tasks) in that area path and sprint. meridian's Rook opens
// a kiosk-firmware PR for a Convoy Story, the Story moves to Signals, then the PR merges: the merge is
// Signals' alone, and only Signals counts it toward its station's form.
import { describe, expect, it } from 'vitest';
import meridian from '@fixtures/scenarios/v1/meridian-sprint';
import { sprintScopes, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { CanonicalKey } from '@shared/contracts/keys';
import { roundFacts, servesAt } from '@shared/engine/facts';
import { SOLAR } from '@shared/hierarchy/solar';
import { packFor } from '@shared/packs/registry';
import { buildScene } from '@shared/playback/highlights';
import { mapping } from '../golden/helpers';

const TZ = 'America/Los_Angeles';
const h = toHistory(meridian, mapping, sprintScopes(meridian).find((x) => x.sprint.endsWith('Sprint 7'))!);
const pods = (h.scope.sector as { pods: { areaKey: CanonicalKey; path: string }[] }).pods;
const pod = (name: string) => pods.find((p) => p.path.endsWith(name))!.areaKey;
const CONVOY = pod('Convoy Planning Pod');
const SIGNALS = pod('Signals Pod');
const events = h.events as AnyTimelineEvent[];
const opened = events.find((e) => e.kind === 'pr_opened' && e.entityKey.endsWith(':56005'))!;
const merged = events.find((e) => e.kind === 'pr_completed' && e.entityKey.endsWith(':56005'))!;
const played = (region: CanonicalKey) => new Set(buildScene(h, h.range, TZ, `pod:${region}` as never, SOLAR).beats.flatMap((b) => b.eventKeys));
const facts = (region: CanonicalKey) => roundFacts(h, { level: 'pod', key: region }, packFor(h));

describe('a region plays only its own PR work (22 C12)', () => {
  it('the fixture has the case: opened while Convoy’s, merged once Signals’', () => {
    expect(opened.occurredAt).toBeLessThan(merged.occurredAt);
    expect(servesAt(facts(CONVOY), opened.entityKey, opened.occurredAt)).toBe(true);
    expect(servesAt(facts(CONVOY), merged.entityKey, merged.occurredAt)).toBe(false);
    expect(servesAt(facts(SIGNALS), merged.entityKey, merged.occurredAt)).toBe(true);
  });

  it('Convoy plays the opening, not the merge; Signals plays the merge', () => {
    expect(played(CONVOY).has(opened.eventKey)).toBe(true);
    expect(played(CONVOY).has(merged.eventKey)).toBe(false);
    expect(played(SIGNALS).has(merged.eventKey)).toBe(true);
  });

  it('only Signals counts the merge toward its station’s form', () => {
    const repo = (f: ReturnType<typeof facts>) => f.attachments.get(merged.entityKey)?.facility;
    const fac = repo(facts(SIGNALS))!;
    expect(fac).toBeDefined();
    expect(facts(SIGNALS).firstMerge?.get(fac)).toBe(merged.entityKey);
    expect(facts(CONVOY).firstMerge?.get(fac)).toBeUndefined();
    expect(facts(CONVOY).merges?.get(fac) ?? []).not.toContain(merged.entityKey);
  });

  it('no region plays a merge whose PR serves none of its work at that moment', () => {
    for (const p of pods) {
      const f = facts(p.areaKey);
      const keys = played(p.areaKey);
      for (const e of events) if (e.kind === 'pr_completed' && keys.has(e.eventKey)) expect(servesAt(f, e.entityKey, e.occurredAt)).toBe(true);
    }
  });
});
