// 05 §6 — following a captain: where the camera goes for each of their recorded anchors. Anchors are
// assignments to them (`wi_assignee_changed`, to == captain) and PRs they open (`pr_opened`, author
// == captain), as decided 2026-10-03; their other work plays wherever the viewer is. Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey, UtcMs } from '../contracts/keys';
import type { Lens, Snapshot } from '../contracts/view';
import { snapshotAt } from '../replay/snapshotAt';
import { describeEvent } from './describe';
import { BACKLOG } from '../hierarchy/backlog';
import type { Hierarchy } from '../hierarchy/types';

export interface FollowAnchor {
  eventKey: string;
  atUtc: UtcMs;
  kind: 'assignment' | 'pr';
  /** The Story or Bug whose close-up shows it, or null to stay where the viewer is. */
  body: CanonicalKey | null;
  /** The anchor's entity lies outside the loaded scope: the camera stays, and a note says so. */
  outside: boolean;
  /** The event, in plain words, for "Following ‹call sign›: ‹event›". */
  text: string;
}

export function followAnchors(h: ScopeHistory, captain: CanonicalKey, lens: Lens = 'knownThen', hier: Hierarchy = BACKLOG): FollowAnchor[] {
  const bodyOf = (snap: Snapshot, key: CanonicalKey) => hier.closeUpOf(snap, key, h);
  const events = h.events as AnyTimelineEvent[];
  const types = new Map(h.entities.workItems.map((w) => [w.key, w.type]));
  const typeOf = (k: CanonicalKey) => types.get(k) ?? 'Item';
  const out: FollowAnchor[] = [];
  for (const e of events) {
    const isAssign = e.kind === 'wi_assignee_changed' && e.payload.to === captain;
    const isPr = e.kind === 'pr_opened' && e.payload.authorKey === captain;
    if (!isAssign && !isPr) continue;
    const snap = snapshotAt(h, e.occurredAt, lens);
    const text = describeEvent(h, e, typeOf).text;
    if (isAssign) {
      const { body, inScope } = bodyOf(snap, e.entityKey);
      out.push({ eventKey: e.eventKey, atUtc: e.occurredAt, kind: 'assignment', body: inScope ? body : null, outside: !inScope, text });
      continue;
    }
    // A PR goes to its first linked Story or Bug, by link time then key (a Task's link counts for its
    // parent); an unlinked PR leaves the camera where it is.
    const linked = events
      .filter((x) => x.kind === 'link_pr_added' && x.payload.prKey === e.entityKey && x.occurredAt <= e.occurredAt)
      .map((x) => ({ at: x.occurredAt, item: (x as AnyTimelineEvent & { kind: 'link_pr_added' }).payload.itemKey }))
      .sort((a, b) => a.at - b.at || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0));
    let body: CanonicalKey | null = null;
    let outside = false;
    for (const l of linked) {
      const r = bodyOf(snap, l.item);
      if (r.body && r.inScope) { body = r.body; break; }
      if (!r.inScope) outside = true;
    }
    out.push({ eventKey: e.eventKey, atUtc: e.occurredAt, kind: 'pr', body, outside: !body && outside, text });
  }
  return out;
}

/** The latest anchor at or before a source time (Resume Follow, and a seek while following). */
export function latestAnchor(anchors: FollowAnchor[], at: UtcMs): FollowAnchor | undefined {
  let best: FollowAnchor | undefined;
  for (const a of anchors) if (a.atUtc <= at) best = a;
  return best;
}

// --- The captain's story (decided 2026-10-04) --------------------------------------------------

/**
 * The events of a captain's story: what they did, and what happened to their work. That covers:
 * - their own changes (`changedBy`);
 * - assignments to or from them;
 * - the PRs they authored, open to merge;
 * - the merges they approved;
 * - and others' changes to items assigned to them at that moment.
 *
 * Following a captain plays only these (a schedule like highlights: the state stays the full snapshot),
 * so the gaps between their events compress and the ship is rarely idle.
 */
export function storyOf(h: ScopeHistory, captain: CanonicalKey): (e: AnyTimelineEvent) => boolean {
  const events = h.events as AnyTimelineEvent[];
  const authored = new Set<CanonicalKey>();
  // When each item was assigned to the captain: [from, to) intervals, from creation and reassignment.
  const spans = new Map<CanonicalKey, [number, number][]>();
  const open = new Map<CanonicalKey, number>();
  for (const e of events) {
    if (e.kind === 'pr_opened' && e.payload.authorKey === captain) authored.add(e.entityKey);
    const to = e.kind === 'wi_created' ? e.payload.assigneeKey : e.kind === 'wi_assignee_changed' ? e.payload.to : undefined;
    if (to === undefined) continue;
    const start = open.get(e.entityKey);
    if (start !== undefined && to !== captain) {
      spans.set(e.entityKey, [...(spans.get(e.entityKey) ?? []), [start, e.occurredAt]]);
      open.delete(e.entityKey);
    } else if (start === undefined && to === captain) open.set(e.entityKey, e.occurredAt);
  }
  for (const [k, start] of open) spans.set(k, [...(spans.get(k) ?? []), [start, Infinity]]);
  const theirs = (key: CanonicalKey, t: number) => (spans.get(key) ?? []).some(([a, b]) => a <= t && t < b);
  return (e) => {
    if (e.changedBy === captain) return true;
    switch (e.kind) {
      case 'wi_assignee_changed': return e.payload.to === captain || e.payload.from === captain || theirs(e.entityKey, e.occurredAt);
      case 'pr_opened': return e.payload.authorKey === captain;
      case 'pr_completed': return authored.has(e.entityKey) || !!e.payload.approvedBy?.includes(captain);
      case 'pr_abandoned': return authored.has(e.entityKey);
      case 'link_pr_added': case 'link_pr_removed': return authored.has(e.payload.prKey) || theirs(e.payload.itemKey, e.occurredAt);
      case 'link_parent_added': case 'link_parent_removed': return theirs(e.payload.childKey, e.occurredAt);
      case 'link_dependency_added': case 'link_dependency_removed': return theirs(e.payload.successorKey, e.occurredAt) || theirs(e.payload.predecessorKey, e.occurredAt);
      default: return theirs(e.entityKey, e.occurredAt);
    }
  };
}

export interface StoryAnchor {
  eventKey: string;
  atUtc: UtcMs;
  /** The system that shows it (the Backlog's Feature): following's stage (close-ups stay opt-in). Null: stay put. */
  stage: CanonicalKey | null;
  /** The work item it's about (the camera frames it), or null. */
  item: CanonicalKey | null;
  /** Its item lies in no system in the loaded scope (an uncharted Task): the camera stays, with a note. */
  outside: boolean;
  text: string;
}

/** Each story event, and the system it happens in (05 §6: the camera stays with the ship's work). */
export function storyAnchors(h: ScopeHistory, captain: CanonicalKey, lens: Lens = 'knownThen', hier: Hierarchy = BACKLOG): StoryAnchor[] {
  const events = h.events as AnyTimelineEvent[];
  const inStory = storyOf(h, captain);
  const types = new Map(h.entities.workItems.map((w) => [w.key, w.type]));
  const typeOf = (k: CanonicalKey) => types.get(k) ?? 'Item';
  const out: StoryAnchor[] = [];
  for (const e of events) {
    if (e.occurredAt < h.range.startUtc || !inStory(e)) continue;
    const snap = snapshotAt(h, e.occurredAt, lens);
    // The item it's about: the event's own, or (a PR) its first linked item at that moment.
    let item: CanonicalKey | null = e.kind.startsWith('pr_') ? null : e.kind.startsWith('link_pr') ? (e as AnyTimelineEvent & { kind: 'link_pr_added' }).payload.itemKey
      : e.kind.startsWith('link_parent') ? (e as AnyTimelineEvent & { kind: 'link_parent_added' }).payload.childKey : e.entityKey;
    if (!item) item = snap.links.find((l) => l.kind === 'pr' && l.fromKey === e.entityKey)?.toKey ?? null;
    const stage = item ? hier.stageOf(snap, item, h)?.key ?? null : null;
    out.push({ eventKey: e.eventKey, atUtc: e.occurredAt, stage, item, outside: !!item && !stage, text: describeEvent(h, e, typeOf).text });
  }
  return out;
}

/** The latest story anchor at or before a time (Resume, a seek). */
export function latestStoryAnchor(anchors: StoryAnchor[], at: UtcMs): StoryAnchor | undefined {
  let best: StoryAnchor | undefined;
  for (const a of anchors) if (a.atUtc <= at) best = a;
  return best;
}
