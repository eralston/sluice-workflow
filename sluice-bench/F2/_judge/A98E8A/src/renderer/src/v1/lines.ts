// What the player and the History tab say under Solar (v1, 14 §1.2): each event's line and rung come
// from the bundle's domain pack (its adapter, its mapping). Both registers are shown together (22 B1,
// R12): the source register (the pack's words) leads, the chart register (the theme's) follows it,
// quieter. The v0 panels keep their own SDLC readers; these are used only in a chain with a solar region.
import type { AnyTimelineEvent } from '@shared/contracts/events';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import { movesOf, roleOfKey } from '@shared/engine/moves';
import { countsLine, terminology } from '@shared/engine/terminology';
import { formatEvent, type EventParts } from '@shared/engine/eventLine';
import { partsOf } from '@shared/packs/events';
import type { Move, Register, Role, Rung, Terminology } from '@shared/engine/types';
import type { EventLine } from '@shared/playback/describe';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { activeHierarchy } from '../hierarchy';
import { activeTheme } from '../theme/registry';

/** Whether the active chain draws its regions with the solar layout (Solar, not v0). */
export function solarChain(): boolean {
  return activeHierarchy().levels.some((l) => l.layout === 'solar');
}

const termCache = new WeakMap<ScopeHistory, Partial<Record<Register, Terminology>>>();

/** The bundle's words in one register: the pack's (`source`), or the active theme's (`chart`), over the bundle's mapping. */
export function termsFor(h: ScopeHistory, register: Register): Terminology {
  let byReg = termCache.get(h);
  if (!byReg) termCache.set(h, (byReg = {}));
  return (byReg[register] ??= terminology(packFor(h), register, { chart: activeTheme()?.words, mapping: h.stateMapping }));
}

/** A star's counts by role, in the source register (22 A3, B1: `12 User Stories · 4 Bugs`; `countsLine`). */
export function starCounts(h: ScopeHistory, c: { objective: number; threat: number; done: number }, done = false): string {
  return countsLine(termsFor(h, 'source'), c, done);
}

/** Word every node with role counts of a graph (a Solar star's plate, 22 A3) in place. */
export function wordCounts(graph: { nodes: { roleCounts?: { objective: number; threat: number; done: number }; meta?: string }[] }, h: ScopeHistory): void {
  for (const n of graph.nodes) if (n.roleCounts) n.meta = starCounts(h, n.roleCounts);
}

/** An event's moves, as the pack reads it. */
export function movesOfEvent(h: ScopeHistory, e: AnyTimelineEvent): readonly Move[] {
  return movesOf(h, packFor(h)).get(e.eventKey) ?? [];
}

/** An event's line in one register, from the pack's adapter. */
export function solarLine(h: ScopeHistory, e: AnyTimelineEvent, register: Register): EventLine {
  const pack = packFor(h);
  return pack.adapter.describe(h, e, movesOfEvent(h, e), termsFor(h, register));
}

/**
 * An event in both layers (22 B4, R12): its parts in the source register (the pack's `event`), the
 * primary line they make, and the theme's account of what the chart shows, quieter, beneath it.
 */
export interface EventRow { parts: EventParts; line: string; chart: string | null }

const rowCache = new WeakMap<ScopeHistory, Map<string, EventRow>>();

export function eventRow(h: ScopeHistory, e: AnyTimelineEvent): EventRow {
  let byKey = rowCache.get(h);
  if (!byKey) rowCache.set(h, (byKey = new Map()));
  const hit = byKey.get(e.eventKey);
  if (hit) return hit;
  const parts = partsOf(h, e);
  const row = { parts, line: formatEvent(parts), chart: activeTheme()?.action?.(h, e, movesOfEvent(h, e), termsFor(h, 'chart')) ?? null };
  byKey.set(e.eventKey, row);
  return row;
}

/** The rung an event moves its piece to (an icon's or a tick's colour); null when it moves no rung. */
export function solarRung(h: ScopeHistory, e: AnyTimelineEvent): Rung | null {
  for (const mv of movesOfEvent(h, e)) {
    if (mv.m === 'appear' || mv.m === 'climb' || mv.m === 'settle') return mv.to.rung;
    if (mv.m === 'attach') return 'underway';
  }
  return null;
}

/** The piece an event is about, and its role (the History card's icon and its hover). */
export function solarSubject(h: ScopeHistory, e: AnyTimelineEvent): { key: CanonicalKey; role: Role | null } {
  for (const mv of movesOfEvent(h, e)) {
    if ('key' in mv) return { key: mv.key, role: 'role' in mv ? mv.role : roleOfKey(h, mv.key) };
    if (mv.m === 'bind' || mv.m === 'unbind') return { key: mv.parent, role: roleOfKey(h, mv.parent) };
  }
  return { key: e.entityKey, role: roleOfKey(h, e.entityKey) };
}

/**
 * "Open an Area Path to play · solar system": the plate where the episode can't play, the region in
 * both layers (22 B1). The source word leads; without a bundle it is the engine's.
 */
export function playPlate(h: ScopeHistory | null): { ado: string; metaphor: string } {
  const region = h ? termsFor(h, 'source').level('region') : 'region';
  const chart = h ? termsFor(h, 'chart').level('region') : activeTheme()?.words.level?.region.one ?? 'region';
  return { ado: `Open ${/^[aeiou]/i.test(region) ? 'an' : 'a'} ${region} to play`, metaphor: chart };
}
