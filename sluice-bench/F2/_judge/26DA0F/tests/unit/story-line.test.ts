// History cards (06 §4, decided 2026-10-04): one plain sentence per event, in ADO terms, naming
// the people and the item.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import { scenarioKeys, toHistory } from '@fixtures/dsl';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { CanonicalKey } from '@shared/contracts/keys';
import { storyLine } from '@shared/playback/describe';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { mapping } from '../golden/helpers';

const s = scenarios[0]!;
const k = scenarioKeys(s);
const h = toHistory(s, mapping);
const end = snapshotAt(h, h.range.endUtc, 'knownThen');
const types = new Map(h.entities.workItems.map((w) => [w.key, w.type]));
const line = (pred: (e: AnyTimelineEvent) => boolean) =>
  storyLine(h, (h.events as AnyTimelineEvent[]).find(pred)!, (key: CanonicalKey) => types.get(key) ?? 'Item', (key) => end.workItems.get(key)?.title);

describe('storyLine', () => {
  it('names the actor, the verb, and the item', () => {
    expect(line((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(201) && e.payload.to === 'Resolved').text)
      .toBe('Rafe Okoro resolved User Story #201 · Show quote history on the policy page');
  });
  it('says who took work, and who handed it over', () => {
    expect(line((e) => e.kind === 'wi_assignee_changed' && e.entityKey === k.wi(202)).text)
      .toBe('Ava Lindqvist took User Story #202 · Export ledger entries to CSV');
  });
  it('names a PR and its reviewers at the merge', () => {
    expect(line((e) => e.kind === 'pr_opened' && e.entityKey === k.pr(9002)).text).toBe('Ava Lindqvist opened PR 9002 · Quote history panel');
    const merged = line((e) => e.kind === 'pr_completed' && e.entityKey === k.pr(9001));
    expect(merged.text).toBe('Rafe Okoro merged PR 9001, approved by Ava Lindqvist and Jo Marchetti');
    expect(merged.object).toBe('pr');
  });
  it('a Task is a task; a Bug is a bug (the card icon)', () => {
    expect(line((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(403)).object).toBe('task');
    expect(line((e) => e.kind === 'wi_state_changed' && e.entityKey === k.wi(301)).object).toBe('bug');
  });
});
