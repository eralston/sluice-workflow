// 14 §1.1, 12 §1 — terminology: the words the UI uses for roles, levels and rungs, in one of two
// registers. The source register is the pack's own words ("what the source calls it"); the chart
// register is the theme's words, which the renderer passes in, since the engine never knows them.
// Either falls back to the engine's own neutral words. Also the neutral event line, read from moves
// in whichever register it's given: roles by their nouns, never a pack's type names, and an unmapped
// state by its raw name (INV-11). Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory, StateMapping } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { EventLine } from '../playback/describe';
import { roleOfKey } from './moves';
import { resolveRole } from './signal';
import type { DomainPack, LevelWord, Move, Noun, Register, Role, Rung, Signal, SourceWords, Terminology } from './types';

/** The engine's own words (12): what anything is called when neither the pack nor the theme names it. */
export const ENGINE_WORDS: Readonly<SourceWords & { role: Record<Role, Noun>; agent: Noun }> = Object.freeze({
  role: {
    objective: { one: 'objective', many: 'objectives' },
    threat: { one: 'threat', many: 'threats' },
    step: { one: 'step', many: 'steps' },
    container: { one: 'container', many: 'containers' },
    facility: { one: 'facility', many: 'facilities' },
    attachment: { one: 'attachment', many: 'attachments' },
    guard: { one: 'guard', many: 'guards' },
  },
  agent: { one: 'agent', many: 'agents' },
  level: {
    workspace: { one: 'workspace', many: 'workspaces' },
    round: { one: 'round', many: 'rounds' },
    region: { one: 'region', many: 'regions' },
    seat: { one: 'seat', many: 'seats' },
    frontier: { one: 'frontier', many: 'frontiers' },
  },
  rung: { ready: 'Ready', underway: 'Underway', nearing: 'Nearing', accomplished: 'Accomplished', off: 'Off' },
  source: 'the source',
});

export interface TerminologyOptions {
  /** The chart register's words: the active theme's (`ThemePack.words`). */
  chart?: Partial<SourceWords>;
  /** The mapping that names types, for `typeName` in the chart register. Default: the pack's. */
  mapping?: StateMapping;
}

/** What a terminology reads from a pack: its own words, and the mapping that names its types. */
export type WordsPack = Pick<DomainPack, 'words'> & Partial<Pick<DomainPack, 'mapping'>>;

/** A pack's words in one register. Words a register doesn't name fall back to `ENGINE_WORDS`. */
export function terminology(pack: WordsPack, register: Register, opts: TerminologyOptions = {}): Terminology {
  const words = register === 'source' ? pack.words : opts.chart ?? {};
  const role: Partial<Record<Role, Noun>> = { ...ENGINE_WORDS.role, ...words.role };
  const level: Record<LevelWord, Noun> = { ...ENGINE_WORDS.level, ...words.level };
  const rung: Record<Rung, string> = { ...ENGINE_WORDS.rung, ...words.rung };
  const agent = words.agent ?? ENGINE_WORDS.agent;
  const mapping = opts.mapping ?? pack.mapping;
  const noun = (r: Role | 'agent', n = 1): string => {
    const w = r === 'agent' ? agent : role[r] ?? ENGINE_WORDS.role[r];
    return n === 1 ? w.one : w.many;
  };
  return {
    register,
    noun,
    short: (r) => (role[r] ?? ENGINE_WORDS.role[r]).short ?? noun(r),
    level: (k) => level[k].one,
    rung: (r) => rung[r],
    // The source register names a type as the source does; the chart register by its role's noun.
    typeName(type) {
      if (register === 'source') return type;
      const r = mapping ? resolveRole(mapping, type) : null;
      return r ? noun(r) : type;
    },
  };
}

/**
 * Counts by role in a register's words (22 A3): a star's objectives and threats, each counted in its
 * role's noun (the theme's in the chart register, the pack's in the source's). A zero part is left out; with nothing at all, the
 * objective's plural at zero. With `done`, the done count follows (the inspector's line).
 */
export function countsLine(w: Terminology, c: { objective: number; threat: number; done: number }, done = false): string {
  const part = (role: Role, n: number) => `${n} ${w.noun(role, n)}`;
  const parts = [c.objective ? part('objective', c.objective) : '', c.threat ? part('threat', c.threat) : ''].filter(Boolean);
  if (!parts.length) parts.push(part('objective', 0));
  if (done && c.objective + c.threat) parts.push(`${c.done} done`);
  return parts.join(' · ');
}

/** The last segment of a key: a work item's or an attachment's number. */
const numberOf = (key: CanonicalKey) => key.slice(key.lastIndexOf(':') + 1);

/** Each item's titles over the bundle, oldest first: what it was created as, then each rename. */
const titleMemo = new WeakMap<ScopeHistory, Map<CanonicalKey, { at: number; title: string }[]>>();
function titlesOf(h: ScopeHistory): Map<CanonicalKey, { at: number; title: string }[]> {
  let m = titleMemo.get(h);
  if (m) return m;
  m = new Map();
  for (const w of [...(h.current?.workItems ?? []), ...(h.current?.prs ?? [])]) m.set(w.key, [{ at: -Infinity, title: w.title }]);
  for (const e of h.events as AnyTimelineEvent[]) {
    const title = e.kind === 'wi_created' || e.kind === 'pr_opened' ? e.payload.title : e.kind === 'wi_title_changed' ? e.payload.to : null;
    if (title === null) continue;
    const list = m.get(e.entityKey) ?? [];
    list.push({ at: e.occurredAt, title });
    m.set(e.entityKey, list);
  }
  for (const list of m.values()) list.sort((a, b) => a.at - b.at);
  titleMemo.set(h, m);
  return m;
}

/** An item's or an attachment's title as of `at` (its first known title before it was created), if the bundle knows it. */
export function titleAt(h: ScopeHistory, key: CanonicalKey, at: number): string | undefined {
  const list = titlesOf(h).get(key);
  if (!list?.length) return undefined;
  let title = list[0]!.title;
  for (const x of list) if (x.at <= at) title = x.title;
  return title;
}

/**
 * One event's line for the event list (05 §2), read from its moves in the terminology's words: the
 * accessible twin of whatever the event plays (INV-20). An event with no moves is named by its kind.
 */
export function describeMoves(h: ScopeHistory, e: AnyTimelineEvent, mv: readonly Move[], t: Terminology): EventLine {
  const person = (key: CanonicalKey | null) =>
    key ? h.entities.captains.find((c) => c.key === key)?.displayName ?? 'someone' : 'nobody';
  const piece = (key: CanonicalKey, role: Role | null = roleOfKey(h, key)) => `${role ? t.noun(role) : 'item'} #${numberOf(key)}`;
  /** A piece with its title, as v0's lines name their items (19 review: a role and a number alone said nothing). */
  const named = (key: CanonicalKey, role?: Role | null) => {
    const title = titleAt(h, key, e.occurredAt);
    return title ? `${piece(key, role)} · ${title}` : piece(key, role);
  };
  /**
   * A parent: a container has no form in a solar region (13 §9), so it goes by its number and title
   * alone ("#20002 · Harbor alerts"), with no word for a role the chart doesn't draw, and never the
   * source's type name in this register (INV-11).
   */
  const parentOf = (key: CanonicalKey) => {
    const role = roleOfKey(h, key);
    if (role !== 'container') return named(key, role);
    const title = titleAt(h, key, e.occurredAt);
    return `#${numberOf(key)}${title ? ` · ${title}` : ''}`;
  };
  const m = mv[0];
  if (!m) return { glyph: '·', text: `${piece(e.entityKey)} · ${e.kind.replace(/_/g, ' ')}` };
  switch (m.m) {
    case 'appear': {
      // A container is named as a parent is: no word for a role the chart doesn't draw.
      if (m.role === 'container') return { glyph: '✦', text: `New ${parentOf(m.key)}` };
      const title = e.kind === 'wi_created' ? ` · ${e.payload.title}` : '';
      return { glyph: '✦', text: `New ${piece(m.key, m.role)}${m.seat ? ` for ${person(m.seat)}` : ''}${title}` };
    }
    case 'climb': {
      // A state the mapping doesn't know reads as its raw name (INV-11), not as the rung it falls to.
      const raw = e.kind === 'wi_state_changed' ? e.payload : null;
      const rung = (s: Signal, name: string | undefined) => (s.unknown && name ? name : t.rung(s.rung));
      const who = named(m.key, m.role);
      return { glyph: '◐', text: `${who}${who.includes(' · ') ? ':' : ''} ${rung(m.from, raw?.from)} → ${rung(m.to, raw?.to)}` };
    }
    case 'reseat':
      return m.to
        ? { glyph: '➶', text: `${person(m.to)} took ${named(m.key, m.role)}${m.from ? ` (was ${person(m.from)})` : ''}` }
        : { glyph: '➶', text: `${named(m.key, m.role)} went to the ${t.level('frontier')} (was ${person(m.from)})` };
    case 'enter': return { glyph: '⇢', text: `${named(m.key, m.role)} joined the ${t.level('round')}` };
    case 'leave': return { glyph: '⇢', text: `${named(m.key, m.role)} left the ${t.level('round')}` };
    case 'bind': case 'unbind': {
      // An attachment or a step goes by its relation's word; any other child by its own role (it read
      // "item #…" when that was passed as null).
      const child = m.rel === 'attachment' ? piece(m.child, 'attachment') : m.rel === 'step' ? named(m.child, 'step') : named(m.child);
      const verb = m.rel === 'attachment' ? (m.m === 'bind' ? 'linked to' : 'unlinked from') : m.m === 'bind' ? 'joined' : 'left';
      return { glyph: m.rel === 'attachment' ? '⤳' : m.m === 'bind' ? '◯' : '◌', text: `${child} ${verb} ${parentOf(m.parent)}` };
    }
    case 'attach': return { glyph: '▲', text: `${person(m.author)} opened ${piece(m.key, 'attachment')}${e.kind === 'pr_opened' ? ` · ${e.payload.title}` : ''}` };
    case 'settle': return { glyph: m.to.rung === 'accomplished' ? '✔' : '✕', text: `${piece(m.key, 'attachment')} ${t.rung(m.to.rung)}` };
    case 'retitle': return { glyph: '✎', text: `${piece(m.key)} renamed${e.kind === 'wi_title_changed' ? ` · ${e.payload.to}` : ''}` };
  }
}
