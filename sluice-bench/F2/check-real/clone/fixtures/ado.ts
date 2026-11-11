// 03 §8 — `toAdoPayloads(scenario)`: the scenario as a fake ADO org. It answers the REST calls the
// client makes (04 §§2–3, 6a) with ADO-shaped JSON built from the same simulation `toHistory` reads,
// so `ingest(toAdoPayloads(s)) ≡ toHistory(s)` proves the real ingest path (AC-27). Invented data
// only (INV-18). It evaluates only the WIQL the client writes (src/main/sync/wiql.ts), not WIQL in
// general.
import type { StateMapping } from '@shared/contracts/history';
import type { UtcMs } from '@shared/contracts/keys';
import type { AdoRequest, AdoResponse } from '@shared/contracts/transport';
import { fnv1a32 } from '@shared/hash';
import { boardColumnFacts, FIXTURE_ORG, guidFromName, teamsOfProject, reviewVotes, simulate, type AdoRelation, type AdoRevision, type Scenario } from './dsl';

export const FAKE_ORG_URL = 'https://dev.azure.com/fixture-org';
/** The PR artifact URL's separator ADO writes. */
const SEP = '%2F';

export interface FakeAdo {
  handle(req: AdoRequest): AdoResponse;
  /** The fake's "now": every op in the scenario has happened. */
  now: UtcMs;
}

const ok = (body: unknown): AdoResponse => ({ status: 200, headers: { 'content-type': 'application/json' }, body });
const notFound = (): AdoResponse => ({ status: 404, headers: { 'content-type': 'application/json' }, body: { message: 'Not found' } });
const iso = (t: UtcMs) => new Date(t).toISOString();

export interface FakeOptions {
  /** Answer VS402337 when a flat query matches more than this many items (ADO's 20,000-result cap, scaled down for tests). */
  wiqlCap?: number;
  /** Refuse the `EVER` operator, as an older ADO would, so the ASOF fallback can be checked. */
  noEver?: boolean;
  /** Pictures ADO won't give this token, by route (src/main/avatars/strategies.ts): answered 401. */
  avatarDenied?: ('member' | 'graph' | 'web')[];
  /** B5: the revisions feed answers 404, as an ADO without it would (the client falls back to per-item reads). */
  noFeed?: boolean;
  /** B5: the feed's page size, whatever `$maxPageSize` asks (ADO decides its own). */
  feedPage?: number;
  /** 23 E4: the person the token belongs to (`authenticatedUser`), by scenario handle. Default: someone not in any scenario. */
  me?: string;
}

export function toAdoPayloads(s: Scenario, mapping: StateMapping, opts: FakeOptions = {}): FakeAdo {
  const u = simulate(s, mapping);
  const org = FAKE_ORG_URL;
  const projectId = (name: string) => guidFromName('project', name);
  const repoId = (project: string, name: string) => guidFromName(`repo:${project}`, name);
  const personId = (h: string) => guidFromName('person', h);
  const projectByRef = (ref: string) => s.projects.find((p) => p.name === decodeURIComponent(ref) || projectId(p.name) === ref.toLowerCase());
  const now = Math.max(s.range.endUtc, ...s.ops.map((o) => o.t));

  const identity = (h: string | null) => {
    if (!h) return undefined;
    const id = personId(h);
    return { id, displayName: s.people.get(h) ?? h, uniqueName: `${h}@fixture.example`, imageUrl: `${org}/_apis/GraphProfile/MemberAvatars/fx.${id}` };
  };
  const wiUrl = (id: number) => `${org}/_apis/wit/workItems/${id}`;
  const prUrl = (prId: number) => {
    const p = u.ado.prs.get(prId)!;
    return `vstfs:///Git/PullRequestId/${projectId(p.project)}${SEP}${repoId(p.project, p.repo)}${SEP}${prId}`;
  };
  const relJson = (r: AdoRelation) =>
    r.rel === 'ArtifactLink'
      ? { rel: 'ArtifactLink', url: prUrl(r.pr), attributes: { name: 'Pull Request' } }
      : { rel: r.rel, url: wiUrl(r.wi), attributes: { isLocked: false, name: r.rel.endsWith('Reverse') ? 'Parent' : 'Child' } };
  const fieldsOf = (id: number, r: AdoRevision) => ({
    'System.Id': id, 'System.Rev': r.rev, 'System.WorkItemType': r.fields.type, 'System.Title': r.fields.title,
    'System.State': r.fields.state, 'System.AreaPath': r.fields.area, 'System.TeamProject': r.fields.project,
    ...(r.fields.iteration ? { 'System.IterationPath': r.fields.iteration } : {}),
    ...(r.fields.column ? { 'System.BoardColumn': r.fields.column, 'System.BoardColumnDone': r.fields.columnDone === true } : {}),
    'System.ChangedDate': iso(r.t),
    'System.CreatedDate': iso(revisionsOf(id)[0]?.t ?? r.t),
    ...(r.by ? { 'System.ChangedBy': identity(r.by) } : {}),
    ...(r.fields.assignee ? { 'System.AssignedTo': identity(r.fields.assignee) } : {}),
  });
  const revisionsOf = (id: number) => u.ado.revisions.get(id) ?? [];
  const asOf = (id: number, t: UtcMs) => revisionsOf(id).filter((r) => r.t <= t).at(-1);

  // The current relations: every update replayed, plus links seen only in the current state.
  const current = new Map<number, AdoRelation[]>();
  const relKey = (r: AdoRelation) => (r.rel === 'ArtifactLink' ? `pr:${r.pr}` : `${r.rel}:${r.wi}`);
  for (const [id, ups] of u.ado.updates) {
    const set = new Map<string, AdoRelation>();
    for (const up of ups) {
      for (const r of up.added) set.set(relKey(r), r);
      for (const r of up.removed) set.delete(relKey(r));
    }
    current.set(id, [...set.values()]);
  }
  const undatedAdds = new Map<number, AdoRelation[]>();
  for (const o of u.observations) {
    if (!o.present) continue; // undated removals are already updates (dsl.ts)
    const [item, rel]: [number, AdoRelation] = o.kind === 'link_pr' ? [o.to, { rel: 'ArtifactLink', pr: o.from }] : [o.from, { rel: 'System.LinkTypes.Hierarchy-Reverse', wi: o.to }];
    current.set(item, [...(current.get(item) ?? []).filter((r) => relKey(r) !== relKey(rel)), rel]);
    if (o.kind === 'link_parent') {
      const back: AdoRelation = { rel: 'System.LinkTypes.Hierarchy-Forward', wi: o.from };
      current.set(o.to, [...(current.get(o.to) ?? []).filter((r) => relKey(r) !== relKey(back)), back]);
    }
    // An undated update that added it (confidence 'unknown'); 'observed_only' is current state alone.
    if (o.confidence === 'unknown') undatedAdds.set(item, [...(undatedAdds.get(item) ?? []), rel]);
  }
  const childrenOf = (id: number) => (current.get(id) ?? []).filter((r) => r.rel === 'System.LinkTypes.Hierarchy-Forward').map((r) => (r as { wi: number }).wi);

  // Updates as ADO shapes them. Field changes carry System.ChangedDate; relation-only updates carry it
  // on odd IDs only, so both 04 §4 rules run (the even ones take their revision's time). revisedDate
  // is the next revision's time, or 9999-01-01 for the latest: never an event time (AC-29).
  const updatesOf = (id: number) => {
    const revs = revisionsOf(id);
    const out = (u.ado.updates.get(id) ?? []).map((up) => {
      const i = up.rev === null ? -1 : revs.findIndex((r) => r.rev === up.rev);
      const next = i >= 0 ? revs[i + 1] : undefined;
      const relational = up.added.length > 0 || up.removed.length > 0;
      const dated = up.t !== null && (!relational || up.id % 2 === 1);
      return {
        id: up.id, workItemId: id, ...(up.rev !== null ? { rev: up.rev } : {}),
        revisedDate: next ? iso(next.t) : '9999-01-01T00:00:00Z',
        ...(dated ? { fields: { 'System.ChangedDate': { ...(i > 0 ? { oldValue: iso(revs[i - 1]!.t) } : {}), newValue: iso(up.t!) } } } : {}),
        ...(relational ? { relations: { ...(up.added.length ? { added: up.added.map(relJson) } : {}), ...(up.removed.length ? { removed: up.removed.map(relJson) } : {}) } } : {}),
      };
    });
    let seq = 20_000;
    for (const r of undatedAdds.get(id) ?? []) out.push({ id: ++seq, workItemId: id, revisedDate: '9999-01-01T00:00:00Z', relations: { added: [relJson(r)] } });
    return out;
  };

  // Area nodes: the scenario's paths, with any missing parents filled in. Node paths read
  // `\Project\Area\…`; work items' AreaPath reads `Project\…`.
  const areaTree = (project: string) => {
    const p = projectByRef(project)!;
    const ids = new Map<string, number>(p.areas.map((a) => [a.path, a.nodeId]));
    const paths = new Set<string>([p.name]);
    for (const a of p.areas) {
      const parts = a.path.split('\\');
      for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('\\'));
    }
    const nodeId = (path: string) => ids.get(path) ?? 900_000 + (fnv1a32(`area|${path}`) % 99_999);
    const node = (path: string, depth: number): unknown => {
      const kids = [...paths].filter((x) => x.startsWith(`${path}\\`) && x.split('\\').length === path.split('\\').length + 1).sort();
      const rest = path.split('\\').slice(1);
      return {
        id: nodeId(path), identifier: guidFromName('area', path), name: path.split('\\').pop(), structureType: 'area',
        path: `\\${[p.name, 'Area', ...rest].join('\\')}`, hasChildren: kids.length > 0,
        ...(depth > 0 && kids.length ? { children: kids.map((k) => node(k, depth - 1)) } : {}),
      };
    };
    return node(p.name, 99);
  };

  // Teams (slice 7): the scenario's own, or ADO's default project team, which owns the whole area tree
  // and runs every dated sprint.
  const teamsOf = teamsOfProject;

  // Iteration nodes (decided 2026-10-07): the scenario's sprints with their dates, under the project
  // root. Node paths read `\Project\Iteration\…`; work items' IterationPath reads `Project\…`.
  const iterationTree = (project: string) => {
    const p = projectByRef(project)!;
    const its = p.iterations ?? [];
    const leaf = (i: (typeof its)[number]) => ({
      id: i.nodeId, identifier: guidFromName('iteration', i.path), name: i.path.split('\\').pop(), structureType: 'iteration',
      path: `\\${[p.name, 'Iteration', ...i.path.split('\\').slice(1)].join('\\')}`, hasChildren: false,
      attributes: i.startUtc !== null && i.finishUtc !== null ? { startDate: iso(i.startUtc), finishDate: iso(i.finishUtc) } : {},
    });
    return {
      id: 800_000 + (fnv1a32(`iteration|${p.name}`) % 99_999), identifier: guidFromName('iteration', p.name), name: p.name, structureType: 'iteration',
      path: `\\${p.name}\\Iteration`, hasChildren: its.length > 0, ...(its.length ? { children: its.map(leaf) } : {}),
    };
  };

  const prJson = (prId: number) => {
    const p = u.ado.prs.get(prId)!;
    return {
      pullRequestId: prId, title: p.title, status: p.status, creationDate: iso(p.created),
      ...(p.closed !== null ? { closedDate: iso(p.closed) } : {}),
      createdBy: identity(p.author), ...(p.closedBy ? { closedBy: identity(p.closedBy) } : {}),
      targetRefName: p.target, sourceRefName: `refs/heads/pr-${prId}`,
      // B1: a push moves it (a PR that gives no pushes carries none).
      ...(p.stats?.pushes !== undefined ? { lastMergeSourceCommit: { commitId: `c${prId}-${p.stats.pushes}` } } : {}),
      repository: { id: repoId(p.project, p.repo), name: p.repo, project: { id: projectId(p.project), name: p.project } },
    };
  };
  const linkedItems = (prId: number) => [...current].filter(([, rels]) => rels.some((r) => r.rel === 'ArtifactLink' && r.pr === prId)).map(([id]) => id);

  // ---- WIQL: only the client's own templates ----
  const wiql = (project: string, q: string, top: number): AdoResponse => {
    const p = projectByRef(project);
    if (!p) return notFound();
    const asof = /ASOF '([^']+)'/.exec(q);
    const t = asof ? Date.parse(asof[1]!) : now;
    const items = (pred: (id: number, r: AdoRevision) => boolean) =>
      [...u.ado.revisions.keys()].sort((a, b) => a - b).flatMap((id) => {
        const r = asOf(id, t);
        return r && r.fields.project === p.name && pred(id, r) ? [{ id, url: wiUrl(id) }] : [];
      });
    const type = /\[System\.WorkItemType\] = '([^']+)'/.exec(q)?.[1];
    const under = /\[System\.AreaPath\] UNDER '((?:[^']|'')+)'/.exec(q)?.[1]?.replace(/''/g, "'");
    const contains = /\[System\.Title\] CONTAINS '((?:[^']|'')*)'/.exec(q)?.[1]?.replace(/''/g, "'");
    if (/FROM WorkItemLinks/.test(q)) {
      const sources = (/\[Source\]\.\[System\.Id\] (?:= (\d+)|IN \(([\d, ]+)\))/.exec(q) ?? []).slice(1).filter(Boolean).join(',').split(',').map((x) => Number(x.trim()));
      const recursive = /MODE \(Recursive\)/.test(q);
      const targetType = /\[Target\]\.\[System\.WorkItemType\] = '([^']+)'/.exec(q)?.[1];
      const rels: unknown[] = sources.map((id) => ({ rel: null, source: null, target: { id, url: wiUrl(id) } }));
      const walk = (id: number, seen: Set<number>) => {
        for (const c of childrenOf(id).sort((a, b) => a - b)) {
          if (seen.has(c) || (targetType && u.itemType.get(c) !== targetType)) continue;
          seen.add(c);
          rels.push({ rel: 'System.LinkTypes.Hierarchy-Forward', source: { id, url: wiUrl(id) }, target: { id: c, url: wiUrl(c) } });
          if (recursive) walk(c, seen);
        }
      };
      const seen = new Set(sources);
      for (const id of sources) walk(id, seen);
      return ok({ queryType: recursive ? 'tree' : 'oneHop', asOf: iso(t), workItemRelations: rels });
    }
    const types = () => (/\[System\.WorkItemType\] IN \(([^)]*)\)/.exec(q)?.[1] ?? '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
    const podsOf = () => [...q.matchAll(/\[System\.AreaPath\] UNDER '((?:[^']|'')+)'/g)].map((x) => x[1]!.replace(/''/g, "'"));
    const inPod = (area: string, pods: string[]) => !pods.length || pods.some((pod) => area === pod || area.startsWith(`${pod}\\`));
    // Ever in a sprint (or one of its child iterations, ORed: slice 7), and either still under a pod
    // (sprintItemsEver) or ever in one of the pod's areas (podItemsEver). ADO judges each EVER on its
    // own field, over every revision.
    const everAll = (field: string) => [...q.matchAll(new RegExp(`\\[System\\.${field}\\] EVER '((?:[^']|'')+)'`, 'g'))].map((x) => x[1]!.replace(/''/g, "'"));
    const everIterations = everAll('IterationPath');
    const everAreas = everAll('AreaPath');
    const everIteration = everIterations[0];
    if (everIteration !== undefined) {
      if (opts.noEver) return { status: 400, headers: {}, body: { message: "VS403096: The operator 'EVER' is not supported.", typeKey: 'WorkItemTrackingQueryOperatorException' } };
      const want = types();
      const pods = podsOf();
      let hits = [...u.ado.revisions.keys()].sort((a, b) => a - b).flatMap((id) => {
        const revs = revisionsOf(id);
        const last = revs.at(-1);
        if (!last || last.fields.project !== p.name) return [];
        if (want.length && !want.includes(last.fields.type)) return [];
        if (everAreas.length ? !revs.some((r) => everAreas.includes(r.fields.area)) : !inPod(last.fields.area, pods)) return [];
        return revs.some((r) => everIterations.includes(r.fields.iteration ?? '')) ? [{ id, url: wiUrl(id) }] : [];
      });
      if (/ORDER BY \[System\.ChangedDate\] DESC/.test(q)) hits = [...hits].sort((a, b) => (revisionsOf(b.id).at(-1)?.t ?? 0) - (revisionsOf(a.id).at(-1)?.t ?? 0) || b.id - a.id);
      return ok({ queryType: 'flat', asOf: iso(now), workItems: hits.slice(0, top) });
    }
    // A sprint's members (wiql.ts sprintItems): under the iteration (child iterations too, slice 7), of
    // these types, under any pod.
    const iteration = /\[System\.IterationPath\] UNDER '((?:[^']|'')+)'/.exec(q)?.[1]?.replace(/''/g, "'");
    if (iteration !== undefined) {
      const want = types();
      const pods = podsOf();
      let hits = items((_id, r) => (r.fields.iteration === iteration || (r.fields.iteration ?? '').startsWith(`${iteration}\\`)) && (!want.length || want.includes(r.fields.type)) && inPod(r.fields.area, pods));
      if (/ORDER BY \[System\.ChangedDate\] DESC/.test(q)) hits = [...hits].sort((a, b) => (asOf(b.id, t)?.t ?? 0) - (asOf(a.id, t)?.t ?? 0) || b.id - a.id);
      return ok({ queryType: 'flat', asOf: iso(t), workItems: hits.slice(0, top) });
    }
    const root = under;
    const since = /\[System\.ChangedDate\] >= @Today - (\d+)/.exec(q);
    const before = /\[System\.ChangedDate\] < '([^']+)'/.exec(q);
    const sinceT = since ? now - Number(since[1]) * 86_400_000 : -Infinity;
    const beforeT = before ? Date.parse(before[1]!) : Infinity;
    const changed = (id: number) => asOf(id, t)?.t ?? 0;
    let match = items((id, r) => (!type || r.fields.type === type) && (!root || r.fields.area === root || r.fields.area.startsWith(`${root}\\`))
      && (contains === undefined || r.fields.title.toLowerCase().includes(contains.toLowerCase())) && r.t >= sinceT && r.t < beforeT);
    // ADO's result cap applies to what matches, whatever $top asks for.
    if (opts.wiqlCap !== undefined && match.length > opts.wiqlCap) {
      return { status: 400, headers: {}, body: { message: `VS402337: The number of work items returned exceeds the size limit of ${opts.wiqlCap}. Change the query to return fewer items.`, typeKey: 'WorkItemTrackingQueryResultSizeLimitExceededException' } };
    }
    if (/ORDER BY \[System\.ChangedDate\] DESC/.test(q)) match = [...match].sort((a, b) => changed(b.id) - changed(a.id) || b.id - a.id);
    return ok({ queryType: 'flat', asOf: iso(t), workItems: match.slice(0, top) });
  };

  const path = (url: URL) => url.pathname.replace(/^\/fixture-org/, '');
  const page = <T>(all: T[], url: URL) => {
    const top = Number(url.searchParams.get('$top') ?? 200);
    const skip = Number(url.searchParams.get('$skip') ?? 0);
    const value = all.slice(skip, skip + top);
    return ok({ count: value.length, value });
  };

  const pictureOf = (personKey: string | undefined) => {
    const handleName = [...s.people.keys()].find((h) => personId(h) === personKey);
    const data = handleName ? s.avatars.get(handleName) : undefined;
    const parsed = data ? /^data:([^;]+);base64,(.*)$/.exec(data) : null;
    return parsed ? { type: parsed[1]!, b64: parsed[2]! } : null;
  };
  const refused = (): AdoResponse => ({ status: 401, headers: {}, body: null });

  function handle(req: AdoRequest): AdoResponse {
    const url = new URL(req.url);
    // The identity host (Graph): Avatars - Get, as JSON with the picture in base64.
    const graph = url.origin === 'https://vssps.dev.azure.com' ? /^\/fixture-org\/_apis\/graph\/Subjects\/fx\.([0-9a-f-]+)\/avatars$/.exec(url.pathname) : null;
    if (graph) {
      if (opts.avatarDenied?.includes('graph')) return refused();
      const pic = pictureOf(graph[1]);
      return pic ? ok({ size: 'medium', value: pic.b64, isAutoGenerated: false }) : ok({ size: 'medium', value: '', isAutoGenerated: true });
    }
    const web = url.origin === new URL(org).origin && url.pathname === '/fixture-org/_api/_common/identityImage' ? url.searchParams.get('id') : null;
    if (web) {
      if (opts.avatarDenied?.includes('web')) return refused();
      const pic = pictureOf(web);
      return pic ? { status: 200, headers: { 'content-type': pic.type }, body: Uint8Array.from(Buffer.from(pic.b64, 'base64')) } : notFound();
    }
    if (url.origin !== new URL(org).origin || !url.pathname.startsWith('/fixture-org/')) return notFound();
    const p = path(url);
    let m: RegExpExecArray | null;
    if (p === '/_apis/connectionData') {
      return ok({ instanceId: FIXTURE_ORG, authenticatedUser: { id: personId(opts.me ?? 'fixture-viewer'), providerDisplayName: (opts.me && s.people.get(opts.me)) || 'Fixture Viewer' } });
    }
    if (p === '/_apis/projects') {
      // Paged like ADO ($top/$skip), so a large org (crowded-org's 188) takes several pages.
      return page(s.projects.map((x) => ({ id: projectId(x.name), name: x.name, state: 'wellFormed', visibility: 'private' })), url);
    }
    if ((m = /^\/_apis\/GraphProfile\/MemberAvatars\/fx\.([0-9a-f-]+)$/.exec(p))) {
      if (opts.avatarDenied?.includes('member')) return refused();
      const pic = pictureOf(m[1]);
      if (!pic) return notFound();
      return { status: 200, headers: { 'content-type': pic.type }, body: Uint8Array.from(Buffer.from(pic.b64, 'base64')) };
    }
    if (p === '/_apis/wit/wiql' && req.method === 'POST') {
      // Org-wide: only the client's recent-work template (src/main/sync/wiql.ts myRecentWork). @Me is
      // the scenario's first person; @Today is the fake's now.
      const q = String((req.body as { query?: string }).query ?? '');
      const days = Number(/@Today - (\d+)/.exec(q)?.[1] ?? 90);
      if (!/@Me/.test(q)) return { status: 400, headers: {}, body: { message: 'The fake only answers the recent-work query org-wide' } };
      const me = [...s.people.keys()][0];
      const since = now - days * 86_400_000;
      const hits = [...u.ado.revisions].flatMap(([id, revs]) => {
        const r = revs.at(-1)!;
        return r.t >= since && (r.by === me || r.fields.assignee === me) ? [{ id, t: r.t }] : [];
      }).sort((a, b) => b.t - a.t || a.id - b.id);
      const top = Number(url.searchParams.get('$top') ?? 20_000);
      return ok({ queryType: 'flat', workItems: hits.slice(0, top).map((h) => ({ id: h.id, url: wiUrl(h.id) })) });
    }
    if (p === '/_apis/wit/workitemsbatch' && req.method === 'POST') {
      const body = req.body as { ids?: number[] };
      const value = (body.ids ?? []).map((id) => {
        const r = revisionsOf(id).at(-1);
        if (!r) return null; // errorPolicy Omit: a missing item is a null, not a failure
        return { id, rev: r.rev, fields: fieldsOf(id, r), relations: (current.get(id) ?? []).map(relJson), url: wiUrl(id) };
      });
      return ok({ count: value.length, value });
    }
    if ((m = /^\/_apis\/wit\/workItems\/(\d+)\/(revisions|updates)$/.exec(p))) {
      const id = Number(m[1]);
      if (!u.ado.revisions.has(id)) return notFound();
      return m[2] === 'revisions' ? page(revisionsOf(id).map((r) => ({ id, rev: r.rev, fields: fieldsOf(id, r) })), url) : page(updatesOf(id), url);
    }
    if ((m = /^\/_apis\/git\/repositories\/([0-9a-f-]+)\/pullRequests\/(\d+)(\/reviewers|\/threads|\/workitems|\/iterations|\/iterations\/\d+\/changes)?$/i.exec(p))) {
      const prId = Number(m[2]);
      const pr = u.ado.prs.get(prId);
      if (!pr || repoId(pr.project, pr.repo) !== m[1]!.toLowerCase()) return notFound();
      if (!m[3]) return ok(prJson(prId));
      if (m[3] === '/workitems') return ok({ count: linkedItems(prId).length, value: linkedItems(prId).map((id) => ({ id: String(id), url: wiUrl(id) })) });
      // B1: the reviewers' current votes (an approver at 10 unless the scenario says otherwise).
      const votes = reviewVotes(pr);
      if (m[3] === '/reviewers') return ok({ count: votes.size, value: [...votes].map(([h, vote]) => ({ ...identity(h), vote, isRequired: false })) });
      // A PR whose scenario gives no pushes refuses these two (the stat line then leaves them out).
      const pushes = pr.stats?.pushes;
      if (m[3] === '/iterations') {
        if (pushes === undefined) return notFound();
        const value = Array.from({ length: pushes }, (_, i) => ({ id: i + 1, createdDate: iso((pr.created ?? now) + 60_000 * (i + 1)) }));
        return ok({ count: value.length, value });
      }
      if (m[3].endsWith('/changes')) {
        const n = Number(/\/iterations\/(\d+)\//.exec(m[3])![1]);
        if (pushes === undefined || n < 1 || n > pushes || pr.stats?.files === undefined) return notFound();
        const top = Number(url.searchParams.get('$top') ?? 100);
        const skip = Number(url.searchParams.get('$skip') ?? 0);
        const all = Array.from({ length: pr.stats.files }, (_, i) => ({ changeTrackingId: i + 1, changeId: i + 1, changeType: 'edit', item: { path: `/src/file-${i + 1}.ts` } }));
        const entries = [{ changeId: 0, changeType: 'edit', item: { path: '/src', isFolder: true } }, ...all];
        return ok({ changeEntries: entries.slice(skip, skip + top), nextSkip: skip + top < entries.length ? skip + top : 0, nextTop: 0 });
      }
      // Each approval as a VoteUpdate thread, shortly before completion.
      const voters = pr.approvedBy;
      const voteThreads = voters.map((h, i) => ({
        id: i + 1, publishedDate: iso((pr.closed ?? now) - 60_000 * (voters.length - i)), isDeleted: false,
        properties: { CodeReviewThreadType: { $type: 'System.String', $value: 'VoteUpdate' }, CodeReviewVoteResult: { $type: 'System.String', $value: String(votes.get(h) ?? 10) }, CodeReviewVotedByTfId: { $type: 'System.String', $value: personId(h) } },
      }));
      // B1: threads people started, among the noise ADO also lists: a system thread, a deleted one, a ref update.
      const humans = Array.from({ length: pr.stats?.threads ?? 0 }, (_, i) => ({
        id: 100 + i, publishedDate: iso(pr.created + 3_600_000 * (i + 1)), isDeleted: false, properties: {},
        comments: [{ id: 1, commentType: 'text', content: 'A remark.' }],
      }));
      const noise = pr.stats?.threads === undefined ? [] : [
        { id: 90, publishedDate: iso(pr.created + 1000), isDeleted: false, properties: {}, comments: [{ id: 1, commentType: 'system', content: 'Policy status updated.' }] },
        { id: 91, publishedDate: iso(pr.created + 2000), isDeleted: true, properties: {}, comments: [{ id: 1, commentType: 'text', content: 'Gone.', isDeleted: true }] },
        { id: 92, publishedDate: iso(pr.created + 3000), isDeleted: false, properties: { CodeReviewThreadType: { $type: 'System.String', $value: 'RefUpdate' } }, comments: [{ id: 1, commentType: 'system', content: 'Updated the source branch.' }] },
      ];
      const all = [...voteThreads, ...noise, ...humans];
      return ok({ count: all.length, value: all });
    }
    // Teams and their cadences (slice 7): a project's teams, their Area Paths, and their sprints.
    if ((m = /^\/_apis\/projects\/([^/]+)\/teams$/.exec(p))) {
      const proj = projectByRef(decodeURIComponent(m[1]!));
      if (!proj) return notFound();
      return page(teamsOf(proj).map((t) => ({ id: guidFromName('team', `${proj.name}:${t.name}`), name: t.name, projectId: projectId(proj.name) })), url);
    }
    if ((m = /^\/([^/]+)\/([^/]+)\/_apis\/work\/(teamfieldvalues|teamsettings\/iterations)$/.exec(p))) {
      const proj = projectByRef(decodeURIComponent(m[1]!));
      const team = proj && teamsOf(proj).find((t) => guidFromName('team', `${proj.name}:${t.name}`) === decodeURIComponent(m![2]!) || t.name === decodeURIComponent(m![2]!));
      if (!proj || !team) return notFound();
      if (m[3] === 'teamfieldvalues') return ok({ field: { referenceName: 'System.AreaPath' }, defaultValue: team.areas[0] ?? null, values: team.areas.map((a) => ({ value: a, includeChildren: true })) });
      const its = (proj.iterations ?? []).filter((i) => team.iterations.includes(i.path));
      return ok({ count: its.length, value: its.map((i) => ({ id: guidFromName('iteration', i.path), name: i.path.split('\\').pop(), path: i.path, attributes: { startDate: i.startUtc !== null ? iso(i.startUtc) : null, finishDate: i.finishUtc !== null ? iso(i.finishUtc) : null } })) });
    }
    // Team boards (B4, 04 §3 boards): a project with a board serves its backlog levels (the requirement level is named
    // `board.level`, Stories by default) and that level's columns, by name; a project without one serves no levels.
    if ((m = /^\/([^/]+)\/([^/]+)\/_apis\/work\/(?:backlogs|boards\/([^/]+)\/columns)$/.exec(p))) {
      const proj = projectByRef(decodeURIComponent(m[1]!));
      const team = proj && teamsOf(proj).find((t) => t.id === decodeURIComponent(m![2]!) || t.name === decodeURIComponent(m![2]!));
      if (!proj || !team) return notFound();
      const level = proj.board?.level ?? 'Stories';
      if (m[3] === undefined) {
        return ok(proj.board ? { count: 4, value: [
          { id: 'Microsoft.EpicCategory', name: 'Epics', rank: 4, type: 'portfolio' }, { id: 'Microsoft.FeatureCategory', name: 'Features', rank: 3, type: 'portfolio' },
          { id: 'Microsoft.RequirementCategory', name: level, rank: 2, type: 'requirement' }, { id: 'Microsoft.TaskCategory', name: 'Tasks', rank: 1, type: 'task' },
        ] } : { count: 0, value: [] });
      }
      if (!proj.board || decodeURIComponent(m[3]) !== level) return notFound();
      const cols = boardColumnFacts(proj.board);
      return ok({ count: cols.length, value: cols.map((c, i) => ({
        id: guidFromName('column', `${proj.name}:${team.name}:${c.name}`), name: c.name, order: i + 1, columnType: c.type, isSplit: c.split, itemLimit: 0, description: '',
        stateMappings: Object.fromEntries((proj.board!.types ?? ['User Story', 'Bug']).map((t) => [t, Object.entries(proj.board!.byState).find(([, to]) => (typeof to === 'string' ? to : to.column) === c.name)?.[0] ?? ''])),
      })) });
    }
    // Project-scoped calls: /{project}/_apis/…
    if (!(m = /^\/([^/]+)(\/_apis\/.*)$/.exec(p))) return notFound();
    const proj = projectByRef(m[1]!);
    if (!proj) return notFound();
    const rest = m[2]!;
    // B5: the project-wide reporting feed (04 §5c): every revision of the project's items since `startDateTime`, oldest
    // first, in pages. The token is opaque and resumes after the last row; it comes back on the last page too, as ADO's does.
    if (rest === '/_apis/wit/reporting/workitemrevisions') {
      if (opts.noFeed) return notFound();
      const wanted = (url.searchParams.get('fields') ?? '').split(',').filter(Boolean);
      const since = Date.parse(url.searchParams.get('startDateTime') ?? '') || 0;
      const rows = [...u.ado.revisions].flatMap(([id, revs]) => revs.filter((r) => r.fields.project === proj.name && r.t >= since).map((r) => ({ id, r })))
        .sort((a, b) => a.r.t - b.r.t || a.id - b.id || a.r.rev - b.r.rev);
      // The token is the position of the last row served (time, id, rev), so a resumed request needs no start date.
      const tok = url.searchParams.get('continuationToken');
      let after: [number, number, number] | null = null;
      if (tok) {
        const parts = Buffer.from(tok, 'base64').toString().split(':');
        after = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
        if (parts[0] !== 'p' || after.some((x) => !Number.isFinite(x))) return { status: 400, headers: {}, body: { message: 'Bad continuation token' } };
      }
      const size = opts.feedPage ?? (Number(url.searchParams.get('$maxPageSize')) || 200);
      const left = after ? rows.filter(({ id, r }) => r.t > after![0] || (r.t === after![0] && (id > after![1] || (id === after![1] && r.rev > after![2])))) : rows;
      const chunk = left.slice(0, size);
      const keep = (f: Record<string, unknown>) => (wanted.length ? Object.fromEntries(Object.entries(f).filter(([k]) => wanted.includes(k) || k === 'System.Id' || k === 'System.Rev' || k === 'System.ChangedDate')) : f);
      const last = chunk.at(-1);
      return ok({
        values: chunk.map(({ id, r }) => ({ id, rev: r.rev, fields: keep(fieldsOf(id, r)) })),
        continuationToken: Buffer.from(last ? `p:${last.r.t}:${last.id}:${last.r.rev}` : (tok ? Buffer.from(tok, 'base64').toString() : `p:${since}:0:0`)).toString('base64'),
        isLastBatch: chunk.length >= left.length,
      });
    }
    if (rest === '/_apis/wit/classificationnodes/Areas') return ok(areaTree(proj.name));
    if (rest === '/_apis/wit/classificationnodes/Iterations') return ok(iterationTree(proj.name));
    if (rest === '/_apis/wit/wiql' && req.method === 'POST') return wiql(proj.name, String((req.body as { query?: string }).query ?? ''), Number(url.searchParams.get('$top') ?? 20_000));
    if (rest === '/_apis/git/repositories') {
      return ok({ count: proj.repos.length, value: proj.repos.map((r) => ({ id: repoId(proj.name, r), name: r, defaultBranch: 'refs/heads/main', project: { id: projectId(proj.name), name: proj.name } })) });
    }
    if (rest === '/_apis/build/builds') {
      // B2: the latest build of a repository on one branch. The fake keeps one run per repo, on the default branch.
      const rid = url.searchParams.get('repositoryId')?.toLowerCase();
      const repo = proj.repos.find((r) => repoId(proj.name, r) === rid);
      const run = repo ? u.ado.runs.get(`${proj.name}|${repo}`) : undefined;
      if (!run || url.searchParams.get('branchName') !== 'refs/heads/main' || url.searchParams.get('repositoryType') !== 'TfsGit') return ok({ count: 0, value: [] });
      const done = (result: string) => ({ status: 'completed', result, queueTime: iso(run.t - 120_000), startTime: iso(run.t - 60_000), finishTime: iso(run.t) });
      const build = run.state === 'passed' ? done('succeeded') : run.state === 'partly' ? done('partiallySucceeded') : run.state === 'failed' ? done('failed')
        : run.state === 'canceled' ? done('canceled')
          : run.state === 'running' ? { status: 'inProgress', queueTime: iso(run.t - 60_000), startTime: iso(run.t) }
            : { status: 'notStarted', queueTime: iso(run.t) };
      return ok({ count: 1, value: [{ id: 9000 + (fnv1a32(`${proj.name}|${repo}`) % 9000), buildNumber: '1', ...build, repository: { id: rid, type: 'TfsGit' }, sourceBranch: 'refs/heads/main' }] });
    }
    if (rest === '/_apis/git/pullrequests') {
      const repo = url.searchParams.get('searchCriteria.repositoryId')?.toLowerCase();
      const min = Date.parse(url.searchParams.get('searchCriteria.minTime') ?? '') || -Infinity;
      const max = Date.parse(url.searchParams.get('searchCriteria.maxTime') ?? '') || Infinity;
      const on = url.searchParams.get('searchCriteria.queryTimeRangeType') === 'closed' ? 'closed' : 'created';
      const all = [...u.ado.prs.values()]
        .filter((x) => x.project === proj.name && (!repo || repoId(x.project, x.repo) === repo))
        .filter((x) => { const t = on === 'closed' ? x.closed : x.created; return url.searchParams.has('searchCriteria.minTime') ? t !== null && t >= min && t <= max : true; })
        .sort((a, b) => b.prId - a.prId);
      return page(all.map((x) => prJson(x.prId)), url);
    }
    if ((m = /^\/_apis\/wit\/workitemtypes\/([^/]+)\/states$/.exec(rest))) {
      // The process's states: the mapping's, plus any the scenario uses (Epics have none mapped).
      const name = decodeURIComponent(m[1]!);
      const type = mapping.types[name];
      if (!type) return notFound();
      const used = [...u.ado.revisions.values()].flat().filter((r) => r.fields.type === name).map((r) => r.fields.state);
      const states = [...new Set([...Object.keys(type.states), ...used])];
      return ok({ count: states.length, value: states.map((st) => ({ name: st, category: type.states[st]?.category ?? 'InProgress', color: '000000' })) });
    }
    return notFound();
  }

  return { handle, now };
}

export const fakeRepoId = (project: string, repo: string) => guidFromName(`repo:${project}`, repo);
export const fakeProjectId = (project: string) => guidFromName('project', project);
export const fakePersonId = (handle: string) => guidFromName('person', handle);
