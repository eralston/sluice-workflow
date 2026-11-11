// What a sync couldn't read (slice 7, decided 2026-10-10): PRs and repos that answered 403/404, or
// whose retries ran out. Seen before, a PR keeps its last known record (the cache holds it, so the
// bundle still draws it), marked stale; never seen, it is only listed. Either way the scope is
// partial, the coverage panel lists it, and the next sync asks again (`retryKeys`).
import type { MissingThing } from '@shared/contracts/history';
import { keys, type CanonicalKey, type Guid, type OrgKey } from '@shared/contracts/keys';
import { AdoError } from '../ado/client';
import type { Cache } from '../db/cache';

export class Unreadable {
  private readonly things = new Map<CanonicalKey, MissingThing>();
  /** Asked for and answered this time: cleared from the scope's list when it's merged. */
  readonly answered = new Set<CanonicalKey>();
  private known: Set<string> | null = null;

  constructor(private readonly cache: Cache, private readonly org: OrgKey) {}

  private seenPr(repoId: Guid, prId: number): boolean {
    this.known ??= new Set(this.cache.prs(this.org).map(({ pr }) => `${pr.repoId}:${pr.prId}`));
    return this.known.has(`${repoId}:${prId}`);
  }

  /** A PR that couldn't be read. Returns whether we hold its last known record. */
  pr(repoId: Guid, prId: number, e: unknown): boolean {
    const seen = this.seenPr(repoId, prId);
    const key = keys.pr(this.org, repoId, prId);
    this.things.set(key, { kind: 'pr', key, status: e instanceof AdoError ? e.status : 0, seen });
    return seen;
  }

  /** A repo whose PRs couldn't be listed (forbidden, deleted, or another project's: TF401019). */
  repo(repoId: Guid, e: unknown): void {
    const key = keys.repo(this.org, repoId);
    this.things.set(key, { kind: 'repo', key, status: e instanceof AdoError ? e.status : 0, seen: false });
  }

  /** It answered after all (a retry): no longer missing. */
  found(key: CanonicalKey): void {
    this.things.delete(key);
    this.answered.add(key);
  }

  get size(): number {
    return this.things.size;
  }

  list(): MissingThing[] {
    return [...this.things.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  /** The seen ones: drawn from their last known facts, so marked stale (02 §3). */
  staleKeys(): CanonicalKey[] {
    return this.list().filter((m) => m.seen).map((m) => m.key);
  }

  /** The coverage note for them, or null when nothing is missing. */
  note(): string | null {
    return missingNote(this.list());
  }
}

/** The note for a list of missing things (the coverage panel lists them under it). */
export function missingNote(list: MissingThing[]): string | null {
  const prs = list.filter((m) => m.kind === 'pr').length;
  const repos = list.filter((m) => m.kind === 'repo').length;
  if (!prs && !repos) return null;
  const parts = [prs ? `${prs} pull request${prs === 1 ? '' : 's'}` : '', repos ? `${repos} repo${repos === 1 ? '' : 's'}` : ''].filter(Boolean);
  return `${parts.join(' and ')} couldn’t be read; ${prs + repos === 1 ? 'it is' : 'they are'} asked for again on the next sync.`;
}
const isMissingNote = (n: string) => /couldn’t be read; (it is|they are) asked for again/.test(n);

type Coverage = { partial: boolean; notes: string[]; stale?: CanonicalKey[]; missing?: MissingThing[] };

/**
 * A scope's coverage after a pass that only touched some PRs and repos (the level loader, the stream):
 * what was asked for and answered leaves the list, what failed joins it, and the note, the stale marks
 * and `partial` follow. Things not asked for this time stay as they were.
 */
export function mergeMissing(prev: Coverage | null | undefined, u: Unreadable): Coverage {
  const base: Coverage = prev ?? { partial: false, notes: [] };
  const now = new Map<CanonicalKey, MissingThing>();
  for (const m of base.missing ?? []) if (!u.answered.has(m.key)) now.set(m.key, m);
  for (const m of u.list()) now.set(m.key, m);
  const missing = [...now.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const wasMissingStale = new Set((base.missing ?? []).filter((m) => m.seen).map((m) => m.key));
  const stale = new Set((base.stale ?? []).filter((k) => !(wasMissingStale.has(k) && !now.has(k))));
  for (const m of missing) if (m.seen) stale.add(m.key);
  const others = base.notes.filter((n) => !isMissingNote(n));
  const note = missingNote(missing);
  const notes = [...others, ...(note ? [note] : [])].sort();
  // Partial while anything at all is missing, or something else (a note) still says so.
  const partial = missing.length > 0 || (base.partial && (others.length > 0 || (base.stale?.length ?? 0) > wasMissingStale.size));
  return { partial, notes, ...(stale.size ? { stale: [...stale].sort() } : {}), ...(missing.length ? { missing } : {}) };
}

/** A PR key's repo and number (`pr:org:repo:id`). */
export function prRef(key: CanonicalKey): { repoId: Guid; prId: number } | null {
  const m = /^pr:[^:]+:([^:]+):(\d+)$/.exec(key);
  return m ? { repoId: m[1] as Guid, prId: Number(m[2]) } : null;
}
