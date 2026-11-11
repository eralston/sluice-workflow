// The user's settings file (v1, 14 §2.9; 17 W2-T6): a round trip through userData/settings.json, a
// corrupt or foreign file reads as the defaults, a Purge of the cache leaves it, and the dev log
// carries only the changed field and a salted hash of its value. Electron is mocked: `app.getPath`
// answers a temporary userData, and `ipcMain` records the handlers so the IPC path runs for real.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CH } from '@shared/contracts/ipc';
import { defaultUserSettings, type UserSettings } from '@shared/contracts/settings';
import type { StateMapping } from '@shared/contracts/history';
import type { UtcMs } from '@shared/contracts/keys';
import stateMappingJson from '@config/state-mapping.json';

const electron = vi.hoisted(() => ({
  userData: '',
  handlers: new Map<string, (e: unknown, ...args: unknown[]) => unknown>(),
}));
vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? electron.userData : tmpdir()) },
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, ...args: unknown[]) => unknown) => { electron.handlers.set(ch, fn); },
    removeHandler: (ch: string) => { electron.handlers.delete(ch); },
  },
}));

const { readUserSettings, registerSettingsIpc, resetUserSettings, settingsPath, SETTINGS_FILE, userSettings, UserSettingsStore, valueHash } =
  await import('../../src/main/userSettings');
const { startDevLog, stopDevLog } = await import('../../src/main/devlog');
const { AdoService } = await import('../../src/main/ado/service');

// Invented tenants and people (INV-18).
const ORG_A = '0b5c7d2e-1111-4a6b-9c3d-5e7f9a1b2c3d';
const ORG_B = '7e1f3a5c-2222-4b8d-8e0f-1a3c5e7f9b2d';
const WREN = `id:${ORG_A}:4c2a9e61-3333-4f5a-b7c9-d1e3f5a7b9c1` as const;
const OSSIAN = `id:${ORG_B}:9d8c7b6a-4444-4e3f-a2b1-c0d9e8f7a6b5` as const;

const call = (ch: string, ...args: unknown[]) => electron.handlers.get(ch)!({}, ...args) as UserSettings;

beforeEach(() => {
  electron.userData = mkdtempSync(join(tmpdir(), 'star-chart-settings-'));
  electron.handlers.clear();
  resetUserSettings();
});
afterEach(() => {
  stopDevLog();
  rmSync(electron.userData, { recursive: true, force: true });
});

describe('userData/settings.json', () => {
  it('lives in userData, beside the window state, never in the repo', () => {
    expect(userSettings().file).toBe(join(electron.userData, SETTINGS_FILE));
    expect(settingsPath(electron.userData)).toBe(join(electron.userData, 'settings.json'));
  });

  it('round-trips: a missing file reads as the defaults; every field saves and reads back; tenants merge', () => {
    const file = settingsPath(electron.userData);
    expect(readUserSettings(file)).toEqual(defaultUserSettings());
    const s = new UserSettingsStore(file);
    s.set({ viewer: { [ORG_A]: WREN }, captain: { [ORG_A]: { faction: 'mecha', hull: 7, colourway: 3 } } });
    s.set({ viewer: { [ORG_B]: OSSIAN }, achievements: false, theme: 'star-chart' });
    const want: UserSettings = {
      version: 1, theme: 'star-chart', achievements: false,
      viewer: { [ORG_A]: WREN, [ORG_B]: OSSIAN },
      captain: { [ORG_A]: { faction: 'mecha', hull: 7, colourway: 3 } },
    };
    expect(s.get()).toEqual(want);
    expect(readUserSettings(file)).toEqual(want);
    expect(new UserSettingsStore(file).get()).toEqual(want);
    expect(existsSync(`${file}.tmp`)).toBe(false);
    // Clearing one tenant's viewer keeps the other's.
    s.set({ viewer: { [ORG_A]: null } });
    expect(readUserSettings(file).viewer).toEqual({ [ORG_A]: null, [ORG_B]: OSSIAN });
  });

  it('remembers the developer toggle’s view (23 E3): missing reads as Solar, a saved view reads back, a bad one is refused', () => {
    const file = settingsPath(electron.userData);
    const s = new UserSettingsStore(file);
    expect(s.get().devParadigm ?? 'solar').toBe('solar');
    // A file from before the field still reads (it is optional).
    writeFileSync(file, JSON.stringify(defaultUserSettings()));
    expect(new UserSettingsStore(file).get().devParadigm).toBeUndefined();
    s.set({ devParadigm: 'sprints' });
    s.set({ achievements: false }); // another patch keeps it
    expect(readUserSettings(file).devParadigm).toBe('sprints');
    expect(() => s.set({ devParadigm: 'galaxy' })).toThrow();
    s.set({ devParadigm: 'solar' });
    expect(new UserSettingsStore(file).get().devParadigm).toBe('solar');
  });

  it('reads a corrupt or foreign file as the defaults, and the next change writes a good one', () => {
    const file = settingsPath(electron.userData);
    const bad = [
      '{ not json',
      '',
      JSON.stringify({ ...defaultUserSettings(), version: 2 }),
      JSON.stringify({ ...defaultUserSettings(), viewer: { [ORG_A]: 'Wren Calloway' } }), // a name, never a key
      JSON.stringify({ ...defaultUserSettings(), captain: { [ORG_A]: { faction: 'pirate', hull: 0, colourway: 0 } } }),
      JSON.stringify([1, 2, 3]),
    ];
    for (const text of bad) {
      writeFileSync(file, text);
      expect(readUserSettings(file), text).toEqual(defaultUserSettings());
    }
    const s = new UserSettingsStore(file);
    s.set({ achievements: false });
    expect(readUserSettings(file)).toEqual({ ...defaultUserSettings(), achievements: false });
  });

  it('refuses a bad patch over IPC and keeps the file as it was', () => {
    registerSettingsIpc();
    call(CH.settingsSet, { viewer: { [ORG_A]: WREN } });
    const before = readFileSync(settingsPath(electron.userData), 'utf8');
    for (const patch of [{ viewer: { [ORG_A]: 'Wren Calloway' } }, { captain: { [ORG_A]: { faction: 'trek', hull: -1, colourway: 0 } } }, { achievements: 'yes' }, null]) {
      expect(() => call(CH.settingsSet, patch)).toThrow();
    }
    expect(readFileSync(settingsPath(electron.userData), 'utf8')).toBe(before);
    expect(call(CH.settingsGet).viewer).toEqual({ [ORG_A]: WREN });
  });

  it('survives a Purge: AdoService.purge empties the cache and leaves settings.json as it was', () => {
    registerSettingsIpc();
    const saved = call(CH.settingsSet, {
      viewer: { [ORG_A]: WREN }, captain: { [ORG_A]: { faction: 'wars', hull: 4, colourway: 5 } }, achievements: false,
    });
    const file = settingsPath(electron.userData);
    const before = readFileSync(file, 'utf8');
    // The real purge path: the service main builds, with its cache in the same userData folder.
    const service = new AdoService({
      dbDir: electron.userData,
      picturesDir: join(electron.userData, 'pictures'),
      credentials: { kind: 'memory', get: () => null, set: async () => undefined, clear: async () => undefined, load: async () => undefined },
      mapping: stateMappingJson as StateMapping,
      clock: () => 0 as UtcMs,
      transportFor: () => ({ send: () => Promise.reject(new Error('offline')) }),
      send: () => undefined,
      openExternal: async () => undefined,
    });
    try {
      service.cache.setSetting('probe', 'cached fact');
      expect(service.cache.setting('probe')).toBe('cached fact');
      expect(service.dbPath.startsWith(electron.userData)).toBe(true);
      expect(service.dbPath).not.toBe(file);
      service.purge();
      expect(service.cache.setting('probe')).toBeNull(); // the cache really is empty
    } finally {
      service.cache.close();
    }
    expect(readFileSync(file, 'utf8')).toBe(before);
    resetUserSettings(); // a relaunch
    registerSettingsIpc();
    expect(call(CH.settingsGet)).toEqual(saved);
    expect(call(CH.settingsGet)).toMatchObject({ achievements: false, viewer: { [ORG_A]: WREN }, captain: { [ORG_A]: { faction: 'wars' } } });
  });
});

describe('the dev log', () => {
  it('records the changed field and a salted hash only: never the viewer, a name or the org', () => {
    const salt = Buffer.from('invented-salt-for-the-test');
    writeFileSync(join(electron.userData, 'devlog-salt'), salt);
    const logs = join(electron.userData, 'logs');
    const log = startDevLog(logs, salt, () => ['Wren Calloway']);
    registerSettingsIpc();
    const saved = call(CH.settingsSet, { viewer: { [ORG_A]: WREN } });
    call(CH.settingsSet, { captain: { [ORG_A]: { faction: 'trek', hull: 1, colourway: 2 } } });
    call(CH.settingsSet, { achievements: true }); // unchanged: nothing logged

    const lines = readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
    const sets = lines.filter((l) => l.kind === 'settings-set');
    expect(sets.map((l) => l.field)).toEqual(['viewer', 'captain']);
    for (const l of sets) {
      expect(Object.keys(l).sort()).toEqual(['at', 'field', 'kind', 'src', 't', 'valueHash']);
      expect(Number.isSafeInteger(l.valueHash)).toBe(true);
    }
    expect(sets[0]!.valueHash).toBe(valueHash(salt, saved.viewer));
    expect(sets[0]!.valueHash).not.toBe(valueHash(Buffer.from('another-salt'), saved.viewer));
    // Nothing about the patch reaches the log in the clear: no ipc line carries it either.
    const text = readFileSync(log, 'utf8');
    for (const s of [ORG_A, WREN, WREN.slice(WREN.lastIndexOf(':') + 1), 'trek', 'Wren']) expect(text).not.toContain(s);
    expect(lines.some((l) => l.kind === 'ipc')).toBe(false);
  });

  it('writes nothing when the dev log is off', () => {
    writeFileSync(join(electron.userData, 'devlog-salt'), 'salt');
    registerSettingsIpc();
    call(CH.settingsSet, { achievements: false });
    expect(existsSync(join(electron.userData, 'logs'))).toBe(false);
  });
});

describe('the renderer store (settings/store.ts)', () => {
  // Renderer code, outside this project's tsconfig: loaded by a runtime path (as signal.test.ts does).
  const STORE = join(__dirname, '../../src/renderer/src/settings/store.ts');
  type Store = {
    useSettings: { getState(): { settings: UserSettings; persisted: boolean; loaded: boolean } };
    loadSettings(): Promise<UserSettings>;
    patchSettings(p: Partial<UserSettings>): Promise<UserSettings>;
    resetSettingsStore(): void;
  };
  const load = async () => (await import(/* @vite-ignore */ STORE)) as Store;

  /** A settings bridge in front of a real main store, which fails while `down` is set. */
  function bridge(file: string) {
    const main = new UserSettingsStore(file);
    const b = {
      down: false, gets: 0, sets: 0,
      get: async () => { b.gets++; if (b.down) throw new Error('No handler registered'); return main.get(); },
      set: async (patch: unknown) => { b.sets++; if (b.down) throw new Error('No handler registered'); return main.set(patch); },
    };
    return b;
  }

  afterEach(() => { vi.unstubAllGlobals(); });

  it('one failed save does not leave the run unsaved for good: the next change sends both', async () => {
    const st = await load();
    st.resetSettingsStore();
    const file = settingsPath(electron.userData);
    const api = bridge(file);
    vi.stubGlobal('window', { starChart: { settings: api } });
    await st.loadSettings();
    expect(st.useSettings.getState().persisted).toBe(true);

    api.down = true;
    await st.patchSettings({ achievements: false });
    expect(st.useSettings.getState()).toMatchObject({ persisted: false, settings: { achievements: false } });
    expect(readUserSettings(file).achievements).toBe(true); // not saved yet

    api.down = false;
    await st.patchSettings({ viewer: { [ORG_A]: WREN } });
    expect(st.useSettings.getState().persisted).toBe(true);
    // Both changes reached the file, the failed one first.
    expect(readUserSettings(file)).toMatchObject({ achievements: false, viewer: { [ORG_A]: WREN } });
    expect(st.useSettings.getState().settings).toEqual(readUserSettings(file));
  });

  it('a read that failed is asked again, and changes made meanwhile are kept on top of it', async () => {
    const st = await load();
    st.resetSettingsStore();
    const file = settingsPath(electron.userData);
    new UserSettingsStore(file).set({ viewer: { [ORG_B]: OSSIAN } });
    const api = bridge(file);
    api.down = true;
    vi.stubGlobal('window', { starChart: { settings: api } });
    await st.loadSettings();
    expect(st.useSettings.getState()).toMatchObject({ loaded: true, persisted: false });
    await st.patchSettings({ achievements: false });
    expect(st.useSettings.getState().persisted).toBe(false);

    api.down = false; // main registers the handlers late
    await st.loadSettings();
    expect(st.useSettings.getState()).toMatchObject({ persisted: true, settings: { achievements: false, viewer: { [ORG_B]: OSSIAN } } });
    // The read that got through sent the queued change too: it's saved before any other change.
    expect(readUserSettings(file)).toMatchObject({ achievements: false, viewer: { [ORG_B]: OSSIAN } });
  });

  it('refuses a patch the schema refuses, locally too', async () => {
    const st = await load();
    st.resetSettingsStore();
    const api = bridge(settingsPath(electron.userData));
    vi.stubGlobal('window', { starChart: { settings: api } });
    await st.loadSettings();
    const before = st.useSettings.getState().settings;
    await st.patchSettings({ viewer: { [ORG_A]: 'Wren Calloway' as never } });
    expect(st.useSettings.getState().settings).toBe(before);
    expect(api.sets).toBe(0);
  });
});
