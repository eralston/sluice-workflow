// Fixture mode (03 §6) as a data source: bundles built in memory from fixtures/scenarios, no SQLite,
// no network. What only ADO can do fails with the same messages as before.
import { SOURCE_CAPS } from '@shared/contracts/source';
import { fixtureEpics, fixtureFavorites, fixtureIterations, fixtureProjects, fixtureRange, loadFixtureHistory } from '../fixtures';
import type { ChartSource } from './types';

export const fixtureSource: ChartSource = {
  mode: 'fixture',
  caps: SOURCE_CAPS.fixture,
  range: fixtureRange,
  projects: fixtureProjects,
  recentProjects: () => [],
  favorites: fixtureFavorites,
  epics: fixtureEpics,
  searchEpics(projectKey, text) {
    const t = text.trim().replace(/^#/, '').toLowerCase();
    return fixtureEpics(projectKey).filter((e) => String(e.id) === t || (t.length > 0 && e.title.toLowerCase().includes(t)));
  },
  areaTree: () => Promise.reject(new Error('The area tree is ADO-mode only')),
  iterations: fixtureIterations,
  startSync() { throw new Error('Sync is ADO-mode only'); },
  focus: () => Promise.resolve(),
  load: loadFixtureHistory,
  openInAdo: () => Promise.reject(new Error('Open in ADO is disabled in fixture mode')),
};
