// One wording for every event (22 B4, R13): what changed at the source, said the same way in
// History's rows, the ruler's tooltip and the notes on the chart's plates in play. Its parts are
// the thing it changed (the source's type, its number, its title), the action, and who made the
// change: `User Story · #1234 · Permit lookup — Assigned to Mara Lind · by Jo Park`. The chart's own
// account of it (what the theme draws) is the theme's, beneath it, never here. Engine code: the
// source register's words come from the pack (types as data, its attachment's word), so no source or
// theme name is written here (the literal fence). Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import { typeIndex } from './moves';
import { titleAt } from './terminology';
import type { Terminology } from './types';

/** An event's line in parts, each in the source register; the parts that don't apply are unset. */
export interface EventParts {
  glyph: string;
  /** The thing it changed: the source's type (its objective's, or `PR`), number (`#1234`) and title then. */
  type: string;
  id: string;
  title?: string;
  /** What happened to it, in the source's terms: `Assigned to Mara Lind`, `Active → Resolved`, `Merged`. */
  action: string;
  /** Who made the change (`changedBy`, or a PR's author or approvers), unless the action names them already. */
  person?: string;
  /** The thing the line is about, as the chart lights it. */
  subject: CanonicalKey;
}

/**
 * The pack's own words for what became of an attachment (CRM: `Accepted`, `Lost`; SDLC: `Merged`);
 * and whether its approvers, rather than whoever closed it, are the person who did it.
 */
export interface ActionWords { opened?: string; completed?: string; abandoned?: string; byApprovers?: boolean }

/** The last segment of a key: a work item's or an attachment's number. */
const numberOf = (key: CanonicalKey) => key.slice(key.lastIndexOf(':') + 1);
/** A path's leaf: `Harbor\\Sprint 7` → `Sprint 7`. */
const leaf = (path: string) => path.slice(path.lastIndexOf('\\') + 1);
/** "A", "A and B", "A, B and C". */
const listOf = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** An event's parts, in the source register's words (`t`), with the pack's own words for an attachment's end. */
export function eventParts(h: ScopeHistory, e: AnyTimelineEvent, t: Terminology, words: ActionWords = {}): EventParts {
  const name = (key: CanonicalKey | null | undefined) => (key ? h.entities.captains.find((c) => c.key === key)?.displayName : undefined);
  const types = typeIndex(h);
  const item = (key: CanonicalKey) => ({ type: types.get(key) ?? t.noun('objective'), id: `#${numberOf(key)}`, title: titleAt(h, key, e.occurredAt), subject: key });
  const ref = (key: CanonicalKey) => `${types.get(key) ?? t.noun('container')} #${numberOf(key)}`;
  const pr = (key: CanonicalKey) => ({ type: t.short('attachment'), id: `#${numberOf(key)}`, title: titleAt(h, key, e.occurredAt), subject: key });
  const by = (key: CanonicalKey | null | undefined, unless?: CanonicalKey | null) => (key && key !== unless ? name(key) : undefined);
  const out = (glyph: string, thing: Omit<EventParts, 'glyph' | 'action' | 'person'>, action: string, person?: string): EventParts =>
    ({ glyph, ...thing, action, ...(person ? { person } : {}) });
  switch (e.kind) {
    case 'wi_created': return out('✦', item(e.entityKey), 'Created', by(e.changedBy));
    case 'wi_state_changed': return out('◐', item(e.entityKey), `${e.payload.from} → ${e.payload.to}`, by(e.changedBy));
    case 'wi_assignee_changed':
      return e.payload.to
        ? out('➶', item(e.entityKey), `Assigned to ${name(e.payload.to) ?? 'someone'}`, by(e.changedBy, e.payload.to))
        : out('➶', item(e.entityKey), 'Unassigned', by(e.changedBy, e.payload.from));
    case 'wi_area_changed': return out('⇢', item(e.entityKey), `Moved to ${leaf(e.payload.to)}`, by(e.changedBy));
    case 'wi_iteration_changed':
      return out('⇢', item(e.entityKey), e.payload.to ? `Moved to ${leaf(e.payload.to)}` : `Left ${leaf(e.payload.from)}`, by(e.changedBy));
    case 'wi_title_changed': return out('✎', item(e.entityKey), 'Renamed', by(e.changedBy));
    case 'link_parent_added': return out('◯', item(e.payload.childKey), `Joined ${ref(e.payload.parentKey)}`, by(e.changedBy));
    case 'link_parent_removed': return out('◌', item(e.payload.childKey), `Left ${ref(e.payload.parentKey)}`, by(e.changedBy));
    case 'link_dependency_added': return out('⇄', item(e.payload.predecessorKey), `Now before ${ref(e.payload.successorKey)}`, by(e.changedBy));
    case 'link_dependency_removed': return out('⇄', item(e.payload.predecessorKey), `No longer before ${ref(e.payload.successorKey)}`, by(e.changedBy));
    case 'link_pr_added': return out('⤳', item(e.payload.itemKey), `Linked ${t.short('attachment')} #${numberOf(e.payload.prKey)}`, by(e.changedBy));
    case 'link_pr_removed': return out('⤳', item(e.payload.itemKey), `Unlinked ${t.short('attachment')} #${numberOf(e.payload.prKey)}`, by(e.changedBy));
    case 'pr_opened': return out('▲', pr(e.entityKey), words.opened ?? 'Opened', name(e.payload.authorKey) ?? by(e.changedBy));
    case 'pr_completed': {
      const approvers = words.byApprovers ? (e.payload.approvedBy ?? []).map((k) => name(k) ?? 'someone').sort((a, b) => a.localeCompare(b)) : [];
      return out('✔', pr(e.entityKey), words.completed ?? 'Completed', approvers.length ? listOf(approvers) : by(e.changedBy));
    }
    case 'pr_abandoned': return out('✕', pr(e.entityKey), words.abandoned ?? 'Abandoned', by(e.changedBy));
  }
}

/** The thing an event changed, as one line: `User Story · #1234 · Permit lookup`. */
export function thingOf(p: Pick<EventParts, 'type' | 'id' | 'title'>): string {
  return [p.type, p.id, p.title].filter(Boolean).join(' · ');
}

/** The event's primary line (22 B4): `User Story · #1234 · Permit lookup — Assigned to Mara Lind · by Jo Park`. */
export function formatEvent(p: EventParts): string {
  return `${thingOf(p)} — ${p.action}${p.person ? ` · by ${p.person}` : ''}`;
}

/** The longest attachment title a note carries before its "…" (22 B6): the action after it always shows. */
export const NOTE_TITLE_MAX = 24;

/**
 * The note a plate wears while the chart plays the event (22 B6): the action, short. An attachment's
 * note names it (`PR #12 · Title — Merged`), since it is worn by the work the attachment serves; its
 * title is cut to `NOTE_TITLE_MAX`, so the action is never what gives way.
 */
export function noteOf(p: EventParts, onAttachment: boolean): string {
  if (!onAttachment) return p.action;
  const title = p.title && p.title.length > NOTE_TITLE_MAX ? `${p.title.slice(0, NOTE_TITLE_MAX - 1).trimEnd()}…` : p.title;
  return `${p.type} ${p.id}${title ? ` · ${title}` : ''} — ${p.action}`;
}

/**
 * What a captain's plate says of their part while the chart plays the event (22 B9): `Author` and
 * `Approved` on a merge, `Opened it` on an opened PR, the action for the person who made a change,
 * `Takes it` for a piece's new holder. History's words for the same event, short.
 */
export function partOf(e: AnyTimelineEvent, p: EventParts, role: 'agent' | 'support', closedIt = false): string {
  // The holder of work closing at a merge's impact, flown into its formation (22 C4, M-23).
  if (closedIt) return 'Closed it';
  switch (e.kind) {
    case 'pr_completed': return role === 'support' ? 'Approved' : 'Author';
    case 'pr_opened': return 'Opened it';
    case 'wi_assignee_changed': return 'Takes it'; // the hand-off (22 C7, M-24): the new holder
    default: return role === 'support' ? 'Lends a hand' : p.action;
  }
}
