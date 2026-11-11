// The device profile (15 §11): reads userData/profile.json, honours STAR_CHART_PROFILE in unpackaged
// runs, resolves, and hands the state to the renderer as a launch argument so the first schedule
// already has the right budgets (no IPC, no async boot). The dev log gets codes only, never values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProfile } from '@shared/profile/resolve';
import type { ProfileState } from '@shared/contracts/profile';
import { devlog } from './devlog';

export const PROFILE_FILE = 'profile.json';
export const PROFILE_ARG = '--star-chart-profile=';

export function loadProfile(userDataDir: string, env: { pinned?: string; packaged: boolean }): ProfileState {
  let overrideText: string | null = null;
  try { overrideText = readFileSync(join(userDataDir, PROFILE_FILE), 'utf8'); } catch { /* missing or unreadable: no override */ }
  const state = resolveProfile({ overrideText, pinned: env.packaged ? undefined : env.pinned });
  devlog.write('main', 'profile', { source: state.source });
  if (state.reason) devlog.write('main', 'profile-fallback', { reason: state.reason });
  return state;
}

export const profileArgument = (s: ProfileState) => `${PROFILE_ARG}${encodeURIComponent(JSON.stringify(s))}`;
