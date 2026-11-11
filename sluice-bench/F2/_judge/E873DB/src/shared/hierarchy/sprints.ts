// The Sprints hierarchy (decided 2026-10-07): how a team that plans by sprint actually works. A sprint
// (the sector) → its pods, the saved Area Paths, as stars → the Stories and Bugs each pod took into the
// sprint as planets and anomalies → their Tasks on the radar. The sprint's dates are the playback range,
// and its whole history loads with it. A pod isn't a work item: its star shows the sprint's progress on
// the signal ladder (09). Pure.
import type { AnyTimelineEvent } from '../contracts/events';
import type { ScopeHistory, SprintPod, SprintSector } from '../contracts/history';
import type { CanonicalKey } from '../contracts/keys';
import type { Snapshot, ViewNode, WorkItemState } from '../contracts/view';
import { MAX_CHILDREN_PER_FEATURE } from '../limits';
import { firstJoinOrder } from '../scene/layout';
import { artSeed, workNode, type ProjectCtx } from '../scene/project/ctx';
import { bodySource, subtreeInto, subtreeKeys, taskKeys } from './backlog';
import { chain } from './chain';
import type { FieldSource, Hierarchy, LevelDef, SystemSource } from './types';
import { underPath } from '../paths';

const under = underPath;

/** The bundle's sprint, or null outside one. */
export function sprintOf(h: ScopeHistory): SprintSector | null {
  return h.scope.sector.kind === 'sprint' ? h.scope.sector : null;
}

const podByKey = (h: ScopeHistory, key: CanonicalKey): SprintPod | undefined => sprintOf(h)?.pods.find((p) => p.areaKey === key);

/** Whether an item counts in a pod at the playhead: a Story or Bug, in the sprint now (or one of its child iterations, slice 7), its area under the pod. */
function inPodNow(wi: WorkItemState | undefined, sprint: SprintSector, pod: SprintPod): wi is WorkItemState {
  return !!wi && (wi.kind === 'story' || wi.kind === 'bug') && wi.category !== 'Removed' && under(wi.iterationPath ?? '', sprint.path) && under(wi.areaPath, pod.path);
}

/** The pod that holds an item at the playhead (a Task goes by its Story or Bug). */
function podOf(s: Snapshot, h: ScopeHistory, key: CanonicalKey): { pod: SprintPod; body: CanonicalKey } | null {
  const sprint = sprintOf(h);
  let wi = s.workItems.get(key);
  if (!sprint || !wi) return null;
  if (wi.kind === 'task' && wi.parentKey) wi = s.workItems.get(wi.parentKey);
  if (!wi || (wi.kind !== 'story' && wi.kind !== 'bug')) return null;
  const pod = sprint.pods.find((p) => under(wi!.areaPath, p.path));
  return pod ? { pod, body: wi.key } : null;
}

/**
 * Every Story and Bug that was ever in the sprint and ever in the pod, in the order they first joined
 * the sprint (INV-14: slots never move on a seek). Carry-overs keep their slot and leave it.
 */
function podOrder(h: ScopeHistory, pod: SprintPod): CanonicalKey[] {
  const sprint = sprintOf(h);
  if (!sprint) return [];
  const everInPod = new Set<CanonicalKey>();
  for (const e of h.events as AnyTimelineEvent[]) {
    const area = e.kind === 'wi_created' ? e.payload.areaPath : e.kind === 'wi_area_changed' ? e.payload.to : null;
    if (area !== null && under(area, pod.path)) everInPod.add(e.entityKey);
  }
  const bodyType = (t: string) => t === 'User Story' || t === 'Bug';
  const types = new Map(h.entities.workItems.map((w) => [w.key, w.type]));
  // Items known only from the current state (the first look, decided 2026-10-08) join at their creation.
  const hist = new Set(h.coverage.history ?? []);
  const seeded: [CanonicalKey, number][] = (h.current?.workItems ?? [])
    .filter((w) => !hist.has(w.key) && bodyType(w.type) && under(w.iterationPath ?? '', sprint.path) && under(w.areaPath, pod.path))
    .map((w) => [w.key, w.createdAt]);
  return firstJoinOrder(h, (e) => {
    if (!everInPod.has(e.entityKey) || !bodyType(types.get(e.entityKey) ?? '')) return null;
    if (e.kind === 'wi_created' && under(e.payload.iterationPath ?? '', sprint.path)) return e.entityKey;
    if (e.kind === 'wi_iteration_changed' && under(e.payload.to, sprint.path)) return e.entityKey;
    return null;
  }, seeded).slice(0, MAX_CHILDREN_PER_FEATURE);
}

/**
 * A pod's star on the signal ladder (09; decided 2026-10-07): its sprint's progress, from its members
 * at the playhead. All done: Accomplished. Three quarters resolved or done: Nearing. Anything under
 * way: Underway. Otherwise Ready; an empty pod is a faint sketch. Mapped onto the Feature stages so
 * the star art reads it unchanged.
 */
export function podStage(members: readonly WorkItemState[]): string {
  const live = members.filter((m) => m.category !== 'Removed');
  if (!live.length) return 'feature.faint';
  const done = live.filter((m) => m.category === 'Completed').length;
  const near = done + live.filter((m) => m.category === 'Resolved' || m.rawState === 'Resolved' || m.rawState === 'Ready to Accept').length;
  if (done === live.length) return 'feature.whiteDwarf';
  if (near / live.length >= 0.75) return 'feature.accept';
  if (near > 0 || live.some((m) => m.category === 'InProgress')) return 'feature.active';
  return 'feature.ready';
}

/** A pod's star: its label, its progress as a stage, and a count of what it holds now. */
function podNode(ctx: ProjectCtx, podKey: CanonicalKey, pk: string): ViewNode | null {
  const sprint = sprintOf(ctx.h);
  const pod = podByKey(ctx.h, podKey);
  if (!sprint || !pod) return null;
  const members = podOrder(ctx.h, pod).map((k) => ctx.s.workItems.get(k)).filter((w): w is WorkItemState => inPodNow(w, sprint, pod));
  const done = members.filter((m) => m.category === 'Completed').length;
  return {
    projectionKey: pk, canonicalKey: podKey, kind: 'star', world: { x: 0, y: 0, r: 0 },
    stage: podStage(members), seed: artSeed(podKey), label: pod.label,
    meta: `Area Path · ${members.length} item${members.length === 1 ? '' : 's'}${members.length ? ` · ${done} done` : ''}`,
    typeName: 'Area Path', openable: false, selectable: true, labelled: true, flags: {}, evidence: [],
  };
}

/** A member's planet or anomaly, when it's in the pod now; its Feature leads its label line. */
function memberNode(ctx: ProjectCtx, podKey: CanonicalKey, key: CanonicalKey, pk: string): ViewNode | null {
  const sprint = sprintOf(ctx.h);
  const pod = podByKey(ctx.h, podKey);
  const wi = ctx.s.workItems.get(key);
  if (!sprint || !pod || !inPodNow(wi, sprint, pod)) return null;
  const n = workNode(ctx, pk, wi, wi.kind === 'bug' ? 'anomaly' : 'planet', { x: 0, y: 0, r: 0 });
  const feature = wi.parentKey ? ctx.s.workItems.get(wi.parentKey) : undefined;
  if (feature?.kind === 'feature') n.meta = `${n.meta} · ${feature.title}`;
  return n;
}

const sprintField: FieldSource = {
  order: (h) => (sprintOf(h)?.pods ?? []).map((p) => p.areaKey),
  member: (ctx, _ref, key, pk) => podNode(ctx, key, pk),
  miniOrder: (h, key) => { const pod = podByKey(h, key); return pod ? podOrder(h, pod) : []; },
  mini: (ctx, key, child, pk) => memberNode(ctx, key, child, pk),
  // One big backlog is one pod: the sprint passes straight through to it (06 §3).
  passThrough: (h) => { const pods = sprintOf(h)?.pods ?? []; return pods.length === 1 ? pods[0]!.areaKey : null; },
};

const podSystem: SystemSource = {
  center: (ctx, ref, pk) => podNode(ctx, ref.key, pk),
  order: (h, ref) => { const pod = podByKey(h, ref.key); return pod ? podOrder(h, pod) : []; },
  child: (ctx, ref, key, pk) => memberNode(ctx, ref.key, key, pk),
  uncertain: () => false, // membership is the sprint and the area, not a link
  points: taskKeys,
  point: (ctx, key, pk) => workNode(ctx, pk, ctx.s.workItems.get(key)!, 'missionPoint', { x: 0, y: 0, r: 0 }),
};

const SPRINT: LevelDef = {
  id: 'sprint', layout: 'field', source: sprintField,
  backdrop: 'sector', durationMs: 600, historyScene: 'scope',
  // The pods and everything ever beneath their members (decided 2026-10-08): a sprint plays its own
  // work. Membership is over the whole history, as slots are, so it never changes on a seek (INV-14).
  sceneKeys(h) {
    const sprint = sprintOf(h);
    const keys = new Set<CanonicalKey>();
    for (const pod of sprint?.pods ?? []) {
      keys.add(pod.areaKey);
      for (const k of podOrder(h, pod)) subtreeInto(h, keys, k);
    }
    return keys;
  },
  vocab: {
    typeLabel: () => 'Sprint',
    glyph: () => '◷ ',
    playNoun: 'sprint',
    enter: { chart: 'Enter sprint ›', ado: () => 'Open sprint ›' },
    pill: () => 'Sprint',
  },
};

const POD: LevelDef = {
  id: 'pod', layout: 'system', source: podSystem,
  backdrop: 'feature', durationMs: 750, historyScene: 'scope',
  // Streamed (decided 2026-10-08): entering a pod waits for its Tasks, which jump the queue.
  enterLoad: () => ({ kind: 'focus' }),
  sceneKeys(h, ref) {
    const pod = podByKey(h, ref.key);
    const keys = new Set<CanonicalKey>([ref.key]);
    for (const k of pod ? podOrder(h, pod) : []) subtreeInto(h, keys, k);
    return keys;
  },
  vocab: {
    typeLabel: () => 'Area Path',
    glyph: () => '◇ ',
    playNoun: 'sprint',
    enter: { chart: 'Enter pod system ›', ado: () => 'Open Area Path ›' },
  },
};

const BODY: LevelDef = {
  id: 'body', layout: 'radar', source: bodySource,
  backdrop: 'body', durationMs: 750, historyScene: 'scope',
  sceneKeys: (h, ref) => subtreeKeys(h, ref.key),
  vocab: {
    typeLabel: (_ref, typeName) => typeName ?? 'Item',
    glyph: () => '',
    playNoun: 'sprint',
    enter: { chart: 'Close approach ›', ado: (typeName) => `Open ${typeName ?? 'item'} ›` },
  },
};

export const SPRINTS: Hierarchy = chain('sprints').then(SPRINT).then(POD).then(BODY).build({
  sceneForScope(scope) {
    if (scope.sector.kind !== 'sprint') throw new Error('An Area Path or Epic is a Backlog scene, not a Sprints one');
    return { level: 'sprint', key: scope.sector.iterationKey };
  },
  pathTo(s, key, h) {
    const sprint = sprintOf(h);
    if (sprint?.pods.some((p) => p.areaKey === key)) return [{ level: 'pod', key }];
    const at = podOf(s, h, key);
    return at ? [{ level: 'pod', key: at.pod.areaKey }, { level: 'body', key: at.body }] : [];
  },
  labelOf(s, h, ref) {
    if (ref.level === 'sprint') { const sp = sprintOf(h); return sp ? { label: sp.path.split('\\').pop() ?? sp.path, typeName: 'Sprint' } : null; }
    if (ref.level === 'pod') { const pod = podByKey(h, ref.key); return pod ? { label: pod.label, typeName: 'Area Path' } : null; }
    const wi = s.workItems.get(ref.key);
    return wi ? { label: wi.title, typeName: wi.type } : null;
  },
  focusOf(s, key) {
    const wi = s.workItems.get(key);
    if (!wi) return null;
    if (wi.kind === 'story' || wi.kind === 'bug') return key;
    if (wi.kind === 'task' && wi.parentKey) {
      const p = s.workItems.get(wi.parentKey);
      return p && (p.kind === 'story' || p.kind === 'bug') ? p.key : null;
    }
    return null;
  },
  closeUpOf(s, key, h) {
    const at = podOf(s, h, key);
    return at ? { body: at.body, inScope: true } : { body: null, inScope: false };
  },
  stageOf(s, key, h) {
    const at = podOf(s, h, key);
    return at ? { level: 'pod', key: at.pod.areaKey } : null;
  },
  /** In the sprint now, but in none of its pods: shown, never given an invented home (INV-10). */
  uncharted(s, h) {
    const sprint = sprintOf(h);
    if (!sprint) return [];
    const out: CanonicalKey[] = [];
    for (const wi of s.workItems.values()) {
      if ((wi.kind !== 'story' && wi.kind !== 'bug') || !under(wi.iterationPath ?? '', sprint.path)) continue;
      if (!sprint.pods.some((p) => under(wi.areaPath, p.path))) out.push(wi.key);
    }
    return out.sort();
  },
  rankOf(s, key) {
    const kind = s.workItems.get(key)?.kind;
    return kind === 'feature' ? 0 : kind === 'task' ? 2 : 1;
  },
  vocab: { uncharted: { chart: 'beyond the stars', ado: 'Outside saved Area Paths', reason: 'outside the saved Area Paths' } },
});
