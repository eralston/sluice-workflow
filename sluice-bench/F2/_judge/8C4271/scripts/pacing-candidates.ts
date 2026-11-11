// The pacing candidates (v1.4 C2): what each E item would save per pod, modelled and not built.
// Read-only over the engine, like the ledger it extends. Three ways to estimate:
//   R  a rule edit, run as a real re-schedule (`scheduleOf` with edited `rules`): exact for what it models;
//   P  post-hoc on a beat's plan: a waiting maneuver starts earlier (the sequencer is private);
//   F  on the frame: the gaps and day turns of the final schedule.
// Pure and deterministic: no dates, no machine data.
import type { CanonicalKey } from '../src/shared/contracts/keys';
import type { PlannedManeuver } from '../src/shared/contracts/maneuver';
import type { Beat, BeatSchedule } from '../src/shared/contracts/playback';
import { MONTAGE_PACE, NOTE_MIN_MS, crewTimes } from '../src/shared/engine/maneuvers';
import { CLOSE_SLIDE_MS, PACE_RULES, RULE, castOf, phases, workOf, type PaceRule } from '../src/shared/engine/pace';
import { DESKTOP } from '../src/shared/profile/bundled';
import { SOLAR } from '../src/shared/hierarchy/solar';
import { FINAL_HOLD_MS, GAP_MIN_MS, ORIENT_MS } from '../src/shared/playback/constants';
import { beforeF2, bindingOf, planOf, resolvePods, scheduleOf, type Binding, type EngineInputs, type ResolvedPod } from './pacing-ledger';


// ---- The model's assumptions (named here; the md lists them) ----

/** E1: `facility.enter` gather 1300 -> 715 (the summoner's flight, 55%, stays; the beacon pulses and bearing go). */
export const E1_GATHER_MS = 715;
/** E4a (built): a first merge transforms from its gather: act 2300, land 500 (was act 1600, land 4400); the station fires as the 4.4 s transform ends. C2 modelled act 3500. */
export const E4A_FIRST = { tell: 300, gather: 900, act: 2300, land: 500, echo: 3000, disperse: 900 } as const;
/** E5: the beam that replaces a merge: no gather, so no held turn. */
export const E5_BEAM = { tell: 200, act: 900, echo: 400 } as const;
/** E6, C2's model: a volley's members start within this long of the group's first merge (ms), on the same day. The built window is `VOLLEY_WINDOW_MS` (director.ts, 20 s). */
export const C2_VOLLEY_WINDOW_MS = 10_000;
/** E6: a member plays only its split beam. */
export const VOLLEY_ECHO_MS = 1500;
/** E7: a sweep: tell 300, act 900 plus this per further creation, echo 400. */
export const SWEEP_PER_EXTRA_MS = 250;
/** E8: a day turn keeps this share of itself; gaps on the last day keep this share (both floored). */
export const E8_DAY_TURN_KEEP = 0.6;
export const E8_LAST_DAY_KEEP = 0.7;
/** E8's sensitivity floor, ms (the scoped floor is `GAP_MIN_MS`). */
export const E8_SENS_FLOOR_MS = 250;

// ---- Shapes ----

export interface CandidateRow {
  id: string; name: string; method: string; assumption: string;
  savingMs: number; savingPct: number; estTotalMs: number;
  /** What changed (merges replaced, maneuvers advanced, ...), so a 0 s row says whether it fired. */
  touched: number; detail: string; flag?: string;
}
export interface PodCandidates { label: string; baselineMs: number; rows: CandidateRow[] }
export interface Candidates { pods: PodCandidates[] }

const ri = Math.round;
const pct1 = (n: number) => Math.round(n * 1000) / 10;
const endOf = (m: PlannedManeuver) => m.afterMs + m.durationMs;
const sumPhases = (m: PlannedManeuver, names: string[]) => m.phases.filter((p) => names.includes(p.phase)).reduce((a, p) => a + p.durMs, 0);

// ---- One run: a schedule and the plans of its played beats ----

interface Run { sch: BeatSchedule; played: Beat[]; plans: PlannedManeuver[][]; orient: number }

function runOf(rp: ResolvedPod, inputs: EngineInputs): Run {
  const sch = scheduleOf(rp.h, rp.scene, rp.tz, inputs);
  const played = sch.beats.filter((b) => b.durationMs > 0);
  const plans = played.map((b) => planOf(rp.h, rp.areaKey, b, sch.limelight, inputs));
  const ref = SOLAR.resolve(rp.scene as Parameters<typeof SOLAR.resolve>[0])?.ref;
  const orient = SOLAR.pacing?.(rp.h, ref)?.orientMs ?? ORIENT_MS;
  return { sch, played, plans, orient };
}

// ---- Method P: advance a wait ----

type PKind = 'E2' | 'E4b' | 'E4c';

/** How much earlier a waiting maneuver may start under the P candidates in `kinds` (the largest that applies, not the sum). */
function advanceOf(kinds: ReadonlySet<PKind>, m: PlannedManeuver, b: Binding): number {
  const own = sumPhases(m, ['tell', 'gather']);
  const out = [0];
  // A claim-anchored wait already travels while it waits (27 E2, built): neither E2 nor E4b advances it.
  if (b.anchor === 'claim') return 0;
  // A seam or a near start is E4b's and E4c's own, built (27 E4): nothing left to advance.
  if (b.anchor === 'seam' || b.anchor === 'near') return 0;
  if (kinds.has('E2') && b.cause === 'P-6') out.push(own);
  if (kinds.has('E4b') && (b.cause === 'P-4' || b.cause === 'P-6')) out.push(Math.min(sumPhases(b.pred, ['echo', 'disperse']), own));
  if (kinds.has('E4c') && b.cause === 'P-5' && b.anchor === 'end') out.push(Math.max(0, endOf(b.pred) - (b.pred.afterMs + crewTimes(b.pred.phases).closeMs)));
  return Math.max(...out);
}

/** A labelled maneuver holds the beat open for its note; light work costs the schedule nothing. */
const heldOf = (m: PlannedManeuver) => (m.quiet ? m.durationMs : Math.max(m.durationMs, NOTE_MIN_MS));

/** Re-time one beat's plan; returns how much shorter the beat gets and how many maneuvers started earlier. */
function retimeBeat(ms: PlannedManeuver[], kinds: ReadonlySet<PKind>): { gain: number; advanced: number } {
  const real = ms.filter((m) => m.id !== RULE.agentLight);
  const order = [...real].sort((a, b) => a.afterMs - b.afterMs);
  const shift = new Map<PlannedManeuver, number>();
  const next = new Map<PlannedManeuver, number>();
  let advanced = 0;
  for (const m of order) {
    let start = m.afterMs;
    if (m.arc?.merge) {
      // An arc close follows its merge: at the merge's echo start + ARC_IMPACT_MS.
      const merge = real.find((x) => x.id === RULE.attachmentMerge && x.eventKey === m.arc!.merge);
      start = m.afterMs - (merge ? (shift.get(merge) ?? 0) : 0);
    } else if (m.afterMs > 0) {
      const b = bindingOf(m, ms);
      if (b) {
        const a = advanceOf(kinds, m, b);
        if (a > 0) advanced++;
        start = Math.max(0, m.afterMs - (shift.get(b.pred) ?? 0) - a);
      }
    }
    next.set(m, start);
    shift.set(m, m.afterMs - start);
  }
  const oldEnd = Math.max(0, ...real.map((m) => m.afterMs + heldOf(m)));
  const newEnd = Math.max(0, ...real.map((m) => next.get(m)! + heldOf(m)));
  return { gain: Math.max(0, oldEnd - newEnd), advanced };
}

function gainP(run: Run, kinds: ReadonlySet<PKind>): { gainMs: number; advanced: number } {
  let gainMs = 0, advanced = 0;
  for (const ms of run.plans) {
    const r = retimeBeat(ms, kinds);
    gainMs += r.gain; advanced += r.advanced;
  }
  return { gainMs, advanced };
}

// ---- Method F: the frame ----

/** What E8 saves on a schedule: day turns keep 0.6 of themselves, last-day gaps (and the tail gap) 0.7, both floored. */
function gainF(run: Run, floor: number): { gainMs: number; dayTurns: number; lastDayGaps: number } {
  const { sch, played } = run;
  const lastOpen = played.map((b) => !!b.opensDay).lastIndexOf(true);
  let prevEnd = run.orient, gainMs = 0, dayTurns = 0, lastDayGaps = 0;
  const cut = (g: number, keep: number) => Math.max(0, g - Math.max(floor, keep * g));
  played.forEach((b, i) => {
    const g = b.presentationStartMs - prevEnd;
    if (b.opensDay) { gainMs += cut(g, E8_DAY_TURN_KEEP); dayTurns++; }
    else if (i > lastOpen) { gainMs += cut(g, E8_LAST_DAY_KEEP); lastDayGaps++; }
    prevEnd = b.presentationStartMs + b.durationMs;
  });
  const tailGap = sch.totalMs - FINAL_HOLD_MS - prevEnd;
  if (tailGap > 0) { gainMs += cut(tailGap, E8_LAST_DAY_KEEP); lastDayGaps++; }
  return { gainMs, dayTurns, lastDayGaps };
}

// ---- Method R: rule edits ----

const subjectKey = (eventKey: string, subject: string | undefined) => `${eventKey}|${subject ?? ''}`;

interface Derived {
  /** E5: the merges the director replaces by a progress beam. */
  beamed: Set<string>; mergesTotal: number;
  /** E6: the volley members. */
  volley: Set<string>; groups: number;
  /** E7: the creations that fold into a sweep, and the leaders (with their group size). */
  swept: Set<string>; leaders: Map<string, number>;
  /** E5: every merge is exempt, so the set is empty by construction (not a model result). */
  allExempt: boolean;
  counts: { facilityEnter: number; firstMerge: number; protectedMoments: number };
}

interface Entry { m: PlannedManeuver; beat: Beat; bi: number; abs: number; day: number; key: string }

/** The sets the R candidates act on, taken from the baseline plans. */
function derive(base: Run): Derived {
  const entries: Entry[] = [];
  let day = 0;
  base.played.forEach((beat, bi) => {
    if (beat.opensDay) day++;
    for (const m of base.plans[bi]!) entries.push({ m, beat, bi, abs: beat.presentationStartMs + m.afterMs, day, key: subjectKey(m.eventKey, m.cast.subject?.[0]) });
  });
  const byTime = (a: Entry, b: Entry) => a.abs - b.abs || a.bi - b.bi;
  const merges = entries.filter((x) => x.m.id === RULE.attachmentMerge).sort(byTime);
  const hasClose = (x: Entry) => base.plans[x.bi]!.some((o) => o.arc?.merge === x.m.eventKey);

  // E5: merges with no arc close, minus each author's first merge and each day's climax.
  const exempt = new Set<string>();
  const seen = new Set<string>();
  for (const x of merges) {
    const author = x.m.cast.agent?.[0] ?? '';
    if (!seen.has(author)) { seen.add(author); exempt.add(x.key); }
  }
  const partner = (x: Entry) => (x.m.arc?.merge || (x.m.id === RULE.attachmentMerge && hasClose(x)) ? 1 : 0);
  for (const d of new Set(entries.map((x) => x.day))) {
    const prot = entries.filter((x) => x.day === d && x.m.protect).sort((a, b) => b.m.keys.length - a.m.keys.length || partner(b) - partner(a) || byTime(a, b));
    const top = prot[0];
    if (top && top.m.id === RULE.attachmentMerge) exempt.add(top.key);
  }
  const beamed = new Set(merges.filter((x) => !hasClose(x) && !exempt.has(x.key)).map((x) => x.key));
  const allExempt = merges.length > 0 && merges.every((x) => exempt.has(x.key));

  // E6: per facility, in absolute order, members within the window of the group's first, on its day.
  const volley = new Set<string>();
  let groups = 0;
  const byFacility = new Map<string, Entry[]>();
  for (const x of merges) {
    const f = x.m.cast.facility?.[0] ?? '';
    byFacility.set(f, [...(byFacility.get(f) ?? []), x]);
  }
  for (const list of byFacility.values()) {
    let head: Entry | null = null;
    for (const x of list) {
      if (head && x.abs - head.abs <= C2_VOLLEY_WINDOW_MS && x.day === head.day) volley.add(x.key);
      else { head = x; groups++; }
    }
  }

  // E7: within a beat, the first creation sweeps and the others fold in.
  const swept = new Set<string>();
  const leaders = new Map<string, number>();
  base.plans.forEach((ms) => {
    const made = ms.filter((m) => m.id === RULE.pieceAppear || m.id === RULE.threatEmerge).sort((a, b) => a.afterMs - b.afterMs);
    if (made.length < 2) return;
    leaders.set(subjectKey(made[0]!.eventKey, made[0]!.cast.subject?.[0]), made.length);
    for (const m of made.slice(1)) swept.add(subjectKey(m.eventKey, m.cast.subject?.[0]));
  });

  const all = entries.map((x) => x.m);
  return {
    beamed, mergesTotal: merges.length, allExempt, volley, groups, swept, leaders,
    counts: {
      facilityEnter: all.filter((m) => m.id === RULE.facilityEnter).length,
      firstMerge: all.filter((m) => m.id === RULE.attachmentMerge && m.variant === 'first').length,
      protectedMoments: all.filter((m) => !!m.protect).length,
    },
  };
}

type Variant = NonNullable<PaceRule['variant']>;
const withWhen = (r: PaceRule, extra: NonNullable<PaceRule['when']>): PaceRule => ({ ...r, when: (mv, e, f) => (r.when ? r.when(mv, e, f) : true) && extra(mv, e, f) });
const withVariant = (r: PaceRule, first: Variant): PaceRule => ({ ...r, variant: (mv, e, f) => first(mv, e, f) ?? r.variant?.(mv, e, f) ?? null });
const mapRule = (rules: PaceRule[], id: string, fn: (r: PaceRule) => PaceRule) => rules.map((r) => (r.id === id ? fn(r) : r));
const keyOfMove = (mv: Parameters<NonNullable<PaceRule['when']>>[0], e: { eventKey: string }) => subjectKey(e.eventKey, 'key' in mv ? mv.key : undefined);

type RuleEdit = (rules: PaceRule[], d: Derived) => { rules: PaceRule[]; touched: number; detail: string };

const EDITS: Record<string, RuleEdit> = {
  E1: (rules, d) => ({
    rules: mapRule(rules, RULE.facilityEnter, (r) => ({ ...r, phases: phases(['tell', 300], ['gather', E1_GATHER_MS], ['act', 1200], ['land', 600]) })),
    touched: d.counts.facilityEnter, detail: `${d.counts.facilityEnter} facility entrances, gather 1300 -> ${E1_GATHER_MS}`,
  }),
  E4a: (rules, d) => ({
    rules: mapRule(rules, RULE.attachmentMerge, (r) => withVariant(r, (mv, _e, f) => (mv.m === 'settle' && f.firstMerge?.get(mv.facility) === mv.key
      ? { name: 'first', phases: phases(['tell', E4A_FIRST.tell], ['gather', E4A_FIRST.gather], ['act', E4A_FIRST.act], ['land', E4A_FIRST.land], ['echo', E4A_FIRST.echo], ['disperse', E4A_FIRST.disperse]), holds: ['facility'] }
      : null))),
    touched: d.counts.firstMerge, detail: `${d.counts.firstMerge} first ${d.counts.firstMerge === 1 ? 'merge' : 'merges'}, 3.2 s each`,
  }),
  E4d: (rules, d) => {
    const quick = (id: string, ps: readonly { phase: PaceRule['phases'][number]['phase']; durMs: number }[]) =>
      phases(...ps.map((p) => [p.phase, (p.phase === 'land' && (id === RULE.objectiveAccomplish || id === RULE.threatAccomplish)) ? p.durMs : ri(p.durMs * MONTAGE_PACE)] as [typeof p.phase, number]));
    return {
      rules: rules.map((r) => {
        if (!r.protect) return r;
        const v = r.variant;
        return { ...r, phases: quick(r.id, r.phases), ...(v ? { variant: ((mv, e, f) => {
          const x = v(mv, e, f);
          return x ? { ...x, phases: quick(r.id, x.phases) } : null;
        }) as Variant } : {}) };
      }),
      touched: d.counts.protectedMoments, detail: `${d.counts.protectedMoments} protected moments, phases x ${MONTAGE_PACE} (a close's land stays ${CLOSE_SLIDE_MS} ms)`,
    };
  },
  E5: (rules, d) => {
    const merge = rules.find((r) => r.id === RULE.attachmentMerge)!;
    const beam: PaceRule = {
      id: 'attachment.beam', tier: 'narrative', match: merge.match,
      when: (mv, e) => d.beamed.has(keyOfMove(mv, e)),
      cast: (mv, e, f) => (mv.m === 'settle'
        ? castOf({ agent: [f.attachments.get(mv.key)?.author ?? e.changedBy], target: workOf(f, mv.key, e.occurredAt) as CanonicalKey[] })
        : {}),
      phases: phases(['tell', E5_BEAM.tell], ['act', E5_BEAM.act], ['echo', E5_BEAM.echo]),
    };
    const out: PaceRule[] = [];
    for (const r of rules) {
      if (r.id === RULE.attachmentMerge) { out.push(withWhen(r, (mv, e) => !d.beamed.has(keyOfMove(mv, e))), beam); } else out.push(r);
    }
    const hint = d.beamed.size === 0 && d.allExempt ? '; every merge is exempt (each author\'s first merge or a day\'s climax), so E5 is not exercised in this pod' : '';
    return { rules: out, touched: d.beamed.size, detail: `${d.beamed.size} of ${d.mergesTotal} merges replaced by a 1.5 s beam${hint}` };
  },
  E6: (rules, d) => ({
    rules: mapRule(rules, RULE.attachmentMerge, (r) => withVariant(r, (mv, e) => (d.volley.has(keyOfMove(mv, e)) ? { name: 'volley', phases: phases(['echo', VOLLEY_ECHO_MS]) } : null))),
    touched: d.volley.size, detail: `${d.volley.size} ${d.volley.size === 1 ? 'merge joins' : 'merges join'} ${d.groups} ${d.groups === 1 ? 'volley' : 'volleys'} (${d.mergesTotal} merges)`,
  }),
  E7: (rules, d) => {
    const sweep = (r: PaceRule) => withVariant(withWhen(r, (mv, e) => !d.swept.has(keyOfMove(mv, e))), (mv, e) => {
      const n = d.leaders.get(keyOfMove(mv, e));
      return n ? { name: 'sweep', phases: phases(['tell', 300], ['act', 900 + SWEEP_PER_EXTRA_MS * (n - 1)], ['echo', 400]) } : null;
    });
    return {
      rules: mapRule(mapRule(rules, RULE.pieceAppear, sweep), RULE.threatEmerge, sweep),
      touched: d.swept.size, detail: `${d.swept.size} creations fold into ${d.leaders.size} sweeps`,
    };
  },
};

/** C2's rules: today's, less the sector sweep (27 E7, built since) and with summons on the fly undone (27 F2), so its committed numbers don't move. */
const NO_SWEEP: readonly PaceRule[] = beforeF2(PACE_RULES).filter((r) => r.id !== RULE.regionSweep);

/** Compose rule edits in the order given: wrappers chain `when` with && and variants first-hit. */
function compose(ids: string[], d: Derived): { rules: PaceRule[]; touched: Record<string, number>; detail: string[] } {
  let rules = [...NO_SWEEP] as PaceRule[];
  const touched: Record<string, number> = {};
  const detail: string[] = [];
  for (const id of ids) {
    const r = EDITS[id]!(rules, d);
    rules = r.rules; touched[id] = r.touched; detail.push(`${id}: ${r.detail}`);
  }
  return { rules, touched, detail };
}

// ---- The candidates ----

interface Def { id: string; name: string; method: string; assumption: string }
const DEFS: Def[] = [
  { id: 'E1', name: 'Fewer signals', method: 'R', assumption: `facility.enter gather 1300 -> ${E1_GATHER_MS} ms (the summoner's flight, 55%, stays; the three beacon pulses and bearing go). Other cut effects cost no schedule time: a floor, E1's value is attention. Built (E1): today's rules already have it, so this row reads 0; see *Built*.` },
  { id: 'E2', name: 'Labels on arrival', method: 'P', assumption: 'Built (E2): today\'s rules already have it, so this row reads about 0; see the build record. A P-6 wait starts tell + gather of its own earlier (it travels while waiting, claims its labels at its act). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later.' },
  { id: 'E3', name: 'Progress beam (enabler)', method: '-', assumption: 'Enabler: used by E5, which carries the saving; alone it costs no schedule time.' },
  { id: 'E4a', name: 'Transform from gather (U1)', method: 'R', assumption: `Built (E4a): today's rules already have it, so this row reads about 0; see *Built*. A first merge's 4.4 s transform starts at its gather and the station fires as it ends: tell 300, gather 900, act ${E4A_FIRST.act}, land ${E4A_FIRST.land}, echo 3000, disperse 900, holds the facility (3.2 s saved per first merge; C2 modelled act 3500, 2.0 s).` },
  { id: 'E4b', name: 'Overlap neighbours (P3)', method: 'P', assumption: 'Built (E4b): today\'s rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on attention places, or on a shared actor). P-4 and P-6 waits start min(predecessor echo + disperse, own tell + gather) earlier (P-3 and P-5 share an actor, which P3 forbids). No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later.' },
  { id: 'E4c', name: 'Captain waits near (P4)', method: 'P', assumption: 'Built (E4c): today\'s rules already have it, so this row reads about 0; see *Built*. Any residual is a wait the part does not cover (a wait on a protected pair, or on the attention budget). A P-5 wait starts (predecessor end - its crew close) earlier, floored at 0: the captain waits near instead of leaving. No budget re-fit. An upper bound: it releases only the binding predecessor, so a wait also held by another constraint would start later.' },
  { id: 'E4d', name: 'Short forms (P7)', method: 'R', assumption: `Built (E4d): the short forms exist, unused until E5; see *Built* for the real ceiling. A ceiling (the director picks which): every protected rule and its variants has each phase x ${MONTAGE_PACE}, except a close's land; the captain's plate minimums still floor it.` },
  { id: 'E5', name: 'The director', method: 'R', assumption: `Built (E5a): the pass picks each moment's form; see *Built*. Modelled here: merges with no arc close, minus each author's first merge and each day's climax, become a ${((E5_BEAM.tell + E5_BEAM.act + E5_BEAM.echo) / 1000).toFixed(1)} s progress beam. Trade-down and the target are not modelled: E5 + E4d is its ceiling.` },
  { id: 'E6', name: 'Multi-fire volleys', method: 'R', assumption: `Built (E6): merges into one facility within 20 s of x on one day play as one volley, under the B-15 guard; see *Built*. Modelled here: per facility, merges within ${C2_VOLLEY_WINDOW_MS / 1000} s of a group's first (same day) play only their split beam (echo ${VOLLEY_ECHO_MS} ms, no gather, no held turn). The union formation's labels are not modelled.` },
  { id: 'E7', name: 'Sector sweep', method: 'R', assumption: `A lower bound (within a beat only): the first of n >= 2 creations sweeps (tell 300, act 900 + ${SWEEP_PER_EXTRA_MS} x (n-1), echo 400) and the others are dropped. Built (E7): a beat with 4 or more creations plays one Sector sweep (tell 300, act min(2000, 110 x n) + 1000, echo 400); see *Built*.` },
  { id: 'E8', name: 'Tighter frame', method: 'F', assumption: `Day turns keep ${E8_DAY_TURN_KEEP} of themselves, last-day gaps and the tail gap ${E8_LAST_DAY_KEEP}, floored at ${GAP_MIN_MS} ms. Expected 0 s: every pod is over budget and already squeezed to ${GAP_MIN_MS} ms. Widening early days is ignored.` },
  { id: 'E8-250', name: 'Tighter frame (floor 250 ms)', method: 'F', assumption: `As E8 with a ${E8_SENS_FLOOR_MS} ms floor: a sensitivity row (gaps squeezed further than the engine's minimum).` },
  { id: 'E9', name: 'Camera', method: '-', assumption: 'Renderer-only: the camera costs no schedule time.' },
];
export const CANDIDATE_IDS = [...DEFS.map((d) => d.id), 'Stack', 'Stack+short'];

const STACK_R = ['E1', 'E4a', 'E5', 'E6', 'E7'];
const STACK_P = new Set<PKind>(['E2', 'E4b', 'E4c']);
const STACK_ASSUMPTION = 'E1, E2, E4a, E4b, E4c, E5, E6, E7, E8 together: rule edits composed in that order (wrappers chain `when` with && and variants first-hit; sets from the baseline plans), then P on the edited plans (an upper bound, as for E2, E4b, E4c), then F. Interactions are real: not a sum of the rows.';

/** The candidates for every pod (or those whose label is in `only`). */
export function buildCandidates(given: EngineInputs = {}, only?: string[]): Candidates {
  // C2's estimates are against the baseline as it was before the director (27 E5): the director is the E5 row's own change.
  // And without the sector sweep (27 E7): the E7 row is its own model of it.
  // And without rising tempo (27 E8): the E8 row is its own model of the frame.
  const inputs: EngineInputs = { ...given, direct: false, risingTempo: false, rules: given.rules ?? NO_SWEEP };
  const pods: PodCandidates[] = [];
  for (const rp of resolvePods()) {
    if (only && !only.includes(rp.label)) continue;
    const base = runOf(rp, inputs);
    const baselineMs = ri(base.sch.totalMs);
    const budget = inputs.budgetMs ?? (inputs.profile ?? DESKTOP).pacing.budgetMs;
    const d = derive(base);
    const rows: CandidateRow[] = [];
    const mk = (def: Def, estTotalMs: number, touched: number, detail: string, extraFlag?: string): CandidateRow => {
      const savingMs = baselineMs - estTotalMs;
      const flags = [extraFlag, estTotalMs < budget && def.method !== 'R' && def.method !== '-' ? 'below the budget: gaps would re-expand' : undefined, savingMs < 0 ? 'longer than the baseline' : undefined].filter(Boolean);
      return { id: def.id, name: def.name, method: def.method, assumption: def.assumption, savingMs, savingPct: baselineMs > 0 ? pct1(savingMs / baselineMs) : 0, estTotalMs, touched, detail, ...(flags.length ? { flag: flags.join('; ') } : {}) };
    };
    const rTotal = (rules: PaceRule[]) => { const r = runOf(rp, { ...inputs, rules }); return { total: ri(r.sch.totalMs), run: r }; };

    for (const def of DEFS) {
      if (def.method === 'R') {
        const c = compose([def.id], d);
        const { total } = rTotal(c.rules);
        rows.push(mk(def, total, c.touched[def.id]!, c.detail[0]!.replace(/^[^:]+: /, '')));
      } else if (def.method === 'P') {
        const g = gainP(base, new Set<PKind>([def.id as PKind]));
        rows.push(mk(def, baselineMs - ri(g.gainMs), g.advanced, `${g.advanced} waits start earlier`));
      } else if (def.method === 'F') {
        const g = gainF(base, def.id === 'E8' ? GAP_MIN_MS : E8_SENS_FLOOR_MS);
        rows.push(mk(def, baselineMs - ri(g.gainMs), g.dayTurns + g.lastDayGaps, `${g.dayTurns} day turns, ${g.lastDayGaps} last-day gaps`));
      } else {
        rows.push(mk(def, baselineMs, 0, 'not scheduled'));
      }
    }
    for (const [id, name, withShort] of [['Stack', 'Stack', false], ['Stack+short', 'Stack + short forms', true]] as const) {
      const ids = withShort ? [...STACK_R, 'E4d'] : STACK_R;
      const c = compose(ids, d);
      const { total, run } = rTotal(c.rules);
      const p = gainP(run, STACK_P);
      const f = gainF(run, GAP_MIN_MS);
      const touched = Object.values(c.touched).reduce((a, b) => a + b, 0) + p.advanced;
      const def: Def = { id, name, method: 'R+P+F', assumption: STACK_ASSUMPTION + (withShort ? ' Plus E4d (short forms), last, a ceiling.' : '') };
      rows.push(mk(def, total - ri(p.gainMs) - ri(f.gainMs), touched, `${c.detail.join('; ')}; P: ${p.advanced} waits advanced (${(p.gainMs / 1000).toFixed(1)} s); F: ${(f.gainMs / 1000).toFixed(1)} s`));
    }
    pods.push({ label: rp.label, baselineMs, rows });
  }
  return { pods };
}

// ---- Markdown ----

const sec = (ms: number) => (ms / 1000).toFixed(1);
const cell = (r: CandidateRow) => `${sec(r.savingMs)} s (${r.savingPct.toFixed(1)}%)`;
const esc = (s: string) => s.replace(/\|/g, '\\|');
/** A row's label: the stack rows carry their own name; the others lead with their id. */
const label = (r: CandidateRow) => (r.id.startsWith('Stack') ? r.name : `${r.id} ${r.name}`);

/** The `## Candidates` section appended to the ledger's markdown. */
export function renderCandidates(c: Candidates): string {
  const o: string[] = [];
  o.push('## Candidates', '');
  o.push('What each E item would save per pod, **modelled, not built** (`npm run pacing -- --candidates`). Positive means shorter. Each row is one of three methods. **R**: the rule edit is run as a real re-schedule (beat lengths, gaps, the 45 s budget fit and the cuts all re-run). **P**: post-hoc on the plans (a waiting maneuver starts earlier; the sequencer is private, so there is no budget re-fit, and P is an optimistic upper bound). **F**: on the frame (gaps and day turns of the final schedule). The stack rows compose the edits and are not sums: interactions are real. Comet is the yardstick and comes first.', '');
  o.push('### Assumptions', '');
  for (const d of DEFS) o.push(`- **${d.id}** (${d.method}) ${d.name}: ${d.assumption}`);
  o.push(`- **Stack** (R+P+F): ${STACK_ASSUMPTION}`);
  o.push('- **Not modelled**: the target, the director\'s trade-down, the union formation\'s labels, early-day widening, cross-beat sweeps. Rows from P or F that land under the budget say so: the gaps would re-expand.');
  o.push('- **Held time** in P is `max(duration, 1.8 s note)` unless the maneuver is quiet; light work costs nothing.', '');
  o.push('### Matrix (saving s, % of the pod\'s baseline)', '');
  o.push(`| Item | ${c.pods.map((p) => p.label).join(' | ')} |`, `|---|${c.pods.map(() => '---').join('|')}|`);
  o.push(`| *Baseline s* | ${c.pods.map((p) => sec(p.baselineMs)).join(' | ')} |`);
  for (const id of CANDIDATE_IDS) {
    const first = c.pods[0]?.rows.find((r) => r.id === id);
    o.push(`| ${first ? label(first) : id} | ${c.pods.map((p) => cell(p.rows.find((r) => r.id === id)!)).join(' | ')} |`);
  }
  o.push('');
  for (const p of c.pods) {
    o.push(`### ${p.label}`, '', `Baseline ${sec(p.baselineMs)} s.`, '');
    const head = ['| Rank | Item | Saving s | % | Est. total s | Assumption and detail |', '|---|---|---|---|---|---|'];
    o.push(...head);
    const rank = p.rows.filter((r) => !r.id.startsWith('Stack')).sort((a, b) => b.savingMs - a.savingMs || (a.id < b.id ? -1 : 1));
    const line = (n: string, r: CandidateRow) => `| ${n} | ${label(r)} |${sec(r.savingMs)} | ${r.savingPct.toFixed(1)} | ${sec(r.estTotalMs)} | ${esc(r.detail)}${r.flag ? ` **(${esc(r.flag)})**` : ''}. ${esc(r.assumption)} |`;
    rank.forEach((r, i) => o.push(line(String(i + 1), r)));
    for (const r of p.rows.filter((x) => x.id.startsWith('Stack'))) o.push(line('-', r));
    o.push('');
  }
  return o.join('\n');
}
