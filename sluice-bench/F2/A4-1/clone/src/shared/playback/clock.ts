// 05 §1–2 — the playback clock: schedule time, status, and rate, with no timers or rendering, so it
// is unit-tested directly. The renderer advances it once per frame with wall time.
import type { Beat, BeatSchedule, Rate } from '../contracts/playback';
import type { UtcMs } from '../contracts/keys';

export interface Advance {
  /** Beats whose start fell in (previous x, new x]: their state applies; at most one plays accents. */
  crossed: Beat[];
  /** True when x jumped (seek, date entry, event-list pick): no accents (INV-15). */
  seeked: boolean;
}

export class PlaybackClock {
  x = 0;
  status: 'paused' | 'playing' | 'ended' = 'paused';
  rate: Rate = 1;

  constructor(readonly schedule: BeatSchedule) {}

  get totalMs(): number {
    return this.schedule.totalMs;
  }

  /** The displayed state's source time (05 §1). */
  stateUtc(): UtcMs {
    return this.schedule.stateUtc(this.x);
  }

  /** The ruler's source time: moves smoothly through the gaps. */
  rulerUtc(): UtcMs {
    return this.schedule.toSource(this.x);
  }

  /** How fast x moves per wall ms now: the rate times the tempo at x (27 E5b, P-25; the tempo changes only at beat starts). */
  pace(): number {
    return this.rate * this.schedule.tempoAt(this.x);
  }

  /** Wall time left at the current rate, in ms (the tempo counted). */
  remainingMs(): number {
    return (this.schedule.wallMs - this.schedule.wallAt(this.x)) / this.rate;
  }

  play(): void {
    if (this.x >= this.totalMs) this.x = 0; // play from the end restarts
    this.status = 'playing';
  }

  pause(): void {
    if (this.status === 'playing') this.status = 'paused';
  }

  /** Change the multiplier: source time, scene, and event order don't change (AC-18). */
  setRate(rate: Rate): void {
    this.rate = rate;
  }

  /** Jump to schedule time x, with no accents. */
  seek(x: number): Advance {
    this.x = Math.max(0, Math.min(this.totalMs, x));
    if (this.status === 'ended' && this.x < this.totalMs) this.status = 'paused';
    return { crossed: [], seeked: true };
  }

  /** Date entry: the first schedule time showing source time t. */
  seekToSource(t: UtcMs): Advance {
    return this.seek(this.schedule.toPresentation(t));
  }

  /** Selecting an event seeks to the start of its beat, so the whole beat is applied. */
  seekToBeat(beat: Beat): Advance {
    return this.seek(beat.presentationStartMs);
  }

  /** Step ▶︎: jump to the next beat, play its accents once, then pause. */
  step(): Advance {
    const next = this.schedule.beats.find((b) => b.presentationStartMs > this.x);
    this.status = 'paused';
    if (!next) {
      this.x = this.totalMs;
      this.status = 'ended';
      return { crossed: [], seeked: false };
    }
    const from = this.x;
    this.x = next.presentationStartMs;
    return { crossed: this.beatsIn(from, this.x), seeked: false };
  }

  /**
   * Step to a chosen later beat (next in-view High beat): every beat on the way applies its state,
   * and only the target plays its accents (the latest accented beat crossed, AC-19).
   */
  stepTo(beat: Beat): Advance {
    if (beat.presentationStartMs <= this.x) return this.seek(beat.presentationStartMs);
    this.status = 'paused';
    const from = this.x;
    this.x = beat.presentationStartMs;
    return { crossed: this.beatsIn(from, this.x), seeked: false };
  }

  /** Advance by wall time while playing (deltas clamped to 100 ms, 05 §5). */
  advance(wallMs: number): Advance {
    if (this.status !== 'playing') return { crossed: [], seeked: false };
    const from = this.x;
    this.x = Math.min(this.totalMs, this.x + Math.min(wallMs, 100) * this.pace());
    if (this.x >= this.totalMs) this.status = 'ended';
    return { crossed: this.beatsIn(from, this.x), seeked: false };
  }

  private beatsIn(from: number, to: number): Beat[] {
    return this.schedule.beats.filter((b) => b.presentationStartMs > from && b.presentationStartMs <= to);
  }
}

/** Of the beats crossed in one frame, only the latest accented one plays accents (INV-15, AC-19): the v0 views. */
export function accentBeat(a: Advance): Beat | null {
  if (a.seeked) return null;
  for (let i = a.crossed.length - 1; i >= 0; i--) if (a.crossed[i]!.accented) return a.crossed[i]!;
  return null;
}

/**
 * Every accented beat crossed in one frame, in order (22 C9, 05 §8 B-19): a solar region plays each, at
 * its own offset from the first, so a high rate or a stall drops none to light work. None on a seek (INV-15).
 */
export function accentBeats(a: Advance): Beat[] {
  return a.seeked ? [] : a.crossed.filter((b) => b.accented);
}
