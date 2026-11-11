// B4 (04 §3 boards): a project's teams with their team boards' columns. The service keeps the list in
// settings (`teams:<org>:<project>`); `factsFor` reads the board columns for a scope from it.
import { failureTier } from '@shared/contracts/neterror';
import type { BoardColumnFact } from '@shared/contracts/facts';
import type { Guid, OrgKey } from '@shared/contracts/keys';
import { parseBoardColumns, parseStoriesBoard } from '@shared/ingest/parse';
import { parseTeam, type TeamFacts } from '@shared/teams';
import { AdoError, type AdoClient } from '../ado/client';
import { devlog } from '../devlog';

/** The settings key of a project's team list. */
export const teamsKey = (org: OrgKey, projectId: Guid) => `teams:${org}:${projectId}`;

/**
 * A team's Stories board columns (B4, 04 §3 boards): the board of the requirement backlog level, whatever its name, else none.
 * Never throws an ADO error: a refusal (401, 403, 404) means none, quietly; a failure that may pass (no response,
 * 429, 5xx) keeps the columns read before (`before`), so a blip doesn't drop the board.
 */
async function boardColumns(client: AdoClient, projectId: Guid, team: string, before?: BoardColumnFact[]): Promise<BoardColumnFact[] | undefined> {
  try {
    const board = parseStoriesBoard(await client.teamBacklogs(projectId, team));
    if (!board) return undefined;
    const cols = parseBoardColumns(await client.teamBoardColumns(projectId, team, board));
    return cols.length ? cols : undefined;
  } catch (e) {
    if (!(e instanceof AdoError)) throw e;
    devlog.write('main', 'boards-unavailable', { status: e.status });
    return failureTier(e.status) === 'transient' ? before : undefined;
  }
}

/**
 * A project's teams with their Area Paths, sprint lists and board columns (slice 7, B4): 1 call, then 4 per team
 * (field values, iterations, backlog levels, the Stories board's columns). `before`: the list read earlier, for the
 * columns a transient failure must not drop. Throws an AdoError when the team list or a team's settings can't be read.
 */
export async function readTeams(client: AdoClient, projectId: Guid, before?: TeamFacts[] | null): Promise<TeamFacts[]> {
  const list = await client.teams(projectId);
  const out: TeamFacts[] = [];
  for (const t of list) {
    const id = (t as { id?: unknown }).id;
    if (typeof id !== 'string') continue;
    const [fv, its, columns] = await Promise.all([
      client.teamFieldValues(projectId, id), client.teamIterations(projectId, id),
      boardColumns(client, projectId, id, before?.find((x) => x.id === id)?.columns),
    ]);
    const team = parseTeam(t, fv, its, columns);
    if (team) out.push(team);
  }
  return out;
}
