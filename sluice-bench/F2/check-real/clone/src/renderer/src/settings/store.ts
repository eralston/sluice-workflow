// The Settings modal's state and the user's settings, renderer side (v1, 13 §7, 14 §2.9). The saved
// settings live in main (userData/settings.json); this store holds the last copy main answered, and
// applies a change at once while main saves it. Without a settings bridge (a gallery window) the
// defaults are used and changes last for this run only; with one that fails (main hasn't registered
// the channels yet), the read and the unsaved changes are tried again at the next change.
//
// The Connection tab has no open state of its own: the chart store's `connectOpen` is the source of
// truth, so the mode chip, the empty cosmos and the object list open it unchanged (17 W2-T6).
import { create } from 'zustand';
import { defaultUserSettings, mergeUserSettings, userSettingsPatchSchema, type UserSettings } from '@shared/contracts/settings';
import { useChart } from '../store';

export type SettingsTab = 'connection' | 'theme' | 'captain' | 'avatars' | 'read';
export const SETTINGS_TABS: { id: SettingsTab; title: string }[] = [
  { id: 'connection', title: 'Connection' },
  { id: 'theme', title: 'Theme' },
  { id: 'captain', title: 'Your captain' },
  { id: 'avatars', title: 'Captain Avatars' },
  { id: 'read', title: 'How to read the chart' },
];

interface SettingsState {
  settings: UserSettings;
  /** Main has answered at least once. */
  loaded: boolean;
  /** Changes are being saved to userData (false: this run only). */
  persisted: boolean;
  /** The modal, for every tab but Connection (that one is `connectOpen`). */
  open: boolean;
  /** The last tab chosen other than Connection. */
  tab: Exclude<SettingsTab, 'connection'>;
  /** A mounted modal hosts the Connection tab, so the floating Connect panel stands down. */
  hostsConnection: boolean;
  /**
   * A v0 view was chosen with the developer toggle this run (13 Q9, views.ts): the cog stays in the
   * title bar under it, so Solar is one click back. A v0 view pinned at launch never sets it.
   */
  devView: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  settings: defaultUserSettings(),
  loaded: false,
  persisted: false,
  open: false,
  tab: 'captain',
  hostsConnection: false,
  devView: false,
  set: (patch) => set(patch),
}));

let loading: Promise<UserSettings> | null = null;
/**
 * Changes main hasn't saved yet, oldest first. A failed save (no handler yet, a dropped IPC) keeps
 * them here, and the next save that gets through sends them first, so one failure never leaves the
 * run on run-only settings for good.
 */
let unsaved: Partial<UserSettings>[] = [];
/** Saves go one at a time, in order. */
let saving: Promise<unknown> = Promise.resolve();

/** The local copy: main's answer with any changes it hasn't saved yet laid over it. */
const withUnsaved = (s: UserSettings) => unsaved.reduce(mergeUserSettings, s);

/**
 * Reads the settings from main (later calls share the answer). A failed read is asked again on the
 * next call, so a handler registered late is still found. Never throws.
 */
export function loadSettings(): Promise<UserSettings> {
  loading ??= (async () => {
    const api = window.starChart?.settings;
    if (api) {
      try {
        const s = await api.get();
        useSettings.getState().set({ settings: withUnsaved(s), loaded: true, persisted: !unsaved.length });
        // Changes a failed save kept go now, so a read that gets through never leaves them unsent.
        if (unsaved.length) await flush(api);
        return useSettings.getState().settings;
      } catch {
        // No handler yet: run on the defaults (and what was changed), and ask again next time.
        loading = null;
      }
    }
    useSettings.getState().set({ loaded: true, persisted: false });
    return useSettings.getState().settings;
  })();
  return loading;
}

/**
 * Applies a change now and saves it; main's answer (validated) replaces the local copy. A patch the
 * schema refuses changes nothing. A save that fails is kept and sent again with the next change.
 */
export async function patchSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  if (!userSettingsPatchSchema.safeParse(patch).success) return useSettings.getState().settings;
  await loadSettings();
  const st = useSettings.getState();
  const local = mergeUserSettings(st.settings, patch);
  st.set({ settings: local });
  const api = window.starChart?.settings;
  if (!api) return local;
  unsaved.push(patch);
  await flush(api);
  return useSettings.getState().settings;
}

type SettingsApi = NonNullable<NonNullable<Window['starChart']>['settings']>;

/** Sends the unsaved changes, oldest first, after any save already under way. Stops at a failure. */
function flush(api: SettingsApi): Promise<void> {
  const run = saving.then(async () => {
    while (unsaved.length) {
      try {
        const saved = await api.set(unsaved[0]!);
        unsaved.shift();
        useSettings.getState().set({ settings: withUnsaved(saved), persisted: true });
      } catch {
        useSettings.getState().set({ persisted: false });
        return;
      }
    }
  });
  saving = run;
  return run;
}

/** Tests only: forget the last read and any unsaved changes, back to the defaults. */
export function resetSettingsStore(): void {
  loading = null;
  unsaved = [];
  saving = Promise.resolve();
  useSettings.getState().set({ settings: defaultUserSettings(), loaded: false, persisted: false });
}

/** Calls `fn` after every change to the saved settings (W3-T1 re-shows the scene on one). */
export function onSettingsChange(fn: (s: UserSettings, prev: UserSettings) => void): () => void {
  return useSettings.subscribe((s, p) => { if (s.settings !== p.settings) fn(s.settings, p.settings); });
}

// ---- The modal ----

/** Whether the modal shows, and which tab: Connection whenever `connectOpen` is set and the modal hosts it. */
export function useSettingsView(): { open: boolean; tab: SettingsTab } {
  const connect = useChart((s) => s.connectOpen);
  const { open, tab, hostsConnection } = useSettings();
  const onConnection = hostsConnection && connect;
  return { open: open || onConnection, tab: onConnection ? 'connection' : tab };
}

/** Whether the modal is up (the App's key handler stands down while it is). */
export function settingsOpen(): boolean {
  const s = useSettings.getState();
  return s.open || (s.hostsConnection && useChart.getState().connectOpen);
}

export function openSettings(tab?: SettingsTab): void {
  void loadSettings();
  const st = useSettings.getState();
  const next = tab ?? st.tab;
  // Connection is shown by `connectOpen` alone, so the mode chip's toggle closes it as before.
  if (next === 'connection') { st.set({ open: false }); useChart.getState().set({ connectOpen: true }); return; }
  st.set({ open: true, tab: next });
  useChart.getState().set({ connectOpen: false });
}

export function chooseTab(tab: SettingsTab): void {
  openSettings(tab);
}

export function closeSettings(): void {
  useSettings.getState().set({ open: false });
  if (useChart.getState().connectOpen) useChart.getState().set({ connectOpen: false, connectFocus: null });
}
