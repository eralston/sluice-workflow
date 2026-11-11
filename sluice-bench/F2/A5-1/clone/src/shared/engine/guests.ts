// Guests come and go (22 C8, 05 §8.6a K-13, K-14): someone with no seat in a region who helps there
// (a step, a climb, a PR opened, merged or approved while it serves the region) has a ship only while
// they're needed. Their presence is planned once over the region's schedule, so a seek shows a guest
// exactly where playing would (INV-12, INV-15):
// - each accented beat they help in is a visit, from its start to its end in playback;
// - a visit followed by another within `GUEST_STAY_MS` of playback at 1× joins it (they wait nearby);
// - otherwise they leave as the next beat plays, and can come back later.
// Engine code: no theme or source names here (the literal fence). Pure and deterministic.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { Beat, GuestPresence, GuestWindow } from '../contracts/playback';
import { parentAtTime, servesAt } from './facts';
import type { RoundFacts } from './types';

/** A guest needed again within this much playback at 1× waits nearby rather than leaving (K-14). */
export const GUEST_STAY_MS = 10_000;

/** One person's help in an event, and where it was: the pieces it served, best first (its facility's only when nothing else is). */
export interface Help { who: CanonicalKey; at: CanonicalKey[] }

/**
 * Who helped in an event, and with what (2026-10-12; 22 C8): a climb's actor or a new step's maker on
 * its piece (a step stands for its parent); a PR's author, or its merger and approvers, on the work it
 * serves, while it serves the region (22 C12), and its facility after that.
 */
export function helpOf(f: RoundFacts, e: AnyTimelineEvent): Help[] {
  const out: Help[] = [];
  const pieceOf = (key: CanonicalKey): CanonicalKey | null => {
    const p = f.pieces.get(key);
    return p?.role === 'step' ? parentAtTime(p, e.occurredAt) : p ? key : null;
  };
  const served = (pr: CanonicalKey, facility: CanonicalKey) =>
    [...new Set((f.attachments.get(pr)?.links ?? []).map(pieceOf).filter((k): k is CanonicalKey => !!k)), facility];
  for (const mv of f.moves.get(e.eventKey) ?? []) {
    if (mv.m === 'attach') {
      const who = mv.author ?? e.changedBy;
      if (who && servesAt(f, mv.key, e.occurredAt)) out.push({ who, at: served(mv.key, mv.facility) });
    } else if (mv.m === 'settle') {
      if (!servesAt(f, mv.key, e.occurredAt)) continue;
      const at = served(mv.key, mv.facility);
      for (const who of [mv.actor ?? e.changedBy, ...mv.approvers]) if (who) out.push({ who, at });
    } else if (mv.m === 'climb' || (mv.m === 'appear' && mv.role === 'step')) {
      const who = mv.m === 'climb' ? mv.actor ?? e.changedBy : e.changedBy;
      const at = pieceOf(mv.key);
      if (who && at) out.push({ who, at: [at] });
    }
  }
  return out;
}

/**
 * When each guest is in the region (K-13, K-14), by person: windows of the schedule's state time, so a
 * projection at any playhead reads them. `beats` are the region's laid-out beats; `seated` the people
 * with a seat here, who are never guests.
 */
export function guestPresence(h: ScopeHistory, beats: readonly Beat[], f: RoundFacts, seated: ReadonlySet<CanonicalKey>): GuestPresence {
  const byKey = new Map(h.events.map((e) => [e.eventKey, e]));
  // Each guest's visits: the accented beats they help in, in order.
  const visits = new Map<CanonicalKey, number[]>();
  beats.forEach((b, i) => {
    if (!b.accented || b.durationMs <= 0) return; // a silent beat flies no one
    const here = new Set<CanonicalKey>();
    for (const k of b.eventKeys) {
      const e = byKey.get(k);
      if (e) for (const x of helpOf(f, e)) if (!seated.has(x.who)) here.add(x.who);
    }
    for (const who of here) visits.set(who, [...(visits.get(who) ?? []), i]);
  });
  const endMs = (i: number) => beats[i]!.presentationStartMs + beats[i]!.durationMs;
  const out = new Map<CanonicalKey, GuestWindow[]>();
  for (const who of [...visits.keys()].sort()) {
    const list = visits.get(who)!;
    const windows: GuestWindow[] = [];
    let first = list[0]!;
    for (let j = 0; j < list.length; j++) {
      const i = list[j]!;
      const n = list[j + 1];
      // Needed again soon: they wait nearby. Otherwise they leave as the next beat plays.
      if (n !== undefined && beats[n]!.presentationStartMs - endMs(i) <= GUEST_STAY_MS) continue;
      windows.push({ fromUtc: beats[first]!.sourceUtc, untilUtc: beats[i + 1]?.sourceUtc ?? null });
      if (n !== undefined) first = n;
    }
    out.set(who, windows);
  }
  return out;
}

/** Whether a guest is in the region at state time `t` (K-13, K-14). */
export function presentAt(windows: readonly GuestWindow[] | undefined, t: UtcMs): boolean {
  return !!windows?.some((w) => w.fromUtc <= t && (w.untilUtc === null || t < w.untilUtc));
}
