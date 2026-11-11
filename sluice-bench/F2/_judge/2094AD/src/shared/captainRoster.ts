// Settings → Captain Avatars (13 §7): which captains to list, and which dropped picture belongs to whom.
// Pure (no Electron, DOM or Pixi). Names are only compared here, in memory, on the user's own Mac: the
// matcher never logs, stores or sends a name or a file name.
import type { AnyTimelineEvent } from './contracts/events';
import type { ScopeHistory } from './contracts/history';
import type { CanonicalKey } from './contracts/keys';
import { touches } from './playback/highlights';

export type RosterCaptain = ScopeHistory['entities']['captains'][number];

/** The people an event is about: the actor, an assignee (before or after), a PR's author and approvers. */
function peopleOf(e: AnyTimelineEvent, into: Set<CanonicalKey>): void {
  if (e.changedBy) into.add(e.changedBy);
  const p = e.payload as Record<string, unknown>;
  if (e.kind === 'wi_assignee_changed') for (const k of [p.from, p.to]) if (typeof k === 'string') into.add(k as CanonicalKey);
  if (e.kind === 'wi_created' && typeof p.assigneeKey === 'string') into.add(p.assigneeKey as CanonicalKey);
  if (e.kind === 'pr_opened' && typeof p.authorKey === 'string') into.add(p.authorKey as CanonicalKey);
  if (Array.isArray(p.approvedBy)) for (const k of p.approvedBy) if (typeof k === 'string') into.add(k as CanonicalKey);
}

/**
 * The captains with work in a scene: whoever its events are about. Null keys (the whole sector, or a
 * scene outside the hierarchy) means the bundle's own captains, who are the sector's contributors.
 */
export function captainsInScene(h: ScopeHistory, keys: Set<CanonicalKey> | null): RosterCaptain[] {
  if (!keys) return h.entities.captains;
  const who = new Set<CanonicalKey>();
  for (const e of h.events) if (touches(e, keys)) peopleOf(e, who);
  return h.entities.captains.filter((c) => who.has(c.key));
}

/** One captain once, wherever they were met: later bundles fill in what an earlier one lacked. */
export function mergeRoster(lists: readonly (readonly RosterCaptain[])[]): RosterCaptain[] {
  const by = new Map<CanonicalKey, RosterCaptain>();
  for (const list of lists) {
    for (const c of list) {
      const have = by.get(c.key);
      by.set(c.key, !have ? c : { ...have, ...(c.avatar && !have.avatar ? { avatar: c.avatar } : {}), ...(c.handAdded ? { handAdded: true, ...(c.avatar ? { avatar: c.avatar } : {}) } : {}) });
    }
  }
  return [...by.values()].sort((a, b) => a.displayName.localeCompare(b.displayName) || (a.key < b.key ? -1 : 1));
}

// ---- matching dropped file names to captains ----

/** Words in a file name that say nothing about the person. */
const NOISE = new Set(['img', 'image', 'photo', 'pic', 'picture', 'headshot', 'avatar', 'profile', 'copy', 'final', 'new', 'edit', 'edited', 'square', 'crop', 'cropped', 'portrait', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic']);
const EXTENSION = /\.(png|jpe?g|gif|webp|heic|heif|bmp|tiff?)$/i;

/** Lower-case words with accents and punctuation gone; camelCase and separators split ("AvaLindqvist_2.jpg"). */
export function wordsOf(text: string): string[] {
  return text
    .replace(EXTENSION, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The file's words that could be a name: no numbers (copy counters, dates), no filler. */
const nameWords = (fileName: string) => wordsOf(fileName).filter((w) => !/^\d+$/.test(w) && !NOISE.has(w));

/**
 * How well a file name fits a person, 0 for not at all:
 * 100 the same words in any order (also "Lindqvist, Ava"); 90 first and last name both there (an email,
 * "ava-lindqvist-headshot"); 70 two or more fragments each starting a different word of the name
 * ("ava lind"); 50 a lone first or last name of at least three letters.
 */
export function nameScore(fileName: string, displayName: string): number {
  const file = nameWords(fileName);
  const name = wordsOf(displayName);
  if (!file.length || !name.length) return 0;
  const first = name[0]!;
  const last = name[name.length - 1]!;
  if (file.length === name.length && file.every((w) => name.includes(w)) && name.every((w) => file.includes(w))) return 100;
  if (name.length > 1 && file.includes(first) && file.includes(last)) return 90;
  if (file.length >= 2) {
    const left = [...name];
    const all = file.every((w) => {
      const at = left.findIndex((n) => w.length >= 2 && n.startsWith(w));
      if (at < 0) return false;
      left.splice(at, 1);
      return true;
    });
    if (all) return 70;
  }
  if (file.length === 1 && file[0]!.length >= 3 && (file[0] === first || file[0] === last)) return 50;
  return 0;
}

export interface FileMatch { file: number; key: CanonicalKey; score: number }

/**
 * Which file goes to which captain. A file is placed only when one captain fits it best and no other
 * file fits that captain as well: anything doubtful is left unassigned, for the user to drag onto the
 * right person. Each captain gets at most one file, each file goes to at most one captain.
 */
export function matchFiles(fileNames: readonly string[], captains: readonly Pick<RosterCaptain, 'key' | 'displayName'>[]): { assigned: FileMatch[]; unassigned: number[] } {
  const best = fileNames.map((name) => {
    const scored = captains.map((c) => ({ key: c.key, score: nameScore(name, c.displayName) })).filter((s) => s.score > 0);
    const top = Math.max(0, ...scored.map((s) => s.score));
    const tied = scored.filter((s) => s.score === top);
    return tied.length === 1 ? tied[0]! : null; // none, or several equally good: doubtful
  });
  const assigned: FileMatch[] = [];
  const unassigned: number[] = [];
  best.forEach((b, file) => {
    if (!b) { unassigned.push(file); return; }
    const rivals = best.flatMap((o, i) => (i !== file && o?.key === b.key ? [o.score] : []));
    if (rivals.some((s) => s >= b.score)) unassigned.push(file); // another file fits them as well or better
    else assigned.push({ file, key: b.key, score: b.score });
  });
  return { assigned, unassigned };
}
