// Plain-language lines for the event list (05 §2): one per event, in ADO terms, so the list is the
// accessible, text twin of every accent (INV-20).
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import { resolveState } from '../stateMapping';

const prId = (key: CanonicalKey) => Number(key.split(':').pop());
const wiId = (key: CanonicalKey) => Number(key.split(':').pop());

export interface EventLine { glyph: string; text: string }

export function describeEvent(h: ScopeHistory, e: AnyTimelineEvent, typeOf: (key: CanonicalKey) => string): EventLine {
  const name = (key: CanonicalKey | null) => (key ? h.entities.captains.find((c) => c.key === key)?.displayName ?? 'someone' : 'nobody');
  const item = (key: CanonicalKey) => `${typeOf(key)} #${wiId(key)}`;
  switch (e.kind) {
    case 'wi_created': return { glyph: '✦', text: `${e.payload.type} #${wiId(e.entityKey)} created · ${e.payload.title}` };
    case 'wi_state_changed': return { glyph: '◐', text: `${item(e.entityKey)} ${e.payload.from} → ${e.payload.to}` };
    case 'wi_assignee_changed':
      return e.payload.to
        ? { glyph: '➶', text: `${name(e.payload.to)} assigned to ${item(e.entityKey)}${e.payload.from ? ` (was ${name(e.payload.from)})` : ''}` }
        : { glyph: '➶', text: `${item(e.entityKey)} unassigned (was ${name(e.payload.from)})` };
    case 'wi_area_changed': return { glyph: '⇢', text: `${item(e.entityKey)} moved to ${e.payload.to.split('\\').pop()}` };
    case 'wi_iteration_changed': return { glyph: '⇢', text: e.payload.to ? `${item(e.entityKey)} moved to ${e.payload.to.split('\\').pop()}` : `${item(e.entityKey)} left ${e.payload.from.split('\\').pop()}` };
    case 'wi_title_changed': return { glyph: '✎', text: `${item(e.entityKey)} renamed · ${e.payload.to}` };
    case 'link_parent_added': return { glyph: '◯', text: `${item(e.payload.childKey)} joined ${item(e.payload.parentKey)}` };
    case 'link_parent_removed': return { glyph: '◌', text: `${item(e.payload.childKey)} left ${item(e.payload.parentKey)}` };
    case 'link_dependency_added': return { glyph: '⇄', text: `${item(e.payload.predecessorKey)} → ${item(e.payload.successorKey)} dependency added` };
    case 'link_dependency_removed': return { glyph: '⇄', text: `${item(e.payload.predecessorKey)} → ${item(e.payload.successorKey)} dependency removed` };
    case 'link_pr_added': return { glyph: '⤳', text: `PR ${prId(e.payload.prKey)} linked to ${item(e.payload.itemKey)}` };
    case 'link_pr_removed': return { glyph: '⤳', text: `PR ${prId(e.payload.prKey)} unlinked from ${item(e.payload.itemKey)}` };
    case 'pr_opened': return { glyph: '▲', text: `PR ${prId(e.entityKey)} opened by ${name(e.payload.authorKey)} · ${e.payload.title}` };
    case 'pr_completed': return { glyph: '✔', text: `PR ${prId(e.entityKey)} completed (merged)` };
    case 'pr_abandoned': return { glyph: '✕', text: `PR ${prId(e.entityKey)} abandoned` };
  }
}

/** What a History card names (06 §4): the object it's about, as an ADO kind, for its chart icon. */
export type StoryObject = 'feature' | 'story' | 'bug' | 'task' | 'pr' | 'item';

export interface StoryLine {
  /** One plain sentence in ADO terms, naming the people and the item (06 §4, decided 2026-10-04). */
  text: string;
  /** The item the sentence is about, and its kind (the card's icon). */
  objectKey: CanonicalKey;
  object: StoryObject;
}

/**
 * The History card's sentence for an event: who did what to which item, in ADO words, so people
 * learn how the system's activity maps onto the chart. `typeOf` and `titleOf` look items up; the
 * actor is the event's `changedBy`.
 */
export function storyLine(
  h: ScopeHistory, e: AnyTimelineEvent,
  typeOf: (key: CanonicalKey) => string, titleOf: (key: CanonicalKey) => string | undefined,
): StoryLine {
  const name = (key: CanonicalKey | null | undefined) => (key ? h.entities.captains.find((c) => c.key === key)?.displayName ?? 'Someone' : 'Someone');
  const who = e.changedBy ? name(e.changedBy) : null;
  const item = (key: CanonicalKey) => `${typeOf(key)} #${wiId(key)}`;
  /** "Rafe Okoro resolved User Story #201 · title", or, with no recorded actor, "User Story #201 resolved · title". */
  const did = (verb: string, key: CanonicalKey, title = titleOf(key)) =>
    who ? `${who} ${verb} ${item(key)}${title ? ` · ${title}` : ''}` : `${item(key)} ${verb}${title ? ` · ${title}` : ''}`;
  const titled = (key: CanonicalKey) => {
    const t = titleOf(key);
    return t ? `${item(key)} · ${t}` : item(key);
  };
  const kindOf = (key: CanonicalKey): StoryObject => {
    const t = typeOf(key);
    return t === 'Feature' ? 'feature' : t === 'Bug' ? 'bug' : t === 'Task' ? 'task' : t === 'Epic' ? 'item' : 'story';
  };
  const wi = (text: string, key: CanonicalKey): StoryLine => ({ text, objectKey: key, object: kindOf(key) });
  const pr = (text: string): StoryLine => ({ text, objectKey: e.entityKey, object: 'pr' });
  const list = (keys: CanonicalKey[]) => {
    const names = keys.map((k) => name(k)).sort((a, b) => a.localeCompare(b));
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  };
  switch (e.kind) {
    case 'wi_created':
      return wi(did('created', e.entityKey, e.payload.title), e.entityKey);
    case 'wi_state_changed': {
      const type = typeOf(e.entityKey);
      const from = resolveState(h.stateMapping, type, e.payload.from).category;
      const to = e.payload.to;
      const verb = from === 'Completed' && resolveState(h.stateMapping, type, to).category !== 'Completed' ? 'reopened'
        : to === 'Active' ? 'started' : to === 'Resolved' ? 'resolved' : to === 'Closed' ? 'closed' : to === 'Removed' ? 'removed' : null;
      if (verb) return wi(did(verb, e.entityKey), e.entityKey);
      return wi(who ? `${who} moved ${titled(e.entityKey)} to ${to}` : `${item(e.entityKey)} moved to ${to}${titleOf(e.entityKey) ? ` · ${titleOf(e.entityKey)}` : ''}`, e.entityKey);
    }
    case 'wi_assignee_changed': {
      const to = e.payload.to;
      if (!to) return wi(did('unassigned', e.entityKey), e.entityKey);
      if (!who || e.changedBy === to) return wi(`${name(to)} took ${titled(e.entityKey)}`, e.entityKey);
      return wi(`${who} assigned ${titled(e.entityKey)} to ${name(to)}`, e.entityKey);
    }
    case 'wi_area_changed': return wi(`${titled(e.entityKey)} moved to ${e.payload.to.split('\\').pop()}${who ? ` (by ${who})` : ''}`, e.entityKey);
    case 'wi_iteration_changed': return wi(e.payload.to ? `${titled(e.entityKey)} moved to ${e.payload.to.split('\\').pop()}${who ? ` (by ${who})` : ''}` : `${titled(e.entityKey)} left ${e.payload.from.split('\\').pop()}`, e.entityKey);
    case 'wi_title_changed': return wi(`${item(e.entityKey)} renamed “${e.payload.to}”${who ? ` by ${who}` : ''}`, e.entityKey);
    case 'link_parent_added': return wi(`${titled(e.payload.childKey)} joined ${item(e.payload.parentKey)}`, e.payload.childKey);
    case 'link_parent_removed': return wi(`${titled(e.payload.childKey)} left ${item(e.payload.parentKey)}`, e.payload.childKey);
    case 'link_dependency_added': return wi(`${item(e.payload.predecessorKey)} now comes before ${item(e.payload.successorKey)}`, e.payload.successorKey);
    case 'link_dependency_removed': return wi(`${item(e.payload.predecessorKey)} no longer comes before ${item(e.payload.successorKey)}`, e.payload.successorKey);
    case 'link_pr_added': return { text: `PR ${prId(e.payload.prKey)} linked to ${titled(e.payload.itemKey)}`, objectKey: e.payload.prKey, object: 'pr' };
    case 'link_pr_removed': return { text: `PR ${prId(e.payload.prKey)} unlinked from ${item(e.payload.itemKey)}`, objectKey: e.payload.prKey, object: 'pr' };
    case 'pr_opened': return pr(`${name(e.payload.authorKey)} opened PR ${prId(e.entityKey)} · ${e.payload.title}`);
    case 'pr_completed': {
      const by = e.payload.approvedBy?.length ? `, approved by ${list(e.payload.approvedBy)}` : '';
      return pr(who ? `${who} merged PR ${prId(e.entityKey)}${by}` : `PR ${prId(e.entityKey)} merged${by}`);
    }
    case 'pr_abandoned': return pr(who ? `${who} abandoned PR ${prId(e.entityKey)}` : `PR ${prId(e.entityKey)} abandoned`);
  }
}
