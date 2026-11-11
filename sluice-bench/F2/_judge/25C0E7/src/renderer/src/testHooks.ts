// 03 §10 test hooks. Installed only when launched with STAR_CHART_TEST=1.
import type { ViewGraph } from '@shared/contracts/view';
import type { ChartApp, ChartCounts } from './chart/ChartApp';
import { pause, play, playheadUtc, scheduleOf, setActivity, setRate, setReducedMotion, setScheduleMs, step } from './playback';
import type { Rate } from '@shared/contracts/playback';
import { histories } from './data/scopeData';
import { reboot, select } from './nav';
import { useChart } from './store';
import { openSettings, type SettingsTab } from './settings/store';
import type { Award } from '@shared/engine/types';
import { currentAwards } from './v1/awards';
import { insigniaLog } from './chart/fx/commands';
import { atlasStats, loadAsteroidAtlas, setAtlasEnabled } from './chart/art/asteroidAtlas';
import { previewCensus } from './settings/previewCensus';
import { auraReadings, showAuras, type AuraParts, type AuraReading } from './chart/art/aura';
import { activeProfile, patchProfile } from './profile';
import { ornamentOk } from './chart/fx/timing';
import { planBeat } from './playHooks';
import { ENGAGEMENT } from '@shared/playback/engagement';

declare global {
  interface Window {
    __starChartReady?: Promise<void>;
    __starChartTest?: {
      counts(): ChartCounts;
      viewGraph(): ViewGraph | null;
      /** Open Settings on a tab (the cog is Solar's; a spec in a v0 view has no cog). */
      openSettings(tab: SettingsTab): void;
      remount(): Promise<void>;
      /** 23 C7: turn the asteroid atlas path on or off (loads it), and read what it did. Call remount() to rebuild the views. */
      setAtlasAsteroids(on: boolean): Promise<void>;
      atlasStats(): { hits: number; uncovered: number; missing: number };
      camera(): { x: number; y: number; scale: number };
      /** Screen position (CSS px, relative to the canvas) of a node's first selectable projection. */
      screenOf(canonicalKey: string): { x: number; y: number } | null;
      stack(): { sceneKey: string; label: string; selectedKey?: string }[];
      selected(): string | null;
      /** Select an object by its canonical key, or nothing (as a click would; drives and specs, 22 A5). */
      select(key: string | null): void;
      transitioning(): boolean;
      freezeAmbient(seconds: number | null): void;
      /** Hit circles as the scene has them, in canvas CSS px (VC-3, density harness). */
      hitCircles(): { projectionKey: string; kind: string; label: string; x: number; y: number; r: number }[];
      /** Nodes as drawn: floored radii and attached positions, in world units. */
      liveNodes(): ViewGraph['nodes'];
      /** The active device profile (15 §11): launch values with any patch applied. */
      profile(): import('@shared/contracts/profile').DeviceProfile;
      /** Whether the painterly pass is on now. */
      paintOn(): boolean;
      /** Whether the twinkle layer is shown now (the profile's twinkle switch). */
      twinkleOn(): boolean;
      /** Whether ornament would play in a perfectly calm scene (the profile's ornament switch). */
      ornamentPlays(): boolean;
      /** Overlay profile values (a partial; null clears), as a switch flipped in one run; subscribers re-apply. */
      setProfile(partial: Record<string, unknown> | null): void;
      /** Turn the painterly pass on or off (performance comparison). */
      setPaint(on: boolean): void;
      /** The directed camera's shots (27 E9): each climax and montage with its beat's window, its gather's x, and the cast's keys. */
      shots(): { kind: 'climax' | 'montage'; index: number; startMs: number; endMs: number; gatherMs: number; cast: string[] }[];
      /** Who holds the camera (27 E9): the director's shot if it still holds, where the camera is headed, and the fitted board now. */
      directedCamera(): { shot: 'climax' | 'board' | null; target: { x: number; y: number; scale: number }; fit: { x: number; y: number; scale: number } };
      /** The playback session (05 §2). */
      session(): { status: string; rate: number; x: number; totalMs: number; playheadUtc: number | null; stateUtc: number | null; beats: number; beatIndex: number; lens: string };
      /** Deterministic time control: put the schedule at x (a seek: no accents). */
      setScheduleMs(ms: number): void;
      /** Step to the next beat and play its accents, as the Step button does. */
      stepBeat(): void;
      /** Active accent effects and jump trails. */
      fx(): { active: number; trails: number };
      /** Every award insignia lit this session (23 D2): its id, and how long after it was asked for it lit (ms). */
      insignias(): { id: string; lagMs: number | null }[];
      /** The Task radar as drawn (06 §3): each Task's spoke angle, band, and live position. */
      radar(): { key: string; angle: number; band: string; x: number; y: number }[];
      /** Each beat's source time and start (schedule ms), for stepping to a known moment. */
      beatTimes(): { index: number; sourceUtc: number; startMs: number; accented: boolean }[];
      /**
       * The schedule's volleys (27 E6, M-31), in order: the fused beat's start and end (schedule ms), its member
       * event keys (the carrier first), and how many of the people its turns name are drawn captains now, with
       * their labels (`names`, sorted), so a test can check each is named and not only count them.
       */
      volleys(): { startMs: number; endMs: number; members: string[]; people: number; names: string[] }[];
      play(): void;
      pause(): void;
      setRate(rate: number): void;
      /** The director's volatility meter (05 §5 tiers). */
      volatility(): number;
      /** Where each selectable node is drawn this frame (the glide layer, plus effect offsets), in canvas CSS px. */
      displayed(): { pk: string; x: number; y: number }[];
      /** Live effects by type; `maneuvers`: v1 maneuvers started in solar scenes (0 elsewhere). */
      fxCensus(): { flares: number; grand: number; sparks: number; beams: number; inks: number; rings: number; moves: number; guests: number; glyphs: number; started: number; maneuvers: number; idle?: number };
      /** v1: live commands and tells in the scene's director (0 after any seek, INV-15). */
      liveCommands(): number;
      /** v1: the viewer's awards for the solar region on screen ([] when off, unchosen or not solar). */
      awards(): Award[];
      /** Add to the volatility meter (exercises the tiers); 0 restores. */
      biasVolatility(v: number): void;
      /** Edges hidden until their ink reveals them. */
      heldEdges(): string[];
      /** Nodes still gliding to their layout targets. */
      glidingCount(): number;
      /** Nodes at their layout targets (resting places), in world units. */
      targetNodes(): ViewGraph['nodes'];
      /** Follow mode and the frame-the-action camera (slice 3b). */
      follow(): { captain: string; callSign: string; suspended: boolean; text: string | null; note: string | null } | null;
      framing(): string;
      /** Put the camera somewhere, as a test would (not a user pan: nothing suspends). */
      setCamera(state: { x: number; y: number; scale: number }): void;
      /** Reduced motion on or off (05 §7). */
      setReduced(on: boolean): void;
      /** How much the ships do (Activity, 05 §5). Test runs start at 'calm'. */
      setActivity(level: 'calm' | 'lively' | 'maximum'): void;
      /** The hero aura (the followed ship's halo): subject, how visible (0..1), and whether its entrance is running. */
      hero(): { key: string | null; visible: number; warming: boolean };
      /** Loaded by level: whether an object is swirling, and the bundle's range. */
      exploring(): boolean;
      /** Loading energy drawn now, by kind, and the black hole's level. */
      energy(): { kinds: string[]; cosmos: string; cosmosPeak: string };
      /** Arrivals and departures played in this scene so far, and those still in flight (decided 2026-10-08). */
      motions(): { arrive: number; depart: number; active: number };
      /** The sprint streaming in, if any: the work still queued. */
      stream(): { pending: number; total?: number; exact?: boolean } | null;
      /** Raise the error banner with this message (23 B9: its placement against the player is checked by rects). */
      showError(message: string): void;
      /** Show (or clear) the follow bar with a sample row (23 B9: stacked under the player, checked by rects). */
      showFollowBar(on: boolean): void;
      /** Drop the loaded bundles, so the next open reads the cache afresh (AC-31). */
      forgetScopes(): void;
      /** Whether the automatic camera is holding still around a press (decided 2026-10-09). */
      cameraHeld(): boolean;
      /** Start the app's data over, as a launch does: projects, galaxy, no scope open (AC-31 cold start). */
      reboot(): Promise<void>;
      /** Frame times in ms over the last few seconds (slice 5 profiling). */
      frames(): { samples: number; p50: number; p95: number; worst: number };
      historyRange(): { startUtc: number; endUtc: number } | null;
      /** The stage each view shows (it lags a beat's change until the change lands, 06 §5). */
      shownStages(): Record<string, string>;
      /** How shown each solar guide is, by id, 0..1 (19 S2: the frontier belt, `solar`, only while work is unassigned). */
      guides(): Record<string, number>;
      /** How drawn each of these nodes' views is, 0..1 (0 while hidden for an entrance), by projection key (19 S2). */
      viewAlphas(pks: string[]): Record<string, number>;
      /** Which way each node's view faces (1 east, -1 west), where it turns. */
      facings(pks: string[]): Record<string, number>;
      /** What the cast plates say now (22 B6, B8): lit pieces' opacities and notes, and the events playing. */
      annotations(): { lit: Record<string, number>; notes: Record<string, { text: string; eventKey: string }>; playing: string[] };
      /** Each of these nodes' views' tint now, as 0..1 grey (1 untinted), by projection key: a station on standby dims (19 M1). */
      viewTints(pks: string[]): Record<string, number>;
      /** A station's drawn tenders (slot, place in px from its view's origin, whether docking) and dock bay (23 C6). */
      tenders(pk: string): { tenders: { slot: number; x: number; y: number; docking: boolean }[]; bay: { x: number; y: number } } | null;
      /** Every role outline on screen now: its centre (canvas CSS px), colour, rim and blur in screen px (19 S1). */
      auras(): AuraReading[];
      /** Draw every role outline's parts, or none, so a still can measure the outline alone (19 S1). */
      showAuras(parts: AuraParts): void;
      /** The whole UI store as JSON (Maps as entries), for AC-25's search for the canary PAT. */
      storeJson(): string;
      /** 23 E1: Settings' ship preview. `live` renderers now, `created` over the run, `draws` frames, and the design it shows. */
      captainPreview(): { live: number; created: number; draws: number; hull: number; colourway: number };
    };
  }
}

export function installTestHooks(chart: ChartApp): void {
  Object.defineProperty(window, '__starChartReady', { get: () => chart.ready, configurable: true });
  window.__starChartTest = {
    counts: () => chart.counts(),
    captainPreview: () => ({ ...previewCensus }),
    storeJson: () => JSON.stringify(useChart.getState(), (_k, v) => (v instanceof Map ? [...v.entries()] : typeof v === 'function' ? undefined : v)),
    viewGraph: () => useChart.getState().graph,
    openSettings: (tab) => openSettings(tab),
    remount: async () => {
      chart.remount();
      await chart.ready;
    },
    setAtlasAsteroids: async (on) => {
      setAtlasEnabled(on);
      if (on) await loadAsteroidAtlas();
    },
    atlasStats: () => ({ ...atlasStats }),
    select: (key) => select(key as never),
    camera: () => chart.cameraState(),
    setPaint: (on) => chart.setPaint(on),
    profile: () => activeProfile(),
    paintOn: () => chart.paintOn(),
    twinkleOn: () => chart.twinkleOn(),
    ornamentPlays: () => ornamentOk(0),
    setProfile: (partial) => patchProfile(partial as never),
    screenOf: (key) => {
      const n = chart.nodesNow().find((x) => x.canonicalKey === key && x.selectable);
      return n ? chart.worldToScreen(n.world.x, n.world.y) : null;
    },
    stack: () => useChart.getState().stack.map((e) => ({ sceneKey: e.sceneKey, label: e.label, selectedKey: e.selectedKey })),
    selected: () => useChart.getState().selectedKey,
    transitioning: () => chart.isTransitioning(),
    freezeAmbient: (s) => chart.freezeAmbient(s),
    hitCircles: () => chart.hitCirclesScreen(),
    liveNodes: () => chart.nodesNow(),
    session: () => {
      const st = useChart.getState();
      const pb = st.playback;
      return {
        status: pb?.status ?? 'none', rate: pb?.rate ?? 1, x: pb?.x ?? 0, totalMs: pb?.totalMs ?? 0, playheadUtc: playheadUtc(),
        stateUtc: pb?.stateUtc ?? null, beats: pb?.beats.length ?? 0, beatIndex: pb?.beatIndex ?? -1, lens: st.lens,
      };
    },
    setScheduleMs: (ms) => setScheduleMs(ms),
    stepBeat: () => step(),
    fx: () => ({ active: chart.counts().activeFx, trails: chart.trailCount() }),
    insignias: () => insigniaLog.map((e) => ({ id: e.id, lagMs: e.calledAt === null ? null : Math.round(e.litAt - e.calledAt) })),
    radar: () => chart.nodesNow().filter((n) => n.radar).map((n) => ({ key: n.canonicalKey, angle: n.radar!.angle, band: n.radar!.band, x: n.world.x, y: n.world.y })),
    beatTimes: () => scheduleOf()?.schedule.beats.map((b) => ({ index: b.index, sourceUtc: b.sourceUtc, startMs: b.presentationStartMs, accented: b.accented })) ?? [],
    volleys: () => volleysOf(chart),
    shots: () => shotsOf(),
    directedCamera: () => chart.directedCamera(),
    play: () => play(),
    pause: () => pause(),
    setRate: (r) => setRate(r as Rate),
    volatility: () => chart.volatility(),
    fxCensus: () => chart.fxCensus(),
    liveCommands: () => chart.liveCommands(),
    awards: () => currentAwards(),
    biasVolatility: (v) => chart.biasVolatility(v),
    heldEdges: () => chart.heldEdges(),
    glidingCount: () => chart.glidingCount(),
    targetNodes: () => chart.targetNodes(),
    follow: () => useChart.getState().follow,
    framing: () => useChart.getState().framing,
    setCamera: (state) => chart.setCameraForTest(state),
    setReduced: (on) => setReducedMotion(on),
    setActivity: (level) => setActivity(level),
    shownStages: () => chart.shownStages(),
    guides: () => chart.guidesShown(),
    viewAlphas: (pks) => chart.viewAlphas(pks),
    facings: (pks) => chart.facings(pks),
    annotations: () => chart.annotations(),
    viewTints: (pks) => chart.viewTints(pks),
    tenders: (pk) => chart.tenders(pk),
    auras: () => auraReadings(),
    showAuras: (parts) => showAuras(parts),
    hero: () => chart.heroState(),
    exploring: () => chart.isExploring,
    energy: () => chart.energyState(),
    motions: () => chart.motionState(),
    stream: () => useChart.getState().stream,
    showError: (message) => useChart.getState().set({ error: message, errorNet: null }),
    showFollowBar: (on) => useChart.getState().set({ follow: on ? { captain: 'cap:test' as never, callSign: 'Test Ship', suspended: true, text: 'opened a pull request', note: 'Following paused: you moved the camera' } : null }),
    forgetScopes: () => histories.clear(),
    frames: () => chart.frameStats(),
    reboot: () => reboot(),
    cameraHeld: () => chart.cameraHeld(),
    historyRange: () => useChart.getState().history?.range ?? null,
    displayed: () => chart.nodesNow().filter((n) => n.selectable).map((n) => ({ pk: n.projectionKey, ...chart.worldToScreen(n.world.x, n.world.y) })),
  };
}

/** The `volleys()` hook (27 E6): each volley's fused beat, members, and the drawn captains its turns name. */
function volleysOf(chart: ChartApp): { startMs: number; endMs: number; members: string[]; people: number; names: string[] }[] {
  const c = scheduleOf();
  const st = useChart.getState();
  const vs = c?.schedule.limelight?.direction?.volleys;
  if (!c || !vs?.size || !st.history || !st.graph) return [];
  const eventOf = (turnKey: string) => turnKey.slice(0, turnKey.lastIndexOf('|'));
  const captains = new Map(chart.targetNodes().filter((n) => n.kind === 'captain').map((n) => [n.canonicalKey as string, n.label]));
  const out: { startMs: number; endMs: number; members: string[]; people: number; names: string[] }[] = [];
  for (const v of vs.values()) {
    const members = v.members.map(eventOf);
    const beat = c.schedule.beats.find((b) => b.eventKeys.includes(members[0]!));
    if (!beat) continue;
    const plan = planBeat({ history: st.history, sceneKey: st.graph.sceneKey, beat, others: [], eng: ENGAGEMENT[st.activity], limelight: c.schedule.limelight! }) ?? [];
    const carrier = plan.find((m) => m.eventKey === members[0] && m.volley);
    const named = new Set(carrier?.volley?.turns.flatMap((t) => t.names.map((n) => n.key as string)) ?? []);
    const drawn = [...named].filter((k) => captains.has(k));
    out.push({ startMs: beat.presentationStartMs, endMs: beat.presentationStartMs + beat.durationMs, members, people: drawn.length, names: drawn.map((k) => captains.get(k)!).sort() });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * The `shots()` hook (27 E9): each climax and montage the director marked, at the beat holding its
 * event. `gatherMs` is the x at which the climax's gather begins (where its shot fires); `cast` the keys
 * of the shot's cast (the planned maneuver's roles), empty for a montage.
 */
function shotsOf(): { kind: 'climax' | 'montage'; index: number; startMs: number; endMs: number; gatherMs: number; cast: string[] }[] {
  const c = scheduleOf();
  const st = useChart.getState();
  const dir = c?.schedule.limelight?.direction;
  if (!c || !dir || !st.history || !st.graph) return [];
  const eventOf = (turnKey: string) => turnKey.slice(0, turnKey.lastIndexOf('|'));
  const turns: { kind: 'climax' | 'montage'; turnKey: string }[] = [
    ...[...dir.climaxes].map((turnKey) => ({ kind: 'climax' as const, turnKey })),
    ...[...dir.forms].filter(([, f]) => f === 'montage').map(([turnKey]) => ({ kind: 'montage' as const, turnKey })),
  ];
  const out: { kind: 'climax' | 'montage'; index: number; startMs: number; endMs: number; gatherMs: number; cast: string[] }[] = [];
  for (const t of turns) {
    const eventKey = eventOf(t.turnKey);
    const beat = c.schedule.beats.find((b) => b.eventKeys.includes(eventKey));
    if (!beat) continue;
    const plan = planBeat({ history: st.history, sceneKey: st.graph.sceneKey, beat, others: [], eng: ENGAGEMENT[st.activity], limelight: c.schedule.limelight! }) ?? [];
    const m = plan.find((x) => (t.kind === 'climax' ? x.climax : x.montage) && x.eventKey === eventKey) ?? plan.find((x) => (t.kind === 'climax' ? x.climax : x.montage));
    const gather = m?.phases.find((p) => p.phase === 'gather')?.atMs ?? 0;
    out.push({
      kind: t.kind, index: beat.index, startMs: beat.presentationStartMs, endMs: beat.presentationStartMs + beat.durationMs,
      gatherMs: beat.presentationStartMs + (m?.afterMs ?? 0) + gather,
      cast: t.kind === 'climax' ? [...new Set(plan.filter((x) => x.climax).flatMap((x) => Object.values(x.cast).flat() as string[]))] : [],
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
