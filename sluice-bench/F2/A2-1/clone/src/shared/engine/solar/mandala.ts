// The mandala (22 Block D, 08 §7): every object near a planet sits in a predetermined slot, an idealised
// circle sized to its class (its largest dimension), padded by a slot for small objects or half one for
// large, on concentric rings round a parent or spread over its area with radial symmetry:
// - **On the planet (D1):** stories on its left half-disc, bugs on its right. Each class's slots split its
//   half into equal areas, mirrored across the equator, filled from the planet's centre out; a planet
//   whose busier side won't fit at half a slot's padding shrinks its slots (both sides).
// - **Trophies (D2):** one ring round the planet, a full trophy's width off its rim, every closed piece in
//   the order it closed: the first on the star line, the next either side of it in turn, the gap between
//   neighbours at most one slot; a full ring starts another shell, turned half a slot.
// - **Loitering (D3):** a ring past the trophy shells by one more trophy slot, its first slot on the
//   planet's far side from the star, the next either side in turn, one ship length apart plus one more.
// Offsets are from the planet's centre, in world units. Pure and deterministic; memoised by count.

/** Fill order on a ring: 0 on the axis, then one side and the other in turn (1 → +1, 2 → −1, 3 → +2, …). */
export function slotOrder(j: number): number {
  return j === 0 ? 0 : j % 2 === 1 ? (j + 1) / 2 : -j / 2;
}

/** Padding between two on-planet slots, as a share of a slot's diameter (D1: half a slot). */
export const PIECE_PAD = 0.5;

/** A class's slots on a planet's half-disc: centres from the planet's centre, and the room each has. */
export interface HalfDisc {
  /** By fill index (arrival order): nearest the planet's centre first, then up before down. */
  offsets: { x: number; y: number }[];
  /** The largest slot radius that keeps half a slot's padding, the meridian and the rim (world units). */
  room: number;
  /** The closest two centres (or a centre and its mirror across the meridian). */
  pitch: number;
}

/** The left half-disc's area above height `y` (y down; −R at the top). Closed form. */
function areaTo(y: number, R: number): number {
  const c = Math.max(-R, Math.min(R, y));
  return (c * Math.sqrt(R * R - c * c) + R * R * Math.asin(c / R)) / 2 + (Math.PI * R * R) / 4;
}

/** The height whose area above it is `a`. */
function heightAt(a: number, R: number): number {
  let lo = -R;
  let hi = R;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (areaTo(mid, R) < a) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const STEPS = 160;

/** A band's cells: `c` equal-area cells between `ya` and `yb` on the left half-disc, their centroids. */
function bandCells(ya: number, yb: number, c: number, R: number): { x: number; y: number }[] {
  const dy = (yb - ya) / STEPS;
  const ys = Array.from({ length: STEPS }, (_, i) => ya + (i + 0.5) * dy);
  const chord = ys.map((y) => Math.sqrt(Math.max(0, R * R - y * y)));
  const leftOf = (x: number) => ys.reduce((s, _, i) => s + Math.max(0, Math.min(0, x) + chord[i]!) * dy, 0);
  const total = leftOf(0);
  // The cut positions, left to right: cell k spans cuts[k]..cuts[k + 1].
  const cuts = [-R];
  for (let k = 1; k < c; k++) {
    let lo = -R;
    let hi = 0;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      if (leftOf(mid) < (total * k) / c) lo = mid;
      else hi = mid;
    }
    cuts.push((lo + hi) / 2);
  }
  cuts.push(0);
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < c; k++) {
    let a = 0;
    let mx = 0;
    let my = 0;
    ys.forEach((y, i) => {
      const x0 = Math.max(cuts[k]!, -chord[i]!);
      const x1 = Math.min(cuts[k + 1]!, 0);
      if (x1 <= x0) return;
      const w = (x1 - x0) * dy;
      a += w;
      mx += ((x0 + x1) / 2) * w;
      my += y * w;
    });
    out.push(a > 0 ? { x: mx / a, y: my / a } : { x: (cuts[k]! + cuts[k + 1]!) / 2, y: (ya + yb) / 2 });
  }
  return out;
}

/**
 * The candidate rows' counts for `n` slots in `m` rows: mirrored (row i as many as row m − 1 − i), each
 * at least one, summing to n; near each equal-height band's share of the area (within two either way),
 * so the search stays small.
 */
function rowCountsFor(n: number, m: number, R: number): number[][] {
  if (m % 2 === 0 && n % 2 === 1) return []; // with no equator row, every row has its mirror
  const pairs = Math.floor(m / 2);
  const h = (2 * R) / m;
  const total = (Math.PI * R * R) / 2;
  const share = (i: number) => ((areaTo(-R + (i + 1) * h, R) - areaTo(-R + i * h, R)) / total) * n;
  const out: number[][] = [];
  const pick = (i: number, used: number, acc: number[]) => {
    if (i === pairs) {
      const middle = n - used;
      if (m % 2 === 1 ? middle >= 1 : middle === 0) {
        const c = [...acc, ...(m % 2 === 1 ? [middle] : []), ...[...acc].reverse()];
        out.push(c);
      }
      return;
    }
    const guess = Math.round(share(i));
    for (let c = Math.max(1, guess - 2); c <= guess + 2; c++) if (used + 2 * c <= n) pick(i + 1, used + 2 * c, [...acc, c]);
  };
  pick(0, 0, []);
  return out;
}

/** The room a set of centres leaves (the D1 constraints) and their closest spacing. */
function roomOf(pts: { x: number; y: number }[], R: number): { room: number; pitch: number } {
  let pitch = Infinity;
  for (let i = 0; i < pts.length; i++) {
    pitch = Math.min(pitch, 2 * Math.abs(pts[i]!.x)); // its mirror across the meridian, on the other side
    for (let j = i + 1; j < pts.length; j++) pitch = Math.min(pitch, Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y));
  }
  const rim = Math.min(...pts.map((p) => R - Math.hypot(p.x, p.y)));
  // A slot's diameter plus half a slot of padding fits the pitch: 2ρ + 2ρ·PIECE_PAD.
  return { room: Math.max(0, Math.min(pitch / (2 + 2 * PIECE_PAD), rim)), pitch };
}

const discMemo = new Map<string, HalfDisc>();

/**
 * `n` slots on a planet's half-disc of radius `R` (`side` −1 the left, the stories'; +1 the right, the
 * bugs'), mirrored across the equator, each cell an equal share of the half's area. The rows are chosen
 * to leave the most room; an equator row is preferred on a tie, and fewer rows after that.
 */
export function halfDiscSlots(n: number, R: number, side: -1 | 1): HalfDisc {
  const key = `${n}|${R}|${side}`;
  const hit = discMemo.get(key);
  if (hit) return hit;
  let best: { pts: { x: number; y: number }[]; room: number; pitch: number; m: number } | null = null;
  for (let m = 1; m <= Math.min(n, 7); m++) for (const c of rowCountsFor(n, m, R)) {
    const total = (Math.PI * R * R) / 2;
    const edges = [-R];
    let cum = 0;
    for (let i = 0; i < m - 1; i++) edges.push(heightAt((total * (cum += c[i]!)) / n, R));
    edges.push(R);
    const rows: { x: number; y: number }[][] = [];
    for (let i = 0; i < m; i++) rows.push(bandCells(edges[i]!, edges[i + 1]!, c[i]!, R));
    // Exact mirror symmetry across the equator: the lower rows mirror the upper, the middle row sits on it.
    for (let i = 0; i < Math.floor(m / 2); i++) rows[m - 1 - i] = rows[i]!.map((p) => ({ x: p.x, y: -p.y }));
    if (m % 2 === 1) rows[(m - 1) / 2] = rows[(m - 1) / 2]!.map((p) => ({ x: p.x, y: 0 }));
    const pts = rows.flat();
    const { room, pitch } = roomOf(pts, R);
    const better = !best || room > best.room + 1e-6 || (Math.abs(room - best.room) <= 1e-6 && best.m % 2 === 0 && m % 2 === 1);
    if (better) best = { pts, room, pitch, m };
  }
  const pts = (best?.pts ?? []).slice().sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || a.y - b.y || a.x - b.x);
  const out: HalfDisc = { offsets: pts.map((p) => ({ x: side === 1 ? -p.x : p.x, y: p.y })), room: best?.room ?? R, pitch: best?.pitch ?? 2 * R };
  discMemo.set(key, out);
  return out;
}

// ---- Trophies and loitering ----

/** A trophy shell's radius and slot count. */
export interface Shell { r: number; n: number; turn: number }

/** The trophy ring round a planet of radius `R` for slots `wt` across, as many shells as `count` needs (at least one). */
export function trophyShells(R: number, wt: number, count: number): Shell[] {
  const shells: Shell[] = [];
  let r = R + 1.5 * wt; // a full trophy's width off the rim (room for the planet's name), to the slot's centre
  let left = Math.max(1, count);
  for (let k = 0; left > 0; k++) {
    // The gap between neighbours at most one slot: as many slots as the ring holds at a two-slot pitch, rounded up.
    const n = Math.max(1, Math.ceil((2 * Math.PI * r) / (2 * wt)));
    const step = (2 * Math.PI) / n;
    shells.push({ r, n, turn: k % 2 === 1 ? step / 2 : 0 });
    left -= n;
    // The next shell out, half a slot turned: neighbours across the two at least two slots apart.
    r += Math.sqrt(3) * wt;
  }
  return shells;
}

/** A trophy slot's offset: `index` in close order, `toStar` the unit vector from the planet to the star. */
export function trophyOffset(shells: Shell[], index: number, toStar: { x: number; y: number }): { x: number; y: number } {
  let j = index;
  let k = 0;
  while (k < shells.length - 1 && j >= shells[k]!.n) j -= shells[k++]!.n;
  const s = shells[k]!;
  const step = (2 * Math.PI) / s.n;
  // A shell turned half a slot pairs its first two either side of the star line.
  const a = s.turn ? (j % 2 === 0 ? 1 : -1) * (Math.floor(j / 2) + 0.5) * step : slotOrder(j) * step;
  return turned(toStar, a, s.r);
}

/** A unit vector turned by `a` (positive toward the screen's left of it, seen from the planet) and scaled to `r`. */
function turned(u: { x: number; y: number }, a: number, r: number): { x: number; y: number } {
  // The left of `u` on screen (y down) is (u.y, −u.x).
  const lx = u.y;
  const ly = -u.x;
  return { x: (u.x * Math.cos(a) + lx * Math.sin(a)) * r, y: (u.y * Math.cos(a) + ly * Math.sin(a)) * r };
}

/** The loiter ring's radius: past the trophy shells by one more trophy slot (D3; at least two slots off a bare planet). */
export function loiterRadius(shells: Shell[], wt: number): number {
  return shells[shells.length - 1]!.r + wt;
}

/**
 * The loiter ring as drawn (22 D3): its planned radius, or, where ships and trophies draw at their screen
 * floors (a far zoom), far enough that a ship's hit clears what it rings: the trophy shells' (`within`,
 * their outer centre, with a trophy's hit) or the planet's rim. Hits and the gap in world units.
 */
export function loiterRingAt(r: number, within: number, withinHit: number, shipHit: number, gap: number): number {
  return Math.max(r, within + withinHit + shipHit + gap);
}

/** A loiter slot's offset: `index` by arrival, `away` the unit vector from the star through the planet, `pitch` the arc between slots. */
export function loiterOffset(r: number, pitch: number, index: number, away: { x: number; y: number }): { x: number; y: number } {
  const step = Math.min(Math.PI / 3, pitch / r);
  return turned(away, slotOrder(index) * step, r);
}

/** The unit vector from the star to a planet at (x, y), the star at the origin. */
export function awayFromStar(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
}
