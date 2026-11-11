// 04 §3 — the WIQL the client writes. These are the only queries the fake ADO evaluates
// (fixtures/ado.ts), so keep the two in step.

/** WIQL string literal: single quotes doubled. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Features under an Area Path, newest first (decided 2026-10-07: always bounded, run with `$top`).
 * `sinceDays` narrows by ChangedDate when a big area still trips the 20,000-result cap (VS402337);
 * `before` continues a page by date.
 */
export const featuresUnder = (path: string, asOf?: string, opts: { sinceDays?: number; before?: string } = {}) =>
  `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Feature' AND [System.AreaPath] UNDER ${lit(path)}`
  + `${opts.sinceDays !== undefined ? ` AND [System.ChangedDate] >= @Today - ${opts.sinceDays}` : ''}${opts.before ? ` AND [System.ChangedDate] < ${lit(opts.before)}` : ''}`
  + ` ORDER BY [System.ChangedDate] DESC${asOf ? ` ASOF ${lit(asOf)}` : ''}`;

/**
 * A sprint's Stories and Bugs in its pods (decided 2026-10-07), newest first. Sampled `asOf` across the
 * sprint's days, so items that joined and left it are found too.
 */
/**
 * Everything ever in a sprint that is still under one of its pods (decided 2026-10-08): one query in
 * place of a daily `ASOF` sample per day, and it can't miss an item that joined and left between two
 * samples. `EVER` is WIQL-only (not the web editor) and has no `UNDER` form, so the pod clause is
 * present-tense; `derive`'s own rule (ever under a pod, in the sprint's window) does the filtering.
 * `EVER` and `ASOF` can't be combined. Older ADO may refuse it: the caller falls back to sampling.
 */
export const sprintItemsEver = (iterationPaths: string | string[], pods: string[]) =>
  `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND ${everAny('System.IterationPath', iterationPaths)}`
  + ` AND [System.WorkItemType] IN ('User Story', 'Bug')`
  + (pods.length ? ` AND (${pods.map((p) => `[System.AreaPath] UNDER ${lit(p)}`).join(' OR ')})` : '')
  + ` ORDER BY [System.ChangedDate] DESC`;

/**
 * `EVER` has no `UNDER` form (slice 7): "ever in this sprint, or one of its child iterations" is one
 * `EVER` per path in the subtree, ORed.
 */
const everAny = (field: string, paths: string | string[]) => {
  const list = typeof paths === 'string' ? [paths] : paths;
  return list.length === 1 ? `[${field}] EVER ${lit(list[0]!)}` : `(${list.map((p) => `[${field}] EVER ${lit(p)}`).join(' OR ')})`;
};

/**
 * Everything ever in the sprint that was **ever** in a pod (slice 7, decided 2026-10-10): one per pod,
 * with an area `EVER` per node in the pod's subtree. It finds a body that has since left both the
 * sprint and the pod, which `sprintItemsEver`'s present-tense pod clause can't.
 */
export const podItemsEver = (iterationPaths: string[], podAreas: string[]) =>
  `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND ${everAny('System.IterationPath', iterationPaths)}`
  + ` AND [System.WorkItemType] IN ('User Story', 'Bug') AND ${everAny('System.AreaPath', podAreas)}`
  + ` ORDER BY [System.ChangedDate] DESC`;

/** The capability probe's `EVER` check: does this ADO accept the operator at all (04 §5b)? */
export const everProbe = (project: string) =>
  `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.IterationPath] EVER ${lit(project)}`;

/** A sprint's Stories and Bugs now (or `asOf`), its child iterations included (slice 7: `UNDER`). */
export const sprintItems = (iterationPath: string, pods: string[], asOf?: string) =>
  `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.IterationPath] UNDER ${lit(iterationPath)}`
  + ` AND [System.WorkItemType] IN ('User Story', 'Bug')`
  + (pods.length ? ` AND (${pods.map((p) => `[System.AreaPath] UNDER ${lit(p)}`).join(' OR ')})` : '')
  + ` ORDER BY [System.ChangedDate] DESC${asOf ? ` ASOF ${lit(asOf)}` : ''}`;

/** Page sizes for bounded queries (decided 2026-10-07). */
export const FEATURE_PAGE = 200;
export const EPIC_SAMPLE = 100;
export const LINK_QUERY_TOP = 5000;
/** When even a bounded query trips the cap, narrow by ChangedDate through these windows, in days. */
export const NARROW_DAYS = [365, 90, 30, 7, 1];

export const epicFeatures = (epic: number) =>
  `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.Id] = ${epic} AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' AND [Target].[System.WorkItemType] = 'Feature' MODE (MustContain)`;

const treeHead = `SELECT [System.Id] FROM WorkItemLinks WHERE [Source].[System.Id] IN (`;
const treeTail = `) AND [System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward' MODE (Recursive)`;
/** WIQL's limit is 32k characters: split the ID list so each query stays under it. */
export const QUERY_MAX = 32_000;

export function descendantQueries(ids: number[]): string[] {
  const out: string[] = [];
  let chunk: number[] = [];
  const len = (c: number[]) => treeHead.length + treeTail.length + c.join(', ').length;
  for (const id of ids) {
    if (chunk.length && len([...chunk, id]) > QUERY_MAX) { out.push(`${treeHead}${chunk.join(', ')}${treeTail}`); chunk = []; }
    chunk.push(id);
  }
  if (chunk.length) out.push(`${treeHead}${chunk.join(', ')}${treeTail}`);
  return out;
}

export const epicsByTitle = (q: string) =>
  `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Epic' AND [System.Title] CONTAINS ${lit(q)}`;

/**
 * Your recent work, org-wide (decided 2026-10-07): ADO has no documented "recent projects" API, and
 * @MyRecentActivity runs only in the web portal, so recency is what you changed or are assigned.
 */
export const myRecentWork = (days = 90) =>
  `SELECT [System.Id] FROM WorkItems WHERE ([System.ChangedBy] = @Me OR [System.AssignedTo] = @Me) AND [System.ChangedDate] >= @Today - ${days} ORDER BY [System.ChangedDate] DESC`;
