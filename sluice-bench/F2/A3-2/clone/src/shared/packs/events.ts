// An event's line in parts as its bundle's pack words it (22 B4): the one wording History's rows, the
// ruler and the notes on the plates in play all read, so the two explanations can't drift apart.
// Cached per bundle and event. Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import { eventParts, type EventParts } from '../engine/eventLine';
import { countsLine, terminology } from '../engine/terminology';
import { packFor } from './registry';

const cache = new WeakMap<ScopeHistory, { byKey: Map<string, AnyTimelineEvent>; parts: Map<string, EventParts> }>();

function of(h: ScopeHistory) {
  let c = cache.get(h);
  if (!c) cache.set(h, (c = { byKey: new Map(((h.events ?? []) as AnyTimelineEvent[]).map((e) => [e.eventKey, e])), parts: new Map() }));
  return c;
}

/** The bundle's event by key, if it has it. */
export function eventOf(h: ScopeHistory, eventKey: string): AnyTimelineEvent | undefined {
  return of(h).byKey.get(eventKey);
}

/** An event's parts, in its pack's source words (its adapter's `event`, else the engine's). */
export function partsOf(h: ScopeHistory, e: AnyTimelineEvent): EventParts {
  const c = of(h);
  const hit = c.parts.get(e.eventKey);
  if (hit) return hit;
  const pack = packFor(h);
  const t = terminology(pack, 'source', { mapping: h.stateMapping });
  const parts = pack.adapter.event?.(h, e, t) ?? eventParts(h, e, t);
  c.parts.set(e.eventKey, parts);
  return parts;
}

/**
 * The star's note for a sector sweep (27 E7, M-32, R9, R12): the count it reveals in the source's words, then the
 * sprint (the last `\` segment of its path), as `3 User Stories · 1 Bug created in Sprint 13`. Without a sprint
 * it drops the `in …`. The counts are the pieces revealed.
 */
export function sweepNote(h: ScopeHistory, counts: { objective: number; threat: number }): string {
  const t = terminology(packFor(h), 'source', { mapping: h.stateMapping });
  const sector = h.scope.sector;
  const leaf = sector.kind === 'sprint' ? sector.path.split('\\').filter(Boolean).at(-1) : undefined;
  return `${countsLine(t, { ...counts, done: 0 })} created${leaf ? ` in ${leaf}` : ''}`;
}
