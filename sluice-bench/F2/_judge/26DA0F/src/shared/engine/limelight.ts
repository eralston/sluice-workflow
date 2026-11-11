// Limelight (22 C6, 05 §8.5b P-17, M-28): who is named in an episode, decided once over its beats in
// order, so the planner (beat shapes, montage), the renderer (plates, names) and a seek all agree.
// "Everyone's efforts deserve at least one moment of limelight, and everyone's victories deserve to be
// celebrated."
// - Moments and arcs are always named.
// - Each person's first turn of the episode is named, whatever it is.
// - After that, a turn is named only when everyone in it has had no named turn for `FAIR_TURN_MS` of
//   playback, so no one crowds the others out. The rest of their work still plays, unlabelled.
// - Each beat that opens a working day (a day turn, B-17) spotlights one captain in its breather: someone
//   not yet seen or spotlit this episode, else the one with the fewest named turns and spotlights, then by
//   seat order. A spotlight doesn't count as their first named turn, which may still come.
// Times are estimated from the beats' base shapes (no limelight yet) and the gaps' typical length, so the
// pass needs nothing the schedule hasn't decided. Pure and deterministic.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { ManeuverRule } from '../contracts/maneuver';
import type { Direction, Limelight } from '../contracts/playback';
import { DAY_TURN_MS, GAP_MIN_MS, PULSE_GAP_MAX_MS } from '../playback/constants';
import { localDay } from '../playback/schedule';
import { turnsOf, type SequenceOptions } from './maneuvers';
import type { RoundFacts } from './types';

/** At most one named turn per person in this much playback at 1×, moments and first turns aside (P-17). */
export const FAIR_TURN_MS = 8000;
/** A gap's typical length for the estimate: half-way between the shortest and the cap. */
const GAP_ESTIMATE_MS = (GAP_MIN_MS + PULSE_GAP_MAX_MS) / 2;

type Prio = Parameters<typeof turnsOf>[4];

/**
 * The episode's limelight: `beats` are its beats' events in order (the schedule's groups), `seats` the
 * region's captains in seat order (the spotlight's candidates), `tz` the zone its days are read in.
 */
export function limelightOf(h: ScopeHistory, beats: readonly AnyTimelineEvent[][], f: RoundFacts, rules: readonly ManeuverRule[], prio: Prio | undefined, seats: readonly CanonicalKey[], tz: string, seq?: SequenceOptions, dir?: Direction): Limelight {
  const named = new Set<string>();
  const spotlights = new Map<number, CanonicalKey>();
  const lastNamed = new Map<CanonicalKey, number>();
  const count = new Map<CanonicalKey, number>();
  const seen = (p: CanonicalKey) => lastNamed.has(p);
  // Spotlit already (a rotation's turn), apart from being named: a spotlight may not show (no room,
  // reduced motion), so it never uses up a person's first named turn (22 C9 review).
  const spotlit = new Set<CanonicalKey>();
  const name = (people: readonly CanonicalKey[], at: number) => {
    for (const p of people) {
      lastNamed.set(p, at);
      count.set(p, (count.get(p) ?? 0) + 1);
    }
  };
  let t = 0;
  beats.forEach((events, index) => {
    if (!events.length) return;
    const opensDay = index > 0 && localDay(events[0]!.occurredAt, tz) !== localDay(beats[index - 1]!.at(-1)!.occurredAt, tz);
    t += index === 0 ? 0 : opensDay ? DAY_TURN_MS : GAP_ESTIMATE_MS;
    if (opensDay && seats.length) {
      // The breather's spotlight: someone not yet seen, else the fewest named turns, then seat order.
      const unseen = seats.find((p) => !seen(p) && !spotlit.has(p));
      const pick = unseen ?? [...seats].sort((a, b) => (count.get(a) ?? 0) - (count.get(b) ?? 0) || seats.indexOf(a) - seats.indexOf(b))[0]!;
      spotlights.set(index, pick);
      spotlit.add(pick);
      count.set(pick, (count.get(pick) ?? 0) + 1); // the rotation counts it; first turns and the fair share don't
    }
    const { turns, durationMs } = turnsOf(h, events, f, rules, prio, seq, dir);
    for (const turn of turns) {
      const at = t + turn.startMs;
      const first = turn.people.some((p) => !seen(p));
      const fair = turn.people.every((p) => at - (lastNamed.get(p) ?? -Infinity) >= FAIR_TURN_MS);
      if (turn.always || first || fair) {
        named.add(turn.key);
        name(turn.people, at);
      }
    }
    t += durationMs;
  });
  return { named, spotlights };
}
