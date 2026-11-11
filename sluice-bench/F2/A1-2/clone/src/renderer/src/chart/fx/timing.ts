// The director's timings, colours and limits (05 §5, 06 §5), shared by its effect modules. Split out of
// director.ts (2026-10-10, no behaviour change).
import type { ViewNode } from '@shared/contracts/view';
import { activeProfile } from '../../profile';
import { HERO_SOFT } from '../art/energy';
import { assetById, assetFor } from '../assets/registry';
import type { AssetDef } from '../assets/types';

/** The v1 node kinds, which are also the neutral role ids their assets are bound under (14 §2.4). */
const V1_KINDS = new Set<string>(['seat', 'objective', 'threat', 'facility']);

/**
 * A v0 kind table that also answers for v1 nodes by their asset's capability (14 §2.8, 17 D7). Given
 * a node, its asset decides when it has one, else its kind. Given a kind, the table decides, and a v1
 * kind also counts when the asset bound to it has the capability. With no asset registered, it
 * answers exactly as the plain kind set.
 */
export class KindTable extends Set<string> {
  constructor(kinds: readonly string[], private readonly cap: 'flare' | 'body') {
    super(kinds);
  }

  override has(k: string | Pick<ViewNode, 'kind' | 'asset'>): boolean {
    if (typeof k === 'string') return super.has(k) || (V1_KINDS.has(k) && capable(assetById(k), this.cap));
    const def = assetFor(k);
    return def ? def[this.cap] : super.has(k.kind);
  }
}

const capable = (def: AssetDef | undefined, cap: 'flare' | 'body') => !!def && def[cap];

/**
 * "Ornament allowed" (05 §5): the profile's ornament switch is on and the scene is calm (volatility `v`
 * under CALM). The switch is read at the moment of use (15 §11).
 */
export const ornamentOk = (v: number): boolean => activeProfile().render.switches.ornament && v < CALM;

export const CYAN = 0x83dde2;

export const NAV_GREEN = 0x7fe0a0;

export const TRAIL_COLOR = 0xcfe9f2;

/** Flight timings in seconds at 1×: leisurely (decided 2026-10-03). */
export const DEPART_S = 0.9;

export const ARRIVE_S = 0.9;

export const MOVE_S = 1.8;

/** Same-beat accents start parent outward, this far apart (05 §5). Never across beats. */
export const STAGGER_S = 0.4;

/** A grand flare's burst: while it plays, decorative effects duck, and the next grand flare waits. */
export const GRAND_BURST_S = 1.6;

export const DUCK = 0.4;

/**
 * Working on something (06 §5): the ship stays where it last worked (the projection anchors it there),
 * so new work is one flight to the new object, then the tractor beam; the change shows TRACTOR_LEAD_S
 * after the beam engages. It never flies back to the parent.
 */
export const TRACTOR_S = 1.6;

export const TRACTOR_LEAD_S = 0.5;

/**
 * The tractor beam's color: hero energy given, not fired (art/energy.ts, 2026-10-13): the hero blue
 * desaturated and calm, never a weapon's red or white.
 */
export const TRACTOR = HERO_SOFT;

/**
 * A station's charge before it fires (ms; v1.3 F2: one home for both, which the theme's maneuvers
 * import). In the beamed closes (Landing and Strike run, via `stationFire`), before its phaser or mining
 * beam; the art's hull charge (`art/dreadnoughts.ts` CHARGE_S) mirrors it.
 */
export const STATION_CHARGE_MS = 600;

/** Power link's own, longer charge before the station's split beam, into the echo (ms). */
export const LINK_CHARGE_MS = 700;

/** The radar ping (06 §5): collapse, run along the spoke, re-expand. */
export const RADAR_COLLAPSE_S = 0.45;

export const RADAR_RUN_S = 0.9;

export const RADAR_EXPAND_S = 0.6;

/** Launch (06 §5): the intent line inks to the lane slot, the vessel undocks and follows it, then the route inks on. */
export const LAUNCH_INTENT_S = 0.6;

export const LAUNCH_FLY_S = 1.8;

export const ROUTE_INK_S = 1.0;

/** The echo: a spark to the parent's limb, once the flare has swelled. */
export const ECHO_DELAY_S = 0.8;

export const ECHO_S = 0.9;

export const RECAP_STEP_S = 0.22;

export const RECAP_MAX = 14;

/** A piece's label in play (19 L7): its title shows from its maneuver's act (27 E2) to this linger after its land or echo, then fades. */
export const CAST_LABEL_LINGER_MS = 1500;

export const CAST_LABEL_FADE_MS = 400;

/** A guide that shows only at some playheads (the frontier belt, 19 S2) fades in or out over this; a seek snaps it. */
export const GUIDE_FADE_MS = 600;

/** "Worth an inch" (05 §5): a change of place shorter than this, on screen, just glides. */
export const INCH_PX = 60;

/** Volatility marks (05 §5 tiers). */
export const CALM = 5;

export const BUSY = 10;

export const OVERLOAD = 16;

/** The least value per unit of weight a command needs to play (27 E1, P8): from the calm mark, and from the busy mark. */
export const MUTE_FLOOR = { calm: 4, busy: 8 } as const;

/** A call that repeats a meaning another cue gives (15 §8 effect-audit): it mutes first, from the calm mark. */
export const REPEAT_VALUE = 0;

export const valuePerCost = (value: number, weight: number): number => (weight > 0 ? value / weight : Infinity);

/**
 * The floor a command's value per cost must clear at volatility `v` (replaces P-9's tier rule, 05 §8.5):
 * none at overload (Infinity), the busy floor from BUSY, the calm floor from CALM (or at any load with
 * the ornament switch off), else 0. Maximum (`ignoreLoad`) skips the busy and overload marks only.
 */
export function muteFloor(v: number, ignoreLoad: boolean, ornament = activeProfile().render.switches.ornament): number {
  if (!ignoreLoad && v >= OVERLOAD) return Infinity;
  if (!ignoreLoad && v >= BUSY) return MUTE_FLOOR.busy;
  return v >= CALM || !ornament ? MUTE_FLOOR.calm : 0;
}

/** When busy: echoes and beams per beat. */
export const BUSY_ECHOES = 3;

export const FLARE_KINDS = new KindTable(['star', 'planet', 'anomaly', 'missionPoint', 'flight'], 'flare');

/**
 * The review formation (06 §5, decided 2026-10-03): a merged PR's approvers fly in together, hold a
 * shallow arc above its vessel, join their tractor beams, and see it home. `slot` is live (it follows
 * the vessel); the phases are gather → hold → leave, with `leaveAt` set by the formation.
 */
export const GATHER_S = 1.2;

export const JOIN_S = 1.0;

export const BERTH_S = 1.0;

export const DISPERSE_AFTER_S = 0.9;

export const LEAVE_S = 1.0;

export const BODY_KINDS = new KindTable(['star', 'planet', 'anomaly'], 'body');

/** The side panel's width over the right of the chart (ChartApp's INSPECTOR_WIDTH). */
export const SIDE_PANEL_PX = 380;

/** The zoom controls' column at the right of the view, which a trail's Go must not slide under. */
export const ZOOM_CONTROLS_PX = 90;

/** What a ship's beam can take hold of: a body, a Task, or a PR's vessel. */
export const TARGET_KINDS = new Set(['star', 'planet', 'anomaly', 'missionPoint', 'flight']);

/** A guest ship's flight in (Activity, 05 §5), before it takes hold. */
export const GUEST_ARRIVE_S = 1.0;

export const clip = (t: string) => (t.length > 32 ? `${t.slice(0, 31)}…` : t);
