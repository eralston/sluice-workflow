// Teams and their cadences (slice 7, decided 2026-10-10). A pod is a saved Area Path, not a team, but
// in ADO each team owns Area Paths (its team field values) and runs its own sprint list. So each pod
// is matched to the team that owns its area, and each sprint is offered with the pods whose team runs
// it. A pod with no clear team (none, or two equally good) runs every sprint, as before. Pure.
import type { BoardColumnFact } from './contracts/facts';
import { underPath } from './paths';

export interface TeamFacts {
  id: string;
  name: string;
  /** The team's Area Paths: `includeChildren` owns the subtree too. */
  areas: { path: string; includeChildren: boolean }[];
  defaultArea: string | null;
  /** The iteration paths the team runs (its sprint list). */
  iterations: string[];
  /** B4: the columns of the team's Stories board, in order (04 §3 boards). Absent: not read, refused, or no such board. */
  columns?: BoardColumnFact[];
}

/** From ADO's teams list and each team's field values and iterations; tolerant of missing fields. */
export function parseTeam(team: unknown, fieldValues: unknown, iterations: unknown[], columns?: BoardColumnFact[]): TeamFacts | null {
  const t = team as { id?: unknown; name?: unknown } | null;
  if (!t || typeof t.id !== 'string' || typeof t.name !== 'string') return null;
  const f = (fieldValues ?? {}) as { defaultValue?: unknown; values?: unknown };
  const values = Array.isArray(f.values) ? f.values : [];
  return {
    id: t.id, name: t.name,
    defaultArea: typeof f.defaultValue === 'string' ? f.defaultValue : null,
    areas: values.flatMap((v) => {
      const x = v as { value?: unknown; includeChildren?: unknown };
      return typeof x.value === 'string' ? [{ path: x.value, includeChildren: x.includeChildren === true }] : [];
    }),
    iterations: iterations.flatMap((i) => { const p = (i as { path?: unknown }).path; return typeof p === 'string' ? [p] : []; }),
    ...(columns?.length ? { columns } : {}),
  };
}

/**
 * The team that owns an Area Path: an exact default value first, then an exact value, then the
 * nearest ancestor value that includes its children. Null when none does, or two tie (ambiguous).
 */
export function teamOfArea(teams: TeamFacts[], path: string): TeamFacts | null {
  const score = (t: TeamFacts): number => {
    if (t.defaultArea === path) return 1e6;
    let best = -1;
    for (const a of t.areas) {
      if (a.path === path) best = Math.max(best, 5e5);
      else if (a.includeChildren && underPath(path, a.path)) best = Math.max(best, a.path.length);
    }
    return best;
  };
  const ranked = teams.map((t) => ({ t, s: score(t) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s);
  if (!ranked.length || (ranked[1] && ranked[1].s === ranked[0]!.s)) return null;
  return ranked[0]!.t;
}

/**
 * For each sprint path, the pods (by area key) whose team runs it; `null` for a sprint every pod runs
 * (no team data, or the pods have no clear team). A sprint no pod's team runs gets an empty list.
 */
export function podsBySprint(teams: TeamFacts[] | null, pods: { areaKey: string; path: string }[], sprintPaths: string[]): Map<string, string[] | null> {
  const out = new Map<string, string[] | null>();
  if (!teams?.length) { for (const s of sprintPaths) out.set(s, null); return out; }
  const owner = new Map(pods.map((p) => [p.areaKey, teamOfArea(teams, p.path)]));
  const unmatched = pods.filter((p) => !owner.get(p.areaKey)).map((p) => p.areaKey);
  const anyMatched = pods.some((p) => owner.get(p.areaKey));
  for (const s of sprintPaths) {
    if (!anyMatched) { out.set(s, null); continue; }
    const running = pods.filter((p) => owner.get(p.areaKey)?.iterations.includes(s)).map((p) => p.areaKey);
    out.set(s, [...running, ...unmatched]);
  }
  return out;
}

/**
 * The team board a scope reads (B4): the team that owns the first of these Area Paths that has a clear team with a
 * board. A sprint passes its pods in their order; an area its path; an Epic none. `owns`: whether an Area Path belongs to
 * that team. An item's column counts only while its area does (a sprint's pods can belong to different teams, and
 * `System.BoardColumn` is a column of the board of the team its area belongs to). Undefined: placement by state.
 */
export function boardTeamOf(teams: TeamFacts[] | null | undefined, areas: string[]): { columns: BoardColumnFact[]; owns: (areaPath: string) => boolean } | undefined {
  if (!teams?.length) return undefined;
  for (const a of areas) {
    const team = teamOfArea(teams, a);
    if (team?.columns?.length) return { columns: team.columns, owns: (path) => teamOfArea(teams, path)?.id === team.id };
  }
  return undefined;
}

/** The columns of that board alone (see `boardTeamOf`). */
export function boardColumnsOf(teams: TeamFacts[] | null | undefined, areas: string[]): BoardColumnFact[] | undefined {
  return boardTeamOf(teams, areas)?.columns;
}
