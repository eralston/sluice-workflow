// The director (27 E5, 05 §8.5c P-20..P-27): every pod's schedule read back through the planner.
import { describe, expect, it, vi } from 'vitest';
import type { Beat } from '@shared/contracts/playback';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import { RULE, shortForm, PACE_RULES, type PaceRule } from '@shared/engine/pace';
import { chapterPs, inTightEnd, localDay } from '@shared/playback/schedule';
import { planOf, resolvePods, scheduleOf } from '../../scripts/pacing-ledger';
import { MONTAGE_BEATS } from '../e2e/montageBeats';

vi.setConfig({ testTimeout: 180_000 });

// The pods as the app plays them: in story time (block E audit; 05 §8.3a). The ledger's Built rows stay recorded.
const pods = resolvePods({ story: true });
const CLOSE_IDS: string[] = [RULE.objectiveAccomplish, RULE.threatAccomplish];

function plays(rp: (typeof pods)[number], inputs = {}) {
  const sch = scheduleOf(rp.h, rp.scene, rp.tz, inputs);
  const out: { m: PlannedManeuver; beat: Beat; day: string }[] = [];
  for (const b of sch.beats.filter((x) => x.durationMs > 0)) {
    const day = localDay(rp.h.events.find((e) => e.eventKey === b.eventKeys[0])?.occurredAt ?? b.firstUtc, rp.tz);
    for (const m of planOf(rp.h, rp.areaKey, b, sch.limelight, inputs)) out.push({ m, beat: b, day });
  }
  return { sch, out };
}
const rule = (id: string) => PACE_RULES.find((r) => r.id === id) as PaceRule;
const dirJson = (d: NonNullable<ReturnType<typeof scheduleOf>['limelight']>['direction']) => JSON.stringify({
  forms: [...d!.forms].sort(), climaxes: [...d!.climaxes].sort(), levers: d!.levers, estimateMs: d!.estimateMs, tempo: d!.tempo ? [...d!.tempo].sort((a, b) => a[0] - b[0]) : null,
});

/** The keys of a Direction's forms compared with `{ lateMontage: false }` under the same inputs (27 E10): only the tight end's short forms became montage. */
function compareLate(rp: (typeof pods)[number], inputs: Record<string, unknown>) {
  const now = plays(rp, inputs);
  const early = plays(rp, { ...inputs, lateMontage: false as const });
  const dir = now.sch.limelight!.direction!;
  const dirE = early.sch.limelight!.direction!;
  expect(dir.levers).toEqual([]);
  expect(dirE.levers).toEqual([]);
  expect([...dir.forms.keys()]).toEqual([...dirE.forms.keys()]);
  expect([...dir.climaxes].sort()).toEqual([...dirE.climaxes].sort());
  const played = now.sch.beats.filter((b) => b.durationMs > 0);
  const ps = chapterPs(played.map((b) => [b.firstUtc, b.sourceUtc] as const), rp.tz);
  const pOf = (key: string) => {
    const ek = key.slice(0, key.lastIndexOf('|'));
    const i = played.findIndex((b) => b.eventKeys.includes(ek));
    return i < 0 ? 0 : ps[i]!;
  };
  const excluded = new Set(early.out.filter(({ m }) => (m.id === RULE.attachmentMerge && m.arc) || m.volley).map(({ m }) => `${m.eventKey}|${m.id}`));
  let folded = 0;
  for (const [k, v] of dir.forms) {
    const was = dirE.forms.get(k);
    if (was === 'short' && inTightEnd(pOf(k)) && !excluded.has(k)) { expect(v, k).toBe('montage'); folded++; } else expect(v, k).toBe(was);
  }
  return folded;
}

describe('the director pass, on every pod', () => {
  for (const rp of pods) {
    describe(rp.label, () => {
      const { sch, out } = plays(rp);
      const dir = sch.limelight!.direction!;

      it('every merge author is the agent of a volley (with fewer-heroes: of a named play)', () => {
        const merges = out.filter(({ m, }) => m.id === RULE.attachmentMerge || (m.id === RULE.agentProgress && rp.h.events.find((e) => e.eventKey === m.eventKey)?.kind === 'pr_completed'));
        const authors = new Set(merges.flatMap(({ m }) => m.cast.agent ?? []));
        const volleys = new Set(out.filter(({ m }) => m.id === RULE.attachmentMerge).flatMap(({ m }) => m.cast.agent ?? []));
        const fewer = dir.levers.includes('fewer-heroes');
        // A named play: a volley or a beam (a beam is always named); limelight names everyone's first turn.
        const named = new Set(out.filter(({ m }) => m.id === RULE.agentProgress || !m.quiet).flatMap(({ m }) => m.cast.agent ?? []));
        for (const a of authors) expect(fewer ? named.has(a) : volleys.has(a), a).toBe(true);
      });

      it('every close the undirected schedule plays is played in the directed plan, as a volley or its short form', () => {
        const undirected = plays(rp, { direct: false as const }).out;
        const key = (m: PlannedManeuver) => `${m.eventKey}|${m.id}`;
        const directed = new Map(out.filter(({ m }) => CLOSE_IDS.includes(m.id)).map(({ m }) => [key(m), m]));
        const closes = undirected.filter(({ m }) => CLOSE_IDS.includes(m.id));
        expect(closes.length).toBeGreaterThan(0);
        for (const { m } of closes) {
          const got = directed.get(key(m));
          expect(got, `${key(m)} is missing`).toBeDefined();
          expect(got!.id).not.toBe(RULE.agentProgress);
          const v = got!.variant;
          expect(!v || v === 'beamed' || v === 'arc' || v.endsWith('short'), `${key(m)} variant ${v}`).toBe(true);
        }
      });

      it('each day with a moment has exactly one climax, a full form in its own phases', () => {
        // The days that hold a moment, read from the plays themselves (a protected play that isn't a close riding its merge, or a progress beam).
        const momentDays = new Set(out.filter(({ m }) => (m.protect && !m.arc?.merge) || m.id === RULE.agentProgress).map(({ day }) => day));
        const climaxes = new Map<string, number>();
        for (const { m, day } of out) if (m.climax) {
          climaxes.set(day, (climaxes.get(day) ?? 0) + 1);
          expect(m.id, m.eventKey).not.toBe(RULE.agentProgress);
          expect(m.plate, m.eventKey).toBeUndefined();
          expect(m.variant?.endsWith('short') ?? false, m.eventKey).toBe(false);
          if (!m.variant) expect(m.phases, m.eventKey).toEqual(rule(m.id).phases);
        }
        for (const d of momentDays) expect(climaxes.get(d), `${d} has one climax`).toBe(1);
        expect(climaxes.size).toBe(momentDays.size);
        expect(dir.climaxes.size).toBe(momentDays.size);
      });

      it('within a day, two moments in a row are not both full forms of one rule, but a climax or a rule with no short form', () => {
        // Episode order, and a progress beam counts as a played moment between two others (P-21 compares with the previous played rule).
        const moments = out.filter(({ m }) => (m.protect || m.id === RULE.agentProgress) && !m.arc?.merge);
        const base = (m: PlannedManeuver) => (m.variant === 'short' ? undefined : m.variant?.replace(/-short$/, ''));
        const full = (m: PlannedManeuver) => m.id !== RULE.agentProgress && !m.variant?.endsWith('short') && !!shortForm(rule(m.id), base(m));
        moments.forEach(({ m, day }, i) => {
          const prev = moments[i - 1];
          if (!prev || prev.day !== day || m.climax || prev.m.id !== m.id || !full(m) || !full(prev.m)) return;
          // Two full forms of one rule back to back, with no other played rule between them.
          expect.fail(`${m.eventKey} repeats ${m.id} in full on ${day}`);
        });
      });

      it('an author in a volley has one (27 E6): they fly in its carrier, which never plays progress or montage', () => {
        const carriers = out.filter(({ m }) => m.volley).map(({ m }) => m);
        expect(carriers.length).toBe(dir.volleys?.size ?? 0);
        const undirected = plays(rp, { direct: false as const }).out;
        const author = new Map(undirected.filter(({ m }) => m.id === RULE.attachmentMerge).map(({ m }) => [m.eventKey, m.cast.agent?.[0]]));
        const inVolley = new Set<string>();
        for (const c of carriers) {
          expect(c.id).toBe(RULE.attachmentMerge);
          expect(c.plate).toBeUndefined();
          const crew = new Set([...(c.cast.agent ?? []), ...(c.cast.support ?? [])]);
          for (const e of c.volley!.members) {
            const a = author.get(e);
            if (!a) continue;
            expect(crew.has(a), `${a} flies in ${c.eventKey}`).toBe(true);
            inVolley.add(a);
          }
        }
        // Every merge author has a volley: the agent of a merge played as one, or an author in a multi-fire volley.
        if (dir.levers.includes('fewer-heroes')) return;
        const agents = new Set(out.filter(({ m }) => m.id === RULE.attachmentMerge).flatMap(({ m }) => m.cast.agent ?? []));
        for (const a of new Set(author.values())) if (a) expect(agents.has(a) || inVolley.has(a), a).toBe(true);
      });

      it('the estimate bounds the schedule\'s wall time from above, and sits within the target when no lever ran', () => {
        expect(dir.estimateMs).toBeGreaterThanOrEqual(sch.wallMs);
        if (!dir.levers.length) expect(dir.estimateMs).toBeLessThanOrEqual(300_000);
      });

      it('the levers run in order, and each only while the estimate is over', () => {
        expect(dir.levers).toEqual(['short', 'montage', 'speed', 'light', 'fewer-heroes'].slice(0, dir.levers.length));
        expect(!!dir.tempo).toBe(dir.levers.includes('speed'));
        if (dir.levers.length && ['short', 'montage'].includes(dir.levers.at(-1)!)) expect(dir.estimateMs).toBeLessThanOrEqual(300_000);
        // Light work and fewer heroes run only after speed, at its ceiling, left the estimate over.
        if (dir.levers.includes('light')) expect(dir.levers).toContain('speed');
        // A lever is listed only when it changed something; a pod that ends over the (soft) target has pulled the last lever that could.
        if (!dir.levers.includes('light') && !dir.levers.includes('fewer-heroes') && dir.levers.length) expect(dir.estimateMs).toBeLessThanOrEqual(300_000);
      });

      it('a light draft is dropped from the plan, is one of four rules, is no moment, and is no opening placed ahead of one', () => {
        const lit = [...dir.forms].filter(([, f]) => f === 'light').map(([k]) => k);
        expect(lit.length > 0).toBe(dir.levers.includes('light'));
        const played = new Set(out.map(({ m }) => `${m.eventKey}|${m.id}`));
        for (const k of lit) {
          expect(played.has(k), k).toBe(false);
          expect([RULE.attachmentOpen, RULE.objectiveUnderway, RULE.objectiveNearing, RULE.threatEngage], k).toContain(k.split('|')[1]);
        }
      });

      it('a montage moment is its short form lighting one plate of its cast, with no held turn and no climax, first merge or arc', () => {
        const forms = [...dir.forms].filter(([, f]) => f === 'montage').map(([k]) => k);
        const plates = out.filter(({ m }) => m.plate);
        for (const { m } of plates) {
          expect(forms, m.eventKey).toContain(`${m.eventKey}|${m.id}`);
          expect(m.montage).toBe(true);
          expect(m.protect).toBeDefined();
          expect(m.climax).toBeUndefined();
          expect(m.volley).toBeUndefined();
          expect(m.variant).not.toBe('first');
          expect(m.arc).toBeUndefined();
          expect((Object.values(m.cast).flat() as string[]).includes(m.plate!)).toBe(true);
          expect(m.variant?.endsWith('short'), m.eventKey).toBe(true);
          expect(m.durationMs).toBe(Math.max(...m.phases.map((p) => p.atMs + p.durMs)));
        }
        // A montage that found no plate to light plays as its short form.
        for (const k of forms) expect(out.some(({ m }) => `${m.eventKey}|${m.id}` === k), k).toBe(true);
        if (forms.length > 5) expect(plates.length).toBeGreaterThan(0);
      });

      it('the guard\'s list of plate-lit montage beats is the plan\'s (27 E10)', () => {
        const lit = [...new Set(out.filter(({ m }) => m.plate).map(({ beat }) => beat.sourceUtc))].sort((a, b) => a - b);
        expect(lit).toEqual((MONTAGE_BEATS[rp.label] ?? []).map((s) => Date.parse(s)));
      });

      it('the director\'s chapters are the schedule\'s: chapterPs over the played beats equals their opensDay count over T (27 E10)', () => {
        const played = sch.beats.filter((b) => b.durationMs > 0);
        const total = played.filter((b) => b.opensDay).length;
        let so = 0;
        const want = played.map((b) => { if (b.opensDay) so++; return total ? so / total : 0; });
        expect(chapterPs(played.map((b) => [b.firstUtc, b.sourceUtc] as const), rp.tz)).toEqual(want);
      });

      it('late-day montage (27 E10): under the cap, a routine repeat folds in the tight end only, never an arc\'s merge or a volley; no lever', () => {
        if (dir.levers.length) return;
        compareLate(rp, {});
      });

      it('a climax beat has no tempo, and every other beat\'s tempo is between 1 and 2', () => {
        if (!dir.tempo) return;
        const climaxEvents = new Set([...dir.climaxes].map((k) => k.split('|')[0]!));
        for (const b of sch.beats) {
          const k = dir.tempo.get(b.index);
          if (b.eventKeys.some((e) => climaxEvents.has(e))) expect(k, `beat ${b.index}`).toBeUndefined();
          else if (k !== undefined) { expect(k).toBeGreaterThanOrEqual(1); expect(k).toBeLessThanOrEqual(2); }
          if (b.durationMs > 0 && b.eventKeys.some((e) => climaxEvents.has(e))) expect(sch.tempoAt(b.presentationStartMs)).toBe(1);
        }
      });
    });
  }

  it('two fresh builds give the same Direction', () => {
    const again = resolvePods({ story: true });
    pods.forEach((rp, i) => {
      const a = scheduleOf(rp.h, rp.scene, rp.tz, {}).limelight!.direction;
      const b = scheduleOf(again[i]!.h, again[i]!.scene, again[i]!.tz, {}).limelight!.direction;
      expect(dirJson(a)).toBe(dirJson(b));
    });
  });

  it('late-day montage over the cap is as today: Quasar and Pulsar\'s Direction is the same without it (27 E10)', () => {
    for (const n of ['Quasar', 'Pulsar']) {
      const rp = pods.find((p) => p.label.includes(n))!;
      const a = scheduleOf(rp.h, rp.scene, rp.tz, {}).limelight!.direction;
      const b = scheduleOf(rp.h, rp.scene, rp.tz, { lateMontage: false as const }).limelight!.direction;
      expect(dirJson(a), n).toBe(dirJson(b));
    }
  });

  it('late-day montage on the busy pods with room under the cap folds only in the tight end, never an arc\'s merge or a volley; Quasar folds some (27 E10)', () => {
    // In story time (block E audit) Pulsar's tight end has no routine repeat left to fold: its count is 0, and checked.
    const folded = Object.fromEntries(['Quasar', 'Pulsar'].map((n) => [n, compareLate(pods.find((p) => p.label.includes(n))!, { targetMs: 1e9 })]));
    expect(folded.Quasar).toBeGreaterThan(0);
    expect(folded.Pulsar).toBe(0);
  });

  it('the levers option holds the director back: only short forms, or none', () => {
    const rp = pods.find((p) => p.label.includes('Quasar'))!;
    const only = scheduleOf(rp.h, rp.scene, rp.tz, { levers: ['short'], lateMontage: false as const }).limelight!.direction!; // late-day montage is no lever (27 E10): off, so only the levers fold
    expect(only.levers).toEqual(['short']);
    expect(only.tempo).toBeUndefined();
    expect([...only.forms.values()]).not.toContain('montage');
    const none = scheduleOf(rp.h, rp.scene, rp.tz, { levers: [] });
    expect(none.limelight!.direction!.levers).toEqual([]);
    expect(none.wallMs).toBe(none.totalMs);
  });

  it('with an unreachable target on Harbor the short lever runs and every non-climax moment with a short form plays it', () => {
    const rp = pods.find((p) => p.label.includes('Harbor')) ?? pods[pods.length - 1]!;
    const inputs = { targetMs: 1 };
    const { sch, out } = plays(rp, inputs);
    expect(sch.limelight!.direction!.levers).toEqual(['short', 'montage', 'speed', 'light']); // no hero shot on Harbor, so fewer-heroes has nothing to do
    expect([...sch.limelight!.direction!.tempo!.values()].every((k) => k === 2)).toBe(true);
    for (const { m } of out) {
      if (!m.protect || m.climax || m.arc?.merge || m.id === RULE.agentProgress) continue;
      const v = m.variant?.replace(/-short$/, '');
      const sf = shortForm(rule(m.id), v === 'short' ? undefined : v);
      if (sf) expect(m.phases, m.eventKey).toEqual(sf.phases);
    }
  });
});
