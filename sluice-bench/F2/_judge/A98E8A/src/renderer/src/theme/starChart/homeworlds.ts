// Homeworld names (2026-10-12): each seat's planet is named from its person's first name, in one of a
// set of templates ("Wren's Haven", "Planet Kit"). The full name picks the template, so the same
// person always gets the same name. Two people with one first name could pick the same template:
// over the loaded roster, the one later by full name moves on to the next free template, so names
// never repeat. Adding someone with a different first name never changes anyone's name. Pure.
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import { fnv1a32 } from '@shared/hash';

/** `{F}` is the first name. Order matters: a template's index is what a full name hashes to. */
export const HOMEWORLD_TEMPLATES: readonly string[] = [
  "{F}'s Paradise", 'Planet {F}', "{F}'s Haven", 'New {F}', '{F} Prime', "{F}'s Reach", "{F}'s Landing", 'Port {F}',
  "{F}'s Rest", "{F}'s Hope", "{F}'s World", 'Fort {F}', "{F}'s Refuge", 'Nova {F}', "{F}'s Crown", "{F}'s Promise",
];

const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** A full name as the hash reads it: trimmed, single-spaced, lower case. */
const normal = (full: string) => full.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The first name in a display name: "Last, First" reads the part after the comma, an email its local
 * part's first word. Falls back to the whole name.
 */
export function firstNameOf(displayName: string): string {
  let s = displayName.trim();
  if (s.includes('@')) s = s.split('@')[0]!.split(/[._-]+/)[0] ?? s;
  else if (s.includes(',')) s = s.split(',')[1]?.trim() || s;
  const first = s.split(/\s+/)[0]?.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') ?? '';
  if (!first) return displayName.trim();
  return first[0]!.toUpperCase() + first.slice(1);
}

/**
 * Every person's homeworld name, over a roster. Each person's full name hashes to a template; within
 * the roster, people are named in full-name order (then key), and one whose name is already taken
 * moves on to the next template; past the last, it takes a numeral ("Planet Kit II").
 */
export function homeworldNames(roster: readonly { key: CanonicalKey; displayName: string }[]): Map<CanonicalKey, string> {
  const T = HOMEWORLD_TEMPLATES;
  const ordered = [...roster].sort((a, b) => {
    const na = normal(a.displayName);
    const nb = normal(b.displayName);
    return na < nb ? -1 : na > nb ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
  const used = new Set<string>();
  const out = new Map<CanonicalKey, string>();
  for (const p of ordered) {
    const first = firstNameOf(p.displayName);
    const start = fnv1a32(normal(p.displayName)) % T.length;
    let name: string | undefined;
    for (let i = 0; i < T.length * (ROMAN.length + 1) && !name; i++) {
      const base = T[(start + i) % T.length]!.replace('{F}', first);
      const round = Math.floor(i / T.length);
      const candidate = round ? `${base} ${ROMAN[round - 1]}` : base;
      if (!used.has(candidate.toLowerCase())) name = candidate;
    }
    name ??= `${T[start]!.replace('{F}', first)} ${p.key}`;
    used.add(name.toLowerCase());
    out.set(p.key, name);
  }
  return out;
}

const memo = new WeakMap<object, Map<CanonicalKey, string>>();

/** A seat's homeworld name, over the loaded history's people (memoised per roster). */
export function homeworldOf(h: ScopeHistory, person: CanonicalKey): string | null {
  const roster = h.entities.captains;
  let names = memo.get(roster);
  if (!names) memo.set(roster, (names = homeworldNames(roster)));
  return names.get(person) ?? null;
}
