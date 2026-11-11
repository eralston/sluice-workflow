// Power link (13 §6, rule `attachment.merge`, a protected moment, art session 2026-10-12): a merge
// as a moment of teamwork. Set up: the author's ship flies over to the station and the approvers take
// their places behind it (in-scene ships fly; reviewer-only guests jump in out of hyperspace). Action:
// the approvers' beams energise the author, then the author's beam energises the station, and the
// tender docks (the merge itself, mid-sequence). A volley (27 E6, M-31) is one Power link with the union
// crew: every other author and approver energises the lead, and every member's tender docks together. On a station's first merge it transforms while every
// beam holds (the `first` variant: its look lands at the land, and the art plays the change). Payoff:
// the station charges and fires one split beam at the work the attachment served: a hero-blue phaser
// at a hive ship, its mining beam at an asteroid (13 §6.1, 2026-10-13). The beam doesn't change them (INV-06: merged ≠
// done); their own close plays that (Strike run, Landing). Then the guests jump out and the ships
// fly home.
//
// The formation lies beside the station, by default on the side toward the star (it stays in frame)
// and across its line of fire, so the energy reads approvers → author → station, then on to the work.
// 27 D2 may take the far end or the other axis to stay on the board, and 27 D3 may turn the line in
// 15 degree steps to keep it clear of the beam (formationSpots.ts).
import { ARC_IMPACT_MS } from '@shared/engine/maneuvers';
import { RULE } from '@shared/engine/pace';
import { lighten } from '../../../chart/art/lit';
import { SUCCESS } from '../../../chart/art/progress';
import { cmd, drawnR, one, phaseMs, pointOf, present, crewHoldMs } from '../../../chart/fx/commands';
import { LINK_CHARGE_MS, TRACTOR } from '../../../chart/fx/timing';
import type { AwayView, CastView, CastViews, CommandCall, ManeuverDef } from '../../../chart/fx/types';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import { brighten, HERO, HERO_GLOW, HERO_SOFT } from '../../../chart/art/energy';
import { themeCmd } from '../commands';
import { APPROVER_OUT, APPROVER_STEP, CORRIDOR_HALF, formationSpots } from './formationSpots';

/** When the energy chain's second link (author → station) starts, into the act (ms). */
const LINK_MS = 800;
// The station's charge before it fires is `LINK_CHARGE_MS` (fx/timing); the beam strikes `ARC_IMPACT_MS`
// into the echo (its charge and its run).

type P = [number, number];

export { APPROVER_STEP, APPROVER_OUT };

/**
 * The formation (22 C11, 27 D2): one line through the station, toward the view's middle, kept on the
 * board. The geometry and the pick are in `formationSpots` (pure, unit-tested).
 */
function formation(c: CastViews, f: CastView): { author: P; approvers: P[]; face: number; blocked?: true } {
  const at = pointOf(f.at) ?? [f.node.world.x, f.node.world.y];
  const plates = [f, ...present(c, 'target')].map((v) => v.plate?.() ?? null).filter((r): r is NonNullable<typeof r> => !!r);
  // 27 D3: the strands to the work, so the line keeps clear of them (spots are fixed at gather, from the station's centre).
  const beams = present(c, 'target').map((v): P => {
    const p = pointOf(v.at);
    return p ? [p[0], p[1]] : [v.node.world.x, v.node.world.y];
  });
  return formationSpots({ at: [at[0], at[1]], R: drawnR(f), n: (c.support?.length ?? 0) + (c.away?.support?.length ?? 0), plates, board: c.board, beams });
}

const ms = (m: PlannedManeuver, ...ps: Parameters<typeof phaseMs>[1][]) => ps.reduce((s, p) => s + phaseMs(m, p), 0);

/** The formation's spots, by person, fixed when the moment starts (the station doesn't move). */
const spots = new WeakMap<PlannedManeuver, { author: P; approvers: P[]; face: number; blocked?: true }>();
const spotsOf = (c: CastViews, f: CastView, m: PlannedManeuver) => {
  let s = spots.get(m);
  if (!s) spots.set(m, (s = formation(c, f)));
  return s;
};

/** Every approver in order, here or away: [the view or guest seed, its spot]. */
function approversOf(c: CastViews): ({ v: CastView } | { away: AwayView })[] {
  return [...present(c, 'support').map((v) => ({ v })), ...(c.away?.support ?? []).map((away) => ({ away }))];
}

export const powerLink: ManeuverDef = {
  id: RULE.attachmentMerge,
  title: 'Power link',
  phase: {
    tell: (c) => {
      const f = one(c, 'facility');
      return f ? [cmd.ring({ at: f.at, r: drawnR(f) * 2.2, r1: drawnR(f) * 1.1, color: SUCCESS, durS: 0.3, alpha: 0.5 })] : [];
    },
    gather: (c, m) => {
      const f = one(c, 'facility');
      if (!f) return [];
      const s = spotsOf(c, f, m);
      const out = phaseMs(m, 'gather');
      const hold = crewHoldMs(m); // through the payoff, the crew named, folded, then away (22 B9)
      const back = phaseMs(m, 'disperse');
      const calls: CommandCall[] = [];
      const fly = (v: CastView, to: P, delay: number) =>
        cmd.pursue({ pk: v.node.projectionKey, durS: (out - delay) / 1000, holdS: hold / 1000, backS: back / 1000, to, look: f.at, wake: 4 }, delay);
      const jump = (key: CanonicalKey, seed: number, at: P, delay: number) =>
        themeCmd.guest({ key, seed, at, face: s.face, durS: (out - delay + hold + back * 0.6) / 1000 }, delay);
      // The author first; then the approvers, a beat apart, in from wherever they are.
      const a = present(c, 'agent')[0];
      const away = c.away?.agent?.[0];
      // A first merge: the station's transformation starts now and runs while the chain builds (it fires as it ends).
      if (m.variant === 'first') calls.push(cmd.act(f.key, 'transform', 0));
      if (a) calls.push(fly(a, s.author, 0));
      else if (away) calls.push(jump(away.key, away.seed, s.author, 0));
      approversOf(c).forEach((x, i) => {
        const delay = 180 + i * 140;
        calls.push('v' in x ? fly(x.v, s.approvers[i]!, delay) : jump(x.away.key, x.away.seed, s.approvers[i]!, delay));
      });
      return calls;
    },
    act: (c, m) => {
      const f = one(c, 'facility');
      if (!f) return [];
      const s = spotsOf(c, f, m);
      // Every beam holds from its start to the end of the payoff: through a transformation, through the charge.
      const until = ms(m, 'act', 'land', 'echo');
      const calls: CommandCall[] = [];
      const shipR = drawnR(f) * 0.5;
      // Approvers → author: the reviews energise the one who made the change.
      approversOf(c).forEach((_, i) => {
        // A reviewer's energy to the author: hero blue, desaturated, flowing in (2026-10-13).
        calls.push(themeCmd.energy({ from: s.approvers[i]!, to: s.author, toR: shipR, color: HERO_SOFT, durS: (until - i * 90) / 1000 }, i * 90));
      });
      // Author → station, once the author is charged; the tender docks (the merge).
      calls.push(cmd.tractor({ from: s.author, to: f.at, toR: drawnR(f) * 0.8, color: TRACTOR, durS: (until - LINK_MS) / 1000 }, LINK_MS));
      calls.push(cmd.ring({ at: s.author, r: shipR * 2.2, r1: shipR, color: HERO_GLOW, durS: LINK_MS / 1000, alpha: 0.7 }));
      // Every tender docks at once (a volley's, 27 E6 M-31): one slot, or the set of them.
      const slots = present(c, 'attachment').flatMap((v) => (v.slot === undefined ? [] : [v.slot]));
      calls.push(cmd.act(f.key, 'dock', 0, slots.length > 1 ? slots : slots[0]));
      return calls;
    },
    land: (c) => {
      const f = one(c, 'facility');
      if (!f) return [];
      const R = drawnR(f);
      // Merged: a gold ring as the bay takes the tender. The station's new look lands now (on a first
      // merge its transformation began at the gather, and has run or is running on).
      return [cmd.ring({ at: f.at, r: R * 0.8, r1: R * 1.5, color: lighten(SUCCESS, 0.2), durS: 1, alpha: 0.8 })];
    },
    echo: (c, m) => {
      const f = one(c, 'facility');
      if (!f) return [];
      const R = drawnR(f);
      const echo = phaseMs(m, 'echo');
      const targets = present(c, 'target');
      const calls: CommandCall[] = [];
      // Charge, then one split beam: a strand to every piece the work served that's in the scene.
      calls.push(themeCmd.charge({ at: f.at, r: R * 0.9, color: targets.length ? HERO : HERO_GLOW, durS: LINK_CHARGE_MS / 1000 }));
      calls.push(cmd.act(f.key, 'charge'));
      const fire = (echo - LINK_CHARGE_MS) / 1000;
      for (const t of targets) {
        const from = () => {
          const a = pointOf(f.at);
          const b = pointOf(t.at);
          if (!a || !b) return a;
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          return [a[0] + ((b[0] - a[0]) / l) * R * 0.45, a[1] + ((b[1] - a[1]) / l) * R * 0.45] as const;
        };
        // 27 D3: with no clear line the crew keeps its place, and the beam fades as it passes the ships.
        const s = spots.get(m);
        const veil = s?.blocked ? { at: [s.author, ...s.approvers], r: R * 0.5 * CORRIDOR_HALF } : undefined;
        const args = { from, to: t.at, toR: drawnR(t), durS: fire, ...(veil ? { veil } : {}) };
        calls.push(t.node.kind === 'threat' ? themeCmd.phaser(args, LINK_CHARGE_MS) : themeCmd.mine({ ...args, seed: t.node.seed }, LINK_CHARGE_MS));
        // A strong hit, not a finish: a flare in the beam's colour, never the grand gold one.
        calls.push(cmd.flare({ at: t.at, r: drawnR(t), color: brighten(HERO, t.node.kind === 'threat' ? 0.2 : 0.3), scale: 1.5, linger: 1.4 }, ARC_IMPACT_MS)); // the impact: an arc's close lands now (22 C4)
      }
      if (!targets.length) calls.push(cmd.ring({ at: f.at, r: R, r1: R * 2.2, color: HERO_GLOW, durS: 1.2, alpha: 0.6 }, LINK_CHARGE_MS));
      return calls;
    },
    disperse: (c) => {
      const f = one(c, 'facility');
      return f ? [cmd.ring({ at: f.at, r: drawnR(f), r1: drawnR(f) * 1.2, color: SUCCESS, durS: 0.6, alpha: 0.4 })] : [];
    },
  },
};
