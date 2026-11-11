// The pacing ledger (v1.4 C1): where a pod's replay time goes. Read-only over the engine; nothing here
// writes a file (scripts/pacing.ts does). Pure: `buildLedger` builds histories from the fixtures and
// returns plain data, `renderMarkdown` turns it into the report. Deterministic: no dates, no machine data.
import stateMappingJson from '../config/state-mapping.json';
import halcyon from '../fixtures/scenarios/sprint-pods';
import meridian from '../fixtures/scenarios/v1/meridian-sprint';
import podSprint from '../fixtures/scenarios/v1/pod-sprint';
import { sprintScopes, toHistory, type Scenario } from '../fixtures/dsl';
import type { StateMapping, ScopeHistory } from '../src/shared/contracts/history';
import type { CanonicalKey } from '../src/shared/contracts/keys';
import type { ManeuverRule, PlannedManeuver } from '../src/shared/contracts/maneuver';
import type { Beat, BeatSchedule } from '../src/shared/contracts/playback';
import { sceneFacts } from '../src/shared/engine/facts';
import { ACTING_ROLES, NOTE_MIN_MS, claimMs, flyingPlay, gatherAtOf, nearStartMs, pacing, planManeuvers, priorityFor, releaseOfPlay, seamStartMs, tailOf, workEndOf, type SequenceOptions } from '../src/shared/engine/maneuvers';
import type { DeviceProfile } from '../src/shared/contracts/profile';
import { DIRECTOR_TARGET_MS } from '../src/shared/engine/director';
import { PACE_RULES, type PaceRule } from '../src/shared/engine/pace';
import { SOLAR } from '../src/shared/hierarchy/solar';
import { paceFacts } from '../src/shared/hierarchy/solarSource';
import '../src/shared/packs/all';
import { packFor } from '../src/shared/packs/registry';
import { ENGAGEMENT } from '../src/shared/playback/engagement';
import { buildScene, sceneEvents } from '../src/shared/playback/highlights';
import { buildBeatSchedule } from '../src/shared/playback/schedule';
import { storyTime } from '../src/shared/playback/storyTime';
import { FINAL_HOLD_MS, ORIENT_MS } from '../src/shared/playback/constants';

const mapping = stateMappingJson as StateMapping;

/** Everything the engine is given besides the history. */
export interface EngineInputs {
  budgetMs?: number;
  /** A device profile (15 §11): its pacing budget applies when `budgetMs` is not given. */
  profile?: DeviceProfile;
  /** Rules to schedule and plan with instead of `PACE_RULES` (C2's rule-edit candidates). */
  rules?: readonly ManeuverRule[];
  /** The sequencer's overlaps (27 E4), so the ledger can measure each part with it undone. */
  sequence?: SequenceOptions;
  /** `false`: no director (27 E5), the ledger's "before" for every item built ahead of it. */
  direct?: false;
  /** The director's target at 1x, ms (default `DIRECTOR_TARGET_MS`). */
  targetMs?: number;
  /** The director's levers it may pull (27 E5b; default all), the ledger's "before" for a lever. */
  levers?: readonly string[];
  /** `false`: no volleys (27 E6), the ledger's "before" for E6. */
  volleys?: false;
  /** `false`: no rising tempo (27 E8), the ledger's "before" for E8 and every item built ahead of it. */
  risingTempo?: false;
  /** `false`: no late-day montage (27 E10), the ledger's "before" for E10 and every item built ahead of it. */
  lateMontage?: false;
}

type SceneKeyArg = Parameters<typeof buildScene>[3];

/** The schedule the app plays for a pod's scene (budget 45 s by default). */
export function scheduleOf(h: ScopeHistory, scene: string, tz: string, inputs: EngineInputs): BeatSchedule {
  const { rules, sequence, direct, targetMs, levers, volleys, risingTempo, lateMontage } = inputs;
  const budgetMs = inputs.budgetMs ?? inputs.profile?.pacing.budgetMs;
  if (!rules && !sequence && direct === undefined && targetMs === undefined && !levers && volleys === undefined && risingTempo === undefined && lateMontage === undefined) return buildScene(h, h.range, tz, scene as SceneKeyArg, SOLAR, undefined, budgetMs);
  // The same call `buildScene` makes, with the edited rules given to the pacing hooks.
  const ref = SOLAR.resolve(scene as SceneKeyArg)?.ref;
  return buildBeatSchedule(h, h.range, tz, {
    ...pacing(packFor(h), { ...(rules ? { rules } : {}), ...(sequence ? { sequence } : {}), ...(direct === false ? { direct } : {}), ...(targetMs !== undefined ? { targetMs } : {}), ...(levers ? { levers } : {}), ...(volleys === false ? { volleys } : {}), ...(risingTempo === false ? { risingTempo } : {}), ...(lateMontage === false ? { lateMontage } : {}), facts: paceFacts, ...(ref?.level === 'pod' ? { region: ref.key } : {}) }),
    include: sceneEvents(h, scene as SceneKeyArg, SOLAR), hier: SOLAR, ...(budgetMs ? { budgetMs } : {}),
  });
}

/** The maneuvers one played beat plans, as `src/renderer/src/v1/plan.ts` plans them. */
export function planOf(h: ScopeHistory, podAreaKey: CanonicalKey, beat: Beat, limelight: BeatSchedule['limelight'], inputs: EngineInputs): PlannedManeuver[] {
  const prio = priorityFor(packFor(h), paceFacts);
  const f = sceneFacts(paceFacts(h), podAreaKey);
  return planManeuvers(h, beat, f, inputs.rules ?? PACE_RULES, ENGAGEMENT.calm, { ...(prio ? { priorityOf: prio } : {}), ...(limelight ? { limelight } : {}), ...(inputs.sequence ? { sequence: inputs.sequence } : {}) });
}

// ---- The ledger's shape ----

export type Cause = 'P-5' | 'P-3' | 'P-4' | 'P-6' | 'other';
const CAUSES: Cause[] = ['P-5', 'P-3', 'P-4', 'P-6', 'other'];

export interface RuleRow { key: string; ms: number; share: number; maneuvers: number; phases: Record<string, number> }
export interface PodLedger {
  label: string; path: string; scenario: string; project: string; sprint: string; tz: string; events: number;
  beats: { total: number; played: number; silent: number; cutByBudget: number };
  budgetMs: number | null; totalMs: number; uncappedMs: number;
  /** The wall time at 1x rate, the tempo counted (27 E5b): `totalMs` unless the director sped some beats. The summary's Total. */
  wallMs: number;
  /**
   * What the app plays (block E audit): the same inputs over the pod in story time (`resolvePods({ story: true })`).
   * The Summary's targets read this from now on; every other field is the recorded bundle's, as E1-E10 measured.
   */
  story: { wallMs: number; played: number; levers: string[] | null };
  /** The director's (27 E5): the target at 1x, the levers it pulled, and its estimate (null: undirected). */
  director: { targetMs: number; levers: string[]; estimateMs: number } | null;
  frame: { orientMs: number; gapMs: number; dayTurnMs: number; dayTurns: number; tailGapMs: number; finalHoldMs: number; beatsMs: number };
  playing: { byRule: RuleRow[]; byPhase: Record<string, number>; playingMs: number };
  held: { queueIdleMs: number; noteHoldMs: number };
  waits: { byCause: Record<Cause, { ms: number; count: number }>; maneuvers: number; carryMs: number; carryBeats: number };
}
export interface Ledger { pods: PodLedger[] }

export interface PodSpec { scenario: Scenario; scenarioName: string; sprint: string; pick: { tail: string } | 'busiest';
  /** Left out of `resolvePods()` unless `all: true`: the frozen Built rows, C2's candidates and the director golden were set against the other six (27 F1). */
  extra?: true;
}
const PODS: PodSpec[] = [
  ...['Comet', 'Nova', 'Quasar', 'Pulsar'].map((n) => ({ scenario: halcyon, scenarioName: 'sprint-pods', sprint: 'Sprint 41', pick: { tail: `${n} Pod` } })),
  { scenario: meridian, scenarioName: 'v1/meridian-sprint', sprint: 'Sprint 7', pick: 'busiest' as const },
  { scenario: podSprint, scenarioName: 'v1/pod-sprint', sprint: 'Sprint 13', pick: { tail: 'Harbor Pod' } },
  { scenario: halcyon, scenarioName: 'sprint-pods', sprint: 'Sprint 41', pick: { tail: 'Meteor Pod' }, extra: true },
];

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const ri = Math.round;
const tail = (p: string) => p.split('\\').pop() ?? p;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A row key: the rule id, with its variant and montage apart. */
const rowKey = (m: PlannedManeuver) => `${m.id}${m.variant ? `/${m.variant}` : ''}${m.montage ? '/montage' : ''}`;
const castKeys = (m: PlannedManeuver): string[] => Object.values(m.cast).flat() as string[];
const crew = (m: PlannedManeuver): string[] => [...(m.cast.agent ?? []), ...(m.cast.support ?? [])] as string[];
const shares = (a: string[], b: string[]) => a.some((x) => b.includes(x));
const endOf = (m: PlannedManeuver) => m.afterMs + m.durationMs;

interface BeatSlice { plain: Map<string, { ms: number; phases: Record<string, number> }>; playing: number; queueIdle: number; noteHold: number }

/** Split [0, D] of one beat into segments and charge each (the packet's "inside a beat"). */
function sliceBeat(D: number, ms: PlannedManeuver[]): BeatSlice {
  const out: BeatSlice = { plain: new Map(), playing: 0, queueIdle: 0, noteHold: 0 };
  const cuts = new Set<number>([0, D]);
  for (const m of ms) {
    cuts.add(m.afterMs); cuts.add(endOf(m));
    for (const p of m.phases) { cuts.add(m.afterMs + p.atMs); cuts.add(m.afterMs + p.atMs + p.durMs); }
  }
  const xs = [...cuts].filter((x) => x >= 0 && x <= D).sort((a, b) => a - b);
  const lastEnd = ms.reduce((a, m) => Math.max(a, endOf(m)), 0);
  const order = (a: PlannedManeuver, b: PlannedManeuver) =>
    endOf(b) - endOf(a) || a.afterMs - b.afterMs || Number(!!b.protect) - Number(!!a.protect) || cmp(a.id, b.id) || cmp(a.eventKey, b.eventKey);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!, b = xs[i + 1]!, w = b - a;
    if (w <= 0) continue;
    const active = ms.filter((m) => m.afterMs <= a && endOf(m) > a).sort(order);
    const lead = active[0];
    if (!lead) { if (a >= lastEnd) out.noteHold += w; else out.queueIdle += w; continue; }
    const off = a - lead.afterMs;
    const phase: string = lead.phases.find((p) => off >= p.atMs && off < p.atMs + p.durMs)?.phase ?? 'hold';
    const row = out.plain.get(rowKey(lead)) ?? { ms: 0, phases: {} };
    row.ms += w; row.phases[phase] = (row.phases[phase] ?? 0) + w;
    out.plain.set(rowKey(lead), row);
    out.playing += w;
  }
  return out;
}

/** What a waiting maneuver waited for, inferred from the plan (the engine's own queue is private). */
export interface Binding { pred: PlannedManeuver; cause: Exclude<Cause, 'other'>; anchor: 'end' | 'noteEnd' | 'claim' | 'seam' | 'near' }

/** The binding predecessor of a maneuver in its beat, with the cause and which of its ends it matches; null when none. */
export function bindingOf(m: PlannedManeuver, beatMs: PlannedManeuver[]): Binding | null {
  const nm = (x: PlannedManeuver) => Math.max(x.durationMs, NOTE_MIN_MS);
  // A wait on attention places travels while it waits (27 E2): it sets off so its act (its claim) lands as the places free.
  const claimAt = m.afterMs + claimMs(m.phases);
  // The built overlaps (27 E4), from the sequencer's own functions so the ledger can't drift: P3's seam (a
  // wait through a hold, sharing no actor at the act) and P4's near start (the same person flown twice).
  const actors = (x: PlannedManeuver) => ACTING_ROLES.flatMap((r) => x.cast[r] ?? []) as string[];
  const seamAt = (x: PlannedManeuver) => seamStartMs(endOf(x), tailOf(x.phases), claimMs(m.phases));
  const nearAt = (x: PlannedManeuver) => nearStartMs(x.afterMs, workEndOf(x.phases), releaseOfPlay(x), gatherAtOf(m.phases));
  const anchorOf = (x: PlannedManeuver): Binding['anchor'] | null =>
    Math.abs(endOf(x) - m.afterMs) < 0.5 ? 'end'
      : Math.abs(x.afterMs + nm(x) - m.afterMs) < 0.5 ? 'noteEnd'
        : Math.abs(x.afterMs + nm(x) - claimAt) < 0.5 ? 'claim'
          : !shares(actors(m), actors(x)) && Math.abs(seamAt(x) - m.afterMs) < 0.5 ? 'seam'
            : shares(crew(m), crew(x)) && flyingPlay(m) && flyingPlay(x) && Math.abs(nearAt(x) - m.afterMs) < 0.5 ? 'near' : null;
  const preds = beatMs.filter((x) => x !== m && anchorOf(x))
    .sort((a, b) => endOf(b) - endOf(a) || cmp(a.eventKey + a.id, b.eventKey + b.id));
  const p = preds[0];
  if (!p) return null;
  const anchor = anchorOf(p)!;
  if (anchor === 'claim') return { pred: p, cause: 'P-6', anchor };
  if (anchor === 'near' || shares(crew(m), crew(p))) return { pred: p, cause: 'P-5', anchor };
  if ((m.protect || p.protect) && (shares(castKeys(m), castKeys(p)) || shares(m.holds ?? [], castKeys(p)) || shares(p.holds ?? [], castKeys(m)))) return { pred: p, cause: 'P-3', anchor };
  const rule = (PACE_RULES as readonly PaceRule[]).find((r) => r.id === m.id);
  if (rule?.waitsFor?.includes(p.id) && p.eventKey === m.eventKey) return { pred: p, cause: 'P-4', anchor };
  return { pred: p, cause: 'P-6', anchor };
}

/** The cause a maneuver waited, inferred from the plan. */
function causeOf(m: PlannedManeuver, beatMs: PlannedManeuver[]): Cause {
  return bindingOf(m, beatMs)?.cause ?? 'other';
}

// ---- The pods ----

/** One pod, resolved: its history, scene and the facts the ledger and the candidates both need. */
export interface ResolvedPod {
  spec: PodSpec; h: ScopeHistory; scene: string; areaKey: CanonicalKey; label: string; path: string;
  scenarioName: string; project: string; sprint: string; tz: string; events: number;
}

/**
 * Every pod, each with a freshly built history. `story: true` presents each as the app does (block E audit):
 * the bundle in story time (`src/renderer/src/v1/story.ts` `presented`; every pod here is Solar), its days read
 * in the scenario's zone (the app reads the viewer's, `STORY_TZ`; the two agree on America/Los_Angeles). Without
 * it, the bundle as recorded: what the frozen E1-E10 Built rows and C2's candidates were measured on.
 * `all: true` adds the `extra` pods (Meteor, 27 F1); F2 to F4 opt in, and `buildLedger` does.
 */
export function resolvePods(opts: { story?: boolean; all?: boolean } = {}): ResolvedPod[] {
  return PODS.filter((p) => opts.all || !p.extra).map((spec) => {
    const sc = sprintScopes(spec.scenario).find((x) => x.sprint.endsWith(spec.sprint))!;
    const tz = spec.scenario.tz;
    const recorded = toHistory(spec.scenario, mapping, sc);
    const h = opts.story ? storyTime(recorded, tz).history : recorded;
    const pods = (h.scope.sector as unknown as { pods: { areaKey: CanonicalKey; path: string }[] }).pods;
    let pod: { areaKey: CanonicalKey; path: string };
    if (spec.pick === 'busiest') {
      const count = (p: { areaKey: CanonicalKey }) => {
        const keep = sceneEvents(h, `pod:${p.areaKey}` as SceneKeyArg, SOLAR);
        return h.events.filter((e) => e.occurredAt >= h.range.startUtc && e.occurredAt < h.range.endUtc && keep(e)).length;
      };
      pod = [...pods].map((p) => ({ p, n: count(p) })).sort((a, b) => b.n - a.n || cmp(a.p.path, b.p.path))[0]!.p;
    } else {
      const t = spec.pick.tail;
      pod = pods.find((p) => p.path.endsWith(`\\${t}`))!;
    }
    const scene = `pod:${pod.areaKey}`;
    const keep = sceneEvents(h, scene as SceneKeyArg, SOLAR);
    const events = h.events.filter((e) => e.occurredAt >= h.range.startUtc && e.occurredAt < h.range.endUtc && keep(e)).length;
    return { spec, h, scene, areaKey: pod.areaKey, label: tail(pod.path), path: pod.path, scenarioName: spec.scenarioName, project: sc.project, sprint: tail(sc.sprint), tz, events };
  });
}

/** Build the ledger for one pod; `sp` is the same pod in story time. */
function podLedger(rp: ResolvedPod, sp: ResolvedPod, inputs: EngineInputs): PodLedger {
  const { h, scene, tz } = rp;
  const pod = { areaKey: rp.areaKey, path: rp.path };
  const events = rp.events;

  const sch = scheduleOf(h, scene, tz, inputs);
  const st = scheduleOf(sp.h, sp.scene, sp.tz, inputs);
  const unc = scheduleOf(h, scene, tz, { ...inputs, budgetMs: Infinity });
  const playedBeats = sch.beats.filter((b) => b.durationMs > 0);
  const uncPlayed = unc.beats.filter((b) => b.durationMs > 0).length;
  const ref = SOLAR.resolve(scene as SceneKeyArg)?.ref;
  const orient = SOLAR.pacing?.(h, ref)?.orientMs ?? ORIENT_MS;

  // Frame.
  let prevEnd = orient, gapMs = 0, dayTurnMs = 0, dayTurns = 0, beatsMs = 0;
  for (const b of playedBeats) {
    const g = b.presentationStartMs - prevEnd;
    if (b.opensDay) { dayTurnMs += g; dayTurns++; } else gapMs += g;
    prevEnd = b.presentationStartMs + b.durationMs;
    beatsMs += b.durationMs;
  }

  // Inside the beats, and waiting.
  const rows = new Map<string, { ms: number; phases: Record<string, number>; n: number }>();
  let playing = 0, queueIdle = 0, noteHold = 0;
  const byCause = Object.fromEntries(CAUSES.map((c) => [c, { ms: 0, count: 0 }])) as Record<Cause, { ms: number; count: number }>;
  let waiting = 0, carryMs = 0, carryBeats = 0;
  const protects: { end: number; keys: string[] }[] = [];
  for (const b of playedBeats) {
    const ms = planOf(h, pod.areaKey, b, sch.limelight, inputs);
    const s = sliceBeat(b.durationMs, ms);
    playing += s.playing; queueIdle += s.queueIdle; noteHold += s.noteHold;
    for (const [k, v] of s.plain) {
      const row = rows.get(k) ?? { ms: 0, phases: {}, n: 0 };
      row.ms += v.ms;
      for (const [p, x] of Object.entries(v.phases)) row.phases[p] = (row.phases[p] ?? 0) + x;
      rows.set(k, row);
    }
    for (const m of ms) {
      const row = rows.get(rowKey(m)) ?? { ms: 0, phases: {}, n: 0 };
      row.n++;
      rows.set(rowKey(m), row);
      if (m.afterMs > 0 && !m.arc?.merge) {
        const c = causeOf(m, ms);
        byCause[c].ms += m.afterMs; byCause[c].count++; waiting++;
      }
    }
    // P-10 carry: measured against earlier beats' protected moments holding this beat's keys.
    const mine = new Set(ms.flatMap((m) => m.keys as string[]));
    const until = protects.filter((p) => p.keys.some((k) => mine.has(k))).reduce((a, p) => Math.max(a, p.end), -Infinity);
    const carry = Math.max(0, until - b.presentationStartMs);
    if (carry > 0) { carryMs += carry; carryBeats++; }
    for (const m of ms) if (m.protect) protects.push({ end: b.presentationStartMs + endOf(m), keys: m.protect.keys as string[] });
  }

  // Rounding: integers, with the remainder charged to the biggest slack so the sums stay exact.
  const total = ri(sch.totalMs);
  const frame = { orientMs: ri(orient), gapMs: ri(gapMs), dayTurnMs: ri(dayTurnMs), dayTurns, tailGapMs: 0, finalHoldMs: FINAL_HOLD_MS, beatsMs: ri(beatsMs) };
  frame.tailGapMs = total - frame.orientMs - frame.gapMs - frame.dayTurnMs - frame.finalHoldMs - frame.beatsMs;
  const held = { queueIdleMs: ri(queueIdle), noteHoldMs: ri(noteHold) };
  const playingMs = frame.beatsMs - held.queueIdleMs - held.noteHoldMs;
  const byPhase: Record<string, number> = {};
  const byRule: RuleRow[] = [...rows.entries()].map(([key, v]) => {
    for (const [p, x] of Object.entries(v.phases)) byPhase[p] = (byPhase[p] ?? 0) + ri(x);
    return { key, ms: ri(v.ms), share: playingMs > 0 ? r3(v.ms / playingMs) : 0, maneuvers: v.n, phases: Object.fromEntries(Object.entries(v.phases).sort(([a], [b]) => cmp(a, b)).map(([p, x]) => [p, ri(x)])) };
  }).sort((a, b) => b.ms - a.ms || cmp(a.key, b.key));
  void playing;
  for (const c of CAUSES) byCause[c].ms = ri(byCause[c].ms);

  return {
    label: rp.label, path: rp.path, scenario: rp.scenarioName, project: rp.project, sprint: rp.sprint, tz, events,
    beats: { total: sch.beats.length, played: playedBeats.length, silent: sch.beats.length - playedBeats.length, cutByBudget: uncPlayed - playedBeats.length },
    budgetMs: inputs.budgetMs ?? inputs.profile?.pacing.budgetMs ?? null, totalMs: total, uncappedMs: ri(unc.totalMs), wallMs: ri(sch.wallMs),
    story: { wallMs: ri(st.wallMs), played: st.beats.filter((b) => b.durationMs > 0).length, levers: st.limelight?.direction ? [...st.limelight.direction.levers] : null },
    director: sch.limelight?.direction ? { targetMs: inputs.targetMs ?? DIRECTOR_TARGET_MS, levers: [...sch.limelight.direction.levers], estimateMs: ri(sch.limelight.direction.estimateMs) } : null, frame,
    playing: { byRule, byPhase: Object.fromEntries(Object.entries(byPhase).sort(([a], [b]) => cmp(a, b))), playingMs },
    held, waits: { byCause, maneuvers: waiting, carryMs: ri(carryMs), carryBeats },
  };
}

/** The ledger for every pod; each call builds fresh histories. */
export function buildLedger(inputs: EngineInputs = {}): Ledger {
  const story = resolvePods({ story: true, all: true });
  return { pods: resolvePods({ all: true }).map((p, i) => podLedger(p, story[i]!, inputs)) };
}

// ---- Markdown ----

/**
 * Comet's yardstick in story time (block E audit; 27 Decisions 2026-11-06): its length as the app played it at
 * 552d631, the commit before E1 (HG-C's 67.3 s was the recorded bundle's), so the final check compares like with like.
 */
export const COMET_STORY_YARDSTICK_MS = 50_330;

const sec = (ms: number) => (ms / 1000).toFixed(1);
const pct = (ms: number, of: number) => (of > 0 ? ((ms / of) * 100).toFixed(1) : '0.0');
const PHASE_ORDER = ['tell', 'gather', 'act', 'land', 'echo', 'disperse', 'hold'];

export function renderMarkdown(l: Ledger): string {
  const o: string[] = [];
  o.push('# Pacing ledger', '');
  o.push('Where each pod\'s replay time goes at 1x, from the engine\'s own schedule and plan (read-only; `npm run pacing`). Seconds are to 0.1.');
  o.push('The time frame and the playing/held split are in schedule time and sum to the schedule length (Schedule s). Total s is the wall time at 1x once the director\'s adaptive speed is counted (27 E5b); they differ only on a pod whose beats are sped. The rule table charges each stretch of a beat to its lead maneuver (the one that ends last) and phase; `hold` is a crew\'s turn staying out after the last phase. Waiting is maneuver-seconds (maneuvers overlap, so it is not wall time), and its causes are inferred from the plan, not read from the engine\'s queue. Carry (P-10) is measured.', '');
  o.push('## Summary', '');
  o.push(`**App s** is what the app plays: the pod in story time (05 §8.3a), as \`src/renderer/src/v1/story.ts\` presents a Solar bundle. **Target** and **Levers** read it, and so does the final check (block E audit, 27 Decisions 2026-11-06). Every other column, the per-pod tables and the Built section are the recorded bundle's, as E1-E10 were measured. Comet's yardstick in story time is ${sec(COMET_STORY_YARDSTICK_MS)} s (at 552d631, the commit before E1; 67.3 s recorded).`, '');
  o.push('| Pod | App s | Total s | Schedule s | Uncapped s | Orient | Gaps | Day turns | Playing | Held | Tail + hold | Target | Levers |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of l.pods) {
    // Target: `ok` inside the director's target, else the seconds over (27 E5); levers: what the director pulled to meet it. Both in story time.
    const target = p.director ? (p.story.wallMs <= p.director.targetMs ? 'ok' : `${sec(p.story.wallMs - p.director.targetMs)} over`) : '-';
    const levers = p.story.levers ? (p.story.levers.length ? p.story.levers.join(', ') : 'none') : '-';
    o.push(`| ${p.label} | ${sec(p.story.wallMs)} | ${sec(p.wallMs)} | ${sec(p.totalMs)} | ${sec(p.uncappedMs)} | ${sec(p.frame.orientMs)} | ${sec(p.frame.gapMs)} | ${sec(p.frame.dayTurnMs)} | ${sec(p.playing.playingMs)} | ${sec(p.held.queueIdleMs + p.held.noteHoldMs)} | ${sec(p.frame.tailGapMs + p.frame.finalHoldMs)} | ${target} | ${levers} |`);
  }
  o.push('');
  for (const p of l.pods) {
    o.push(`## ${p.label} (${p.project}, ${p.sprint})`, '');
    o.push(`${p.scenario}, tz ${p.tz}, ${p.events} events; ${p.beats.played} beats played of ${p.beats.total} (${p.beats.silent} silent, ${p.beats.cutByBudget} cut by the budget); budget ${p.budgetMs ?? 'default'}.`, '');
    const f = p.frame, T = p.totalMs;
    o.push('| Component | s | % |', '|---|---|---|');
    const comp: [string, number][] = [['Orient', f.orientMs], ['Gaps', f.gapMs], [`Day turns (${f.dayTurns})`, f.dayTurnMs], ['Tail gap', f.tailGapMs], ['Final hold', f.finalHoldMs], ['Beats: playing', p.playing.playingMs], ['Beats: queue idle', p.held.queueIdleMs], ['Beats: note hold', p.held.noteHoldMs]];
    for (const [n, v] of comp) o.push(`| ${n} | ${sec(v)} | ${pct(v, T)} |`);
    o.push(`| **Total** | ${sec(T)} | 100.0 |`, '');
    const phases = PHASE_ORDER.filter((x) => p.playing.byPhase[x]);
    o.push(`| Rule | s | Share | Maneuvers | ${phases.join(' | ')} |`, `|---|---|---|---|${phases.map(() => '---').join('|')}|`);
    for (const r of p.playing.byRule) o.push(`| ${r.key} | ${sec(r.ms)} | ${pct(r.ms, p.playing.playingMs)}% | ${r.maneuvers} | ${phases.map((x) => (r.phases[x] ? sec(r.phases[x]) : '')).join(' | ')} |`);
    o.push('');
    o.push('| Waiting cause (inferred) | Maneuver-s | Maneuvers |', '|---|---|---|');
    for (const c of CAUSES) o.push(`| ${c} | ${sec(p.waits.byCause[c].ms)} | ${p.waits.byCause[c].count} |`);
    o.push(`| P-10 carry (measured) | ${sec(p.waits.carryMs)} | ${p.waits.carryBeats} beats |`, '');
  }
  return o.join('\n');
}
