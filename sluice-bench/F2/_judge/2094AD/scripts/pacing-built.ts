// The pacing ledger's Built section (v1.4 E1+): what each built E item actually saved per pod, set beside
// C2's estimate. Each item gives `before`: today's rules with that item's change undone, so the saving is a
// real re-schedule (`scheduleOf`) and not a model. Later E items add their own entry (method P or F items
// need a different hook and are not handled here). Pure and deterministic, like the ledger it extends.
import { PACE_RULES, RULE, phases, shortForm, type PaceRule } from '../src/shared/engine/pace';
import { resolvePods, scheduleOf, type EngineInputs } from './pacing-ledger';

export interface BuiltItem {
  id: string;
  name: string;
  /** Today's rules with this item's change undone. */
  before?: (rules: PaceRule[]) => PaceRule[];
  /** Engine inputs `before` runs with (an item built into the sequencer, undone by an option). */
  inputs?: Partial<EngineInputs>;
  /** Today's rules for the "now" run, when the item is a ceiling over them (E4d). */
  after?: (rules: PaceRule[]) => PaceRule[];
  /** The item is the director (27 E5): its "now" run directs, its "before" is `inputs`. Every other row runs undirected, as it was measured. */
  directs?: true;
  /** Engine inputs both runs take (27 E6: the director's rows built before volleys run without them, as they were measured). */
  both?: Partial<EngineInputs>;
  /** The item runs with the sector sweep (27 E7) in today's rules; every item built before it runs both schedules without it, as it was measured. */
  sweeps?: true;
  /** The item runs with rising tempo (27 E8); every item built before it runs both schedules without it, as it was measured. */
  rises?: true;
  /** The item runs with late-day montage (27 E10); every item built before it runs both schedules without it, as it was measured. */
  late?: true;
  /** The item runs with summons on the fly (27 F2); every item built before it runs both schedules with F2 undone (`undoF2`), as it was measured. */
  passes?: true;
  /** Measured on every pod, the `extra` ones too (Meteor, 27 F1), and in story time, as the app plays them (block E audit). F items opt in. */
  app?: true;
  /** C2's estimate of the saving, ms, per pod label. */
  estimateMs: Record<string, number>;
}

export interface BuiltRow { id: string; pod: string; beforeMs: number; nowMs: number; savedMs: number; estimateMs: number; diffMs: number }

/**
 * E1: `facility.enter` before was tell 300, gather 1300, act 1200, land 600. The estimates are C2's committed
 * E1 `savingMs` per pod in pacing-candidates.json at commit 552d631 (gather 1300 -> 715, modelled).
 */
export const BUILT: BuiltItem[] = [{
  id: 'E1',
  name: 'Fewer signals',
  before: (rules) => rules.map((r) => (r.id === RULE.facilityEnter ? { ...r, phases: phases(['tell', 300], ['gather', 1300], ['act', 1200], ['land', 600]) } : r)),
  estimateMs: { 'Comet Pod': 585, 'Nova Pod': 585, 'Quasar Pod': 4680, 'Pulsar Pod': 5265, 'Convoy Planning Pod': 1755, 'Harbor Pod': 1755 },
}, {
  id: 'E4a',
  name: 'Transform from the gather',
  // Before: act 1600, land 4400 (the transformation ran at the land); now act 2300, land 500.
  before: (rules) => rules.map((r) => (r.id === RULE.attachmentMerge
    ? { ...r, variant: (mv, e, f) => {
      const v = r.variant?.(mv, e, f) ?? null;
      return v && v.name === 'first' ? { ...v, phases: phases(['tell', 300], ['gather', 900], ['act', 1600], ['land', 4400], ['echo', 3000], ['disperse', 900]) } : v;
    } } as PaceRule
    : r)),
  estimateMs: { 'Comet Pod': 2000, 'Nova Pod': 2000, 'Quasar Pod': 16000, 'Pulsar Pod': 16000, 'Convoy Planning Pod': 4000, 'Harbor Pod': 6000 },
}, {
  id: 'E4b',
  name: 'Overlap neighbours (P3)',
  // Before: the seams undone (a maneuver waits for the whole of the one it is held by), the stay-near start kept.
  inputs: { sequence: { seams: false, near: true } },
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 0, 'Quasar Pod': 0, 'Pulsar Pod': 0, 'Convoy Planning Pod': 0, 'Harbor Pod': 300 },
}, {
  id: 'E4c',
  name: 'Captain waits near (P4)',
  // Before: the stay-near start undone (a captain's next sortie waits for the last one's end), the seams kept.
  inputs: { sequence: { seams: true, near: false } },
  estimateMs: { 'Comet Pod': 3360, 'Nova Pod': 2980, 'Quasar Pod': 23400, 'Pulsar Pod': 16080, 'Convoy Planning Pod': 4400, 'Harbor Pod': 6340 },
}, {
  id: 'E4d',
  name: 'Short forms (ceiling: every protected moment short; E5 picks)',
  // Before: today's rules. Now: every protected rule plays its short form wherever it has one (a first merge has none).
  after: (rules) => rules.map((r) => (r.protect
    ? { ...r, variant: (mv, e, f) => { const v = r.variant?.(mv, e, f) ?? null; return shortForm(r, v?.name) ?? v; } } as PaceRule
    : r)),
  estimateMs: { 'Comet Pod': 14090, 'Nova Pod': 48240, 'Quasar Pod': 250740, 'Pulsar Pod': 144980, 'Convoy Planning Pod': 17020, 'Harbor Pod': 29930 },
}, {
  id: 'E5a',
  name: 'The director: forms, hero shots, climax, short over the target',
  // Before: no director (every moment full). Now: the director's pass. C2's E5 estimate is its progress-beam model.
  inputs: { direct: false },
  directs: true,
  both: { volleys: false },
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 11100, 'Quasar Pod': 308880, 'Pulsar Pod': 80220, 'Convoy Planning Pod': 0, 'Harbor Pod': 3980 },
}, {
  id: 'E5b',
  name: 'The director: montage the routine, adaptive speed',
  // Before: the director with only its short lever. Now: all its levers. HG-C names these two levers without a C2 estimate.
  inputs: { levers: ['short'] },
  directs: true,
  both: { volleys: false },
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 0, 'Quasar Pod': 0, 'Pulsar Pod': 0, 'Convoy Planning Pod': 0, 'Harbor Pod': 0 },
}, {
  id: 'E5c',
  name: 'The director: light work for more rules, fewer hero shots',
  // Before: the director with short forms, montage and speed. Now: all its levers. HG-C names these two levers without a C2 estimate.
  inputs: { levers: ['short', 'montage', 'speed'] },
  directs: true,
  both: { volleys: false },
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 0, 'Quasar Pod': 0, 'Pulsar Pod': 0, 'Convoy Planning Pod': 0, 'Harbor Pod': 0 },
}, {
  id: 'E6',
  name: 'Multi-fire volleys (before adaptive speed)',
  // Both runs direct with short forms and montage only, so speed doesn't re-fit the saving away. Before: no volleys.
  // C2's estimate is its E6 model (pacing-candidates.json).
  inputs: { volleys: false },
  directs: true,
  both: { levers: ['short', 'montage'] },
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 5400, 'Quasar Pod': 11100, 'Pulsar Pod': 10800, 'Convoy Planning Pod': 0, 'Harbor Pod': 4000 },
}, {
  id: 'E6+',
  name: 'Multi-fire volleys, with every lever',
  // Both runs direct with every lever; speed re-fits, so a pod over the target stays near it. Before: no volleys.
  inputs: { volleys: false },
  directs: true,
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 5400, 'Quasar Pod': 11100, 'Pulsar Pod': 10800, 'Convoy Planning Pod': 0, 'Harbor Pod': 4000 },
}, {
  id: 'E7',
  name: 'Sector sweep',
  // Before: no sweep (a beat's creations play their own rules). Now: today's rules, directed with every lever.
  // C2's estimate is its E7 model (pacing-candidates.json).
  before: (rules) => rules.filter((r) => r.id !== RULE.regionSweep),
  directs: true,
  sweeps: true,
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 0, 'Quasar Pod': 0, 'Pulsar Pod': 0, 'Convoy Planning Pod': -2420, 'Harbor Pod': 5080 },
}, {
  id: 'E8',
  name: 'Rising tempo',
  // Before: the gaps and day turns as squeezed (no rising tempo). Now: today's rules, directed with every lever.
  // C2's estimate is its committed E8 row (pacing-candidates.json): 0 s, since every pod was already at GAP_MIN_MS.
  inputs: { risingTempo: false },
  directs: true,
  sweeps: true,
  rises: true,
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 0, 'Quasar Pod': 0, 'Pulsar Pod': 0, 'Convoy Planning Pod': 0, 'Harbor Pod': 0 },
}, {
  id: 'E10',
  name: 'Late-day montage',
  // Before: no late-day montage (the tight end's repeats keep their short form). Now: today's rules, directed with every lever.
  // C2 never modelled it.
  inputs: { lateMontage: false },
  directs: true,
  sweeps: true,
  rises: true,
  late: true,
  estimateMs: { 'Comet Pod': 0, 'Nova Pod': 0, 'Quasar Pod': 0, 'Pulsar Pod': 0, 'Convoy Planning Pod': 0, 'Harbor Pod': 0 },
}, {
  id: 'F2',
  name: 'Summon on the fly (story time, every pod, undirected)',
  // Before: the jump-in as E1 left it, its summoner holding through the arrival and flying back. Now: today's rules.
  // Undirected, so the director's target doesn't spend the saving (F2+ shows what it does). C2 never modelled it.
  before: undoF2,
  sweeps: true,
  rises: true,
  late: true,
  passes: true,
  app: true,
  estimateMs: {},
}, {
  id: 'F2+',
  name: 'Summon on the fly, with every lever',
  // The same, directed with every lever: what the app plays. The director re-fits each pod to its target, so a pod
  // that was cut to fit keeps more of its full forms instead (a saving spent as story, not time).
  before: undoF2,
  directs: true,
  sweeps: true,
  rises: true,
  late: true,
  passes: true,
  app: true,
  estimateMs: {},
}];

/** Today's rules with F2 undone (27 F2): `facility.enter` as E1 left it, tell 300, gather 715, act 1200, land 600, its summoner holding a turn. */
export function undoF2(rules: PaceRule[]): PaceRule[] {
  return rules.map((r) => {
    if (r.id !== RULE.facilityEnter) return r;
    const { passes: _passes, ...rest } = r;
    void _passes;
    return { ...rest, phases: phases(['tell', 300], ['gather', 715], ['act', 1200], ['land', 600]) };
  });
}

const ri = Math.round;

/** Every built item's saving per pod: before is a re-schedule with the item's change undone, now is today's. */
export function buildBuilt(inputs: EngineInputs = {}): BuiltRow[] {
  const rows: BuiltRow[] = [];
  for (const item of BUILT) {
    for (const rp of resolvePods(item.app ? { story: true, all: true } : {})) {
      // Items built before the director keep measuring what they measured: both runs undirected.
      // Items built before rising tempo (27 E8) run both schedules without it, so their rows stay as measured.
      const base: EngineInputs = { ...(item.directs ? inputs : { ...inputs, direct: false }), ...(item.rises ? {} : { risingTempo: false as const }), ...(item.late ? {} : { lateMontage: false as const }), ...item.both };
      // Items built before the sector sweep (27 E7) run both schedules without it, so their rows stay as measured.
      // Items built before F2 run both with F2 undone.
      const swept = item.sweeps ? [...PACE_RULES] : PACE_RULES.filter((r) => r.id !== RULE.regionSweep);
      const rules = item.passes ? swept : undoF2(swept);
      const today = item.sweeps && item.passes; // today's rules exactly: the engine's own
      const beforeMs = ri(scheduleOf(rp.h, rp.scene, rp.tz, { ...base, ...item.inputs, ...(item.before ? { rules: item.before([...rules]) } : today ? {} : { rules: [...rules] }) }).wallMs);
      const nowMs = ri(scheduleOf(rp.h, rp.scene, rp.tz, { ...base, ...(item.after ? { rules: item.after([...rules]) } : today ? {} : { rules: [...rules] }) }).wallMs);
      const savedMs = beforeMs - nowMs;
      const estimateMs = item.estimateMs[rp.label] ?? 0;
      rows.push({ id: item.id, pod: rp.label, beforeMs, nowMs, savedMs, estimateMs, diffMs: savedMs - estimateMs });
    }
  }
  return rows;
}

const sec = (ms: number) => (ms / 1000).toFixed(1);

/** The `## Built` section appended to the ledger's markdown. */
export function renderBuilt(rows: BuiltRow[]): string {
  const o: string[] = ['## Built', ''];
  o.push('What each built E and F item saves per pod: a real re-schedule with the item\'s change undone (before) against today\'s rules (now), beside C2\'s estimate (`npm run pacing -- --candidates`). Positive means shorter.', '');
  o.push('| Item | Pod | Before s | Now s | Saved s | C2\'s estimate s | Difference s |', '|---|---|---|---|---|---|---|');
  for (const r of rows) {
    const name = BUILT.find((b) => b.id === r.id)?.name ?? '';
    o.push(`| ${r.id} ${name} | ${r.pod} | ${sec(r.beforeMs)} | ${sec(r.nowMs)} | ${sec(r.savedMs)} | ${sec(r.estimateMs)} | ${sec(r.diffMs)} |`);
  }
  o.push('');
  return o.join('\n');
}
