// The Star Chart theme's factions (13 §4.4–4.5, 12 §6): Trek, Wars and Mecha, for the fleet, the
// stations and the viewer's own style. One `Faction` type, asserted equal to both art declarations
// (fleet.ts and dreadnoughts.ts) and to `CaptainStyle['faction']`, so the three can't drift apart.
//
// Seeded looks (13 §4): a person's ship comes from their ship seed, and a station's faction and
// colourway from its repo's seed. The viewer's style is the one exception (13 §7): it draws their own
// ship, and the faction of any station they summon (design and colourway still by the repo's seed,
// within that faction). Applied at asset time from `AssetCtx`, never in shared projection (14 §4).
import type { CaptainStyle } from '@shared/contracts/settings';
import { colourways, FACTIONS as STATION_FACTIONS, type Faction as StationFaction } from '../../chart/art/dreadnoughts';
import { COLOURWAYS, FACTIONS as FLEET_FACTIONS, FLEET_HULLS, fleetDesign, type Faction as FleetFaction, type FleetDesign } from '../../chart/art/fleet';

export type Faction = 'trek' | 'wars' | 'mecha';
/** In the art's own order (both art files list them the same way; `registries.test.ts` checks). */
export const FACTIONS: readonly Faction[] = ['trek', 'wars', 'mecha'];

// Compile-time: one Faction everywhere. A faction added to one art file and not the other fails here.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const SAME: [Same<Faction, FleetFaction>, Same<Faction, StationFaction>, Same<Faction, CaptainStyle['faction']>] = [true, true, true];
void SAME;

/** The art's own faction lists, for the order check. */
export const ART_FACTIONS = { fleet: FLEET_FACTIONS.map((f) => f.key), stations: [...STATION_FACTIONS] };

/** The hulls of one faction, as indices into FLEET_HULLS, in the art's order. */
export function hullsOf(f: Faction): number[] {
  return FLEET_HULLS.flatMap((h, i) => (h.faction === f ? [i] : []));
}

/** The viewer's chosen style as a fleet design: a hull within the faction, then a colourway (both wrap). */
export function designOfStyle(style: CaptainStyle): FleetDesign {
  const hulls = hullsOf(style.faction);
  const n = COLOURWAYS.length;
  return { hull: hulls[((style.hull % hulls.length) + hulls.length) % hulls.length]!, colourway: ((style.colourway % n) + n) % n };
}

/** A person's ship: the viewer's own style when they're the viewer and chose one, else their seed. */
export function agentDesign(seed: number, style: CaptainStyle | null): FleetDesign {
  return style ? designOfStyle(style) : fleetDesign(seed);
}

/** A station's look. */
export interface StationLook { faction: Faction; colourway: number }

/**
 * A station's faction and colourway from its repo's seed. With `faction` (the summoning viewer's),
 * the faction is theirs and the colourway is still the repo's pick within it, so it's stable per run.
 */
export function stationLook(seed: number, faction?: Faction): StationLook {
  const s = seed >>> 0;
  const f = faction ?? FACTIONS[s % FACTIONS.length]!;
  return { faction: f, colourway: Math.floor(s / FACTIONS.length) % colourways(f).length };
}
