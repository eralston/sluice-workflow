// 03 §3 — events and observations.
import type { CanonicalKey, UtcMs } from './keys';

export type EventKind =
  | 'wi_created' | 'wi_state_changed' | 'wi_assignee_changed' | 'wi_area_changed' | 'wi_title_changed'
  | 'wi_iteration_changed'
  | 'link_parent_added' | 'link_parent_removed'
  | 'link_dependency_added' | 'link_dependency_removed'
  | 'link_pr_added' | 'link_pr_removed'
  | 'pr_opened' | 'pr_completed' | 'pr_abandoned';

/** Ranked high > medium > mediumGroup > low (02 §4). */
export type Priority = 'high' | 'medium' | 'mediumGroup' | 'low';
export const PRIORITY_RANK: Record<Priority, number> = { high: 3, medium: 2, mediumGroup: 1, low: 0 };

export interface EvidenceRef {
  source: 'revision' | 'update' | 'pullRequest';
  /** `wi:{id}:r{rev}` | `wi:{id}:u{updateId}` | `pr:{repoId}:{prId}` */
  ref: string;
  at: UtcMs | null;
}

export interface EventPayload {
  /** `iterationPath`: its sprint at creation, only when it has one (decided 2026-10-07). */
  wi_created: { type: string; title: string; state: string; areaPath: string; assigneeKey: CanonicalKey | null; iterationPath?: string };
  wi_state_changed: { from: string; to: string };
  wi_assignee_changed: { from: CanonicalKey | null; to: CanonicalKey | null };
  wi_area_changed: { from: string; to: string };
  wi_title_changed: { from: string; to: string };
  /** Moved between sprints (`System.IterationPath`; '' for none). Sprints mode: joining or leaving one (decided 2026-10-07). */
  wi_iteration_changed: { from: string; to: string };
  link_parent_added: { childKey: CanonicalKey; parentKey: CanonicalKey };
  link_parent_removed: { childKey: CanonicalKey; parentKey: CanonicalKey };
  link_dependency_added: { predecessorKey: CanonicalKey; successorKey: CanonicalKey };
  link_dependency_removed: { predecessorKey: CanonicalKey; successorKey: CanonicalKey };
  link_pr_added: { prKey: CanonicalKey; itemKey: CanonicalKey };
  link_pr_removed: { prKey: CanonicalKey; itemKey: CanonicalKey };
  pr_opened: { repoKey: CanonicalKey; title: string; authorKey: CanonicalKey | null; targetRef: string };
  /**
   * `approvedBy`: reviewers whose standing vote at completion approved (10, or 5 with suggestions),
   * sorted by key; empty when unknown (never invented). The review formation (06 §5). Not activity:
   * approving never moves a ship's resting place (INV-07), and the role stays distinct (INV-08).
   */
  pr_completed: { repoKey: CanonicalKey; approvedBy?: CanonicalKey[] };
  pr_abandoned: { repoKey: CanonicalKey };
}

export interface TimelineEvent<K extends EventKind = EventKind> {
  eventKey: string;
  kind: K;
  /** Always a source timestamp (INV-01). Undated facts are Observations. */
  occurredAt: UtcMs;
  observedAt: UtcMs;
  entityKey: CanonicalKey;
  projectKey: CanonicalKey;
  priority: Priority;
  payload: EventPayload[K];
  evidence: EvidenceRef[];
  /**
   * Who made the change (`System.ChangedBy` on the revision or update; a PR's author when opened, its
   * closer when completed or abandoned). The actor, never the assignee (INV-07): it drives the
   * cause → effect beam (06 §5). Absent when unknown.
   */
  changedBy?: CanonicalKey | null;
}

export type AnyTimelineEvent = { [K in EventKind]: TimelineEvent<K> }[EventKind];

export interface Observation {
  obsKey: string;
  kind: 'link_parent' | 'link_dependency' | 'link_pr' | 'pr_status';
  op: 'present' | 'removed';
  fromKey: CanonicalKey;
  toKey?: CanonicalKey;
  status?: 'active' | 'completed' | 'abandoned';
  confidence: 'unknown' | 'observed_only';
  observedAt: UtcMs;
  evidence: EvidenceRef[];
}

/** Same-instant precedence (02 §5). Lower applies first. */
const PRECEDENCE: Record<EventKind, number> = {
  wi_created: 0,
  link_parent_added: 1, link_parent_removed: 1,
  wi_area_changed: 2, wi_iteration_changed: 2,
  wi_state_changed: 3,
  wi_assignee_changed: 4,
  wi_title_changed: 5,
  link_dependency_added: 6, link_dependency_removed: 6,
  link_pr_added: 7, link_pr_removed: 7,
  pr_opened: 8,
  pr_completed: 9, pr_abandoned: 9,
};

export function compareEvents(a: TimelineEvent, b: TimelineEvent): number {
  return (
    a.occurredAt - b.occurredAt ||
    PRECEDENCE[a.kind] - PRECEDENCE[b.kind] ||
    (a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0)
  );
}
