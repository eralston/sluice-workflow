// The user's settings (v1, 14 §2.9): one JSON file at userData/settings.json, modelled on
// windowState.ts. It sits beside the window state, never in the SQLite cache, so a Purge leaves it
// (14 D5): the viewer, their ship and the achievements switch outlive the cached facts. Validated with
// zod on read, on every IPC crossing and on write. A missing or corrupt file reads as the defaults.
// The dev log records only which field changed and a salted hash of its new value (03 §10), never the
// value, a name or an org key.
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, ipcMain } from 'electron';
import { ZodError } from 'zod';
import { CH } from '@shared/contracts/ipc';
import { defaultUserSettings, mergeUserSettings, userSettingsPatchSchema, userSettingsSchema, type UserSettings } from '@shared/contracts/settings';
import { devlog } from './devlog';

export const SETTINGS_FILE = 'settings.json';
/** The devlog's salt, written by main/index.ts before the log starts. */
const SALT_FILE = 'devlog-salt';

export const settingsPath = (dir: string) => join(dir, SETTINGS_FILE);

/** The saved settings, or the defaults when the file is missing, unreadable or fails the schema. */
export function readUserSettings(file: string): UserSettings {
  try {
    const parsed = userSettingsSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) return parsed.data;
    devlog.write('main', 'settings-corrupt', { reason: 'schema' });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') devlog.write('main', 'settings-corrupt', { reason: 'parse' });
  }
  return defaultUserSettings();
}

/** Validates and writes the whole file, through a temporary file so a crash never leaves half of one. */
export function writeUserSettings(file: string, s: UserSettings): UserSettings {
  const valid = userSettingsSchema.parse(s);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(valid, null, 2));
  renameSync(tmp, file);
  return valid;
}

/** The top-level fields a patch changed: `viewer` and `captain` count when any tenant's entry did. */
export function changedFields(before: UserSettings, after: UserSettings): (keyof Omit<UserSettings, 'version'>)[] {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return (['theme', 'achievements', 'viewer', 'captain'] as const).filter((f) => !same(before[f], after[f]));
}

/**
 * A field's new value as a salted hash, a whole number so the redactor keeps it as is (it replaces
 * free strings in unknown fields). Stable on this Mac, unreadable elsewhere. Keys are sorted, so the
 * same value always hashes the same.
 */
export function valueHash(salt: Buffer | string, value: unknown): number {
  const canonical = (v: unknown): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
      : v;
  const hex = createHmac('sha256', salt).update(JSON.stringify(canonical(value) ?? null)).digest('hex');
  return parseInt(hex.slice(0, 12), 16);
}

/** The settings file, read once and kept in memory; every change is merged, validated and saved. */
export class UserSettingsStore {
  private current: UserSettings | null = null;

  constructor(readonly file: string, private readonly salt: () => Buffer | null = () => null) {}

  get(): UserSettings {
    this.current ??= readUserSettings(this.file);
    return this.current;
  }

  /** Merges a patch (validated here too: the IPC handler passes it raw) and answers the saved whole. */
  set(patch: unknown): UserSettings {
    const p = userSettingsPatchSchema.parse(patch);
    const before = this.get();
    const next = mergeUserSettings(before, p);
    try {
      this.current = writeUserSettings(this.file, next);
    } catch (e) {
      // A refused value throws to the caller; a disk failure keeps the change for this run only.
      if (e instanceof ZodError) throw e;
      this.current = userSettingsSchema.parse(next);
      devlog.write('main', 'settings-unsaved', { errorClass: e instanceof Error ? e.name : 'unknown' });
    }
    this.log(before, this.current);
    return this.current;
  }

  private log(before: UserSettings, after: UserSettings): void {
    if (!devlog.on) return;
    const salt = this.salt();
    if (!salt) return;
    for (const field of changedFields(before, after)) devlog.write('main', 'settings-set', { field, valueHash: valueHash(salt, after[field]) });
  }
}

let store: UserSettingsStore | null = null;

/** The process's settings (main), for anything in main that needs them, such as a later boot read. */
export function userSettings(): UserSettingsStore {
  if (!store) {
    const dir = app.getPath('userData');
    store = new UserSettingsStore(settingsPath(dir), () => {
      const f = join(dir, SALT_FILE);
      try { return existsSync(f) ? readFileSync(f) : null; } catch { return null; }
    });
  }
  return store;
}

/**
 * CH.settingsGet and CH.settingsSet. Registered straight on ipcMain rather than through index.ts's
 * logging wrapper, so a patch (which names the org and the viewer) never reaches the dev log's `ipc`
 * line: the `settings-set` line above is all it records. Safe to call twice.
 */
export function registerSettingsIpc(s: UserSettingsStore = userSettings()): void {
  ipcMain.removeHandler(CH.settingsGet);
  ipcMain.removeHandler(CH.settingsSet);
  ipcMain.handle(CH.settingsGet, () => s.get());
  ipcMain.handle(CH.settingsSet, (_e, patch: unknown) => s.set(patch));
}

/** For tests: forget the process's store. */
export function resetUserSettings(): void {
  store = null;
}
