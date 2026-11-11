// Learnability: one place that maps every Star Chart object and look to its ADO meaning (06 §2). One
// vocabulary in two layers (22 B1, R12): the ADO name leads, the chart's name follows in lower
// contrast. There is no switch between them.
import type { StateMapping } from '@shared/contracts/history';
import type { Paradigm } from '@shared/contracts/ipc';
import type { NodeKind, ViewNode } from '@shared/contracts/view';

interface KindNames { glyph: string; chart: string; ado: string; adoPlural: string }

export const KINDS: Partial<Record<NodeKind, KindNames>> = {
  galaxy: { glyph: '◎', chart: 'Galaxy', ado: 'Project', adoPlural: 'Projects' },
  star: { glyph: '✦', chart: 'Star', ado: 'Feature', adoPlural: 'Features' },
  planet: { glyph: '●', chart: 'Planet', ado: 'User Story', adoPlural: 'User Stories' },
  anomaly: { glyph: '✶', chart: 'Anomaly', ado: 'Bug', adoPlural: 'Bugs' },
  missionPoint: { glyph: '·', chart: 'Mission point', ado: 'Task', adoPlural: 'Tasks' },
  station: { glyph: '⌂', chart: 'Supply station', ado: 'Repository', adoPlural: 'Repositories' },
  flight: { glyph: '▸', chart: 'Cargo flight', ado: 'Pull Request', adoPlural: 'Pull Requests' },
  captain: { glyph: '➤', chart: 'Captain', ado: 'Person', adoPlural: 'People' },
  assignmentBeacon: { glyph: '◆', chart: 'Assignment beacon', ado: 'Assignment', adoPlural: 'Assignments' },
  // v1's solar board (14 §2.4). The ADO words are the SDLC pack's; `kindName` prefers the node's own type.
  seat: { glyph: '◉', chart: 'Homeworld', ado: 'Assigned person', adoPlural: 'Assigned people' },
  objective: { glyph: '◇', chart: 'Asteroid', ado: 'User Story', adoPlural: 'User Stories' },
  threat: { glyph: '✶', chart: 'Enemy ship', ado: 'Bug', adoPlural: 'Bugs' },
  facility: { glyph: '⌂', chart: 'Station', ado: 'Repository', adoPlural: 'Repositories' },
};

/** Order of object-list groups and key rows. v1's kinds come last, so every v1 node has a group (VC-2). */
export const KIND_ORDER: NodeKind[] = [
  'galaxy', 'star', 'planet', 'anomaly', 'missionPoint', 'station', 'flight', 'captain',
  'seat', 'objective', 'threat', 'facility',
];

/** The solar board's own kinds: the map key lists them only under Solar, so v0's key is unchanged. */
export const SOLAR_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>(['seat', 'objective', 'threat', 'facility']);

/**
 * Everything Solar draws, at every level (the galaxies, the round and its previews, a region): its map
 * key lists only these (19 P2, R3), so nothing in it names an object Solar never shows.
 */
export const SOLAR_KEY: ReadonlySet<NodeKind> = new Set<NodeKind>(['galaxy', 'star', 'captain', ...SOLAR_KINDS]);

/**
 * Solar's words where a shared kind means something else there (19 P2, R3): its stars are pods, one
 * per Area Path, in the round and at a region's centre, never Features; its captains are the people
 * work is assigned to (22 B2). Other kinds read as `KINDS`.
 */
export const SOLAR_NAMES: Partial<Record<NodeKind, KindNames>> = {
  star: { glyph: '✦', chart: 'Star', ado: 'Area Path', adoPlural: 'Area Paths' },
  captain: { glyph: '➤', chart: 'Captain', ado: 'Assigned person', adoPlural: 'Assigned people' },
};

/** A kind's words under a paradigm: Solar's own where it has them. */
export function kindNames(kind: NodeKind, paradigm: Paradigm): KindNames | undefined {
  return (paradigm === 'solar' ? SOLAR_NAMES[kind] : undefined) ?? KINDS[kind];
}

/** The map key's object rows, in `KIND_ORDER`: under Solar what Solar draws; elsewhere all but the solar board's. */
export function keyKinds(paradigm: Paradigm): NodeKind[] {
  return KIND_ORDER.filter((k) => (paradigm === 'solar' ? SOLAR_KEY.has(k) : !SOLAR_KINDS.has(k)));
}

/** Sector kinds aren't nodes, but the key and breadcrumb explain them too. */
export const SECTORS = [
  { glyph: '◇', chart: 'Area sector', ado: 'Saved Area Path' },
  { glyph: '⬡', chart: 'Epic sector', ado: 'Epic' },
];

/** Solar's one sector: a sprint, drawn as the round of its pods' stars (13 §2). */
export const SOLAR_SECTORS = [
  { glyph: '◷', chart: 'Sprint sector', ado: 'Sprint' },
];

/** A name in both layers (22 B1, R12): the ADO name leads; the chart's follows, quieter. */
export interface Named { ado: string; metaphor: string }

/** A kind's name in both layers. The ADO name prefers the node's real type (e.g. "Requirement"). */
export function kindName(node: Pick<ViewNode, 'kind' | 'typeName'>, paradigm: Paradigm): Named {
  const k = kindNames(node.kind, paradigm);
  return { ado: node.typeName ?? k?.ado ?? node.kind, metaphor: k?.chart ?? node.kind };
}

/**
 * The inspector's kind for what's selected: `forms` are its selectable nodes, the inspected one first.
 * Under Solar one person is two forms, their captain and their homeworld, and pressing either selects
 * the person, so the metaphor names both (`captain and homeworld`) and never contradicts the one
 * pressed (19 P2, R3). Elsewhere it names the inspected node alone.
 */
export function kindLine(forms: readonly Pick<ViewNode, 'kind' | 'typeName'>[], paradigm: Paradigm): Named {
  const node = forms[0];
  if (!node) return { ado: '', metaphor: '' };
  const kinds = paradigm === 'solar' ? [...new Set(forms.map((f) => f.kind))].sort((a, b) => (a === 'captain' ? -1 : b === 'captain' ? 1 : 0)) : [node.kind];
  const metaphor = kinds.map((kind, i) => (i ? kindName({ kind }, paradigm).metaphor.toLowerCase() : kindName(kind === node.kind ? node : { kind }, paradigm).metaphor)).join(' and ');
  return { ado: kindName(node, paradigm).ado, metaphor };
}

/** The look for each visual stage (06 §6), in plain words. */
export const LOOKS: Record<string, string> = {
  'feature.faint': 'Ready: an outline sketch of a star',
  'feature.draft': 'Ready: a muted grey star',
  'feature.review': 'Ready: a muted grey star',
  'feature.ready': 'Ready: a muted grey star',
  'feature.deferred': 'Ready, paused: a muted star with pause bars',
  'feature.active': 'Underway: a bright star with a turning blue corona',
  'feature.accept': 'Nearing: a violet corona with a gold fringe',
  'feature.whiteDwarf': 'Accomplished: a still gold starburst crown',
  'feature.ghost': 'Removed: a ghosted outline',
  'story.uncharted': 'Ready: a wireframe sensor sketch',
  'story.surveyed': 'Ready: a barren rocky world',
  'story.dormant': 'Ready, paused: a dim world with pause bars',
  'story.review': 'Ready: a barren rocky world',
  'story.terraforming': 'Underway: terraforming, a pulsing blue front and blue halo',
  'story.developed': 'Nearing: a developed world in a violet halo',
  'story.developedAccept': 'Nearing: a developed world, gold gathering at its limb',
  'story.lush': 'Accomplished: a lush world in gold, its city lights glimmering',
  'story.ghost': 'Removed: a ghost world',
  'bug.detected': 'Ready: a wireframe sensor sketch of an anomaly',
  'bug.stable': 'Ready: a grey wireframe anomaly, faintly filled',
  'bug.review': 'Ready: a grey wireframe anomaly, faintly filled',
  'bug.disturbance': 'Underway: blue turbulence with ripples',
  'bug.contracted': 'Nearing: a contracting violet anomaly',
  'bug.contractedAccept': 'Nearing: a contracting violet anomaly',
  'bug.remnant': 'Accomplished: sealed into a still gold knot',
  'bug.ghost': 'Removed: a ghosted anomaly',
  'bug.rejected': 'Rejected: a ghosted anomaly with a strike',
  'task.unstarted': 'Ready: a grey outline pin',
  'task.lit': 'Underway: a blue pin, its base radiating',
  'task.settled': 'Accomplished: a faded pin with a gold check',
  'task.faint': 'Removed: a faint pin outline',
  'flight.active': 'Underway: blue running lights, chevrons, and cargo flowing to the station',
  'flight.completed': 'Accomplished: gold trim and a gold check, docked and still',
  'flight.abandoned': 'Abandoned: greyed out, with an X',
  unknown: 'Neutral grey with "?"',
};

const FLIGHT_MEANING: Record<string, string> = {
  'flight.active': 'Pull Request · active',
  'flight.completed': 'Pull Request · completed (merged into its target branch)',
  'flight.abandoned': 'Pull Request · abandoned',
};

/**
 * Under Solar every star is a pod's (no Feature is drawn there), so its look reads its pod's work as a
 * whole (`podStage`, sprints.ts), not a Feature's state (19 P2, R3).
 */
const POD_MEANING: Record<string, string> = {
  'feature.faint': 'Area Path · nothing in this sprint yet',
  'feature.ready': 'Area Path · none of its work started',
  'feature.active': 'Area Path · some of its work under way or resolved',
  'feature.accept': 'Area Path · three quarters of its work resolved or done',
  'feature.whiteDwarf': 'Area Path · all of its work done',
};

export interface StageExplanation { stage: string; look: string; means: string }

/** "What this looks like" and "what it means in ADO", using the real state mapping. */
export function explainStage(stage: string, mapping: StateMapping | null, paradigm?: Paradigm): StageExplanation | null {
  const look = LOOKS[stage];
  if (!look) return null;
  if (FLIGHT_MEANING[stage]) return { stage, look, means: FLIGHT_MEANING[stage]! };
  if (paradigm === 'solar' && POD_MEANING[stage]) return { stage, look, means: POD_MEANING[stage]! };
  if (stage === 'unknown') return { stage, look, means: 'A state Star Chart has no mapping for; the raw name is shown' };
  const states: string[] = [];
  let type = '';
  for (const [typeName, t] of Object.entries(mapping?.types ?? {})) {
    for (const [state, s] of Object.entries(t.states)) {
      if (s.stage === stage) {
        type = typeName;
        states.push(`${state} (${s.category.replace('InProgress', 'In Progress')})`);
      }
    }
  }
  return { stage, look, means: states.length ? `${type} · ${states.join(', ')}` : '' };
}

export const LINES = [
  { sample: 'orbit', chart: 'Orbit ring', ado: 'Parent/child link (Story or Bug under its Feature)' },
  { sample: 'solid', chart: 'Flight route', ado: 'Pull Request linked to a work item' },
  { sample: 'dashed', chart: 'Route continuation', ado: 'Task → its parent Story or Bug (hierarchy, not a PR link)' },
];

/** Solar's lines (19 P2): a homeworld's orbit arc, the frontier belt, and a reassignment's route in play. */
export const SOLAR_LINES = [
  { sample: 'orbit', chart: 'Orbit arc', ado: 'An assignee with work in this Area Path (one arc each)' },
  { sample: 'dashed', chart: 'Frontier belt', ado: 'Unassigned work in this Area Path (drawn only while there is some)' },
  { sample: 'solid', chart: 'Route', ado: 'In playback, work being reassigned: from where it was to where it goes' },
];
