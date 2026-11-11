// The viewer (13 §7, 14 §6): the person this copy of the app is for, chosen under Settings → Your
// captain, and their ship's style. Both are kept per tenant (org key), as an `id:` key, never a name.
// The viewer never enters shared projection: the theme's assets read it from `AssetCtx` (W3-T1 builds
// one with `assetCtxFor`), and achievements take it as an argument. Fixtures have no signed-in user,
// so nothing is suggested: the viewer always chooses (Q8).
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { CaptainStyle, UserSettings } from '@shared/contracts/settings';
import type { AssetCtx } from '../chart/assets/types';
import { useChart } from '../store';
import { patchSettings, useSettings } from './store';

export interface Person { key: CanonicalKey; name: string }

/** The loaded history's people, by full name (A–Z, then key, so equal names keep one order). */
export function peopleOf(h: ScopeHistory | null): Person[] {
  if (!h) return [];
  return h.entities.captains
    .map((c) => ({ key: c.key, name: c.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The tenant a history belongs to. */
export const orgOf = (h: ScopeHistory | null): string | null => h?.scope.orgKey ?? null;

export function viewerOf(s: UserSettings, org: string | null): CanonicalKey | null {
  return org && Object.hasOwn(s.viewer, org) ? s.viewer[org] ?? null : null;
}

export function captainStyleOf(s: UserSettings, org: string | null): CaptainStyle | null {
  return org && Object.hasOwn(s.captain, org) ? s.captain[org] ?? null : null;
}

/** What the theme's assets are told: the theme, the viewer, and the viewer's ship style. */
export function assetCtxFor(s: UserSettings, h: ScopeHistory | null): AssetCtx {
  const org = orgOf(h);
  return { theme: s.theme, viewer: viewerOf(s, org), captain: captainStyleOf(s, org) };
}

/** The viewer for the loaded history's tenant, as a hook. */
export function useViewer(): CanonicalKey | null {
  const org = useChart((s) => orgOf(s.history));
  return useSettings((s) => viewerOf(s.settings, org));
}

/** The viewer's ship style for the loaded history's tenant, as a hook. */
export function useCaptainStyle(): CaptainStyle | null {
  const org = useChart((s) => orgOf(s.history));
  return useSettings((s) => captainStyleOf(s.settings, org));
}

/** Chooses (or clears) the viewer for the loaded history's tenant. Only its own people can be chosen. */
export async function chooseViewer(key: CanonicalKey | null): Promise<void> {
  const h = useChart.getState().history;
  const org = orgOf(h);
  if (!org) return;
  if (key && !peopleOf(h).some((p) => p.key === key)) return;
  await patchSettings({ viewer: { [org]: key } });
}

/** Styles (or resets to the seeded look) the viewer's ship for the loaded history's tenant. */
export async function styleCaptain(style: CaptainStyle | null): Promise<void> {
  const org = orgOf(useChart.getState().history);
  if (!org) return;
  await patchSettings({ captain: { [org]: style } });
}
