// ADO mode as a data source: the connected org through the cache and sync (04).
import { SOURCE_CAPS } from '@shared/contracts/source';
import type { AdoService } from '../ado/service';
import type { ChartSource } from './types';

export function adoSource(service: AdoService): ChartSource {
  return {
    mode: 'ado',
    caps: SOURCE_CAPS.ado,
    range: () => service.range(),
    projects: (cacheOnly) => service.projects(cacheOnly),
    recentProjects: () => service.recentProjects(),
    favorites: (k) => service.favorites(k),
    epics: (k) => service.epics(k),
    searchEpics: (k, text) => service.searchEpics(k, text),
    areaTree: (k) => service.areaTree(k),
    iterations: (k) => service.iterations(k),
    startSync: (scope, range, level) => service.startSync(scope, range, level),
    focus: (scope, sceneKey) => service.focus(scope, sceneKey),
    load: (scope, range) => service.load(scope, range),
    openInAdo: (key) => service.openInAdo(key),
  };
}
