// Gallery maneuver demos (v1, 17 W4-T1; HG-V3′): one cell per engine rule, each a real GraphScene on
// a small canned solar graph and a real ManeuverInterpreter, looping one PlannedManeuver. The graphs
// and the maneuver come from the `pod-sprint` fixture (invented names, INV-18) at the instant that
// rule first plays in a region, through the same projection, schedule and planner the chart uses, so
// what loops here is what the episode plays. R toggles reduced motion for every demo (INV-20).
// Development only.
import { Container, Text } from 'pixi.js';
import stateMappingJson from '@config/state-mapping.json';
import type { ScopeHistory, StateMapping } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { CastRole, PlannedManeuver } from '@shared/contracts/maneuver';
import type { Snapshot, ViewGraph, ViewNode } from '@shared/contracts/view';
import { CROWD_MIN, crewTimes, flyingPlay, planManeuvers, priorityFor } from '@shared/engine/maneuvers';
import { PACE_RULES, RULE, ruleById, shortForm, spanMs, type PaceRule } from '@shared/engine/pace';
import { eventOf } from '@shared/packs/events';
import { SOLAR } from '@shared/hierarchy/solar';
import { paceFacts } from '@shared/hierarchy/solarSource';
import { LAYOUT_VERSION } from '@shared/limits';
import { packFor } from '@shared/packs/registry';
import { ENGAGEMENT } from '@shared/playback/engagement';
import { buildScene } from '@shared/playback/highlights';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { auraFlareIn } from '../chart/art/aura';
import { motion } from '../chart/art/motion';
// The maneuver registry fills from the theme, so it subscribes before the theme is made active.
import { maneuverFor } from '../chart/fx/v1/registry';
import { ManeuverInterpreter, PREFER } from '../chart/fx/v1/interpreter';
import { GraphScene } from '../chart/scenes/GraphScene';
import '../theme/starChart'; // registers the Star Chart theme (14 §8)
import { activeTheme } from '../theme/registry';
import type { ArtView, Item, Section } from './types';

// The fixture DSL lives outside the renderer's type project (tsconfig.web.json), so it's loaded the
// way Vite bundles any module, typed by the little this file calls.
declare global {
  interface ImportMeta {
    glob<M>(pattern: string, options: { eager: true }): Record<string, M>;
  }
  interface Window {
    /** Gallery test hooks for the maneuver demos (tests/e2e/gallery-assets.spec.ts). */
    __starChartGalleryDemos?: DemoHooks;
  }
}
interface Dsl {
  toHistory(s: unknown, mapping: StateMapping, scope?: unknown): ScopeHistory;
  sprintScopes(s: unknown): readonly { sprint: string }[];
}
const DSL = Object.values(import.meta.glob<Dsl>('@fixtures/dsl.ts', { eager: true }))[0];
const POD_SPRINT = Object.values(import.meta.glob<{ default: unknown }>('@fixtures/scenarios/v1/pod-sprint.ts', { eager: true }))[0]?.default;

/** The demo's viewport in screen px: inside a wide gallery cell (two 200 px columns, 190 px tall). */
export const VIEW_W = 400;
export const VIEW_H = 172;
/** The smallest world box a demo frames (a planet, its free pieces and a captain beside them). */
const MIN_BOX_W = 1100;
/** A ship further out than this box (world units wide) is left to fly in from off the frame. */
const MAX_BOX_W = 2600;
/** World units added round the cast before framing it. */
const BOX_PAD = 140;
/** Each loop: the before state holds, the maneuver plays, the after state holds, then it repeats. */
export const REST_S = 0.8;
export const HOLD_S = 1.4;
/** A maneuver's commands may outlast its beat (a grand flare lingers); past this it's stuck. */
export const TIMEOUT_S = 20;
/** How much plays (05 §5): the most, with load ignored, so every phase of the choreography shows. */
export const ENG = ENGAGEMENT.maximum;

/**
 * Which occurrence of each rule a demo shows (0, the first whose cast is all on the board, by
 * default). A remix knob: point a rule at a later moment in the fixture to review another cast.
 */
export const DEMO_PICK: Partial<Record<string, number>> = {};

/** One demo: a rule, its planned maneuver, and the canned graphs it plays between. */
export interface DemoCase {
  rule: string;
  title: string;
  region: string;
  m: PlannedManeuver;
  history: ScopeHistory;
  snapshot: Snapshot;
  before: ViewGraph;
  after: ViewGraph;
  /** The world box the demo frames (centre and size). */
  box: { cx: number; cy: number; w: number; h: number };
}

/** What a demo has done, for review and the e2e hooks. */
export interface DemoStats {
  id: string;
  rule: string;
  title: string;
  state: 'rest' | 'play' | 'after';
  /** Loops finished with every command cleared (activeCount() === 0), in full and reduced motion. */
  loops: number;
  reducedLoops: number;
  /** The most live commands the last finished loop had at once. */
  peak: number;
  /** Live commands now. */
  active: number;
  /** Loops that didn't clear within TIMEOUT_S of their end. */
  stuck: number;
  /** Maneuvers the interpreter has started. */
  started: number;
  /** The highest victory-flare share on gold outlines in the demo now (27 B3; 0 when none). */
  flare: number;
  /** The highest flare share over the last finished loop, in full and in reduced motion. */
  flarePeak: number;
  reducedFlarePeak: number;
  /**
   * The cast's first agent's ship over the last finished full-motion loop (27 F2): the longest time (ms) it sat still
   * between its first move and its last (0 if it never moved), and how far (world units) it travelled.
   */
  agentStillMs: number;
  agentTravel: number;
  /** The same ship's travel over the last loop that ran in reduced motion from start to end. */
  reducedAgentTravel: number;
}

export interface DemoHooks {
  list(): DemoStats[];
  setReduced(on: boolean): void;
  reduced(): boolean;
}

/** The roles whose keys must be on the board for a moment to read (guards and the frontier are drawn by their parent). */
const DRAWN: readonly CastRole[] = ['subject', 'agent', 'support', 'seat', 'fromSeat', 'toSeat', 'facility', 'attachment'];

/**
 * Whether every cast part resolves as the interpreter's `viewOf` finds it (v1.3 F6): by key AND kind
 * (a person's seat and ship share a key, 14 §9 D1), in the board AFTER the beat. In order: a node of
 * the role's kind (a subject takes any kind as a last resort); an attachment in a facility's
 * `attachment` slot; and, only for what left this beat, the BEFORE board's node of that kind (any
 * kind for a role with none), then an attachment slot on the before board whose facility the after board still draws.
 */
function castResolves(m: PlannedManeuver, before: ViewGraph, after: ViewGraph): boolean {
  const found = (role: CastRole, key: CanonicalKey) => {
    const kinds = PREFER[role];
    const here = after.nodes.filter((n) => n.canonicalKey === key);
    if (kinds.length && (kinds.some((k) => here.some((n) => n.kind === k)) || (role === 'subject' && here.length > 0))) return true;
    if (after.nodes.some((f) => f.compound?.slots.some((x) => x.key === key && x.role === 'attachment'))) return true;
    if (before.nodes.some((n) => n.canonicalKey === key && (!kinds.length || kinds.includes(n.kind)))) return true;
    // An attachment that leaves its facility this beat (`attachment.merge`, `.settle`) has its slot on the
    // BEFORE board; the facility that carries it is the one the target board still draws (`viewOf`, v1.3 F-leftovers).
    return before.nodes.some((f) => f.compound?.slots.some((x) => x.key === key && x.role === 'attachment') && after.nodes.some((n) => n.projectionKey === f.projectionKey));
  };
  return DRAWN.every((role) => (m.cast[role] ?? []).every((k) => found(role, k)));
}

/**
 * A sector sweep (27 E7a) resolves when CROWD_MIN of its new pieces are on the board after the beat: it
 * reveals only the pieces drawn (R9), as the chart's play does, so one created elsewhere and moved in later
 * (pod-sprint's 20141, created in Lantern) does not cost it its cell.
 */
function sweepResolves(m: PlannedManeuver, after: ViewGraph): boolean {
  return (m.cast.subject ?? []).filter((k) => after.nodes.some((n) => n.canonicalKey === k)).length >= CROWD_MIN;
}

/** Whether a node draws one of the keys (an attachment is drawn by the facility it sits in). */
const draws = (n: ViewNode, keys: Set<CanonicalKey>) => keys.has(n.canonicalKey) || !!n.compound?.slots.some((s) => keys.has(s.key));

/** The nodes a maneuver's cast means, among `nodes`; a sector sweep (27 E7a) frames and keeps the star it sweeps from too. */
function castNodes(m: PlannedManeuver, nodes: ViewNode[]): ViewNode[] {
  const keys = new Set<CanonicalKey>(Object.values(m.cast).flatMap((ks) => ks ?? []));
  return nodes.filter((n) => draws(n, keys) || (!!m.sweep && n.kind === 'star'));
}

/**
 * The world box a demo frames, padded and widened to the viewport's shape: the moment's pieces and
 * places (its subject, seats, facility), and its ships too unless they sit far off (a ship flies in
 * to its work, so the moment still reads). A person's seat and ship share a key (14 §9 D1), so ships
 * are told apart by kind.
 */
function frameOf(m: PlannedManeuver, nodes: ViewNode[]): DemoCase['box'] {
  const cast = castNodes(m, nodes);
  const bounds = (list: ViewNode[]) => {
    if (!list.length) return null;
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const n of list) {
      b.x0 = Math.min(b.x0, n.world.x - n.world.r); b.x1 = Math.max(b.x1, n.world.x + n.world.r);
      b.y0 = Math.min(b.y0, n.world.y - n.world.r); b.y1 = Math.max(b.y1, n.world.y + n.world.r);
    }
    return b;
  };
  const all = bounds(cast);
  let b = bounds(cast.filter((n) => n.kind !== 'captain')) ?? all;
  if (all && b && all.x1 - all.x0 + 2 * BOX_PAD <= MAX_BOX_W) b = all;
  const { x0, y0, x1, y1 } = b ?? { x0: -MIN_BOX_W / 2, y0: -MIN_BOX_W / 2, x1: MIN_BOX_W / 2, y1: MIN_BOX_W / 2 };
  let w = Math.max(MIN_BOX_W, x1 - x0 + 2 * BOX_PAD);
  let h = y1 - y0 + 2 * BOX_PAD;
  if (w / h < VIEW_W / VIEW_H) w = (h * VIEW_W) / VIEW_H;
  else h = (w * VIEW_H) / VIEW_W;
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, h };
}

/**
 * The canned graph: only what's in (or near) the framed box, plus the cast and anything a kept node
 * is attached to (all the way up its chain), with the edges between kept nodes. Mega-lists are dropped (no labels here).
 */
export function crop(g: ViewGraph, box: DemoCase['box'], keep: Set<string>): ViewGraph {
  const mx = box.w * 0.65, my = box.h * 0.65;
  const kept = new Set(g.nodes.filter((n) => keep.has(n.projectionKey) || (Math.abs(n.world.x - box.cx) - n.world.r < mx && Math.abs(n.world.y - box.cy) - n.world.r < my)).map((n) => n.projectionKey));
  // Whatever a kept node is attached to, however deep the chain goes (a ship on a berth on a station).
  for (let grew = true; grew;) {
    grew = false;
    for (const n of g.nodes) if (kept.has(n.projectionKey) && n.attach && !kept.has(n.attach.to)) { kept.add(n.attach.to); grew = true; }
  }
  const out: ViewGraph = { ...g, nodes: g.nodes.filter((n) => kept.has(n.projectionKey)), edges: g.edges.filter((e) => kept.has(e.from) && kept.has(e.to)) };
  delete out.lists;
  return out;
}

/** The fixture's regions (each pod of each sprint), the busiest first, each scheduled as the chart schedules it. */
function regionsOf() {
  return DSL!.sprintScopes(POD_SPRINT).flatMap((scope) => {
    const h = DSL!.toHistory(POD_SPRINT, stateMappingJson as StateMapping, scope);
    const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
    return pods.map((pod) => {
      const sceneKey = SOLAR.format({ level: 'pod', key: pod.areaKey });
      return { h, label: pod.label, sceneKey, beats: buildScene(h, h.range, 'UTC', sceneKey as never, SOLAR).beats };
    });
  }).sort((a, b) => b.beats.length - a.beats.length || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/**
 * Why a demo has nothing to show: the `pod-sprint` fixture did not load (a missing file is a note in
 * the gallery, never a throw that blanks it, v1.3 F6). Null when it loaded.
 */
export function fixtureNote(): string | null {
  return DSL && POD_SPRINT ? null : 'the pod-sprint fixture did not load (fixtures/scenarios/v1/pod-sprint.ts or fixtures/dsl.ts is missing)';
}

/** A section's visible stand-in for demos that cannot be built: one full-row note cell. */
export function missingFixtureSection(key: string, title: string): Section {
  const note = fixtureNote() ?? 'nothing to show';
  return {
    key, title: `${title} · unavailable`, items: [],
    dom: [{
      id: 'missing', title: 'No demo: fixture missing', note, sky: 'ink',
      build(host) {
        const p = document.createElement('p');
        p.className = 'gallery__missing';
        p.style.cssText = 'margin:0;padding:12px;font:12px Menlo,monospace;color:#f4f0de';
        p.textContent = `No demo here: ${note}.`;
        host.appendChild(p);
        return () => p.remove();
      },
    }],
  };
}

/** The end state of the fixture's busiest region, whole, for the demos that need a populated board (Arrive/Depart, the finale). Null without the fixture. */
export function demoRegion(): { label: string; history: ScopeHistory; graph: ViewGraph } | null {
  if (!DSL || !POD_SPRINT) return null;
  const r = regionsOf()[0];
  if (!r) return null;
  const graph = projectScene(r.h, snapshotAt(r.h, r.h.range.endUtc, 'knownThen'), r.sceneKey as never, LAYOUT_VERSION, SOLAR);
  return { label: r.label, history: r.h, graph };
}

let cases: DemoCase[] | null = null;

/**
 * Every rule's demo, in pace-table order. Each region of each round of `pod-sprint` is scheduled as
 * the chart schedules it and every beat planned as `v1/plan.ts` plans it, the busiest region first.
 * Each rule takes its `DEMO_PICK` occurrence among the moments whose cast is all drawn (else the
 * last one found). Memoised.
 */
export function demoCases(): DemoCase[] {
  if (cases) return cases;
  if (!DSL || !POD_SPRINT) return (cases = []); // no fixture: no cells; `fixtureNote()` says so in the section
  const lens = 'knownThen';
  const regions = regionsOf();
  const found = new Map<string, DemoCase[]>();
  // Two passes: the chart's rules, then, for any rule the first never showed, the rules without the sector sweep
  // (27 E7a): the sweep takes every burst of creations, and pod-sprint's only new threats come in one.
  const NO_SWEEP = PACE_RULES.filter((r) => r.id !== RULE.regionSweep);
  for (const rules of [PACE_RULES, NO_SWEEP]) {
    const shown = rules === PACE_RULES ? new Set<string>() : new Set([...found.keys()].map((k) => k.split(':')[0]));
    for (const { h, label, sceneKey, beats } of regions) {
      const f = paceFacts(h);
      const prio = priorityFor(packFor(h), paceFacts);
      const project = (s: Snapshot) => projectScene(h, s, sceneKey as never, LAYOUT_VERSION, SOLAR);
      for (const beat of beats) {
        const planned = planManeuvers(h, beat, f, rules, ENG, prio ? { priorityOf: prio } : {}).filter((m) => !shown.has(m.id));
        let graphs: { before: ViewGraph; after: ViewGraph; snapshot: Snapshot } | null = null;
        for (const m of planned) {
          // 27 E3: the progress beam has no trigger until the director (E5); it replays a fixture merge as the beam.
          if (m.id === RULE.attachmentMerge && !found.has(RULE.agentProgress)) {
            const rule = ruleById(RULE.agentProgress)!;
            const e = eventOf(h, m.eventKey);
            const mv = f.moves.get(m.eventKey)?.find((x) => x.m === 'settle' && x.to.rung === 'accomplished');
            if (e && mv) {
              if (!graphs) {
                const snapshot = snapshotAt(h, beat.sourceUtc, lens);
                graphs = { before: project(snapshotAt(h, beat.firstUtc - 1, lens)), after: project(snapshot), snapshot };
              }
              const cast = rule.cast(mv, e, f);
              const pm: PlannedManeuver = {
                id: rule.id, eventKey: m.eventKey, seed: m.seed, cast, phases: rule.phases, afterMs: 0, durationMs: spanMs(rule.phases),
                ...(m.from ? { from: m.from } : {}), ...(m.to ? { to: m.to } : {}),
                keys: [...new Set(Object.values(cast).flatMap((ks) => ks ?? []))].sort(),
              };
              const aimed = (cast.target ?? []).some((k) => graphs!.after.nodes.some((n) => n.canonicalKey === k));
              if (aimed && castResolves(pm, graphs.before, graphs.after)) {
                const nodes = [...graphs.before.nodes, ...graphs.after.nodes];
                const box = frameOf(pm, nodes);
                const keep = new Set(castNodes(pm, nodes).map((n) => n.projectionKey));
                found.set(RULE.agentProgress, [{
                  rule: RULE.agentProgress, title: maneuverFor(rule.id)?.title ?? rule.id, region: label, m: pm, history: h, snapshot: graphs.snapshot,
                  before: crop(graphs.before, box, keep), after: crop(graphs.after, box, keep), box,
                }]);
              }
            }
          }
          // A rule's variants (a facility's first merge, a beamed close) each get a demo of their own.
          const id = m.variant ? `${m.id}:${m.variant}` : m.id;
          const list = found.get(id) ?? [];
          if (list.length > (DEMO_PICK[id] ?? 0)) continue; // enough of this rule already
          if (!graphs) {
            const snapshot = snapshotAt(h, beat.sourceUtc, lens);
            graphs = { before: project(snapshotAt(h, beat.firstUtc - 1, lens)), after: project(snapshot), snapshot };
          }
          if (!(m.sweep ? sweepResolves(m, graphs.after) : castResolves(m, graphs.before, graphs.after))) continue;
          // Played alone, the maneuver starts with its beat.
          const solo: PlannedManeuver = { ...m, afterMs: 0 };
          const nodes = [...graphs.before.nodes, ...graphs.after.nodes];
          const box = frameOf(solo, nodes);
          const keep = new Set(castNodes(solo, nodes).map((n) => n.projectionKey));
          list.push({
            rule: id, title: `${maneuverFor(m.id)?.title ?? m.id}${m.variant ? ` (${m.variant})` : ''}`, region: label, m: solo, history: h, snapshot: graphs.snapshot,
            before: crop(graphs.before, box, keep), after: crop(graphs.after, box, keep), box,
          });
          found.set(id, list);
        }
      }
    }
  }
  // Every form the director may trade down to (27 E5, E4d) has a cell too: the same play with the short phases and name.
  for (const [id, list] of [...found]) {
    const c = list[Math.min(DEMO_PICK[id] ?? 0, list.length - 1)];
    const rule = c && (PACE_RULES as readonly PaceRule[]).find((r) => r.id === c.m.id);
    const sf = c && rule ? shortForm(rule, c.m.variant) : null;
    if (!c || !sf) continue;
    const durationMs = flyingPlay(c.m) ? Math.max(spanMs(sf.phases), crewTimes(sf.phases).leaveMs) : spanMs(sf.phases);
    const shortId = `${c.m.id}:${sf.name}`;
    found.set(shortId, [{ ...c, rule: shortId, title: `${maneuverFor(c.m.id)?.title ?? c.m.id} (${sf.name})`, m: { ...c.m, phases: sf.phases, variant: sf.name, durationMs } }]);
  }
  cases = PACE_RULES.flatMap((r) => [...found.keys()].filter((k) => k === r.id || k.startsWith(`${r.id}:`)).sort().flatMap((id) => {
    const list = found.get(id) ?? [];
    const c = list[Math.min(DEMO_PICK[id] ?? 0, list.length - 1)];
    return c ? [c] : [];
  }));
  return cases;
}

/** Reduced motion for the demos only (the rest of the gallery keeps its own), and every demo mounted. */
export const demoMotion = { reduced: false };
const live = new Set<ManeuverDemo>();
/** Other demo families (motionDemos.ts) restart with the maneuver demos when R flips the mode. */
export const reducedListeners = new Set<() => void>();

function setDemoReduced(on: boolean): void {
  if (demoMotion.reduced === on) return;
  demoMotion.reduced = on;
  for (const f of reducedListeners) f();
  for (const d of live) d.restart(); // each demo plays its maneuver again, from its start, in the new mode
}

/** A looping maneuver: its scene, its interpreter and its framing, as one gallery view. */
class ManeuverDemo implements ArtView {
  readonly root = new Container({ label: 'maneuverDemo' });
  private readonly cam = new Container();
  private readonly scene: GraphScene;
  private readonly fx: ManeuverInterpreter;
  private readonly caption = new Text({ text: '', style: { fontFamily: 'Menlo, monospace', fontSize: 10, fill: 0xf4f0de } });
  private readonly labelHost = document.createElement('div');
  private readonly scale: number;
  private state: DemoStats['state'] = 'rest';
  private t = 0;
  private last: number | null = null;
  private peak = 0;
  private flarePeakNow = 0;
  private captioned = '';
  /** The cast's first agent's ship (its projection key), and what it did this loop (27 F2). */
  private readonly agentPk: string | null;
  private track = { prev: null as [number, number] | null, travel: 0, run: 0, worst: 0, moved: false, reducedAll: true, fullAll: true };
  readonly stats: DemoStats;

  constructor(id: string, private readonly c: DemoCase) {
    this.scene = new GraphScene({ onSelect: () => {}, onEnter: () => {}, onHover: () => {} });
    this.fx = new ManeuverInterpreter({
      scene: () => this.scene,
      hierarchy: () => SOLAR,
      worldToScreen: (x, y) => this.cam.toGlobal({ x, y }),
      labelHost: this.labelHost,
      onGo: () => {},
      flashLabel: () => {},
    });
    this.scene.setAssetCtx({ theme: activeTheme()?.id ?? 'star-chart', viewer: null, captain: null });
    // Framed twice: from the graphs, then from where the scene draws them at that scale (ships and
    // formations are placed in screen terms, placement.ts).
    const scaleOf = (b: DemoCase['box']) => Math.min(VIEW_W / b.w, VIEW_H / b.h);
    const drawn = [c.after, c.before].flatMap((g) => {
      this.scene.apply(g, 'jump');
      this.scene.setCameraScale(scaleOf(c.box));
      return this.scene.targetNodes();
    });
    const box = frameOf(c.m, drawn);
    this.scale = scaleOf(box);
    this.cam.scale.set(this.scale);
    this.cam.position.set(-box.cx * this.scale, -box.cy * this.scale);
    this.cam.addChild(this.scene.root);
    this.caption.alpha = 0.5;
    this.caption.position.set(-VIEW_W / 2 + 4, VIEW_H / 2 - 14);
    this.root.addChild(this.cam, this.caption);
    const agent = c.m.cast.agent?.[0];
    this.agentPk = (agent && c.after.nodes.find((n) => n.canonicalKey === agent && n.kind === 'captain')?.projectionKey) || null;
    this.stats = { id, rule: c.rule, title: c.title, state: 'rest', loops: 0, reducedLoops: 0, peak: 0, active: 0, stuck: 0, started: 0, flare: 0, flarePeak: 0, reducedFlarePeak: 0, agentStillMs: 0, agentTravel: 0, reducedAgentTravel: 0 };
    this.restart();
    live.add(this);
  }

  setStage(): void {}

  /** From the top: every command cleared (INV-15), the before state snapped in, held a moment. */
  restart(): void {
    this.fx.clear();
    this.scene.apply(this.c.before, 'jump');
    this.state = 'rest';
    this.t = 0;
    this.peak = 0;
    this.flarePeakNow = 0;
  }

  tick(seconds: number): void {
    // The gallery's clock: paused or frozen, the demo holds where it is.
    const dt = this.last === null || seconds < this.last ? 0 : Math.min(0.1, seconds - this.last);
    this.last = seconds;
    const frozen = dt === 0;
    const was = motion.reduced;
    motion.reduced = demoMotion.reduced;
    try {
      if (!frozen) this.step(dt);
      // ChartApp's frame order: art, layout at the camera's scale, effects, then the glide.
      this.scene.setReduced(demoMotion.reduced);
      this.scene.tick(seconds);
      this.stats.flare = auraFlareIn(this.root);
      if (this.state === 'play') this.flarePeakNow = Math.max(this.flarePeakNow, this.stats.flare);
      this.scene.setCameraScale(this.scale);
      this.fx.update(dt * 1000, dt * 1000, frozen);
      this.scene.glide(dt * 1000, frozen);
      if (this.state === 'play') this.peak = Math.max(this.peak, this.fx.activeCount());
      if (this.state === 'play' && !frozen) this.trackAgent(dt * 1000);
    } finally {
      motion.reduced = was;
    }
    this.stats.state = this.state;
    this.stats.active = this.fx.activeCount();
    this.stats.started = this.fx.census().maneuvers;
    this.updateCaption();
  }

  /** Follows the first agent's ship through the loop: how far it goes, and the longest it sits still between its moves (27 F2). */
  private trackAgent(ms: number): void {
    const k = this.track;
    if (!demoMotion.reduced) k.reducedAll = false;
    if (demoMotion.reduced) k.fullAll = false;
    const at = this.agentPk ? (this.scene.liveOf(this.agentPk) as [number, number] | null) : null;
    if (!at) return;
    if (k.prev) {
      const d = Math.hypot(at[0] - k.prev[0], at[1] - k.prev[1]);
      k.travel += d;
      if (d > 1e-4) { if (k.moved) k.worst = Math.max(k.worst, k.run); k.moved = true; k.run = 0; } else if (k.moved) k.run += ms; // the rest after its last move isn't a hold
    }
    k.prev = [at[0], at[1]];
  }

  private step(dt: number): void {
    this.t += dt;
    const durS = this.c.m.durationMs / 1000;
    if (this.state === 'rest' && this.t >= REST_S) {
      // The beat lands as playback lands it: the after graph glides in, and the maneuver is queued
      // against what was drawn a moment ago.
      const before = { graph: this.c.before, nodes: this.scene.effectiveNodes() };
      this.scene.apply(this.c.after, 'beat');
      this.fx.queue({ plan: [], maneuvers: [this.c.m], eng: ENG, history: this.c.history, snapshot: this.c.snapshot, before, after: this.c.after });
      this.state = 'play';
      this.t = 0;
      this.peak = 0;
      this.flarePeakNow = 0;
      this.track = { prev: null, travel: 0, run: 0, worst: 0, moved: false, reducedAll: true, fullAll: true };
    } else if (this.state === 'play' && this.t >= durS && this.fx.activeCount() === 0) {
      if (demoMotion.reduced) {
        this.stats.reducedLoops++; this.stats.reducedFlarePeak = this.flarePeakNow;
        if (this.track.reducedAll) this.stats.reducedAgentTravel = this.track.travel; // only a loop reduced from start to end
      } else {
        this.stats.loops++; this.stats.flarePeak = this.flarePeakNow;
        if (this.track.fullAll) { this.stats.agentTravel = this.track.travel; this.stats.agentStillMs = this.track.worst; }
      }
      this.stats.peak = this.peak;
      this.state = 'after';
      this.t = 0;
    } else if (this.state === 'play' && this.t >= durS + TIMEOUT_S) {
      this.stats.stuck++;
      this.state = 'after';
      this.t = 0;
    } else if (this.state === 'after' && this.t >= HOLD_S) {
      this.restart();
    }
  }

  private updateCaption(): void {
    const text = `${demoMotion.reduced ? 'reduced motion' : 'full motion'} · R toggles · ${this.state}`;
    if (text === this.captioned) return;
    this.captioned = text;
    this.caption.text = text;
  }

  destroy(): void {
    live.delete(this);
    this.fx.clear();
    this.scene.dispose();
    this.root.destroy({ children: true });
  }
}

/** Who and what a demo's cast is, for its caption (fixture labels only, INV-18). */
function castNote(c: DemoCase): string {
  const label = (k: CanonicalKey) => [...c.after.nodes, ...c.before.nodes].find((n) => n.canonicalKey === k)?.label ?? k.split(':').pop();
  const part = (role: CastRole) => (c.m.cast[role]?.length ? `${role} ${c.m.cast[role]!.map(label).join(', ')}` : '');
  return [part('subject'), part('agent'), part('seat')].filter(Boolean).join(' · ');
}

let keyBound = false;

/**
 * The maneuver demos' section: one wide cell per rule. Binds R (reduced motion) and the test hooks
 * once. A rule the fixture never plays has no cell; the note says which.
 */
export function maneuverSections(): Section[] {
  activeTheme(); // installs the theme's assets and maneuvers before any demo is built
  const all = demoCases();
  if (fixtureNote()) return [missingFixtureSection('maneuvers', 'Maneuvers')];
  const missing = PACE_RULES.map((r) => r.id).filter((id) => !all.some((c) => c.m.id === id));
  if (!keyBound && typeof window !== 'undefined') {
    keyBound = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') setDemoReduced(!demoMotion.reduced);
    });
    window.__starChartGalleryDemos = {
      list: () => [...live].map((d) => ({ ...d.stats })),
      setReduced: (on) => setDemoReduced(on),
      reduced: () => demoMotion.reduced,
    };
  }
  const items: Item[] = all.map((c) => {
    const rule = ruleById(c.m.id);
    const id = c.rule;
    return {
      id,
      title: `${c.title} · ${c.rule}`,
      note: `${rule?.tier ?? 'narrative'}${c.m.protect ? ' · protected' : ''} · ${c.m.durationMs} ms · ${c.region} · ${castNote(c)}`,
      wide: true,
      make: () => new ManeuverDemo(id, c),
    };
  });
  return [{
    key: 'maneuvers',
    title: `Maneuvers · every engine rule looping on pod-sprint (R: reduced motion)${missing.length ? ` · not in the fixture: ${missing.join(', ')}` : ''}`,
    items,
    clip: true,
  }];
}
