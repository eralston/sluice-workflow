// 05 §5 — what a playing beat should show: its events' accents (02 §4), described in canonical
// terms. The renderer's AnimationDirector places each one on the current scene's projections and
// skips any whose entity isn't in view (never deferred). Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { Beat } from '../contracts/playback';
import type { Snapshot } from '../contracts/view';
import { accentFor, type AccentName } from './accents';
import { ENGAGEMENT, type Engagement } from './engagement';
import { prAuthor, protectBeat, protectedMoment } from './protect';

export interface PlannedAccent {
  /** `shipAction`: no accent of its own, just the ship (and beam) for a change the budget left unaccented. */
  name: AccentName | 'authorBeam' | 'shipAction';
  eventKey: string;
  /** The item or PR the accent lands on. */
  entityKey: CanonicalKey;
  durationMs: number;
  /** stageShift: the stage before and after the beat. */
  fromStage?: string;
  toStage?: string;
  /** captainJump: who left the item and who took it (02 §4: out at A, in at B). */
  leaving?: CanonicalKey | null;
  arriving?: CanonicalKey | null;
  /** Routes, launches, and author beams. */
  prKey?: CanonicalKey;
  itemKey?: CanonicalKey;
  authorKey?: CanonicalKey;
  parentKey?: CanonicalKey;
  /** Who made the change (the event's `changedBy`): the source of the cause → effect beam (06 §5). */
  actorKey?: CanonicalKey;
  /** The other person in it, when the level asks for them (engagement.subjects): a new assignee, a PR's author. */
  subjectKey?: CanonicalKey;
  /** sectorRekey: the Area Path the item moved to. */
  toArea?: string;
  /** dock: the approvers whose ships join the review formation (06 §5). */
  approvedBy?: CanonicalKey[];
  /** Start this long into the beat: it would move a protected moment's cast, so it waits for it (05 §5). */
  afterMs?: number;
  /** A protected moment begins here (05 §5): nothing else may move its cast for `windowMs`. */
  protect?: { windowMs: number; lane: boolean; people: CanonicalKey[]; entities: CanonicalKey[]; whole: boolean };
}

/**
 * The item or PR a ship works for an event, and the other person in it (the subject). Events about the
 * hierarchy or a PR link name the thing that changes; the subject is who is newly in the picture.
 */
function actionTarget(e: AnyTimelineEvent, after: Snapshot, h: ScopeHistory): { target: CanonicalKey; subject?: CanonicalKey } {
  switch (e.kind) {
    case 'wi_assignee_changed': return { target: e.entityKey, ...(e.payload.to ? { subject: e.payload.to } : {}) };
    case 'link_pr_added': case 'link_pr_removed': return { target: e.payload.itemKey, ...(prAuthor(h, e.payload.prKey) ? { subject: prAuthor(h, e.payload.prKey)! } : {}) };
    case 'pr_opened': return { target: e.entityKey, ...(e.payload.authorKey ? { subject: e.payload.authorKey } : {}) };
    case 'pr_completed': case 'pr_abandoned': return { target: e.entityKey, ...(prAuthor(h, e.entityKey) ? { subject: prAuthor(h, e.entityKey)! } : {}) };
    default: {
      // Another hand on the item: whoever it is assigned to, if not the one who changed it.
      const who = after.workItems.get(e.entityKey)?.assigneeKey;
      return { target: e.entityKey, ...(who ? { subject: who } : {}) };
    }
  }
}

/**
 * Ship actions without accents (engagement.lightActions): for each Medium-or-better event in these
 * beats, the person who made it and, when asked for, the other person in it. The director sends their
 * ships to the thing and engages the tractor beam; nothing here costs schedule time.
 */
export function lightActions(h: ScopeHistory, beats: Beat[], after: Snapshot, eng: Engagement): PlannedAccent[] {
  const keys = new Set(beats.flatMap((b) => b.eventKeys));
  const out: PlannedAccent[] = [];
  for (const e of h.events as AnyTimelineEvent[]) {
    if (!keys.has(e.eventKey) || e.priority === 'low') continue;
    const { target, subject } = actionTarget(e, after, h);
    const actor = e.changedBy ?? undefined;
    const sub = eng.subjects && subject && subject !== actor ? subject : undefined;
    if (!actor && !sub) continue;
    out.push({ name: 'shipAction', eventKey: e.eventKey, entityKey: target, durationMs: 0, ...(actor ? { actorKey: actor } : {}), ...(sub ? { subjectKey: sub } : {}) });
  }
  return out;
}

export function planAccents(h: ScopeHistory, beat: Beat, before: Snapshot, after: Snapshot, eng: Engagement = ENGAGEMENT.calm): PlannedAccent[] {
  if (!beat.accented) return eng.lightActions ? lightActions(h, [beat], after, eng) : [];
  const keys = new Set(beat.eventKeys);
  const { afterMs } = protectBeat(h, (h.events as AnyTimelineEvent[]).filter((e) => keys.has(e.eventKey)));
  const out: PlannedAccent[] = [];
  for (const e of h.events as AnyTimelineEvent[]) {
    if (!keys.has(e.eventKey) || e.priority === 'low') continue;
    const spec = accentFor(h, e);
    if (!spec) continue;
    const waitMs = afterMs.get(e.eventKey);
    const m = protectedMoment(h, e);
    const protect = m ? { protect: { windowMs: m.windowMs, lane: m.lane, people: [...m.people].sort(), entities: [...m.entities].sort(), whole: m.whole } } : {};
    const { subject } = actionTarget(e, after, h);
    const sub = eng.subjects && subject && subject !== e.changedBy ? subject : undefined;
    const base = { name: spec.name, eventKey: e.eventKey, entityKey: e.entityKey, durationMs: spec.durationMs, ...(e.changedBy ? { actorKey: e.changedBy } : {}), ...(sub ? { subjectKey: sub } : {}), ...(waitMs ? { afterMs: waitMs } : {}), ...protect };
    switch (e.kind) {
      case 'wi_state_changed':
        out.push({ ...base, fromStage: before.workItems.get(e.entityKey)?.stage, toStage: after.workItems.get(e.entityKey)?.stage });
        break;
      case 'wi_assignee_changed':
        out.push({ ...base, leaving: e.payload.from, arriving: e.payload.to });
        break;
      case 'pr_completed': {
        // The review formation (06 §5): the author leads, their approvers fly in support.
        const authorKey = prAuthor(h, e.entityKey);
        out.push({ ...base, ...(authorKey ? { authorKey } : {}), ...(e.payload.approvedBy?.length ? { approvedBy: e.payload.approvedBy } : {}) });
        break;
      }
      case 'wi_area_changed':
      case 'wi_iteration_changed':
        out.push({ ...base, toArea: e.payload.to });
        break;
      case 'link_parent_added':
      case 'link_parent_removed':
        out.push({ ...base, parentKey: e.payload.parentKey });
        break;
      case 'link_pr_added':
      case 'link_pr_removed':
        out.push({ ...base, prKey: e.payload.prKey, itemKey: e.payload.itemKey });
        break;
      case 'pr_opened':
        out.push({ ...base, prKey: e.entityKey });
        // INV-08: the author gets a beam to the flight; the assignee's ship never moves for it.
        if (e.payload.authorKey) out.push({ name: 'authorBeam', eventKey: e.eventKey, entityKey: e.entityKey, durationMs: 450, prKey: e.entityKey, authorKey: e.payload.authorKey, ...(waitMs ? { afterMs: waitMs } : {}) });
        break;
      default:
        out.push(base);
    }
  }
  return out;
}
