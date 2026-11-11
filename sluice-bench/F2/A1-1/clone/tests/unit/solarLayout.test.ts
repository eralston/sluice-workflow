// 14 §4 — the solar plan (17 W1-T3), over hand-built round facts, so it needs no pack code: seat
// angles and orbits, the 3 + 3 free cap in arrival order (13 Q6), slots at every seat a piece
// visited, hex formations, facility placement, compound first-fit, and a plan that never depends
// on the playhead (INV-14). The plan reads the facts' own readers (engine/facts): a frontier slot
// before a piece's first seat, and no seat or slot for a visit made while Off.
import { describe, expect, it } from 'vitest';
import type { CanonicalKey, UtcMs } from '@shared/contracts/keys';
import { seededRandom } from '@shared/hash';
import { heldSpans, memberAt, seatAtTime, seatsOf } from '@shared/engine/facts';
import { attachmentAngle, compoundAt, compoundSlots, firstFit, guardCount } from '@shared/engine/solar/compound';
import { pieceAt, planSolar, slotKey, type PlanPack } from '@shared/engine/solar/plan';
import { angleSlots, arcDistance, baseAngle, normAngle, rhoRange, strideFor, type Circle } from '@shared/engine/solar/seats';
import * as slotsModule from '@shared/engine/solar/slots';
import { visitsOf } from '@shared/engine/solar/slots';
import { BODY_PAD, gapAngles, OUTER_SIZE, STATION_PAD } from '@shared/engine/solar/stations';
import { FACILITY_REACH, GEOMETRY, SOLAR_LAYOUT_VERSION, SQUASH } from '@shared/engine/solar/version';
import type { AttachmentFacts, Interval, PieceFacts, Role, RoundFacts, Signal, SolarPlan } from '@shared/engine/types';

const ORG = 'org-tidewater';
const REGION = `area:${ORG}:proj-1:7`;
const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 7);
const END = START + 14 * DAY;
const PACK: PlanPack = { id: 'test' };

const person = (n: number) => `id:${ORG}:person-${n}` as CanonicalKey;
const wi = (n: number) => `wi:${ORG}:${n}` as CanonicalKey;
const repo = (n: number) => `repo:${ORG}:repo-${n}` as CanonicalKey;
const pr = (r: number, n: number) => `pr:${ORG}:repo-${r}:${n}` as CanonicalKey;

/** A piece seated as `seats` says ([time, seat]), a member over `member` (default: the whole round on). */
function piece(key: CanonicalKey, role: Role, seats: [UtcMs, CanonicalKey | null][], member: Interval[] = [{ from: START, to: null }], parent: CanonicalKey | null = null): PieceFacts {
  return { key, role, member, seatAt: seats.map(([from, seat]) => ({ from, seat })), signalAt: [], steps: [], parent };
}

function attachment(key: CanonicalKey, facility: CanonicalKey, open: Interval, links: CanonicalKey[], author: CanonicalKey | null = null): AttachmentFacts {
  return { key, facility, author, open, links, approvers: [], signalAt: [] };
}

function facts(pieces: PieceFacts[], seats: CanonicalKey[], attachments: AttachmentFacts[] = []): RoundFacts {
  return {
    round: { startUtc: START, endUtc: END }, region: REGION,
    pieces: new Map(pieces.map((p) => [p.key, p])), seats,
    attachments: new Map(attachments.map((a) => [a.key, a])), moves: new Map(),
  };
}

/** `n` seats; seat i holds `obj` objectives and `thr` threats from the start. */
function crowd(n: number, obj = 1, thr = 0): RoundFacts {
  const pieces: PieceFacts[] = [];
  const seats = Array.from({ length: n }, (_, i) => person(i));
  seats.forEach((s, i) => {
    for (let k = 0; k < obj; k++) pieces.push(piece(wi(20000 + i * 100 + k), 'objective', [[START, s]]));
    for (let k = 0; k < thr; k++) pieces.push(piece(wi(20050 + i * 100 + k), 'threat', [[START, s]]));
  });
  return facts(pieces, seats);
}

const slotsOf = (plan: SolarPlan) => [...plan.slots.values()];
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Every disc the packer keeps clear for a seat (22 Block D): its whole mandala, the loiter ring and a ship's length past it. */
function seatDiscs(plan: SolarPlan, person: CanonicalKey): Circle[] {
  const seat = plan.seats.find((s) => s.person === person)!;
  return [{ x: seat.x, y: seat.y, r: seat.mandala!.loiterR + 2 * GEOMETRY.shipR }];
}

/** A plan as plain data, slots in key order, for deep comparison. */
const plain = (plan: SolarPlan) => JSON.parse(JSON.stringify({ ...plan, slots: [...plan.slots.entries()] }));

describe('seats: angles and the stride (14 §4)', () => {
  it('picks the coprime stride nearest n/φ, searched outward, for n = 1..12', () => {
    for (let n = 1; n <= 12; n++) {
      const s = strideFor(n);
      expect(gcd(s, n)).toBe(1);
      if (n <= 2) expect(s).toBe(1);
      else {
        const target = n / ((1 + Math.sqrt(5)) / 2);
        for (let c = 1; c < n; c++) if (gcd(c, n) === 1) expect(Math.abs(c - target)).toBeGreaterThanOrEqual(Math.abs(s - target));
      }
      expect([...angleSlots(n)].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
    expect([3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(strideFor)).toEqual([2, 3, 3, 5, 4, 5, 5, 7, 7, 7]);
  });

  it('fixes each seat\'s angle from the seat count and the region alone, 2π / n apart, for n = 1..12', () => {
    const base = baseAngle(REGION);
    for (let n = 1; n <= 12; n++) {
      const sparse = planSolar(crowd(n, 1, 0), PACK);
      const dense = planSolar(crowd(n, 5, 4), PACK);
      const want = angleSlots(n).map((slot) => normAngle(base + (2 * Math.PI * slot) / n));
      expect(sparse.seats.map((s) => s.angle)).toEqual(want);
      expect(dense.seats.map((s) => s.angle)).toEqual(want);
      // Every angle slot is taken once: the seats are exactly 2π / n apart round the star.
      const sorted = [...want].sort((x, y) => x - y);
      for (let i = 1; i < n; i++) expect(sorted[i]! - sorted[i - 1]!).toBeCloseTo((2 * Math.PI) / n, 9);
      for (const s of sparse.seats) {
        expect(s.ry).toBeCloseTo(s.rx * SQUASH, 9);
        expect(s.x).toBeCloseTo(s.rx * Math.cos(s.angle), 6);
        expect(s.y).toBeCloseTo(s.ry * Math.sin(s.angle), 6);
      }
    }
  });

  it('puts every seat on one regular ring: one radius, even angles, mirror-symmetric (v4)', () => {
    for (let n = 1; n <= 12; n++) {
      for (const [obj, thr] of [[1, 0], [3, 3], [9, 14]] as const) {
        const plan = planSolar(crowd(n, obj, thr), PACK);
        expect(new Set(plan.seats.map((s) => s.rx)).size).toBe(1);
        expect(new Set(plan.seats.map((s) => s.ry)).size).toBe(1);
      }
    }
    // The ring is canonical: the first seat at the top, whatever the region.
    expect(baseAngle('area:a')).toBe(baseAngle('area:b'));
    const four = planSolar(crowd(4, 3, 3), PACK);
    const xs = four.seats.map((s) => Math.round(s.x)).sort((a, b) => a - b);
    expect(xs[0]).toBe(-xs[3]!); // left and right mirror
    const ys = four.seats.map((s) => Math.round(s.y)).sort((a, b) => a - b);
    expect(ys[0]).toBe(-ys[3]!); // top and bottom mirror
  });

  it('keeps every seat\'s footprint clear of the star and of every other seat\'s, with the gap, for n = 1..12', () => {
    for (let n = 1; n <= 12; n++) {
      for (const [obj, thr] of [[1, 0], [3, 3], [9, 14]] as const) {
        const plan = planSolar(crowd(n, obj, thr), PACK);
        for (const a of plan.seats) {
          for (const d of seatDiscs(plan, a.person)) expect(Math.hypot(d.x, d.y)).toBeGreaterThanOrEqual(d.r + GEOMETRY.starR + GEOMETRY.starGap - 1e-6);
          for (const b of plan.seats) {
            if (a.person >= b.person) continue;
            for (const da of seatDiscs(plan, a.person)) for (const db of seatDiscs(plan, b.person)) expect(dist(da, db)).toBeGreaterThanOrEqual(da.r + db.r + GEOMETRY.seatGap - 1e-6);
          }
        }
        // And the frontier belt lies outside every footprint.
        for (const a of plan.seats) for (const d of seatDiscs(plan, a.person)) expect(plan.frontier.rx0).toBeGreaterThan(rhoRange(d)[1]);
      }
    }
  });

  it('draws each orbit as an arc through its planet, as wide as its footprint, and no wider than a quarter turn', () => {
    for (const n of [1, 4, 9]) {
      const plan = planSolar(crowd(n, 3, 3), PACK);
      for (const seat of plan.seats) {
        expect(seat.arc).toBeGreaterThanOrEqual(GEOMETRY.arcMin);
        expect(seat.arc).toBeLessThanOrEqual(Math.PI / 2);
        expect(arcDistance(seat, seat.x, seat.y)).toBeCloseTo(0, 6); // the planet sits on its own arc
        // A point on the far side of the star is past the arc's ends.
        expect(arcDistance(seat, -seat.x, -seat.y)).toBe(Infinity);
      }
    }
  });
});

describe('regions: standalone pieces in the shadow behind each planet (13 §3, v4)', () => {
  const [A, B] = [person(1), person(2)];
  // Objectives at A: 20003 and 20001 held at the start; 20002 (from B) and 20004 arrive on day 1,
  // 20005 on day 2. Threats: 20011..20014 all held at the start.
  const pieces = [
    piece(wi(20003), 'objective', [[START - DAY, A]]),
    piece(wi(20001), 'objective', [[START, A]]),
    piece(wi(20004), 'objective', [[START, null], [START + DAY, A]]),
    piece(wi(20002), 'objective', [[START, B], [START + DAY, A]]),
    piece(wi(20005), 'objective', [[START, A]], [{ from: START + 2 * DAY, to: null }]),
    ...[20011, 20012, 20013, 20014].map((n) => piece(wi(n), 'threat', [[START, A]])),
    piece(wi(20020), 'objective', [[START, B]]),
    piece(wi(20030), 'step', [[START, A]], undefined, wi(20001)),
  ];
  const f = facts(pieces, [A, B]);
  const plan = planSolar(f, PACK);
  const at = (seat: CanonicalKey | 'frontier', p: number) => plan.slots.get(slotKey(seat, wi(p)));

  it('has no free cap: every piece is standalone at full size, in arrival order within its role\'s group', () => {
    const objectives = plan.formations.find((x) => x.id === `${A}|objective`)!;
    expect(objectives.members).toEqual([wi(20001), wi(20003), wi(20002), wi(20004), wi(20005)]);
    expect(plan.formations.find((x) => x.id === `${A}|threat`)!.members).toEqual([20011, 20012, 20013, 20014].map(wi));
    expect(plan.formations.map((x) => x.id).sort()).toEqual([`${A}|objective`, `${A}|threat`, `${B}|objective`]);
    // One size on each planet, its mandala's (22 D1: a busy planet's are smaller), never more than full size.
    for (const st of slotsOf(plan).filter((x) => x.mode !== 'frontier')) {
      expect(st.mode).toBe('formation');
      expect(st.r).toBe(plan.seats.find((x) => x.person === st.seat)!.mandala!.pieceR);
      expect(st.r).toBeLessThanOrEqual(GEOMETRY.pieceR);
    }
    expect([20001, 20003, 20002, 20004, 20005].map((p) => at(A, p)!.index)).toEqual([0, 1, 2, 3, 4]);
    // Steps ride on their parent: no slot of their own.
    expect(slotsOf(plan).some((s) => s.piece === wi(20030))).toBe(false);
  });

  it('gives a piece moved between seats a slot at both, and one in the frontier while unassigned', () => {
    expect(at(B, 20002)).toMatchObject({ mode: 'formation', index: 0 }); // 20002 and 20020 both start at B: by key
    expect(at(A, 20002)).toMatchObject({ mode: 'formation', index: 2 });
    expect(pieceAt(plan, f, wi(20002), START + DAY / 2)).toBe(at(B, 20002));
    expect(pieceAt(plan, f, wi(20002), START + 2 * DAY)).toBe(at(A, 20002));
    expect(at('frontier', 20004)).toMatchObject({ mode: 'frontier', index: 0 });
    expect(pieceAt(plan, f, wi(20004), START + DAY / 2)).toBe(at('frontier', 20004));
    expect(pieceAt(plan, f, wi(20004), START + 3 * DAY)).toBe(at(A, 20004));
    // Not yet a member: nowhere.
    expect(pieceAt(plan, f, wi(20005), START + DAY)).toBeNull();
    // Seated before it joined (20005 is at A from the start, a member from day 2): no frontier slot.
    expect(at('frontier', 20005)).toBeUndefined();
  });

  it('counts only the round: work reassigned before the start or after the end leaves no seat or slot', () => {
    const [A2, B2, C2] = [person(11), person(12), person(13)];
    const early = START - 10 * DAY;
    const before = [{ from: early, to: null }];
    const pieces2 = [
      piece(wi(20101), 'objective', [[early, A2], [START - 5 * DAY, B2]], before),
      piece(wi(20102), 'objective', [[early, C2], [START - 5 * DAY, B2]], before),
      piece(wi(20103), 'objective', [[early, null], [START - DAY, B2]], before),
      ...[20104, 20105, 20106].map((n) => piece(wi(n), 'objective', [[START, null], [START + 2 * DAY, C2]])),
      piece(wi(20107), 'objective', [[START, B2], [END, A2]]),
    ];
    const g = facts(pieces2, [B2, C2]);
    const plan2 = planSolar(g, PACK);
    const at2 = (seat: CanonicalKey | 'frontier', p: number) => plan2.slots.get(slotKey(seat, wi(p)));
    // No phantom planet for A2, who held nothing during the round.
    expect(plan2.seats.map((s) => s.person)).toEqual([B2, C2]);
    expect(slotsOf(plan2).some((s) => s.seat === A2)).toBe(false);
    // 20102 left C2 before the start, so C2's three in-round arrivals take indices 0..2, in key order.
    expect(at2(C2, 20102)).toBeUndefined();
    expect([20104, 20105, 20106].map((p) => at2(C2, p)!.index)).toEqual([0, 1, 2]);
    // B2 held 20101..20103 and 20107 at the start: by key.
    expect([20101, 20102, 20103, 20107].map((p) => at2(B2, p)!.index)).toEqual([0, 1, 2, 3]);
    // Unassigned only before the start: no frontier slot.
    expect(at2('frontier', 20103)).toBeUndefined();
    // The plan is the one the in-round history alone gives.
    const trimmed = facts([
      ...[20101, 20102, 20103].map((n) => piece(wi(n), 'objective', [[START, B2]])),
      ...pieces2.slice(3, 6),
      piece(wi(20107), 'objective', [[START, B2]]),
    ], [B2, C2]);
    expect(plain(plan2)).toEqual(plain(planSolar(trimmed, PACK)));
  });

  it('lays the pieces on the planet (22 D1): stories on its left half, bugs on its right, each mirrored across the equator, padded, one size', () => {
    for (const [n, obj, thr] of [[1, 3, 3], [2, 5, 2], [4, 1, 6], [9, 4, 4]] as const) {
      const plan3 = planSolar(crowd(n, obj, thr), PACK);
      for (const seat of plan3.seats) {
        const own = plan3.formations.filter((x) => x.seat === seat.person);
        const m = seat.mandala!;
        for (const fm of own) {
          // Centred on the planet itself; each class on its own half.
          expect([fm.cx, fm.cy]).toEqual([seat.x, seat.y]);
          const side = fm.role === 'objective' ? -1 : 1;
          for (const o of fm.offsets) expect(side * o.x).toBeGreaterThan(0);
          // Mirror symmetry across the equator: every slot's mirror is a slot.
          for (const o of fm.offsets) expect(fm.offsets.some((q) => Math.abs(q.x - o.x) < 1e-6 && Math.abs(q.y + o.y) < 1e-6)).toBe(true);
          // Inside the disc.
          for (const o of fm.offsets) expect(Math.hypot(o.x, o.y) + m.pieceR).toBeLessThanOrEqual(GEOMETRY.planetR + 1e-6);
          expect(fm.memberR).toBe(m.pieceR);
        }
        // Half a slot of padding between any two, across the meridian too; and one size on both sides.
        const all = own.flatMap((fm) => fm.offsets);
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(dist(all[i]!, all[j]!)).toBeGreaterThanOrEqual(3 * m.pieceR - 1e-6);
        expect(m.pieceR).toBe(Math.min(GEOMETRY.pieceR, m.room));
      }
    }
    // However many: every piece has a slot, smaller on a busier planet.
    const many = planSolar(crowd(2, 14, 14), PACK);
    for (const fm of many.formations) expect(fm.offsets).toHaveLength(14);
    expect(many.seats[0]!.mandala!.pieceR).toBeLessThan(GEOMETRY.pieceR);
    expect(planSolar(crowd(2, 1, 1), PACK).seats[0]!.mandala!.pieceR).toBe(GEOMETRY.pieceR);
  });

  it('puts every piece that closes here on one trophy ring (22 D2), in close order from the star line, shells past a full ring', () => {
    const A = person(1);
    const done: Signal = { rung: 'accomplished' };
    const ready: Signal = { rung: 'ready' };
    // 20 stories and bugs closing an hour apart, in reverse key order; one that never closes.
    const closing = Array.from({ length: 20 }, (_, k) => ({ ...piece(wi(20300 + k), k % 3 === 0 ? 'threat' : 'objective', [[START, A]]), signalAt: [{ from: START, signal: ready }, { from: START + (20 - k) * 3_600_000, signal: done }] }));
    const open = piece(wi(20399), 'objective', [[START, A]]);
    const plan4 = planSolar(facts([...closing, open], [A]), PACK);
    const seat = plan4.seats[0]!;
    const m = seat.mandala!;
    const trophies = [...plan4.platforms.values()].filter((x) => x.seat === A).sort((a, b) => a.index - b.index);
    expect(trophies).toHaveLength(20);
    expect(m.trophies).toBe(20);
    expect(trophies.some((t) => t.piece === wi(20399))).toBe(false); // never closed: no trophy
    expect(trophies.map((t) => t.piece)).toEqual(Array.from({ length: 20 }, (_, k) => wi(20319 - k))); // close order
    const wt = 2 * GEOMETRY.platformR;
    const toStar = { x: -seat.x / Math.hypot(seat.x, seat.y), y: -seat.y / Math.hypot(seat.x, seat.y) };
    const rel = (t: { x: number; y: number }) => ({ x: t.x - seat.x, y: t.y - seat.y });
    // The first on the star line, a full trophy off the rim; the next either side of it in turn.
    const first = rel(trophies[0]!);
    expect(Math.hypot(first.x, first.y)).toBeCloseTo(GEOMETRY.planetR + 1.5 * wt, 6);
    expect((first.x * toStar.x + first.y * toStar.y) / Math.hypot(first.x, first.y)).toBeCloseTo(1, 9);
    const cross = (t: { x: number; y: number }) => toStar.x * rel(t).y - toStar.y * rel(t).x;
    expect(Math.sign(cross(trophies[1]!))).toBe(-Math.sign(cross(trophies[2]!)));
    // Ring 0: neighbours at most two slots apart along it (a gap of one slot at most), never overlapping.
    const s0 = m.shells[0]!;
    expect((2 * Math.PI * s0.r) / s0.n).toBeLessThanOrEqual(2 * wt + 1e-6);
    expect((2 * Math.PI * s0.r) / s0.n).toBeGreaterThanOrEqual(wt);
    // Past a full ring, the next shell: further out, turned half a slot.
    expect(m.shells.length).toBe(2);
    expect(m.shells[1]!.r).toBeCloseTo(s0.r + Math.sqrt(3) * wt, 6);
    expect(m.shells[1]!.turn).toBeCloseTo(Math.PI / m.shells[1]!.n, 9);
    for (let i = 0; i < trophies.length; i++) for (let j = i + 1; j < trophies.length; j++) expect(dist(trophies[i]!, trophies[j]!)).toBeGreaterThanOrEqual(wt - 1e-6);
    // The loiter ring (22 D3): past the last shell by one more trophy slot; on a bare planet, 2.5 slots off it (its one empty shell is 1.5 off).
    expect(m.loiterR).toBeCloseTo(m.shells[1]!.r + wt, 6);
    expect(planSolar(crowd(1, 1, 0), PACK).seats[0]!.mandala!.loiterR).toBeCloseTo(GEOMETRY.planetR + 2.5 * wt, 6);
  });
});

describe('formations: the slots of every member a role ever had (14 §4, 22 D1)', () => {
  it('gives a role the slots of the most members it ever had, never the playhead\'s (22 D1)', () => {
    const A = person(1);
    // Nine objectives, but only two at once: members leave as others join. The role still has nine
    // members ever, and nine cells.
    const pieces = Array.from({ length: 9 }, (_, k) => piece(wi(20100 + k), 'objective', [[START, A]], [{ from: START + k * DAY, to: START + (k + 2) * DAY }]));
    const plan = planSolar(facts(pieces, [A]), PACK);
    const fm = plan.formations[0]!;
    expect(fm.members).toHaveLength(9);
    expect(fm.offsets).toHaveLength(9);
    expect(fm.memberR).toBe(plan.seats[0]!.mandala!.pieceR);
    for (const m of fm.members) expect(plan.slots.get(slotKey(A, m))!.r).toBe(fm.memberR);
  });
});

describe('facilities on two regular rings (22 C11, 05 §8 S-8, 08 §7)', () => {
  const [A, B, C] = [person(1), person(2), person(3)];
  const pieces = [
    ...Array.from({ length: 8 }, (_, k) => piece(wi(20200 + k), 'objective', [[START, A]])),
    ...Array.from({ length: 6 }, (_, k) => piece(wi(20210 + k), 'threat', [[START, A]])),
    piece(wi(20220), 'objective', [[START, B]]),
    piece(wi(20230), 'threat', [[START, C]]),
    ...Array.from({ length: 5 }, (_, k) => piece(wi(20240 + k), 'objective', [[START, C]])),
    piece(wi(20250), 'step', [[START, C]], undefined, wi(20230)),
    piece(wi(20260), 'objective', [[START, null]]),
  ];
  const atts = [
    // Repo 1 serves A and B: two links to A, one to B. Opened first by person 2.
    attachment(pr(1, 21000), repo(1), { from: START + DAY, to: START + 3 * DAY }, [wi(20200), wi(20201)], B),
    attachment(pr(1, 21001), repo(1), { from: START + 2 * DAY, to: null }, [wi(20220)], A),
    // Repo 2 serves C alone, through a step whose parent is at C.
    attachment(pr(2, 21002), repo(2), { from: START + DAY / 2, to: null }, [wi(20250)], C),
    // Repo 3 serves crowded A alone.
    attachment(pr(3, 21003), repo(3), { from: START + 4 * DAY, to: null }, [wi(20205)], A),
    // Repo 4 links only frontier work: no seat, no aim.
    attachment(pr(4, 21004), repo(4), { from: START + 5 * DAY, to: null }, [wi(20260)], null),
  ];
  const plan = planSolar(facts(pieces, [A, B, C], atts), PACK);
  const st = (r: number) => plan.stations.find((s) => s.facility === repo(r))!;
  const step = (2 * Math.PI) / plan.seats.length;
  const top = plan.seats.find((x) => x.index === 0)!.angle;
  const angle = (s: { x: number; y: number }) => Math.atan2(s.y / SQUASH, s.x);
  const rho = (s: { x: number; y: number }) => Math.hypot(s.x, s.y / SQUASH);
  /** How far a station's angle is from the nearest half-way point between two planets. */
  const offGap = (s: { x: number; y: number }) => { const u = normAngle(angle(s) - top) / step; return Math.abs(u - Math.floor(u) - 0.5) * step; };

  it('serves the seats its attachments link to, weighted, and arrives when first needed', () => {
    expect(plan.stations.map((s) => s.facility)).toEqual([repo(2), repo(1), repo(3), repo(4)]); // by enterAt
    expect(st(1)).toMatchObject({ serves: [A, B], mode: 'inner', size: 1, enterAt: START + DAY, summoner: B, cap: 6 });
    // Three planets, three gaps: two multi-seat facilities keep a slot each; the first one-seat arrival
    // takes the last; the later one goes outside, smaller.
    expect(st(2)).toMatchObject({ serves: [C], mode: 'inner', size: 1, enterAt: START + DAY / 2, summoner: C });
    expect(st(3)).toMatchObject({ serves: [A], mode: 'outer', size: OUTER_SIZE });
    expect(st(4)).toMatchObject({ serves: [], mode: 'inner', summoner: null });
  });

  it('keeps every facility a facility’s width from its ring’s others, half that from the star and planets, the usual gap from the rest', () => {
    const discs: Circle[] = [
      { x: 0, y: 0, r: GEOMETRY.starR },
      ...plan.seats.map((s) => ({ x: s.x, y: s.y, r: GEOMETRY.planetR })),
      ...slotsOf(plan).filter((s) => s.mode !== 'frontier'),
      ...plan.formations.map((x) => ({ x: x.cx, y: x.cy, r: x.outerR })),
    ];
    for (const s of plan.stations) {
      const reach = FACILITY_REACH * s.size;
      // A full width from the other stations on its ring (below), half from the star and planets, the usual gap from the rest.
      const bodies = 1 + plan.seats.length; // the star, then each planet, lead `discs`
      discs.forEach((d, i) => expect(dist(s, d)).toBeGreaterThanOrEqual(d.r + reach + (i < bodies ? STATION_PAD * BODY_PAD : GEOMETRY.facilityGap) * s.size - 1e-6));
      const [lo, hi] = rhoRange({ x: s.x, y: s.y, r: reach });
      for (const seat of plan.seats) expect(arcDistance(seat, s.x, s.y)).toBeGreaterThanOrEqual(reach + GEOMETRY.orbitBand - 1);
      expect(hi < plan.frontier.rx0 || lo > plan.frontier.rx1).toBe(true);
      for (const o of plan.stations) if (o !== s && o.mode === s.mode) expect(dist(s, o)).toBeGreaterThanOrEqual(2 * reach + STATION_PAD * s.size - 1e-6);
    }
  });

  it('sits the inner ring on one radius inside the planets, its facilities half-way between planets', () => {
    const inner = plan.stations.filter((s) => s.mode === 'inner');
    expect(inner).toHaveLength(3);
    for (const s of inner) {
      expect(rho(s)).toBeCloseTo(rho(inner[0]!), 6); // one radius
      expect(rho(s)).toBeLessThan(plan.seats[0]!.rx); // inside the planets
      expect(offGap(s)).toBeLessThan(1e-6); // exactly half-way between two planets
    }
    // The one-seat facility takes a gap beside its own planet; the aimed multi-seat one, the gap nearest its aim.
    const own = plan.seats.find((x) => x.person === C)!;
    expect(Math.abs(normAngle(angle(st(2)) - own.angle + Math.PI) - Math.PI)).toBeCloseTo(step / 2, 6);
  });

  it('sits the outer ring past the planets, smaller, in the gaps too, inside the frontier', () => {
    const outer = plan.stations.filter((s) => s.mode === 'outer');
    expect(outer).toHaveLength(1);
    for (const s of outer) {
      expect(s.size).toBe(OUTER_SIZE);
      expect(rho(s)).toBeGreaterThanOrEqual(plan.seats[0]!.rx + GEOMETRY.planetR - 1e-6);
      expect(offGap(s)).toBeLessThan(1e-6);
      expect(rhoRange({ x: s.x, y: s.y, r: FACILITY_REACH * OUTER_SIZE })[1]).toBeLessThan(plan.frontier.rx0);
    }
  });
});

describe('compound slots: interval first-fit (13 §5)', () => {
  it('takes the lowest slot free over the whole interval', () => {
    expect(firstFit([
      { from: 0, to: 10 }, { from: 2, to: 5 }, { from: 5, to: 8 }, { from: 6, to: null }, { from: 10, to: 12 },
    ])).toEqual([0, 1, 1, 2, 0]);
  });

  it('never swaps a drawn slot, and at every instant draws min(open, cap) tenders with the rest in "+N" (23 C6)', () => {
    const rand = seededRandom(7);
    const atts = Array.from({ length: 40 }, (_, i) => {
      const from = START + Math.floor(rand() * 10 * DAY);
      const to = rand() < 0.2 ? null : from + Math.floor(rand() * 3 * DAY) + 1;
      return attachment(pr(5, 21100 + i), repo(5), { from, to }, []);
    });
    const slots = compoundSlots(repo(5), atts, START).filter((s) => s.role === 'attachment');
    const cap = GEOMETRY.compoundCap;
    const times = [...new Set(atts.flatMap((a) => [a.open.from, a.open.to ?? a.open.from]))].sort((x, y) => x - y);
    let sawMore = false;
    for (const t of times) {
      const open = atts.filter((a) => t >= a.open.from && (a.open.to === null || t < a.open.to)).length;
      const live = slots.filter((s) => t >= s.from && (s.to === null || t < s.to));
      expect(live).toHaveLength(open); // one segment per open PR
      const { more, live: drawn } = compoundAt(slots, t);
      expect(new Set(drawn.map((s) => s.slot)).size).toBe(drawn.length); // no two share a slot
      expect(drawn.every((s) => s.slot < cap)).toBe(true);
      expect(drawn).toHaveLength(Math.min(open, cap));
      expect(more).toBe(open - drawn.length);
      sawMore ||= more > 0;
    }
    expect(sawMore).toBe(true);
    // A PR's segments are contiguous in time and in "waiting, then drawn" order: a drawn tender never moves.
    for (const a of atts) {
      const own = slots.filter((s) => s.key === a.key).sort((x, y) => x.from - y.from);
      expect(own[0]!.from).toBe(a.open.from);
      expect(own.at(-1)!.to).toBe(a.open.to);
      own.slice(1).forEach((s, i) => expect(s.from).toBe(own[i]!.to));
      expect(own.filter((s) => s.slot < cap).length).toBeLessThanOrEqual(1);
      if (own.length > 1) { expect(own[0]!.slot).toBeGreaterThanOrEqual(cap); expect(own[1]!.slot).toBeLessThan(cap); expect(own).toHaveLength(2); }
    }
  });

  it('fills "+N" past six, promotes the earliest waiting PR into a freed slot, and reuses nothing out of turn', () => {
    const atts = Array.from({ length: 8 }, (_, i) => attachment(pr(6, 21200 + i), repo(6), { from: START + i, to: i === 2 ? START + 20 : null }, []));
    atts.push(attachment(pr(6, 21300), repo(6), { from: START + 30, to: null }, []));
    const slots = compoundSlots(repo(6), atts, START);
    const att = slots.filter((s) => s.role === 'attachment');
    const of = (k: CanonicalKey) => att.filter((s) => s.key === k).map((s) => s.slot);
    expect([0, 1, 2, 3, 4, 5].map((i) => of(atts[i]!.key))).toEqual([[0], [1], [2], [3], [4], [5]]);
    expect(of(atts[6]!.key)).toEqual([6, 2]); // waited, then took slot 2 when PR 2 closed
    expect(of(atts[7]!.key)).toEqual([6]); // still waiting
    expect(of(atts[8]!.key)).toEqual([6]); // opened with all six held
    expect(compoundAt(slots, START + 10).more).toBe(2);
    expect(compoundAt(slots, START + 25).more).toBe(1); // PR 2 closed: 7 open, 6 drawn (the promoted one among them)
    expect(compoundAt(slots, START + 40).more).toBe(2); // 8 open
    expect(compoundAt(slots, START + 25).live.map((s) => s.slot).sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(att[6]!.angle).toBe(attachmentAngle(GEOMETRY.compoundCap));
    const guards = slots.filter((s) => s.role === 'guard');
    expect(guards).toHaveLength(guardCount(repo(6)));
    for (const g of guards) expect(Math.sin(g.angle)).toBeLessThan(0); // the back arc, opposite the front
    for (const a of att) expect(Math.sin(a.angle)).toBeGreaterThan(-1e-9);
  });
});

describe('the plan never depends on the playhead (INV-14)', () => {
  const [A, B] = [person(1), person(2)];
  const pieces = [
    ...Array.from({ length: 7 }, (_, k) => piece(wi(20300 + k), 'objective', [[START, A], [START + (k + 1) * DAY, k % 2 ? B : null], [START + (k + 3) * DAY, A]])),
    ...Array.from({ length: 5 }, (_, k) => piece(wi(20320 + k), 'threat', [[START + k * DAY, B]], [{ from: START + k * DAY, to: START + (k + 4) * DAY }])),
  ];
  const atts = [attachment(pr(7, 21400), repo(7), { from: START + DAY, to: START + 6 * DAY }, [wi(20300), wi(20321)], A)];
  const build = () => facts(pieces, [A, B], atts);

  it('gives the same plan at 50 seeded playheads, and every piece shows at one of its fixed slots', () => {
    const f = build();
    const plan = planSolar(f, PACK);
    expect(plan.version).toBe(SOLAR_LAYOUT_VERSION);
    const want = plain(plan);
    const all = new Set(plan.slots.values());
    const rand = seededRandom(1414);
    for (let i = 0; i < 50; i++) {
      const t = START + Math.floor(rand() * 14 * DAY);
      for (const p of pieces) {
        const s = pieceAt(plan, f, p.key, t);
        if (s) expect(all.has(s)).toBe(true);
        else expect(p.member.some((m) => t >= m.from && (m.to === null || t < m.to))).toBe(false);
      }
      // A fresh facts object (no memo), built in another order, plans the same.
      const g = facts([...pieces].reverse(), [A, B], [...atts].reverse());
      expect(plain(planSolar(g, PACK))).toEqual(want);
    }
    expect(planSolar(f, PACK)).toBe(plan); // memoised
  });
});

describe('one timeline: the plan reads the facts’ own readers (17 W3-T3)', () => {
  const [A, B, C] = [person(31), person(32), person(33)];
  const on: Signal = { rung: 'underway' };
  const off: Signal = { rung: 'off', ghost: true };
  const signals = (...xs: [UtcMs, Signal][]) => xs.map(([from, signal]) => ({ from, signal }));

  it('has no reader of its own: slots.ts keeps no copy of seatAtTime or memberAt', () => {
    expect(Object.keys(slotsModule)).not.toContain('seatAtTime');
    expect(Object.keys(slotsModule)).not.toContain('memberAt');
  });

  it('gives a member before its first seat entry a frontier slot, and shows it there', () => {
    // A member from the start, seated at A only on day 2.
    const p = piece(wi(20401), 'objective', [[START + 2 * DAY, A]]);
    const f = facts([p], [A]);
    const plan = planSolar(f, PACK);
    expect([...visitsOf(p, f.round)]).toEqual([[null, START], [A, START + 2 * DAY]]);
    const front = plan.slots.get(slotKey('frontier', wi(20401)));
    expect(front).toMatchObject({ mode: 'frontier' });
    expect(seatAtTime(p, START + DAY)).toBeNull();
    expect(pieceAt(plan, f, wi(20401), START + DAY)).toBe(front);
    expect(pieceAt(plan, f, wi(20401), START + 3 * DAY)).toBe(plan.slots.get(slotKey(A, wi(20401))));
  });

  it('opens no seat and no slot for a visit made while Off', () => {
    // Off on day 2, reseated to B on day 3 and back to A on day 4, on again on day 5.
    const p = { ...piece(wi(20402), 'objective', [[START, A], [START + 3 * DAY, B], [START + 4 * DAY, A]]), signalAt: signals([START, on], [START + 2 * DAY, off], [START + 5 * DAY, on]) };
    const q = piece(wi(20403), 'objective', [[START, C]]);
    const f = facts([p, q], [A, C]);
    expect([...visitsOf(p, f.round).keys()]).toEqual([A]);
    expect(heldSpans(p, f.round)).toEqual([{ seat: A, from: START, to: START + 2 * DAY }, { seat: A, from: START + 5 * DAY, to: END }]);
    expect(seatsOf(f.pieces, f.round)).toEqual([A, C].sort());
    const plan = planSolar(f, PACK);
    expect(plan.seats.map((s) => s.person)).not.toContain(B);
    expect(plan.slots.get(slotKey(B, wi(20402)))).toBeUndefined();
  });

  it('seats nobody whose pieces were all Off while they held them (seatsOf excludes Off at source)', () => {
    const offAll = { ...piece(wi(20404), 'objective', [[START, A]]), signalAt: signals([START - DAY, off]) };
    // Off at the start, on from day 3: B first holds it then, after C's day-1 arrival.
    const late = { ...piece(wi(20405), 'threat', [[START, B]]), signalAt: signals([START - DAY, off], [START + 3 * DAY, on]) };
    const c = piece(wi(20406), 'objective', [[START + DAY, C]]);
    // An unknown state isn't known to be Off (INV-11): it holds its seat.
    const unknown = { ...piece(wi(20407), 'objective', [[START + 2 * DAY, A]]), signalAt: signals([START, { rung: 'off', unknown: true }]) };
    expect(seatsOf(new Map([offAll, late, c].map((p) => [p.key, p])), { startUtc: START, endUtc: END })).toEqual([C, B]);
    expect(seatsOf(new Map([offAll, late, c, unknown].map((p) => [p.key, p])), { startUtc: START, endUtc: END })).toEqual([C, A, B]);
  });

  it('agrees with the facts’ readers at every hour of the round', () => {
    const ps = [
      { ...piece(wi(20410), 'objective', [[START + DAY, A], [START + 4 * DAY, null], [START + 6 * DAY, B]]), signalAt: signals([START, on], [START + 8 * DAY, off]) },
      piece(wi(20411), 'threat', [[START, B], [START + 2 * DAY, A]], [{ from: START + DAY, to: START + 5 * DAY }, { from: START + 7 * DAY, to: null }]),
    ];
    const f = facts(ps, [A, B]);
    const plan = planSolar(f, PACK);
    for (let t = START; t < END; t += 3_600_000) {
      for (const p of ps) {
        const s = pieceAt(plan, f, p.key, t);
        if (!memberAt(p, t)) expect(s).toBeNull();
        else if (heldSpans(p, f.round).some((h) => h.from <= t && t < h.to)) expect(s).toBe(plan.slots.get(slotKey(seatAtTime(p, t) ?? 'frontier', p.key)));
        if (s) expect(s.seat).toBe(seatAtTime(p, t) ?? 'frontier');
      }
    }
  });
});

describe('facilities on two regular rings: who sits where, symmetry, and room (22 C11)', () => {
  const [A, B, C, D] = [person(1), person(2), person(3), person(4)];
  const pieces = [A, B, C, D].map((p, i) => piece(wi(20300 + i), 'objective', [[START, p]]));
  const both = [wi(20300), wi(20301)];
  const angle = (s: { x: number; y: number }) => Math.atan2(s.y / SQUASH, s.x);

  it('gives the gap nearest a shared aim to the earlier arrival, the next nearest to the later', () => {
    const atts = [
      attachment(pr(5, 21200), repo(5), { from: START + 2 * DAY, to: null }, both, A),
      attachment(pr(6, 21201), repo(6), { from: START + DAY, to: null }, both, B),
    ];
    const plan = planSolar(facts(pieces, [A, B, C, D], atts), PACK);
    const a = plan.seats.find((x) => x.person === A)!;
    const b = plan.seats.find((x) => x.person === B)!;
    const aim = Math.atan2(((a.y + b.y) / 2) / SQUASH, (a.x + b.x) / 2);
    const off = (r: number) => Math.abs(normAngle(angle(plan.stations.find((x) => x.facility === repo(r))!) - aim + Math.PI) - Math.PI);
    expect(plan.stations.map((s) => s.facility)).toEqual([repo(6), repo(5)]);
    expect(off(6)).toBeLessThanOrEqual(off(5));
  });

  it('prefers the inner ring: one-seat facilities take the gap beside their planet first, while gaps last', () => {
    const singles = [A, B, C].map((p, k) => attachment(pr(20 + k, 21400 + k), repo(20 + k), { from: START + k * DAY, to: null }, [wi(20300 + k)], p));
    const plan = planSolar(facts(pieces, [A, B, C, D], [...singles, attachment(pr(5, 21200), repo(5), { from: START + 3 * DAY, to: null }, both, A)]), PACK);
    expect(plan.stations.every((s) => s.mode === 'inner' && s.size === 1)).toBe(true);
    for (const [k, p] of [A, B, C].entries()) {
      const s = plan.stations.find((x) => x.facility === repo(20 + k))!;
      const own = plan.seats.find((x) => x.person === p)!;
      expect(Math.abs(normAngle(angle(s) - own.angle + Math.PI) - Math.PI)).toBeCloseTo(Math.PI / 4, 6); // a gap beside it: half of four planets' step
    }
  });

  it('sends a one-seat facility outside only when the inner ring’s gaps are all taken, earliest arrivals inside', () => {
    const six = Array.from({ length: 6 }, (_, k) => attachment(pr(30 + k, 21500 + k), repo(30 + k), { from: START + k * DAY, to: null }, [wi(20300 + (k % 4))], [A, B, C, D][k % 4]!));
    const plan = planSolar(facts(pieces, [A, B, C, D], six), PACK);
    expect(plan.stations.map((s) => s.mode)).toEqual(['inner', 'inner', 'inner', 'inner', 'outer', 'outer']);
    for (const s of plan.stations) expect(s.size).toBe(s.mode === 'outer' ? OUTER_SIZE : 1);
  });

  it('is symmetric about the top planet: with an odd count, a gap at the very bottom', () => {
    const five = [A, B, C, D, person(5)];
    const plan = planSolar(facts(five.map((p, i) => piece(wi(20310 + i), 'objective', [[START, p]])), five), PACK);
    const top = plan.seats.find((x) => x.index === 0)!;
    expect(Math.abs(normAngle(top.angle + Math.PI / 2 + Math.PI) - Math.PI)).toBeLessThan(1e-9); // the first planet at the top
    const gaps = gapAngles(plan.seats, 1);
    expect(gaps).toHaveLength(5);
    expect(gaps.some((g) => Math.abs(normAngle(g - Math.PI / 2 + Math.PI) - Math.PI) < 1e-9)).toBe(true); // the middle of the bottom
    expect(gapAngles(plan.seats, 2)).toHaveLength(10); // two side by side per gap
  });

  it('moves the planets out when the multi-seat facilities need more than a slot per gap', () => {
    const none = planSolar(facts(pieces, [A, B, C, D]), PACK);
    const many = Array.from({ length: 8 }, (_, k) => attachment(pr(7 + k, 21300 + k), repo(7 + k), { from: START + k * DAY, to: null }, both, A));
    const crowded = planSolar(facts(pieces, [A, B, C, D], many), PACK);
    expect(crowded.seats[0]!.rx).toBeGreaterThan(none.seats[0]!.rx);
    const inner = crowded.stations.filter((s) => s.mode === 'inner');
    expect(inner).toHaveLength(8); // two per gap
    for (const s of inner) for (const o of inner) if (o !== s) expect(dist(s, o)).toBeGreaterThanOrEqual(2 * FACILITY_REACH + STATION_PAD - 1e-6);
  });
});
