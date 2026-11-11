// 05 §4 — which accent an event plays, and its target duration (wall time at 1×).
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { WorkItemState } from '../contracts/view';
import { resolveState } from '../stateMapping';

export type AccentName =
  | 'emerge.feature' | 'emerge.story' | 'emerge.bug' | 'emerge.task'
  | 'stageShift.feature' | 'stageShift.story' | 'stageShift.bug' | 'stageShift.task'
  | 'captainJump' | 'sectorRekey' | 'orbitDraw' | 'orbitFade' | 'laneDraw' | 'laneFade'
  | 'routeInk' | 'routeRetract' | 'launch' | 'dock' | 'withdraw';

export interface AccentSpec { name: AccentName; durationMs: number }

/** The work kind of an event's entity (PR events are 'pr'). */
export function entityKind(h: ScopeHistory, e: AnyTimelineEvent): WorkItemState['kind'] | 'pr' {
  if (e.kind.startsWith('pr_')) return 'pr';
  const type = e.kind === 'wi_created' ? e.payload.type : h.entities.workItems.find((w) => w.key === e.entityKey)?.type ?? '';
  return resolveState(h.stateMapping, type, '').kind;
}

function typeOf(h: ScopeHistory, e: AnyTimelineEvent): string {
  return h.entities.workItems.find((w) => w.key === e.entityKey)?.type ?? '';
}

/**
 * A stage shift's whole choreography (05 §4, decided 2026-10-03): the actor's beam, the flare's
 * growth, and the echo to the parent all finish inside the beat, so beats never pile up.
 */
function stageShiftMs(h: ScopeHistory, e: AnyTimelineEvent & { kind: 'wi_state_changed' }, kind: string): number {
  const type = typeOf(h, e);
  const from = resolveState(h.stateMapping, type, e.payload.from).category;
  const to = e.payload.to;
  const toCat = resolveState(h.stateMapping, type, to).category;
  const reopen = from === 'Completed' && toCat !== 'Completed';
  if (kind === 'feature') {
    if (to === 'Closed' || to === 'Removed' || reopen) return 2800;
    if (to === 'Active' || to === 'Ready to Accept') return 2600;
    return 2000;
  }
  if (kind === 'story') {
    if (to === 'Closed' || to === 'Removed' || reopen) return 2600;
    if (to === 'Active') return 2400;
    if (to === 'Resolved' || to === 'Ready to Accept') return 2400;
    return 2000;
  }
  return kind === 'bug' ? 2300 : 1800;
}

/** The accent an event plays on forward play, or null (Low-priority and unmapped kinds have none). */
export function accentFor(h: ScopeHistory, e: AnyTimelineEvent): AccentSpec | null {
  const kind = entityKind(h, e);
  const typed = kind === 'feature' || kind === 'story' || kind === 'bug' || kind === 'task';
  switch (e.kind) {
    case 'wi_created':
      if (!typed) return null;
      return { name: `emerge.${kind}`, durationMs: { feature: 1800, story: 1600, bug: 1600, task: 1200 }[kind] };
    case 'wi_state_changed':
      return typed ? { name: `stageShift.${kind}`, durationMs: stageShiftMs(h, e, kind) } : null;
    case 'wi_assignee_changed': return { name: 'captainJump', durationMs: 2400 };
    case 'wi_area_changed': return { name: 'sectorRekey', durationMs: 1600 };
    // Into or out of a sprint (Sprints mode): it arrives or leaves like a move between sectors.
    case 'wi_iteration_changed': return { name: 'sectorRekey', durationMs: 1600 };
    case 'wi_title_changed': return null;
    case 'link_parent_added': return { name: 'orbitDraw', durationMs: 1400 };
    case 'link_parent_removed': return { name: 'orbitFade', durationMs: 1400 };
    case 'link_dependency_added': return { name: 'laneDraw', durationMs: 1000 };
    case 'link_dependency_removed': return { name: 'laneFade', durationMs: 1000 };
    case 'link_pr_added': return { name: 'routeInk', durationMs: 1400 };
    case 'link_pr_removed': return { name: 'routeRetract', durationMs: 1400 };
    case 'pr_opened': return { name: 'launch', durationMs: 2600 };
    // With approvers, the review formation (06 §5): gather, join beams, berth, flare, and disperse,
    // all inside the beat (a protected moment, 05 §5).
    case 'pr_completed': return { name: 'dock', durationMs: e.payload.approvedBy?.length ? 5100 : 2200 };
    case 'pr_abandoned': return { name: 'withdraw', durationMs: 2000 };
  }
}
