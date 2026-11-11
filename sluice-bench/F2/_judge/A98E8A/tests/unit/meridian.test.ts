// The dense pod (22 A13): meridian-sprint's Sprint 7 holds what Block A checks against, so a later
// edit can't quietly thin it out. Twelve seats in Convoy Planning Pod, past the old preview caps, with
// the three empty-homeworld cases and a Bugs-only seat.
import { describe, expect, it } from 'vitest';
import meridian from '@fixtures/scenarios/v1/meridian-sprint';
import { scenarioKeys, sprintScopes, toHistory } from '@fixtures/dsl';
import { seatReason } from '@shared/engine/facts';
import { solarSource } from '@shared/hierarchy/solarSource';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { SOLAR } from '@shared/hierarchy/solar';
import { LAYOUT_VERSION } from '@shared/limits';
import { projectScene } from '@shared/scene/projectScene';
import { mapping } from '../golden/helpers';

const k = scenarioKeys(meridian);
const h = toHistory(meridian, mapping, sprintScopes(meridian).find((x) => x.sprint.endsWith('Sprint 7'))!);
const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
const CONVOY = 'Meridian Works\\Fleet Operations\\Logistics\\Convoy Planning Pod';
const convoy = pods.find((p) => p.path === CONVOY)!;
const facts = solarSource.facts(h, { level: 'pod', key: convoy.areaKey });
const end = snapshotAt(h, h.range.endUtc - 1, 'knownThen');
const held = (who: string) => [...end.workItems.values()].filter((w) => w.assigneeKey === k.person(who) && w.areaPath === CONVOY && w.iterationPath === 'Meridian Works\\Sprint 7');

describe('meridian-sprint: the dense pod', () => {
  it('is a round of two regions, Convoy Planning Pod first', () => {
    expect(pods.map((p) => p.label)).toEqual(['Convoy Planning Pod', 'Signals Pod']);
  });

  it('seats twelve people in Convoy Planning Pod (all from planning day, so in key order)', () => {
    expect(new Set(facts.seats)).toEqual(new Set(['mara', 'bram', 'cleo', 'dov', 'esme', 'faro', 'gil', 'hana', 'rook', 'tove', 'ulla', 'vash'].map(k.person)));
  });

  it('holds more pieces than the old preview caps (24 rocks, 5 hives)', () => {
    const roles = [...facts.pieces.values()].map((p) => p.role);
    expect(roles.filter((r) => r === 'objective').length).toBeGreaterThan(24);
    expect(roles.filter((r) => r === 'threat').length).toBeGreaterThan(5);
  });

  it('has the empty homeworlds: moved out, handed on, Removed; and a Bugs-only seat', () => {
    expect(held('rook')).toEqual([]);
    expect(held('tove')).toEqual([]);
    expect(held('ulla').map((w) => w.rawState)).toEqual(['Removed']);
    expect(new Set(held('vash').map((w) => w.type))).toEqual(new Set(['Bug']));
  });

  it('says why each empty homeworld is there: what it held, until when, and what became of it (A2)', () => {
    const at = h.range.endUtc - 1;
    const why = (who: string) => seatReason(facts, k.person(who), at);
    expect(why('rook')).toMatchObject({ kind: 'held', key: k.wi(55181), why: 'left', until: Date.parse('2026-09-25T16:00:00Z') });
    expect(why('tove')).toMatchObject({ kind: 'held', key: k.wi(55191), why: 'handed', until: Date.parse('2026-09-28T16:00:00Z') });
    expect(why('ulla')).toMatchObject({ kind: 'held', key: k.wi(55201), why: 'off', until: Date.parse('2026-09-28T18:00:00Z') });
    expect(why('mara')).toMatchObject({ kind: 'holds' });
    expect(why('vash')).toEqual({ kind: 'holds', count: 2 }); // both Bugs: a closed one stays on its planet, done
    // Before the move, Rook still holds it here; and someone who never held work here has no reason.
    expect(seatReason(facts, k.person('rook'), Date.parse('2026-09-24T12:00:00Z'))).toEqual({ kind: 'holds', count: 1 });
    expect(seatReason(facts, k.person('quin'), at)).toBeNull();
  });

  it('names the right cause when several land at once, and who it went to then (A2; review)', () => {
    const A = 'id:o:a' as never; const B = 'id:o:b' as never;
    const ready = { rung: 'ready' } as never; const off = { rung: 'off' } as never;
    const round = { startUtc: 0, endUtc: 1000 };
    const reason = (p: object) => seatReason({ round, pieces: new Map([['wi:o:1' as never, { key: 'wi:o:1', role: 'objective', steps: [], parent: null, ...p } as never]]) }, A, 500);
    // Moved out of the region and reassigned in one save: it left (not "handed").
    expect(reason({ member: [{ from: 0, to: 100 }], seatAt: [{ from: 0, seat: A }, { from: 100, seat: B }], signalAt: [{ from: 0, signal: ready }] })).toMatchObject({ why: 'left', until: 100 });
    // Removed and unassigned at once: set aside.
    expect(reason({ member: [{ from: 0, to: null }], seatAt: [{ from: 0, seat: A }, { from: 100, seat: null }], signalAt: [{ from: 0, signal: ready }, { from: 100, signal: off }] })).toMatchObject({ why: 'off' });
    // Unassigned alone: unassigned, not "handed to someone else".
    expect(reason({ member: [{ from: 0, to: null }], seatAt: [{ from: 0, seat: A }, { from: 100, seat: null }], signalAt: [{ from: 0, signal: ready }] })).toMatchObject({ why: 'unassigned' });
    // Handed on: to whom it went at that instant, even if it moved on again later.
    expect(reason({ member: [{ from: 0, to: null }], seatAt: [{ from: 0, seat: A }, { from: 100, seat: B }, { from: 300, seat: 'id:o:c' }], signalAt: [{ from: 0, signal: ready }] })).toMatchObject({ why: 'handed', to: B });
  });

  it('stands every planet on one ring, so the renderer can draw it whole (the ring looked broken drawn per seat)', () => {
    for (const t of [0.1, 0.5, 1]) {
      const at = Math.round(h.range.startUtc + (h.range.endUtc - 1 - h.range.startUtc) * t);
      const g = projectScene(h, snapshotAt(h, at, 'knownThen'), SOLAR.format({ level: 'pod', key: convoy.areaKey }), LAYOUT_VERSION, SOLAR);
      const rings = g.edges.filter((e) => e.kind === 'orbit' && e.geometry?.kind === 'ellipse' && e.geometry.arc)
        .map((e) => e.geometry?.kind === 'ellipse' ? `${Math.round(e.geometry.cx)}|${Math.round(e.geometry.cy)}|${Math.round(e.geometry.rx)}|${Math.round(e.geometry.ry)}` : '');
      expect(rings.length).toBe(12);
      expect(new Set(rings).size).toBe(1);
    }
  });

  it('has long titles to wrap (A7)', () => {
    expect([...end.workItems.values()].filter((w) => w.title.length >= 60).length).toBeGreaterThanOrEqual(8);
  });
});
