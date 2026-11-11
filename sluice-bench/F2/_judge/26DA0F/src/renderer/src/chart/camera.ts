// 06 §3 CameraController: position/scale on worldCamera, fit, wheel zoom, drag, interruptible tweens.
import type { Container } from 'pixi.js';

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface CamState { x: number; y: number; scale: number }

/** Absolute safety limits; the working zoom range is relative to each scene's fit (setZoomRange). */
const MIN_SCALE = 0.01;
const MAX_SCALE = 8;

export class CameraController {
  /** World point shown at the viewport center, and zoom. */
  private cur: CamState = { x: 0, y: 0, scale: 1 };
  private tween: { from: CamState; to: CamState; t: number; dur: number } | null = null;
  private zoomMin = MIN_SCALE;
  private zoomMax = MAX_SCALE;

  /** Wheel zoom bounds for the current scene, as absolute scales. */
  setZoomRange(min: number, max: number): void {
    this.zoomMin = Math.max(MIN_SCALE, min);
    this.zoomMax = Math.min(MAX_SCALE, max);
  }
  private viewW = 1;
  private viewH = 1;
  /** Pixels reserved on the right for the inspector panel overlay, and at the top for the player. */
  private rightInset = 0;
  private topInset = 0;

  constructor(private readonly world: Container) {}

  setViewport(w: number, h: number, rightInset: number, topInset = 0): void {
    this.viewW = w;
    this.viewH = h;
    this.rightInset = rightInset;
    this.topInset = topInset;
    this.applyTransform();
  }

  get state(): Readonly<CamState> { return this.cur; }

  /** Where the camera is going: the tween's end, else where it rests. */
  get target(): Readonly<CamState> { return this.tween?.to ?? this.cur; }

  /** The camera state that fits `b` into the usable viewport, without applying it. */
  fitState(b: Bounds, padding: number): CamState {
    const usableW = Math.max(1, this.viewW - this.rightInset - padding * 2);
    const usableH = Math.max(1, this.viewH - this.topInset - padding * 2);
    const scale = clamp(Math.min(usableW / (b.maxX - b.minX), usableH / (b.maxY - b.minY)), MIN_SCALE, MAX_SCALE);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, scale };
  }

  /** The width-only fit: the scale at which `b` spans the usable width. */
  widthFitScale(b: Bounds, padding: number): number {
    const usableW = Math.max(1, this.viewW - this.rightInset - padding * 2);
    return clamp(usableW / Math.max(1, b.maxX - b.minX), MIN_SCALE, MAX_SCALE);
  }

  /**
   * A page (decided 2026-10-07): `b` at `scale`, centred across, its top at the top of the usable
   * view. A scene too big to show whole at a usable size opens on its first rows and scrolls.
   */
  pageState(b: Bounds, padding: number, scale: number): CamState {
    const usableH = Math.max(1, this.viewH - this.topInset - padding * 2);
    const h = usableH / scale;
    const y = b.maxY - b.minY <= h ? (b.minY + b.maxY) / 2 : b.minY + h / 2;
    return { x: (b.minX + b.maxX) / 2, y, scale };
  }

  /**
   * What the user can move over (decided 2026-10-07): their pans and zooms keep the view's centre on
   * the content, so at most half a view of empty space shows past any edge. Null: unbounded.
   */
  setContent(b: Bounds | null): void {
    this.content = b;
  }
  private content: Bounds | null = null;
  private clampToContent(): void {
    const b = this.content;
    if (!b) return;
    this.cur.x = clamp(this.cur.x, b.minX, b.maxX);
    this.cur.y = clamp(this.cur.y, b.minY, b.maxY);
  }
  /** How the usable view sits on the content: visible fraction and offset on each axis (the scroll rail). */
  scrollState(): { x: { start: number; size: number }; y: { start: number; size: number } } | null {
    const b = this.content;
    if (!b) return null;
    const v = this.viewBounds();
    const axis = (lo: number, hi: number, vlo: number, vhi: number) => {
      const span = Math.max(hi, vhi) - Math.min(lo, vlo);
      return { start: (vlo - Math.min(lo, vlo)) / span, size: (vhi - vlo) / span };
    };
    return { x: axis(b.minX, b.maxX, v.minX, v.maxX), y: axis(b.minY, b.maxY, v.minY, v.maxY) };
  }

  /** Whether the content overflows the usable view on each axis at `scale` (the zoom floor: fully zoomed out). */
  overflowAt(scale: number): { x: boolean; y: boolean } | null {
    const b = this.content;
    if (!b) return null;
    const usableW = this.viewW - this.rightInset;
    const usableH = this.viewH - this.topInset;
    return { x: (b.maxX - b.minX) * scale > usableW + 1, y: (b.maxY - b.minY) * scale > usableH + 1 };
  }

  /** Move by a fraction of the content's span (dragging the scroll rail's thumb): a user pan. */
  scrollByFraction(fx: number, fy: number): void {
    const b = this.content;
    if (!b) return;
    const v = this.viewBounds();
    const spanX = Math.max(b.maxX, v.maxX) - Math.min(b.minX, v.minX);
    const spanY = Math.max(b.maxY, v.maxY) - Math.min(b.minY, v.minY);
    this.panBy(-fx * spanX * this.cur.scale, -fy * spanY * this.cur.scale);
  }

  /** Screen point at the center of the usable viewport (left of the inspector). */
  centerScreen(): { x: number; y: number } {
    const { cx, cy } = this.center();
    return { x: cx, y: cy };
  }

  /** Fit bounds into the usable viewport. Animates when `durationMs > 0`, starting from the current transform. */
  fit(b: Bounds, padding: number, durationMs = 0): void {
    const to = this.fitState(b, padding);
    if (durationMs <= 0) {
      this.tween = null;
      this.cur = to;
      this.applyTransform();
    } else {
      this.tween = { from: { ...this.cur }, to, t: 0, dur: durationMs };
    }
  }

  /** Jump to a camera state (Back navigation restores the saved camera). */
  set(state: CamState): void {
    this.tween = null;
    this.cur = { ...state };
    this.applyTransform();
  }

  /** Tween from the current transform, so an interruption never snaps backward (06 §3). */
  tweenTo(state: CamState, durationMs: number): void {
    this.tween = { from: { ...this.cur }, to: { ...state }, t: 0, dur: Math.max(1, durationMs) };
  }

  /** Screen px the player covers at the view's top. */
  get top(): number {
    return this.topInset;
  }

  /** Screen px the inspector covers at the view's right. */
  get right(): number {
    return this.rightInset;
  }

  /** World bounds of the usable viewport (left of the inspector), inset by `pad` screen px. */
  viewBounds(pad = 0): Bounds {
    const a = this.screenToWorld(pad, this.topInset + pad);
    const b = this.screenToWorld(this.viewW - this.rightInset - pad, this.viewH - pad);
    return { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y };
  }

  /**
   * Frame the action (slice 3b): the smallest camera move that brings `b` into view. It pans if `b`
   * fits at this zoom, else zooms out just enough; it never zooms in. Null when `b` is already in view.
   */
  includeState(b: Bounds, pad: number): CamState | null {
    const v = this.viewBounds(pad);
    if (b.minX >= v.minX && b.maxX <= v.maxX && b.minY >= v.minY && b.maxY <= v.maxY) return null;
    const w = v.maxX - v.minX;
    const h = v.maxY - v.minY;
    if (b.maxX - b.minX <= w && b.maxY - b.minY <= h) {
      const dx = b.minX < v.minX ? b.minX - v.minX : b.maxX > v.maxX ? b.maxX - v.maxX : 0;
      const dy = b.minY < v.minY ? b.minY - v.minY : b.maxY > v.maxY ? b.maxY - v.maxY : 0;
      return { x: this.cur.x + dx, y: this.cur.y + dy, scale: this.cur.scale };
    }
    const fit = this.fitState(b, pad);
    return { ...fit, scale: Math.max(this.zoomMin, Math.min(this.cur.scale, fit.scale)) };
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    this.tween = null;
    const before = this.screenToWorld(screenX, screenY);
    this.cur.scale = clamp(this.cur.scale * factor, this.zoomMin, this.zoomMax);
    const after = this.screenToWorld(screenX, screenY);
    this.cur.x += before.x - after.x;
    this.cur.y += before.y - after.y;
    this.clampToContent();
    this.applyTransform();
  }

  /** The user's pan (a drag or a scroll): kept on the content. */
  panBy(dxScreen: number, dyScreen: number): void {
    this.tween = null;
    this.cur.x -= dxScreen / this.cur.scale;
    this.cur.y -= dyScreen / this.cur.scale;
    this.clampToContent();
    this.applyTransform();
  }

  /** Zoom bounds currently in force (absolute scales). */
  zoomRange(): { min: number; max: number } {
    return { min: this.zoomMin, max: this.zoomMax };
  }

  update(dtMs: number): void {
    if (!this.tween) return;
    const tw = this.tween;
    tw.t = Math.min(tw.dur, tw.t + dtMs);
    const k = easeInOutCubic(tw.t / tw.dur);
    this.cur = {
      x: lerp(tw.from.x, tw.to.x, k),
      y: lerp(tw.from.y, tw.to.y, k),
      scale: tw.from.scale * Math.pow(tw.to.scale / tw.from.scale, k),
    };
    if (tw.t >= tw.dur) this.tween = null;
    this.applyTransform();
  }

  private center(): { cx: number; cy: number } {
    return { cx: (this.viewW - this.rightInset) / 2, cy: this.topInset + (this.viewH - this.topInset) / 2 };
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const { cx, cy } = this.center();
    return { x: (x - this.cur.x) * this.cur.scale + cx, y: (y - this.cur.y) * this.cur.scale + cy };
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    const { cx, cy } = this.center();
    return { x: (x - cx) / this.cur.scale + this.cur.x, y: (y - cy) / this.cur.scale + this.cur.y };
  }

  private applyTransform(): void {
    const { cx, cy } = this.center();
    this.world.scale.set(this.cur.scale);
    this.world.position.set(cx - this.cur.x * this.cur.scale, cy - this.cur.y * this.cur.scale);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
