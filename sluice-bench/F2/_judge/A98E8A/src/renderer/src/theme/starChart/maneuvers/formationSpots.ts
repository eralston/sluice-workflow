// The Power link crew's spots (27 D2): pure in world terms (the station, the plan's board, the plates),
// so seek and play agree and a unit test can import it without Pixi. powerLink.ts calls it once per
// maneuver at gather. 13 §6.2 and 08 §7 name the rule.
import { SQUASH } from '@shared/engine/solar/version';

type P = [number, number];

/** The approvers' row, in captain-ship sizes: the gap between neighbours, and how far beyond the author (22 B9). */
export const APPROVER_STEP = 3.4;
export const APPROVER_OUT = 4;
/** The beam's corridor (27 D3), in captain-ship sizes each side of a strand: a ship, its trail and the beam's glow. */
export const CORRIDOR_HALF = 1.5;
/** The nearest-clear-line search turns in steps of this many radians (15 degrees). */
export const CORRIDOR_STEP = Math.PI / 12;

export interface Rect { minX: number; minY: number; maxX: number; maxY: number }
interface PlateRect { x0: number; y0: number; x1: number; y1: number }

export interface FormationInput {
  /** The station's centre, in world units. */
  at: P;
  /** The station's drawn radius, in world units. */
  R: number;
  /** How many approvers (here or away). */
  n: number;
  /** The plates the crew keeps off (the station's and the work's), in world units. */
  plates: readonly PlateRect[];
  /** The board: the plan's frontier rectangle. Null when the scene has no solar plan. */
  board?: Rect | null;
  /** The far ends of the strands the station fires (27 D3), in world units; each strand starts at `at`. */
  beams?: readonly P[];
}

/** `blocked` is set only when a beam still passes within a corridor of a member (the beam fades there). */
export interface FormationSpots { author: P; approvers: P[]; face: number; blocked?: true }

/**
 * The formation (22 C11, after the user's real runs): one line through the station. Near the top or
 * bottom of the circle the line is horizontal; on the sides, vertical. The author takes the spot beside
 * the station, the approvers carry on along the line beyond it, a little staggered off it so each beam
 * reads, each far enough from the next that its named plate has room (22 B9).
 *
 * Candidates, in order: the natural axis toward the board's middle, the same axis the other way, the
 * other axis toward the middle, the other axis the other way. The pick is the first that is on the board
 * and clear of the plates; failing that the first on the board (27 D2: the board beats the plates);
 * failing that the first with every spot held inside the board. With no board only the first two are
 * candidates and `inside` is always true.
 */
export function formationSpots(i: FormationInput): FormationSpots {
  const [fx, fy] = i.at;
  const ship = i.R * 0.5; // a station is drawn twice a captain ship's size (sizing.ts)
  const out = i.R * 1.2 + ship * 1.8;
  const n = i.n;
  const horizontal = Math.abs(fy / SQUASH) >= Math.abs(fx);

  const line = (h: boolean, sign: number): FormationSpots => {
    const axis: P = h ? [1, 0] : [0, 1];
    const across: P = h ? [0, 1] : [1, 0];
    const at = (d: number, off: number): P => [fx + axis[0] * sign * d + across[0] * off, fy + axis[1] * sign * d + across[1] * off];
    return {
      author: at(out, 0),
      approvers: Array.from({ length: n }, (_, k) => at(out + ship * (APPROVER_OUT + k * APPROVER_STEP), (k % 2 ? 1 : -1) * ship * 0.6)),
      // Ships face the station: east when it's to their right.
      face: h ? (sign > 0 ? -1 : 1) : (fx >= 0 ? -1 : 1),
    };
  };
  const towardOf = (h: boolean) => -Math.sign(h ? fx : fy) || 1;
  const toward = towardOf(horizontal);
  const cands: FormationSpots[] = [line(horizontal, toward), line(horizontal, -toward)];
  if (i.board) cands.push(line(!horizontal, towardOf(!horizontal)), line(!horizontal, -towardOf(!horizontal)));

  const pad = ship * 1.2;
  const covers = (pts: P[]) => i.plates.some((r) => pts.some(([x, y]) => x > r.x0 - pad && x < r.x1 + pad && y > r.y0 - pad && y < r.y1 + pad));
  const all = (c: FormationSpots): P[] => [c.author, ...c.approvers];

  let room: Rect | null = null;
  if (i.board) {
    const s = { minX: i.board.minX + pad, minY: i.board.minY + pad, maxX: i.board.maxX - pad, maxY: i.board.maxY - pad };
    room = s.minX > s.maxX || s.minY > s.maxY ? i.board : s;
  }
  const inside = (c: FormationSpots) => !room || all(c).every(([x, y]) => x >= room!.minX && x <= room!.maxX && y >= room!.minY && y <= room!.maxY);
  const clear = (c: FormationSpots) => !covers(all(c));

  const d2 = (): FormationSpots => {
    const pick = cands.find((c) => inside(c) && clear(c)) ?? cands.find(inside);
    if (pick) return pick;
    // Every candidate leaves the board: hold the first one's spots inside it, keeping their order.
    const first = cands[0]!;
    const clamp = ([x, y]: P): P => [Math.min(room!.maxX, Math.max(room!.minX, x)), Math.min(room!.maxY, Math.max(room!.minY, y))];
    return { author: clamp(first.author), approvers: first.approvers.map(clamp), face: first.face };
  };
  const base = d2();
  const beams = i.beams ?? [];
  if (!beams.length) return base;

  // 27 D3: clear of the beam. A member is blocked within CORRIDOR_HALF ship sizes of a strand (station to work).
  const half = CORRIDOR_HALF * ship;
  const near = ([x, y]: P, [bx, by]: P): number => {
    const [dx, dy] = [bx - fx, by - fy];
    const l2 = dx * dx + dy * dy;
    const u = l2 ? Math.min(1, Math.max(0, ((x - fx) * dx + (y - fy) * dy) / l2)) : 0;
    return Math.hypot(x - (fx + dx * u), y - (fy + dy * u));
  };
  const blocked = (c: FormationSpots) => all(c).some((m) => beams.some((b) => near(m, b) < half));
  if (!blocked(base)) return base;

  const dir = (c: FormationSpots) => Math.atan2(c.author[1] - fy, c.author[0] - fx);
  const theta0 = dir(cands.includes(base) ? base : cands[0]!);
  const lineAt = (theta: number): FormationSpots => {
    const [cx, cy] = [Math.cos(theta), Math.sin(theta)];
    const axis: P = [cx, cy];
    const across: P = [-cy, cx];
    const at = (d: number, off: number): P => [fx + axis[0] * d + across[0] * off, fy + axis[1] * d + across[1] * off];
    return {
      author: at(out, 0),
      approvers: Array.from({ length: n }, (_, k) => at(out + ship * (APPROVER_OUT + k * APPROVER_STEP), (k % 2 ? 1 : -1) * ship * 0.6)),
      face: cx > 0.05 ? -1 : cx < -0.05 ? 1 : (fx >= 0 ? -1 : 1),
    };
  };
  const [mx, my] = i.board ? [(i.board.minX + i.board.maxX) / 2, (i.board.minY + i.board.maxY) / 2] : [0, 0];
  const mid = (c: FormationSpots) => Math.hypot(c.author[0] - mx, c.author[1] - my);
  const arc: FormationSpots[] = [];
  for (let k = 1; k <= 12; k++) {
    const pair = k === 12 ? [lineAt(theta0 + k * CORRIDOR_STEP)] : [lineAt(theta0 + k * CORRIDOR_STEP), lineAt(theta0 - k * CORRIDOR_STEP)].sort((a, b) => mid(a) - mid(b));
    arc.push(...pair);
  }
  const free = arc.filter((c) => inside(c) && !blocked(c));
  const found = free.find(clear) ?? free[0];
  return found ?? { ...base, blocked: true };
}
