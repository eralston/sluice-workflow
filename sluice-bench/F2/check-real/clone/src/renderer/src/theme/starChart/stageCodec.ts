// The Star Chart stage codec (14 §1.4, A4): a v1 node's neutral stage (engine/stageCode.ts) in each
// art's own grammar. The world, asteroid and threat strings are composed here; a station's comes only
// from the art's own `stationStage`, so this file gives its parameters. Each string is checked against
// the art's own parser (tests/unit/assetStage.test.ts). Pure: strings in, strings out, and only types
// from the art, so it loads without Pixi.
//
//   seat       'world.<percent>.m<m>r<r>'               share → percent; no outcomes (m0r0)
//   objective  'asteroid[.<material>].<state>:<steps>'  steps always written ('' clears them)
//   threat     'threat.<swarm>.<look>|<steps>'          '-' for no steps (never the art's defaults)
//   facility   stationStage(faction, act, { i, pr, pd })
//
// Steps unset and steps [] draw the same (no sockets, no live pods). A stage that doesn't decode, or
// decodes to another role, is unknown (INV-11): the asteroid's grey "?", the threat's ghost.
import { decodePiece, MAX_STEPS } from '@shared/engine/stageCode';
import type { PieceState } from '@shared/contracts/view';
import type { AsteroidMaterial } from '../../chart/art/asteroids';
import type { GuardMode, StationAct } from '../../chart/art/dreadnoughts';
import type { ThreatLook } from '../../chart/art/swarm';

/** The piece a stage string describes, if it's a v1 stage of this role; otherwise null (unknown). */
export function pieceOf(stage: string, role: PieceState['role']): PieceState | null {
  const p = decodePiece(stage);
  return p && p.role === role ? p : null;
}

const stepCodes = (p: PieceState) => (p.steps ?? []).slice(0, MAX_STEPS).join('');
const count = (v: number | undefined) => (v !== undefined && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

// ---- Seat: a world ----

/** A seat's world: its own share as a percent. The `m0r0` suffix also clears any outcomes on a reused view. */
export function seatLook(p: PieceState | null): string {
  const share = p?.share !== undefined && Number.isFinite(p.share) ? Math.min(1, Math.max(0, p.share)) : 0;
  return `world.${Math.round(share * 100)}.m0r0`;
}

// ---- Objective: an asteroid ----

/** The asteroid states (asteroids.ts `asteroidStage`), as this theme reads the signal. */
export type AsteroidState = 'sketch' | 'ready' | 'deferred' | 'underway' | 'resolved' | 'accept' | 'accomplished' | 'ghost' | 'unknown';

/** Nearing at or past this step is Ready to Accept's look (gold creeping into the work lights). */
export const ACCEPT_STEP = 0.5;

export function asteroidState(p: PieceState | null): AsteroidState {
  const s = p?.signal;
  if (!s || s.unknown) return 'unknown';
  switch (s.rung) {
    case 'ready': return s.sketch ? 'sketch' : s.deferred ? 'deferred' : 'ready';
    case 'underway': return 'underway';
    case 'nearing': return (s.step ?? 0) >= ACCEPT_STEP ? 'accept' : 'resolved';
    case 'accomplished': return 'accomplished';
    default: return 'ghost'; // off: removed, rejected (the asteroid has no struck look)
  }
}

/** An objective's asteroid. `material` is only a label in the string: the view keeps its seed's. */
export function objectiveLook(p: PieceState | null, material?: AsteroidMaterial): string {
  return `asteroid${material ? `.${material}` : ''}.${asteroidState(p)}:${p ? stepCodes(p) : ''}`;
}

// ---- Threat: a hive ship ----

/** The resting look for a threat's signal. Its moments (emerging, breakup, warp) are acts. */
export function threatState(p: PieceState | null): ThreatLook {
  const s = p?.signal;
  // The hive has no unknown look; the ghost is the nearest neutral one (INV-11).
  if (!s || s.unknown) return 'ghost';
  switch (s.rung) {
    case 'ready': return s.sketch ? 'sketch' : 'ready';
    case 'underway': return 'underway';
    case 'nearing': return 'nearing';
    // At rest a defeated threat is the hulk wrapped in metal: a research platform in low orbit on the
    // planet's lit edge (13 §3, v4). Its breakup is an act; the ruin cloud is no longer a resting look.
    case 'accomplished': return 'platform';
    default: return s.strike ? 'rejected' : 'ghost';
  }
}

/** A threat's hive ship, in its swarm (`SWARMS[i].key`), at rest or in a transient `look`. */
export function threatLook(p: PieceState | null, swarm: string, look: ThreatLook = threatState(p)): string {
  return `threat.${swarm}.${look}|${(p && stepCodes(p)) || '-'}`;
}

/** Threat acts (played by maneuvers): act name → the art's transient look. */
// `retreat` (2026-10-13): backing into a closing rift as it leaves the region (a Bug moved out of the sprint).
export const THREAT_ACTS: Readonly<Record<string, ThreatLook>> = Object.freeze({ emerge: 'emerging', breakup: 'breakup', warp: 'warp', retreat: 'retreat' });

// ---- Facility: a station ----

/** The parameters for the art's `stationStage`. */
export interface StationParams { act: StationAct; o: { i?: number; pr: number; pm?: number; ds?: number | readonly number[]; pd: GuardMode; form?: 'robot' } }

/** Station acts (played by maneuvers). `idle` is the resting act. */
export const STATION_ACTS: readonly StationAct[] = ['jump', 'intake', 'cover', 'dock', 'charge'];

/**
 * A facility's station: intensity, the count of open attachments, and which tender slots hold one (`pm`:
 * a gap stays where it is, 14 §9 D2; "+N" is the count past the cap). Guards idle:
 * pipeline runs aren't read in v1 (13 §4.4).
 */
export function facilityLook(p: PieceState | null, act: StationAct = 'idle', slot?: number | readonly number[]): StationParams {
  const o: StationParams['o'] = { pr: count(p?.open), pd: 'idle' };
  // Which slots hold a tender (23 C6); without it the art fills by count. A `dock` names its PR's slot, or a volley's every slot (27 E6).
  if (p?.slots !== undefined) o.pm = count(p.slots);
  if (act === 'dock' && slot !== undefined) o.ds = slot;
  if (p?.intensity !== undefined && Number.isFinite(p.intensity)) o.i = Math.min(1, Math.max(0, p.intensity));
  // Once a PR has merged into it a station is in its second form (`robot`, for every faction).
  if (count(p?.merged) > 0) o.form = 'robot';
  return { act, o };
}
