// DOM callout labels anchored to world positions (06 §2/§4). Titles, IDs, states are live DOM text.
// In Solar a holo plate with a list expands into its rows in place (19 L2): this layer decides when
// (the Expanded tier, `GRACE_MS` after, and while the pointer is on the plate) and where (it keeps its
// place and grows away from its object, re-placing at most once, on expanding); holoRows.ts draws the
// rows and takes their input. A hover-only piece (19 L7) speaks through the plate that lists it: pointed
// at or selected, that plate expands with its row lit or marked, and in play its own plate shows while
// a maneuver casts it (`LabelMotion.cast`).
import { PLATE_TOP_MARGIN } from '@shared/plateInset';
import type { Role } from '@shared/contracts/history';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { MegaList, ViewGraph, ViewNode } from '@shared/contracts/view';
import { FEATURE_LINE_PX, FEATURE_OPEN_LINES, featureName, featureRows, type FeatureTally } from '@shared/featureRow';
import type { CameraController } from './camera';
import { isAvatarImage } from '@shared/scene/avatar';
import { capTitle, HOLO_TITLE_MAX_CHARS } from '@shared/scene/sizing';
import { assetFor } from './assets/registry';
import {
  expandAt, frameClip, growPlacement, HOLO_EDGE, holoCandidates, HoloFrame, holoUnderCandidate, holoVerticalCandidates, slidePlacement,
  type HoloPlacement, type HoloSpec, type HoloTier, type KindPlate, type KindPlates,
} from './holo/holoLabel';
import { GRACE_MS, HoloRows, inRows, metaphorSpan } from './holo/holoRows';
import type { CastNote } from './fx/v1/castLabels';
import './holo/holo.css';
import { formationSides, isCompact, raisedTier, tierFor, type FormationSide, type LabelTier } from './labelTiers';
import { moreText } from '../theme/registry';

/**
 * `holo`: the frame and pointer of a holographic label (its asset's `label`, or its paradigm's plate
 * for its kind), drawn beside the plate; `plate`: where that plate came from (its rim and way out).
 * `rows`: a holo plate's list, when the graph has one (19 L2); `wantedAt`, when it was last wanted
 * expanded (wall ms); `base`, the plate's Title or Full size, which its places are worked out from
 * while it's expanded; `pin`, the place it expanded on, kept until it closes.
 */
/**
 * A planet's name as the scene draws it (22 D7, revised): its plate's place in screen px and the inks the
 * plate wears now, read from the DOM plate that keeps the pointer and the rows. The scene draws it
 * between the planet and the objects over it, so the DOM plate is invisible while this is shown.
 */
export interface NamePlate {
  key: string; text: string; rect: Rect;
  ink: { title: string; line: string; glass: string; family: string; size: number; weight: string };
}

interface Label {
  /** A planet's name plate inks, read when its lit state last changed (`inkOf`). */
  ink?: { sig: string; value: NamePlate['ink'] };
  /** The tier its plate is drawn at now (`applyTier`). */
  drawn?: HoloTier;
  el: HTMLDivElement; node: ViewNode; w?: number; h?: number; compact?: boolean; tier?: LabelTier; holo?: HoloFrame; plate?: KindPlate; clip?: string;
  rows?: HoloRows; /** B2: the star plate's Features list is open now (pointed at or selected, plus the grace). */ featuresOpen?: boolean; wantedAt?: number; /** B2: when the pointer or selection last wanted the list open (wall ms). */ featWantedAt?: number; base?: { w: number; h: number }; pin?: number; maxH?: number; maxW?: number;
  /** B1: the room an upright expanded plate has above or below its object, when its rows are taller: it scrolls inside this. */
  room?: number;
  /** The place (of its candidates) the plate took at its last `position`, not expanded. */
  k?: number;
  /** B2: the place the plate took while its Features list is open; the resting `k` is never written then. */
  openK?: number;
  /** Shown only because a maneuver casts its piece (19 L7): it doesn't take the pointer. */
  castOnly?: boolean;
  /** Where its holo plate was last placed, screen px (`rectOf`: a sortie parks clear of it, 22 B9). */
  rect?: Rect;
  /** Where a hidden piece plate will first stand if nothing blocks its preferred place (`rectOf`, 27 E2: plates open at the act, so a sortie parks before it shows). */
  predicted?: Rect;
  /** The acting captain's event whose name found no place: the plate stays a picture for it (22 B9). */
  blocked?: string;
  /** The formation mode its candidates were built in (27 D1: 'v:right', 'h:above', ''); `k` is reset when it changes. */
  formed?: string;
  /** The note its plate wears now (22 B6), as drawn: its event and text. */
  note?: string;
  /** Held back while its body makes its entrance (22 A8); `emergeAt`: when it starts to unfurl (wall ms; after the glance). */
  waiting?: boolean;
  emergeAt?: number;
  /** How far it has unfurled this frame, 0 to 1; unset once whole. `unfurling`: styles are on it to clear. */
  unfurl?: number;
  unfurling?: boolean;
}

/** The kinds whose plate waits for its body's entrance, then emerges from it (22 A8, R11): ships and stations. */
const ARRIVES: ReadonlySet<ViewNode['kind']> = new Set(['captain', 'facility']);
/** How long an object is left alone after it arrives, before its plate begins to unfurl (22 A8), wall ms. */
export const EMERGE_DELAY_MS = 450;
/** How long a plate takes to unfurl from its ship or station: its pointer draws out, its frame traces itself, the plate is revealed from its near edge (22 A8), wall ms. */
export const EMERGE_MS = 520;
/** The direction a plate is revealed in, from the edge nearest its object, by the side it stands on. */
const REVEAL: Record<string, string> = { above: 'to top', below: 'to bottom', left: 'to left', right: 'to right', hug: 'to top' };

/** A plate on its own ray (22 D7): it reaches further along it before it would turn off it. */
const FIXED_RAY = [0] as const;
const FIXED_REACHES = [1, 1.9, 2.8, 3.7] as const;

/** A horizontal plate's way out when its node names none (`labelDir`): its preferred side's. */
const SIDE_DIR: Record<NonNullable<ViewNode['labelSide']>, { x: number; y: number }> = {
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, above: { x: 0, y: -1 }, below: { x: 0, y: 1 },
};

/**
 * Dynamic labels (06 §4, decided 2026-10-03): while playing, labels are compact (the title only; the
 * effects show state), ships collapse to their captain's picture hugging the top of the ship, and a
 * label returns to full only once its object, and the playback, have settled for a few seconds.
 */
export interface LabelMotion {
  /** Playback advanced recently (wall ms timestamp of the last frame that played). */
  lastPlayedAt: number;
  /** Nodes moving this frame (gliding, flying, steered by an effect). */
  moving: Set<string>;
  now: number;
  /**
   * Hover-only pieces a maneuver casts now (19 L7), by projection key, each with its plate's opacity
   * (1, then fading after its linger): their title shows while playing. Empty after a seek (INV-15).
   */
  cast?: ReadonlyMap<string, number>;
  /** The note a cast piece's plate wears while its maneuver plays (22 B6): its event's action, by projection key. */
  notes?: ReadonlyMap<string, CastNote>;
  /** Captains acting in the maneuver playing (22 B9): their plate unfurls to the name and their part, `u` 0 to 1. */
  crew?: ReadonlyMap<string, { u: number; text: string; eventKey: string; rides?: true }>;
  /** Screen px the side panel covers at the view's right: a holo plate counts as in view only left of it. */
  rightInset?: number;
  /** Screen px the player covers at the top: an expanded plate that must be capped stays below it (B1). */
  topInset?: number;
  /** Whether a node's body is still making its entrance (faded, sliding in): its plate waits (22 A8). */
  entering?: (pk: string) => boolean;
  /** Reduced motion: a plate whose body has arrived shows at once, with no emergence. */
  reduced?: boolean;
}
/** How long an object (and the playback) must be still before its full label returns. */
export const SETTLE_MS = 3000;
/** A flashed label (a new or changed Task) shows its title this long, then fades. */
export const FLASH_MS = 3500;
/** A screen rect, in px. */
export interface Rect { x0: number; y0: number; x1: number; y1: number }

const RANK: Record<string, number> = { galaxy: 0, star: 0, planet: 1, anomaly: 1, station: 2, flight: 3, missionPoint: 3, captain: 4, assignmentBeacon: 5 };
/** A v1 node's label rank is its asset's (14 §8: the remix point); v0 nodes keep the kind table. */
const rank = (n: ViewNode) => assetFor(n)?.rank ?? RANK[n.kind] ?? 6;

/**
 * Candidate sides in preference order (06 §4). Horizontal layouts try the preferred side, its
 * opposite, then above/below; vertical layouts try above/below first, then right/left. The default
 * for unmarked nodes reads top-left to bottom-right: below, right, above, left.
 */
export function sideOrder(n: ViewNode): string[] {
  const pref = n.labelSide ?? 'below';
  const opposite: Record<string, string> = { left: 'right', right: 'left', above: 'below', below: 'above' };
  if (n.labelLayout === 'horizontal') {
    const h = pref === 'left' || pref === 'right' ? pref : 'left';
    return [h, opposite[h]!, 'above', 'below'];
  }
  if (n.labelLayout === 'vertical') {
    const v = pref === 'above' || pref === 'below' ? pref : 'below';
    return [v, opposite[v]!, 'right', 'left'];
  }
  return [pref, ...['below', 'right', 'above', 'left'].filter((s) => s !== pref)];
}
const collides = (r: Rect, others: Rect[]) =>
  others.some((o) => !(r.x1 + 4 < o.x0 || o.x1 + 4 < r.x0 || r.y1 + 2 < o.y0 || o.y1 + 2 < r.y0));

/**
 * The avatar circle: initials on their color, with the picture (when there is one) laid over them,
 * so a picture that fails to load falls back to the initials.
 */
export function avatarCircle(a: NonNullable<ViewNode['avatar']>): HTMLElement {
  const circle = document.createElement('span');
  circle.className = 'callout__avatar';
  circle.style.backgroundColor = `#${a.color.toString(16).padStart(6, '0')}`;
  circle.textContent = a.initials;
  if (a.image && isAvatarImage(a.image)) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = a.image;
    img.addEventListener('error', () => img.remove());
    circle.append(img);
  }
  return circle;
}

/** The tier a plate rises to: its spec's, but a station on standby is a Place (19 M1). At rest every plate is T4 Sky (27 B1). */
export function ownTier(node: ViewNode, spec: HoloSpec): HoloTier {
  return node.flags.standby ? 'place' : spec.tier;
}

/** What a plate needs to draw its Features row (B3): whether the list is open, and the chart's word for a container. */
export interface FeaturesUi { open: boolean; word?: string }

/**
 * A star plate's Features (B3, 27 B2, 15 §6 `feature-row`): at rest the top one, a line (`Feature #123 · Title`, the
 * piece count) with `+N more` at its end; open (pointed at or selected), every Feature. Quiet text; no object is drawn (INV-10). A star with none
 * keeps one empty line, so the plate never grows when Features arrive (R4).
 */
export function featuresBlock(all: readonly FeatureTally[], ui: FeaturesUi = { open: false }, lines = 0): HTMLElement {
  const box = document.createElement('div');
  box.className = 'holo__features';
  const blank = () => {
    const line = document.createElement('span');
    line.className = 'callout__meta holo__feat holo__feat--blank';
    line.textContent = '\u00a0';
    return line;
  };
  const { shown, more } = featureRows(all, ui.open);
  // The opened list scrolls inside a box of at most FEATURE_OPEN_LINES lines, so the plate stays inside the view (R5).
  const scroll = document.createElement('div');
  scroll.className = 'holo__feat-scroll';
  scroll.style.maxHeight = `${FEATURE_OPEN_LINES * FEATURE_LINE_PX}px`;
  scroll.addEventListener('wheel', (e) => { if (scroll.scrollHeight > scroll.clientHeight) e.stopPropagation(); }, { passive: true });
  for (const f of shown) {
    const line = document.createElement('span');
    line.className = 'callout__meta holo__feat';
    line.dataset.key = f.key;
    const name = document.createElement('span');
    name.className = 'holo__feat-name';
    name.textContent = featureName(f);
    name.title = featureName(f);
    const count = document.createElement('span');
    count.className = 'holo__feat-count';
    count.textContent = ` · ${f.count}`;
    line.append(name, count);
    if (ui.word) line.append(metaphorSpan(` · ${ui.word}`));
    scroll.append(line);
  }
  // The lines the round ever needs are held from the first draw (R4), so a seek never changes the plate's height.
  const used = shown.length;
  if (!ui.open) for (let i = used; i < lines; i++) scroll.append(blank());
  if (more > 0 && !ui.open) {
    const tail = scroll.querySelector<HTMLElement>('.holo__feat:last-child');
    const note = document.createElement('span');
    note.className = 'holo__feat-more';
    note.textContent = moreText(more);
    tail?.append(note);
  }
  box.classList.toggle('is-open', ui.open);
  box.append(scroll);
  return box;
}

/**
 * A holographic plate's content (chart/holo): the title, and in the `subtitle` variant the node's meta
 * beneath it, dimmer; the `avatar` variant leads with the picture. Its tier is the plate's
 * `data-holo-tier` (19 §2). Shared by the chart's labels and the gallery's *Label hierarchy* cell.
 */
export function renderHoloPlate(el: HTMLElement, node: ViewNode, spec: HoloSpec, metaphor?: string, features?: FeaturesUi, tier?: HoloTier): void {
  el.textContent = '';
  el.dataset.holoTier = tier ?? ownTier(node, spec);
  const title = document.createElement('span');
  title.className = 'callout__title';
  title.textContent = capTitle(node.label, HOLO_TITLE_MAX_CHARS); // two lines, then the plate's "…" (22 A7)
  el.title = node.label !== title.textContent ? node.label : '';
  // The `avatar` variant leads with the picture; its title sits in `callout__lines`, which the
  // picture tier hides, so a ship in play still shows only its captain's picture.
  const withAvatar = spec.variant === 'avatar' && !!node.avatar;
  el.classList.toggle('callout--avatar', withAvatar);
  if (withAvatar) {
    const lines = document.createElement('span');
    lines.className = 'callout__lines';
    lines.append(title);
    el.append(avatarCircle(node.avatar!), lines);
  } else el.append(title);
  if (spec.variant === 'subtitle' && node.meta) {
    // The line's last part (a count: `16 items`) always shows; on a plate too narrow for the whole line,
    // what's before it gives way from its start, so a long Area Path keeps its leaf (19 P1).
    const sub = document.createElement('span');
    sub.className = 'callout__meta holo__meta';
    const cut = node.meta.lastIndexOf(' · ');
    const head = document.createElement('span');
    head.className = 'holo__meta-head';
    head.textContent = cut < 0 ? node.meta : node.meta.slice(0, cut);
    sub.append(head);
    if (cut >= 0) {
      const tail = document.createElement('span');
      tail.className = 'holo__meta-tail';
      tail.textContent = node.meta.slice(cut);
      sub.append(tail);
    }
    if (metaphor) sub.append(metaphorSpan(` · ${metaphor}`));
    el.append(sub);
    if (node.features) el.append(featuresBlock(node.features, features, node.featureLines ?? 0));
  } else if (metaphor) {
    // A name at rest (a captain, a homeworld): its chart name joins it only when the plate is expanded.
    const line = metaphorSpan(metaphor);
    line.classList.add('callout__meta', 'holo__metaphor--expanded');
    (el.querySelector('.callout__lines') ?? el).append(line);
  }
}

/** A cast plate's note (22 B6): one line under its title, or none; it names its event (`data-event-key`). */
function setNote(el: HTMLElement, note: CastNote | undefined): void {
  const home = el.querySelector<HTMLElement>(':scope > .callout__lines') ?? el; // a captain's: beside the picture, under the name
  let span = home.querySelector<HTMLElement>(':scope > .holo__note');
  if (!note) { span?.remove(); return; }
  if (!span) {
    span = document.createElement('span');
    span.className = 'holo__note';
    home.append(span);
  }
  span.textContent = note.text;
  span.dataset.eventKey = note.eventKey;
}

/**
 * A label of a selectable object is its button (decided 2026-10-07): presses and hovers go to the
 * chart. An expanded plate's rows (holoRows.ts) light, pick and open through the optional rest.
 */
export interface LabelInput {
  press(node: ViewNode, e: PointerEvent): void;
  hover(node: ViewNode | null): void;
  /** A row is hovered or long-pressed: light its objects (its own, or what it serves; null when it ends). */
  light?(keys: readonly CanonicalKey[] | null): void;
  /** A row was pressed: select its object, by key (it may not be drawn: a landed piece). */
  pick?(key: CanonicalKey, e: PointerEvent): void;
  /** A row's read-only link at the source (INV-21). */
  open?(url: string | null, key?: CanonicalKey): void;
  /** The chart's name for a node, and for a row's role (22 B3): shown after the identity line. */
  metaphor?(node: ViewNode): string | undefined;
  roleWord?(role: Role): string | undefined;
}

/** An expanded plate is never wider than this, nor than the view (less its margins). */
export const EXPANDED_MAX_W = 320;

/** A piece plate's size before it has been measured (title and note), screen px: for predicting where it will stand. */
const PREDICT_W = 190;
const PREDICT_H = 56;

export class LabelLayer {
  private readonly labels = new Map<string, Label>();
  private debug = false;
  /** Each holo captain's picture square this frame, by projection key (an obstacle to every other plate). */
  private readonly pictureOf = new Map<string, Rect>();
  /** What's hovered or lit: the pointer's object, or what a plate's row lights (one or more). */
  private hovered: ReadonlySet<string> = new Set();
  /** The captain being followed (05 §6): their ship stays compact like every other ship, even when selected. */
  private followed: string | null = null;
  /** What the pointer is over on the chart: the one label that opens fully while playing, to be read. */
  private pointed: string | null = null;
  /** B2: the selection was made by entering a scene, so it keeps the star selected but doesn't open its Features list (27 Decisions 2026-11-01). */
  private selectedByEntry = false;
  setSelectedByEntry(on: boolean): void { this.selectedByEntry = on; }
  private selected: string | null = null;
  /** When each node last moved (wall ms), and labels flashed until a time. */
  private readonly lastMoved = new Map<string, number>();
  private readonly flashed = new Map<string, number>();
  /** Screen rects other layers hold (the overlays), placed beside the lane heads. */
  private extra: Rect[] = [];
  /** Projection keys whose plate showed its rows at the last `position`. */
  private open = new Set<string>();
  /** The graph's lists (v1), by projection key: the rows a holo plate grows when expanded. */
  private lists: Readonly<Record<string, MegaList>> = {};
  /** The paradigm's plates for asset-less nodes (19 R1), and the level the synced scene is at. */
  private plates: KindPlates | null = null;
  private level = '';
  /**
   * The plate that lists each object as a row of its own (19 L7: a seated piece's planet), by the
   * object's key: a hover-only piece speaks through it. A row standing for others (a PR) lists no one.
   */
  private hosts = new Map<string, string>();

  /** The paradigm's holo plates for nodes with no asset; null keeps them standard (the v0 views). */
  setPlates(plates: KindPlates | null): void {
    this.plates = plates;
  }

  /** A node's holo plate: its asset's, else its paradigm's for its kind at this level, else none. */
  private plateFor(node: ViewNode): KindPlate | undefined {
    const asset = assetFor(node);
    if (asset) return asset.label ? { label: asset.label, ...(asset.labelRim !== undefined ? { labelRim: asset.labelRim } : {}) } : undefined;
    return this.plates?.[this.level]?.[node.kind];
  }

  setPointed(key: string | null): void {
    this.pointed = key;
  }

  setFollowed(key: string | null): void {
    this.followed = key;
  }

  /** Rects to keep clear at the next `position`, as an overlay drew them (14 §2.9, `ChartOverlay.rects`). */
  obstacles(rects: Rect[]): void {
    this.extra = rects;
  }

  /** The plates that show their rows now, by projection key. */
  expanded(): ReadonlySet<string> {
    return this.open;
  }

  /** Show a label's title briefly (a new or changed Task), even if it normally labels on hover. */
  flash(projectionKey: string, now: number): void {
    this.flashed.set(projectionKey, now + FLASH_MS);
  }

  constructor(private readonly host: HTMLElement, private readonly input?: LabelInput) {}

  /**
   * `level`: the scene's level id (`galaxy` at the root), which picks the paradigm's plates; `lists`:
   * the graph's lists (v1), which a holo plate shows as its rows when expanded.
   */
  sync(nodes: ViewNode[], level = '', lists: Readonly<Record<string, MegaList>> = {}): void {
    this.level = level;
    this.lists = lists;
    const seen = new Set<string>();
    for (const node of nodes) {
      seen.add(node.projectionKey);
      let label = this.labels.get(node.projectionKey);
      const plate = this.plateFor(node);
      // Another paradigm's plate for the same node (the galaxy, across a switch): build it afresh.
      if (label && label.holo?.spec !== plate?.label) {
        this.drop(label);
        this.labels.delete(node.projectionKey);
        label = undefined;
      }
      if (!label) {
        const el = document.createElement('div');
        el.className = `callout callout--${node.kind}`;
        el.setAttribute('aria-hidden', 'true'); // the object list is the accessible equivalent
        this.host.appendChild(el);
        const spec = plate?.label;
        if (spec) el.classList.add('callout--holo', `callout--holo-${spec.variant}`);
        const created: Label = { el, node, ...(spec ? { holo: new HoloFrame(this.host, spec, node.kind), plate } : {}) };
        label = created;
        this.labels.set(node.projectionKey, label);
        // A press on the plate selects its object; a press on one of its rows is the row's (holoRows.ts).
        el.addEventListener('pointerdown', (e) => { if (created.node.selectable && !inRows(e.target)) { e.preventDefault(); this.input?.press(created.node, e); } });
        // A cast piece's plate is passing (19 L7): pointing at it would hand it to its host's plate and
        // hide it under the pointer, so it takes presses only.
        el.addEventListener('pointerenter', () => { if (created.node.selectable && !created.castOnly) this.input?.hover(created.node); });
        el.addEventListener('pointerleave', () => { if (created.node.selectable && !created.castOnly) this.input?.hover(null); });
      }
      label.node = node;
      label.el.classList.toggle('is-target', node.selectable && !!this.input);
      label.el.classList.toggle('is-quiet', !!node.flags.quiet);
      // A holo plate's rows: drawn from its list as it changes; a plate whose list went closes.
      const list = label.holo ? lists[node.projectionKey] : undefined;
      if (list) {
        const input = this.input;
        label.rows ??= new HoloRows(label.el, {
          ...(input?.light ? { light: (k: readonly CanonicalKey[] | null) => input.light!(k) } : {}),
          ...(input?.pick ? { press: (k: CanonicalKey, e: PointerEvent) => input.pick!(k, e) } : {}),
          ...(input?.open ? { open: (url: string | null, k?: CanonicalKey) => input.open!(url, k) } : {}),
          ...(input?.roleWord ? { roleWord: (r: Role) => input.roleWord!(r) } : {}),
        });
        label.rows.set(list);
      } else if (label.rows?.attached) this.collapse(label);
      this.render(label);
    }
    for (const [pk, label] of this.labels) {
      if (!seen.has(pk)) {
        this.drop(label);
        this.labels.delete(pk);
      }
    }
    this.hosts = new Map();
    for (const [pk, list] of Object.entries(lists)) {
      if (!this.labels.get(pk)?.rows) continue;
      for (const row of list.rows) if (!row.serves?.length && !this.hosts.has(row.key)) this.hosts.set(row.key, pk);
    }
  }

  /** Removes a label and its frame; its rows light nothing any more. */
  private drop(label: Label): void {
    label.rows?.detach();
    label.el.remove();
    label.holo?.destroy();
  }

  /** Shows a plate's rows (19 L2), measuring its Title or Full size first: its places come from that. */
  private expand(label: Label, viewW: number, viewH: number): void {
    const { el } = label;
    label.base = { w: label.w ?? el.offsetWidth, h: label.h ?? el.offsetHeight };
    label.pin = undefined;
    el.classList.add('is-expanded');
    this.fitExpanded(label, viewW, viewH);
    label.rows!.attach();
    label.rows!.markObjects(this.hovered, this.selected);
    label.w = undefined;
    label.h = undefined;
    this.lightFrame(label);
  }

  /** An expanded plate is never taller or wider than the view; its rows scroll inside it. */
  private fitExpanded(label: Label, viewW: number, viewH: number): void {
    const maxH = Math.max(0, Math.floor(viewH - 2 * HOLO_EDGE));
    const maxW = Math.max(0, Math.floor(viewW - 2 * HOLO_EDGE));
    if (label.maxH === maxH && label.maxW === maxW) return;
    label.maxH = maxH;
    label.maxW = maxW;
    label.el.style.maxHeight = `${Math.min(maxH, label.room ?? maxH)}px`;
    label.el.style.maxWidth = `${Math.min(EXPANDED_MAX_W, maxW)}px`;
    label.w = undefined;
  }

  /** Back to its title (and subtitle): the rows go, and the plate is placed afresh. */
  private collapse(label: Label): void {
    const { el } = label;
    label.rows?.detach();
    el.classList.remove('is-expanded');
    el.style.maxHeight = '';
    el.style.maxWidth = '';
    label.maxH = undefined;
    label.maxW = undefined;
    label.room = undefined;
    label.base = undefined;
    label.pin = undefined;
    label.w = undefined;
    label.h = undefined;
    this.lightFrame(label);
  }

  private lightFrame(label: Label): void {
    const key = label.node.canonicalKey;
    label.holo?.light(this.hovered.has(key), key === this.selected, !!label.rows?.attached);
  }

  setDebug(on: boolean): void {
    this.debug = on;
    for (const l of this.labels.values()) this.render(l);
  }

  /** `hovered`: the hovered object's key, or the keys a plate's row lights (19 L6: a PR's pieces). */
  setHighlight(hovered: string | readonly string[] | null, selectedKey: string | null): void {
    this.hovered = new Set(hovered === null ? [] : typeof hovered === 'string' ? [hovered] : hovered);
    this.selected = selectedKey;
    for (const l of this.labels.values()) {
      const was = l.el.classList.contains('is-hover') || l.el.classList.contains('is-selected');
      l.el.classList.toggle('is-hover', this.hovered.has(l.node.canonicalKey));
      l.el.classList.toggle('is-selected', l.node.canonicalKey === selectedKey);
      // A name at rest grows its chart name when lit (22 B3): measure it again.
      if (was !== (l.el.classList.contains('is-hover') || l.el.classList.contains('is-selected')) && l.el.querySelector('.holo__metaphor--expanded')) {
        l.w = undefined;
        l.h = undefined;
      }
      this.lightFrame(l);
      // Both ways (19 L7): what's hovered or selected on the chart lights or marks its row.
      l.rows?.markObjects(this.hovered, selectedKey);
    }
  }

  private render(label: Label): void {
    const { node, el } = label;
    label.w = undefined;
    label.h = undefined;
    if (this.debug) {
      el.textContent = '';
      const a = document.createElement('span');
      a.className = 'callout__meta';
      a.textContent = `${node.projectionKey}${node.slot !== undefined ? ` · slot ${node.slot}` : ''}`;
      el.appendChild(a);
      return;
    }
    const featScroll = el.querySelector<HTMLElement>('.holo__feat-scroll')?.scrollTop ?? 0;
    el.textContent = '';
    label.note = undefined; // a redraw drops the note: the next frame puts it back
    if (label.holo) {
      // A holographic plate (chart/holo); the rest of its object's details are in the inspector.
      renderHoloPlate(el, node, label.holo.spec, this.input?.metaphor?.(node), node.features ? {
        open: !!label.featuresOpen, word: this.input?.roleWord?.('container'),
      } : undefined, label.drawn ?? 'sky');
      label.holo.setTier(label.drawn ?? 'sky');
      if (featScroll) { const sc = el.querySelector<HTMLElement>('.holo__feat-scroll'); if (sc) sc.scrollTop = featScroll; }
      if (label.rows?.attached) label.rows.attach(); // the rows follow the redrawn title
      el.classList.toggle('is-hover', this.hovered.has(node.canonicalKey));
      el.classList.toggle('is-selected', node.canonicalKey === this.selected);
      return;
    }
    // Any label can lead with an avatar circle (06 §4); the text lines then stack beside it.
    el.classList.toggle('callout--avatar', !!node.avatar);
    const lines: HTMLElement = node.avatar ? document.createElement('span') : el;
    if (node.avatar) {
      lines.className = 'callout__lines';
      el.append(avatarCircle(node.avatar), lines);
    }
    const title = document.createElement('span');
    title.className = 'callout__title';
    title.textContent = capTitle(node.label); // capped to the longest possible subtitle (06 §4)
    el.title = node.label !== title.textContent ? node.label : '';
    const meta = document.createElement('span');
    meta.className = 'callout__meta';
    meta.textContent = node.meta ?? '';
    lines.append(title, meta);
    if (node.meta2) {
      const who = document.createElement('span');
      who.className = 'callout__who';
      who.textContent = node.meta2;
      lines.append(who);
    }
    if (node.tally) {
      // The radar's tally (06 §3): a number and a word per band, in its rung's color (INV-20).
      const tally = document.createElement('span');
      tally.className = 'callout__tally';
      node.tally.forEach((t, i) => {
        const part = document.createElement('span');
        part.className = `radar-count radar-count--${t.band}${t.count ? '' : ' is-empty'}`;
        part.textContent = `${i ? ' · ' : ''}${t.count} ${t.band}`;
        tally.append(part);
      });
      lines.append(tally);
    }
    el.classList.toggle('is-hover', this.hovered.has(node.canonicalKey));
    el.classList.toggle('is-selected', node.canonicalKey === this.selected);
  }

  /**
   * Called every frame after the camera moves. Labels are screen-sized, so collisions are resolved in
   * screen space. Each label tries four spots touching its own body (below, above, right, left); if
   * none is free it hides until hovered or selected, rather than drifting next to a different body.
   * Placement order is stable: selected/hovered first, then by kind priority, then by key.
   */
  /** The planets' names the scene draws this frame (closed plates only: an opened one is DOM, over everything). */
  private names: NamePlate[] = [];
  nameplates(): readonly NamePlate[] {
    return this.names;
  }

  /** Draws a plate at `tier`; a change re-measures it (T4's title is smaller). */
  private applyTier(label: Label, tier: HoloTier): void {
    if (!label.holo) return;
    if (label.el.dataset.holoTier !== tier) {
      label.el.dataset.holoTier = tier;
      label.w = undefined;
      label.h = undefined;
      label.ink = undefined;
    }
    label.holo.setTier(tier);
    label.drawn = tier;
  }

  /** A plate's inks as it is lit now (cached by its lit state and tier, which set its size in play, so the style isn't read every frame). */
  private inkOf(label: Label, lit: string): NamePlate['ink'] {
    if (label.ink?.sig === lit) return label.ink.value;
    const title = getComputedStyle(label.el.querySelector('.callout__title') ?? label.el);
    const frame = getComputedStyle(label.holo!.el);
    const value = {
      title: title.color, line: frame.getPropertyValue('--h-line').trim() || 'rgba(127, 227, 255, 0.5)',
      glass: getComputedStyle(label.el).backgroundColor, family: title.fontFamily, size: parseFloat(title.fontSize) || 12, weight: title.fontWeight,
    };
    label.ink = { sig: lit, value };
    return value;
  }

  position(camera: CameraController, viewW: number, viewH: number, live?: ViewNode[], motion?: LabelMotion): void {
    this.names = [];
    const now = motion?.now ?? 0;
    const wall = motion?.now ?? performance.now();
    for (const pk of motion?.moving ?? []) this.lastMoved.set(pk, now);
    for (const [pk, until] of this.flashed) if (until < now) this.flashed.delete(pk);
    const playingLately = motion ? now - motion.lastPlayedAt < SETTLE_MS : false;
    const movedLately = (pk: string) => (motion ? now - (this.lastMoved.get(pk) ?? -Infinity) < SETTLE_MS : false);
    const open = new Set<string>();
    // Use positions as drawn (floored sizes, attached ships, the PR lane), not the projection's hints.
    const nodes = live ?? [...this.labels.values()].map((l) => l.node);
    const byPk = new Map(nodes.map((n) => [n.projectionKey, n]));
    for (const l of this.labels.values()) l.node = byPk.get(l.node.projectionKey) ?? l.node;
    // Every drawn object is an obstacle (bodies, vessels, ships, stations)...
    const bodies = new Map<string, Rect>();
    for (const node of nodes) {
      if (!node.selectable && !node.labelled) continue;
      const c = camera.worldToScreen(node.world.x, node.world.y);
      const r = node.world.r * camera.state.scale;
      bodies.set(node.projectionKey, { x0: c.x - r, y0: c.y - r, x1: c.x + r, y1: c.y + r });
    }
    // ...except the label's own object and the captain ship assigned to it (06 §4: a label may touch
    // only what it annotates, and a ship and its assignment may share a label's space).
    // A label covers only its own object (decided 2026-10-09). A star, planet, anomaly, vessel or station
    // label changes sides, or hides, rather than sit over a captain's ship, even the one working that
    // object; and a ship's label no longer drops onto the work it rides above (the board, 06 §3).
    const allowed = (n: ViewNode): Set<string> => new Set([n.projectionKey]);
    // An expanded plate places first (it was opened to be read, and holds its place), then what's
    // selected or hovered, then the rest.
    const expandedNow = new Set<string>();
    for (const [pk, l] of this.labels) if (l.rows?.attached) expandedNow.add(pk);
    // The plates that list what's pointed at or selected (19 L7): they open as if it were their own object.
    const hostPointed = this.pointed !== null ? this.hosts.get(this.pointed) : undefined;
    const hostSelected = this.selected !== null ? this.hosts.get(this.selected) : undefined;
    const hosting = (n: ViewNode) => n.projectionKey === hostPointed || n.projectionKey === hostSelected;
    const focus = (n: ViewNode) => (expandedNow.has(n.projectionKey) ? 0 : n.canonicalKey === this.selected || this.hovered.has(n.canonicalKey) || hosting(n) ? 1 : 2);
    const focused = (n: ViewNode) => focus(n) < 2;
    const cast = motion?.cast;
    // A flashed label (a Task that just appeared or moved), a piece a maneuver casts, or a captain it
    // names (22 C10: their room comes before the standing plates'), is placed right after focused ones.
    const flashRank = (n: ViewNode) => (this.flashed.has(n.projectionKey) || cast?.has(n.projectionKey) || motion?.crew?.has(n.projectionKey) ? 0 : 1);
    // Within a kind, earlier slots first: when Underway Tasks crowd, the earliest keep their labels.
    // A piece a maneuver casts places with the selected (focus 1), cast first: a star selected by entering its pod
    // (B2) no longer opens its list, so its resting plate must not take the room a cast plate needs (19 L7).
    const order = (n: ViewNode) => (cast?.has(n.projectionKey) ? Math.min(focus(n), 1) : focus(n));
    const ordered = [...this.labels.values()].sort((a, b) =>
      order(a.node) - order(b.node) || flashRank(a.node) - flashRank(b.node) || rank(a.node) - rank(b.node) || (a.node.slot ?? 0) - (b.node.slot ?? 0)
      || (a.node.projectionKey < b.node.projectionKey ? -1 : 1));
    const placed: Rect[] = [];
    const placedNames: string[] = [];
    /** The expanded plates placed this frame. */
    const grown: Rect[] = [];
    // A board's lane heads are placed first: they name a whole swimlane, so labels go around them.
    for (const l of this.lanes) {
      const r = this.laneRect(camera, l);
      placed.push(r);
      placedNames.push('lane-head');
    }
    // So are the overlays' rects (what another layer holds on screen).
    for (const r of this.extra) {
      placed.push(r);
      placedNames.push('overlay');
    }
    // And a holo captain's picture: pinned to its hull, it can't move aside, so every plate goes
    // around it (19 review: the star's and a cast piece's plates sat over the squares). From the last
    // frame's tier and size; a ship that just changed tier is caught up next frame, and its own stale
    // square never blocks its own plate. v0's pictures place as they always have.
    const pictureOf = this.pictureOf;
    pictureOf.clear();
    for (const l of this.labels.values()) {
      if (!l.holo || l.tier !== 'picture' || !l.w || !l.h || !bodies.has(l.node.projectionKey)) continue;
      const c = camera.worldToScreen(l.node.world.x, l.node.world.y);
      const hug = l.node.world.r * camera.state.scale * (assetFor(l.node)?.labelRim ?? 0.55);
      const rect = { x0: c.x - l.w / 2, y0: c.y - hug - l.h, x1: c.x + l.w / 2, y1: c.y - hug };
      pictureOf.set(l.node.projectionKey, rect);
      placed.push(rect);
      placedNames.push(`picture:${l.node.label.slice(0, 16)}`);
    }
    /** What a label goes around: everything placed, less its own object's picture. */
    const othersPlaced = (n: ViewNode): Rect[] => {
      const own = pictureOf.get(n.projectionKey);
      return own ? placed.filter((r) => r !== own) : placed;
    };
    /** A plate is placed only while its object is near the view. */
    const shown = (n: ViewNode): boolean => {
      const p = camera.worldToScreen(n.world.x, n.world.y);
      return p.x > -200 && p.x < viewW + 200 && p.y > -80 && p.y < viewH + 80;
    };
    // A formation is a crew of two or more sharing one event (27 D1): its plates stand away from its line.
    const formations = new Map<string, FormationSide>();
    const crewBodies = new Map<string, Rect[]>();
    if (motion?.crew?.size) {
      const groups = new Map<string, { pk: string; x: number; y: number }[]>();
      for (const [pk, cr] of motion.crew) {
        const n = byPk.get(pk);
        if (!n || !bodies.has(pk)) continue;
        const p = camera.worldToScreen(n.world.x, n.world.y);
        const g = groups.get(cr.eventKey) ?? [];
        g.push({ pk, x: p.x, y: p.y });
        groups.set(cr.eventKey, g);
      }
      for (const g of groups.values()) {
        for (const [pk, f] of formationSides(g, viewW)) {
          formations.set(pk, f);
          crewBodies.set(pk, g.filter((m) => m.pk !== pk).map((m) => bodies.get(m.pk)!));
        }
      }
    }
    for (const label of ordered) {
      const { el, node } = label;
      // Every plate rests at T4 Sky and rises to its own tier while raised (27 B1); settled before any hide, so a hidden plate rests too.
      const settle = (): void => {
        if (!label.holo) return;
        const key = node.canonicalKey, pk = node.projectionKey;
        this.applyTier(label, raisedTier(ownTier(node, label.holo.spec), {
          pointed: key === this.pointed || this.hovered.has(key) || pk === hostPointed,
          selected: key === this.selected || pk === hostSelected,
          followed: key === this.followed, expanded: !!label.rows?.attached,
          cast: (motion?.cast?.get(pk) ?? 0) > 0, acting: !!motion?.crew?.has(pk),
        }));
      };
      settle();
      const c = camera.worldToScreen(node.world.x, node.world.y);
      // Galaxies' names sit close under the bright core (decided 2026-10-07), so a grid reads as pairs.
      const factor = node.kind === 'galaxy' ? 0.45 : node.kind === 'star' ? 1.2 : node.kind === 'station' ? 0.62 : 1.4;
      const rScreen = node.world.r * camera.state.scale * factor;
      const onScreen = shown(node);
      // Radar Tasks off the Underway band label only when hovered, selected, or briefly flashed (06 §4).
      // A hover-only piece (19 L7) labels while a maneuver casts it, and never while the plate that
      // lists it is open (or opening, as the pointer is on it, if that plate is on screen to open):
      // its row there names it.
      const flashUntil = this.flashed.get(node.projectionKey);
      const host = node.labelOnHover ? this.hosts.get(node.canonicalKey) : undefined;
      const hostLabel = host !== undefined ? this.labels.get(host) : undefined;
      const spoken = hostLabel !== undefined && (!!hostLabel.rows?.attached || (node.canonicalKey === this.pointed && shown(hostLabel.node)));
      const castOnly = node.labelOnHover && !focused(node) && flashUntil === undefined ? cast?.get(node.projectionKey) ?? 0 : 0;
      label.castOnly = castOnly > 0;
      if (!onScreen || spoken || (node.labelOnHover && !focused(node) && flashUntil === undefined && castOnly <= 0)) {
        // A piece's plate opens at the act (27 E2), after its sortie has chosen where to park: say where it will stand.
        const pdir = node.labelDir ?? label.plate?.dir ?? SIDE_DIR[node.labelSide ?? 'below'];
        label.predicted = onScreen && node.labelOnHover && label.holo && label.holo.spec.layout !== 'vertical'
          ? holoCandidates({ cx: c.x, cy: c.y, r: node.world.r * camera.state.scale * (label.plate?.labelRim ?? 1), dirX: pdir.x, dirY: pdir.y }, label.w ?? PREDICT_W, label.h ?? PREDICT_H)[0]?.rect
          : undefined;
        if (label.rows?.attached) this.collapse(label);
        el.style.display = 'none';
        label.holo?.hide();
        continue;
      }
      // An object arrives before its label (22 A8, R11): a ship's or a station's plate waits while its body
      // makes its entrance (warps in, fades up, flies in), then emerges from it, and stays.
      if (ARRIVES.has(node.kind) && motion?.entering?.(node.projectionKey)) {
        label.waiting = true;
        label.emergeAt = undefined;
        el.style.display = 'none';
        label.holo?.hide();
        continue;
      }
      // Once its body is in, the object is left alone a moment (a glance), then its plate unfurls from it.
      if (label.waiting) {
        label.waiting = false;
        label.emergeAt = motion?.reduced ? undefined : (motion?.now ?? performance.now()) + EMERGE_DELAY_MS;
      }
      const sinceStart = label.emergeAt !== undefined ? (motion?.now ?? performance.now()) - label.emergeAt : EMERGE_MS;
      if (sinceStart < 0) {
        el.style.display = 'none';
        label.holo?.hide();
        continue;
      }
      label.unfurl = sinceStart < EMERGE_MS ? sinceStart / EMERGE_MS : undefined;
      if (label.unfurl === undefined) label.emergeAt = undefined;
      // An acting captain's plate (22 B9) opens from the picture to the name while the maneuver plays,
      // and folds back after; its unfurl is the window's, in and out.
      const crew = node.kind === 'captain' ? motion?.crew?.get(node.projectionKey) : undefined;
      if (!crew) label.blocked = undefined;
      // A plate that found no place for its name keeps to its picture for that maneuver (never blinks out).
      const acting = crew && label.blocked !== crew.eventKey ? crew : undefined;
      if (acting && label.unfurl === undefined && acting.u < 1) label.unfurl = acting.u;
      el.style.display = '';
      // B2: the star plate's Features list opens while pointed at or selected, and GRACE_MS after; decided before this
      // frame's measure and placement.
      if (node.features) {
        if (node.canonicalKey === this.pointed || (node.canonicalKey === this.selected && !this.selectedByEntry)) label.featWantedAt = wall;
        const openNow = wall - (label.featWantedAt ?? -Infinity) <= GRACE_MS;
        if (openNow !== !!label.featuresOpen) { label.featuresOpen = openNow; if (!openNow) label.openK = undefined; this.render(label); }
      }
      // Tiers (decided 2026-10-04, `tierFor`): full when stopped; the title while playing or moving,
      // selected and card-lit objects included (the reticle and highlight mark them); ships their
      // captain's picture. Only what the pointer is over opens fully, to be read, and never the
      // followed ship. A flash fades out at its end. A v1 object pointed at or selected is expanded:
      // its holo plate grows its rows in place (19 L2).
      // A plate that lists the pointed or selected object opens as if pointed or selected (19 L7); a
      // cast piece's plate is its title alone, paused or not.
      const base = castOnly > 0 ? 'title' : tierFor(node, {
        pointed: node.canonicalKey === this.pointed || node.projectionKey === hostPointed,
        selected: node.canonicalKey === this.selected || node.projectionKey === hostSelected,
        followed: node.canonicalKey === this.followed, recent: playingLately, moving: movedLately(node.projectionKey),
        flashed: flashUntil !== undefined,
      });
      const tier = acting && base === 'picture' ? 'title' : base; // an acting captain shows their name, not just their picture (22 B9)
      const actingNow = !!acting && tier === 'title';
      if (actingNow !== el.classList.contains('is-acting')) {
        el.classList.toggle('is-acting', actingNow);
        label.w = undefined;
        label.h = undefined;
      }
      if (tier !== label.tier) {
        if (label.tier !== undefined && node.kind === 'captain') { label.w = undefined; label.h = undefined; } // picture and title differ in size
        label.tier = tier;
        el.dataset.tier = tier;
      }
      // A summoner's plate rides with its ship in flight (27 F2): marked, so a check of "parked while named" can tell it.
      if (actingNow && crew?.rides) el.dataset.rides = '1'; else if (el.dataset.rides) delete el.dataset.rides;
      const compact = isCompact(tier);
      if (compact !== !!label.compact) {
        label.compact = compact;
        el.classList.toggle('is-compact', compact);
        label.w = undefined;
        label.h = undefined;
      }
      // A cast plate says why it's lit (22 B6, R13): its event's note under the title, while it plays. A standing
      // plate (not hover-only) wears one too when a maneuver gives it one: the star's sector sweep note (27 E7).
      const said = castOnly > 0 ? motion?.notes?.get(node.projectionKey) : acting ? { text: acting.text, eventKey: acting.eventKey } : !node.labelOnHover ? motion?.notes?.get(node.projectionKey) : undefined;
      const note = said ? `${said.eventKey}\n${said.text}` : undefined;
      if (note !== label.note) {
        label.note = note;
        setNote(el, said);
        label.w = undefined;
        label.h = undefined;
      }
      const fade = flashUntil !== undefined && node.labelOnHover ? Math.min(1, (flashUntil - now) / 600) : castOnly > 0 && castOnly < 1 ? castOnly : 1;
      el.style.opacity = fade < 1 ? String(fade) : '';
      if (!label.w) {
        label.w = el.offsetWidth;
        label.h = el.offsetHeight;
      }
      // A plate with rows shows them while expanded, for GRACE_MS after (time to move onto it), and
      // while the pointer is on it; never as a captain's picture (19 L2).
      if (label.rows) {
        if ((tier === 'expanded' && this.lists[node.projectionKey]) || label.rows.inside) label.wantedAt = wall;
        const want = tier !== 'picture' && !!this.lists[node.projectionKey] && wall - (label.wantedAt ?? -Infinity) <= GRACE_MS;
        // An expanded plate fits left of the side panel, as every holo plate is placed (19 review).
        const fitW = viewW - (motion?.rightInset ?? 0);
        if (want && !label.rows.attached) this.expand(label, fitW, viewH);
        else if (!want && label.rows.attached) this.collapse(label);
        settle(); // expand/collapse changed `expanded`: re-decide the tier in the same frame
        if (label.rows.attached) this.fitExpanded(label, fitW, viewH);
        if (!label.w) {
          label.w = el.offsetWidth;
          label.h = el.offsetHeight;
        }
      }
      const expanded = !!label.rows?.attached && !!label.base;
      if (expanded) open.add(node.projectionKey);
      const w = label.w;
      const h = label.h ?? 0;
      const vertical = label.holo?.spec.layout === 'vertical';
      // The picture tier (a ship's picture alone) is never a plate: it hugs its ship, below.
      if (label.holo && tier !== 'picture') {
        // A holographic plate hangs out along its object's way out (or stands above or below it, when
        // upright), its pointer on the object's rim. A horizontal plate's way out is its node's
        // (`labelDir`), else its plate's, else its preferred side's.
        const ok = allowed(node);
        const near = othersPlaced(node);
        const obstacles = [...near, ...[...bodies].filter(([pk]) => !ok.has(pk)).map(([, r]) => r)];
        // In view means clear of the side panel too (19 review: a galaxy's plate ran under it).
        const usableW = viewW - (motion?.rightInset ?? 0);
        const inView = (r: Rect) => r.x0 >= 0 && r.x1 <= usableW && r.y0 >= 0 && r.y1 <= viewH;
        const r = node.world.r * camera.state.scale * (label.plate?.labelRim ?? 1);
        // A planet's name sits at the planet's visual bottom, touching its rim, with no pointer (22 D7,
        // revised). It takes no other place, is not an obstacle to the other plates, and is drawn under them.
        const under = node.kind === 'seat';
        const dir = node.labelDir ?? label.plate?.dir ?? SIDE_DIR[node.labelSide ?? 'below'];
        // An expanded plate's places are its Title or Full plate's, then grown (`growPlacement`).
        const pw = expanded ? label.base!.w : w;
        const ph = expanded ? label.base!.h : h;
        const usual = node.labelSide === 'above' ? 'above' : 'below';
        const formed = actingNow && vertical ? formations.get(node.projectionKey) : undefined;
        const mode = formed ? `${formed.axis}:${formed.side ?? ''}` : '';
        if (mode !== (label.formed ?? '')) { label.formed = mode; label.k = undefined; label.openK = undefined; }
        const anchor = { cx: c.x, cy: c.y, r };
        const all = under
          ? [holoUnderCandidate(anchor, pw, ph)]
          : vertical && formed?.axis === 'v'
          ? [
              ...holoCandidates({ ...anchor, dirX: formed.side === 'left' ? -1 : 1, dirY: 0 }, pw, ph),
              ...holoCandidates({ ...anchor, dirX: formed.side === 'left' ? 1 : -1, dirY: 0 }, pw, ph),
              ...holoVerticalCandidates(anchor, pw, ph, usual),
            ]
          : vertical
          ? holoVerticalCandidates(anchor, pw, ph, formed?.side === 'above' || formed?.side === 'below' ? formed.side : usual)
          : node.labelFixed
            // Its own ray first, reaching further out along it; off it only when nothing on it is clear.
            ? [...holoCandidates({ cx: c.x, cy: c.y, r, dirX: dir.x, dirY: dir.y }, pw, ph, FIXED_RAY, FIXED_REACHES), ...holoCandidates({ cx: c.x, cy: c.y, r, dirX: dir.x, dirY: dir.y }, pw, ph)]
            : holoCandidates({ cx: c.x, cy: c.y, r, dirX: dir.x, dirY: dir.y }, pw, ph);
        // A star's plate stands above (22 A3), but in a crowded region neither above nor below may be clear:
        // then up and to a side, as a horizontal plate leaves, before it would cross the work.
        if (vertical && node.kind === 'star' && !expanded) all.push(...holoCandidates({ cx: c.x, cy: c.y, r, dirX: 0, dirY: -1 }, pw, ph));
        let at: HoloPlacement | undefined;
        if (expanded) {
          // It keeps the place it had and grows away from its object; if the rows won't fit there, it
          // re-places once, now, and then holds that place while expanded (never jumps under the pointer).
          if (label.pin === undefined) {
            const k = label.k !== undefined && label.k < all.length ? label.k : Math.max(0, all.findIndex((p) => inView(p.rect) && !collides(p.rect, obstacles)));
            label.pin = expandAt(all, k, w, h, usableW, viewH, (q) => !collides(q, obstacles));
          }
          // A plate taller than the room the view gives it (an upright one can't slide along its edge, and a side
          // one's slide stops at its pointer) is capped to that room and its rows scroll (R5, B1), instead of
          // running under the player or off the view. `natural` is its height uncapped, so it grows back.
          const base = all[label.pin]!;
          // `natural`: the height its rows would take uncapped, read live (the rows' own scroll height), so a list that
          // grows or shrinks while the plate is capped is judged by what it is now, not what it was when first capped.
          const rowsEl = el.querySelector<HTMLElement>('.holo__rows');
          const live = rowsEl ? el.offsetHeight - rowsEl.clientHeight + rowsEl.scrollHeight : h;
          const natural = live > 0 ? live : h;
          if (label.room === undefined && Math.abs(natural - h) > 1) { label.w = undefined; label.h = undefined; } // rows changed under an uncapped plate: measure again
          at = slidePlacement(growPlacement(base, w, natural), usableW, viewH);
          // The player's inset is its height; its margin above it and its edge below are 20 px more (measured on the drive still).
          const lo = HOLO_EDGE + (motion?.topInset ? motion.topInset + PLATE_TOP_MARGIN : 0);
          const hi = viewH - HOLO_EDGE;
          const y0 = Math.max(at.rect.y0, lo);
          const room = Math.floor(Math.min(at.rect.y1, hi) - y0);
          if (room < Math.floor(natural) && room >= 120) {
            at = { ...at, rect: { ...at.rect, y0, y1: y0 + room } };
            if (label.room !== room) { label.room = room; el.style.maxHeight = `${Math.min(label.maxH ?? room, room)}px`; label.w = undefined; label.h = undefined; }
          } else if (label.room !== undefined) {
            label.room = undefined; label.maxH = undefined; label.w = undefined; label.h = undefined; // fits again: uncap
          }
          grown.push(at.rect);
        } else if (under) {
          at = all[0];
        } else {
          // A plate keeps the place it had while that place is still clear (22 review: a ship's plate and
          // its work's took each other's places frame by frame, and both jumped). Failing that, the first clear.
          // B2: while its Features list is open, the resting place holds if it's in view and clear of other plates (the
          // plate was opened to be read, so bodies don't count); the resting `k` is never written then.
          const opened = !!label.featuresOpen;
          const hold = opened && label.k !== undefined && label.k < all.length && inView(all[label.k]!.rect) && !collides(all[label.k]!.rect, near) ? label.k : -1;
          const prior = opened ? label.openK : label.k;
          const kept = hold >= 0 ? hold : prior !== undefined && prior < all.length && inView(all[prior]!.rect) && !collides(all[prior]!.rect, obstacles) ? prior : -1;
          const k = kept >= 0 ? kept : all.findIndex((p) => inView(p.rect) && !collides(p.rect, obstacles));
          // Failing a place wholly in view, one partly off an edge will do, but never one under the side panel.
          let i = k >= 0 ? k : all.findIndex((p) => p.rect.x1 <= usableW && !collides(p.rect, obstacles));
          // A cast piece's plate (or an acting captain's, 22 B9) is brief, as a flash: failing a clear place, it may cross bodies, never another label.
          // A formation member's plate also clears the other members' ships (27 D1): failing that, it stays a picture.
          const members = formed ? crewBodies.get(node.projectionKey) ?? [] : [];
          if (i < 0 && (castOnly > 0 || actingNow)) i = all.findIndex((p) => inView(p.rect) && !collides(p.rect, near) && !collides(p.rect, members));
          // A cast plate wearing its note names its event's cause (R13; 27 E5c: a montage moment's one plate is its only
          // name), so it never vanishes for want of room: failing every clear place, it stands where it hides the least
          // (05 §8.9 A-4, 06 §9): the least of other labels covered, and the least under the side panel or off the view.
          if (i < 0 && castOnly > 0 && motion?.notes?.has(node.projectionKey)) {
            const lap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
            const hidden = (r: Rect) => (Math.max(0, r.x1 - usableW) + Math.max(0, -r.x0) + Math.max(0, r.y1 - viewH) + Math.max(0, -r.y0)) * h * 4 + near.reduce((a, o) => a + lap(r, o), 0);
            i = all.reduce((best, p, n) => (best < 0 || hidden(p.rect) < hidden(all[best]!.rect) ? n : best), -1);
          }
          // A focused plate with no free place still shows: over bodies if it must, but clear of other
          // labels where it can (a captain's picture included), and never under an expanded plate (the
          // row lighting it already names it there, and the ring marks its object).
          const clearOfLabels = i < 0 && focused(node) ? all.findIndex((p) => inView(p.rect) && !collides(p.rect, near)) : -1;
          const j = i >= 0 ? i : clearOfLabels >= 0 ? clearOfLabels : focused(node) && !collides(all[0]!.rect, grown) ? 0 : -1;
          if (opened) label.openK = j >= 0 ? j : undefined;
          else label.k = j >= 0 ? j : undefined;
          at = j >= 0 ? all[j] : undefined;
        }
        if (!at && actingNow && crew) { label.blocked = crew.eventKey; continue; } // next frame it is the picture again
        if (!at) { el.style.display = 'none'; label.holo.hide(); continue; }
        el.dataset.side = at.side;
        const clip = frameClip(w, h, at.side);
        if (clip !== label.clip) {
          label.clip = clip;
          el.style.clipPath = clip;
        }
        el.style.transform = `translate(${Math.round(at.rect.x0)}px, ${Math.round(at.rect.y0)}px)`;
        label.rect = at.rect;
        if (under && !expanded) {
          // The scene draws it, under the objects over the planet; this plate stays for the pointer and the rows.
          label.holo.hide();
          el.style.opacity = '0';
          const key = node.canonicalKey;
          const ink = this.inkOf(label, `${this.hovered.has(key)}|${key === this.selected}|${!!label.compact}|${tier}|${el.dataset.holoTier}`);
          this.names.push({ key: node.projectionKey, text: el.querySelector('.callout__title')?.textContent ?? node.label, rect: at.rect, ink });
          continue;
        }
        label.holo.place(at, w, h);
        this.applyUnfurl(label, at.side);
        if (!under) {
          placed.push(at.rect);
          placedNames.push(`label:${node.label.slice(0, 16)}`);
        }
        continue;
      }
      // A holo captain's picture keeps its plate's cut corners and frame line (19 L8); nothing else here does.
      const clip = label.holo && tier === 'picture' ? frameClip(w, h, 'above') : undefined;
      if (clip !== label.clip) {
        label.clip = clip;
        el.style.clipPath = clip ?? '';
      }
      if (!clip) label.holo?.hide();
      const rSide = node.world.r * camera.state.scale * 1.05;
      if (tier === 'picture') {
        // Just the captain's picture, hugging the top of the ship: it travels with it, never in the way.
        // A v1 ship's top is its asset's rim (`labelRim`), so the picture tucks right onto the hull.
        const hug = node.world.r * camera.state.scale * (assetFor(node)?.labelRim ?? 0.55);
        const top = { x0: c.x - w / 2, y0: c.y - hug - h, x1: c.x + w / 2, y1: c.y - hug };
        el.dataset.side = 'hug';
        el.style.transform = `translate(${Math.round(top.x0)}px, ${Math.round(top.y0)}px)`;
        label.holo?.bare(top.x0, top.y0, w, h);
        this.applyUnfurl(label, 'hug');
        placed.push(top);
        placedNames.push(`label:${node.label.slice(0, 16)}`);
        continue;
      }
      const spots: Record<string, Rect> = {
        below: { x0: c.x - w / 2, y0: c.y + rScreen + 6, x1: c.x + w / 2, y1: c.y + rScreen + 6 + h },
        above: { x0: c.x - w / 2, y0: c.y - rScreen - 6 - h, x1: c.x + w / 2, y1: c.y - rScreen - 6 },
        right: { x0: c.x + rSide + 8, y0: c.y - h / 2, x1: c.x + rSide + 8 + w, y1: c.y + h / 2 },
        left: { x0: c.x - rSide - 8 - w, y0: c.y - h / 2, x1: c.x - rSide - 8, y1: c.y + h / 2 },
      };
      const ok = allowed(node);
      // A flash is brief: it may cross dots, but never another label.
      const obstacles = flashUntil !== undefined && node.labelOnHover ? [...placed] : [...placed, ...[...bodies].filter(([pk]) => !ok.has(pk)).map(([, r]) => r)];
      if (this.debug || window.starChart?.env.testMode) {
        // Why each side was rejected, for map debug and the density harness.
        const named = [...placedNames, ...[...bodies].filter(([pk]) => !ok.has(pk)).map(([pk]) => pk.split('|').slice(-1)[0]!.slice(-20))];
        el.dataset.why = sideOrder(node).map((s) => {
          const i = obstacles.findIndex((o) => collides(spots[s]!, [o]));
          return `${s}:${i < 0 ? 'free' : named[i]}`;
        }).join(' ');
      }
      const inView = (r: Rect) => r.x0 >= 0 && r.x1 <= viewW && r.y0 >= 0 && r.y1 <= viewH;
      const order = sideOrder(node);
      const pick = order.find((s) => inView(spots[s]!) && !collides(spots[s]!, obstacles)) ?? order.find((s) => !collides(spots[s]!, obstacles));
      const fit = pick ? spots[pick]! : focused(node) ? spots[order[0]!]! : undefined;
      if (!fit) { el.style.display = 'none'; continue; }
      // The accent edge faces the object (06 §4), so the eye reads which object a label belongs to.
      el.dataset.side = pick ?? order[0]!;
      placed.push(fit);
      placedNames.push(`label:${node.label.slice(0, 16)}`);
      el.style.transform = `translate(${Math.round(fit.x0)}px, ${Math.round(fit.y0)}px)`;
      this.applyUnfurl(label, pick ?? order[0]!);
    }
    this.open = open;
  }

  /**
   * An arriving ship's or station's plate unfurls from its object (22 A8): nothing moves or scales.
   * The pointer draws out from the rim dot first; the frame then traces itself and the plate is revealed
   * from the edge nearest the object, so it reads as metadata opening on a thing already seen.
   */
  private applyUnfurl(label: Label, side: string): void {
    const { el } = label;
    const u = label.unfurl;
    if (u === undefined) {
      if (label.unfurling) {
        label.unfurling = false;
        el.style.maskImage = '';
        el.style.setProperty('-webkit-mask-image', '');
        label.holo?.unfurl(null);
      }
      return;
    }
    label.unfurling = true;
    const eased = 1 - (1 - u) ** 3;
    const reveal = Math.max(0, Math.min(1, (eased - 0.2) / 0.8)) * 112;
    const mask = `linear-gradient(${REVEAL[side] ?? 'to top'}, #000 ${reveal - 12}%, transparent ${reveal}%)`;
    el.style.maskImage = mask;
    el.style.setProperty('-webkit-mask-image', mask);
    label.holo?.unfurl(eased);
  }

  /** A shown holo plate's screen rect, by projection key: where a ship working its object shouldn't park (22 B9). */
  rectOf(pk: string): Rect | null {
    const l = this.labels.get(pk);
    if (!l) return null;
    if (l.el.style.display === 'none') return l.predicted ?? null;
    return l.rect ?? null;
  }

  /** A seek or a scene entry (INV-15): every plate whose body has arrived is shown at once, with no emergence. */
  settleArrivals(): void {
    for (const l of this.labels.values()) {
      l.waiting = false;
      l.emergeAt = undefined;
      l.unfurl = undefined;
    }
  }

  clear(): void {
    for (const l of this.labels.values()) this.drop(l);
    this.labels.clear();
    this.lists = {};
    this.setLanes([]);
    this.setColumns([]);
    this.extra = [];
    this.open = new Set();
  }

  /**
   * A board's lane heads (06 §3, decided 2026-10-09): a faint avatar at each lane's left end, so the
   * rows say whose they are. Not buttons; the name is on hover. Placed in `placeLanes` each frame.
   */
  private lanes: { el: HTMLDivElement; x: number; y: number }[] = [];
  setLanes(heads: NonNullable<ViewGraph['board']>['heads']): void {
    const key = (h: (typeof heads)[number]) => `${h.x}|${h.y}|${h.name}`;
    if (this.lanes.length === heads.length && this.lanes.every((l, i) => l.el.dataset.key === key(heads[i]!))) return;
    for (const l of this.lanes) l.el.remove();
    this.lanes = heads.map((h) => {
      const el = document.createElement('div');
      el.className = 'lane-head';
      el.dataset.key = key(h);
      el.title = h.name;
      el.setAttribute('aria-hidden', 'true');
      if (h.avatars.length) for (const a of h.avatars.slice(0, 3)) el.append(avatarCircle(a));
      else el.append(Object.assign(document.createElement('span'), { className: 'lane-head__none', textContent: '–' }));
      // The person's full name beside their picture: a swimlane's heading (decided 2026-10-09).
      el.append(Object.assign(document.createElement('span'), { className: 'lane-head__name', textContent: h.name }));
      this.host.appendChild(el);
      return { el, x: h.x, y: h.y };
    });
  }
  /**
   * A team board's column headings (B4, 06 §3): the column's name, faint, centred over it above the first lane.
   * Not buttons, and no part of the label avoidance (like the lane heads).
   */
  private columnHeads: { el: HTMLDivElement; x: number; y: number }[] = [];
  setColumns(cols: NonNullable<ViewGraph['board']>['columns'] & object): void {
    const key = (c: (typeof cols)[number]) => `${c.x}|${c.y}|${c.name}|${c.split}`;
    if (this.columnHeads.length === cols.length && this.columnHeads.every((l, i) => l.el.dataset.key === key(cols[i]!))) return;
    for (const l of this.columnHeads) l.el.remove();
    this.columnHeads = cols.map((c) => {
      const el = document.createElement('div');
      el.className = 'column-head';
      el.dataset.key = key(c);
      el.setAttribute('aria-hidden', 'true');
      el.append(Object.assign(document.createElement('span'), { className: 'column-head__name', textContent: c.name }));
      if (c.split) el.append(Object.assign(document.createElement('span'), { className: 'column-head__sub', textContent: 'Doing / Done' }));
      this.host.appendChild(el);
      return { el, x: c.x, y: c.y };
    });
  }
  /** Where a lane head sits on screen: ending at its anchor (above its band's left end), centred on it. */
  private laneRect(camera: CameraController, l: { el: HTMLDivElement; x: number; y: number }): Rect {
    const s = camera.worldToScreen(l.x, l.y);
    const w = l.el.offsetWidth;
    const h = l.el.offsetHeight;
    const x0 = s.x - w - 10;
    const y0 = s.y - h / 2;
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  }
  placeLanes(camera: CameraController): void {
    for (const l of this.lanes) {
      const r = this.laneRect(camera, l);
      l.el.style.transform = `translate(${Math.round(r.x0)}px, ${Math.round(r.y0)}px)`;
    }
    this.columnHeads.forEach((c, i) => {
      // Neighbours alternate a line apart, so a name that is wider than its column doesn't run into the next.
      const s = camera.worldToScreen(c.x, c.y);
      c.el.style.transform = `translate(${Math.round(s.x - c.el.offsetWidth / 2)}px, ${Math.round(s.y - c.el.offsetHeight / 2 + (i % 2) * 15)}px)`;
    });
  }
}
