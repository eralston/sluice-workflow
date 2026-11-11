// 03 §6 — IPC API. Every request and response is validated with these schemas on both sides.
import { z } from 'zod';
import type { ScopeHistory } from './history';
import type { CanonicalKey } from './keys';
import { isAvatarImage } from '../scene/avatar';
import { netErrorSchema, type NetError } from './neterror';
import { captainStyleSchema, type CaptainStyle, type UserSettings } from './settings';
import type { ActivityEvent } from '../activity';
import type { ProfileState } from './profile';

const KEY_RE = /^(proj|wi|repo|pr|id|area|iter):/;
/** Canonical keys stay typed across IPC (03 §1). */
const key = z.custom<CanonicalKey>((v) => typeof v === 'string' && KEY_RE.test(v), 'not a canonical key');
const utc = z.number().int();

export const sectorRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('area'), areaKey: key, path: z.string() }),
  z.object({ kind: z.literal('epic'), epicKey: key }),
  z.object({
    kind: z.literal('sprint'), iterationKey: key, path: z.string(), startUtc: utc, finishUtc: utc,
    pods: z.array(z.object({ areaKey: key, path: z.string(), label: z.string() })).max(50),
  }),
]);
export const scopeSchema = z.object({ projectKey: key, sector: sectorRefSchema });
export const rangeSchema = z.object({ startUtc: utc, endUtc: utc }).refine((r) => r.endUtc > r.startUtc, 'empty range');
export const modeSchema = z.enum(['fixture', 'ado']);
/**
 * Which hierarchy the chart walks (decided 2026-10-07): Sprints or Backlog. v1 adds `solar` (14 §7):
 * the round → region chain, which becomes the default when nothing pins one (17, W1-T5).
 */
export const paradigmSchema = z.enum(['sprints', 'backlog', 'solar']);
export type Paradigm = z.infer<typeof paradigmSchema>;

export const fixtureListSchema = z.array(z.object({ name: z.string(), scope: scopeSchema, range: rangeSchema }));
export const projectSummarySchema = z.object({
  key, name: z.string(), pinned: z.boolean(), activity: z.number().int(), favoriteCount: z.number().int(),
  /** ADO mode: whether any scope in it has been synced, so `activity` means something. Fixtures omit it (always charted). */
  charted: z.boolean().optional(),
  /** ADO mode: when you last changed (or were assigned) work here, within 90 days: your recency, never an amount. */
  recentAt: z.number().int().optional(),
  /** Fixture mode only: the domain pack that reads it (ADO projects are always SDLC), for the chrome's words before a bundle opens (23 D5). */
  pack: z.string().optional(),
});
export const areaFavoriteSchema = z.object({
  areaKey: key, projectKey: key, path: z.string(), label: z.string(), displayOrder: z.number().int(), unavailable: z.boolean(),
});
export const epicSummarySchema = z.object({ key, id: z.number().int(), title: z.string(), state: z.string(), featureCount: z.number().int() });
export const areaNodeViewSchema = z.object({ areaKey: key, projectKey: key, path: z.string(), label: z.string(), depth: z.number().int(), hasChildren: z.boolean() });

// ---- ADO mode (slice 4) ----
export const authStatusSchema = z.object({
  hasPat: z.boolean(), storage: z.enum(['keychain', 'memory']), orgUrl: z.string().nullable(), connected: z.boolean(),
  /** Whether projects have been chosen for this org yet (any pin change, Select all included): until then the galaxy is the empty cosmos. */
  chosen: z.boolean(),
  /** How the token was given: a PAT (Keychain or memory) or the Azure CLI (memory only, 04 §1a). */
  method: z.enum(['pat', 'az']),
  /** The signed-in ADO user, as read from `connectionData` at connect (13 Q8, closed): the viewer is asked "Is this you?". Never in fixture mode. */
  me: z.object({ key, name: z.string() }).nullable(),
});
/** `auth.azAvailable`: whether `az` is on the PATH and logged in (the Sign in button shows only then). `reason` is for words, never for the CLI's own output. */
export const azAvailableSchema = z.object({ available: z.boolean(), reason: z.enum(['missing', 'not-logged-in', 'error']).optional() });
/** The only message that ever carries the PAT (INV-17): renderer → main, once. */
export const setPatSchema = z.tuple([z.string().max(300), z.string().min(1).max(1000)]);
export const setPatResultSchema = z.object({ ok: z.boolean(), error: z.string().optional(), net: netErrorSchema.optional() });
export const probeRowSchema = z.object({
  family: z.string(), endpoint: z.string(), status: z.enum(['ok', 'empty', '401', '403', '404', '429', 'error']),
  checkedAt: utc, note: z.string(), apiVersion: z.string().nullable().optional(),
});
export const capabilityMatrixSchema = z.object({ orgKey: z.string().nullable(), rows: z.array(probeRowSchema) });
export const syncProgressSchema = z.object({
  jobId: z.string(), phase: z.enum(['discover', 'history', 'prs', 'derive', 'done', 'failed']),
  done: z.number().int(), total: z.number().int(), partial: z.boolean(), lastError: z.string().optional(),
  error: netErrorSchema.optional(), errorMessage: z.string().optional(),
});
/** Adding a picture by hand (slice 6): did it take, and if not, why (shown in words, never with a path). */
export const pictureResultSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['cancelled', 'unreadable', 'tooBig', 'notConnected']).optional(),
  /** What was kept, as the small inline PNG the bundle will carry, so the Settings grid can show it at once. */
  avatar: z.string().max(200_000).refine(isAvatarImage, 'avatar must be an inline data:image URL').optional(),
});
export type PictureResult = z.infer<typeof pictureResultSchema>;

/** The captain file's two doors (23 E2): export reports whether it wrote; import answers the style the file held. */
export const captainExportResultSchema = z.object({ ok: z.boolean(), reason: z.enum(['cancelled', 'unwritable']).optional() });
export type CaptainExportResult = z.infer<typeof captainExportResultSchema>;
export const captainImportResultSchema = z.union([
  z.object({ ok: z.literal(true), style: captainStyleSchema }),
  z.object({ ok: z.literal(false), reason: z.enum(['cancelled', 'unreadable', 'invalid']), message: z.string().max(300).optional() }),
]);
export type CaptainImportResult = z.infer<typeof captainImportResultSchema>;
/** Moving the whole folder of hand-added pictures out of, or into, this Mac's app (a folder chosen in a native dialog). */
export const picturesTransferSchema = z.object({
  ok: z.boolean(),
  reason: z.enum(['cancelled', 'unreadable', 'notConnected']).optional(),
  count: z.number().int().min(0),
  /** Import only: the pictures now kept, by identity ID (the last part of a captain's key). */
  pictures: z.record(z.string().max(200), z.string().max(200_000).refine(isAvatarImage)).optional(),
});
export type PicturesTransfer = z.infer<typeof picturesTransferSchema>;
/** The most bytes of a picture file that cross to main (the same cap `add` applies to a chosen file). */
export const PICTURE_BYTES_MAX = 12_000_000;
/** The diagnostic log (slice 7): on or off, and whether this is a packaged build (where it's opt-in). */
export const diagnosticsSchema = z.object({ on: z.boolean(), packaged: z.boolean() });
export type Diagnostics = z.infer<typeof diagnosticsSchema>;
export const cacheStatsSchema = z.object({ bytes: z.number().int(), path: z.string() });
/** What a sync loads (decided 2026-10-07): a level of current state, or a scene's history. Absent: everything. */
export const syncLevelSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('team') }),
  z.object({ kind: z.literal('feature'), featureKey: key }),
  z.object({ kind: z.literal('more') }),
  z.object({ kind: z.literal('history'), scene: z.discriminatedUnion('kind', [z.object({ kind: z.literal('team') }), z.object({ kind: z.literal('feature'), featureKey: key })]), days: z.number().int().min(1).max(90), /** B7: Retry: only the scene's missing items. */ retry: z.literal(true).optional() }),
  z.object({ kind: z.literal('catchUp') }),
  /** A sprint's first look (decided 2026-10-08): three calls; the rest streams in behind it. */
  z.object({ kind: z.literal('sprint') }),
]);
export type SyncLevel = z.infer<typeof syncLevelSchema>;
/** Request activity (decided 2026-10-07): one network call's start, end, failure, or throttle wait. */
export const activityEventSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('start'), id: z.number().int(), family: z.string(), at: z.number() }),
  z.object({ phase: z.literal('end'), id: z.number().int(), family: z.string(), at: z.number(), status: z.number().int(), ms: z.number(), attempts: z.number().int() }),
  z.object({ phase: z.literal('fail'), id: z.number().int(), family: z.string(), at: z.number(), status: z.number().int(), ms: z.number(), net: netErrorSchema.optional() }),
  z.object({ phase: z.literal('throttle'), id: z.number().int(), family: z.string(), at: z.number(), waitMs: z.number() }),
]);
/**
 * A streaming scope's cached facts changed (decided 2026-10-08): items arrived, changed, or left.
 * Batched in main (every 1.5 s, or 25 items). `pending` is the work still queued; `done` when it's all in.
 */
export const scopeUpdatedSchema = z.object({
  scope: scopeSchema, changed: z.array(key).max(5000), pending: z.number().int().min(0), done: z.boolean(),
  /** B6: what `pending` is out of (the plate's `N of ~M`), and whether that total is exact yet. */
  total: z.number().int().min(0).optional(), exact: z.boolean().optional(),
  /** ADO stopped accepting the token part-way through (04 §6): the stream has stopped, and the user needs a new one. */
  refused: z.boolean().optional(),
});
export type ScopeUpdated = z.infer<typeof scopeUpdatedSchema>;
/** Where the user is looking in a streaming scope: its scene (decided 2026-10-08). */
export const focusSchema = z.object({ scope: scopeSchema, sceneKey: z.string().max(400) });
/** A background refresh changed a project's chooser data (decided 2026-10-07). */
export const chooserChangedSchema = z.object({ projectKey: key, what: z.enum(['areas', 'epics', 'iterations']) });
/** A sprint in a project's iteration tree (decided 2026-10-07): started, dated, newest first. */
/**
 * A sprint. `pods` (slice 7, decided 2026-10-10): the saved Area Paths (by key) whose team runs this
 * sprint, when teams are known; absent, every pod runs it.
 */
export const iterationSummarySchema = z.object({ key, path: z.string(), label: z.string(), startUtc: utc, finishUtc: utc, pods: z.array(key).optional() });
/** A renderer dev-log entry (decided 2026-10-07): redacted in main before it's written. */
export const devlogEntrySchema = z.object({ kind: z.string().max(60), fields: z.record(z.string(), z.unknown()).optional() });

const evidenceSchema = z.object({ source: z.enum(['revision', 'update', 'pullRequest']), ref: z.string(), at: utc.nullable() });
const eventSchema = z.object({
  eventKey: z.string(),
  kind: z.enum([
    'wi_created', 'wi_state_changed', 'wi_assignee_changed', 'wi_area_changed', 'wi_title_changed', 'wi_iteration_changed',
    'link_parent_added', 'link_parent_removed', 'link_dependency_added', 'link_dependency_removed',
    'link_pr_added', 'link_pr_removed', 'pr_opened', 'pr_completed', 'pr_abandoned',
  ]),
  occurredAt: utc,
  observedAt: utc,
  entityKey: key,
  projectKey: key,
  priority: z.enum(['high', 'medium', 'mediumGroup', 'low']),
  payload: z.record(z.string(), z.unknown()),
  evidence: z.array(evidenceSchema),
  changedBy: key.nullable().optional(),
});
const observationSchema = z.object({
  obsKey: z.string(),
  kind: z.enum(['link_parent', 'link_dependency', 'link_pr', 'pr_status']),
  op: z.enum(['present', 'removed']),
  fromKey: key,
  toKey: key.optional(),
  status: z.enum(['active', 'completed', 'abandoned']).optional(),
  confidence: z.enum(['unknown', 'observed_only']),
  observedAt: utc,
  evidence: z.array(evidenceSchema),
});
const named = z.object({ key, name: z.string(), adoUrl: z.string() });
/**
 * v1 (14 §2.1): a raw state's meaning. Zod strips unknown keys, so every optional signal field is
 * declared here; otherwise main and preload would drop them silently.
 */
const mappedStateSchema = z.object({
  category: z.string(), stage: z.string(),
  rung: z.enum(['ready', 'underway', 'nearing', 'accomplished', 'off']).optional(),
  sketch: z.boolean().optional(), step: z.number().min(0).max(1).optional(), deferred: z.boolean().optional(),
  ghost: z.boolean().optional(), strike: z.boolean().optional(),
});
export const stateMappingSchema = z.object({
  version: z.number(),
  unknownStage: z.string(),
  types: z.record(z.string(), z.object({
    kind: z.enum(['epic', 'feature', 'story', 'bug', 'task']),
    role: z.enum(['objective', 'threat', 'step', 'container', 'facility', 'attachment', 'guard']).optional(),
    states: z.record(z.string(), mappedStateSchema),
  })),
  entities: z.object({
    facility: z.object({ noun: z.string().optional() }).optional(),
    attachment: z.object({ states: z.object({ active: mappedStateSchema, completed: mappedStateSchema, abandoned: mappedStateSchema }).partial() }).optional(),
  }).optional(),
});

export const scopeHistorySchema = z.object({
  schemaVersion: z.literal(1),
  derivationVersion: z.number().int(),
  scope: z.object({ orgKey: z.string(), projectKey: key, sector: sectorRefSchema }),
  range: rangeSchema,
  coverage: z.object({
    syncedAt: utc.nullable(), historyFrom: utc, partial: z.boolean(), notes: z.array(z.string()),
    stale: z.array(key).optional(),
    missing: z.array(z.object({ kind: z.enum(['pr', 'repo']), key, status: z.number().int(), seen: z.boolean() })).optional(),
    history: z.array(key).optional(), explored: z.array(key).optional(),
    more: z.object({ team: z.boolean(), features: z.array(key) }).optional(),
    played: z.array(z.object({ scene: z.string(), days: z.number().int(), at: utc, missing: z.array(key).optional(), capped: z.literal(true).optional() })).optional(),
  }),
  entities: z.object({
    projects: z.array(named),
    workItems: z.array(z.object({ key, type: z.string(), adoUrl: z.string() })),
    repos: z.array(z.object({ key, name: z.string(), adoUrl: z.string(), run: z.object({ state: z.enum(['passed', 'partly', 'failed', 'canceled', 'running', 'queued']), at: utc, readAt: utc.optional() }).optional() })),
    prs: z.array(z.object({
      key, repoKey: key, adoUrl: z.string(),
      stats: z.object({
        votes: z.object({ approved: z.number().int().optional(), suggestions: z.number().int().optional(), waiting: z.number().int().optional(), rejected: z.number().int().optional() }).optional(),
        pushes: z.number().int().optional(), threads: z.number().int().optional(), files: z.number().int().optional(),
      }).optional(),
    })),
    captains: z.array(z.object({
      key, displayName: z.string(), shipSeed: z.number().int(), callSign: z.string(),
      // Inline images only: the renderer never fetches from ADO (INV-17).
      avatar: z.string().max(200_000).refine(isAvatarImage, 'avatar must be an inline data:image URL').optional(),
      handAdded: z.boolean().optional(),
    })),
    childCounts: z.array(z.object({ key, stories: z.number().int(), bugs: z.number().int() })).optional(),
  }),
  current: z.object({
    at: utc,
    workItems: z.array(z.object({
      key, type: z.string(), title: z.string(), state: z.string(), areaPath: z.string(), assigneeKey: key.nullable(), createdAt: utc, changedAt: utc,
      iterationPath: z.string().optional(),
    })),
    prs: z.array(z.object({
      key, repoKey: key, title: z.string(), status: z.enum(['active', 'completed', 'abandoned']), authorKey: key.nullable(), createdAt: utc, closedAt: utc.nullable(),
    })),
    links: z.array(z.object({ kind: z.enum(['parent', 'dependency', 'pr']), fromKey: key, toKey: key })),
  }).optional(),
  events: z.array(eventSchema),
  observations: z.array(observationSchema),
  unlinkedPrs: z.array(key),
  stateMapping: stateMappingSchema,
  /** B4: the team's board columns, in order, and each item's column over time. */
  board: z.object({
    columns: z.array(z.object({ name: z.string(), type: z.enum(['incoming', 'inProgress', 'outgoing']), split: z.boolean() })),
    placements: z.array(z.object({ key, at: utc, column: z.string(), done: z.boolean() })),
  }).optional(),
  /** v1: the domain pack; omitted means 'sdlc' (14 §2.1). */
  domainPack: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).optional(),
});

/** IPC channel names, one per API call. */
export const CH = {
  modeGet: 'starChart:mode.get',
  modeSet: 'starChart:mode.set',
  paradigmGet: 'starChart:paradigm.get',
  paradigmSet: 'starChart:paradigm.set',
  fixturesList: 'starChart:fixtures.list',
  projectsList: 'starChart:projects.list',
  favoritesList: 'starChart:favorites.list',
  epicsList: 'starChart:epics.list',
  historyLoad: 'starChart:history.load',
  historyRange: 'starChart:history.range',
  authStatus: 'starChart:auth.status',
  authSetPat: 'starChart:auth.setPat',
  authClear: 'starChart:auth.clear',
  authAzAvailable: 'starChart:auth.azAvailable',
  authAzSignIn: 'starChart:auth.azSignIn',
  probeRun: 'starChart:probe.run',
  projectsSetPinned: 'starChart:projects.setPinned',
  projectsRecent: 'starChart:projects.recent',
  devlog: 'starChart:devlog',
  activity: 'starChart:activity',
  chooserChanged: 'starChart:chooserChanged',
  iterationsList: 'starChart:iterations.list',
  areasTree: 'starChart:areas.tree',
  favoritesSave: 'starChart:favorites.save',
  favoritesRemove: 'starChart:favorites.remove',
  favoritesReorder: 'starChart:favorites.reorder',
  epicsSearch: 'starChart:epics.search',
  syncStart: 'starChart:sync.start',
  syncCancel: 'starChart:sync.cancel',
  syncProgress: 'starChart:sync.progress',
  syncFocus: 'starChart:sync.focus',
  scopeUpdated: 'starChart:scope.updated',
  diagnosticsGet: 'starChart:diagnostics.get',
  diagnosticsSet: 'starChart:diagnostics.set',
  diagnosticsShow: 'starChart:diagnostics.show',
  picturesAdd: 'starChart:pictures.add',
  picturesRemove: 'starChart:pictures.remove',
  picturesSet: 'starChart:pictures.set',
  picturesExport: 'starChart:pictures.export',
  picturesImport: 'starChart:pictures.import',
  cacheStats: 'starChart:cache.stats',
  cachePurge: 'starChart:cache.purge',
  openInAdo: 'starChart:openInAdo',
  /** v1 (14 §2.9): the user's settings file under userData, which survives Purge. */
  settingsGet: 'starChart:settings.get',
  settingsSet: 'starChart:settings.set',
  /** 23 E2: the captain (faction, hull, colourway) to and from a small JSON file, chosen in a native dialog. */
  captainExport: 'starChart:captain.export',
  captainImport: 'starChart:captain.import',
} as const;

export type FixtureListing = z.infer<typeof fixtureListSchema>[number];
export type Scope = z.infer<typeof scopeSchema>;
export type Range = z.infer<typeof rangeSchema>;
export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type AreaFavorite = z.infer<typeof areaFavoriteSchema>;
export type EpicSummary = z.infer<typeof epicSummarySchema>;
export type AreaNodeView = z.infer<typeof areaNodeViewSchema>;
export type IterationSummary = z.infer<typeof iterationSummarySchema>;
export type AuthStatus = z.infer<typeof authStatusSchema>;
export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;
export type SyncProgressMsg = z.infer<typeof syncProgressSchema>;
export type CacheStats = z.infer<typeof cacheStatsSchema>;

/** The surface of `window.starChart` (03 §6). */
export interface StarChartApi {
  env: { testMode: boolean; gallery: boolean; devlog: boolean; tourOffer: boolean; /** 15 §11: the resolved device profile, fixed for the launch. */ profile: ProfileState };
  /** Request activity: every network call's moments, for the status bar's chips (decided 2026-10-07). */
  onActivity(cb: (e: ActivityEvent) => void): () => void;
  /**
   * A project's area tree, saved Area Paths, or Epics changed after a background refresh (decided
   * 2026-10-07): they answer from the cache at once, and this says when to read them again.
   */
  onChooserChanged(cb: (e: { projectKey: CanonicalKey; what: 'areas' | 'epics' | 'iterations' }) => void): () => void;
  /** A project's sprints, newest first (Sprints mode, decided 2026-10-07). */
  iterations: { list(projectKey: CanonicalKey): Promise<IterationSummary[]> };
  /** Developer runs only: one entry for the dev log (redacted in main). A no-op otherwise. */
  devlog(kind: string, fields?: Record<string, unknown>): void;
  mode: { get(): Promise<'fixture' | 'ado'>; set(m: 'fixture' | 'ado', opts?: { transient?: boolean }): Promise<void> };
  /** Sprints or Backlog (decided 2026-10-07), remembered across launches. */
  paradigm: { get(): Promise<Paradigm>; set(p: Paradigm): Promise<void> };
  fixtures: { list(): Promise<FixtureListing[]> };
  auth: {
    status(): Promise<AuthStatus>;
    /** The PAT is sent once and never returned (INV-17). */
    setPat(orgUrl: string, pat: string): Promise<{ ok: boolean; error?: string; net?: NetError }>;
    /** Signs out of whichever is in use: the Azure CLI first (a saved PAT stays), else the PAT. */
    clear(): Promise<void>;
    /** Whether `az` is on the PATH and logged in (04 §1a). Quiet: a missing or logged-out CLI is just `available: false`. */
    azAvailable(): Promise<z.infer<typeof azAvailableSchema>>;
    /** Signs in with the Azure CLI's token for the org (memory only, refreshed hourly; never returned or stored, INV-17). */
    azSignIn(orgUrl: string): Promise<{ ok: boolean; error?: string; net?: NetError }>;
  };
  probe: { run(): Promise<CapabilityMatrix> };
  projects: {
    /**
     * The org's projects. `cacheOnly` (decided 2026-10-09): answer from the cache without touching ADO,
     * for a start with no connection (AC-31). Absent: ask ADO, as before.
     */
    list(opts?: { cacheOnly?: boolean }): Promise<ProjectSummary[]>;
    setPinned(keys: string[]): Promise<void>;
    /** Your most recent projects (up to 10), newest first, from your own recent work (decided 2026-10-07). */
    recent(): Promise<ProjectSummary[]>;
  };
  areas: { tree(projectKey: string): Promise<AreaNodeView[]> };
  favorites: {
    list(projectKey: string): Promise<AreaFavorite[]>;
    save(f: AreaFavorite): Promise<void>;
    remove(areaKey: string): Promise<void>;
    reorder(projectKey: string, areaKeys: string[]): Promise<void>;
  };
  epics: { list(projectKey: string): Promise<EpicSummary[]>; search(projectKey: string, q: string): Promise<EpicSummary[]> };
  sync: {
    start(scope: Scope, range: Range, level?: SyncLevel): Promise<{ jobId: string }>;
    cancel(jobId: string): Promise<void>;
    onProgress(cb: (p: SyncProgressMsg) => void): () => void;
    /**
     * Look here (decided 2026-10-08): the scope's streaming work for this scene moves to the front.
     * Entering a pod waits for its Tasks; otherwise it resolves at once.
     */
    focus(scope: Scope, sceneKey: string): Promise<void>;
    onScopeUpdated(cb: (e: ScopeUpdated) => void): () => void;
  };
  history: { load(scope: Scope, range: Range): Promise<ScopeHistory>; range(): Promise<Range> };
  cache: { stats(): Promise<CacheStats>; purge(): Promise<void> };
  /**
   * Pictures you add by hand (slice 6, 91): `add` opens a file chooser in the main process and keeps the
   * chosen image, cut to a small square, for that captain; `remove` forgets it. Neither the path nor the
   * bytes cross to the renderer: the next `history.load` carries the picture.
   */
  pictures: {
    add(captainKey: string): Promise<PictureResult>;
    remove(captainKey: string): Promise<boolean>;
    /** A picture the renderer already holds (dropped, pasted, cropped): main cuts it to a square and keeps it, like `add`. */
    set(captainKey: string, bytes: Uint8Array): Promise<PictureResult>;
    /** Copy the hand-added pictures to a folder, or read a folder of them in (both choose it in a native dialog). */
    exportAll(): Promise<PicturesTransfer>;
    importAll(): Promise<PicturesTransfer>;
  };
  /**
   * The diagnostic log (slice 7, decided 2026-10-10): redacted, the last 3 runs under userData. Off by
   * default in a packaged build; `show` opens Finder on the file. Neither its path nor its contents cross.
   */
  diagnostics: { get(): Promise<Diagnostics>; set(on: boolean): Promise<Diagnostics>; show(): Promise<boolean> };
  openInAdo(key: string): Promise<void>;
  /**
   * v1 (14 §2.9): the viewer, captain style, theme and achievements switch, kept in
   * `userData/settings.json`. `set` merges a patch and answers the saved whole.
   */
  settings: { get(): Promise<UserSettings>; set(patch: Partial<UserSettings>): Promise<UserSettings> };
  /**
   * 23 E2: the captain as a file, `{ v: 1, faction, hull, colourway }`. Both open a native dialog in
   * main (tests name the file in STAR_CHART_CAPTAIN_FILE); the path and the file's text stay in main.
   */
  captain: { export(style: CaptainStyle): Promise<CaptainExportResult>; import(): Promise<CaptainImportResult> };
}
