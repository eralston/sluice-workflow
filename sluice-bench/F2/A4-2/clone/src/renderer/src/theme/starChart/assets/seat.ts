// A seat as a world (13 §4.1): the person's planet, its line from their seed, transformed by their own
// share. Finished pieces are platforms in orbit (13 §3), not structures on the surface.
// Painted (celestial): it scales with the world and keeps no screen floor.
import { encodePiece } from '@shared/engine/stageCode';
import { WorldView, worldRung, type FirstLight } from '../../../chart/art/worlds';
import { motion } from '../../../chart/art/motion';
import type { AssetDef } from '../../../chart/assets/types';
import type { CycleStep, Item } from '../../../gallery/types';
import { pieceOf, seatLook } from '../stageCodec';
import { AdaptedView, NO_VIEWER, sampleKey, sampleNode, samplePiece } from './adapt';

const SHARES = [0, 0.25, 0.5, 0.75, 1];

/** How long a world takes to dim once its last piece leaves (wall ms). */
export const VACANT_FADE_MS = 2000;
/** How long it takes to light again when work returns (wall ms). */
export const VACANT_WAKE_MS = 900;
/** First light (v1.4 B4): how long its front takes from the terminator to the far limb on a seat's first arrival (wall ms). */
export const FIRST_LIGHT_MS = 800;
/** How long the pinpoints then take to settle to the world's own lights (wall ms). */
export const FIRST_LIGHT_FADE_MS = 600;

/**
 * First light `ms` into a seat's first arrival of the round (v1.4 B4), or null once it has settled. `front` runs
 * 0 to 1 across FIRST_LIGHT_MS (fast, then slowing); `lights` is 1 until then, then falls to 0 over FIRST_LIGHT_FADE_MS. Pure.
 */
export function firstLight(ms: number): FirstLight | null {
  if (ms >= FIRST_LIGHT_MS + FIRST_LIGHT_FADE_MS) return null;
  const c = Math.max(0, Math.min(1, ms / FIRST_LIGHT_MS));
  const u = Math.max(0, Math.min(1, (ms - FIRST_LIGHT_MS) / FIRST_LIGHT_FADE_MS));
  return { front: 1 - (1 - c) * (1 - c), lights: 1 - u * u * (3 - 2 * u) };
}

/**
 * A seat's view: the adapter's, with its vacancy (23 C3, `piece.vacant`) eased in and out on wall time, quicker
 * out than in. A first stage, `settle` (a seek, scene entry) and reduced motion land it at once (INV-15). It
 * passes only the level to the art's `setPower(1 - level)`, which dims the surface and puts the lights out.
 */
export class SeatView extends AdaptedView<WorldView> {
  private level = 0;
  private target: 0 | 1 | null = null;
  private wallAt: number | null = null;
  /** Whether the last stage was a vacant seat awaiting its first work (v1.4 B4). */
  private awaiting = false;
  /** Wall ms into first light, or null when none is playing. */
  private firstMs: number | null = null;

  /** First light now (tests and the drive): null when none is playing. */
  get firstLight(): FirstLight | null {
    return this.firstMs === null ? null : firstLight(this.firstMs);
  }

  /** How far into vacancy it is: 0 holding work, 1 vacated (tests and the drive). */
  get vacancy(): number {
    return this.level;
  }

  override setStage(stage: string): void {
    const piece = pieceOf(stage, 'seat');
    const want = piece?.vacant ? 1 : 0;
    this.art.setHolding(want === 0);
    super.setStage(stage);
    // The first arrival of the round (the seat was awaiting) plays first light instead of the plain ease; a seek's `settle` drops it.
    if (this.target === 1 && this.awaiting && want === 0 && !motion.reduced) this.firstMs = 0;
    else if (want === 1 || motion.reduced) this.firstMs = null;
    this.awaiting = !!piece?.awaiting;
    if (this.target === null) this.level = want;
    this.target = want;
    this.draw();
  }

  settle(): void {
    if (this.target !== null) this.level = this.target;
    this.firstMs = null;
    this.draw();
  }

  protected override artTime(seconds: number): number {
    const now = performance.now();
    const dt = this.wallAt === null ? 0 : Math.max(0, now - this.wallAt);
    this.wallAt = now;
    const sweeping = this.firstMs !== null && !motion.reduced;
    if (motion.reduced) this.firstMs = null;
    else if (this.firstMs !== null) {
      this.firstMs += dt;
      if (firstLight(this.firstMs) === null) this.firstMs = null;
    }
    if (this.target !== null && this.level !== this.target) {
      if (motion.reduced) this.level = this.target;
      else {
        const wake = sweeping ? FIRST_LIGHT_MS : VACANT_WAKE_MS;
        const step = dt / (this.target > this.level ? VACANT_FADE_MS : wake);
        this.level = this.target > this.level ? Math.min(1, this.level + step) : Math.max(0, this.level - step);
      }
    }
    this.draw();
    return seconds;
  }

  private draw(): void {
    this.art.setPower(1 - this.level); // a no-op when the level hasn't moved
    this.art.setFirstLight(this.firstLight);
  }
}

export const seatAsset: AssetDef = {
  id: 'world',
  layer: 'celestial',
  moving: true, framed: true, flare: true, body: false,
  rank: 1,
  // A homeworld's name hangs outside it on a holographic plate, pointing at its rim (2026-10-12), quiet
  // (T3). Pointed at, the planet or its plate, it grows its pieces' rows in place (19 L5).
  label: { frame: 'chamfer', variant: 'title', layout: 'horizontal', tier: 'place' },
  make: (node) => new SeatView(new WorldView(node.world.r, node.seed), (stage) => seatLook(pieceOf(stage, 'seat'))),
  samples() {
    const steps: CycleStep[] = SHARES.map((share) => ({
      label: `own share ${share} · nothing counted on the surface`,
      stage: encodePiece(samplePiece('seat', { rung: worldRung(share) }, { share })),
      rung: worldRung(share),
    }));
    // A seat awaits its first work (dim), the first piece arrives (first light, v1.4 B4), its last piece leaves (dims), work returns (eased, 23 C3).
    const held = (share: number, vacant: boolean, awaiting = false) =>
      encodePiece(samplePiece('seat', { rung: worldRung(share) }, { share, ...(vacant ? { vacant } : {}), ...(vacant && awaiting ? { awaiting } : {}) }));
    const vacated: CycleStep[] = [
      { label: 'awaiting work · dim', stage: held(0, true, true), rung: null },
      { label: 'first piece arrives · first light', stage: held(0.5, false), rung: 'underway' },
      { label: 'last piece leaves · dims', stage: held(0, true), rung: null },
      { label: 'work returns · eased', stage: held(0.5, false), rung: 'underway' },
    ];
    const vacant: Item = {
      id: 'seat-vacant',
      title: 'seat · vacated, first light (23 C3, v1.4 B4)',
      note: 'A planet that holds nothing at the playhead dims its surface and turns its lights off; it stays where it is (INV-14). Eased in play, snapped under reduced motion and on a seek. A seat\'s first arrival in the round plays first light (a sweep of lights from the terminator) instead of the ease; the loop replays it',
      make: () => seatAsset.make(sampleNode({ key: sampleKey.person(4), kind: 'seat', asset: 'seat', seed: 7919 * 4, r: 46 }), NO_VIEWER),
      stage: vacated[0]!.stage,
      cycle: vacated,
    };
    return [...[1, 2, 3].map((n) => ({
      id: `seat-${n}`,
      title: `seat · person ${n}`,
      note: 'Own share 0 → 1; the line comes from the seed (outcomes live in the gallery Worlds cells, gallery/v1/worlds.ts)',
      make: () => seatAsset.make(sampleNode({ key: sampleKey.person(n), kind: 'seat', asset: 'seat', seed: 7919 * n, r: 46 }), NO_VIEWER),
      stage: steps[0]!.stage,
      cycle: steps,
    })), vacant];
  },
};
