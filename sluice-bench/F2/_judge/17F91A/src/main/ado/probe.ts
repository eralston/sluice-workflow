// 04 §2 — the capability probe: one row per endpoint family, telling an expired token (401) from a
// denied read (403), a missing thing (404), throttling (429), and an empty result. It never shows
// response bodies; notes are fixed sentences plus counts of states or rules, never work data.
import type { StateMapping } from '@shared/contracts/history';
import type { UtcMs } from '@shared/contracts/keys';
import type { AdoResponse } from '@shared/contracts/transport';
import { parseUpdate } from '@shared/ingest/parse';
import type { AdoClient, Family } from './client';
import { everProbe, featuresUnder, myRecentWork } from '../sync/wiql';
import { flattenIterations } from '../sync/sync';

export type ProbeStatus = 'ok' | 'empty' | '401' | '403' | '404' | '429' | 'error';
export interface ProbeRow { family: string; endpoint: string; status: ProbeStatus; checkedAt: UtcMs; note: string; apiVersion?: string | null }
export interface CapabilityMatrix { orgKey: string | null; rows: ProbeRow[] }

const BASIC_HINT = 'Reading repos and pull requests needs Basic access; Stakeholder access can’t read them.';

export function statusOf(res: AdoResponse | Error, empty: boolean): ProbeStatus {
  if (res instanceof Error) return 'error';
  if (res.status === 401) return '401';
  if (res.status === 403) return '403';
  if (res.status === 404) return '404';
  if (res.status === 429) return '429';
  if (res.status < 200 || res.status >= 300) return 'error';
  return empty ? 'empty' : 'ok';
}

const NOTES: Record<ProbeStatus, string> = {
  ok: '',
  empty: 'Readable, but nothing came back.',
  '401': 'The token is expired or invalid. Enter a new PAT.',
  '403': 'The token, or its owner’s access level, can’t read this.',
  '404': 'Not found.',
  '429': 'ADO is throttling requests. Try again in a few minutes.',
  error: 'The call failed.',
};

type Json = Record<string, unknown>;
const list = (r: AdoResponse) => (Array.isArray((r.body as Json | null)?.value) ? ((r.body as Json).value as unknown[]) : []);

export async function runProbe(client: AdoClient, mapping: StateMapping, clock: () => UtcMs, projectHint?: string): Promise<CapabilityMatrix> {
  const rows: ProbeRow[] = [];
  const row = async (family: Family, endpoint: string, call: () => Promise<AdoResponse>, isEmpty: (r: AdoResponse) => boolean, note?: (r: AdoResponse) => string): Promise<AdoResponse | null> => {
    let res: AdoResponse | Error;
    try { res = await call(); } catch (e) { res = e instanceof Error ? e : new Error(String(e)); }
    const status = statusOf(res, !(res instanceof Error) && res.status < 300 && isEmpty(res));
    const extra = status === 'ok' && !(res instanceof Error) && note ? note(res) : '';
    const hint = (status === '403' && (family === 'repos' || family === 'prs')) ? ` Possible cause: ${BASIC_HINT}` : '';
    rows.push({ family, endpoint, status, checkedAt: clock(), note: (extra || NOTES[status]) + hint, apiVersion: client.versions.get(family) });
    return res instanceof Error || res.status >= 300 ? null : res;
  };

  const org = await row('org', '_apis/connectionData', () => client.raw('org', 'GET', '/_apis/connectionData'), (r) => !(r.body as Json | null)?.instanceId);
  if (rows[0]?.status === '401') return { orgKey: null, rows }; // nothing else can work; don't call it a denial
  const orgKey = (org?.body as Json | null)?.instanceId;
  const projects = await row('projects', '_apis/projects', () => client.raw('projects', 'GET', '/_apis/projects', { $top: 100 }), (r) => list(r).length === 0);
  // Your recent work, org-wide: the default set of projects (decided 2026-10-07). Never a count.
  await row('recent', '_apis/wit/wiql (your recent work)', () => client.raw('recent', 'POST', '/_apis/wit/wiql', { $top: 50 }, { query: myRecentWork() }),
    (r) => !((r.body as Json | null)?.workItems as unknown[] | undefined)?.length, () => 'Found your recent work: the galaxy can start with your recent projects.');
  if (rows.at(-1)?.status === 'empty') rows.at(-1)!.note = 'No recent work found for you (changed or assigned in 90 days): choose projects by hand.';
  const plist = projects ? (list(projects) as Json[]) : [];
  const proj = (plist.find((p) => p.id === projectHint || p.name === projectHint) ?? plist[0]) as Json | undefined;
  if (!proj) return { orgKey: typeof orgKey === 'string' ? orgKey : null, rows };
  const pid = String(proj.id);
  const ppath = `/${encodeURIComponent(pid)}`;

  await row('areas', '{project}/_apis/wit/classificationnodes/Areas', () => client.raw('areas', 'GET', `${ppath}/_apis/wit/classificationnodes/Areas`, { $depth: 2 }), (r) => !(r.body as Json | null)?.id);
  // Sprints (decided 2026-10-07): the iteration tree, and how many of its sprints have dates.
  await row('iterations', '{project}/_apis/wit/classificationnodes/Iterations', () => client.raw('iterations', 'GET', `${ppath}/_apis/wit/classificationnodes/Iterations`, { $depth: 4 }),
    (r) => !(r.body as Json | null)?.id, (r) => {
      const dated = flattenIterations(pid, r.body).filter((n) => n.startUtc !== null && n.finishUtc !== null).length;
      return dated ? `${dated} dated sprint${dated === 1 ? '' : 's'}: the Sprints view can show them.` : 'No sprint has dates: the Sprints view needs start and finish dates on iterations.';
    });
  // Team settings (slice 7, decided 2026-10-10): each team's own sprint list, so pods on their own
  // cadence get the right sprints. Without it every pod runs the project's whole sprint list.
  await row('teams', '_apis/projects/{project}/teams', () => client.raw('teams', 'GET', `/_apis/projects/${encodeURIComponent(pid)}/teams`, { $top: 100 }),
    (r) => list(r).length === 0, (r) => {
      const n = list(r).length;
      return `${n} team${n === 1 ? '' : 's'}: each pod gets its own team’s sprints.`;
    });
  if (rows.at(-1)?.status === 'empty') rows.at(-1)!.note = 'No teams found: every pod runs the project’s sprint list.';
  const wiql = await row('wiql', '{project}/_apis/wit/wiql (Features)', () => client.raw('wiql', 'POST', `${ppath}/_apis/wit/wiql`, { $top: 5 }, { query: featuresUnder(String(proj.name)) }),
    (r) => !((r.body as Json | null)?.workItems as unknown[] | undefined)?.length);
  // The `EVER` operator (decided 2026-10-08): with it, one query finds everything ever in a sprint.
  // Without it the stream falls back to a daily `ASOF` sample per day (04 §5b), which can miss an
  // item that joined and left between two. An empty result still means the operator is accepted.
  await row('wiql', '{project}/_apis/wit/wiql (IterationPath EVER)',
    () => client.raw('wiql', 'POST', `${ppath}/_apis/wit/wiql`, { $top: 1 }, { query: everProbe(String(proj.name)) }),
    () => false,
    (r) => (r.status >= 200 && r.status < 300
      ? 'Supported: a sprint’s leavers come from one query.'
      : 'Not supported: sprint membership falls back to daily sampling, which can miss a short stay.'));
  const feature = ((wiql?.body as Json | null)?.workItems as Json[] | undefined)?.[0]?.id;
  if (typeof feature === 'number') {
    await row('history', '_apis/wit/workItems/{id}/revisions', () => client.raw('history', 'GET', `/_apis/wit/workItems/${feature}/revisions`, { $top: 200 }), (r) => list(r).length === 0);
    // Which 04 §4 timestamp rule each update used, so the rule can be checked on live data (AC-34).
    await row('history', '_apis/wit/workItems/{id}/updates', () => client.raw('history', 'GET', `/_apis/wit/workItems/${feature}/updates`, { $top: 200 }), (r) => list(r).length === 0, (r) => {
      const ups = list(r).map((u) => parseUpdate(u, feature)).filter((u) => u !== null);
      const byFields = ups.filter((u) => u.sourceAt !== null).length;
      const relOnly = ups.filter((u) => u.sourceAt === null && u.rev !== null).length;
      const undated = ups.filter((u) => u.sourceAt === null && u.rev === null).length;
      return `Timestamp rule: ${byFields} updates dated by their own ChangedDate, ${relOnly} by their revision, ${undated} undated. revisedDate is never used.`;
    });
  } else {
    rows.push({ family: 'history', endpoint: '_apis/wit/workItems/{id}/revisions', status: 'empty', checkedAt: clock(), note: 'No Feature to read history from.' });
  }
  for (const type of ['Epic', 'Feature', 'User Story', 'Bug', 'Task']) {
    await row('states', `{project}/_apis/wit/workitemtypes/${type}/states`, () => client.raw('states', 'GET', `${ppath}/_apis/wit/workitemtypes/${encodeURIComponent(type)}/states`), (r) => list(r).length === 0, (r) => {
      // INV-11: compare with the mapping; unknown states stay neutral, never guessed.
      const names = (list(r) as Json[]).map((s) => String(s.name));
      // Epic states stay neutral by design (02 §2), so they're never a mismatch.
      const missing = type === 'Epic' ? [] : names.filter((n) => !mapping.types[type]?.states[n]);
      return missing.length ? `${missing.length} state(s) not in state-mapping.json: ${missing.join(', ')}. They show as unknown.` : 'Matches state-mapping.json.';
    });
  }
  await row('repos', '{project}/_apis/git/repositories', () => client.raw('repos', 'GET', `${ppath}/_apis/git/repositories`), (r) => list(r).length === 0);
  // Pipeline runs (B2, 04 §3 builds): needs Build (read). Without it a station just shows no run line.
  await row('builds', '{project}/_apis/build/builds', () => client.raw('builds', 'GET', `${ppath}/_apis/build/builds`, { $top: 1 }), () => false, () => 'Readable: a station’s plate can show its latest run.');
  const buildsRow = rows[rows.length - 1]!;
  if (buildsRow.status === '403' || buildsRow.status === '401') buildsRow.note = 'Pipeline runs need Build (read). Stations will show no run line.';
  const prs = await row('prs', '{project}/_apis/git/pullrequests', () => client.raw('prs', 'GET', `${ppath}/_apis/git/pullrequests`, { 'searchCriteria.status': 'completed', $top: 1 }), (r) => list(r).length === 0);
  const pr = prs ? (list(prs)[0] as Json | undefined) : undefined;
  if (pr) {
    const repoId = String((pr.repository as Json | undefined)?.id ?? '');
    const prId = Number(pr.pullRequestId);
    await row('review', '…/pullRequests/{id}/reviewers', () => client.raw('review', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}/reviewers`), (r) => list(r).length === 0);
    const threads = await row('review', '…/pullRequests/{id}/threads', () => client.raw('review', 'GET', `/_apis/git/repositories/${repoId}/pullRequests/${prId}/threads`), (r) => list(r).length === 0);
    if (!threads) {
      const last = rows[rows.length - 1]!;
      if (last.status === '403' || last.status === '401') last.note = 'Review threads need more than Code (read). Approvals will come from final reviewer votes.';
    }
  }
  return { orgKey: typeof orgKey === 'string' ? orgKey : null, rows };
}
