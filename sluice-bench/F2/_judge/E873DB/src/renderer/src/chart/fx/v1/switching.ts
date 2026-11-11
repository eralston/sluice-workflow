// The SwitchingDirector (v1, 17 D10): one FxDirector for ChartApp. Solar scenes (a level whose
// layout is 'solar') get the ManeuverInterpreter; every other scene keeps the v0 AnimationDirector,
// unchanged. The scene decides, per beat and per frame. When the side changes, the one left behind
// is cleared, so nothing it was playing outlives its scene (INV-15).
import type { CastNote } from './castLabels';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { Award } from '@shared/engine/types';
import { AnimationDirector, type DirectorHost } from '../director';
import type { FxBeat, FxDirector } from '../types';
import { ManeuverInterpreter, type InterpreterCensus } from './interpreter';

/** The census both sides report: the v0 director's keys, plus the maneuvers started (0 for v0). */
export type SwitchingCensus = ReturnType<AnimationDirector['census']> & { maneuvers: number };

const NONE: ReadonlyMap<string, number> = new Map();
const NO_CREW: ReadonlyMap<string, { u: number; text: string; eventKey: string; pass?: true }> = new Map();
const NO_NOTES: ReadonlyMap<string, CastNote> = new Map();

export class SwitchingDirector implements FxDirector {
  readonly v0: AnimationDirector;
  readonly v1: ManeuverInterpreter;
  private solar = false;
  private lastScene: string | null = null;
  private lastHier: unknown = null;

  constructor(private readonly host: DirectorHost) {
    this.v0 = new AnimationDirector(host);
    this.v1 = new ManeuverInterpreter(host);
  }

  /** Whether a scene is solar: its level's layout. Memoised by scene key and hierarchy (a paradigm switch). */
  private isSolar(sceneKey: string): boolean {
    const hier = this.host.hierarchy();
    if (sceneKey !== this.lastScene || hier !== this.lastHier) {
      this.lastScene = sceneKey;
      this.lastHier = hier;
      this.solar = hier.resolve(sceneKey)?.def.layout === 'solar';
    }
    return this.solar;
  }

  private active(): FxDirector {
    return this.solar ? this.v1 : this.v0;
  }

  /** Points at the side for this scene; the other side is cleared when it changes. */
  private follow(sceneKey: string | undefined): FxDirector {
    if (sceneKey === undefined) return this.active();
    const was = this.solar;
    const now = this.isSolar(sceneKey);
    if (now !== was) (was ? this.v1 : this.v0).clear();
    return this.active();
  }

  queue(ctx: FxBeat): void {
    this.follow(ctx.after.sceneKey).queue(ctx);
  }

  tell(ctx: FxBeat, i: number, leadS: number): void {
    this.follow(ctx.after.sceneKey).tell(ctx, i, leadS);
  }

  clear(): void {
    this.v0.clear();
    this.v1.clear();
  }

  recap(keys: CanonicalKey[], awards?: Award[], opts?: { finale?: boolean }): void {
    this.active().recap(keys, awards, opts);
  }

  insignia(awards: Award[], calledAt?: number): void {
    this.active().insignia?.(awards, calledAt);
  }

  opening(): void {
    this.follow(this.host.scene()?.currentGraph()?.sceneKey).opening?.();
  }

  /** A day's breather and its spotlight (22 C6): a solar region's alone. */
  spotlight(person: CanonicalKey | null, untilS = 0): void {
    if (this.solar) this.v1.spotlight(person, untilS);
  }

  /** The pieces labelled in play (19 L7): the interpreter's, in a solar scene; none in v0's. */
  labelled(): ReadonlyMap<string, number> {
    return this.solar ? this.v1.labelled() : NONE;
  }

  /** Their notes (22 B6), and the events they are for (22 B5): the interpreter's, in a solar scene. */
  notes(): ReadonlyMap<string, CastNote> {
    return this.solar ? this.v1.notes() : NO_NOTES;
  }

  crew(): ReadonlyMap<string, { u: number; text: string; eventKey: string; pass?: true }> {
    return this.solar ? this.v1.crew() : NO_CREW;
  }

  nowPlaying(): string[] {
    return this.solar ? this.v1.nowPlaying() : [];
  }

  update(dtMs: number, scheduleDtMs: number, frozen: boolean): void {
    this.follow(this.host.scene()?.currentGraph()?.sceneKey).update(dtMs, scheduleDtMs, frozen);
  }

  volatility(): number {
    return this.active().volatility();
  }

  census(): SwitchingCensus {
    if (this.solar) return this.v1.census() satisfies InterpreterCensus;
    return { ...this.v0.census(), maneuvers: 0 };
  }

  calm(): boolean {
    return this.active().calm();
  }

  activeCount(): number {
    return this.active().activeCount();
  }

  trailCount(): number {
    return this.active().trailCount();
  }

  /** Test hook: extra volatility, on both sides. */
  get bias(): number {
    return this.v0.bias;
  }

  set bias(v: number) {
    this.v0.bias = v;
    this.v1.bias = v;
  }
}
