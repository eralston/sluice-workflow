// Fixture mode (03 §6): bundles built in memory from fixtures/scenarios. No SQLite.
import stateMappingJson from '@config/state-mapping.json';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import type { AreaFavorite, EpicSummary, FixtureListing, Paradigm, ProjectSummary, Range, Scope } from '@shared/contracts/ipc';
import {
  listEpics, listFavorites, listIterations, listProjects, resolveSector, scenarioKeys, scenarioScopes, sprintScopes, toHistory,
  type Scenario, type ScenarioScope, type SprintScope,
} from '@fixtures/dsl';
import type { IterationSummary } from '@shared/contracts/ipc';
import sprintMechanics from '@fixtures/scenarios/sprint-mechanics';
import sprintPods from '@fixtures/scenarios/sprint-pods';
import { scenarios } from '@fixtures/scenarios';
import crowdedOrg from '@fixtures/scenarios/crowded-org';
import { v1Scenarios } from '@fixtures/scenarios/v1';

const mapping = stateMappingJson as StateMapping;
/** A scenario's own mapping (a v1 pack's, 14 §1.3), else the SDLC one. */
export const mappingFor = (s: Scenario): StateMapping => s.mapping ?? mapping;
const built = new Map<string, ScopeHistory>();

/** STAR_CHART_FIXTURE picks another scenario to serve (dev and test): `crowded-org` has 188 projects. */
const chosen = process.env.STAR_CHART_FIXTURE;
const extras = (): Scenario[] => [crowdedOrg, ...v1Scenarios];

function active(): Scenario {
  const s = (chosen && [...scenarios, ...extras()].find((x) => x.name === chosen)) || scenarios[0];
  if (!s) throw new Error('No fixture scenarios');
  return s;
}

/**
 * The scenarios fixture mode serves: the active one, plus (any chain that plans by sprint: Sprints,
 * decided 2026-10-07, and Solar) the ones that plan by sprint, so the chain has sprints to show. The
 * v1 scenarios join them; a non-SDLC pack's only under Solar, which alone reads packs (17 A3).
 */
let paradigm: Paradigm = 'backlog';
export function setFixtureParadigm(p: Paradigm): void { paradigm = p; }
function served(): Scenario[] {
  const a = active();
  if (paradigm === 'backlog') return [a];
  const v1 = v1Scenarios.filter((s) => paradigm === 'solar' || !s.pack || s.pack === 'sdlc');
  // `sprint-mechanics` is the old Halcyon Reach, kept for tests. It shares the demo's project name, so it is
  // served in the demo's place, never beside it: when it's the active scenario, or STAR_CHART_PODS=mechanics.
  const pods = a === sprintMechanics ? [] : [process.env.STAR_CHART_PODS === 'mechanics' ? sprintMechanics : sprintPods];
  return [a, ...pods, ...v1].filter((s, i, all) => all.indexOf(s) === i);
}
/** The served scenario that holds a project. */
function owner(projectKey: string): Scenario {
  return served().find((s) => s.projects.some((p) => scenarioKeys(s).project(p.name) === projectKey)) ?? active();
}

function scopeId(s: Scenario, scope: ScenarioScope | SprintScope): string {
  const sector = resolveSector(s, scope);
  // A sprint matches by its iteration and pods, however the renderer ordered its fields.
  const id = sector.kind === 'sprint' ? { kind: 'sprint', it: sector.iterationKey, pods: sector.pods.map((p) => p.areaKey).sort() } : sector;
  return JSON.stringify({ p: scenarioKeys(s).project(scope.project), sector: id });
}

export function listFixtures(): FixtureListing[] {
  return scenarios.map((s) => {
    const k = scenarioKeys(s);
    return { name: s.name, scope: { projectKey: k.project(s.defaultScope.project), sector: resolveSector(s, s.defaultScope) }, range: s.range };
  });
}

export function fixtureRange(): Range {
  return active().range;
}

export function fixtureProjects(): ProjectSummary[] {
  return served().flatMap((s) => listProjects(s, mappingFor(s)).map((p) => ({ key: p.key, name: p.name, pinned: true, activity: p.activity, favoriteCount: p.favoriteCount, ...(s.pack && s.pack !== 'sdlc' ? { pack: s.pack } : {}) })));
}

export function fixtureFavorites(projectKey: string): AreaFavorite[] {
  return listFavorites(owner(projectKey), projectKey as never).map((f) => ({ ...f, unavailable: false }));
}

export function fixtureEpics(projectKey: string): EpicSummary[] {
  const s = owner(projectKey);
  return listEpics(s, mappingFor(s), projectKey as never);
}

export function fixtureIterations(projectKey: string): IterationSummary[] {
  return listIterations(owner(projectKey), projectKey as never);
}

export function loadFixtureHistory(scope: Scope, range: Range): ScopeHistory {
  const s = owner(scope.projectKey);
  const sector = scope.sector;
  const wanted = JSON.stringify({ p: scope.projectKey, sector: sector.kind === 'sprint' ? { kind: 'sprint', it: sector.iterationKey, pods: sector.pods.map((p) => p.areaKey).sort() } : sector });
  const match = [...scenarioScopes(s, mappingFor(s)), ...sprintScopes(s)].find((sc) => scopeId(s, sc) === wanted);
  if (!match) throw new Error('No fixture matches that scope');
  const id = scopeId(s, match);
  let h = built.get(id);
  if (!h) {
    h = toHistory(s, mappingFor(s), match);
    built.set(id, h);
  }
  return { ...h, range: ownClock(s, sector, range) };
}

/**
 * A v1 scenario's sprint runs on its own clock (17 W3-T1): its "now" is the scenario's own end, not
 * the active scenario's, so its round plays whichever scenario fixture mode was launched with. The
 * renderer asks for a sprint's dates up to the active scenario's end (rangeFor), which can fall
 * before a v1 round starts. v0 scenarios keep the range they're asked for, but for the demo project
 * (`sprint-pods`, 2026-10-27): its sprint is two weeks, and the default scenario's week would cut it short.
 */
function ownClock(s: Scenario, sector: Scope['sector'], range: Range): Range {
  if (sector.kind !== 'sprint') return range;
  // The renderer asks for a sprint's whole dates in fixture mode (23 D6): the scenario's clock ends it, here.
  if (!(v1Scenarios.includes(s) || s === sprintPods) || s === active()) return { startUtc: range.startUtc, endUtc: Math.max(Math.min(range.endUtc, active().range.endUtc), range.startUtc + 60_000) };
  const end = Math.min(sector.finishUtc, s.range.endUtc);
  return { startUtc: sector.startUtc, endUtc: Math.max(end, sector.startUtc + 60_000) };
}
