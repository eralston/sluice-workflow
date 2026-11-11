// The active device profile (15 §11), read at the moment of use, never at import, so a test can flip
// a switch off and on in one run. Main resolved it before the window opened (preload `env.profile`);
// with no window (the gallery, unit tests) it is desktop. Playback reads its pacing budgets (v1.4 C4b).
import type { DeviceProfile, ProfileState } from '@shared/contracts/profile';
import { DESKTOP } from '@shared/profile/bundled';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

let patch: DeepPartial<DeviceProfile> | null = null;
let patched: DeviceProfile | null = null;
const listeners = new Set<(p: DeviceProfile) => void>();

const launched = (): DeviceProfile =>
  (typeof window !== 'undefined' ? (window.starChart?.env?.profile?.profile as DeviceProfile | undefined) : undefined) ?? DESKTOP;

/** What the profile holds now: the launch profile with any test patch applied. */
export function activeProfile(): DeviceProfile {
  if (!patch) return launched();
  const b = launched();
  patched ??= {
    ...b,
    pacing: { ...b.pacing, ...patch.pacing },
    render: {
      budget: { ...b.render.budget, ...patch.render?.budget },
      limits: { ...b.render.limits, ...patch.render?.limits },
      switches: { ...b.render.switches, ...patch.render?.switches },
    },
  };
  return patched;
}

/** The whole resolved state (source, notice) for the Settings display. */
export function profileState(): ProfileState | null {
  return (typeof window !== 'undefined' ? window.starChart?.env?.profile : undefined) ?? null;
}

/** Test hook only: overlays values on the launch profile; null clears it. */
export function patchProfile(partial: DeepPartial<DeviceProfile> | null): void {
  patch = partial;
  patched = null;
  const now = activeProfile();
  for (const cb of listeners) cb(now);
}

export function onProfile(cb: (p: DeviceProfile) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
