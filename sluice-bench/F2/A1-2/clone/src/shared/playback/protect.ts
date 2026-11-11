// 05 §5 — protected moments (decided 2026-10-03): a merge, or a Feature, Story, or Bug closing, is
// the success the chart exists to show, so nothing else may move its cast until it has played. Other
// accents in the same beat that would move the cast start after it (a stagger inside the beat, never
// a queue across beats: INV-15); unrelated ones, like another body's stage change, play alongside.
// Pure: the schedule sizes beats with it, and the plan tells the director when to start each accent.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import { resolveState } from '../stateMapping';
import { SYSTEM_LAYOUT } from '../limits';
import { accentFor, entityKind } from './accents';

export interface ProtectedMoment {
  eventKey: string;
  /** How long the cast is protected, from the moment's start (its whole choreography). */
  windowMs: number;
  /** The PR lane is cast: no vessel may launch, dock, or re-spread it. */
  lane: boolean;
  /** People whose ships are cast: no flight may take them away. */
  people: Set<CanonicalKey>;
  /** Items that may not be moved (reparented or rekeyed). */
  entities: Set<CanonicalKey>;
  /** A Feature closing: everything that moves in its system is cast. */
  whole: boolean;
  /** A merge: the work its PR links to (on a board, moving that work would move the vessel). */
  linked?: Set<CanonicalKey>;
}

/** The PR's author, from its `pr_opened`. */
export function prAuthor(h: ScopeHistory, prKey: CanonicalKey): CanonicalKey | undefined {
  const opened = (h.events as AnyTimelineEvent[]).find((x) => x.kind === 'pr_opened' && x.entityKey === prKey);
  return opened?.kind === 'pr_opened' ? opened.payload.authorKey ?? undefined : undefined;
}

/** The protected moment an event begins, or null. */
export function protectedMoment(h: ScopeHistory, e: AnyTimelineEvent): ProtectedMoment | null {
  const spec = accentFor(h, e);
  if (!spec || e.priority === 'low') return null;
  if (e.kind === 'pr_completed') {
    const people = new Set<CanonicalKey>(e.payload.approvedBy ?? []);
    const author = prAuthor(h, e.entityKey);
    if (author) people.add(author);
    if (e.changedBy) people.add(e.changedBy);
    const linked = new Set((h.events as AnyTimelineEvent[]).flatMap((x) => (x.kind === 'link_pr_added' && x.payload.prKey === e.entityKey ? [x.payload.itemKey] : [])));
    return { eventKey: e.eventKey, windowMs: spec.durationMs, lane: true, people, entities: new Set([e.entityKey]), whole: false, linked };
  }
  if (e.kind !== 'wi_state_changed') return null;
  const kind = entityKind(h, e);
  if (kind !== 'feature' && kind !== 'story' && kind !== 'bug') return null;
  const type = h.entities.workItems.find((w) => w.key === e.entityKey)?.type ?? '';
  if (resolveState(h.stateMapping, type, e.payload.to).category !== 'Completed') return null;
  const people = new Set<CanonicalKey>(e.changedBy ? [e.changedBy] : []);
  return { eventKey: e.eventKey, windowMs: spec.durationMs, lane: false, people, entities: new Set([e.entityKey]), whole: kind === 'feature' };
}

/** Whether another event would move a moment's cast (06 §5): a vessel, a cast ship, or a cast item. */
export function movesCast(h: ScopeHistory, e: AnyTimelineEvent, m: ProtectedMoment): boolean {
  if (e.eventKey === m.eventKey) return false;
  if (m.whole) return !(e.kind === 'wi_title_changed' || (e.kind === 'wi_state_changed' && entityKind(h, e) !== 'task'));
  if (m.lane && (e.kind.startsWith('pr_') || e.kind === 'link_pr_added' || e.kind === 'link_pr_removed')) return true;
  // On a board (06 §3) a Story or Bug moves when its stage or assignee changes, and the merging vessel's
  // lane place follows the work it links to: so that work's move waits for the formation (decided 2026-10-09).
  if (m.lane && SYSTEM_LAYOUT === 'board' && (e.kind === 'wi_state_changed' || e.kind === 'wi_assignee_changed') && m.linked?.has(e.entityKey)) return true;
  if (e.changedBy && m.people.has(e.changedBy)) return true;
  if (e.kind === 'wi_assignee_changed' && ((e.payload.from && m.people.has(e.payload.from)) || (e.payload.to && m.people.has(e.payload.to)))) return true;
  if ((e.kind === 'link_parent_added' || e.kind === 'link_parent_removed') && m.entities.has(e.payload.childKey)) return true;
  if ((e.kind === 'wi_area_changed' || e.kind === 'wi_iteration_changed') && m.entities.has(e.entityKey)) return true;
  return false;
}

const overlaps = (a: ProtectedMoment, b: ProtectedMoment) =>
  a.whole || b.whole || (a.lane && b.lane) || [...a.people].some((p) => b.people.has(p)) || [...a.entities].some((k) => b.entities.has(k));

/**
 * Sequence a beat around its protected moments. Each moment starts once every earlier moment it
 * shares cast with has finished; each other accent that moves a cast starts once that moment has.
 * Returns each accented event's start offset (only non-zero ones) and the beat's whole duration.
 */
export function protectBeat(h: ScopeHistory, events: AnyTimelineEvent[]): { afterMs: Map<string, number>; durationMs: number } {
  const accented = events.filter((e) => e.priority !== 'low' && accentFor(h, e));
  const moments: { m: ProtectedMoment; startMs: number }[] = [];
  for (const e of accented) {
    const m = protectedMoment(h, e);
    if (!m) continue;
    const startMs = Math.max(0, ...moments.filter((p) => overlaps(p.m, m)).map((p) => p.startMs + p.m.windowMs));
    moments.push({ m, startMs });
  }
  const afterMs = new Map<string, number>();
  let durationMs = 0;
  for (const e of accented) {
    const own = moments.find((p) => p.m.eventKey === e.eventKey);
    const start = own ? own.startMs : Math.max(0, ...moments.filter((p) => movesCast(h, e, p.m)).map((p) => p.startMs + p.m.windowMs));
    if (start > 0) afterMs.set(e.eventKey, start);
    durationMs = Math.max(durationMs, start + accentFor(h, e)!.durationMs);
  }
  return { afterMs, durationMs };
}
