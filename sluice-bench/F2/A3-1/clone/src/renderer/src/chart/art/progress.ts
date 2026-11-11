// The signal ladder (docs/09-signal-ladder.md): every object with a state climbs the same four rungs,
// each with one color, one level of ornament, one rank of contrast, and one kind of motion.
//   ready        — steel grey: a silhouette or sketch; recedes; still, or one very slow breath
//   underway     — progress blue: detail arrives; the brightest thing in view; strongest motion
//   nearing      — violet with gold creeping in: fuller form; the same motion, quicker and lighter
//   accomplished — gold: one final ornament; calmer than active work; still (a closed world's city
//                  lights are the one exception)
// Ambient identity motion (rotation, window lights, ship bob) is not state and runs on every rung.

export const READY = 0x8a93a6;
export const PROGRESS = 0x5aa9ff; // underway
export const NEARING = 0xa487ff;
export const SUCCESS = 0xffc76b; // accomplished

export type Rung = 'ready' | 'underway' | 'nearing' | 'accomplished' | 'off';

export interface Signal {
  rung: Rung;
  /** New: the bare silhouette (a sketch), before the first solid form. */
  sketch?: boolean;
  /** Within nearing: how far along (Resolved ≈ 0.3, Ready to Accept ≈ 0.65); gold creeps in with it. */
  step?: number;
  deferred?: boolean;
  ghost?: boolean;
  strike?: boolean;
  unknown?: boolean;
}

/** Visual stage (state-mapping.json) → rung. Stage keys are contracts; only their looks changed. */
const SIGNALS: Record<string, Signal> = {
  'feature.faint': { rung: 'ready', sketch: true },
  'feature.draft': { rung: 'ready' },
  'feature.review': { rung: 'ready' },
  'feature.ready': { rung: 'ready' },
  'feature.deferred': { rung: 'ready', deferred: true },
  'feature.active': { rung: 'underway' },
  'feature.accept': { rung: 'nearing', step: 0.65 },
  'feature.whiteDwarf': { rung: 'accomplished' },
  'feature.ghost': { rung: 'off', ghost: true },
  'story.uncharted': { rung: 'ready', sketch: true },
  'story.surveyed': { rung: 'ready' },
  'story.review': { rung: 'ready' },
  'story.dormant': { rung: 'ready', deferred: true },
  'story.terraforming': { rung: 'underway' },
  'story.developed': { rung: 'nearing', step: 0.3 },
  'story.developedAccept': { rung: 'nearing', step: 0.65 },
  'story.lush': { rung: 'accomplished' },
  'story.ghost': { rung: 'off', ghost: true },
  'bug.detected': { rung: 'ready', sketch: true },
  'bug.stable': { rung: 'ready' },
  'bug.review': { rung: 'ready' },
  'bug.disturbance': { rung: 'underway' },
  'bug.contracted': { rung: 'nearing', step: 0.3 },
  'bug.contractedAccept': { rung: 'nearing', step: 0.65 },
  'bug.remnant': { rung: 'accomplished' },
  'bug.ghost': { rung: 'off', ghost: true },
  'bug.rejected': { rung: 'off', ghost: true, strike: true },
  'task.unstarted': { rung: 'ready', sketch: true },
  'task.lit': { rung: 'underway' },
  'task.settled': { rung: 'accomplished' },
  'task.faint': { rung: 'off', ghost: true },
  'flight.active': { rung: 'underway' },
  'flight.completed': { rung: 'accomplished' },
  'flight.abandoned': { rung: 'off', ghost: true },
};

export function signalOf(stage: string): Signal {
  return SIGNALS[stage] ?? { rung: 'off', unknown: true };
}

export const RUNG_COLOR: Record<Rung, number> = {
  ready: READY, underway: PROGRESS, nearing: NEARING, accomplished: SUCCESS, off: 0x6f7787,
};

export const RUNG_NAME: Record<Rung, string> = {
  ready: 'Ready', underway: 'Underway', nearing: 'Nearing', accomplished: 'Accomplished', off: 'Off the ladder',
};

/** How much state motion a rung carries (0 = still). */
export const ACTIVITY: Record<Rung, number> = { ready: 0.12, underway: 1, nearing: 0.7, accomplished: 0, off: 0 };

/** One beat of the progress pulse, in seconds; nearing accelerates. */
export const PROGRESS_PERIOD = 2.4;
export const NEARING_PERIOD = 1.6;
export const beatOf = (rung: Rung) => (rung === 'nearing' ? NEARING_PERIOD : PROGRESS_PERIOD);

/**
 * The shared progress pulse: 0..1, peaking once per period. `lag` (in periods) delays it, so parts
 * of one object can light in sequence and the pulse reads as travelling in a direction.
 */
export function progressPulse(seconds: number, lag = 0, period = PROGRESS_PERIOD): number {
  const t = seconds / period - lag;
  const f = t - Math.floor(t);
  return Math.pow(Math.max(0, Math.sin(Math.PI * f)), 3);
}

/** RGB 0..1 for shader uniforms. */
export function rgb(c: number): [number, number, number] {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

/** GLSL twin of the ladder colors and pulse, for shaders. */
export const PROGRESS_GLSL = /* glsl */ `
const vec3 LADDER_READY = vec3(0.541, 0.576, 0.651);
const vec3 PROGRESS = vec3(0.353, 0.663, 1.0);
const vec3 LADDER_NEARING = vec3(0.643, 0.529, 1.0);
const vec3 LADDER_GOLD = vec3(1.0, 0.780, 0.420);
float progressPulse(float seconds, float lag, float period) {
  float f = fract(seconds / period - lag);
  return pow(max(0.0, sin(3.14159265 * f)), 3.0);
}
`;
