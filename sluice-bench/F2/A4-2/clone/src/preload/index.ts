import { contextBridge, ipcRenderer } from 'electron';
import { z } from 'zod';
import {
  areaFavoriteSchema, areaNodeViewSchema, authStatusSchema, azAvailableSchema, cacheStatsSchema, capabilityMatrixSchema, captainExportResultSchema, captainImportResultSchema, diagnosticsSchema, pictureResultSchema, picturesTransferSchema, PICTURE_BYTES_MAX, CH, epicSummarySchema,
  fixtureListSchema, modeSchema, projectSummarySchema, rangeSchema, scopeHistorySchema, scopeSchema, setPatResultSchema,
  setPatSchema, paradigmSchema, syncProgressSchema, activityEventSchema, syncLevelSchema, chooserChangedSchema, iterationSummarySchema, scopeUpdatedSchema, focusSchema, type StarChartApi,
} from '@shared/contracts/ipc';
import type { ScopeHistory } from '@shared/contracts/history';
import { profileStateSchema, type ProfileState } from '@shared/contracts/profile';
import { DESKTOP } from '@shared/profile/bundled';
import { captainFileOf, captainFileSchema } from '@shared/captainFile';
import { userSettingsPatchSchema, userSettingsSchema, type UserSettings } from '@shared/contracts/settings';

const PROFILE_ARG = '--star-chart-profile=';
/** The launch argument main wrote (15 §11); a missing or bad one is desktop plus a notice. */
function profileFromArgv(): ProfileState {
  const raw = process.argv.find((a) => a.startsWith(PROFILE_ARG));
  try {
    if (raw) return profileStateSchema.parse(JSON.parse(decodeURIComponent(raw.slice(PROFILE_ARG.length))));
  } catch { /* fall through */ }
  return { profile: DESKTOP, source: 'bundled', overridden: false, notice: 'The device profile did not arrive: using desktop.', reason: 'parse' }; // no dedicated code for a missing argument: 'parse' is the nearest
}

const call = async <T>(schema: z.ZodType<T>, channel: string, ...args: unknown[]): Promise<T> => schema.parse(await ipcRenderer.invoke(channel, ...args));
const done = async (channel: string, ...args: unknown[]): Promise<void> => { await ipcRenderer.invoke(channel, ...args); };
const keyStr = (k: string) => String(k);

const api: StarChartApi = {
  env: { testMode: process.argv.includes('--star-chart-test'), gallery: process.argv.includes('--star-chart-gallery'), devlog: process.argv.includes('--star-chart-devlog'), tourOffer: process.argv.includes('--star-chart-tour-offer'), profile: profileFromArgv() },
  onActivity: (cb) => {
    const listener = (_e: unknown, a: unknown) => { const p = activityEventSchema.safeParse(a); if (p.success) cb(p.data); };
    ipcRenderer.on(CH.activity, listener);
    return () => { ipcRenderer.removeListener(CH.activity, listener); };
  },
  onChooserChanged: (cb) => {
    const listener = (_e: unknown, a: unknown) => { const p = chooserChangedSchema.safeParse(a); if (p.success) cb(p.data as never); };
    ipcRenderer.on(CH.chooserChanged, listener);
    return () => { ipcRenderer.removeListener(CH.chooserChanged, listener); };
  },
  devlog: (kind, fields) => {
    if (!process.argv.includes('--star-chart-devlog')) return;
    try { ipcRenderer.send(CH.devlog, { kind: String(kind).slice(0, 60), fields }); } catch { /* unserializable: skip */ }
  },
  mode: {
    get: () => call(modeSchema, CH.modeGet),
    set: (m, opts) => done(CH.modeSet, modeSchema.parse(m), opts?.transient === true),
  },
  paradigm: {
    get: () => call(paradigmSchema, CH.paradigmGet),
    set: (p) => done(CH.paradigmSet, paradigmSchema.parse(p)),
  },
  fixtures: { list: () => call(fixtureListSchema, CH.fixturesList) },
  auth: {
    status: () => call(authStatusSchema, CH.authStatus),
    // The one message that carries the PAT; the result never echoes it (INV-17).
    setPat: (orgUrl, pat) => call(setPatResultSchema, CH.authSetPat, ...setPatSchema.parse([orgUrl, pat])),
    clear: () => done(CH.authClear),
    azAvailable: () => call(azAvailableSchema, CH.authAzAvailable),
    azSignIn: (orgUrl) => call(setPatResultSchema, CH.authAzSignIn, z.string().max(300).parse(orgUrl)),
  },
  probe: { run: () => call(capabilityMatrixSchema, CH.probeRun) },
  projects: {
    list: (opts) => call(projectSummarySchema.array(), CH.projectsList, opts?.cacheOnly === true),
    setPinned: (keys) => done(CH.projectsSetPinned, z.array(z.string()).parse(keys)),
    recent: () => call(projectSummarySchema.array(), CH.projectsRecent),
  },
  areas: { tree: (projectKey) => call(areaNodeViewSchema.array(), CH.areasTree, keyStr(projectKey)) },
  iterations: { list: (projectKey) => call(iterationSummarySchema.array(), CH.iterationsList, keyStr(projectKey)) },
  favorites: {
    list: (projectKey) => call(areaFavoriteSchema.array(), CH.favoritesList, keyStr(projectKey)),
    save: (f) => done(CH.favoritesSave, areaFavoriteSchema.parse(f)),
    remove: (areaKey) => done(CH.favoritesRemove, keyStr(areaKey)),
    reorder: (projectKey, areaKeys) => done(CH.favoritesReorder, keyStr(projectKey), z.array(z.string()).parse(areaKeys)),
  },
  epics: {
    list: (projectKey) => call(epicSummarySchema.array(), CH.epicsList, keyStr(projectKey)),
    search: (projectKey, q) => call(epicSummarySchema.array(), CH.epicsSearch, keyStr(projectKey), z.string().max(200).parse(q)),
  },
  sync: {
    start: (scope, range, level) => call(z.object({ jobId: z.string() }), CH.syncStart, scopeSchema.parse(scope), rangeSchema.parse(range), level ? syncLevelSchema.parse(level) : undefined),
    cancel: (jobId) => done(CH.syncCancel, String(jobId)),
    focus: (scope, sceneKey) => done(CH.syncFocus, focusSchema.parse({ scope, sceneKey })),
    onScopeUpdated: (cb) => {
      const listener = (_e: unknown, a: unknown) => { const p = scopeUpdatedSchema.safeParse(a); if (p.success) cb(p.data); };
      ipcRenderer.on(CH.scopeUpdated, listener);
      return () => { ipcRenderer.removeListener(CH.scopeUpdated, listener); };
    },
    onProgress: (cb) => {
      const listener = (_e: unknown, p: unknown) => cb(syncProgressSchema.parse(p));
      ipcRenderer.on(CH.syncProgress, listener);
      return () => { ipcRenderer.removeListener(CH.syncProgress, listener); };
    },
  },
  history: {
    load: async (scope, range) => (await call(scopeHistorySchema, CH.historyLoad, scopeSchema.parse(scope), rangeSchema.parse(range))) as ScopeHistory,
    range: () => call(rangeSchema, CH.historyRange),
  },
  cache: {
    stats: () => call(cacheStatsSchema, CH.cacheStats),
    purge: () => done(CH.cachePurge),
  },
  diagnostics: {
    get: () => call(diagnosticsSchema, CH.diagnosticsGet),
    set: (on) => call(diagnosticsSchema, CH.diagnosticsSet, Boolean(on)),
    show: async () => z.boolean().parse(await ipcRenderer.invoke(CH.diagnosticsShow)),
  },
  pictures: {
    add: (captainKey) => call(pictureResultSchema, CH.picturesAdd, keyStr(captainKey)),
    remove: async (captainKey) => z.boolean().parse(await ipcRenderer.invoke(CH.picturesRemove, keyStr(captainKey))),
    set: (captainKey, bytes) => call(pictureResultSchema, CH.picturesSet, keyStr(captainKey), z.custom<Uint8Array>((b) => ArrayBuffer.isView(b) && b.byteLength > 0 && b.byteLength <= PICTURE_BYTES_MAX, 'not a picture file').parse(bytes)),
    exportAll: () => call(picturesTransferSchema, CH.picturesExport),
    importAll: () => call(picturesTransferSchema, CH.picturesImport),
  },
  openInAdo: (key) => done(CH.openInAdo, keyStr(key)),
  // v1 (14 §2.9): userData/settings.json. Checked going out and coming back, like everything else.
  settings: {
    get: async () => (await call(userSettingsSchema, CH.settingsGet)) as UserSettings,
    set: async (patch) => (await call(userSettingsSchema, CH.settingsSet, userSettingsPatchSchema.parse(patch))) as UserSettings,
  },
  // 23 E2: the captain to and from a small file; both choose it in a native dialog in main.
  captain: {
    export: (style) => call(captainExportResultSchema, CH.captainExport, captainFileSchema.parse(captainFileOf(style))),
    import: () => call(captainImportResultSchema, CH.captainImport),
  },
};

contextBridge.exposeInMainWorld('starChart', api);
