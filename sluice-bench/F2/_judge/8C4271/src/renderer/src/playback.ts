// The playback session (05 §1–2) in the renderer: one PlaybackClock per loaded scope, advanced each
// frame. Crossing a beat re-projects the current scene at the new state and hands the beat's accents
// to the AnimationDirector. Seeks, date entry, event picks, and lens toggles never play accents.
// v1 (14 §1.4): play only where the scene plays (playGate.ts), and two hooks (playHooks.ts): a beat
// planner whose maneuvers replace the accents in the scenes it owns, and the recap's awards.
import { presented } from './v1/story';
import type { ScopeHistory } from '@shared/contracts/history';
import { RATES, type Beat, type Rate } from '@shared/contracts/playback';
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { Lens } from '@shared/contracts/view';
import { accentBeat, accentBeats, PlaybackClock, type Advance } from '@shared/playback/clock';
import { lightActions, planAccents } from '@shared/playback/plan';
import { ENGAGEMENT, type ActivityLevel } from '@shared/playback/engagement';
import { saveActivity } from './engagement';
import { buildBeatSchedule } from '@shared/playback/schedule';
import { buildHighlights, buildScene, sceneEntityKeys, touches } from '@shared/playback/highlights';
import { activeHierarchy } from './hierarchy';
import { activeProfile } from './profile';
import { LEAD_MS } from '@shared/playback/constants';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { LAYOUT_VERSION } from '@shared/limits';
import { projectScene, type ProjectOptions } from '@shared/scene/projectScene';
import type { CanonicalKey } from '@shared/contracts/keys';
import { setMotionRate } from './chart/art/motion';
import { signalOf } from './chart/art/progress';
import type { ChartApp } from './chart/ChartApp';
import { isAutomatic, refresh } from './nav';
import { playableHere } from './playGate';
import { beatAwards, planBeat, recapAwards } from './playHooks';
import type { PlannedAccent } from '@shared/playback/plan';
import type { PlannedManeuver } from '@shared/contracts/maneuver';
import { latestStoryAnchor, storyAnchors, storyOf, type StoryAnchor } from '@shared/playback/follow';
import { useChart, type PlaybackView } from './store';

/** "Local" for working hours (05 §3) is the viewer's own time zone. */
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
/** The UI's view of the session refreshes at about 12 Hz while playing (the ruler, the clock). */
const UI_EVERY_MS = 80;

let chart: ChartApp | null = null;
let clock: PlaybackClock | null = null;
let history: ScopeHistory | null = null;
/** True only after the user pressed Pause: effects hold in place. Step leaves effects running. */
let userPaused = false;
let sinceUi = 0;
/** The beat whose lead-in already played (05 §5), so it plays once. */
let toldIndex = -1;
/** The beat the camera already framed (frame-the-action), and the one following already travelled for. */
let framedIndex = -1;
let followedIndex = -1;
/** The beat the director's camera already pulled back for (27 E9), and the climax shot waiting for its gather. */
let directedIndex = -1;
let pendingShot: { atX: number; keys: Set<CanonicalKey> } | null = null;
/** Following travelled to a new scene just before a beat: hold the playhead until the move lands. */
let holding = false;
/** The scene the followed ship is in (where following began, or the app last travelled to). */
let followScene: string | null = null;

let unsubscribe: (() => void) | null = null;

let unwatchScene: (() => void) | null = null;

export function attachPlaybackChart(c: ChartApp | null): void {
  unsubscribe?.();
  unsubscribe = null;
  unwatchScene?.();
  unwatchScene = null;
  chart = c;
  if (!c) return;
  unsubscribe = c.onFrame(frame);
  // Highlights follow the view: entering another scene rebuilds its schedule at the same source time.
  unwatchScene = useChart.subscribe((s, prev) => {
    const moved = !!s.graph && s.graph.sceneKey !== prev.graph?.sceneKey;
    if (s.highlights && moved) rebuild();
    if (s.follow?.captain !== prev.follow?.captain) {
      chart?.setFollowed(s.follow?.captain ?? null);
      chart?.setHero(s.follow?.captain ?? null);
    }
    // The scene the followed ship is in: the app's own travel moves it; the user's own navigation
    // while playing suspends following (nav.ts); leaving it while nothing plays is abandoning the
    // journey, so following ends (decided 2026-10-04).
    if (s.follow && moved) {
      if (isAutomatic()) followScene = s.graph!.sceneKey;
      else if (s.playback?.status !== 'playing' && s.graph!.sceneKey !== followScene) unfollow();
    }
  });
}

/** The current scene's key, when it's a scene with a history (not the galaxy). */
function sceneKey(): string | null {
  const k = useChart.getState().graph?.sceneKey;
  return k && k !== 'galaxy' ? k : null;
}

/**
 * The schedule for what's on screen (05 §3, decided 2026-10-08): the scene's own events, so playback
 * never spends time on another pod's or Feature's work. Following keeps the captain's story within the
 * scene; H takes the scene's big moments. The galaxy has no scene to filter by.
 */
function scheduleFor(h: ScopeHistory, forScene?: string | null) {
  const st = useChart.getState();
  const hier = activeHierarchy();
  const scene = forScene === undefined ? sceneKey() : forScene;
  // Following plays the captain's story (decided 2026-10-04): only their events, gaps compressed.
  const captain = st.follow?.captain;
  const following = captain && h.entities.captains.some((c) => c.key === captain) ? storyOf(h, captain) : undefined;
  clockScene = scene ?? null;
  // All events (23 D1): no cap at all, so the budget cuts no accent (and squeezes no gap).
  const pacing = activeProfile().pacing;
  const budget = { budgetMs: st.allEvents && !st.highlights ? Infinity : pacing.budgetMs };
  if (!scene) return buildBeatSchedule(h, h.range, TZ, { ...(following ? { include: following } : {}), hier, ...budget });
  if (st.highlights) return buildHighlights(h, h.range, TZ, scene as never, hier, pacing.highlightBudgetMs);
  return buildScene(h, h.range, TZ, scene as never, hier, following, st.allEvents ? Infinity : pacing.budgetMs);
}

/**
 * The scene on screen is about to change (decided 2026-10-08): build that scene's own schedule and
 * hold it at the end, so it opens on its outcome — what ADO would show for the scope now. Quiet: the
 * caller draws the new scene itself, which is why this never re-projects (doing that from the store
 * subscriber cancelled the navigation's own transition).
 */
export function sceneChanged(scene: string | null): void {
  if (!clock || !history) return;
  const prev = clock;
  clock = new PlaybackClock(scheduleFor(history, scene));
  clock.setRate(prev.rate);
  clock.seek(clock.totalMs);
  clock.status = 'ended';
  toldIndex = -1;
  framedIndex = -1;
  followedIndex = -1;
  directedIndex = -1;
  pendingShot = null;
  holding = false;
  chart?.clearAccents();
  publish();
}

/** Swap the schedule (highlights on or off, or a new scene) keeping the source time, rate, and status. */
function rebuild(): void {
  if (!clock || !history) return;
  const ruler = clock.rulerUtc();
  const prev = clock;
  clock = new PlaybackClock(scheduleFor(history));
  clock.setRate(prev.rate);
  if (prev.status === 'ended') {
    clock.seek(clock.totalMs);
    clock.status = 'ended';
  } else {
    clock.seekToSource(ruler);
    if (prev.status === 'playing') clock.play();
  }
  toldIndex = -1;
  framedIndex = -1;
  followedIndex = -1;
  directedIndex = -1;
  pendingShot = null;
  holding = false;
  chart?.clearAccents();
  publish();
  refresh();
}

/** All events (23 D1): every beat accented, for this session. Re-schedules from the playhead, as Highlights does. */
export function setAllEvents(on: boolean): void {
  useChart.getState().set({ allEvents: on });
  rebuild();
}

/** Highlights (05 §3): play only what touches this view. A toggle, not a mode you're put into. */
export function setHighlights(on: boolean): void {
  useChart.getState().set({ highlights: on });
  rebuild();
}

/**
 * A scope's history loaded: build its schedule. The first one starts at the end of the range (the
 * final state held, as before playback existed); later ones keep the playhead's source time.
 */
export function attachHistory(raw: ScopeHistory, opts: { reschedule?: boolean } = {}): void {
  const h = presented(raw); // story time under Solar (05 §8.3a)
  if (h === history) return;
  // A streamed bundle while its history gathers (decided 2026-10-08): the newer facts, the same
  // schedule. Rebuilt once the scene's history is in, not on every batch.
  if (opts.reschedule === false && clock && history) {
    history = h;
    anchorCache = null;
    publish();
    return;
  }
  const prevRuler = clock?.rulerUtc();
  const prev = clock;
  history = h;
  clock = new PlaybackClock(scheduleFor(h));
  directedIndex = -1;
  pendingShot = null;
  if (prev) {
    clock.setRate(prev.rate);
    // At the end (the scene's own state) it stays there: a reload mid-stream must not lose it.
    if (prev.status === 'ended') { clock.seek(clock.totalMs); clock.status = 'ended'; }
    else { clock.seekToSource(prevRuler!); if (prev.status === 'playing') clock.play(); }
  } else {
    clock.seek(clock.totalMs);
    clock.status = 'ended';
  }
  publish();
}

/** Forget the session (a mode switch, a new connection, or Purge): the next scope starts fresh. */
export function detachHistory(): void {
  clock?.pause();
  clock = null;
  history = null;
  anchorCache = null;
  lastStatus = null;
  useChart.getState().set({ playback: null, follow: null });
}

function view(c: PlaybackClock): PlaybackView {
  const beats = c.schedule.beats;
  let beatIndex = -1;
  for (const b of beats) {
    if (b.presentationStartMs > c.x) break;
    beatIndex = b.index;
  }
  return {
    x: c.x, totalMs: c.totalMs, status: c.status, rate: c.rate, rulerUtc: c.rulerUtc(), stateUtc: c.stateUtc(),
    remainingMs: c.remainingMs(), beats, beatIndex,
  };
}

/** The status last published, to switch the panel's tab when playback starts or ends. */
let lastStatus: string | null = null;

function publish(): void {
  if (!clock) return;
  const st = useChart.getState();
  if (clock.status !== lastStatus) {
    if (clock.status === 'playing') {
      st.set({ panelTab: 'history' }); // playing tells its history
      if (st.follow) chart?.heroWarmup(); // the hero ship's dramatic warmup as play starts
    } else {
      if (clock.status === 'ended' && lastStatus === 'playing') st.set({ panelTab: st.panelChoice }); // the end: back to the user's pick
      // Stopped away from the followed ship's scene: the user has wandered off, so following ends.
      if (st.follow && st.graph && followScene && st.graph.sceneKey !== followScene) unfollow();
    }
    lastStatus = clock.status;
  }
  useChart.getState().set({ playback: view(clock) });
  setMotionRate(clock.pace(), clock.status === 'playing', useChart.getState().reducedMotion);
}

function frame(dtMs: number): void {
  if (!clock || !chart) return;
  if (holding) {
    if (chart.isTransitioning()) return; // the beat waits for the camera to arrive
    holding = false;
  }
  if (followGate(dtMs)) return;
  const before = clock.x;
  const wasPlaying = clock.status === 'playing';
  const rulerBefore = clock.rulerUtc();
  const adv = clock.advance(dtMs);
  chart.notePlayback(clock.x - before, userPaused);
  if (adv.crossed.length) applyBeats(adv);
  fireShot();
  if (clock.status === 'playing') {
    const turn = dayTurnAt(clock);
    if (turn) {
      // A day turn's breather (22 C6, B-17): once, as the turn's gap begins, spotlighting the captain
      // limelight chose for that day, named only until the day's first beat starts.
      dawnIndex = turn.index;
      chart.dawn(clock.schedule.limelight?.spotlights.get(turn.index) ?? null, (turn.presentationStartMs - clock.x) / 1000);
    } else if (!clock.schedule.beats.some((b) => b.opensDay) && crossedDawn(rulerBefore, clock.rulerUtc())) chart.dawn(null, 0); // no day turns: the ruler's dawn
    leadIn();
  }
  if (wasPlaying && clock.status === 'ended') recap();
  sinceUi += dtMs;
  const statusChanged = useChart.getState().playback?.status !== clock.status;
  if (adv.crossed.length || statusChanged || (clock.status === 'playing' && sinceUi >= UI_EVERY_MS)) {
    sinceUi = 0;
    publish();
  }
}

/** State changed by crossing beats: re-project, then play the latest accented beat's accents. */
function applyBeats(adv: Advance): void {
  if (!clock || !chart || !history) return;
  const st = useChart.getState();
  const prevGraph = st.graph;
  const prevNodes = chart.nodesNow();
  useChart.getState().set({ playback: view(clock) });
  const r = refresh('beat'); // objects glide to their new places (05 §5 continuity)
  const beat = accentBeat(adv);
  const accents = accentBeats(adv); // a solar region plays every one (22 C9, B-19)
  // Beats whose accents the budget cut, or that shared a frame with a later accented one, still get their
  // ships' actions (Activity, 05 §5): those run in parallel and cost the schedule nothing.
  const eng = ENGAGEMENT[st.activity];
  const others = adv.seeked || !eng.lightActions ? [] : adv.crossed.filter((b) => b !== beat);
  if ((!beat && !others.length) || !r || !prevGraph || !r.snapshot || prevGraph.sceneKey !== r.after.sceneKey) return;
  const lens = st.lens;
  // A scene the v1 planner owns plays its maneuvers instead of the v0 accents (14 §3 step 8).
  const maneuvers = planBeat({ history, sceneKey: r.after.sceneKey, beat: beat ?? null, others, accents, eng, ...(clock.schedule.limelight ? { limelight: clock.schedule.limelight } : {}) });
  const plan: PlannedAccent[] = maneuvers ? [] : [
    ...(beat ? planAccents(history, beat, snapshotAt(history, beat.firstUtc - 1, lens), r.snapshot, eng) : []),
    ...lightActions(history, others, r.snapshot, eng),
  ];
  if (!plan.length && !maneuvers?.length) return;
  chart.playBeat({ plan, ...(maneuvers ? { maneuvers } : {}), eng, history, snapshot: r.snapshot, before: { graph: prevGraph, nodes: prevNodes }, after: r.after });
  if (beat) {
    if (!adv.seeked) planShot(beat, maneuvers);
    if (!directBeat(beat, maneuvers)) frameBeat(beat, keysOf(plan, maneuvers));
    followBeat(keysOf(plan, maneuvers));
    // The viewer's insignia for an award each beat that played earns, on their own ship (18 §3).
    if (maneuvers) chart.insignia(accents.flatMap((b) => beatAwards(history!, r.after.sceneKey, b)));
  }
}

/**
 * What a beat's camera looks at: the v0 accents' objects, or the maneuvers' `keys` (14 §2.7), in
 * plan order without repeats.
 */
function keysOf(plan: PlannedAccent[], maneuvers: PlannedManeuver[] | null): CanonicalKey[] {
  const keys = maneuvers ? maneuvers.flatMap((m) => m.keys) : plan.flatMap((a) => [a.entityKey, a.prKey, a.itemKey]);
  return [...new Set(keys.filter((k): k is CanonicalKey => !!k))];
}

/**
 * The follow camera (05 §6): each beat adds its work to the captain's working set in this Feature,
 * and the camera widens to hold it (ChartApp.followFrame has the principles). Called at the lead-in
 * and again as the beat lands; the second call is usually a no-op.
 */
function followBeat(focus: CanonicalKey[]): void {
  const f = useChart.getState().follow;
  if (!chart || !clock || !f || f.suspended) return;
  chart.followFrame(f.captain, focus);
}

/**
 * Frame the action (slice 3b, on while playing): a High beat whose objects are off-screen pans the
 * camera (or zooms out) to bring them in, as its lead-in begins, so the act lands in view.
 */
function frameBeat(beat: Beat, focus: CanonicalKey[]): void {
  if (!chart || !clock || beat.index === framedIndex || beat.priority !== 'high') return;
  if (useChart.getState().framing !== 'on' || clock.status !== 'playing') return;
  if (useChart.getState().follow && !useChart.getState().follow!.suspended) return; // the follow camera has it
  framedIndex = beat.index;
  chart.frameAction(new Set(focus));
}

/**
 * Whether the directed camera may move now (27 E9, 05 §6): the scene has a director, playing (a step
 * leaves the clock paused), framing on, nobody following, and reduced motion off.
 */
function directs(): boolean {
  if (!clock || !chart || clock.status !== 'playing' || !clock.schedule.limelight?.direction) return false;
  const st = useChart.getState();
  if (st.framing !== 'on' || st.reducedMotion) return false;
  return !(st.follow && !st.follow.suspended);
}

/** A beat that plays a climax sets a shot to fire as its gather begins (27 E9). */
function planShot(beat: Beat, maneuvers: PlannedManeuver[] | null): void {
  const climaxes = maneuvers?.filter((m) => m.climax) ?? [];
  if (!climaxes.length || !directs()) return;
  const gatherAt = (m: PlannedManeuver) => m.phases.find((p) => p.phase === 'gather')?.atMs ?? 0;
  pendingShot = {
    atX: Math.min(...climaxes.map((m) => beat.presentationStartMs + m.afterMs + gatherAt(m))),
    keys: new Set(climaxes.flatMap((m) => Object.values(m.cast).flat() as CanonicalKey[])),
  };
}

/** The climax shot, once the playhead reaches its gather (conditions re-checked). */
function fireShot(): void {
  if (!pendingShot || !clock || !chart || clock.x < pendingShot.atX) return;
  const shot = pendingShot;
  pendingShot = null;
  if (directs()) chart.directClimax(shot.keys);
}

/**
 * The director's camera for a beat (27 E9): a climax is shot from its gather (planShot), and the board
 * comes back at a montage and at the first beat after a climax shot that still holds. Once per beat.
 * Returns whether the director handles the beat, so frame-the-action skips it.
 */
function directBeat(beat: Beat, maneuvers: PlannedManeuver[] | null): boolean {
  if (!chart || !directs()) return false;
  if (maneuvers?.some((m) => m.climax)) return true;
  if (beat.index === directedIndex) return true;
  if (maneuvers?.some((m) => m.montage) || chart.directedShot() === 'climax') {
    directedIndex = beat.index;
    chart.directBoard();
    return true;
  }
  return false;
}

// --- Following a captain (05 §6) ------------------------------------------------------------------

let anchorCache: { history: ScopeHistory; captain: CanonicalKey; lens: string; list: StoryAnchor[] } | null = null;
function anchors(): StoryAnchor[] {
  const st = useChart.getState();
  if (!history || !st.follow) return [];
  if (!anchorCache || anchorCache.history !== history || anchorCache.captain !== st.follow.captain || anchorCache.lens !== st.lens) {
    anchorCache = { history, captain: st.follow.captain, lens: st.lens, list: storyAnchors(history, st.follow.captain, st.lens, activeHierarchy()) };
  }
  return anchorCache.list;
}

/**
 * Go to an anchor's stage, the Feature system that holds the captain's work (close-ups stay opt-in),
 * as the app's own move (never suspends following). Returns whether the scene changed.
 */
function travel(a: StoryAnchor): boolean {
  const st = useChart.getState();
  const f = st.follow;
  if (!f || !history) return false;
  if (a.outside) {
    st.set({ follow: { ...f, note: `Next recorded event for ${f.callSign} is outside this view` } });
    return false;
  }
  // Following stays in the scene on screen (decided 2026-10-08): work elsewhere gets the note, and the
  // camera stays. Only this scene's history is loaded, so there's nowhere to travel to.
  const inScene = st.graph ? sceneEntityKeys(history, st.graph.sceneKey, activeHierarchy()) : null;
  if (inScene && a.item && !inScene.has(a.item)) {
    st.set({ follow: { ...f, note: `Next recorded event for ${f.callSign} is outside this view` } });
    return false;
  }
  st.set({ follow: { ...f, text: a.text, note: null } });
  return false;
}

/**
 * While following and playing: when the next beat holds one of the captain's anchors, stop the
 * playhead just before it, travel to its scene (the usual zoom transition), and let the beat land
 * there once the camera arrives. Returns true when this frame was spent on that.
 */
function followGate(dtMs: number): boolean {
  if (!clock || clock.status !== 'playing') return false;
  const f = useChart.getState().follow;
  if (!f || f.suspended) return false;
  const reach = clock.x + Math.min(dtMs, 100) * clock.pace();
  const list = anchors();
  if (!list.length) return false;
  const byEvent = new Map(list.map((a) => [a.eventKey, a]));
  const next = clock.schedule.beats.find((b) => b.presentationStartMs > clock!.x && b.presentationStartMs <= reach && b.index !== followedIndex && b.eventKeys.some((k) => byEvent.has(k)));
  if (!next) return false;
  followedIndex = next.index;
  const a = [...next.eventKeys].reverse().map((k) => byEvent.get(k)).find(Boolean)!;
  // Up to just before the beat, then the move; the beat itself lands in the new scene.
  const to = next.presentationStartMs - 1;
  if (to > clock.x) {
    const adv = clock.advance((to - clock.x) / clock.pace());
    if (adv.crossed.length) applyBeats(adv);
  }
  if (travel(a)) holding = true;
  publish();
  return true;
}

/** Follow a captain: clicking their ship, Follow on their card, or Go on their jump trail. */
export function follow(captain: CanonicalKey): void {
  const st = useChart.getState();
  const c = history?.entities.captains.find((x) => x.key === captain);
  if (!c) return;
  if (st.follow?.captain === captain && !st.follow.suspended) return;
  const switching = st.follow?.captain !== captain;
  followedIndex = -1;
  followScene = st.graph?.sceneKey ?? null;
  st.set({ follow: { captain, callSign: c.callSign, suspended: false, text: null, note: null } });
  if (switching) rebuild(); // the captain's story becomes the schedule, at the same source time
  if (clock?.status === 'playing') chart?.heroWarmup(); // following while playing: the hero's entrance
}

export function unfollow(): void {
  if (!useChart.getState().follow) return;
  useChart.getState().set({ follow: null });
  rebuild(); // back to everyone's story, at the same source time
}

/** A manual pan, zoom, breadcrumb, or search: following waits for Resume Follow. */
export function suspendFollow(): void {
  const f = useChart.getState().follow;
  if (f && !f.suspended) useChart.getState().set({ follow: { ...f, suspended: true } });
}

/** Resume Follow: back to the latest anchor at or before the playhead, with no replay. */
export function resumeFollow(): void {
  const st = useChart.getState();
  if (!st.follow) return;
  st.set({ follow: { ...st.follow, suspended: false } });
  recenter();
  chart?.followFrame(st.follow.captain, [], true);
}

/** Recenter once on the latest anchor at or before the playhead (resume, or a seek while following). */
function recenter(): void {
  if (!clock) return;
  const a = latestStoryAnchor(anchors(), clock.stateUtc());
  if (a) travel(a);
}

/** A manual pan or zoom suspends framing; Z, or playing again, brings it back. */
export function suspendFraming(): void {
  if (useChart.getState().framing === 'on') useChart.getState().set({ framing: 'suspended' });
}

/** Z: off → on, suspended → on, on → off. */
export function toggleFraming(): void {
  const st = useChart.getState();
  st.set({ framing: st.framing === 'on' ? 'off' : 'on' });
}

/**
 * The lead-in (05 §5): while playing, as the playhead nears an accented beat, its actors wind up in
 * the gap before it. Never on a seek or a step: those jump straight to the beat.
 */
function leadIn(): void {
  if (!clock || !chart || !history) return;
  const beats = clock.schedule.beats;
  const next = beats.find((b) => b.presentationStartMs > clock!.x && b.accented);
  if (!next || next.index === toldIndex) return;
  const prev = [...beats].reverse().find((b) => b.accented && b.presentationStartMs < next.presentationStartMs);
  const gap = next.presentationStartMs - (prev ? prev.presentationStartMs + prev.durationMs : 0);
  const lead = Math.max(0, Math.min(LEAD_MS, gap));
  if (lead <= 0 || next.presentationStartMs - clock.x > lead) return;
  toldIndex = next.index;
  const st = useChart.getState();
  const graph = st.graph;
  if (!graph || graph.sceneKey === 'galaxy') return;
  const lens = st.lens;
  const snap = snapshotAt(history, next.sourceUtc, lens);
  const after = projectScene(history, snap, graph.sceneKey, LAYOUT_VERSION, activeHierarchy(), projectOptions(graph.sceneKey));
  const eng = ENGAGEMENT[st.activity];
  // The next beat's maneuvers, planned as it will play them, so its subjects glow before the act.
  const maneuvers = planBeat({ history, sceneKey: graph.sceneKey, beat: next, others: [], eng, ...(clock.schedule.limelight ? { limelight: clock.schedule.limelight } : {}) });
  const plan = maneuvers ? [] : planAccents(history, next, snapshotAt(history, next.firstUtc - 1, lens), snap, eng);
  chart.tellBeat({ plan, ...(maneuvers ? { maneuvers } : {}), eng, history, snapshot: snap, before: { graph, nodes: chart.nodesNow() }, after }, next.index, (next.presentationStartMs - clock.x) / 1000);
  if (!directBeat(next, maneuvers)) frameBeat(next, keysOf(plan, maneuvers));
  followBeat(keysOf(plan, maneuvers)); // the follow camera moves before the act
}

/** The day turn whose breather hasn't played yet (22 C5, C6): its beat, once the playhead is inside its gap. */
let dawnIndex = -1;
function dayTurnAt(c: PlaybackClock): Beat | null {
  const beats = c.schedule.beats;
  const next = beats.find((b) => b.durationMs > 0 && b.presentationStartMs > c.x);
  if (!next?.opensDay || next.index === dawnIndex) return null;
  const prev = [...beats].reverse().find((b) => b.durationMs > 0 && b.presentationStartMs < next.presentationStartMs);
  return c.x >= (prev ? prev.presentationStartMs + prev.durationMs : 0) ? next : null;
}

/** Whether the ruler passed 07:00 local (a compressed night ending) between two source times (schedules without day turns). */
function crossedDawn(a: number, b: number): boolean {
  if (b <= a) return false;
  const d = new Date(b);
  d.setHours(7, 0, 0, 0);
  if (d.getTime() > b) d.setDate(d.getDate() - 1);
  return d.getTime() > a;
}

/** The recap bloom (06 §5): what reached Accomplished in the range, in the order it got there. */
function recap(): void {
  if (!clock || !chart || !history) return;
  pendingShot = null;
  const here = useChart.getState();
  const following = !!here.follow && !here.follow.suspended;
  if (chart.directedShot() === 'climax' && here.framing === 'on' && !following && !here.reducedMotion) chart.directBoard(); // the finale isn't zoomed (27 E9)
  const lens = useChart.getState().lens;
  const start = snapshotAt(history, history.range.startUtc - 1, lens);
  const end = snapshotAt(history, clock.stateUtc(), lens);
  const done = (stage: string | undefined) => signalOf(stage ?? '').rung === 'accomplished';
  const at = new Map<CanonicalKey, number>();
  for (const e of history.events) {
    if (e.occurredAt < history.range.startUtc) continue;
    if (e.kind === 'wi_state_changed' || e.kind === 'pr_completed') at.set(e.entityKey, e.occurredAt);
  }
  // The scene's own accomplishments (decided 2026-10-08), as its playback was.
  const scene = sceneKey();
  const inScene = scene ? sceneEntityKeys(history, scene as never, activeHierarchy()) : null;
  const keys: CanonicalKey[] = [];
  const mine = (k: CanonicalKey) => at.has(k) && (!inScene || inScene.has(k));
  for (const [k, w] of end.workItems) if (done(w.stage) && !done(start.workItems.get(k)?.stage) && mine(k)) keys.push(k);
  for (const [k, p] of end.prs) if (p.status === 'completed' && start.prs.get(k)?.status !== 'completed' && mine(k)) keys.push(k);
  keys.sort((x, y) => at.get(x)! - at.get(y)!);
  // The viewer's awards close the recap (18 §3), on their own ship; none outside v1.
  const awards = scene ? recapAwards(history, scene) : [];
  // Playback reached the end of a round that's over (2026-10-13): the theme's finale plays, not the
  // bloom. An open sprint (today before its finish, or a history that stops short of it) keeps the
  // bloom; there's no end to celebrate yet.
  const sector = history.scope.sector;
  const finale = sector.kind === 'sprint' && sector.finishUtc <= Date.now() && history.range.endUtc >= sector.finishUtc;
  const opts = finale ? { finale } : undefined;
  // Following: the captain's own recap, only what their story touched.
  const f = useChart.getState().follow;
  if (f) {
    const inStory = storyOf(history, f.captain);
    const theirs = new Set((history.events as AnyTimelineEvent[]).filter((e) => e.occurredAt >= history!.range.startUtc && inStory(e)).map((e) => e.entityKey));
    chart.recap(keys.filter((k) => theirs.has(k)), awards, opts);
    return;
  }
  chart.recap(keys, awards, opts);
}

/** Jump without accents (INV-15): cancel every effect, then show the new state. */
function afterSeek(): void {
  toldIndex = -1;
  dawnIndex = -1;
  framedIndex = -1;
  followedIndex = -1;
  directedIndex = -1;
  pendingShot = null;
  holding = false;
  chart?.clearAccents();
  publish();
  refresh();
  chart?.directSeek(); // a director's shot that still holds lands on the fitted board (27 E9, R-1)
  const f = useChart.getState().follow;
  if (f && !f.suspended) recenter(); // a seek while following recenters once (05 §6)
}

export function play(): void {
  if (!clock || !playableHere()) return; // the round, or a gated galaxy: open a region to play (13 §2)
  if (clock.status === 'ended' || clock.x >= clock.totalMs) {
    clock.seek(0);
    afterSeek();
  }
  // From the very start (inside the opening orientation, before the first beat), what's already in
  // the scene makes its entrance (2026-10-13).
  const fromStart = clock.x <= 1 || (clock.schedule.beats[0] !== undefined && clock.x < Math.min(300, clock.schedule.beats[0].presentationStartMs));
  userPaused = false;
  clock.play();
  if (fromStart) chart?.opening();
  if (useChart.getState().framing === 'suspended') useChart.getState().set({ framing: 'on' }); // playing again reframes
  // Following: ease to the hero ship as play starts, its current work in frame.
  const f = useChart.getState().follow;
  if (f && !f.suspended) chart?.followFrame(f.captain, [], true);
  publish();
}

export function pause(): void {
  if (!clock) return;
  userPaused = true;
  clock.pause();
  publish();
}

export function togglePlay(): void {
  if (!playableHere()) return;
  if (clock?.status === 'playing') pause();
  else play();
}

/** Step ▶︎: the next beat plays its accents once, then playback pauses (effects keep running). */
export function step(): void {
  if (!clock || !playableHere()) return;
  userPaused = false;
  const adv = clock.step();
  if (adv.crossed.length) applyBeats(adv);
  publish();
}

/** ← : back to the start of the current beat, or the one before if already there (a seek: no accents). */
export function prevBeat(): void {
  if (!clock || !playableHere()) return;
  const b = [...clock.schedule.beats].reverse().find((x) => x.presentationStartMs < clock!.x - 1);
  seek(b ? b.presentationStartMs : 0);
}

/** The High beats that touch the current scene (in-view ticks, Shift ← / →). */
export function inViewHigh(): Set<number> {
  const out = new Set<number>();
  if (!clock || !history) return out;
  const scene = sceneKey();
  const keys = scene ? sceneEntityKeys(history, scene as never, activeHierarchy()) : null;
  const byKey = eventsByKey(history);
  for (const b of clock.schedule.beats) {
    if (b.priority === 'high' && b.accented && b.eventKeys.some((k) => { const e = byKey.get(k); return e ? touches(e, keys) : false; })) out.add(b.index);
  }
  return out;
}

/** Shift → : skip to the next High beat in this view and play it (beats on the way apply silently). */
export function nextInView(): void {
  if (!clock || !playableHere()) return;
  const ids = inViewHigh();
  const target = clock.schedule.beats.find((b) => ids.has(b.index) && b.presentationStartMs > clock!.x);
  if (!target) return;
  userPaused = false;
  const adv = clock.stepTo(target);
  if (adv.crossed.length) applyBeats(adv);
  publish();
}

/** Shift ← : back to the previous High beat in this view (a seek). */
export function prevInView(): void {
  if (!clock || !playableHere()) return;
  const ids = inViewHigh();
  const target = [...clock.schedule.beats].reverse().find((b) => ids.has(b.index) && b.presentationStartMs < clock!.x - 1);
  if (target) seekToBeat(target);
}

export function toStart(): void {
  seek(0);
}

export function toEnd(): void {
  if (!clock) return;
  seek(clock.totalMs);
  clock.status = 'ended';
  publish();
}

/** [ and ] : one rate slower or faster. */
export function nudgeRate(dir: -1 | 1): void {
  if (!clock) return;
  const i = RATES.indexOf(clock.rate);
  setRate(RATES[Math.max(0, Math.min(RATES.length - 1, i + dir))]!);
}

const eventIndex = new WeakMap<ScopeHistory, Map<string, AnyTimelineEvent>>();
function eventsByKey(h: ScopeHistory): Map<string, AnyTimelineEvent> {
  let m = eventIndex.get(h);
  if (!m) {
    m = new Map((h.events as AnyTimelineEvent[]).map((e) => [e.eventKey, e]));
    eventIndex.set(h, m);
  }
  return m;
}

export function seek(x: number): void {
  clock?.seek(x);
  afterSeek();
}

export function seekToSource(t: number): void {
  clock?.seekToSource(t);
  afterSeek();
}

export function seekToBeat(beat: Beat): void {
  clock?.seekToBeat(beat);
  afterSeek();
}

export function setRate(rate: Rate): void {
  clock?.setRate(rate);
  publish();
}

export function setLens(lens: Lens): void {
  useChart.getState().set({ lens });
  afterSeek(); // a lens toggle is never an event: no accents
}

/** E, or a tab click: the user's own pick of the panel's top box. */
export function choosePanel(tab: 'inView' | 'history'): void {
  useChart.getState().set({ panelTab: tab, panelChoice: tab });
}

export function toggleEvents(): void {
  choosePanel(useChart.getState().panelTab === 'history' ? 'inView' : 'history');
}

/** How much the ships do (05 §5). Takes effect from the next beat; remembered between runs. */
export function setActivity(level: ActivityLevel): void {
  useChart.getState().set({ activity: level });
  saveActivity(level);
  publish();
}

export function setReducedMotion(on: boolean): void {
  useChart.getState().set({ reducedMotion: on });
  publish();
}

/** Test hook (03 §10): put the schedule at x, like a seek. */
export function setScheduleMs(x: number): void {
  seek(x);
}

export function scheduleOf(): PlaybackClock | null {
  return clock;
}

/** The scene the clock's schedule plays (set as each schedule is built). */
let clockScene: string | null = null;

/**
 * What a projection of `scene` takes from its schedule (22 C8): when each guest is in the region, so a
 * seek draws them exactly where playing does. Nothing for a scene the clock isn't playing.
 */
export function projectOptions(scene: string): ProjectOptions {
  const guests = clock && clockScene === scene ? clock.schedule.guests : undefined;
  return guests ? { guests } : {};
}

/** The source time on the ruler, for the session hook. */
export function playheadUtc(): number | null {
  return clock?.rulerUtc() ?? null;
}

