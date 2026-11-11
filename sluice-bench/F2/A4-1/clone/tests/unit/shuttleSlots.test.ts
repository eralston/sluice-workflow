// 23 C6 — per-slot satellites (14 §9 D2/D6, 03 §5d): a station's tender slots are a mask (`pm=`), so a PR that
// closes empties its own slot and no other moves; a PR keeps its slot for its life (first-fit by open time);
// slots past the cap count into "+N"; and a per-slot dock names the slot whose tender goes home.
import { describe, expect, it } from 'vitest';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { PieceState } from '@shared/contracts/view';
import { compoundAt, compoundSlots, slotMask } from '@shared/engine/solar/compound';
import { GEOMETRY } from '@shared/engine/solar/version';
import type { AttachmentFacts } from '@shared/engine/types';
import { decodePiece, encodePiece } from '@shared/engine/stageCode';
import { resolve } from 'node:path';

// Renderer code sits outside this project's tsconfig, so it's loaded by a runtime path and typed by hand.
const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;
type Slots = { act: string; shuttles: number; slotMask?: number; dockMask?: number };
const { parseStationStage, shuttleSlots, SHUTTLE_CAP, stationStage } = await load<{
  parseStationStage(s: string): Partial<Slots>;
  shuttleSlots(st: Slots): { mask: number; extra: number; docking: number };
  SHUTTLE_CAP: number;
  stationStage(f: string, act: string, o?: { pr?: number; pm?: number; ds?: number | readonly number[] }): string;
}>('chart/art/dreadnoughts.ts');
const { facilityLook } = await load<{
  facilityLook(p: PieceState | null, act?: string, slot?: number | readonly number[]): { act: string; o: { pr: number; pm?: number; ds?: number | readonly number[] } };
}>('theme/starChart/stageCodec.ts');

const REPO = 'repo:o:1' as CanonicalKey;
const att = (n: number, from: number, to: number | null): AttachmentFacts => ({
  key: `wi:o:${n}` as CanonicalKey, facility: REPO, author: null, open: { from, to }, links: [], approvers: [], signalAt: [],
});
/** The attachments open at `t`: the projection's filter (a PR closed by `t` is not open). */
const openAt = (slots: ReturnType<typeof compoundSlots>, t: number) => compoundAt(slots, t);
const slotOf = (slots: ReturnType<typeof compoundSlots>, n: number) => slots.find((s) => s.key === `wi:o:${n}`)!.slot;

describe('slot assignment (first-fit, stable for a PR\'s life)', () => {
  // A, B, C open together; B closes at 50; D opens at 60 and takes the freed slot; E opens at 70.
  const slots = compoundSlots(REPO, [att(1, 0, 100), att(2, 10, 50), att(3, 20, 100), att(4, 60, 100), att(5, 70, 100)], 0)
    .filter((s) => s.role === 'attachment');

  it('gives each PR the lowest slot free over its whole life', () => {
    expect([1, 2, 3, 4, 5].map((n) => slotOf(slots, n))).toEqual([0, 1, 2, 1, 3]);
  });

  it('keeps the gap where it is when a PR in the middle closes', () => {
    expect(slotMask(openAt(slots, 40).live)).toBe(0b111);
    const after = openAt(slots, 55).live;
    expect(slotMask(after)).toBe(0b101); // slot 1 empty; slots 0 and 2 did not shift
    expect(after.map((s) => slotOf(slots, Number(s.key.split(':')[2])))).toEqual([0, 2]);
  });

  it('reuses the freed slot for the next PR, then the next lowest', () => {
    expect(slotMask(openAt(slots, 65).live)).toBe(0b111);
    expect(slotMask(openAt(slots, 75).live)).toBe(0b1111);
  });

  it('draws slots below the cap only; the rest count in "+N"', () => {
    const many = compoundSlots(REPO, Array.from({ length: 9 }, (_, i) => att(i + 1, i, null)), 0);
    const { live, more } = openAt(many, 100);
    expect(slotMask(live)).toBe((1 << GEOMETRY.compoundCap) - 1);
    expect(more).toBe(3);
    expect(GEOMETRY.compoundCap).toBe(SHUTTLE_CAP);
  });

  it('ignores guards (they are not tenders)', () => {
    const g = compoundSlots('repo:o:2' as CanonicalKey, [att(1, 0, null)], 0);
    expect(g.some((s) => s.role === 'guard')).toBe(true);
    expect(slotMask(g)).toBe(1);
  });
});

describe('the mask in the stage string', () => {
  const piece = (extra: Partial<PieceState>): PieceState => ({ role: 'facility', signal: { rung: 'underway' }, category: 'InProgress', intensity: 0.5, ...extra });

  it('is written after pr and round-trips', () => {
    const p = piece({ open: 2, slots: 0b101 });
    expect(encodePiece(p)).toBe('v1|facility|underway|c=InProgress|i=0.50|pr=2|pm=5');
    expect(decodePiece(encodePiece(p))).toEqual(p);
    expect(encodePiece(piece({ open: 2, slots: 5, merged: 1 }))).toBe('v1|facility|underway|c=InProgress|i=0.50|pr=2|pm=5|mg=1');
  });

  it('decodes only the canonical string', () => {
    expect(decodePiece('v1|facility|underway|c=InProgress|pm=05')).toBeNull();
    expect(decodePiece('v1|facility|underway|c=InProgress|pm=-1')).toBeNull();
    expect(decodePiece('v1|facility|underway|c=InProgress|pm=1|pr=1')).toBeNull(); // out of order
  });

  it('reaches the art as pm, and a dock names its slot as ds', () => {
    const p = piece({ open: 3, slots: 0b1011 });
    const idle = facilityLook(p);
    expect(idle.o).toMatchObject({ pr: 3, pm: 11 });
    expect(idle.o.ds).toBeUndefined();
    const dock = facilityLook(p, 'dock', 3);
    expect(stationStage('trek', dock.act, dock.o)).toContain('pm=11');
    expect(parseStationStage(stationStage('trek', dock.act, dock.o))).toMatchObject({ act: 'dock', shuttles: 3, slotMask: 11, dockMask: 0b1000 });
    expect(facilityLook(p, 'cover', 3).o.ds).toBeUndefined(); // only a dock has a docking slot
  });
});

describe('the art\'s slots (shuttleSlots)', () => {
  const base = { act: 'idle', shuttles: 0 };

  it('draws exactly the masked slots, and counts the rest as +N', () => {
    expect(shuttleSlots({ ...base, shuttles: 2, slotMask: 0b100001 })).toEqual({ mask: 0b100001, extra: 0, docking: 0 });
    expect(shuttleSlots({ ...base, shuttles: 9, slotMask: 0b111111 }).extra).toBe(3);
    expect(shuttleSlots({ ...base, shuttles: 0, slotMask: 0 })).toEqual({ mask: 0, extra: 0, docking: 0 });
  });

  it('fills by count with no mask (the gallery, an old stage) and caps at SHUTTLE_CAP', () => {
    expect(shuttleSlots({ ...base, shuttles: 3 }).mask).toBe(0b111);
    expect(shuttleSlots({ ...base, shuttles: 8 })).toMatchObject({ mask: 0b111111, extra: 2 });
  });

  it('ignores mask bits past the cap', () => {
    expect(shuttleSlots({ ...base, shuttles: 1, slotMask: 0b1000001 }).mask).toBe(1);
  });

  // `docking` is a mask (27 E6): one bit per tender going home.
  it('docks the named slot, drawing it even if the stage has cleared its bit; else the last drawn', () => {
    expect(shuttleSlots({ act: 'dock', shuttles: 2, slotMask: 0b101, dockMask: 0b1 })).toMatchObject({ mask: 0b101, docking: 0b1 });
    expect(shuttleSlots({ act: 'dock', shuttles: 1, slotMask: 0b100, dockMask: 0b10 })).toMatchObject({ mask: 0b110, docking: 0b10 });
    expect(shuttleSlots({ act: 'dock', shuttles: 2, slotMask: 0b101 }).docking).toBe(0); // a PR with no drawn slot merged: no tender goes home
    expect(shuttleSlots({ act: 'dock', shuttles: 3 }).docking).toBe(0b100);
    expect(shuttleSlots({ act: 'dock', shuttles: 8, slotMask: 0b111111, dockMask: 1 << 7 }).docking).toBe(0); // past the cap: nothing to dock
    expect(shuttleSlots({ act: 'idle', shuttles: 2, slotMask: 0b11, dockMask: 0b10 }).docking).toBe(0);
  });

  it('docks every tender of a volley together (27 E6): a set of slots in, one bit each out', () => {
    // Two PRs merge in one volley: slots 1 and 3 go home together; 0 and 2 stay; one already cleared is still drawn.
    expect(shuttleSlots({ act: 'dock', shuttles: 3, slotMask: 0b0111, dockMask: 0b1010 })).toEqual({ mask: 0b1111, extra: 0, docking: 0b1010 });
    // The stage carries the set as a list, and a slot past the cap is dropped.
    const p: PieceState = { role: 'facility', signal: { rung: 'underway' }, category: 'InProgress', intensity: 0.5, open: 4, slots: 0b1111 };
    const dock = facilityLook(p, 'dock', [1, 3]);
    expect(stationStage('wars', dock.act, dock.o)).toContain('ds=1,3');
    expect(parseStationStage(stationStage('wars', dock.act, dock.o))).toMatchObject({ act: 'dock', dockMask: 0b1010 });
    expect(parseStationStage('station.wars.dock pr=2 ds=0,9').dockMask).toBe(0b1);
    expect(parseStationStage('station.wars.dock pr=2 ds=0,').dockMask).toBeUndefined(); // malformed: ignored
    // A single slot reads as before.
    expect(parseStationStage(stationStage('wars', 'dock', { pr: 2, ds: 2 })).dockMask).toBe(0b100);
  });
});
