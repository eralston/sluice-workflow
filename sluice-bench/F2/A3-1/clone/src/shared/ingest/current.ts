// Current state without history (decided 2026-10-07): what a level load knows about items and PRs
// whose history isn't loaded, added to a derived bundle as `current`. Replay starts from it
// (snapshotAt's seed), so a scene shows its state now at once; asking for history later adds events.
// Pure. Never used for full syncs or fixtures, which carry every entity's history.
import type { CurrentItemFact, PullRequestFact, RelationFact } from '../contracts/facts';
import type { CurrentState, ScopeHistory } from '../contracts/history';
import { keys, type CanonicalKey, type Guid, type OrgKey } from '../contracts/keys';
import { callSignFor, plainName, shipSeedFor } from '../captains';
import type { IdentityRefFact } from '../contracts/facts';
import { resolveState } from '../stateMapping';
import { underPath } from '../paths';

export interface CurrentFacts {
  items: ReadonlyMap<number, CurrentItemFact>;
  relations: ReadonlyMap<number, RelationFact[]>;
  prs: PullRequestFact[];
  /** Features whose subtrees are loaded; and where Load more applies. */
  explored: number[];
  more: { team: boolean; features: number[] };
  /** Scenes played (history requested): 'team' or a Feature's ID. */
  played?: { scene: 'team' | number; days: number; at: number; missing?: number[]; capped?: true }[];
  at: number;
}

const under = underPath;

export function applyCurrent(h: ScopeHistory, c: CurrentFacts, ctx: {
  org: OrgKey; projectId: Guid;
  /** A sprint (decided 2026-10-08: its first look is current state): its path and its pods' area paths. */
  target: { kind: 'area'; path: string } | { kind: 'epic'; id: number } | { kind: 'sprint'; path: string; pods: string[] };
  identities: ReadonlyMap<Guid, IdentityRefFact & { avatar?: string }>;
  profiles?: ReadonlyMap<Guid, { shipSeed: number; callSign: string }>;
  workItemUrl?: (id: number) => string;
}): ScopeHistory {
  const org = ctx.org;
  const wi = (id: number) => keys.workItem(org, id);
  const prKey = (p: { repoId: Guid; prId: number }) => keys.pr(org, p.repoId, p.prId);
  const kind = (type: string) => resolveState(h.stateMapping, type, '').kind;
  const withHistory = new Set<CanonicalKey>([...h.entities.workItems.map((w) => w.key), ...h.entities.prs.map((p) => p.key)]);
  const parentOf = (id: number) => (c.relations.get(id) ?? []).find((r) => r.rel === 'parent' && r.target.kind === 'wi')?.target as { id: number } | undefined;
  const childrenOf = (id: number) => (c.relations.get(id) ?? []).filter((r) => r.rel === 'child' && r.target.kind === 'wi').map((r) => (r.target as { id: number }).id);

  // Membership now: Features under the path (or the Epic) as they are now, their current children
  // (those loaded), and every current ancestor. A sprint's roots are its Stories and Bugs now, in a pod.
  const items = new Set<number>();
  const t = ctx.target;
  for (const [id, it] of c.items) {
    if (it.projectId !== ctx.projectId) continue;
    if (t.kind === 'sprint') {
      const k = kind(it.type);
      if ((k === 'story' || k === 'bug') && under(it.iterationPath ?? '', t.path) && t.pods.some((p) => under(it.areaPath, p))) items.add(id);
      continue;
    }
    if (kind(it.type) !== 'feature') continue;
    if (t.kind === 'area' ? under(it.areaPath, t.path) : parentOf(id)?.id === t.id) items.add(id);
  }
  for (const k of h.entities.workItems) items.add(Number(k.key.split(':').pop())); // history items stay members
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id] of c.items) {
      const p = parentOf(id);
      // In a sprint, only the work beneath its Stories and Bugs: a Feature's other children aren't in it.
      const underBody = t.kind !== 'sprint' || (p && c.items.has(p.id) && kind(c.items.get(p.id)!.type) !== 'feature' && kind(c.items.get(p.id)!.type) !== 'epic');
      if (p && items.has(p.id) && !items.has(id) && underBody && kind(c.items.get(id)!.type) !== 'feature') { items.add(id); grew = true; }
    }
  }
  for (const id of [...items]) {
    for (let p = parentOf(id); p && c.items.has(p.id) && !items.has(p.id); p = parentOf(p.id)) items.add(p.id);
  }
  if (t.kind === 'epic' && c.items.has(t.id)) items.add(t.id);

  const currentOnly = [...items].filter((id) => c.items.has(id) && !withHistory.has(wi(id)));
  const memberKeys = new Set([...items].map(wi));
  const prById = new Map<CanonicalKey, PullRequestFact>(c.prs.map((p) => [prKey(p), p]));
  const current: CurrentState = { at: c.at, workItems: [], prs: [], links: [] };
  const people = new Set<Guid>();
  for (const id of currentOnly) {
    const it = c.items.get(id)!;
    current.workItems.push({
      key: wi(id), type: it.type, title: it.title, state: it.state, areaPath: it.areaPath,
      assigneeKey: it.assignedTo ? keys.identity(org, it.assignedTo.id) : null, createdAt: it.createdAt, changedAt: it.changedAt,
      ...(it.iterationPath ? { iterationPath: it.iterationPath } : {}),
    });
    if (it.assignedTo) people.add(it.assignedTo.id);
    const p = parentOf(id);
    if (p && memberKeys.has(wi(p.id))) current.links.push({ kind: 'parent', fromKey: wi(id), toKey: wi(p.id) });
    for (const r of c.relations.get(id) ?? []) {
      if (r.rel === 'pr' && r.target.kind === 'pr') {
        const k = prKey(r.target);
        if (prById.has(k)) current.links.push({ kind: 'pr', fromKey: k, toKey: wi(id) });
      }
      if (r.rel === 'predecessor' && r.target.kind === 'wi' && memberKeys.has(wi(r.target.id))) current.links.push({ kind: 'dependency', fromKey: wi(r.target.id), toKey: wi(id) });
    }
  }
  const linkedPrs = new Set(current.links.filter((l) => l.kind === 'pr').map((l) => l.fromKey));
  for (const k of linkedPrs) {
    if (withHistory.has(k)) continue;
    const p = prById.get(k)!;
    current.prs.push({ key: k, repoKey: keys.repo(org, p.repoId), title: p.title, status: p.status, authorKey: p.author ? keys.identity(org, p.author.id) : null, createdAt: p.createdAt, closedAt: p.closedAt });
    if (p.author) people.add(p.author.id);
  }
  const byKey = <T extends { key: string }>(a: T, b: T) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  current.workItems.sort(byKey);
  current.prs.sort(byKey);
  current.links.sort((a, b) => (a.kind + a.fromKey + a.toKey < b.kind + b.fromKey + b.toKey ? -1 : 1));

  // Entities: the bundle's own, plus the current-only ones.
  const workItems = [...h.entities.workItems, ...current.workItems.map((w) => ({ key: w.key, type: w.type, adoUrl: ctx.workItemUrl?.(Number(w.key.split(':').pop())) ?? '' }))].sort(byKey);
  const prs = [...h.entities.prs, ...current.prs.filter((p) => !h.entities.prs.some((x) => x.key === p.key)).map((p) => ({ key: p.key, repoKey: p.repoKey, adoUrl: prById.get(p.key)?.adoUrl ?? '', ...(Object.keys(prById.get(p.key)?.stats ?? {}).length ? { stats: prById.get(p.key)!.stats } : {}) }))].sort(byKey);
  const repoKeys = new Set([...h.entities.repos.map((r) => r.key), ...current.prs.map((p) => p.repoKey)]);
  const repos = [...h.entities.repos, ...[...repoKeys].filter((k) => !h.entities.repos.some((r) => r.key === k)).map((k) => ({ key: k, name: k.split(':').pop()!, adoUrl: '' }))].sort(byKey);
  const captainKeys = new Set(h.entities.captains.map((x) => x.key));
  const captains = [...h.entities.captains];
  for (const g of people) {
    const key = keys.identity(org, g);
    if (captainKeys.has(key)) continue;
    const ident = ctx.identities.get(g);
    const displayName = plainName(ident?.displayName ?? 'Unknown');
    const profile = ctx.profiles?.get(g);
    const shipSeed = profile?.shipSeed ?? shipSeedFor(org, g);
    captains.push({ key, displayName, shipSeed, callSign: profile?.callSign ?? callSignFor(displayName, shipSeed), ...(ident?.avatar ? { avatar: ident.avatar } : {}) });
  }
  captains.sort(byKey);

  // Unexplored Features: their child counts from current links, for the miniatures.
  const explored = new Set(c.explored);
  // (A sprint's Features are ancestors for the label line, not stars: no miniatures.)
  const childCounts = [...items].filter((id) => t.kind !== 'sprint' && c.items.has(id) && kind(c.items.get(id)!.type) === 'feature' && !explored.has(id))
    .map((id) => {
      const kids = childrenOf(id);
      const bugs = kids.filter((k) => c.items.has(k) && kind(c.items.get(k)!.type) === 'bug').length;
      return { key: wi(id), stories: kids.length - bugs, bugs };
    }).filter((x) => x.stories + x.bugs > 0).sort(byKey);

  return {
    ...h,
    coverage: {
      ...h.coverage,
      history: [...withHistory].sort(),
      explored: [...items].filter((id) => explored.has(id)).map(wi).sort(),
      more: { team: c.more.team, features: c.more.features.map(wi).sort() },
      played: (c.played ?? []).map((p) => ({ scene: p.scene === 'team' ? 'team' as const : wi(p.scene), days: p.days, at: p.at, ...(p.missing?.length ? { missing: p.missing.map(wi) } : {}), ...(p.capped ? { capped: true as const } : {}) })),
    },
    entities: { ...h.entities, workItems, prs, repos, captains, ...(childCounts.length ? { childCounts } : {}) },
    current,
  };
}
