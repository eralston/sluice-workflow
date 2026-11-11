// 14 §2.9 — chart overlays (v1): DOM layers over the labels host that read the graph and the camera,
// and hand the label layer the screen rects they hold, so labels go around them. The hover ring below
// is built in; the mega-label overlay retired in v1.1 (19 L2), when holo plates grew their rows in
// place (labels.ts, holo/holoRows.ts). A theme or a later slice adds one with `registerOverlay`;
// `createOverlays` builds every registered overlay into one stack.
//
// Per frame, after the camera moves (ChartApp's ticker; wired in 17 W3-T1):
//   labels.position(camera, w, h, live, motion);
//   overlays.focus({ expanded: labels.expanded() });
//   overlays.position(camera, w, h, live);
//   labels.obstacles(overlays.rects());          // used by the next frame's labels
// and on each scene: `overlays.sync(graph)` beside `labels.sync`, `overlays.clear()` beside `labels.clear`.
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import type { CameraController } from './camera';
import type { Rect } from './labels';
import './overlays.css';

/** What the label layer decided this frame: the labels that are expanded, by projection key. */
export interface OverlayFocus { expanded: ReadonlySet<string> }

/** What an overlay may ask of the chart. Every field is optional: unset, the overlay is display only. */
export interface OverlayInput {
  /** A row (or other part) is hovered or long-pressed: light its objects; null when it ends. */
  light?(keys: readonly CanonicalKey[] | null): void;
  /** A row was pressed: select its object. */
  press?(key: CanonicalKey, e: PointerEvent): void;
  /**
   * A read-only link at the source was pressed (INV-21: opening only reads). `key` is the linked
   * object's own key when projection carries one, so main can open it by key against its allowlist.
   */
  open?(url: string | null, key?: CanonicalKey): void;
}

export interface ChartOverlay {
  /** A new scene graph (or a new state of it). */
  sync(graph: ViewGraph): void;
  /** The label tiers of this frame, before `position`. */
  focus?(f: OverlayFocus): void;
  /** Another overlay, or a plate's row, lit objects (or null): a ring may show them. */
  light?(keys: readonly CanonicalKey[] | null): void;
  /** Places the overlay on screen from the live (as drawn) nodes. */
  position(cam: CameraController, w: number, h: number, live: ViewNode[]): void;
  /** Screen rects it holds now, for the labels to keep clear. */
  rects(): Rect[];
  /** Removes everything it drew. */
  clear(): void;
}

export type OverlayFactory = (host: HTMLElement, input: OverlayInput) => ChartOverlay;

const factories = new Map<string, OverlayFactory>();
/** The built-in overlay's id: it is always registered (resetOverlays brings it back). */
export const HOVER_RING = 'hover-ring';

/** Registers an overlay; a later one with the same id replaces it. Built in id order. */
export function registerOverlay(id: string, make: OverlayFactory): void {
  factories.set(id, make);
}

export function overlayIds(): string[] {
  return [...factories.keys()].sort();
}

/** Tests only: forget every overlay a theme or a test registered, keeping the built-in hover ring. */
export function resetOverlays(): void {
  factories.clear();
  registerOverlay(HOVER_RING, (host) => new HoverRing(host));
}

/**
 * Every registered overlay as one. A `light` from any overlay reaches the others and then the
 * chart's own `input.light`; the chart's `light` (a plate's row) reaches every overlay.
 */
export class OverlayStack implements ChartOverlay {
  private readonly parts: ChartOverlay[];

  constructor(host: HTMLElement, input: OverlayInput = {}) {
    const shared: OverlayInput = {
      ...input,
      light: (keys) => {
        for (const p of this.parts) p.light?.(keys);
        input.light?.(keys);
      },
    };
    this.parts = overlayIds().map((id) => factories.get(id)!(host, shared));
  }

  sync(graph: ViewGraph): void {
    for (const p of this.parts) p.sync(graph);
  }
  focus(f: OverlayFocus): void {
    for (const p of this.parts) p.focus?.(f);
  }
  light(keys: readonly CanonicalKey[] | null): void {
    for (const p of this.parts) p.light?.(keys);
  }
  position(cam: CameraController, w: number, h: number, live: ViewNode[]): void {
    for (const p of this.parts) p.position(cam, w, h, live);
  }
  rects(): Rect[] {
    return this.parts.flatMap((p) => p.rects());
  }
  clear(): void {
    for (const p of this.parts) p.clear();
  }
}

export function createOverlays(host: HTMLElement, input?: OverlayInput): OverlayStack {
  return new OverlayStack(host, input);
}

/**
 * The hover ring: a thin cyan circle round each object an expanded plate's row lights (12,
 * "Mega-label": hovering a row lights its object; a PR's row lights every piece it serves, 19 L6).
 * Display only, so it holds no rect and takes no pointer.
 */
export class HoverRing implements ChartOverlay {
  /** One ring per lit object, made as needed and kept for reuse. */
  private readonly els: HTMLDivElement[] = [];
  private lit: readonly CanonicalKey[] = [];

  constructor(private readonly host: HTMLElement) {}

  private ring(i: number): HTMLDivElement {
    let el = this.els[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'hover-ring';
      el.setAttribute('aria-hidden', 'true');
      // Placement is structural, so it's inline; the look is in overlays.css (solar only).
      Object.assign(el.style, { display: 'none', position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
      this.els.push(el);
    }
    return el;
  }

  sync(): void {}
  light(keys: readonly CanonicalKey[] | null): void {
    this.lit = keys ?? [];
  }
  position(cam: CameraController, w: number, h: number, live: ViewNode[]): void {
    let n = 0;
    for (const key of this.lit) {
      // A key can draw twice (a seat and its captain share a person's key, 14 §9 D1): ring the first,
      // which is the larger body in projection order.
      const node = live.find((x) => x.canonicalKey === key);
      if (!node) continue;
      const c = cam.worldToScreen(node.world.x, node.world.y);
      const r = Math.max(14, node.world.r * cam.state.scale * 1.25);
      if (c.x + r < 0 || c.x - r > w || c.y + r < 0 || c.y - r > h) continue;
      const el = this.ring(n++);
      if (!el.isConnected) this.host.appendChild(el);
      el.style.display = '';
      el.style.width = el.style.height = `${Math.round(2 * r)}px`;
      el.style.transform = `translate(${Math.round(c.x - r)}px, ${Math.round(c.y - r)}px)`;
    }
    for (const el of this.els.slice(n)) el.style.display = 'none';
  }
  rects(): Rect[] {
    return [];
  }
  clear(): void {
    this.lit = [];
    for (const el of this.els) el.remove();
  }
}

registerOverlay(HOVER_RING, (host) => new HoverRing(host));
