// Holographic labels (2026-10-12): the star-map look. A label is a glass plate in one pale HUD cyan,
// a rectangle with two corners cut, and a single pointer: a line from the plate out to the rim of
// the object it names, ending in a dot on the rim (simplified 2026-10-12: no ornaments). It hangs
// out along the object's `labelDir` (a planet's: away from its star), elbows once, and runs level into
// the plate's near edge.
//
// Reusable by design: a frame (the plate's shape) and a variant (what the plate says) are
// chosen per asset (`AssetDef.label`), with a layout and a tier. v1 has one frame, `chamfer`; three
// variants, `title` (the title only: planets), `subtitle` (the title over a dimmer line: stations,
// pieces, galaxies, stars) and `avatar` (the captain's picture and name: ships, which still shrink to
// the picture alone in play); and two layouts, `horizontal` (beside, along `labelDir`) and `vertical`
// (above or below). A node with no asset (a galaxy, a star) gets its plate from the paradigm
// (`KindPlates`, 19 R1), so the v0 views keep their navy plates. A plate with a list grows its rows in
// place (19 L2, `growPlacement`; the rows are holoRows.ts). The geometry is pure (`holoCandidates`,
// `holoVerticalCandidates`, `growPlacement`, `expandAt`, `framePath`); the DOM half is `HoloFrame`.
import type { NodeKind } from '@shared/contracts/view';
import type { Rect } from '../labels';

/** A frame: the plate's outline. */
export type HoloFrameId = 'chamfer';
/**
 * What the plate says: `title` is the title alone; `subtitle` adds the node's meta beneath, dimmer;
 * `avatar` leads the title with the node's avatar circle (its picture, or initials on its colour).
 */
export type HoloVariant = 'title' | 'subtitle' | 'avatar';
/**
 * How the plate sits by its object: `horizontal` hangs out along `labelDir` and runs level into the
 * plate's side (a planet's, to its left or right); `vertical` stands above or below the object on a
 * short upright connector (a station's).
 */
export type HoloLayout = 'horizontal' | 'vertical';
/**
 * How loud the plate is when raised (19 §2, 15 §6 `holo-tiers`; every plate rests at T4 Sky, 27 B1): `lead` (T1: captains, dreadnoughts),
 * `door` (T2: galaxies, pieces), `place` (T3: homeworlds) or `sky` (T4: the stars, the round's and the
 * region's; 22 A5).
 * Pointed, selected or lit, any plate is also drawn lifted (as T1, brighter). Weight only: the order
 * plates are placed in is the asset's `rank`.
 */
export type HoloTier = 'lead' | 'door' | 'place' | 'sky';
/** An asset's choice of holographic label. */
export interface HoloSpec { frame: HoloFrameId; variant: HoloVariant; layout: HoloLayout; tier: HoloTier }

/**
 * A holographic plate for a node with no asset (a galaxy, a star, the round's Load more). `labelRim`
 * is where the pointer meets the art, as a fraction of `world.r` (as `AssetDef.labelRim`); `dir` is
 * the way out for a horizontal plate when the node gives none (`labelDir`, then `labelSide`).
 */
export interface KindPlate { label: HoloSpec; labelRim?: number; dir?: { x: number; y: number } }
/**
 * The plates a paradigm gives asset-less nodes, by level id (`galaxy` for the root) and kind. Absent
 * (the v0 views): those nodes keep the standard plate.
 */
export type KindPlates = Readonly<Record<string, Partial<Record<NodeKind, KindPlate>>>>;

/** Where a plate sits relative to its pointer: beside it (horizontal), or above or below (vertical). */
export type HoloSide = 'left' | 'right' | 'above' | 'below';

/** The object a label points at, on screen: its centre, its drawn radius, and the way out (a unit vector). */
export interface HoloAnchor { cx: number; cy: number; r: number; dirX: number; dirY: number }

/** One place for the plate: its rect, the side of the elbow it sits on, and the pointer (rim → plate). */
export interface HoloPlacement { rect: Rect; side: HoloSide; leader: readonly (readonly [number, number])[] }

/** Screen px. `reach`: rim to elbow; `run`: elbow to plate; `cut`: the chamfer; `dot`: the rim terminal's radius. */
export const HOLO = { reach: 16, run: 12, cut: 6, dot: 2 } as const;

/** Turns tried off the preferred way out (radians), nearest first, then a longer reach. */
const TURNS = [0, 0.35, -0.35, 0.7, -0.7];
const REACHES = [1, 1.9];

/**
 * Every place the plate may go, best first: the way out, then turned a little each way, then reached
 * further; at each, the elbow's own side first (a plate out to the right of a planet runs right), then
 * the other. Straight up or down prefers the right. None covers the object itself.
 */
export function holoCandidates(a: HoloAnchor, w: number, h: number, turns: readonly number[] = TURNS, reaches: readonly number[] = REACHES): HoloPlacement[] {
  const out: HoloPlacement[] = [];
  for (const k of reaches) {
    for (const t of turns) {
      const dx = a.dirX * Math.cos(t) - a.dirY * Math.sin(t);
      const dy = a.dirX * Math.sin(t) + a.dirY * Math.cos(t);
      const rim: [number, number] = [a.cx + dx * a.r, a.cy + dy * a.r];
      const elbow: [number, number] = [a.cx + dx * (a.r + HOLO.reach * k), a.cy + dy * (a.r + HOLO.reach * k)];
      const pref: 'left' | 'right' = dx < -0.15 ? 'left' : 'right';
      for (const side of [pref, pref === 'right' ? 'left' : 'right'] as const) {
        const s = side === 'right' ? 1 : -1;
        const end: [number, number] = [elbow[0] + s * HOLO.run, elbow[1]];
        const x0 = side === 'right' ? end[0] : end[0] - w;
        const rect = { x0, y0: end[1] - h / 2, x1: x0 + w, y1: end[1] + h / 2 };
        // A plate that runs back over its own object would hide what it names.
        const nx = Math.max(rect.x0, Math.min(a.cx, rect.x1));
        const ny = Math.max(rect.y0, Math.min(a.cy, rect.y1));
        if (Math.hypot(nx - a.cx, ny - a.cy) < a.r) continue;
        out.push({ rect, side, leader: [rim, elbow, end] });
      }
    }
  }
  return out;
}

/** Sideways shifts tried for an upright plate, as fractions of its width (the connector still meets it). */
const SHIFTS = [0, 0.3, -0.3];

/**
 * Every place an upright plate may go, best first: on the preferred side (`below` unless the object
 * asks for above), centred, then shifted a little each way, then reached further; then the other side.
 * The connector runs straight from the object's top or bottom edge into the plate's near edge.
 */
export function holoVerticalCandidates(a: Omit<HoloAnchor, 'dirX' | 'dirY'>, w: number, h: number, prefer: 'above' | 'below' = 'below'): HoloPlacement[] {
  const out: HoloPlacement[] = [];
  for (const side of [prefer, prefer === 'below' ? 'above' : 'below'] as const) {
    const s = side === 'below' ? 1 : -1;
    for (const k of REACHES) {
      const rim: [number, number] = [a.cx, a.cy + s * a.r];
      const end: [number, number] = [a.cx, a.cy + s * (a.r + HOLO.reach * 0.75 * k)];
      for (const f of SHIFTS) {
        const x0 = end[0] - w / 2 + f * w;
        const y0 = side === 'below' ? end[1] : end[1] - h;
        out.push({ rect: { x0, y0, x1: x0 + w, y1: y0 + h }, side, leader: [rim, end] });
      }
    }
  }
  return out;
}

/**
 * A planet's name (22 D7, revised): the one place, centred under the planet and half its height over the
 * planet's rim (on the planet, in the gap before the trophies), and no pointer (the leader is a single
 * point, which `HoloFrame.place` doesn't draw).
 */
export function holoUnderCandidate(a: Omit<HoloAnchor, 'dirX' | 'dirY'>, w: number, h: number): HoloPlacement {
  const rim: [number, number] = [a.cx, a.cy + a.r];
  const x0 = a.cx - w / 2;
  const y0 = rim[1] - h / 2;
  return { rect: { x0, y0, x1: x0 + w, y1: y0 + h }, side: 'below', leader: [rim, rim] };
}

/** Margin an expanded plate keeps from the view's edges, in px. */
export const HOLO_EDGE = 4;

/**
 * An expanded plate (19 L2, R5): the placement `at` of its Title or Full plate, grown to `w`×`h` with
 * its rows. It keeps its side and its pointer, and grows away from its object: a plate beside its
 * object keeps its near edge and its top (the rows run down under the title); an upright one keeps
 * its near edge (growing down below the object, up above it) and its centre on the connector.
 */
export function growPlacement(at: HoloPlacement, w: number, h: number): HoloPlacement {
  const r = at.rect;
  let x0: number;
  let y0: number;
  if (at.side === 'right' || at.side === 'left') {
    x0 = at.side === 'right' ? r.x0 : r.x1 - w;
    y0 = r.y0;
  } else {
    x0 = (r.x0 + r.x1) / 2 - w / 2;
    y0 = at.side === 'below' ? r.y0 : r.y1 - h;
  }
  return { rect: { x0, y0, x1: x0 + w, y1: y0 + h }, side: at.side, leader: at.leader };
}

/**
 * Keeps a grown plate in the view by sliding it along the edge its pointer meets (up or down for a
 * plate beside its object, sideways for an upright one), never so far that the pointer misses the
 * edge. The pointer and the side don't change.
 */
export function slidePlacement(at: HoloPlacement, viewW: number, viewH: number): HoloPlacement {
  const { rect, side, leader } = at;
  const [ex, ey] = leader[leader.length - 1]!;
  const slide = (lo: number, hi: number, min: number, max: number, end: number) => {
    // The shift that brings [lo, hi] inside [min, max], then held so the pointer's end stays on the edge.
    let d = lo < min ? min - lo : hi > max ? max - hi : 0;
    d = Math.min(d, end - HOLO.cut - lo);
    d = Math.max(d, end + HOLO.cut - hi);
    return d;
  };
  if (side === 'right' || side === 'left') {
    const d = slide(rect.y0, rect.y1, HOLO_EDGE, viewH - HOLO_EDGE, ey);
    return { rect: { ...rect, y0: rect.y0 + d, y1: rect.y1 + d }, side, leader };
  }
  const d = slide(rect.x0, rect.x1, HOLO_EDGE, viewW - HOLO_EDGE, ex);
  return { rect: { ...rect, x0: rect.x0 + d, x1: rect.x1 + d }, side, leader };
}

/** Whether a rect lies inside the view, less the expanded plate's margin. */
export const inHoloView = (r: Rect, viewW: number, viewH: number): boolean =>
  r.x0 >= HOLO_EDGE - 0.5 && r.x1 <= viewW - HOLO_EDGE + 0.5 && r.y0 >= HOLO_EDGE - 0.5 && r.y1 <= viewH - HOLO_EDGE + 0.5;

/**
 * Where a plate expands (19 L2): `cands` are its Title or Full plate's places, best first, and `k` the
 * one it sits on. It stays there if its grown plate (slid into the view) fits; if not, it re-places
 * once, to the first place whose grown plate fits clear of `clear`'s obstacles, else the first that
 * fits, else it stays. The caller pins the answer while the plate is expanded, so it never jumps
 * under the pointer. Pure.
 */
export function expandAt(
  cands: readonly HoloPlacement[], k: number, w: number, h: number, viewW: number, viewH: number,
  clear: (r: Rect) => boolean = () => true,
): number {
  const grown = (i: number) => slidePlacement(growPlacement(cands[i]!, w, h), viewW, viewH).rect;
  if (cands[k] && inHoloView(grown(k), viewW, viewH)) return k;
  const fits = cands.map((_, i) => inHoloView(grown(i), viewW, viewH));
  const i = fits.findIndex((f, j) => f && clear(grown(j)));
  if (i >= 0) return i;
  const j = fits.indexOf(true);
  return j >= 0 ? j : k;
}

/** The horizontal sides' cut corners; an upright plate takes the right-hand set. */
const flatSide = (side: HoloSide): 'left' | 'right' => (side === 'left' ? 'left' : 'right');

/**
 * The frame's outline in the plate's own px (0,0 top-left): a rectangle with two corners cut. The cut
 * corners lean away from the pointer, so the plate's near edge stays square where the line comes in.
 */
export function framePath(w: number, h: number, side: HoloSide): string {
  const c = Math.min(HOLO.cut, h / 2);
  const p = flatSide(side) === 'right'
    ? [[0, 0], [w - c, 0], [w, c], [w, h], [c, h], [0, h - c]]
    : [[c, 0], [w, 0], [w, h - c], [w - c, h], [0, h], [0, c]];
  return `M${p.map(([x, y]) => `${x},${y}`).join(' L')} Z`;
}

/** The same outline as a CSS clip-path, so the plate's glass fills exactly the frame. */
export function frameClip(w: number, h: number, side: HoloSide): string {
  const c = Math.min(HOLO.cut, h / 2);
  const p = flatSide(side) === 'right'
    ? [[0, 0], [w - c, 0], [w, c], [w, h], [c, h], [0, h - c]]
    : [[c, 0], [w, 0], [w, h - c], [w - c, h], [0, h], [0, c]];
  return `polygon(${p.map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
}

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The frame and pointer of one plate: an SVG beside the plate (not inside it, so the plate's clip
 * never cuts the line), drawn in the plate's coordinates. Pointer events pass through it.
 */
export class HoloFrame {
  readonly el: SVGSVGElement;
  private readonly outline: SVGPathElement;
  private readonly leader: SVGPolylineElement;
  private readonly dot: SVGCircleElement;
  private sig = '';

  /** `role`: a piece's (`objective`, `threat`), whose frame, pointer and dot take its role's colour (22 A6). */
  constructor(host: HTMLElement, readonly spec: HoloSpec, role?: string) {
    this.el = document.createElementNS(SVG, 'svg');
    this.el.setAttribute('class', `holo holo--${spec.frame}`);
    this.el.dataset.holoTier = spec.tier;
    if (role === 'objective' || role === 'threat') this.el.dataset.holoRole = role;
    if (role === 'seat') this.el.classList.add('holo--under'); // a planet's name is the lowest of the labels
    this.el.setAttribute('aria-hidden', 'true');
    this.el.setAttribute('width', '1');
    this.el.setAttribute('height', '1');
    const make = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string) => {
      const e = document.createElementNS(SVG, tag);
      e.setAttribute('class', cls);
      this.el.append(e);
      return e;
    };
    this.leader = make('polyline', 'holo__leader');
    this.dot = make('circle', 'holo__dot');
    this.outline = make('path', 'holo__outline');
    host.append(this.el);
  }

  /** The tier the frame is drawn at, when its object's state moves it off its spec's (a station on standby, 19 M1). */
  setTier(tier: HoloTier): void {
    if (this.el.dataset.holoTier !== tier) this.el.dataset.holoTier = tier;
  }

  /** Draws the frame round a `w`×`h` plate at `at`, and its pointer. */
  place(at: HoloPlacement, w: number, h: number): void {
    const { x0, y0 } = at.rect;
    this.el.style.display = '';
    this.el.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
    const pts = at.leader.map(([x, y]) => [x - Math.round(x0), y - Math.round(y0)] as const);
    // A pointer that starts where it ends (a planet's name, touching its rim) is not drawn.
    const pointed = pts.length > 1 && pts.some(([x, y]) => x !== pts[0]![0] || y !== pts[0]![1]);
    const sig = `${w}|${h}|${at.side}|${pointed ? pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') : 'bare'}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.outline.setAttribute('d', framePath(w, h, at.side));
    this.leader.setAttribute('points', pointed ? pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') : '');
    const [rx, ry] = pts[0]!;
    this.dot.setAttribute('cx', rx.toFixed(1));
    this.dot.setAttribute('cy', ry.toFixed(1));
    this.dot.setAttribute('r', pointed ? String(HOLO.dot) : '0');
  }

  /**
   * Draws the frame alone round a `w`×`h` plate at (x0, y0), with no pointer: a captain's picture in
   * play (19 L8), which hugs its ship. The corners are an upright plate's.
   */
  bare(x0: number, y0: number, w: number, h: number): void {
    this.el.style.display = '';
    this.el.style.transform = `translate(${Math.round(x0)}px, ${Math.round(y0)}px)`;
    const sig = `${w}|${h}|bare`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.outline.setAttribute('d', framePath(w, h, 'above'));
    this.leader.setAttribute('points', '');
    this.dot.setAttribute('r', '0');
  }

  /**
   * Draws the frame partway (22 A8, `u` 0 to 1; null: whole): the pointer draws out from its rim dot
   * over the first third, then the outline traces itself round the plate. Dash offsets, so nothing moves.
   */
  unfurl(u: number | null): void {
    const parts: [SVGGeometryElement, number][] = [[this.leader, u === null ? 1 : Math.min(1, u / 0.35)], [this.outline, u === null ? 1 : Math.max(0, Math.min(1, (u - 0.2) / 0.8))]];
    for (const [e, k] of parts) {
      if (u === null || k >= 1) {
        e.style.removeProperty('stroke-dasharray');
        e.style.removeProperty('stroke-dashoffset');
        continue;
      }
      const len = e.getTotalLength();
      e.style.strokeDasharray = `${len.toFixed(1)}`;
      e.style.strokeDashoffset = `${(len * (1 - k)).toFixed(1)}`;
    }
    this.dot.style.opacity = u === null || u >= 0.08 ? '' : String(u / 0.08);
  }

  hide(): void {
    this.el.style.display = 'none';
  }

  /** Lit with its label (hovered, selected, or expanded into its rows). */
  light(hover: boolean, selected: boolean, expanded = false): void {
    this.el.classList.toggle('is-hover', hover);
    this.el.classList.toggle('is-selected', selected);
    this.el.classList.toggle('is-expanded', expanded);
  }

  destroy(): void {
    this.el.remove();
  }
}
