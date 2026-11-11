// 14 §1.4 — the theme registry (v1). Themes register themselves on import (theme/<id>/index.ts);
// `useTheme` makes one active: it registers the theme's assets, binds each neutral role to its
// asset, and runs every install hook, so the command and maneuver registries (17, W2-T4) and the
// guides fill from the same table without this file knowing them.
import { DEFAULT_THEME } from '@shared/contracts/settings';
import { bindAsset, registerAsset } from '../chart/assets/registry';
import type { ThemePack } from './types';

const themes = new Map<string, ThemePack>();
const hooks: ((t: ThemePack) => void)[] = [];
let active: ThemePack | null = null;

export function registerTheme(t: ThemePack): void {
  themes.set(t.id, t);
}

export function themeById(id: string): ThemePack | undefined {
  return themes.get(id);
}

export function allThemes(): ThemePack[] {
  return [...themes.values()];
}

/**
 * Runs `fn` on every theme made active from now on, and at once on the active one. For registries
 * that fill from the theme table (commands, maneuvers). Returns an unsubscribe.
 */
export function onThemeInstall(fn: (t: ThemePack) => void): () => void {
  hooks.push(fn);
  if (active) fn(active);
  return () => {
    const i = hooks.indexOf(fn);
    if (i >= 0) hooks.splice(i, 1);
  };
}

/** Makes a registered theme active (an unknown id falls back to the default one). */
export function useTheme(id: string): ThemePack | null {
  const t = themes.get(id) ?? themes.get(DEFAULT_THEME) ?? null;
  if (!t) return null;
  active = t;
  for (const a of t.assets) registerAsset(a);
  for (const [role, asset] of Object.entries(t.roleAsset)) bindAsset(role, asset);
  for (const fn of hooks) fn(t);
  return t;
}

/** The active theme's `+N more` (23 E6): every list's overflow button reads it. */
export function moreText(n: number): string {
  return activeTheme()?.readCopy.more(n) ?? `+${n} more`;
}

/** The active theme's `show fewer`, the open list's button. */
export function fewerText(): string {
  return activeTheme()?.readCopy.fewer() ?? 'show fewer';
}

/** The active theme: the one last made active, else the default once it's registered. */
export function activeTheme(): ThemePack | null {
  return active ?? useTheme(DEFAULT_THEME);
}
