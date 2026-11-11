// The maneuver registry (v1, 14 §2.8): one ManeuverDef (a theme's choreography) per engine rule id.
// It fills from the active theme's table: on every theme made active, the maneuvers and command
// overrides are replaced by that theme's, so switching themes never leaves the last one's behind.
import { onThemeInstall } from '../../../theme/registry';
import type { ThemePack } from '../../../theme/types';
import { registerCommand, resetCommands } from '../commands';
import type { AmbientWork, Entrance, Finale, ManeuverDef } from '../types';

const defs = new Map<string, ManeuverDef>();

/** Registers a choreography for its rule id; a later one with the same id replaces it. */
export function registerManeuver(def: ManeuverDef): void {
  defs.set(def.id, def);
}

/** The choreography for an engine rule id, or undefined (the interpreter plays a plain default). */
export function maneuverFor(id: string): ManeuverDef | undefined {
  return defs.get(id);
}

/** Every registered choreography, by rule id (tests, the gallery's maneuver demos). */
export function allManeuvers(): ManeuverDef[] {
  return [...defs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Tests only: forget every choreography. */
export function resetManeuvers(): void {
  defs.clear();
}

let ambient: AmbientWork | null = null;
let entrance: Entrance | null = null;
let finale: Finale | null = null;

/** The active theme's finale for a round's end, if it has one. */
export function finaleOf(): Finale | null {
  return finale;
}

/** The active theme's entrances, if it has any. */
export function entranceOf(): Entrance | null {
  return entrance;
}

/** The active theme's idle work for captains at rest, if it has any. */
export function ambientWork(): AmbientWork | null {
  return ambient;
}

/** Fills both registries from a theme: its maneuvers, and its overrides over the seed commands. */
export function installTheme(t: Pick<ThemePack, 'maneuvers' | 'commands'> & Partial<Pick<ThemePack, 'ambient' | 'entrance' | 'finale'>>): void {
  defs.clear();
  ambient = t.ambient ?? null;
  entrance = t.entrance ?? null;
  finale = t.finale ?? null;
  for (const m of t.maneuvers) registerManeuver(m);
  resetCommands();
  for (const c of t.commands) registerCommand(c);
}

onThemeInstall(installTheme);
