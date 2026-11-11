import type { EventKind, Priority } from './contracts/events';
import type { WorkItemState } from './contracts/view';

/** 02 §4 priority column. `kind` is the work kind of the event's entity (ignored for PR events). */
export function eventPriority(event: EventKind, kind: WorkItemState['kind'] | 'pr'): Priority {
  switch (event) {
    case 'wi_created':
    case 'wi_state_changed':
      if (kind === 'feature' || kind === 'story') return 'high';
      if (kind === 'bug') return 'medium';
      if (kind === 'task') return 'mediumGroup';
      return 'low';
    case 'link_parent_added':
    case 'link_parent_removed':
      return kind === 'story' || kind === 'bug' ? 'high' : 'mediumGroup';
    case 'wi_assignee_changed':
    case 'wi_area_changed':
    case 'wi_iteration_changed':
    case 'link_dependency_added':
    case 'link_dependency_removed':
    case 'link_pr_added':
    case 'link_pr_removed':
      return 'medium';
    case 'wi_title_changed':
      return 'low';
    case 'pr_opened':
    case 'pr_completed':
    case 'pr_abandoned':
      return 'high';
  }
}
