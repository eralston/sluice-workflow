// Measured motion (05 §5): above 1×, motion speeds up by kind so fast playback stays legible. The
// chart sets this once per frame from the playback rate; views read it.
//   travel  × r            flights, ink, launches, docks (the FX layer)
//   pulses  × min(r, 2)    blinks, strobes, breathing, the progress beat
//   jiggle  amplitude 1/r  ship bob
//   ambient unchanged      rotation, drift, window shimmer
export const motion = {
  /** Travel speed multiplier. */
  travel: 1,
  /** Pulse and blink speed multiplier. */
  pulse: 1,
  /** A clock (seconds) that runs at `pulse` speed: blinking art reads it instead of wall time. */
  pulseTime: 0,
  /** Idle jiggle amplitude. */
  jiggle: 1,
  /** Reduced motion (OS setting or the in-app toggle): no jiggle, no blinking (05 §7). */
  reduced: false,
};

export function setMotionRate(rate: number, playing: boolean, reduced: boolean): void {
  const r = playing ? Math.max(1, rate) : 1;
  motion.travel = r;
  motion.pulse = Math.min(r, 2);
  motion.jiggle = reduced ? 0 : 1 / r;
  motion.reduced = reduced;
}

export function advanceMotion(dtSeconds: number): void {
  motion.pulseTime += dtSeconds * (motion.reduced ? 0 : motion.pulse);
}
