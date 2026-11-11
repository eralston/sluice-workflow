// Picks the active device profile (15 §11): a pinned id, else the override's `profile` key, else
// desktop, with the override's values merged over it. Pure: main reads the file and passes its text.
// Any fault uses the bundled base alone, with a one-line notice and a reason code (never a value).
import {
  deviceProfileSchema, profileIdSchema, profileOverrideSchema,
  type DeviceProfile, type ProfileOverride, type ProfileState,
} from '../contracts/profile';
import { BUNDLED } from './bundled';

type Fault = NonNullable<ProfileState['reason']>;
const NOTICES: Record<Fault, string> = {
  'parse': 'profile.json is not valid JSON: using the bundled profile.',
  'schema': 'profile.json has an unknown key or a value out of range: using the bundled profile.',
  'merged': 'profile.json does not fit the chosen profile: using the bundled profile.',
  'unknown-id': 'The pinned profile is not one of the bundled profiles: using the bundled profile.',
};

const merge = (base: DeviceProfile, o: ProfileOverride): unknown => ({
  ...base,
  pacing: { ...base.pacing, ...o.pacing },
  render: {
    budget: { ...base.render.budget, ...o.render?.budget },
    limits: { ...base.render.limits, ...o.render?.limits },
    switches: { ...base.render.switches, ...o.render?.switches },
  },
});

export function resolveProfile(input: { overrideText: string | null; pinned?: string }): ProfileState {
  const pin = input.pinned === undefined || input.pinned === '' ? null : profileIdSchema.safeParse(input.pinned);
  const pinnedId = pin?.success ? pin.data : null;
  let fault: Fault | null = pin && !pin.success ? 'unknown-id' : null;

  let override: ProfileOverride | null = null;
  if (input.overrideText !== null) {
    try {
      const parsed = profileOverrideSchema.safeParse(JSON.parse(input.overrideText));
      if (parsed.success) override = parsed.data; else fault ??= 'schema';
    } catch { fault ??= 'parse'; }
  }

  const baseId = pinnedId ?? override?.profile ?? 'desktop';
  const base = BUNDLED[baseId];
  const source: ProfileState['source'] = pinnedId ? 'pinned' : override?.profile ? 'override' : 'bundled';
  const bundledOnly = (reason: Fault): ProfileState => ({
    profile: BUNDLED[pinnedId ?? 'desktop'], source: pinnedId ? 'pinned' : 'bundled', overridden: false, notice: NOTICES[reason], reason,
  });
  if (fault) return bundledOnly(fault);
  if (!override) return { profile: base, source, overridden: false, notice: null, reason: null };

  const merged = deviceProfileSchema.safeParse(merge(base, override));
  if (!merged.success) return bundledOnly('merged');
  // A `profile`-only override is a base switch, not a value change.
  const changes = override.pacing !== undefined || override.render !== undefined;
  return { profile: merged.data, source, overridden: changes, notice: null, reason: null };
}
