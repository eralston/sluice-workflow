// 02 §§2–6, 03 §§3–4, 04 §4 — the derivation: ADO source facts → the ScopeHistory bundle. Pure and
// deterministic (INV-12, INV-13): the same facts always give the same bundle, so overlapping syncs
// change nothing and ingest(toAdoPayloads(s)) ≡ toHistory(s) (AC-27). The membership rules mirror
// the fixture DSL's (fixtures/dsl.ts, `scopeItems`): both follow 03 §4.
import type { AnyTimelineEvent, EventKind, EventPayload, EvidenceRef, Observation } from '../contracts/events';
import { compareEvents } from '../contracts/events';
import type { BoardColumnFact, IdentityRefFact, ProjectFact, PullRequestFact, RelationFact, RepoFact, RevisionFact, UpdateFact } from '../contracts/facts';
import type { MissingThing, ScopeHistory, SectorRef, StateMapping } from '../contracts/history';
import { keys, type CanonicalKey, type Guid, type OrgKey, type UtcMs } from '../contracts/keys';
import { callSignFor, plainName, shipSeedFor } from '../captains';
import { BACKFILL_MAX_WEEKS } from '../limits';
import { eventPriority } from '../priority';
import { resolveState } from '../stateMapping';
import { underPath } from '../paths';
import { boardOf, placementsOf } from './board';

/**
 * The derivation's version (03 §9, v1.3 F1). **Bump it whenever `derive` turns the same cached facts
 * into different events, observations or links**: at boot the cache compares it with
 * `meta.derivation_version` and, on a mismatch, clears the derived tables (`events`, `links`,
 * `observations`) and rebuilds each synced scope's rows from its cached facts the next time that scope
 * opens (or syncs). It also rides in every bundle as `derivationVersion` (the fixture DSL reads it too).
 * After a bump, run `npm run fixtures` so the generated bundles carry the new number.
 *
 * It does not re-read anything from ADO. A change to what is *parsed* into facts (`parse.ts`: a new
 * field in `RevisionFact`, say) leaves the cached facts without it; that needs a migration that clears
 * the fact tables so the next sync reads them again (`003_iterations.sql` is the pattern).
 */
export const DERIVATION_VERSION = 1;

/** Everything the derivation reads: the facts in the cache for one scope, plus the scope itself. */
export interface IngestFacts {
  orgKey: OrgKey;
  project: ProjectFact;
  sector: SectorRef;
  /** The sector's own identity: the area path (area sectors) or the Epic's ID (Epic sectors). */
  sectorTarget: { kind: 'area'; path: string } | { kind: 'epic'; id: number } | SprintTarget;
  range: { startUtc: UtcMs; endUtc: UtcMs };
  /** When the derivation runs: the time of "now" for current relations and PR state. */
  now: UtcMs;
  revisions: ReadonlyMap<number, RevisionFact[]>;
  updates: ReadonlyMap<number, UpdateFact[]>;
  currentRelations: ReadonlyMap<number, RelationFact[]>;
  prs: PullRequestFact[];
  /** Reviewers whose standing vote at completion approved (04 §6a), per PR (`repoId:prId`). */
  approvers: ReadonlyMap<string, Guid[]>;
  repos: RepoFact[];
  identities: ReadonlyMap<Guid, IdentityRefFact & { avatar?: string }>;
  /** PRs the unlinked reconcile found (04 §3), and whether ADO lists any work item for each. */
  reconciled: { repoId: Guid; prId: number; hasWorkItems: boolean }[];
  mapping: StateMapping;
  /** B4: the columns of the scope's team board, in order (absent: placement by state). */
  boardColumns?: BoardColumnFact[];
  /** B4: whether an Area Path belongs to the board's team; a revision in another team's area has no column here. Absent: all do. */
  boardOwns?: (areaPath: string) => boolean;
  coverage: { syncedAt: UtcMs | null; partial: boolean; notes: string[]; stale?: CanonicalKey[]; missing?: MissingThing[] };
  workItemUrl?: (id: number) => string;
  /** Stored captain profiles (03 §9): a ship seed is written once and never recomputed. */
  profiles?: ReadonlyMap<Guid, { shipSeed: number; callSign: string }>;
}

/** A sprint's identity (decided 2026-10-07): its iteration path and dates, and the pods' area paths. */
export interface SprintTarget { kind: 'sprint'; path: string; startUtc: UtcMs; finishUtc: UtcMs; pods: string[] }

/**
 * Whether an item was in a sprint at any moment of its window (03 §4, Sprints): some stretch where its
 * iteration was the sprint's path overlaps [start, finish). `timeline` is (time, path) in time order.
 * The fixture DSL applies the same rule (fixtures/dsl.ts), for AC-27.
 */
export function inSprint(timeline: readonly { t: UtcMs; path: string }[], sprint: { path: string; startUtc: UtcMs; finishUtc: UtcMs }): boolean {
  return timeline.some((x, i) => under(x.path, sprint.path) && x.t < sprint.finishUtc && (timeline[i + 1]?.t ?? Infinity) > sprint.startUtc);
}

/** A derived `links` row (03 §9): dated links only; undated ones are observations. */
export interface DerivedLink {
  kind: 'parent' | 'pr' | 'dependency';
  fromKey: CanonicalKey; toKey: CanonicalKey;
  validFrom: UtcMs; validTo: UtcMs | null; endUnknown: boolean;
}

const under = underPath;
const prRef = (repoId: Guid, prId: number) => `${repoId}:${prId}`;

interface DatedLink { kind: 'parent' | 'pr' | 'dependency'; from: number | string; to: number; addedAt: UtcMs; removedAt: UtcMs | null }

export function deriveHistory(f: IngestFacts): ScopeHistory {
  return derive(f).history;
}

export function derive(f: IngestFacts): { history: ScopeHistory; links: DerivedLink[] } {
  const org = f.orgKey;
  const wi = (id: number) => keys.workItem(org, id);
  const person = (ref: IdentityRefFact | null | undefined): CanonicalKey | null => (ref ? keys.identity(org, ref.id) : null);
  const projectKey = (projectId: Guid) => keys.project(org, projectId);
  const repoKey = (repoId: Guid) => keys.repo(org, repoId);
  const prKey = (repoId: Guid, prId: number) => keys.pr(org, repoId, prId);
  const latest = (id: number) => f.revisions.get(id)?.at(-1);
  const typeOf = (id: number) => latest(id)?.type ?? '';
  const kindOf = (id: number) => resolveState(f.mapping, typeOf(id), '').kind;
  const revAt = (id: number, rev: number | null) => (rev === null ? undefined : f.revisions.get(id)?.find((r) => r.rev === rev));

  // ---- Every event, for every item we hold (filtered to the bundle below) ----
  const events: AnyTimelineEvent[] = [];
  const push = <K extends EventKind>(kind: K, entityKey: CanonicalKey, project: CanonicalKey, sourceRef: string, t: UtcMs,
    payload: EventPayload[K], evidence: EvidenceRef[], workKind: ReturnType<typeof kindOf> | 'pr', by: CanonicalKey | null) => {
    events.push({ eventKey: `${kind}:${entityKey}:${sourceRef}`, kind, occurredAt: t, observedAt: t, entityKey, projectKey: project,
      priority: eventPriority(kind, workKind), payload, evidence, changedBy: by } as AnyTimelineEvent);
  };

  for (const [id, revs] of f.revisions) {
    const sorted = [...revs].sort((a, b) => a.rev - b.rev);
    let prev: RevisionFact | undefined;
    for (const r of sorted) {
      const ek = wi(id);
      const pk = projectKey(r.projectId);
      const ev: EvidenceRef[] = [{ source: 'revision', ref: `wi:${id}:r${r.rev}`, at: r.changedAt }];
      const by = person(r.changedBy);
      const kind = resolveState(f.mapping, r.type, '').kind;
      if (!prev) {
        push('wi_created', ek, pk, `r${r.rev}`, r.changedAt, { type: r.type, title: r.title, state: r.state, areaPath: r.areaPath, assigneeKey: person(r.assignedTo), ...(r.iterationPath ? { iterationPath: r.iterationPath } : {}) }, ev, kind, by);
      } else {
        if (r.areaPath !== prev.areaPath) push('wi_area_changed', ek, pk, `r${r.rev}`, r.changedAt, { from: prev.areaPath, to: r.areaPath }, ev, kind, by);
        if ((r.iterationPath ?? '') !== (prev.iterationPath ?? '')) push('wi_iteration_changed', ek, pk, `r${r.rev}`, r.changedAt, { from: prev.iterationPath ?? '', to: r.iterationPath ?? '' }, ev, kind, by);
        if (r.state !== prev.state) push('wi_state_changed', ek, pk, `r${r.rev}`, r.changedAt, { from: prev.state, to: r.state }, ev, kind, by);
        if ((r.assignedTo?.id ?? null) !== (prev.assignedTo?.id ?? null)) {
          push('wi_assignee_changed', ek, pk, `r${r.rev}`, r.changedAt, { from: person(prev.assignedTo), to: person(r.assignedTo) }, ev, kind, by);
        }
        if (r.title !== prev.title) push('wi_title_changed', ek, pk, `r${r.rev}`, r.changedAt, { from: prev.title, to: r.title }, ev, kind, by);
      }
      prev = r;
    }
  }

  // ---- Links, from the canonical side's updates (03 §3); undated touches become observations ----
  const links: DatedLink[] = [];
  const undated: { kind: 'link_parent' | 'link_pr' | 'link_dependency'; from: number | string; to: number; present: boolean }[] = [];
  for (const [id, ups] of f.updates) {
    for (const u of [...ups].sort((a, b) => a.updateId - b.updateId)) {
      // 04 §4: the update's own ChangedDate, else its matching revision's; else undated.
      const t = u.sourceAt ?? revAt(id, u.rev)?.changedAt ?? null;
      const by = person(revAt(id, u.rev)?.changedBy);
      const touch = (rel: RelationFact, added: boolean) => {
        const target = rel.target;
        if (rel.rel === 'parent' && target.kind === 'wi') {
          if (t === null) { undated.push({ kind: 'link_parent', from: id, to: target.id, present: added }); return; }
          push(added ? 'link_parent_added' : 'link_parent_removed', wi(id), projectKey(revAt(id, u.rev)?.projectId ?? latest(id)!.projectId),
            `u${u.updateId}:${wi(target.id)}`, t, { childKey: wi(id), parentKey: wi(target.id) },
            [{ source: 'update', ref: `wi:${id}:u${u.updateId}`, at: t }], kindOf(id), by);
          track('parent', id, target.id, t, added);
        } else if (rel.rel === 'pr' && target.kind === 'pr') {
          const pk = prKey(target.repoId, target.prId);
          if (t === null) { undated.push({ kind: 'link_pr', from: pk, to: id, present: added }); return; }
          push(added ? 'link_pr_added' : 'link_pr_removed', wi(id), projectKey(revAt(id, u.rev)?.projectId ?? latest(id)!.projectId),
            `u${u.updateId}:${pk}`, t, { prKey: pk, itemKey: wi(id) }, [{ source: 'update', ref: `wi:${id}:u${u.updateId}`, at: t }], kindOf(id), by);
          track('pr', pk, id, t, added);
        } else if (rel.rel === 'predecessor' && target.kind === 'wi') {
          if (t === null) { undated.push({ kind: 'link_dependency', from: target.id, to: id, present: added }); return; }
          push(added ? 'link_dependency_added' : 'link_dependency_removed', wi(id), projectKey(revAt(id, u.rev)?.projectId ?? latest(id)!.projectId),
            `u${u.updateId}:${wi(target.id)}`, t, { predecessorKey: wi(target.id), successorKey: wi(id) },
            [{ source: 'update', ref: `wi:${id}:u${u.updateId}`, at: t }], kindOf(id), by);
          track('dependency', target.id, id, t, added);
        }
        // child / successor: the other end's record of the same link, never canonical (03 §3)
      };
      for (const rel of u.added) touch(rel, true);
      for (const rel of u.removed) touch(rel, false);
    }
  }
  function track(kind: DatedLink['kind'], from: number | string, to: number, t: UtcMs, added: boolean) {
    // Parent and dependency links run child → parent (pred → succ); PR links run pr → item.
    if (added) links.push({ kind, from, to, addedAt: t, removedAt: null });
    else {
      const open = [...links].reverse().find((l) => l.kind === kind && l.from === from && l.to === to && l.removedAt === null);
      if (open) open.removedAt = t;
    }
  }

  // ---- PRs ----
  const prByKey = new Map<CanonicalKey, PullRequestFact>(f.prs.map((p) => [prKey(p.repoId, p.prId), p]));
  for (const p of f.prs) {
    const key = prKey(p.repoId, p.prId);
    const ev: EvidenceRef[] = [{ source: 'pullRequest', ref: `pr:${p.repoId}:${p.prId}`, at: p.createdAt }];
    push('pr_opened', key, projectKey(p.projectId), 'pr', p.createdAt,
      { repoKey: repoKey(p.repoId), title: p.title, authorKey: person(p.author), targetRef: p.targetRef }, ev, 'pr', person(p.author));
    if (p.closedAt !== null && p.status !== 'active') {
      const approvedBy = (f.approvers.get(prRef(p.repoId, p.prId)) ?? []).map((g) => keys.identity(org, g)).sort();
      const closeEv: EvidenceRef[] = [{ source: 'pullRequest', ref: `pr:${p.repoId}:${p.prId}`, at: p.closedAt }];
      const by = person(p.closedBy) ?? person(p.author);
      if (p.status === 'completed') {
        push('pr_completed', key, projectKey(p.projectId), 'pr', p.closedAt, { repoKey: repoKey(p.repoId), ...(approvedBy.length ? { approvedBy } : {}) }, closeEv, 'pr', by);
      } else {
        push('pr_abandoned', key, projectKey(p.projectId), 'pr', p.closedAt, { repoKey: repoKey(p.repoId) }, closeEv, 'pr', by);
      }
    }
  }

  // ---- Observations (02 §6): undated updates, and current relations with no dated link now ----
  const obs = new Map<string, { kind: Observation['kind']; op: 'present' | 'removed'; from: CanonicalKey; to: CanonicalKey; confidence: Observation['confidence']; itemId: number }>();
  const addObs = (kind: 'link_parent' | 'link_pr' | 'link_dependency', op: 'present' | 'removed', from: CanonicalKey, to: CanonicalKey, confidence: Observation['confidence'], itemId: number) => {
    const obsKey = `obs:${kind}:${op}:${from}:${to}`;
    const had = obs.get(obsKey);
    obs.set(obsKey, { kind, op, from, to, itemId, confidence: had?.confidence === 'unknown' ? 'unknown' : confidence });
  };
  for (const o of undated) {
    const from = (typeof o.from === 'number' ? wi(o.from) : o.from) as CanonicalKey;
    addObs(o.kind, o.present ? 'present' : 'removed', from, wi(o.to), 'unknown', o.kind === 'link_pr' ? o.to : (o.from as number));
  }
  const datedNow = (kind: DatedLink['kind'], from: number | string, to: number) =>
    links.some((l) => l.kind === kind && l.from === from && l.to === to && l.addedAt <= f.now && (l.removedAt === null || l.removedAt > f.now));
  const removedUndated = new Set(undated.filter((o) => !o.present).map((o) => `${o.kind}|${o.from}|${o.to}`));
  for (const [id, rels] of f.currentRelations) {
    for (const r of rels) {
      if (r.rel === 'parent' && r.target.kind === 'wi' && !datedNow('parent', id, r.target.id) && !removedUndated.has(`link_parent|${id}|${r.target.id}`)) {
        addObs('link_parent', 'present', wi(id), wi(r.target.id), 'observed_only', id);
      } else if (r.rel === 'pr' && r.target.kind === 'pr') {
        const pk = prKey(r.target.repoId, r.target.prId);
        if (!datedNow('pr', pk, id)) addObs('link_pr', 'present', pk, wi(id), 'observed_only', id);
      }
    }
  }

  // ---- Membership (03 §4): the bundle's items and PRs ----
  // A Feature counts if it was a member at any time from historyFrom on: in the area (or under the
  // Epic) at historyFrom, or moved there later.
  const historyFrom = f.range.endUtc - BACKFILL_MAX_WEEKS * 7 * 86_400_000;
  const features = new Set<number>();
  // A sprint (decided 2026-10-07): its roots are the Stories and Bugs in it at any moment of its
  // window, in one of its pods (ever); their Tasks and ancestors follow, as below.
  const sprint = f.sectorTarget.kind === 'sprint' ? f.sectorTarget : null;
  for (const [id, revs] of f.revisions) {
    if (latest(id)?.projectId !== f.project.projectId) continue;
    if (sprint) {
      const k = kindOf(id);
      if (k !== 'story' && k !== 'bug') continue;
      const sorted = [...revs].sort((a, b) => a.rev - b.rev);
      const inPod = sorted.some((r) => sprint.pods.some((p) => under(r.areaPath, p)));
      if (inPod && inSprint(sorted.map((r) => ({ t: r.changedAt, path: r.iterationPath ?? '' })), sprint)) features.add(id);
      continue;
    }
    if (kindOf(id) !== 'feature') continue;
    if (f.sectorTarget.kind === 'area') {
      const root = f.sectorTarget.path;
      const sorted = [...revs].sort((a, b) => a.rev - b.rev);
      const before = sorted.filter((r) => r.changedAt < historyFrom).at(-1);
      if ([before, ...sorted.filter((r) => r.changedAt >= historyFrom)].some((r) => r && under(r.areaPath, root))) features.add(id);
    } else if (f.sectorTarget.kind === 'epic') {
      const epic = f.sectorTarget.id;
      if (links.some((l) => l.kind === 'parent' && l.from === id && l.to === epic && (l.removedAt === null || l.removedAt >= historyFrom))) features.add(id);
    }
  }
  const parentLinks = links.filter((l) => l.kind === 'parent') as (DatedLink & { from: number })[];
  const presentParentObs = [...obs.values()].filter((o) => o.kind === 'link_parent' && o.op === 'present');
  const items = new Set(features);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of parentLinks) {
      if (items.has(l.to) && !items.has(l.from) && kindOf(l.from) !== 'feature') { items.add(l.from); grew = true; }
    }
    for (const o of presentParentObs) {
      const child = Number(o.from.split(':').pop());
      const parent = Number(o.to.split(':').pop());
      if (items.has(parent) && !items.has(child)) { items.add(child); grew = true; }
    }
  }
  // Parent chains up to and including Epics (and the sector's own Epic).
  const ancestors = (id: number, seen: Set<number>) => {
    for (const l of parentLinks) if (l.from === id && !seen.has(l.to)) { seen.add(l.to); ancestors(l.to, seen); }
  };
  const anc = new Set<number>();
  for (const id of items) ancestors(id, anc);
  if (f.sectorTarget.kind === 'epic') anc.add(f.sectorTarget.id);
  for (const id of anc) if (f.revisions.has(id)) items.add(id);

  const itemKeys = new Set<CanonicalKey>([...items].map(wi));
  // A PR linked from a work item but unreadable now (abandoned and gone, a deleted or forbidden repo)
  // has no record: it's left out, with its links (decided 2026-10-07; TODO(slice 7): missing data).
  const known = (k: CanonicalKey) => prByKey.has(k);
  const prSet = new Set<CanonicalKey>();
  for (const l of links) if (l.kind === 'pr' && items.has(l.to) && known(l.from as CanonicalKey)) prSet.add(l.from as CanonicalKey);
  for (const o of obs.values()) if (o.kind === 'link_pr' && o.op === 'present' && itemKeys.has(o.to) && known(o.from)) prSet.add(o.from);
  const scopeRepos = new Set([...prSet].map((k) => prByKey.get(k)?.repoId).filter((r): r is Guid => !!r));
  const linkedEver = new Set<CanonicalKey>([
    ...links.filter((l) => l.kind === 'pr').map((l) => l.from as CanonicalKey),
    ...[...obs.values()].filter((o) => o.kind === 'link_pr').map((o) => o.from),
  ]);
  const unlinked: CanonicalKey[] = [];
  for (const r of sprint ? [] : f.reconciled) { // a sprint has no unlinked reconcile
    const key = prKey(r.repoId, r.prId);
    const p = prByKey.get(key);
    if (!p || r.hasWorkItems || linkedEver.has(key) || p.projectId !== f.project.projectId || !scopeRepos.has(p.repoId)) continue;
    unlinked.push(key);
    prSet.add(key);
  }

  // ---- The bundle ----
  const unknownPrLink = (e: AnyTimelineEvent) => (e.kind === 'link_pr_added' || e.kind === 'link_pr_removed') && !known(e.payload.prKey);
  const bundleEvents = events
    .filter((e) => e.occurredAt < f.range.endUtc && (itemKeys.has(e.entityKey) || prSet.has(e.entityKey)) && !unknownPrLink(e))
    .sort(compareEvents);
  const people = new Set<CanonicalKey>();
  for (const e of bundleEvents) {
    const p = e.payload as Record<string, unknown>;
    for (const v of [p.assigneeKey, p.authorKey, e.changedBy, e.kind === 'wi_assignee_changed' ? p.from : null, e.kind === 'wi_assignee_changed' ? p.to : null]) {
      if (typeof v === 'string' && v.startsWith('id:')) people.add(v as CanonicalKey);
    }
    if (Array.isArray(p.approvedBy)) for (const v of p.approvedBy as CanonicalKey[]) people.add(v);
  }
  const byKey = <T extends { key: string }>(a: T, b: T) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const repoFacts = new Map(f.repos.map((r) => [r.repoId, r]));
  const bundleRepos = new Set([...prSet].map((k) => prByKey.get(k)?.repoId).filter((r): r is Guid => !!r));
  const endUnknown = new Set(undated.filter((o) => !o.present).map((o) => `${o.kind.slice(5)}|${o.from}|${o.to}`));
  const keyOf = (v: number | string) => (typeof v === 'number' ? wi(v) : (v as CanonicalKey));
  const derivedLinks: DerivedLink[] = links
    .filter((l) => (l.kind === 'pr' ? prSet.has(l.from as CanonicalKey) : itemKeys.has(keyOf(l.from))) && itemKeys.has(wi(l.to)))
    .map((l) => ({
      kind: l.kind, fromKey: keyOf(l.from), toKey: wi(l.to), validFrom: l.addedAt, validTo: l.removedAt,
      endUnknown: l.removedAt === null && endUnknown.has(`${l.kind}|${l.from}|${l.to}`),
    }));
  // B4: the team board's columns and where each item sat in them (never read by Solar).
  const board = boardOf(f.boardColumns, [...items].flatMap((id) => placementsOf(wi(id), (f.revisions.get(id) ?? []).slice().sort((a, b) => a.rev - b.rev)
    .map((r) => ({ changedAt: r.changedAt, ...(r.boardColumn && (f.boardOwns?.(r.areaPath) ?? true) ? { column: r.boardColumn } : {}), ...(r.boardColumn && r.boardColumnDone && (f.boardOwns?.(r.areaPath) ?? true) ? { done: true } : {}) }))))
    .filter((p) => p.at < f.range.endUtc));
  const history: ScopeHistory = {
    schemaVersion: 1,
    derivationVersion: DERIVATION_VERSION,
    scope: { orgKey: org, projectKey: projectKey(f.project.projectId), sector: f.sector },
    range: { ...f.range },
    coverage: { syncedAt: f.coverage.syncedAt, historyFrom, partial: f.coverage.partial, notes: [...f.coverage.notes], ...(f.coverage.stale?.length ? { stale: [...f.coverage.stale].sort() } : {}), ...(f.coverage.missing?.length ? { missing: [...f.coverage.missing].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)) } : {}) },
    entities: {
      projects: [{ key: projectKey(f.project.projectId), name: f.project.name, adoUrl: f.project.adoUrl }],
      workItems: [...items].map((id) => ({ key: wi(id), type: typeOf(id), adoUrl: f.workItemUrl?.(id) ?? '' })).sort(byKey),
      repos: [...bundleRepos].map((r) => ({ key: repoKey(r), name: repoFacts.get(r)?.name ?? r, adoUrl: repoFacts.get(r)?.adoUrl ?? '', ...(repoFacts.get(r)?.run ? { run: { ...repoFacts.get(r)!.run!, ...(repoFacts.get(r)!.runReadAt !== undefined ? { readAt: repoFacts.get(r)!.runReadAt } : {}) } } : {}) })).sort(byKey),
      prs: [...prSet].map((k) => { const p = prByKey.get(k)!; return { key: k, repoKey: repoKey(p.repoId), adoUrl: p.adoUrl, ...(p.stats && Object.keys(p.stats).length ? { stats: p.stats } : {}) }; }).sort(byKey),
      captains: [...people].map((key) => {
        const id = key.split(':').pop()!;
        const ident = f.identities.get(id);
        const displayName = plainName(ident?.displayName ?? 'Unknown');
        const profile = f.profiles?.get(id);
        const shipSeed = profile?.shipSeed ?? shipSeedFor(org, id);
        const callSign = profile?.callSign ?? callSignFor(displayName, shipSeed);
        return { key, displayName, shipSeed, callSign, ...(ident?.avatar ? { avatar: ident.avatar } : {}) };
      }).sort(byKey),
    },
    events: bundleEvents,
    observations: [...obs.entries()]
      .filter(([, o]) => (o.kind === 'link_pr' ? prSet.has(o.from) : itemKeys.has(o.from)) && itemKeys.has(o.to))
      .map(([obsKey, o]): Observation => ({
        obsKey, kind: o.kind, op: o.op, fromKey: o.from, toKey: o.to, confidence: o.confidence, observedAt: f.range.endUtc,
        // Observations cite the item's current state, not one update (03 §3): `u0`, undated.
        evidence: [{ source: 'update', ref: `wi:${o.itemId}:u0`, at: null }],
      }))
      .sort((a, b) => (a.obsKey < b.obsKey ? -1 : a.obsKey > b.obsKey ? 1 : 0)),
    unlinkedPrs: unlinked.sort(),
    stateMapping: f.mapping,
    ...(board ? { board } : {}),
  };
  return { history, links: derivedLinks };
}
