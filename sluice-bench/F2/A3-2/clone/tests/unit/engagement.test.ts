// Activity (05 §5, 2026-10-09): which events get a ship, and who flies. Pure planning; the director's
// beams are measured in tests/e2e/activity-level.spec.ts.
import { describe, expect, it } from 'vitest';
import { scenarios } from '@fixtures/scenarios';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { lightActions, planAccents } from '@shared/playback/plan';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { historyOf } from '../golden/helpers';

const s = scenarios.find((x) => x.name === 'orbit-week')!;
const h = historyOf(s);
const sch = buildBeatSchedule(h, h.range, s.tz);
const end = snapshotAt(h, h.range.endUtc, 'knownThen');
const eventOf = new Map((h.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));

describe('Activity levels (05 §5)', () => {
  it('Calm is the pace before the dial: cut beats play nothing, and no subjects are named', () => {
    const cut = sch.beats.filter((b) => !b.accented);
    expect(cut.length).toBeGreaterThan(0);
    for (const b of cut) expect(planAccents(h, b, end, end, ENGAGEMENT.calm)).toEqual([]);
    for (const b of sch.beats.filter((x) => x.accented)) {
      expect(planAccents(h, b, end, end, ENGAGEMENT.calm).every((a) => a.subjectKey === undefined)).toBe(true);
    }
  });

  it('Maximum gives every cut beat a ship action for each Medium-or-better change someone made', () => {
    const cut = sch.beats.filter((b) => !b.accented);
    let expected = 0;
    for (const b of cut) {
      const plan = planAccents(h, b, end, end, ENGAGEMENT.maximum);
      const evs = b.eventKeys.map((k) => eventOf.get(k)!).filter((e) => e.priority !== 'low' && e.changedBy);
      expected += evs.length;
      for (const e of evs) expect(plan.some((a) => a.name === 'shipAction' && a.eventKey === e.eventKey && a.actorKey === e.changedBy)).toBe(true);
      expect(plan.every((a) => a.name === 'shipAction' && a.durationMs === 0)).toBe(true); // they cost the schedule nothing
    }
    expect(expected).toBeGreaterThan(0);
  });

  it('an assignment names the new assignee as its subject, so their ship flies in and beams too', () => {
    const beat = sch.beats.find((b) => b.eventKeys.some((k) => eventOf.get(k)!.kind === 'wi_assignee_changed'))!;
    const e = beat.eventKeys.map((k) => eventOf.get(k)!).find((x) => x.kind === 'wi_assignee_changed')! as AnyTimelineEvent & { kind: 'wi_assignee_changed' };
    for (const eng of [ENGAGEMENT.lively, ENGAGEMENT.maximum]) {
      const plan = [...planAccents(h, beat, end, end, eng), ...lightActions(h, [beat], end, eng)].filter((a) => a.eventKey === e.eventKey);
      expect(plan.length).toBeGreaterThan(0);
      if (e.payload.to && e.payload.to !== e.changedBy) expect(plan.some((a) => a.subjectKey === e.payload.to)).toBe(true);
    }
  });

  it('the levels only ever add: Calm ⊆ Lively ⊆ Maximum', () => {
    const { calm: c, lively: l, maximum: m } = ENGAGEMENT;
    expect([c.lightActions, l.lightActions, m.lightActions]).toEqual([false, true, true]);
    expect(c.maxGuests).toBeLessThanOrEqual(l.maxGuests);
    expect(l.maxGuests).toBeLessThanOrEqual(m.maxGuests);
    expect(l.actionsPerBeat).toBeLessThanOrEqual(m.actionsPerBeat);
  });
});
