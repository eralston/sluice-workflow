// 04 §§3–4, 7 — ADO REST JSON → source facts (03 §2). Pure, and defensive: ADO omits empty fields, and
// some keys are undocumented. Only the fact shapes leave here; whole payloads are never kept (INV-16).
import type { BoardColumnFact, IdentityRefFact, PrStats, PrVotes, PullRequestFact, RelationFact, RepoFact, RepoRun, RevisionFact, RunState, UpdateFact } from '../contracts/facts';
import { normalizeGuid, type Guid, type UtcMs } from '../contracts/keys';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const time = (v: unknown): UtcMs | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** 04 §3: a PR artifact link's URL (project, repo, PR). Case-insensitive; `%2F` or `/` between parts. */
export const PR_ARTIFACT_RE = /^vstfs:\/\/\/Git\/PullRequestId\/([0-9a-f-]{36})(?:%2F|\/)([0-9a-f-]{36})(?:%2F|\/)(\d+)$/i;
const WI_URL_RE = /\/workItems\/(\d+)$/i;

/** An identity ref (04 §7), or null for none and for groups (`isContainer`), which are never captains. */
export function parseIdentity(raw: unknown): IdentityRefFact | null {
  const o = obj(raw);
  const id = str(o?.id);
  if (!o || !id || o.isContainer === true) return null;
  let norm: Guid;
  try { norm = normalizeGuid(id); } catch { return null; }
  const out: IdentityRefFact = { id: norm, displayName: str(o.displayName) ?? 'Unknown' };
  const unique = str(o.uniqueName);
  if (unique) out.uniqueName = unique;
  const image = str(o.imageUrl) ?? str(obj(obj(obj(o._links)?.avatar))?.href);
  if (image) out.imageUrl = image;
  return out;
}

/** 03 §3's relation table. Hierarchy and dependency links name a work item; PR links parse the artifact URL. */
export function parseRelation(raw: unknown): RelationFact | null {
  const o = obj(raw);
  const rawRel = str(o?.rel);
  const url = str(o?.url);
  if (!o || !rawRel || !url) return null;
  const wi = () => {
    const m = WI_URL_RE.exec(url);
    return m ? { kind: 'wi' as const, id: Number(m[1]) } : { kind: 'other' as const, url };
  };
  const rels: Record<string, RelationFact['rel']> = {
    'System.LinkTypes.Hierarchy-Reverse': 'parent',
    'System.LinkTypes.Hierarchy-Forward': 'child',
    'System.LinkTypes.Dependency-Reverse': 'predecessor',
    'System.LinkTypes.Dependency-Forward': 'successor',
  };
  const known = rels[rawRel];
  if (known) {
    const target = wi();
    return { rel: target.kind === 'wi' ? known : 'other', rawRel, target };
  }
  // The attribute name is case-sensitive (04 §3): "Pull Request" exactly.
  if (rawRel === 'ArtifactLink' && str(obj(o.attributes)?.name) === 'Pull Request') {
    const m = PR_ARTIFACT_RE.exec(url);
    if (m) {
      try {
        return { rel: 'pr', rawRel, target: { kind: 'pr', projectId: normalizeGuid(m[1]!), repoId: normalizeGuid(m[2]!), prId: Number(m[3]) } };
      } catch { /* not GUIDs: falls through to other */ }
    }
  }
  return { rel: 'other', rawRel, target: { kind: 'other', url } };
}

const relations = (v: unknown): RelationFact[] =>
  (Array.isArray(v) ? v : []).map(parseRelation).filter((r): r is RelationFact => r !== null);

/** One revision. `System.TeamProject` is a name, so the caller resolves it to the project's ID. */
export function parseRevision(raw: unknown, projectIdOf: (name: string) => Guid | undefined): RevisionFact | null {
  const o = obj(raw);
  const f = obj(o?.fields);
  const itemId = o?.id;
  const rev = o?.rev;
  const changedAt = time(f?.['System.ChangedDate']);
  const projectId = projectIdOf(str(f?.['System.TeamProject']) ?? '');
  if (!o || !f || typeof itemId !== 'number' || typeof rev !== 'number' || changedAt === null || !projectId) return null;
  return {
    itemId, rev, changedAt, projectId,
    type: str(f['System.WorkItemType']) ?? '',
    title: str(f['System.Title']) ?? '',
    state: str(f['System.State']) ?? '',
    areaPath: str(f['System.AreaPath']) ?? '',
    ...(str(f['System.IterationPath']) ? { iterationPath: str(f['System.IterationPath'])! } : {}),
    assignedTo: parseIdentity(f['System.AssignedTo']),
    changedBy: parseIdentity(f['System.ChangedBy']),
    // B4: the board column, and the Done half of a split one. Kept only when there is a column.
    ...(str(f['System.BoardColumn']) ? { boardColumn: str(f['System.BoardColumn'])! } : {}),
    ...(str(f['System.BoardColumn']) && f['System.BoardColumnDone'] === true ? { boardColumnDone: true as const } : {}),
  };
}

/**
 * `GET …/work/backlogs` (04 §3): the name of the requirement level, whose board holds Stories and Bugs (Stories, Backlog
 * items, Requirements, Issues …). By category, not name: `Microsoft.RequirementCategory`, else `type: 'requirement'`.
 */
export function parseStoriesBoard(raw: unknown): string | undefined {
  const levels = (Array.isArray(raw) ? raw : []).flatMap((b) => { const o = obj(b); const name = str(o?.name); return o && name ? [{ id: str(o.id), type: str(o.type), name }] : []; });
  return (levels.find((l) => l.id === 'Microsoft.RequirementCategory') ?? levels.find((l) => l.type === 'requirement'))?.name;
}

/**
 * `GET …/work/boards/{board}/columns` (04 §3): the columns in the board's order. ADO's `order` is used
 * when every column has one, else the list's own order. A column with no name is dropped.
 */
export function parseBoardColumns(raw: unknown): BoardColumnFact[] {
  const list = obj(raw)?.value;
  const cols = (Array.isArray(list) ? list : []).flatMap((c, i) => {
    const o = obj(c);
    const name = str(o?.name);
    if (!o || !name) return [];
    const type = str(o.columnType);
    return [{ i, order: typeof o.order === 'number' ? o.order : null, col: { name, type: (type === 'incoming' || type === 'outgoing' ? type : 'inProgress') as BoardColumnFact['type'], split: o.isSplit === true } }];
  });
  if (cols.every((c) => c.order !== null)) cols.sort((a, b) => a.order! - b.order! || a.i - b.i);
  return cols.map((c) => c.col);
}

/**
 * One update. Its time is `fields["System.ChangedDate"].newValue` when present (04 §4); a
 * relation-only update is left undated here and takes its matching revision's time in the
 * derivation. `revisedDate` is never read: it's when the revision was superseded (AC-29).
 */
export function parseUpdate(raw: unknown, itemId: number): UpdateFact | null {
  const o = obj(raw);
  const updateId = o?.id;
  if (!o || typeof updateId !== 'number') return null;
  const rel = obj(o.relations);
  return {
    itemId, updateId,
    rev: typeof o.rev === 'number' ? o.rev : null,
    sourceAt: time(obj(obj(o.fields)?.['System.ChangedDate'])?.newValue),
    added: relations(rel?.added),
    removed: relations(rel?.removed),
  };
}

const PR_STATUS = new Set(['active', 'completed', 'abandoned']);

/** A PR record. Its ADO web link comes from the repository's `webUrl`, when the response carries one. */
export function parsePullRequest(raw: unknown): PullRequestFact | null {
  const o = obj(raw);
  const repo = obj(o?.repository);
  const prId = o?.pullRequestId;
  const status = str(o?.status);
  const createdAt = time(o?.creationDate);
  let repoId: Guid, projectId: Guid;
  try {
    repoId = normalizeGuid(str(repo?.id) ?? '');
    projectId = normalizeGuid(str(obj(repo?.project)?.id) ?? '');
  } catch { return null; }
  if (!o || typeof prId !== 'number' || !status || !PR_STATUS.has(status) || createdAt === null) return null;
  const web = str(repo?.webUrl);
  return {
    projectId, repoId, prId, title: str(o.title) ?? '',
    status: status as PullRequestFact['status'],
    createdAt,
    closedAt: status === 'active' ? null : time(o.closedDate),
    author: parseIdentity(o.createdBy),
    closedBy: status === 'active' ? null : parseIdentity(o.closedBy),
    targetRef: str(o.targetRefName) ?? '',
    adoUrl: web ? `${web}/pullrequest/${prId}` : '',
    ...(str(obj(o.lastMergeSourceCommit)?.commitId) ? { lastCommit: str(obj(o.lastMergeSourceCommit)!.commitId)! } : {}),
  };
}

const APPROVED = new Set([10, 5]);

/**
 * 04 §6a: the reviewers whose vote standing at `closedAt` approved. Replays VoteUpdate threads up to
 * then (a later reset counts); with no readable threads, the final votes stand (`fromThreads: false`).
 */
export function approversAt(reviewers: unknown, threads: unknown | null, closedAt: UtcMs | null): { approvers: Guid[]; fromThreads: boolean } {
  const people = new Map<Guid, number>();
  for (const r of Array.isArray(reviewers) ? reviewers : []) {
    const id = parseIdentity(r);
    const vote = obj(r)?.vote;
    if (id) people.set(id.id, typeof vote === 'number' ? vote : 0);
  }
  const votes = Array.isArray(threads)
    ? (threads as unknown[]).flatMap((t) => {
        const o = obj(t);
        const props = obj(o?.properties);
        const prop = (k: string) => obj(props?.[k])?.$value ?? props?.[k];
        if (!o || o.isDeleted === true || str(prop('CodeReviewThreadType')) !== 'VoteUpdate') return [];
        const at = time(o.publishedDate);
        const result = Number(prop('CodeReviewVoteResult'));
        let who: Guid;
        try { who = normalizeGuid(String(prop('CodeReviewVotedByTfId') ?? '')); } catch { return []; }
        return at !== null && Number.isFinite(result) && (closedAt === null || at <= closedAt) ? [{ who, at, result }] : [];
      })
    : null;
  if (votes && votes.length > 0) {
    const standing = new Map<Guid, number>();
    for (const v of votes.sort((a, b) => a.at - b.at)) standing.set(v.who, v.result);
    // Only real reviewers count (groups were dropped above); a thread names its voter.
    return { approvers: [...standing].filter(([who, v]) => APPROVED.has(v) && people.has(who)).map(([who]) => who).sort(), fromThreads: true };
  }
  return { approvers: [...people].filter(([, v]) => APPROVED.has(v)).map(([who]) => who).sort(), fromThreads: false };
}

// ---- The PR stat line's facts (B1; 04 §6a-1) ----

/** Reviewers' current votes by kind. Groups (`isContainer`) and 0 (no vote) are skipped. Undefined when nobody voted. */
export function voteCounts(reviewers: unknown): PrVotes | undefined {
  const out: PrVotes = {};
  for (const r of Array.isArray(reviewers) ? reviewers : []) {
    if (!parseIdentity(r)) continue;
    const v = obj(r)?.vote;
    const kind = v === 10 ? 'approved' : v === 5 ? 'suggestions' : v === -5 ? 'waiting' : v === -10 ? 'rejected' : null;
    if (kind) out[kind] = (out[kind] ?? 0) + 1;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Threads a person started: not deleted, with at least one live comment, no `CodeReviewThreadType`
 * (vote, reviewer, ref-update and policy threads carry one), and not all `commentType: system`.
 */
export function humanThreadCount(threads: unknown): number {
  let n = 0;
  for (const t of Array.isArray(threads) ? threads : []) {
    const o = obj(t);
    if (!o || o.isDeleted === true) continue;
    const props = obj(o.properties);
    if (props && props.CodeReviewThreadType !== undefined) continue;
    const live = (Array.isArray(o.comments) ? o.comments : []).map(obj).filter((c): c is Json => !!c && c.isDeleted !== true);
    if (live.length > 0 && !live.every((c) => c.commentType === 'system')) n++;
  }
  return n;
}

/**
 * The entries of an iteration's changes that are files (a folder entry is not): one page, and the cursor
 * for the next (`nextSkip`, 0 or absent at the end).
 */
export function changePage(raw: unknown): { files: number; next: number } {
  const o = obj(raw);
  const entries = Array.isArray(o?.changeEntries) ? (o!.changeEntries as unknown[]) : [];
  const files = entries.filter((e) => obj(obj(e)?.item)?.isFolder !== true).length;
  const next = o?.nextSkip;
  return { files, next: typeof next === 'number' && Number.isFinite(next) ? next : 0 };
}

/** The facts that were read, as the plate's stat line takes them. Anything undefined is left out. */
export function prStatsOf(read: { reviewers?: unknown; threads?: unknown; iterations?: number; files?: number }): PrStats {
  const votes = read.reviewers === undefined ? undefined : voteCounts(read.reviewers);
  return {
    ...(votes ? { votes } : {}),
    ...(read.iterations !== undefined ? { pushes: read.iterations } : {}),
    ...(read.threads !== undefined ? { threads: humanThreadCount(read.threads) } : {}),
    ...(read.files !== undefined ? { files: read.files } : {}),
  };
}

/** A repository from the list call (`defaultBranch` is absent for an empty repo). Null when it has no usable id. */
export function parseRepo(raw: unknown, projectId: Guid): RepoFact | null {
  const o = obj(raw);
  let repoId: Guid;
  try { repoId = normalizeGuid(str(o?.id) ?? ''); } catch { return null; }
  const branch = str(o?.defaultBranch);
  return { projectId, repoId, name: str(o?.name) ?? '', adoUrl: str(o?.webUrl) ?? '', ...(branch ? { defaultBranch: branch } : {}) };
}

/**
 * A repository's latest build, as the chart's run (B2; 04 §3 builds): `status` and `result` become one word.
 * Completed: succeeded passed, partiallySucceeded partly, failed failed, canceled canceled (a missing or
 * unknown result is unreadable: no run). Not completed: `notStarted` and `postponed` queued, anything else
 * (inProgress, cancelling) running. At is the finish time, else the start, else the queue time. Null: nothing usable.
 */
export function parseBuildRun(raw: unknown): RepoRun | null {
  const o = obj(raw);
  const status = str(o?.status);
  if (!o || !status) return null;
  let state: RunState;
  if (status === 'completed') {
    const result = str(o.result);
    const byResult: Record<string, RunState> = { succeeded: 'passed', partiallySucceeded: 'partly', failed: 'failed', canceled: 'canceled' };
    if (!result || !byResult[result]) return null;
    state = byResult[result]!;
  } else state = status === 'notStarted' || status === 'postponed' ? 'queued' : 'running';
  const at = state === 'queued' ? time(o.queueTime)
    : state === 'running' ? (time(o.startTime) ?? time(o.queueTime))
      : (time(o.finishTime) ?? time(o.startTime));
  return at === null ? null : { state, at };
}
