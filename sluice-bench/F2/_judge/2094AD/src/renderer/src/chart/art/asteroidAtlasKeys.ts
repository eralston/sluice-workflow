// The asteroid atlas's key set and the rules for when it can stand in for the procedural view (23 C7).
// Pure (no Pixi, no assets), so the mapping is unit-tested on its own. The atlas holds each material's
// rock and its crisp hardware at rest, in the states below, with no steps (Tasks) drawn.
import { ASTEROID_MATERIALS, asteroidStage, type AsteroidMaterial } from './asteroids';

/** The states baked: the ladder's looks at rest. `deferred` and `unknown` are procedural only. */
export const ATLAS_STATES = ['sketch', 'ready', 'underway', 'resolved', 'accept', 'accomplished', 'ghost'] as const;
export type AtlasState = (typeof ATLAS_STATES)[number];
/** The two layers of an asteroid: the painted rock (celestial) and the crisp hardware over it. */
export const ATLAS_PARTS = ['rock', 'marks'] as const;
export type AtlasPart = (typeof ATLAS_PARTS)[number];
/** Shape variants baked per material: one for now (every rock of a material shares its silhouette). */
export const ATLAS_VARIANTS = 1;
/** The radius the bake draws at (px) and the square frame each part gets (logical px, ±1.8 radius). */
export const BAKE_R = 40;
export const FRAME = 144;
/** Bake resolution: frame pixels per logical px. */
export const BAKE_RES = 1.5;
/** The seed each material is baked from, per variant (the gallery's own seeds). */
export const BAKE_SEEDS: Record<AsteroidMaterial, number[]> = { metal: [11], crystal: [23], energy: [707] };

export const atlasKey = (m: AsteroidMaterial, state: AtlasState, variant: number, part: AtlasPart): string =>
  `asteroid.${m}.${state}.v${variant}.${part}`;

export const variantOf = (seed: number): number => Math.floor((seed >>> 0) / 3) % ATLAS_VARIANTS;

/** The covered state a stage names, or null when the atlas does not hold it (steps drawn, deferred, unknown). */
export function atlasStateOf(stage: string, steps: readonly unknown[] | undefined): AtlasState | null {
  const s = asteroidStage(stage);
  if (Math.max(steps?.length ?? 0, s.steps?.length ?? 0) > 0) return null;
  return (ATLAS_STATES as readonly string[]).includes(s.state) ? (s.state as AtlasState) : null;
}

/** Every key the bake must produce. */
export function allAtlasKeys(): string[] {
  const out: string[] = [];
  for (const m of ASTEROID_MATERIALS) for (let v = 0; v < ATLAS_VARIANTS; v++) for (const st of ATLAS_STATES) for (const p of ATLAS_PARTS) out.push(atlasKey(m, st, v, p));
  return out;
}
