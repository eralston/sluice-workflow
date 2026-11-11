// The solar projection's seek stability (14 §4, §5; 17 W2-T1): on pod-sprint's Sprint 13 round, every
// region, at every beat time of its own (paced) schedule. Each (piece, seat) keeps one place, a seek
// to x equals a play to x, every piece is a standalone member of its seat's region, every piece sits on one of its
// planned slots, and the mega-lists keep their budget. Then the board facts on hand-built pieces:
// seats come only from pieces held on the ladder. Last, mini sprints for what W3-T3 fixed: a ghost
// is no anchor for its new assignee, a facility serving only dropped pieces isn't drawn, a seat's
// fallback ship sits where its person last worked, and the schedule's own facts.
import { describe, expect, it } from 'vitest';
import podSprint from '@fixtures/scenarios/v1/pod-sprint';
import { scenario, scenarioKeys, sprintScopes, toHistory, type Scenario } from '@fixtures/dsl';
import type { ScopeHistory } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { MegaRow, ViewGraph } from '@shared/contracts/view';
import { memberAt, seatReason } from '@shared/engine/facts';
import { GEOMETRY } from '@shared/engine/solar/version';
import { planManeuvers, scheduleFacts } from '@shared/engine/maneuvers';
import { RULE } from '@shared/engine/pace';
import { pieceAt, planSolar } from '@shared/engine/solar/plan';
import type { PieceFacts, RoundFacts, Signal } from '@shared/engine/types';
import { SOLAR } from '@shared/hierarchy/solar';
import '@shared/packs/all';
import { packFor } from '@shared/packs/registry';
import { paceFacts, solarSource } from '@shared/hierarchy/solarSource';
import { LAYOUT_VERSION } from '@shared/limits';
import { buildScene } from '@shared/playback/highlights';
import { snapshotAt } from '@shared/replay/snapshotAt';
import { projectScene } from '@shared/scene/projectScene';
import { megaList, ROW_BUDGET } from '@shared/scene/project/lists';
import { boardFacts, slotAt, STANDBY_BELOW } from '@shared/scene/project/solar';
import { mapping } from '../golden/helpers';

const scope = sprintScopes(podSprint).find((x) => x.sprint.endsWith('Sprint 13'))!;
const h: ScopeHistory = toHistory(podSprint, mapping, scope);
const pods = h.scope.sector.kind === 'sprint' ? h.scope.sector.pods : [];
const pack = solarSource.pack!(h);

const regions = pods.map((pod) => {
  const ref = { level: 'pod', key: pod.areaKey } as const;
  const scene = SOLAR.format(ref);
  const sch = buildScene(h, h.range, podSprint.tz, scene, SOLAR);
  // Every beat's instant, the round's start and its last instant.
  const times = [...new Set([h.range.startUtc, ...sch.beats.map((b) => b.sourceUtc), h.range.endUtc - 1])].sort((a, b) => a - b);
  return { pod, ref, scene, sch, times };
});

const graphAt = (bundle: ScopeHistory, scene: string, t: number): ViewGraph =>
  projectScene(bundle, snapshotAt(bundle, t, 'knownThen'), scene as never, LAYOUT_VERSION, SOLAR);

const PLACED = new Set(['seat', 'objective', 'threat', 'facility', 'star']);

describe('solar seek stability: pod-sprint, Sprint 13', () => {
  it('plays each region on a paced schedule with beats to test', () => {
    expect(SOLAR.pacing).toBeTypeOf('function');
    for (const r of regions) expect(r.sch.beats.length).toBeGreaterThan(5);
  });

  it('keeps each (key, seat) at one place at every beat time', () => {
    for (const r of regions) {
      const f = solarSource.facts(h, r.ref);
      const plan = planSolar(f, pack);
      const at = new Map<string, string>();
      let pieces = 0;
      for (const t of r.times) {
        for (const n of graphAt(h, r.scene, t).nodes) {
          if (!PLACED.has(n.kind)) continue;
          const seat = n.kind === 'objective' || n.kind === 'threat' ? slotAt(plan, f, n.canonicalKey, t)?.seat ?? 'none' : '';
          // A finished piece stands on its seat's lit-edge platform, an unfinished one on the planet.
          const done = (n.kind === 'objective' || n.kind === 'threat') && n.piece?.signal.rung === 'accomplished';
          const id = `${n.kind}|${n.canonicalKey}|${seat}${done ? '|platform' : ''}`;
          const place = `${n.world.x},${n.world.y},${n.world.r}`;
          expect(at.get(id) ?? place, id).toBe(place);
          at.set(id, place);
          if (seat) pieces++;
        }
      }
      expect(pieces).toBeGreaterThan(0);
    }
  });

  it('puts every shown piece on one of its planned slots, and agrees with the plan’s reader', () => {
    for (const r of regions) {
      const f = solarSource.facts(h, r.ref);
      const plan = planSolar(f, pack);
      const slots = new Set([...plan.slots.values(), ...plan.platforms.values()].map((s) => `${s.piece}|${s.x},${s.y},${s.r}`));
      for (const t of r.times) {
        const g = graphAt(h, r.scene, t);
        for (const n of g.nodes.filter((x) => x.kind === 'objective' || x.kind === 'threat')) {
          expect(slots.has(`${n.canonicalKey}|${n.world.x},${n.world.y},${n.world.r}`)).toBe(true);
        }
        // The projection's reader is the plan's (`pieceAt`, over engine/facts' readers).
        for (const [key, p] of f.pieces) {
          if (p.role !== 'objective' && p.role !== 'threat') continue;
          expect(slotAt(plan, f, key, t), `${key} at ${t}`).toBe(pieceAt(plan, f, key, t));
          // A member always has a slot to stand in.
          if (memberAt(p, t)) expect(slotAt(plan, f, key, t)).not.toBeNull();
        }
      }
    }
  });

  it('gives the same graph on a seek to x as on a play to x', () => {
    for (const r of regions) {
      // Play: every beat in order, on one bundle (its memos warm). Seek: a fresh copy, latest first.
      const played = new Map(r.times.map((t) => [t, graphAt(h, r.scene, t)]));
      const fresh = structuredClone(h);
      for (const t of [...r.times].reverse()) expect(graphAt(fresh, r.scene, t)).toEqual(played.get(t));
      // And a seek back after the end changes nothing.
      const mid = r.times[Math.floor(r.times.length / 2)]!;
      graphAt(h, r.scene, h.range.endUtc - 1);
      expect(graphAt(h, r.scene, mid)).toEqual(played.get(mid));
    }
  });

  it('stands every unfinished piece on its seat\'s planet and every finished one in orbit, none free (no cap since v4)', () => {
    let crowded = false;
    for (const r of regions) {
      const f = solarSource.facts(h, r.ref);
      const plan = planSolar(f, pack);
      for (const t of r.times) {
        for (const n of graphAt(h, r.scene, t).nodes) {
          if (n.kind !== 'objective' && n.kind !== 'threat') continue;
          const slot = slotAt(plan, f, n.canonicalKey, t)!;
          if (n.piece?.signal.rung === 'accomplished' && slot.mode !== 'frontier') {
            // A finished piece is standalone, in orbit: its seat's platform, and no group.
            const plat = plan.platforms.get(`${slot.seat}|${n.canonicalKey}`)!;
            expect([n.world.x, n.world.y]).toEqual([plat.x, plat.y]);
            expect(n.cluster).toBeUndefined();
            continue;
          }
          if (slot.mode === 'formation') { crowded = true; expect(n.cluster).toMatchObject({ id: slot.formation, index: slot.index }); }
          expect(slot.mode).not.toBe('free'); // there are no free pieces
        }
      }
    }
    expect(crowded).toBe(true); // Ossian has the most pieces
  });

  it('keeps every mega-list within its budget, and facility rows are its PRs, each with the work it serves (19 L6)', () => {
    let facilityRows = 0;
    for (const r of regions) {
      for (const t of r.times) {
        const g = graphAt(h, r.scene, t);
        const drawn = new Set(g.nodes.map((n) => n.canonicalKey));
        for (const [pk, list] of Object.entries(g.lists ?? {})) {
          expect(list.rows.length).toBeLessThanOrEqual(ROW_BUDGET);
          expect(list.more).toBeGreaterThanOrEqual(0);
          expect(g.nodes.some((n) => n.projectionKey === pk)).toBe(true);
          const node = g.nodes.find((n) => n.projectionKey === pk)!;
          if (node.kind !== 'facility') {
            for (const row of list.rows) expect(row.serves).toBeUndefined();
            continue;
          }
          for (const row of list.rows) {
            facilityRows++;
            // A PR of this repo: its number and status, its rung from the status; no Feature (Q6).
            expect(row.key).toMatch(/^pr:/);
            expect(row.meta).toMatch(/^PR · #21\d{3} · (Active|Completed|Abandoned)$/);
            expect(row.rung).toBe({ Active: 'underway', Completed: 'accomplished', Abandoned: 'off' }[row.meta!.split(' · ')[2]!]);
            // It serves at least one piece of the region, drawn here, named in its subtitle in order.
            expect(row.serves!.length).toBeGreaterThan(0);
            for (const k of row.serves!) expect(drawn.has(k)).toBe(true);
            const named = row.serves!.map((k) => `#${k.slice(k.lastIndexOf(':') + 1)}`);
            expect(row.subtitle?.label).toMatch(/^→ /);
            expect(row.subtitle!.label.match(/#\d+/g)).toEqual(named);
            expect(row.subtitle?.url).toBeNull();
          }
        }
      }
    }
    expect(facilityRows).toBeGreaterThan(0);
  });

  it('makes every piece hover-only, with no list of its own: a seated one is its seat\'s row, a frontier one no one\'s (19 L7)', () => {
    let seated = 0;
    let frontier = 0;
    for (const r of regions) {
      const f = solarSource.facts(h, r.ref);
      const plan = planSolar(f, pack);
      for (const t of r.times) {
        const g = graphAt(h, r.scene, t);
        const seatOf = new Map(g.nodes.filter((n) => n.kind === 'seat').map((n) => [n.projectionKey, n.canonicalKey]));
        for (const n of g.nodes.filter((x) => x.kind === 'objective' || x.kind === 'threat')) {
          expect(n.labelOnHover).toBe(true);
          expect(g.lists?.[n.projectionKey]).toBeUndefined();
          // The seats whose list has it as a row of its own (a PR's row serves it, but isn't its row).
          const listing = Object.entries(g.lists ?? {}).filter(([pk, l]) => seatOf.has(pk) && l.rows.some((row) => row.key === n.canonicalKey)).map(([pk]) => seatOf.get(pk));
          const slot = slotAt(plan, f, n.canonicalKey, t)!;
          if (slot.mode === 'frontier') { frontier++; expect(listing).toEqual([]); } else { seated++; expect(listing).toEqual([slot.seat]); }
        }
      }
    }
    expect(seated).toBeGreaterThan(0);
    expect(frontier).toBeGreaterThan(0);
  });

  it('lists the pieces in the frontier belt at each playhead, and keeps its geometry fixed (19 S2, INV-14)', () => {
    const seen = new Set<string>();
    for (const r of regions) {
      const f = solarSource.facts(h, r.ref);
      const plan = planSolar(f, pack);
      for (const t of r.times) {
        const g = graphAt(h, r.scene, t);
        const inBelt = g.nodes.filter((n) => (n.kind === 'objective' || n.kind === 'threat') && slotAt(plan, f, n.canonicalKey, t)?.mode === 'frontier');
        expect([...g.solar!.unassigned].sort(), `${r.pod.label} at ${t}`).toEqual(inBelt.map((n) => n.projectionKey).sort());
        // Shown or not, the belt is reserved where the plan put it.
        expect(g.solar!.frontier).toEqual(plan.frontier);
        seen.add(g.solar!.unassigned.length ? 'some' : 'none');
      }
    }
    // The fixture has both: playheads with unassigned work, and playheads with none.
    expect([...seen].sort()).toEqual(['none', 'some']);
  });

  it('lists a PR that serves two pieces once, lighting both: ledger-sync at the round\'s end', () => {
    const harbor = regions.find((r) => graphAt(h, r.scene, h.range.endUtc - 1).nodes.some((n) => n.label === 'ledger-sync'))!;
    const g = graphAt(h, harbor.scene, h.range.endUtc - 1);
    const ledger = g.nodes.find((n) => n.kind === 'facility' && n.label === 'ledger-sync')!;
    const rows: MegaRow[] = g.lists![ledger.projectionKey]!.rows;
    expect(rows.map((r) => [r.label, r.meta, r.rung, r.subtitle?.label])).toEqual([
      ['Roster and export ledger rows', 'PR · #21008 · Completed', 'accomplished', '→ User Story #20112, Bug #20221'],
    ]);
    expect(rows[0]!.serves!.map((k) => k.slice(k.lastIndexOf(':') + 1))).toEqual(['20112', '20221']);
  });

  it('cuts a list at ROW_BUDGET and counts the rest', () => {
    const rows: MegaRow[] = Array.from({ length: 21 }, (_, i) => ({ key: `wi:x:${i}` as CanonicalKey, label: `row ${i}`, rung: 'ready' }));
    expect(megaList('t', rows)).toMatchObject({ title: 't', more: 5 });
    expect(megaList('t', rows).rows).toHaveLength(16);
    expect(megaList('t', rows.slice(0, 3))).toMatchObject({ more: 0 });
  });

  it('plays every protected window inside its beat when planned from the pace facts', () => {
    let planned = 0;
    for (const r of regions) {
      for (const beat of r.sch.beats.filter((b) => b.accented)) {
        for (const m of planManeuvers(h, beat, paceFacts(h), undefined, undefined, r.sch.limelight ? { limelight: r.sch.limelight } : {})) {
          if (m.id === RULE.agentLight) continue;
          planned++;
          expect(m.afterMs + m.durationMs).toBeLessThanOrEqual(beat.durationMs);
          if (m.protect) expect(m.afterMs + m.protect.windowMs).toBeLessThanOrEqual(beat.durationMs);
        }
      }
    }
    expect(planned).toBeGreaterThan(0);
  });
});

describe('board facts: seats come only from pieces held on the ladder', () => {
  const T = (d: number) => Date.UTC(2026, 0, 1 + d);
  const on: Signal = { rung: 'underway' };
  const off: Signal = { rung: 'off', ghost: true };
  const piece = (key: string, p: Partial<PieceFacts>): PieceFacts =>
    ({ key: key as CanonicalKey, role: 'objective', member: [{ from: T(0), to: null }], seatAt: [], signalAt: [], steps: [], parent: null, ...p });
  const facts = (pieces: PieceFacts[], seats: string[]): RoundFacts => ({
    round: { startUtc: T(0), endUtc: T(10) }, region: 'area:x:1',
    pieces: new Map(pieces.map((p) => [p.key, p])), seats: seats as CanonicalKey[], attachments: new Map(), moves: new Map(),
  });

  it('drops a piece that is Off all round, so its holder has no seat', () => {
    const f = facts([
      piece('wi:x:1', { seatAt: [{ from: T(0), seat: 'id:p' as CanonicalKey }], signalAt: [{ from: T(0), signal: off }] }),
      piece('wi:x:2', { seatAt: [{ from: T(1), seat: 'id:q' as CanonicalKey }], signalAt: [{ from: T(1), signal: on }], member: [{ from: T(1), to: null }] }),
    ], ['id:p', 'id:q']);
    const b = boardFacts(f);
    expect([...b.pieces.keys()]).toEqual(['wi:x:2']);
    expect(b.seats).toEqual(['id:q']);
    expect(planSolar(b, pack).seats.map((s) => s.person)).toEqual(['id:q']);
  });

  it('keeps a ghost where it went off until it is reseated to a seat on the board, and never opens a seat for it (23 C9)', () => {
    const p = piece('wi:x:3', {
      seatAt: [{ from: T(0), seat: 'id:q' as CanonicalKey }, { from: T(3), seat: 'id:r' as CanonicalKey }],
      signalAt: [{ from: T(0), signal: on }, { from: T(2), signal: off }, { from: T(5), signal: on }],
    });
    // id:r is on the board (it holds the piece from day 5): the ghost goes there when reseated, on day 3.
    const b = boardFacts(facts([p], ['id:q', 'id:r']));
    expect(b.pieces.get(p.key)!.seatAt).toEqual([{ from: T(0), seat: 'id:q' }, { from: T(3), seat: 'id:r' }]);
    expect(b.seats).toEqual(['id:q', 'id:r']);
    // Never back on: id:r holds nothing on the ladder, so it is no seat and the ghost stays at id:q.
    const q = { ...p, signalAt: p.signalAt.slice(0, 2) };
    const c = boardFacts(facts([q], ['id:q', 'id:r']));
    expect(c.pieces.get(p.key)!.seatAt).toEqual([{ from: T(0), seat: 'id:q' }]);
    expect(c.seats).toEqual(['id:q']);
    // Never back on, but id:r holds another piece: the ghost takes a slot at id:r, which stays a seat of that piece alone.
    const other = piece('wi:x:4', { seatAt: [{ from: T(0), seat: 'id:r' as CanonicalKey }], signalAt: [{ from: T(0), signal: on }] });
    const d = boardFacts(facts([q, other], ['id:q', 'id:r']));
    expect(d.pieces.get(p.key)!.seatAt).toEqual([{ from: T(0), seat: 'id:q' }, { from: T(3), seat: 'id:r' }]);
    expect(d.seats).toEqual(['id:q', 'id:r']);
    // A reseat to no one, or to a seat not on the board, still waits.
    const away = { ...q, seatAt: [{ from: T(0), seat: 'id:q' as CanonicalKey }, { from: T(3), seat: null }] };
    expect(boardFacts(facts([away, other], ['id:q', 'id:r'])).pieces.get(p.key)!.seatAt).toEqual([{ from: T(0), seat: 'id:q' }]);
  });

  it('a ghost reseated while Off has a slot at its new seat, after the pieces that were on the ladder there (23 C9)', () => {
    const q = 'id:q' as CanonicalKey;
    const r = 'id:r' as CanonicalKey;
    const ghost = piece('wi:x:3', {
      seatAt: [{ from: T(0), seat: q }, { from: T(3), seat: r }],
      signalAt: [{ from: T(0), signal: on }, { from: T(2), signal: off }],
    });
    const stays = piece('wi:x:5', { seatAt: [{ from: T(0), seat: q }], signalAt: [{ from: T(0), signal: on }] });
    const r1 = piece('wi:x:9', { seatAt: [{ from: T(1), seat: r }], signalAt: [{ from: T(1), signal: on }], member: [{ from: T(1), to: null }] });
    const r2 = piece('wi:x:2', { seatAt: [{ from: T(4), seat: r }], signalAt: [{ from: T(4), signal: on }], member: [{ from: T(4), to: null }] });
    const f = boardFacts(facts([ghost, stays, r1, r2], [q, r]));
    const plan = planSolar(f, pack);
    // Before the reseat it stands at q's planet, on a slot there; from the reseat, on a slot of r's mandala.
    const before = pieceAt(plan, f, ghost.key, T(2) + 1)!;
    const after = pieceAt(plan, f, ghost.key, T(6))!;
    expect(before.seat).toBe(q);
    expect(after.seat).toBe(r);
    expect(after.mode).toBe('formation');
    expect(plan.slots.get(`${r}|${ghost.key}`)).toBe(after);
    const seatR = plan.seats.find((s) => s.person === r)!;
    const m = seatR.mandala!;
    // On r's planet, inside its disc, a slot of its own: nothing else of r's shares it.
    expect(Math.hypot(after.x - seatR.x, after.y - seatR.y) + m.pieceR).toBeLessThanOrEqual(GEOMETRY.planetR + 1e-6);
    const mates = [r1, r2].map((x) => plan.slots.get(`${r}|${x.key}`)!);
    for (const k of mates) expect(Math.hypot(after.x - k.x, after.y - k.y)).toBeGreaterThan(m.pieceR);
    // Every slot lies on r's planet in the same formation (one per piece): three objectives, ghost last (R4: the others' order is theirs).
    const order = [...plan.slots.values()].filter((x) => x.seat === r && x.formation).sort((a, b) => a.index - b.index).map((x) => x.piece);
    expect(order).toEqual([r1.key, r2.key, ghost.key]);
    // Without the ghost the other two keep the same indices.
    const without = planSolar(boardFacts(facts([{ ...ghost, seatAt: [{ from: T(0), seat: q }] }, stays, r1, r2], [q, r])), pack);
    expect(without.slots.get(`${r}|${r1.key}`)!.index).toBe(0);
    expect(without.slots.get(`${r}|${r2.key}`)!.index).toBe(1);
    // A ghost holds nothing: at day 3 r holds r1 alone (seatReason counts held spans, so the vacancy and the seats agree).
    expect(seatReason(f, r, T(3))).toEqual({ kind: 'holds', count: 1 });
  });

  it('gives no ghost slot to an Off stretch no reseat began (23 C9)', () => {
    const q = 'id:q' as CanonicalKey;
    const r = 'id:r' as CanonicalKey;
    // Off at q before the round, reseated to r on day 4 while Off, back on at r on day 5.
    const g = piece('wi:x:3', { member: [{ from: T(-5), to: null }], seatAt: [{ from: T(-5), seat: q }, { from: T(4), seat: r }], signalAt: [{ from: T(-5), signal: on }, { from: T(-2), signal: off }, { from: T(5), signal: on }] });
    const oq = piece('wi:x:5', { seatAt: [{ from: T(0), seat: q }], signalAt: [{ from: T(0), signal: on }] });
    const or = piece('wi:x:6', { seatAt: [{ from: T(0), seat: r }], signalAt: [{ from: T(0), signal: on }] });
    const f = boardFacts(facts([g, oq, or], [q, r]));
    const plan = planSolar(f, pack);
    expect(pieceAt(plan, f, g.key, T(1))).toBeNull(); // Off at q with no reseat: no slot at q, as before
    expect(pieceAt(plan, f, g.key, T(4) + 1)?.seat).toBe(r); // the reseat while Off: a slot at r
    expect(pieceAt(plan, f, g.key, T(6))?.seat).toBe(r);
    expect(plan.slots.has(`${q}|${g.key}`)).toBe(false);
  });

  it('is memoised, and board facts map to themselves', () => {
    const f = solarSource.facts(h, regions[0]!.ref);
    expect(solarSource.facts(h, regions[0]!.ref)).toBe(f);
    expect(boardFacts(f)).toBe(f);
  });
});

describe('the board on mini sprints: ghosts, dropped pieces, ships and the schedule’s facts (17 W3-T3)', () => {
  // One pod's one-week sprint, three people. Invented names only (INV-18).
  const POD = 'Brinewick\\Heron Pod';
  const SPRINT = 'Brinewick\\Sprint 3';
  const IN = { area: POD, iteration: SPRINT };
  const mini = (name: string) => scenario(`solar-probe-${name}`, { project: 'Brinewick', tz: 'UTC', range: ['2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z'] })
    .area('Brinewick', 24000).area(POD, 24001, { favorite: true, defaultScope: true }).area('Brinewick\\Tern Pod', 24002)
    .iteration(SPRINT, 24100, '2026-11-02T00:00:00Z', '2026-11-09T00:00:00Z')
    .repo('brine-api').person('oriel', 'Oriel Fane').person('bram', 'Bram Tolley').person('suki', 'Suki Marsh')
    .at('2026-11-02T09:00:00Z');
  const region = (s: Scenario) => {
    const hh = toHistory(s, mapping, sprintScopes(s).find((x) => x.sprint === SPRINT)!);
    const pod = (hh.scope.sector.kind === 'sprint' ? hh.scope.sector.pods : []).find((p) => p.path === POD)!;
    const ref = { level: 'pod', key: pod.areaKey } as const;
    return { h: hh, ref, scene: SOLAR.format(ref), k: scenarioKeys(s) };
  };
  const day = (d: number) => Date.parse(`2026-11-0${2 + d}T12:00:00Z`);
  const ships = (g: ViewGraph) => g.nodes.filter((n) => n.kind === 'captain');

  it('gives no ship to the new assignee of a ghost reseated while Off', () => {
    // Oriel's Story goes Removed on day 1 and is handed to Bram on day 2, while Off; Bram holds nothing else.
    const r = region(mini('ghost-reseat')
      .story(24201, 'Tide gauges', { ...IN, assignee: 'oriel' })
      .at('2026-11-03T09:00:00Z').state(24201, 'Removed')
      .at('2026-11-04T09:00:00Z').assign(24201, 'bram')
      .build());
    const f = solarSource.facts(r.h, r.ref);
    expect(f.seats).toEqual([r.k.person('oriel')]);
    const g = graphAt(r.h, r.scene, day(3));
    const ghost = g.nodes.find((n) => n.canonicalKey === r.k.wi(24201))!;
    expect(ghost.piece?.signal.rung).toBe('off');
    // The ghost stays at Oriel's seat, and is no anchor for Bram's ship.
    expect(slotAt(planSolar(f, pack), f, r.k.wi(24201), day(3))?.seat).toBe(r.k.person('oriel'));
    // Oriel removed it herself, so her ship works beside it (INV-07); Bram, who only holds a ghost, has none.
    expect(ships(g).map((n) => n.canonicalKey)).toEqual([r.k.person('oriel')]);
  });

  it('seats a ghost reseated while Off in its new seat’s mandala, when that seat is on the board; it holds nothing there (23 C9)', () => {
    // Oriel's Tide gauges goes Removed on day 1 and is handed to Bram on day 2, while Off. Bram holds
    // another Story, so he has a seat; his Story is then Removed too, so the ghost is all his planet holds.
    const r = region(mini('ghost-reseat-seat')
      .story(24211, 'Sea charts', { ...IN, assignee: 'bram' })
      .story(24201, 'Tide gauges', { ...IN, assignee: 'oriel' })
      .story(24212, 'Salt maps', { ...IN, assignee: 'oriel' })
      .at('2026-11-03T09:00:00Z').state(24201, 'Removed')
      .at('2026-11-04T09:00:00Z').assign(24201, 'bram')
      .at('2026-11-06T09:00:00Z').state(24211, 'Removed')
      .build());
    const f = solarSource.facts(r.h, r.ref);
    const plan = planSolar(f, pack);
    const bram = r.k.person('bram');
    expect(f.seats).toContain(bram);
    const seatNode = (g: ViewGraph) => g.nodes.find((n) => n.kind === 'seat' && n.canonicalKey === bram)!;
    // On day 3 the ghost is on Bram's planet, in a slot of its own, and the planet still holds his Story.
    const g3 = graphAt(r.h, r.scene, day(3));
    const ghost = g3.nodes.find((n) => n.canonicalKey === r.k.wi(24201))!;
    expect(ghost.piece?.signal.rung).toBe('off');
    const slot = slotAt(plan, f, r.k.wi(24201), day(3))!;
    expect(slot.seat).toBe(bram);
    expect(slot.mode).toBe('formation');
    expect(ghost.world).toMatchObject({ x: slot.x, y: slot.y });
    expect(ghost.cluster?.id).toBe(slot.formation);
    expect(seatNode(g3).piece?.vacant).toBeUndefined();
    // Before the reseat it stood at Oriel's seat.
    expect(slotAt(plan, f, r.k.wi(24201), day(1))?.seat).toBe(r.k.person('oriel'));
    // It is no anchor for Bram's ship: he works beside his own Story.
    const ship = graphAt(r.h, r.scene, day(3)).nodes.find((n) => n.kind === 'captain' && n.canonicalKey === bram)!;
    expect(ship.attach?.to).not.toBe(ghost.projectionKey);
    // From day 4 (his own Story removed) a planet whose only piece is a ghost is vacant, and seatReason agrees.
    const g5 = graphAt(r.h, r.scene, day(4));
    expect(seatNode(g5).piece?.vacant).toBe(true);
    expect(seatReason(f, bram, day(4))?.kind).not.toBe('holds');
  });

  it('starts every facility in its first form; the round’s first merge transforms it, and the round ends as the scene opens (2026-10-13)', () => {
    // brine-api had a PR merged the week before. Later in the round, one PR opens and stays open
    // (\`pending\`), or opens and merges on day 2 (\`merges\`).
    const story = (merges: boolean) => mini(`form-reset-${merges}`)
      .at('2026-10-26T09:00:00Z').story(24241, 'Harbor tides', { ...IN, assignee: 'oriel' })
      .at('2026-10-27T09:00:00Z').pr(24541, { repo: 'brine-api', author: 'oriel', title: 'Tide table', links: [24241] })
      .at('2026-10-28T09:00:00Z').completePr(24541)
      .at('2026-11-03T09:00:00Z').pr(24542, { repo: 'brine-api', author: 'oriel', title: 'Tide alerts', links: [24241] })
      .at('2026-11-04T09:00:00Z').apply((b) => (merges ? b.completePr(24542) : b))
      .build();
    const formAt = (r: ReturnType<typeof region>, t: number) => {
      const n = graphAt(r.h, r.scene, t).nodes.find((x) => x.kind === 'facility');
      return n ? (n.piece?.merged ?? 0) : null;
    };
    // A merge in the round: the facility starts with none counted, and its first in the round is the one that transforms it.
    const m = region(story(true));
    const f = solarSource.facts(m.h, m.ref);
    expect(f.firstMerge?.get(m.k.repo('brine-api'))).toBe(m.k.pr(24542));
    expect(formAt(m, day(1))).toBe(0);
    expect(formAt(m, day(3))).toBe(1);
    expect(formAt(m, m.h.range.endUtc - 1)).toBe(1);
    // None in the round: it holds its second form throughout, from the merge before it.
    const p = region(story(false));
    expect(solarSource.facts(p.h, p.ref).firstMerge?.has(p.k.repo('brine-api'))).toBe(false);
    expect(formAt(p, day(1))).toBe(1);
    expect(formAt(p, p.h.range.endUtc - 1)).toBe(1);
  });

  it('puts a facility on standby once nothing is open and its PRs have been quiet two days, and wakes it on its next (19 M1)', () => {
    // brine-api's first PR opens on day 0 and merges on day 1 (09:00); its next opens on day 4 and is
    // still open at the round's end, two and a half days later.
    const r = region(mini('standby')
      .story(24251, 'Mooring lines', { ...IN, assignee: 'oriel' })
      .pr(24551, { repo: 'brine-api', author: 'oriel', title: 'Line loads', links: [24251] })
      .at('2026-11-03T09:00:00Z').completePr(24551)
      .at('2026-11-06T09:00:00Z').pr(24552, { repo: 'brine-api', author: 'oriel', title: 'Line alarms', links: [24251] })
      .build());
    const at = (t: number) => graphAt(r.h, r.scene, t).nodes.find((n) => n.kind === 'facility')!;
    const merged = Date.parse('2026-11-03T09:00:00Z');
    const H = 3_600_000;
    const awake = at(merged + 3 * H);
    expect(awake.piece).toMatchObject({ open: 0 });
    expect(awake.piece?.standby).toBeUndefined();
    expect(awake.flags.standby).toBeUndefined();
    expect(awake.activity).toBe(1);
    // Under STANDBY_BELOW (0.25) just past two days of history since the merge, not before.
    expect(STANDBY_BELOW).toBe(0.25);
    expect(at(merged + 48 * H - 60_000).piece?.standby).toBeUndefined();
    const quiet = at(merged + 48 * H + 60_000);
    expect(quiet.piece?.standby).toBe(true);
    expect(quiet.flags.standby).toBe(true);
    expect(quiet.stage.endsWith('|sb=1')).toBe(true);
    expect(quiet.activity).toBe(0.25); // quantised, as a piece's: what's left of a day's halving at two days
    // Its place and size don't change (INV-14, INV-19); its plate and the rest of its look do.
    expect(quiet.world).toEqual(awake.world);
    expect(quiet.compound).toEqual(awake.compound);
    // Its next PR wakes it, and an open one keeps it awake however long it's quiet.
    expect(at(Date.parse('2026-11-06T09:00:00Z')).piece?.standby).toBeUndefined();
    const end = at(r.h.range.endUtc - 1);
    expect(end.piece?.open).toBe(1);
    expect(end.piece?.standby).toBeUndefined();
    expect(end.activity).toBe(0.25);
  });

  it('draws no facility whose attachments link only to pieces that never reach the board', () => {
    const story = (off: boolean) => mini(`dropped-facility-${off}`)
      .story(24211, 'Buoy list', { ...IN, assignee: 'oriel' })
      .story(24212, 'Pier lamps', { ...IN, assignee: 'suki' })
      .apply((b) => (off ? b.state(24212, 'Removed') : b))
      .at('2026-11-03T09:00:00Z').pr(24511, { repo: 'brine-api', author: 'suki', title: 'Lamp feed', links: [24212] })
      .build();
    for (const off of [false, true]) {
      const r = region(story(off));
      const f = solarSource.facts(r.h, r.ref);
      expect(f.pieces.has(r.k.wi(24212))).toBe(!off);
      expect(f.attachments.has(r.k.pr(24511))).toBe(!off);
      expect(planSolar(f, pack).stations.length).toBe(off ? 0 : 1);
      expect(graphAt(r.h, r.scene, day(4)).nodes.some((n) => n.kind === 'facility')).toBe(!off);
    }
  });

  it('reads a linked step by its final parent: one moved onto a dropped piece makes no facility', () => {
    // The Task starts on Oriel's Story, and its PR links it; on day 2 the Task moves to a Story
    // that was Removed from the start (never on the board), so the PR serves nothing drawn.
    const story = (moved: boolean) => mini(`reparented-step-${moved}`)
      .story(24231, 'Mooring rings', { ...IN, assignee: 'oriel' })
      .story(24232, 'Old slipway', { ...IN, assignee: 'suki', state: 'Removed' })
      .task(24233, 'Ring bolts', { ...IN, parent: 24231, assignee: 'oriel' })
      .at('2026-11-03T09:00:00Z').pr(24531, { repo: 'brine-api', author: 'oriel', title: 'Bolt sizes', links: [24233] })
      .at('2026-11-04T09:00:00Z').apply((b) => (moved ? b.unlink(24233, 24231).link(24233, 24232) : b))
      .build();
    for (const moved of [false, true]) {
      const r = region(story(moved));
      const f = solarSource.facts(r.h, r.ref);
      expect(f.pieces.has(r.k.wi(24232))).toBe(false);
      expect(f.attachments.has(r.k.pr(24531))).toBe(!moved);
      expect(planSolar(f, pack).stations.length).toBe(moved ? 0 : 1);
    }
  });

  it('puts a seat’s fallback ship by where its person last worked (INV-07), on that planet’s loiter ring by arrival (22 D3), at a captain’s size', () => {
    // Oriel's only Story is finished on day 1 (a trophy on her planet); on day 2 she resolves Bram's.
    const r = region(mini('fallback-ship')
      .story(24221, 'Harbour charts', { ...IN, assignee: 'oriel' })
      .story(24222, 'Ferry times', { ...IN, assignee: 'bram' })
      .at('2026-11-03T09:00:00Z').state(24221, 'Active').state(24221, 'Closed')
      .at('2026-11-04T09:00:00Z').state(24222, 'Active', { by: 'oriel' })
      .build());
    const g = graphAt(r.h, r.scene, day(3));
    expect(g.nodes.some((n) => n.canonicalKey === r.k.wi(24221) && n.cluster === undefined)).toBe(true); // a standalone trophy
    const oriel = ships(g).find((n) => n.canonicalKey === r.k.person('oriel'))!;
    const bram = ships(g).find((n) => n.canonicalKey === r.k.person('bram'))!;
    const planetOf = (gr: typeof g, who: string) => gr.nodes.find((n) => n.kind === 'seat' && n.canonicalKey === r.k.person(who))!;
    // At the planet the work is on (Bram's): Bram was there first, on the far side; Oriel beside him.
    expect(oriel.attach?.to).toBe(planetOf(g, 'bram').projectionKey);
    expect(bram.attach?.loiter).toBe(0);
    expect(oriel.attach?.loiter).toBe(1);
    const ring = planetOf(g, 'bram');
    for (const ship of [oriel, bram]) expect(Math.hypot(ship.world.x - ring.world.x, ship.world.y - ring.world.y)).toBeCloseTo(ring.loiterR!, 6);
    // Slot 0 on the far side from the star: the star, the planet and the ship in a line.
    const far = { x: ring.world.x / Math.hypot(ring.world.x, ring.world.y), y: ring.world.y / Math.hypot(ring.world.x, ring.world.y) };
    expect(bram.attach!.dirX * far.x + bram.attach!.dirY * far.y).toBeCloseTo(1, 9);
    expect(oriel.world.r).toBe(bram.world.r);
    // Before she worked on Bram's Story, by the last thing she worked on: her own, now a trophy on her
    // planet, so she rests on her own planet's ring.
    const before = graphAt(r.h, r.scene, Date.parse('2026-11-03T12:00:00Z'));
    const was = ships(before).find((n) => n.canonicalKey === r.k.person('oriel'))!;
    expect(was.attach?.to).toBe(planetOf(before, 'oriel').projectionKey);
    expect(was.attach?.loiter).toBe(0);
  });

  it('folds the schedule’s facts with in-scope creation as membership and unbinds clearing a parent', () => {
    // An area bundle is rooted at its Features: one in the pod, with a Story out of it in another pod.
    const s = mini('schedule-facts')
      .feature(24031, 'Harbour season', { area: POD })
      .story(24231, 'Net mending', { ...IN, parent: 24031, assignee: 'oriel' })
      .story(24232, 'Sail lofts', { area: 'Brinewick\\Tern Pod', iteration: SPRINT, parent: 24031, assignee: 'bram' })
      .task(24331, 'Twine stock', { parent: 24231, iteration: SPRINT, assignee: 'oriel' })
      .at('2026-11-04T09:00:00Z').unlink(24331, 24231)
      .build();
    const hh = toHistory(s, mapping); // the pod's own area: not a round, so the schedule's own fold
    const k = scenarioKeys(s);
    expect(hh.scope.sector.kind).toBe('area');
    const f = paceFacts(hh);
    expect(f).toBe(boardFacts(scheduleFacts(hh, packFor(hh))));
    expect(f.pieces.get(k.wi(24231))!.member).toEqual([{ from: Date.parse('2026-11-02T09:00:00Z'), to: null }]);
    expect(f.pieces.has(k.wi(24232))).toBe(false); // never in the scope: not a piece here (23 D3)
    expect(f.pieces.get(k.wi(24331))!.parent).toBeNull();
    expect(f.pieces.get(k.wi(24231))!.steps).toEqual([k.wi(24331)]);
  });
});
