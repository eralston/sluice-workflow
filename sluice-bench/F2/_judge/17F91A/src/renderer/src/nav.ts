// Scene navigation: the stack behind breadcrumbs, Back, zoom-in, and search jumps (06 §3). Scenes
// resolve through the active hierarchy (decided 2026-10-07): which level a scene is, how long its
// transition runs, what loads before entering it, and where an item lives all come from there.
import { captainsInScene, mergeRoster, type RosterCaptain } from '@shared/captainRoster';
import type { ScopeHistory } from '@shared/contracts/history';
import type { AreaNodeView, Paradigm, PictureResult, Scope } from '@shared/contracts/ipc';
import { workItemId, type CanonicalKey } from '@shared/contracts/keys';
import type { SceneKey, Snapshot, ViewGraph, ViewNode } from '@shared/contracts/view';
import { isRootScene, levelIdOf } from '@shared/hierarchy/sceneKey';
import { LAYOUT_VERSION } from '@shared/limits';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectGalaxy, projectScene, soleFeature } from '@shared/scene/projectScene';
import type { ChartApp } from './chart/ChartApp';
import type { CamState } from './chart/camera';
import { caps } from './data/caps';
import { defaultRange, histories, isStreaming, loadScope, onLoadProgress, onStreamed, onSynced, rangeFor, readRange, scopeId, syncAndLoad } from './data/scopeData';
import { sceneEntityKeys } from '@shared/playback/highlights';
import { activeHierarchy, activeUi } from './hierarchy';
import { attachHistory, detachHistory, projectOptions, sceneChanged } from './playback';
import { presented } from './v1/story';
import { explainError, isUnreachable, noteIfRefused } from './errors';
import { warn } from './devlog';
import { wordCounts } from './v1/lines';
import { loadSettings, patchSettings, useSettings } from './settings/store';
import { useChart, type NavEntry } from './store';

export { cancelHistory, cancelSync } from './data/scopeData';
export type { CrumbLevel } from '@shared/hierarchy/crumbs';

/** Transition length into (or out of) a scene: its level's (06 §3). */
const durationOf = (k: SceneKey): number | undefined => activeHierarchy().resolve(k)?.def.durationMs;
/** The scope entry: the stack's scene at the hierarchy's first level (the sector). */
export const scopeEntryOf = (stack: NavEntry[]) => stack.find((e) => activeHierarchy().resolve(e.sceneKey)?.index === 0);

let chart: ChartApp | null = null;

/** A loaded scope's bundle as playback presents it (05 §8.3a: story time under Solar). */
function told(id: string): ScopeHistory | undefined {
  const h = histories.get(id);
  return h && presented(h);
}

export function attachChart(c: ChartApp | null): void {
  chart = c;
  chart?.setHierarchy(activeHierarchy(), activeUi().plates);
}

onLoadProgress((f) => chart?.exploreProgress(f));
onSynced(() => void refreshProjects().catch(() => undefined));

/**
 * Navigation the app does on its own (following a captain, 05 §6) never counts as the user's; the
 * user's own navigation (zooming through, Back, a breadcrumb, search) suspends following.
 */
let automatic = false;
let userNavListener: (() => void) | null = null;
export function onUserNavigate(fn: (() => void) | null): void {
  userNavListener = fn;
}
function userNav(): void {
  if (!automatic) userNavListener?.();
}
/** Whether a navigation in progress is the app's own (following a captain), not the user's. */
export function isAutomatic(): boolean {
  return automatic;
}
/** Run a navigation as the app's own, not the user's. */
export function automatically<T>(fn: () => T): T {
  automatic = true;
  try {
    return fn();
  } finally {
    automatic = false;
  }
}

let chooserWatch: (() => void) | null = null;

/**
 * A streaming scope's new facts (decided 2026-10-08): they matter when the scope is on screen and they
 * bring something new, or touch the scene's own keys. The reload re-projects with cause 'data': what's
 * new Arrives, what's gone Departs, and the playhead stays put. The player's schedule waits until the
 * scene's history is all in (playState), then is built once, and again when the stream ends.
 */
onStreamed((scope, h, changed) => {
  const cur = currentScope();
  if (!cur || scopeId(cur) !== scopeId(scope)) return false;
  const top = useChart.getState().stack.at(-1);
  const known = new Set(h.entities.workItems.map((w) => w.key));
  if (changed.some((k) => !known.has(k))) return true;
  const inScene = top ? sceneEntityKeys(h, top.sceneKey, activeHierarchy()) : null;
  return !inScene || changed.some((k) => inScene.has(k));
}, (scope, h, done) => {
  const cur = currentScope();
  if (!cur || scopeId(cur) !== scopeId(scope)) return;
  const wasGathering = playState().state === 'gathering';
  attachHistory(h, { reschedule: false });
  if (done || (wasGathering && playState().state !== 'gathering')) attachHistory(h, { reschedule: true });
  refresh('data');
});

/**
 * The org's projects, from ADO — or, if ADO can't be reached, from the cache with the app marked
 * offline (AC-31, decided 2026-10-09). A start with no connection opens on what was last known, rather
 * than on nothing. Anything but "unreachable" (a refused token, a denied read) still throws.
 */
async function listProjects(): Promise<Awaited<ReturnType<typeof window.starChart.projects.list>>> {
  const st = useChart.getState();
  try {
    const all = await window.starChart.projects.list();
    if (st.offline) st.set({ offline: false });
    return all;
  } catch (e) {
    if (!isUnreachable(e)) throw e;
    const cached = await window.starChart.projects.list({ cacheOnly: true });
    if (!cached.length) throw e; // never connected here: there's nothing to open
    st.set({ offline: true });
    warn('offline-projects', { count: cached.length });
    return cached;
  }
}

export async function boot(): Promise<void> {
  // The galaxy's chooser answers from the cache; a background refresh that changes it re-reads it.
  chooserWatch ??= window.starChart.onChooserChanged?.((e) => {
    if (useChart.getState().chooser?.projectKey === e.projectKey) void loadChooser(e.projectKey).catch(() => undefined);
  }) ?? null;
  const [mode, paradigm] = await Promise.all([window.starChart.mode.get(), window.starChart.paradigm.get()]);
  useChart.getState().set({ mode, paradigm });
  // A v0 view that the developer toggle remembered (23 E3) keeps the cog, as choosing it did; a pin never does.
  if (paradigm !== 'solar' && !useSettings.getState().devView) {
    const saved = await loadSettings();
    if (saved.devParadigm === paradigm) useSettings.getState().set({ devView: true });
  }
  chart?.setHierarchy(activeHierarchy(), activeUi().plates);
  await readRange();
  let projects = [] as Awaited<ReturnType<typeof window.starChart.projects.list>>;
  const st = useChart.getState();
  if (caps().needsConnection) {
    // ADO mode needs a connection first; the Connect panel (the mode chip) opens until there is one.
    // Until projects are chosen, the galaxy is the empty cosmos: the start of onboarding (decided
    // 2026-10-07). Its plate connects, then offers your recent projects.
    const status = await window.starChart.auth.status();
    if (status.connected && status.chosen) {
      const all = await listProjects();
      const pinned = all.filter((p) => p.pinned);
      projects = pinned.length ? pinned : all; // pinned projects, or all when "Select all" was chosen
    }
  } else {
    projects = await window.starChart.projects.list();
  }
  st.set({ mode, projects, stack: [{ sceneKey: 'galaxy', label: 'All projects' }], chooser: null, selectedKey: null, sync: null, error: null, errorNet: null });
  render({ direction: 'none', remount: true }); // a reboot's galaxy may hold other projects: fit it afresh
}

/** Switch the hierarchy (the title bar, decided 2026-10-07; v1's developer toggle): back to the galaxy. */
export async function setParadigm(p: Paradigm): Promise<void> {
  if (useChart.getState().paradigm === p) return;
  await window.starChart.paradigm.set(p);
  await patchSettings({ devParadigm: p }); // remembered for the next launch, from either switch (23 E3)
  await reboot();
}

/** Start again from the galaxy: after a mode switch, a new connection, pinning, or Purge. */
export async function reboot(): Promise<void> {
  histories.clear();
  lastSector.clear();
  detachHistory();
  await boot();
}

/** Re-read the projects (ADO mode: after a sync or a favorites change, so the galaxy's captions are current). */
export async function refreshProjects(cause: 'jump' | 'data' = 'jump'): Promise<void> {
  const st = useChart.getState();
  if (!caps().chartedCaption) return;
  const all = await listProjects();
  const pinned = all.filter((p) => p.pinned);
  st.set({ projects: pinned.length ? pinned : all });
  if (st.stack.length === 1) refresh(cause);
}

// ---- Adding to the loaded set, from the breadcrumb (decided 2026-10-08; 06 §3) ----

/**
 * What the breadcrumb's + adds here: a project in the galaxy (a pin), or an Area Path at a scope's
 * scene (a saved one: a sprint's pods, a Backlog team). Nothing deeper: that's ADO's own data. ADO
 * mode only.
 */
export type Addable = { kind: 'project' } | { kind: 'area'; projectKey: CanonicalKey };
export function addable(): Addable | null {
  if (!caps().areaTree) return null;
  const top = useChart.getState().stack.at(-1);
  if (!top) return null;
  if (isRootScene(top.sceneKey)) return { kind: 'project' };
  if (top.scope && activeHierarchy().resolve(top.sceneKey)?.index === 0) return { kind: 'area', projectKey: top.scope.projectKey };
  return null;
}

/** Pin a project: its galaxy Arrives. "All projects" chosen before means it's already there. */
export async function addProject(key: CanonicalKey): Promise<void> {
  const all = await window.starChart.projects.list();
  const pinned = all.filter((p) => p.pinned).map((p) => p.key);
  if (!pinned.length || pinned.includes(key)) return;
  await window.starChart.projects.setPinned([...pinned, key]);
  await refreshProjects('data');
  select(key);
  chart?.reveal(key);
}

/** Unpin a project from the galaxy (its galaxy Departs). From "All projects", every other one stays pinned. */
export async function unpinProject(key: CanonicalKey): Promise<void> {
  const all = await window.starChart.projects.list();
  const pinned = all.filter((p) => p.pinned).map((p) => p.key);
  const next = (pinned.length ? pinned : all.map((p) => p.key)).filter((k) => k !== key);
  if (!next.length) return; // the last one stays: an empty galaxy is the onboarding cosmos
  await window.starChart.projects.setPinned(next);
  await refreshProjects('data');
}

/** Save an Area Path: a sprint gains a pod in place (its star Arrives); a Backlog team opens sideways. */
export async function addArea(area: AreaNodeView): Promise<void> {
  const favorites = await window.starChart.favorites.list(area.projectKey);
  if (favorites.some((f) => f.areaKey === area.areaKey && !f.unavailable)) return;
  const order = Math.max(-1, ...favorites.map((f) => f.displayOrder)) + 1;
  await window.starChart.favorites.save({ areaKey: area.areaKey, projectKey: area.projectKey, path: area.path, label: area.label, displayOrder: order, unavailable: false });
  if (!(await favoritesChanged(area.projectKey))) {
    const entry = scopeEntryOf(useChart.getState().stack);
    const index = entry ? useChart.getState().stack.indexOf(entry) : 1;
    await openSector({ projectKey: area.projectKey, sector: { kind: 'area', areaKey: area.areaKey, path: area.path } }, area.label, index);
  }
}

/** Remove a saved Area Path: a sprint loses the pod in place (its star Departs). */
export async function removeArea(projectKey: CanonicalKey, areaKey: string): Promise<void> {
  await window.starChart.favorites.remove(areaKey);
  await favoritesChanged(projectKey);
}

// ---- Remove from View, where the object is (19 N1, R2) ----

/**
 * What Remove from View does for a selected object, if anything: a galaxy unpins its project (`last`
 * when it's the only one in view, which stays: an empty galaxy is the onboarding cosmos); a pod star
 * in the round unsaves its Area Path. Both are the ▾ menus' removals, local only (INV-21). ADO mode
 * only, as they are.
 */
export type Removable = { kind: 'project'; last: boolean } | { kind: 'area'; projectKey: CanonicalKey };
export function removable(key: CanonicalKey): Removable | null {
  if (!caps().areaTree) return null;
  const st = useChart.getState();
  const top = st.stack.at(-1);
  if (!top) return null;
  if (isRootScene(top.sceneKey)) {
    return st.projects.some((p) => p.key === key) ? { kind: 'project', last: st.projects.length <= 1 } : null;
  }
  const sector = top.scope?.sector;
  if (sector?.kind !== 'sprint' || activeHierarchy().resolve(top.sceneKey)?.index !== 0) return null;
  return sector.pods.some((p) => p.areaKey === key) ? { kind: 'area', projectKey: top.scope!.projectKey } : null;
}

/** Remove a selected galaxy or pod star from the view (it Departs); the selection goes with it. */
export async function removeFromView(key: CanonicalKey): Promise<void> {
  const what = removable(key);
  if (!what || (what.kind === 'project' && what.last)) return;
  select(null);
  if (what.kind === 'project') await unpinProject(key);
  else await removeArea(what.projectKey, key);
}

/**
 * The project's saved Area Paths changed: the chooser re-reads them, and an open scope made of them
 * (a sprint) takes the new set in place. Returns whether it did.
 */
async function favoritesChanged(projectKey: CanonicalKey): Promise<boolean> {
  if (useChart.getState().chooser?.projectKey === projectKey) await loadChooser(projectKey).catch(() => undefined);
  const entry = scopeEntryOf(useChart.getState().stack);
  if (!entry?.scope || entry.scope.projectKey !== projectKey) return false;
  const next = activeUi().rescope?.(entry.scope, await window.starChart.favorites.list(projectKey));
  if (!next) return false;
  await rescope(entry.scope, next, entry.label);
  return true;
}

/**
 * The open scope becomes another with the same scene (decided 2026-10-08): its first look loads, then
 * the scene re-projects as data, so what's new Arrives and what's gone Departs. A scene that's no
 * longer in it (a removed pod) goes back up to the scope.
 */
async function rescope(from: Scope, to: Scope, label: string): Promise<void> {
  const oldId = scopeId(from);
  lastSector.set(to.projectKey, { scope: to, label });
  let h: ScopeHistory;
  try {
    h = await loadScope(to, label, rangeFor(to));
  } catch (e) {
    failed(e);
    return;
  }
  histories.set(scopeId(to), h);
  const st = useChart.getState();
  let stack = st.stack.map((e) => (e.scope && scopeId(e.scope) === oldId ? { ...e, scope: to } : e));
  // Cut at the first scene the new scope can't draw.
  const bad = stack.findIndex((e) => {
    if (!e.scope) return false;
    try { graphFor(e); return false; } catch { return true; }
  });
  const cut = bad > 0;
  if (cut) stack = stack.slice(0, bad);
  st.set({ stack });
  attachHistory(h);
  if (cut) render({ direction: 'out', durationMs: 600 });
  else refresh('data');
  // What joined comes into view (its star may land off screen).
  const was = new Set(from.sector.kind === 'sprint' ? from.sector.pods.map((p) => p.areaKey) : []);
  const joined = to.sector.kind === 'sprint' ? to.sector.pods.find((p) => !was.has(p.areaKey)) : undefined;
  if (joined && !cut) chart?.reveal(joined.areaKey as CanonicalKey);
}

/** Store a reloaded bundle and re-project in place: new objects glide in (05 §5). */
function replace(scope: Scope, h: ScopeHistory, cause: 'jump' | 'data' = 'jump'): void {
  histories.set(scopeId(scope), h);
  if (currentScope() && scopeId(currentScope()!) === scopeId(scope)) {
    attachHistory(h); // re-timed at the same source time
    refresh(cause);
  }
}

function currentScope(): Scope | undefined {
  const st = useChart.getState();
  return [...st.stack].reverse().find((e) => e.scope)?.scope;
}

function failed(e: unknown): void {
  if ((e as { cancelled?: boolean }).cancelled) return; // Esc: nothing to report
  noteIfRefused(e);
  const { message, net } = explainError(e);
  useChart.getState().set({ error: message, errorNet: net });
}

/**
 * Read the open scope from ADO again (the Refresh control, decided 2026-10-09). The scene stays
 * where it is: the new bundle re-projects as data, so what changed arrives or departs.
 */
export async function refreshScope(): Promise<void> {
  const scope = currentScope();
  const st = useChart.getState();
  if (st.refreshing) return;
  // At the galaxy there's no scope: what's refreshed is the project list (and so whether we're offline).
  if (!scope) {
    st.set({ refreshing: true });
    try { await refreshProjects('data'); } catch (e) { failed(e); } finally { useChart.getState().set({ refreshing: false }); }
    return;
  }
  if (!caps().syncsByLevel) return;
  st.set({ refreshing: true });
  try {
    replace(scope, await loadScope(scope, st.stack.at(-1)?.label ?? '', rangeFor(scope), { quiet: true }), 'data');
  } catch (e) {
    failed(e);
  } finally {
    useChart.getState().set({ refreshing: false });
  }
}

/**
 * Add, change or remove a captain's picture by hand (slice 6, 91). Main keeps the file under userData;
 * the open scope then reloads from the cache (no ADO call) so the new picture arrives as data.
 */
export async function setCaptainPicture(captainKey: CanonicalKey, action: 'add' | 'remove'): Promise<PictureResult> {
  const result: PictureResult = action === 'add'
    ? await window.starChart.pictures.add(captainKey)
    : { ok: await window.starChart.pictures.remove(captainKey) };
  const scope = currentScope();
  if (result.ok && scope) {
    // The picture is kept either way; if the cache can't answer right now, it shows at the next load.
    try { replace(scope, await window.starChart.history.load(scope, rangeFor(scope)), 'data'); } catch (e) { warn('picture-reload-failed', { message: String((e as Error).message).slice(0, 120) }); }
  }
  return result;
}

/**
 * The captains Settings → Captain Avatars lists, from what is loaded (so it works offline, from the
 * cache): in a solar system, whoever has work in that system; in a sector, the sector's contributors;
 * from the galaxy, everyone in every loaded scope. Reads the open scene, so call it when the chart
 * store's `stack` or `history` changed.
 */
export function captainRoster(everyone = false): { captains: RosterCaptain[]; kind: 'loaded' | 'sector' | 'system' } {
  const st = useChart.getState();
  const cur = currentScope();
  const top = st.stack.at(-1);
  const at = top ? activeHierarchy().resolve(top.sceneKey) : null;
  if (everyone || !cur || !at) return { captains: mergeRoster([...histories.values()].map((h) => h.entities.captains)), kind: 'loaded' }; // the galaxy
  const h = told(scopeId(cur)) ?? st.history;
  if (!h) return { captains: [], kind: 'sector' };
  const keys = at.index > 0 ? sceneEntityKeys(h, top!.sceneKey, activeHierarchy()) : null;
  return { captains: mergeRoster([captainsInScene(h, keys)]), kind: keys ? 'system' : 'sector' };
}

/** Every loaded bundle with the captains `change` returns something new for; the open scope re-projects at once. */
function patchCaptains(change: (c: RosterCaptain) => RosterCaptain | null, opts: { except?: string } = {}): void {
  const open = currentScope();
  for (const [id, h] of [...histories]) {
    if (id === opts.except) continue;
    let touched = false;
    const captains = h.entities.captains.map((c) => { const n = change(c); if (n && n !== c) touched = true; return n ?? c; });
    if (!touched) continue;
    const next = { ...h, entities: { ...h.entities, captains } };
    if (open && scopeId(open) === id) replace(open, next, 'data');
    else histories.set(id, next);
  }
}

const withPicture = (c: RosterCaptain, avatar: string): RosterCaptain => ({ ...c, avatar, handAdded: true });
const withoutPicture = (c: RosterCaptain): RosterCaptain => ({ key: c.key, displayName: c.displayName, shipSeed: c.shipSeed, callSign: c.callSign });

/**
 * A picture the Settings grid already holds as bytes (chosen, dropped, pasted, cropped): main cuts it
 * to a square and keeps it, and every loaded bundle wears it at once, with no ADO call.
 */
export async function setCaptainPictureBytes(captainKey: CanonicalKey, bytes: Uint8Array): Promise<PictureResult> {
  const r = await window.starChart.pictures.set(captainKey, bytes);
  if (r.ok && r.avatar) patchCaptains((c) => (c.key === captainKey ? withPicture(c, r.avatar!) : null));
  return r;
}

/** Forget a hand-added picture: the open scope reloads from the cache (ADO's own, if any, shows again); the other loaded scopes show initials until opened. */
export async function removeCaptainPicture(captainKey: CanonicalKey): Promise<boolean> {
  const open = currentScope();
  const r = await setCaptainPicture(captainKey, 'remove');
  patchCaptains((c) => (c.key === captainKey ? withoutPicture(c) : null), open ? { except: scopeId(open) } : {});
  return r.ok;
}

/** Pictures read back from an exported folder, by identity ID: every loaded bundle wears them. */
export function applyPicturesById(byId: Record<string, string>): void {
  patchCaptains((c) => { const a = byId[c.key.slice(c.key.lastIndexOf(':') + 1)]; return a ? withPicture(c, a) : null; });
}

/** Scenes played before catch up quietly in the background (decided 2026-10-07). */
function catchUp(scope: Scope, label: string): void {
  const h = told(scopeId(scope));
  if (!h?.coverage.played?.length || useChart.getState().catchingUp) return;
  syncAndLoad(scope, label, rangeFor(scope), { kind: 'catchUp' }).then((next) => replace(scope, next), (e) => warn('catch-up-failed', { message: String((e as Error).message) }));
}

/**
 * The history scene behind a stack entry (decided 2026-10-07): the scope's own (the team), the entry's
 * (a Feature), or for a level that plays its parent's (a close-up), the nearest such entry below it.
 */
export function historySceneOf(stack: NavEntry[], i: number): { kind: 'team' } | { kind: 'feature'; featureKey: CanonicalKey } | null {
  const hier = activeHierarchy();
  for (let j = i; j >= 0; j--) {
    const e = stack[j]!;
    const at = e.scope ? hier.resolve(e.sceneKey) : null;
    if (!at) return null;
    if (at.def.historyScene === 'scope') return { kind: 'team' };
    if (at.def.historyScene === 'self') return { kind: 'feature', featureKey: at.ref.key };
  }
  return null;
}

/** The scene on top of the stack as a history scene: the team, or a Feature. Null for a close-up. */
export function historyScene(): { kind: 'team' } | { kind: 'feature'; featureKey: CanonicalKey } | null {
  const st = useChart.getState();
  const top = st.stack.at(-1);
  const at = top?.scope ? activeHierarchy().resolve(top.sceneKey) : null;
  if (!at || at.def.historyScene === 'parent') return null; // a body's scene plays with its Feature's history
  return historySceneOf(st.stack, st.stack.length - 1);
}

/**
 * The player's state for the scene on screen (decided 2026-10-07): 'ready' when its history is
 * loaded (always, outside level loading), else 'request'. `days` is the range loaded so far.
 */
export function playState(): { state: 'ready' | 'request' | 'gathering'; days: number; done?: number; total?: number } {
  const st = useChart.getState();
  const h = st.history;
  if (!h?.current) return { state: 'ready', days: 0 };
  // A streamed sprint (decided 2026-10-08): its history comes by itself, the scene's own items first.
  // The player is ready once every item in the scene has it.
  const top = st.stack.at(-1);
  if (top?.scope?.sector.kind === 'sprint') {
    const inScene = sceneEntityKeys(h, top.sceneKey, activeHierarchy());
    const items = h.entities.workItems.map((w) => w.key).filter((k) => !inScene || inScene.has(k));
    const have = new Set(h.coverage.history ?? []);
    const done = items.filter((k) => have.has(k)).length;
    return done < items.length ? { state: 'gathering', days: 0, done, total: items.length } : { state: 'ready', days: 0 };
  }
  const scene = historySceneOf(st.stack, st.stack.length - 1);
  const id = scene?.kind === 'feature' ? scene.featureKey : 'team';
  const played = h.coverage.played?.find((p) => p.scene === id);
  return played ? { state: 'ready', days: played.days } : { state: 'request', days: 0 };
}

/** Load the scene's history over the last `days` (the player's request, or Go further back). */
export async function requestHistory(days: number, retry = false): Promise<void> {
  const scope = currentScope();
  const st = useChart.getState();
  const scene = historySceneOf(st.stack, st.stack.length - 1);
  if (!scope || !scene || !defaultRange() || st.historyLoad) return;
  const top = st.stack.at(-1)!;
  // The scene's subject gathers energy while its history loads (decided 2026-10-07): a Feature's sun,
  // a body's planet, or (a team) all its stars, faintly. The camera stays put: the scene stays explorable.
  const at = activeHierarchy().resolve(top.sceneKey);
  if (at && at.def.layout !== 'field') chart?.explore(at.ref.key, { ease: false });
  else chart?.explore((st.graph?.nodes ?? []).filter((n) => n.kind === 'star').map((n) => n.canonicalKey), { ease: false, gentle: true });
  // Starting… (23 B8): the widget answers the click at once, before any IPC returns; the first progress event replaces it.
  st.set({ historyAttempt: null, historyLoad: { jobId: '', days, done: 0, total: 0 } });
  try {
    replace(scope, await syncAndLoad(scope, top.label, rangeFor(scope, days), { kind: 'history', scene, days, ...(retry ? { retry: true as const } : {}) }));
    chart?.endExplore('done');
  } catch (e) {
    useChart.getState().set({ historyLoad: null }); // a start that never got a job leaves no widget behind
    chart?.endExplore('failed');
    // Attempted, not completed: the player offers the same request again (cancelled or failed).
    useChart.getState().set({ historyAttempt: { sceneKey: top.sceneKey, days, outcome: (e as { cancelled?: boolean }).cancelled ? 'cancelled' : 'failed' } });
    failed(e);
  }
}

/** Frame times for the open view (slice 5 profiling), for the coverage panel and the dev log. */
export function frameStats(): { samples: number; p50: number; p95: number; worst: number } {
  return chart?.frameStats() ?? { samples: 0, p50: 0, p95: 0, worst: 0 };
}

/** The empty cosmos's black hole, while the app waits on the network there (decided 2026-10-07). */
export function cosmosEnergy(level: 'idle' | 'gentle' | 'storm'): void {
  chart?.cosmosEnergy(level);
}

/** Load the team's next page of older Features (the Load more beacon, or In view's Load more…). */
export async function loadMore(): Promise<void> {
  const scope = currentScope();
  const st = useChart.getState();
  if (!scope || st.sync) return;
  try {
    replace(scope, await syncAndLoad(scope, st.stack.at(-1)!.label, rangeFor(scope), { kind: 'more' }));
  } catch (e) {
    failed(e);
  }
}

/** The source time on screen: the playhead's state (05 §1), or the range end before playback loads. */
export function displayedUtc(): number {
  const pb = useChart.getState().playback;
  const end = (currentHistory()?.range.endUtc ?? defaultRange()?.endUtc ?? Date.now()) - 1;
  // Nothing to play yet (current state only, decided 2026-10-07): the scene is as it is now.
  if (!pb || pb.beats.length === 0) return end;
  return pb.stateUtc;
}

/** Build the view graph for a stack entry at the playhead, through the current lens. */
export function graphFor(entry: NavEntry): { graph: ViewGraph; history: ScopeHistory | null; snapshot: Snapshot | null } {
  const at = displayedUtc();
  if (isRootScene(entry.sceneKey)) {
    return { graph: projectGalaxy(useChart.getState().projects, at, LAYOUT_VERSION, activeUi().galaxyMeta), history: null, snapshot: null };
  }
  const h = entry.scope ? told(scopeId(entry.scope)) : undefined;
  if (!h) throw new Error(`No history loaded for ${entry.sceneKey}`);
  const snap = snapshotAt(h, at, useChart.getState().lens);
  const graph = projectScene(h, snap, entry.sceneKey, LAYOUT_VERSION, activeHierarchy(), projectOptions(entry.sceneKey));
  wordCounts(graph, h); // a star's counts, in ADO's words (22 A3, B1)
  return { graph, history: h, snapshot: snap };
}

/** The history behind the current stack (the open sector's bundle), if any. */
export function currentHistory(): ScopeHistory | null {
  const st = useChart.getState();
  const entry = [...st.stack].reverse().find((e) => e.scope);
  return entry?.scope ? told(scopeId(entry.scope)) ?? null : null;
}

/**
 * Re-project the current scene at the playhead (a beat crossed, a seek, a lens toggle) without a
 * transition or a selection change. Returns the graphs before and after.
 */
export function refresh(cause: 'beat' | 'jump' | 'data' = 'jump'): { before: ViewGraph | null; after: ViewGraph; snapshot: Snapshot | null } | null {
  const st = useChart.getState();
  const entry = st.stack[st.stack.length - 1];
  if (!entry || !chart) return null;
  const before = st.graph;
  const { graph, history, snapshot } = graphFor(entry);
  st.set({ graph, history, snapshot });
  chart.show(graph, { direction: 'none', cause });
  return { before, after: graph, snapshot };
}

/** The last stack that drew: a scene that fails to draw puts this back, so the breadcrumb never runs ahead of the chart. */
let drawnStack: NavEntry[] = [];

function render(opts: { direction: 'in' | 'out' | 'none'; focus?: { x: number; y: number }; camera?: CamState; durationMs?: number; remount?: boolean }): void {
  const st = useChart.getState();
  const entry = st.stack[st.stack.length - 1];
  if (!entry || !chart) return;
  // Playback is the scene's own (decided 2026-10-08): a new scene gets its own schedule, held at its
  // end, before it's drawn — so what's drawn is where that scope ended up.
  if (entry.sceneKey !== drawnStack.at(-1)?.sceneKey) sceneChanged(isRootScene(entry.sceneKey) ? null : entry.sceneKey);
  let built: ReturnType<typeof graphFor>;
  try {
    built = graphFor(entry);
  } catch (e) {
    // Don't stack crumbs for a scene that never appeared (decided 2026-10-07): undo the move, and say so.
    warn('scene-failed', { level: levelIdOf(entry.sceneKey), message: String((e as Error).message).slice(0, 120) });
    st.set({ stack: drawnStack.length ? drawnStack : st.stack.slice(0, 1), error: 'Couldn’t draw that scene. The details are in the dev log.', errorNet: null });
    chart?.endExplore('failed');
    return;
  }
  drawnStack = st.stack;
  const { graph, history, snapshot } = built;
  st.set({
    graph,
    history,
    snapshot,
    selectedKey: entry.selectedKey ?? null,
  });
  chart.show(graph, opts);
  chart.select(entry.selectedKey ?? null, true);
  // Look here (decided 2026-10-08): a streaming scope fetches this scene's work first.
  if (entry.scope && isStreaming(entry.scope)) void window.starChart.sync.focus(entry.scope, entry.sceneKey).catch(() => undefined);
}

function saveCurrent(selectedKey?: CanonicalKey | null): NavEntry[] {
  const st = useChart.getState();
  const stack = [...st.stack];
  const top = stack[stack.length - 1];
  if (top && chart) stack[stack.length - 1] = { ...top, camera: chart.cameraState(), selectedKey: selectedKey ?? st.selectedKey ?? undefined };
  return stack;
}

export function select(key: CanonicalKey | null): void {
  // The Load more beacon (decided 2026-10-07) is a button, not an object: selecting it loads.
  if (key && useChart.getState().graph?.nodes.find((n) => n.canonicalKey === key && n.selectable)?.role === 'loadMore') {
    void loadMore();
    return;
  }
  useChart.getState().set({ selectedKey: key });
  chart?.select(key);
  const node = useChart.getState().graph?.nodes.find((n) => n.canonicalKey === key);
  if (node?.kind === 'galaxy') void loadChooser(node.canonicalKey).catch(() => warn('chooser-failed', { key: node.canonicalKey }));
}

/** Last sector opened per project; a galaxy's double-click or Enter reopens it. */
const lastSector = new Map<CanonicalKey, { scope: Scope; label: string }>();

/**
 * Enter a node's scene (double-click, Enter, or wheel zoom-through; 06 §3). Galaxies open the
 * last sector used in that project, else its first saved Area Path, else its first Epic.
 * Returns false when the node has nowhere to go.
 */
export async function enterNode(node: ViewNode): Promise<boolean> {
  if (node.role === 'loadMore') {
    await loadMore();
    return true;
  }
  if (node.zoomTo) {
    enter(node.zoomTo, node);
    return true;
  }
  if (node.kind !== 'galaxy') return false;
  return openProject(node.canonicalKey);
}

/** Open a project's default scope: the last one used there, else the hierarchy's choice (06 §3). */
export async function openProject(projectKey: CanonicalKey, from?: number): Promise<boolean> {
  const remembered = lastSector.get(projectKey);
  if (remembered) {
    await openSector(remembered.scope, remembered.label, from);
    return true;
  }
  // One loading moment from the click (decided 2026-10-07): the galaxy gathers energy while its saved
  // areas are looked up, and carries on through the team's load until the sector is on screen.
  if (caps().syncsByLevel) chart?.explore(projectKey);
  let choice: Awaited<ReturnType<ReturnType<typeof activeUi>['defaultScope']>>;
  try {
    choice = await activeUi().defaultScope(projectKey);
  } catch (e) {
    chart?.endExplore('failed');
    throw e;
  }
  if (choice && choice !== 'pick') {
    await openSector(choice.scope, choice.label, from);
    return true;
  }
  // Nothing saved yet: select the project and offer its area tree; picking one opens it. That's the
  // user's choice, so the loading moment ends here; charting the pick starts the next.
  chart?.endExplore('failed');
  if (choice === 'pick') {
    // The empty project (decided 2026-10-07): its Area Paths open over the galaxy, which is brought into view.
    select(projectKey);
    chart?.reveal(projectKey);
    useChart.getState().set({ pickAreaFor: projectKey });
    chart?.releaseWheel(); // no scene change: a pinch that asked to enter can move on
    return true;
  }
  return false;
}

/** Bring an object picked outside the chart (an In view row, a search result) into view (decided 2026-10-07). */
export function reveal(key: CanonicalKey): void {
  chart?.reveal(key);
}

/**
 * The scene's objects as drawn now, each with its centre and radius in canvas CSS px (23 E7): the guided
 * tour anchors to these, never to coordinates of its own. Empty before a chart is attached.
 */
export function liveScreen(): { node: ViewNode; x: number; y: number; r: number; alpha: number }[] {
  if (!chart) return [];
  const k = chart.cameraState().scale;
  const live = chart.nodesNow().filter((n) => n.selectable);
  const alpha = chart.viewAlphas(live.map((n) => n.projectionKey)); // drawn opacity: an entrance isn't seen until it is up
  return live.map((n) => ({ node: n, ...chart!.worldToScreen(n.world.x, n.world.y), r: n.world.r * k, alpha: alpha[n.projectionKey] ?? 1 }));
}

/** Light an object on the chart from outside it (a History card): null clears. */
export function hoverObject(key: CanonicalKey | null): void {
  chart?.hoverKey(key);
}

/** Enter the currently selected node, if it opens a scene. */
export async function enterSelected(): Promise<boolean> {
  const { graph, selectedKey } = useChart.getState();
  const node = graph?.nodes.find((n) => n.canonicalKey === selectedKey && n.selectable);
  return node ? enterNode(node) : false;
}

export function enter(sceneKey: SceneKey, from?: ViewNode): void {
  userNav();
  const st = useChart.getState();
  const top = st.stack[st.stack.length - 1];
  if (!top?.scope) return;
  const at = activeHierarchy().resolve(sceneKey);
  if (!at) return;
  // A level that loads before entering (an unexplored Feature, decided 2026-10-07): it swirls, then opens.
  const h = told(scopeId(top.scope));
  const load = h ? at.def.enterLoad?.(h, at.ref) : null;
  if (load?.kind === 'feature') {
    void explore(top.scope, load.featureKey, () => enter(sceneKey, from), from?.label ?? sceneKey);
    return;
  }
  const tag = `${scopeId(top.scope)}|${sceneKey}`;
  if (load?.kind === 'focus' && isStreaming(top.scope) && !focused.has(tag)) {
    void focusThenEnter(top.scope, sceneKey, at.ref.key, tag, () => enter(sceneKey, from));
    return;
  }
  const stack = saveCurrent(from?.canonicalKey);
  const label = from?.label ?? sceneKey;
  stack.push({ sceneKey, scope: top.scope, label, typeLabel: from?.typeName, selectedKey: at.ref.key });
  st.set({ stack });
  render({ direction: 'in', focus: from ? { x: from.world.x, y: from.world.y } : undefined, durationMs: at.def.durationMs });
}

export async function loadChooser(projectKey: CanonicalKey): Promise<void> {
  // Sprints (and Solar) list the project's sprints; Backlog its Epics (the slow lookup, so only there).
  const sprintsMode = activeUi().chooser === 'sprints';
  const [favorites, epics, sprints] = await Promise.all([
    window.starChart.favorites.list(projectKey),
    sprintsMode ? Promise.resolve([]) : window.starChart.epics.list(projectKey),
    sprintsMode ? window.starChart.iterations.list(projectKey) : Promise.resolve(undefined),
  ]);
  const st = useChart.getState();
  st.set({ chooser: { projectKey, favorites, epics, ...(sprints ? { sprints } : {}) } });
  // ADO favorites are the user's: keep the galaxy's "saved areas" caption in step.
  const p = st.projects.find((x) => x.key === projectKey);
  if (caps().areaTree && p && p.favoriteCount !== favorites.length) {
    st.set({ projects: st.projects.map((x) => (x.key === projectKey ? { ...x, favoriteCount: favorites.length } : x)) });
    if (st.stack.length === 1) refresh();
  }
}

/**
 * Open a sector. Normally it's pushed on top of the stack; with `from`, the stack is cut back to
 * `from` entries first (a sideways move from the breadcrumb's sibling menu).
 */
export async function openSector(scope: Scope, label: string, from?: number): Promise<void> {
  const range = defaultRange();
  if (!range) return;
  userNav();
  const id = scopeId(scope);
  // A scope on hand: show it at once and refresh behind it, quietly (stale-while-revalidate; 04 §5
  // step 7, decided 2026-10-09 — reopening is one of the two things that refreshes).
  if (histories.has(id) && caps().syncsByLevel && !isStreaming(scope)) {
    for (const t of [...focused]) if (t.startsWith(`${id}|`)) focused.delete(t);
    void loadScope(scope, label, rangeFor(scope), { quiet: true }).then((next) => replace(scope, next, 'data'), (e) => warn('revalidate-failed', { message: String((e as Error).message).slice(0, 120) }));
  }
  if (!histories.has(id)) {
    const byLevel = caps().syncsByLevel;
    // Loaded by level, the team's current state comes first (decided 2026-10-07); its galaxy swirls meanwhile.
    if (byLevel) chart?.explore(scope.projectKey);
    try {
      histories.set(id, await loadScope(scope, label, rangeFor(scope)));
    } catch (e) {
      chart?.endExplore('failed');
      failed(e);
      return;
    }
    if (byLevel) {
      const played = told(id)!.coverage.played ?? [];
      // Played before at a longer range: reload at it, so the player's clock covers it.
      if (played.length && rangeFor(scope).startUtc < range.startUtc) histories.set(id, await window.starChart.history.load(scope, rangeFor(scope)));
      catchUp(scope, label);
    }
  }
  attachHistory(histories.get(id)!); // the session carries on in the new scope (05 §2); attachHistory presents it
  lastSector.set(scope.projectKey, { scope, label });
  const st = useChart.getState();
  const hier = activeHierarchy();
  const ref = hier.sceneForScope(scope);
  const sceneKey = hier.format(ref);
  const galaxyNode = st.graph?.nodes.find((n) => n.canonicalKey === scope.projectKey);
  const sideways = from !== undefined;
  const stack = sideways ? st.stack.slice(0, from) : saveCurrent(scope.projectKey);
  if (sideways && stack[0]) stack[0] = { ...stack[0], selectedKey: scope.projectKey };
  const [scopeLevel, memberLevel] = hier.levels;
  const typeLabel = scopeLevel!.vocab.typeLabel(ref, undefined, histories.get(id));
  // A sector with only one member passes straight through to its system: one transition, so the
  // wheel's momentum guard sees a single move (06 §3).
  const only = soleFeature(told(id)!, sceneKey, hier);
  // The member's name: a Feature's title (v0: a member that is no work item, a Sprints pod, never
  // passes through), or under Solar the chain's own label for its region (`hier.labelOf`).
  const memberRef = only && memberLevel ? { level: memberLevel.id, key: only } : null;
  const snap = only ? snapshotAt(told(id)!, displayedUtc(), st.lens) : null;
  const title = !memberRef || !snap ? undefined
    : memberLevel!.layout === 'solar' ? hier.labelOf(snap, told(id)!, memberRef)?.label : snap.workItems.get(only!)?.title;
  const through = only && title !== undefined && memberLevel && memberRef;
  if (through) {
    stack.push({ sceneKey, scope, label, typeLabel, selectedKey: only, passThrough: true });
    stack.push({ sceneKey: hier.format(memberRef), scope, label: title, typeLabel: memberLevel.vocab.typeLabel(memberRef, undefined, histories.get(id)), selectedKey: only });
  } else {
    stack.push({ sceneKey, scope, label, typeLabel });
  }
  st.set({ stack, chooser: null });
  chart?.endExplore('done'); // the release flares as the sector arrives
  render({ direction: 'in', focus: !sideways && galaxyNode ? galaxyNode.world : undefined, durationMs: through ? memberLevel.durationMs : scopeLevel!.durationMs });
}

/** Scenes whose first look a streaming scope has brought in (this stream). */
const focused = new Set<string>();

/**
 * Entering a streamed scene (decided 2026-10-08: a pod): its work jumps the queue and its star swirls
 * until its first look is in, then the scene opens. Main stops nothing already started.
 */
async function focusThenEnter(scope: Scope, sceneKey: SceneKey, key: CanonicalKey, tag: string, then: () => void): Promise<void> {
  chart?.explore(key);
  try {
    await window.starChart.sync.focus(scope, sceneKey);
    const next = await window.starChart.history.load(scope, rangeFor(scope));
    histories.set(scopeId(scope), next);
    attachHistory(next, { reschedule: false });
    refresh('data');
  } catch (e) {
    chart?.endExplore('failed');
    failed(e);
    return;
  }
  focused.add(tag);
  chart?.endExplore('done');
  then();
}

/** Load an unexplored Feature's subtree (current state), with its star swirling; then `then`. Esc cancels. */
async function explore(scope: Scope, featureKey: CanonicalKey, then: () => void, label: string): Promise<void> {
  if (useChart.getState().sync) return;
  chart?.explore(featureKey);
  try {
    replace(scope, await syncAndLoad(scope, label, rangeFor(scope), { kind: 'feature', featureKey }));
  } catch (e) {
    chart?.endExplore('failed');
    failed(e);
    return;
  }
  chart?.endExplore('done');
  const h = told(scopeId(scope))!;
  if (h.coverage.explored?.includes(featureKey)) then();
}

/** Pop to stack index `i` (breadcrumb) or one level (Back). Restores camera and selection. */
export function backTo(i: number): void {
  const st = useChart.getState();
  if (i < 0 || i >= st.stack.length - 1) return;
  userNav();
  const leaving = st.stack[st.stack.length - 1]!;
  const stack = st.stack.slice(0, i + 1);
  st.set({ stack, chooser: null });
  const entry = stack[stack.length - 1]!;
  render({ direction: 'out', camera: entry.camera, durationMs: durationOf(leaving.sceneKey) });
  if (isRootScene(entry.sceneKey) && entry.selectedKey) void loadChooser(entry.selectedKey);
}

/** Return to the galaxy with a project selected, so its sector chooser is open. */
export function backToProject(projectKey: CanonicalKey): void {
  const st = useChart.getState();
  const stack = [...st.stack];
  if (stack[0]) stack[0] = { ...stack[0], selectedKey: projectKey };
  st.set({ stack });
  backTo(0);
}

/** Up one level, passing over a one-Feature sector (06 §3): from its Feature, back to the galaxy's chooser. */
export function back(): void {
  const { stack } = useChart.getState();
  let i = stack.length - 2;
  while (i > 0 && stack[i]!.passThrough) i--;
  backTo(i);
}

export interface SearchResult { key: CanonicalKey; id: number; title: string; type: string }

/** Search the loaded bundle by ID or title (06 §3). */
export function search(query: string): SearchResult[] {
  const { history, snapshot, stack, projects } = useChart.getState();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  // In the galaxy, search finds projects by name (decided 2026-10-07: orgs can hold hundreds).
  if (stack.length === 1 && isRootScene(stack[0]?.sceneKey)) {
    return projects.filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .slice(0, 12).map((p) => ({ key: p.key, id: 0, title: p.name, type: 'Project' }));
  }
  if (!history || !snapshot) return [];
  const out: SearchResult[] = [];
  for (const wi of snapshot.workItems.values()) {
    const id = workItemId(wi.key);
    if (String(id) === q.replace(/^#/, '') || wi.title.toLowerCase().includes(q)) out.push({ key: wi.key, id, title: wi.title, type: wi.type });
  }
  return out.sort((a, b) => a.id - b.id).slice(0, 12);
}

/**
 * Land on the target's scene with the right breadcrumb; only the last step animates. Following a
 * captain passes `opts`: the snapshot to read the target's family from (the anchor's moment), and what
 * to select. A body that doesn't exist yet at the playhead opens its Feature instead. Returns whether
 * the scene changed.
 */
export function goTo(key: CanonicalKey, opts: { snapshot?: Snapshot; select?: CanonicalKey } = {}): boolean {
  userNav();
  const st = useChart.getState();
  const snapshot = opts.snapshot ?? st.snapshot;
  const hier = activeHierarchy();
  const sector = scopeEntryOf(st.stack);
  const h = sector?.scope ? told(scopeId(sector.scope)) : undefined;
  if (!snapshot || !sector?.scope || !h) return false;
  // The scenes that lead to it, below the sector. The deepest one not there yet at the playhead opens
  // its parent instead; a missing first one means there's nowhere to go. (A Sprints pod is an area
  // path, not a work item: the hierarchy names each scene.)
  const path = hier.pathTo(snapshot, key, h);
  const shown = (ref: (typeof path)[number]) => !st.snapshot || hier.labelOf(st.snapshot, h, ref) !== null;
  if (path.length > 1 && !shown(path.at(-1)!)) path.pop();
  if (!path.length || !shown(path[0]!)) return false;
  const target = hier.format(path.at(-1)!);
  if (st.stack.at(-1)?.sceneKey === target) {
    if (opts.select) select(opts.select);
    return false;
  }
  const base = saveCurrent().slice(0, st.stack.indexOf(sector) + 1);
  path.forEach((ref, i) => {
    const at = hier.resolve(hier.format(ref))!;
    const named = hier.labelOf(snapshot, h, ref) ?? { label: ref.key };
    const last = i === path.length - 1;
    // Each scene selects the next one's item; the last selects what was asked for (the item itself in a close-up).
    const selectedKey = !last ? path[i + 1]!.key : opts.select ?? (at.index === hier.levels.length - 1 ? key : ref.key);
    base.push({ sceneKey: hier.format(ref), scope: sector.scope, label: named.label, typeLabel: at.def.vocab.typeLabel(ref, named.typeName, h), selectedKey });
  });
  st.set({ stack: base });
  render({ direction: 'in', durationMs: 600 });
  return true;
}

/** Replace stack entry `index` (and everything above it) with a sibling's scene, sideways. */
export function switchEntry(index: number, node: ViewNode): void {
  userNav();
  const st = useChart.getState();
  const top = st.stack[index];
  if (!top?.scope || !node.zoomTo) return;
  const stack = st.stack.slice(0, index);
  const parent = stack[stack.length - 1];
  if (parent) stack[stack.length - 1] = { ...parent, selectedKey: node.canonicalKey };
  const at = activeHierarchy().resolve(node.zoomTo);
  if (!at) return;
  stack.push({ sceneKey: node.zoomTo, scope: top.scope, label: node.label, typeLabel: node.typeName, selectedKey: at.ref.key });
  st.set({ stack });
  render({ direction: 'in', durationMs: at.def.durationMs });
}
