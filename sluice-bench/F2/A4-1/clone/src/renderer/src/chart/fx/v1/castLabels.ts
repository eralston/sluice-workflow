// Pieces' labels in play (19 L7): a hover-only piece shows its title while a maneuver casts it, from
// its maneuver's act (once its cast has arrived: R11, 27 E2) to a linger after its land or echo, then
// fades. While its maneuver plays, the plate wears a note (22 B6): the event's action, in History's
// words, so the scene says why it's lit. The interpreter opens the windows on the beat's clock and
// steps this one at the same rate, so a label follows what actually plays; a window may carry a tag
// so a caller can retire it. Attention is budgeted
// (22 B7, C10): at most `ATTENTION_MAX` labels show at once, pieces' plates and named captains
// together. The planner keeps to that; here a plate still lingering after its maneuver gives way to
// one whose maneuver starts, or to a captain being named (a crossfade), and any other waits for a place. Paused, the windows hold with the effects but the
// labels fade out on the wall clock (outside play, pieces are hover-only) and fade back on resume. A
// seek clears them (INV-15). Pure: no DOM, no Pixi.
import { ATTENTION_MAX, CREW_FOLD_MS } from '@shared/engine/maneuvers';
import { CAST_LABEL_FADE_MS } from '../timing';

/** What `now` returns when nothing is labelled. */
const NONE: ReadonlyMap<string, number> = new Map();

/** A plate's note in play (22 B6): its text, and the event it is for. */
export interface CastNote { text: string; eventKey: string }

/** What a window may carry beyond its span (22 B6). */
export interface CastWindow {
  /** The maneuver a tell opened it for, so `retire` can end it. */
  tag?: string;
  /** Its maneuver's own play, effect-seconds from now: before it is the lead, after it the linger. */
  holdFromS?: number; holdToS?: number;
  /** The note the plate wears while it shows, and the event it is for (History's *now* rows). */
  note?: string; eventKey?: string;
}

/** One piece's window, in seconds on this clock. `shownAt`: when it took its place; unset, it waits. */
interface Window { pk: string; from: number; to: number; tag?: string; holdFrom?: number; holdTo?: number; note?: string; eventKey?: string; shownAt?: number; waited?: boolean; replaced?: boolean }

/**
 * A captain who acts in the maneuver playing (22 B9): their plate unfurls to the name and their part, then folds.
 * `turn`: a volley's naming turn (27 E6), which the flight never holds open past its own window.
 */
interface Crew { pk: string; from: number; to: number; text: string; eventKey: string; turn?: boolean }
/** How long a captain's plate takes to unfurl or fold, seconds (`CREW_FOLD_MS`: the unfurl of 22 A8). */
const CREW_UNFURL_S = CREW_FOLD_MS / 1000;
/** How long past its planned close a captain's window is kept for a late flight to speak for (s). */
const CREW_KEEP_S = 8;

export class CastLabels {
  private windows: Window[] = [];
  /** The acting captains' windows (22 B9): each counts in the budget while its plate is open (22 C10). */
  private crewWindows: Crew[] = [];
  private clock = 0;
  /** How far paused labels have faded, 0 (shown) to 1 (gone), on the wall clock. */
  private hush = 0;
  private paused = false;

  /** Shows `pk`'s label from `fromS` to `toS` effect-seconds from now (a negative start is now). */
  show(pk: string, fromS: number, toS: number, opts: CastWindow = {}): void {
    if (toS <= Math.max(0, fromS)) return;
    const c = this.clock;
    this.windows.push({
      pk, from: c + Math.max(0, fromS), to: c + toS,
      ...(opts.tag ? { tag: opts.tag } : {}),
      ...(opts.holdFromS !== undefined ? { holdFrom: c + opts.holdFromS } : {}),
      ...(opts.holdToS !== undefined ? { holdTo: c + opts.holdToS } : {}),
      ...(opts.note ? { note: opts.note } : {}),
      ...(opts.eventKey ? { eventKey: opts.eventKey } : {}),
    });
    this.place();
  }

  /**
   * `pk`'s plate speaks for their part `text` in `eventKey`'s maneuver, from `fromS` to `toS` from now (22 B9).
   * `turn` (a volley's naming turn, 27 E6): it folds on its window even while the ship stays parked for the next turns.
   */
  showCrew(pk: string, fromS: number, toS: number, text: string, eventKey: string, turn = false): void {
    if (toS <= Math.max(0, fromS)) return;
    this.crewWindows.push({ pk, from: this.clock + Math.max(0, fromS), to: this.clock + toS, text, eventKey, ...(turn ? { turn } : {}) });
    this.place();
  }

  /** Whether one more label fits in the budget now: pieces shown and captains named together (22 C10). */
  hasRoom(): boolean {
    const t = this.clock;
    const span = CAST_LABEL_FADE_MS / 1000;
    const pieces = new Set(this.windows.filter((x) => x.shownAt !== undefined && !x.replaced && t < x.to + span).map((x) => x.pk));
    return pieces.size + this.namedAt(t) < ATTENTION_MAX;
  }

  /** The captains named at `t`: an open window, unfurling, whole or folding (22 C10). */
  private namedAt(t: number): number {
    return new Set(this.crewWindows.filter((w) => w.from <= t && t < w.to + CREW_UNFURL_S).map((w) => w.pk)).size;
  }

  /**
   * The captains whose plates are unfurled, by projection key: how far (0 to 1, 1 whole, 0 folded and
   * left out), their part and its event. A captain flying a sortie for it follows the flight as flown
   * (`flying`: the sortie's own opening, from parking to leaving, 22 B9), so a late start never names a
   * ship in flight; one that isn't, the window's times. A volley's turn (27 E6) opens no wider than either:
   * its ship stays parked through the later turns, and its name gives their names the room. Paused they fold on the wall clock; reduced
   * motion is whole or nothing. The latest window begun speaks when one captain has several.
   */
  crew(fade = true, flying?: (pk: string) => number | undefined): ReadonlyMap<string, { u: number; text: string; eventKey: string }> {
    const out = new Map<string, { u: number; text: string; eventKey: string }>();
    if (!this.crewWindows.length) return out;
    const hush = fade ? 1 - this.hush : this.paused ? 0 : 1;
    const latest = new Map<string, Crew>();
    for (const w of this.crewWindows) if (this.clock >= w.from && (!latest.get(w.pk) || w.from >= latest.get(w.pk)!.from)) latest.set(w.pk, w);
    for (const [pk, w] of latest) {
      const flown = flying?.(pk);
      const planned = Math.max(0, Math.min(1, (this.clock - w.from) / CREW_UNFURL_S, this.clock <= w.to ? 1 : 1 - (this.clock - w.to) / CREW_UNFURL_S));
      const own = fade ? planned : this.clock <= w.to ? 1 : 0;
      const open = w.turn ? Math.min(flown ?? own, own) : flown ?? own;
      const u = (fade ? open : open > 0 ? 1 : 0) * hush;
      if (u > 0) out.set(pk, { u, text: w.text, eventKey: w.eventKey });
    }
    return out;
  }

  /** Whether a window tagged `tag` shows now (it has its place, and its label is up). */
  showing(tag: string): boolean {
    return this.windows.some((w) => w.tag === tag && w.shownAt !== undefined && w.from <= this.clock && this.clock < w.to);
  }

  /** Ends every window tagged `tag` now (the maneuver won't play): an open one fades, a later one never opens. */
  retire(tag: string): void {
    this.windows = this.windows.filter((w) => w.tag !== tag || w.from <= this.clock);
    for (const w of this.windows) if (w.tag === tag) w.to = Math.min(w.to, this.clock);
  }

  /**
   * Advances the clock by `dtS` effect-seconds (the frame's time at the travel rate), dropping faded
   * windows. Paused, the clock holds and the labels fade by `wallS` instead; playing, they fade back.
   */
  step(dtS: number, paused = false, wallS = 0): void {
    const fade = CAST_LABEL_FADE_MS / 1000;
    this.paused = paused;
    this.hush = Math.min(1, Math.max(0, this.hush + (paused ? wallS : -wallS) / fade));
    if (paused) return;
    this.clock += dtS;
    const gone = this.clock - fade;
    if (this.windows.some((w) => w.to < gone)) this.windows = this.windows.filter((w) => w.to >= gone);
    // A window is kept a while past its planned close: a flight a protect held back still speaks for it.
    if (this.crewWindows.some((w) => w.to < this.clock - CREW_KEEP_S)) this.crewWindows = this.crewWindows.filter((w) => w.to >= this.clock - CREW_KEEP_S);
    this.place();
  }

  /** A seek or a scene change: every label goes at once. */
  clear(): void {
    this.windows = [];
    this.crewWindows = [];
    this.hush = 0;
    this.paused = false;
  }

  /**
   * Gives waiting windows their place in the budget (22 B7, C10): a piece already shown takes no new
   * place; otherwise one is free while the pieces shown and the captains named come to fewer than
   * `ATTENTION_MAX`, or a piece that is only lingering (every window of it past its maneuver) gives its
   * place up to one whose maneuver is starting or playing: its lingering windows end now and fade, as
   * the newcomer fades up. A captain being named takes a place the same way: a lingering piece yields.
   */
  private place(): void {
    const t = this.clock;
    const open = (w: Window) => w.from <= t && t <= w.to;
    const lingering = (w: Window) => w.holdTo === undefined || t > w.holdTo;
    const named = this.namedAt(t);
    const room = ATTENTION_MAX - named;
    // Captains named over the budget: the earliest-ending lingering pieces yield to them.
    const shown = new Map<string, Window[]>();
    for (const x of this.windows) if (x.shownAt !== undefined && !x.replaced && t < x.to) shown.set(x.pk, [...(shown.get(x.pk) ?? []), x]);
    const yielding = [...shown.values()].filter((ws) => ws.every(lingering)).sort((a, b) => Math.min(...a.map((x) => x.to)) - Math.min(...b.map((x) => x.to)));
    for (let over = shown.size - Math.max(0, room); over > 0 && yielding.length; over--) for (const x of yielding.shift()!) x.to = t;
    // Those whose maneuver plays first, then those in their lead, then the rest; earliest first.
    const rank = (w: Window) => (w.holdFrom !== undefined && w.holdFrom <= t && !lingering(w) ? 0 : w.holdFrom !== undefined && t < w.holdFrom ? 1 : 2);
    const waiting = this.windows.filter((w) => w.shownAt === undefined && open(w)).sort((a, b) => rank(a) - rank(b) || a.from - b.from);
    const span = CAST_LABEL_FADE_MS / 1000;
    for (const w of waiting) {
      // The pieces holding a place now, a plate fading out included (it gives its place up only as it
      // goes, so a newcomer crossfades in: never three at once, review of 22 C2).
      const held = this.windows.filter((x) => x.shownAt !== undefined && !x.replaced && t < x.to + span);
      const pieces = new Map<string, Window[]>();
      for (const x of held) pieces.set(x.pk, [...(pieces.get(x.pk) ?? []), x]);
      if (pieces.has(w.pk) || pieces.size < room) {
        w.shownAt = t;
        continue;
      }
      w.waited = true; // it fades up when it gets its place, as the one it replaces fades down
      // One already fading out makes room as it goes: the newcomer fades up against it.
      // Each piece's place goes to one newcomer only (`replaced`).
      const fading = [...pieces.values()].find((ws) => ws.every((x) => t >= x.to));
      if (fading) {
        for (const x of fading) x.replaced = true;
        w.shownAt = t;
        continue;
      }
      if (rank(w) === 2) continue;
      const yields = [...pieces.values()].filter((ws) => ws.every(lingering)).sort((a, b) => Math.min(...a.map((x) => x.to)) - Math.min(...b.map((x) => x.to)))[0];
      if (!yields) continue;
      for (const x of yields) { x.to = t; x.replaced = true; }
      w.shownAt = t;
    }
  }

  /**
   * The pieces labelled now, by projection key, with the plate's opacity: up to 1 over
   * CAST_LABEL_FADE_MS from when it took its place, then down to 0 over the same after its window, or
   * straight on and off with `fade` false (reduced motion). Paused, every one fades out the same way
   * (straight off in reduced motion).
   */
  now(fade = true): ReadonlyMap<string, number> {
    const shown = fade ? 1 - this.hush : this.paused ? 0 : 1;
    if (shown <= 0 || this.windows.length === 0) return NONE; // most frames: no new map
    const out = new Map<string, number>();
    for (const w of this.windows) {
      const a = this.alpha(w, fade) * shown;
      if (a > 0) out.set(w.pk, Math.max(out.get(w.pk) ?? 0, a));
    }
    return out;
  }

  /**
   * The window each labelled piece speaks for now (22 B5, B6): of its shown windows past their lead,
   * the one whose maneuver is playing, else the latest. Its note is the plate's, and its event is the
   * one History marks *now*, so the two always agree. A lead says nothing yet.
   */
  private speaking(): Map<string, Window> {
    const t = this.clock;
    const out = new Map<string, Window>();
    for (const w of this.windows) {
      if (!w.eventKey || this.alpha(w, true) <= 0 || (w.holdFrom !== undefined && t < w.holdFrom)) continue;
      const was = out.get(w.pk);
      const plays = (x: Window) => x.holdTo !== undefined && t <= x.holdTo;
      if (!was || (plays(w) && !plays(was)) || (plays(w) === plays(was) && w.from >= was.from)) out.set(w.pk, w);
    }
    return out;
  }

  /** The note each labelled piece wears now, with its event (22 B6). None while paused: the plates fade. */
  notes(): ReadonlyMap<string, CastNote> {
    const out = new Map<string, CastNote>();
    if (this.paused) return out;
    for (const [pk, w] of this.speaking()) if (w.note) out.set(pk, { text: w.note, eventKey: w.eventKey! });
    return out;
  }

  /** The events whose notes show now (22 B5: History marks their rows *now*), sorted. None while paused. */
  playing(): string[] {
    return [...new Set([...this.notes().values()].map((n) => n.eventKey))].sort();
  }

  private alpha(w: Window, fade: boolean): number {
    if (w.shownAt === undefined || this.clock < w.from) return 0;
    const span = CAST_LABEL_FADE_MS / 1000;
    if (!fade) return this.clock <= w.to ? 1 : 0;
    const up = w.waited ? Math.min(1, (this.clock - w.shownAt) / span) : 1; // a place free at its start shows at once
    const down = this.clock <= w.to ? 1 : 1 - (this.clock - w.to) / span;
    return Math.max(0, Math.min(up, down));
  }
}
