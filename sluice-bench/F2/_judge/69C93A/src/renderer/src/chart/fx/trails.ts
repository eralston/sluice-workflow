// Jump trails (05 §5): where a departed ship or item went, with a Go button. Split out of director.ts
// (2026-10-10, no behaviour change).
import type { CanonicalKey } from '@shared/contracts/keys';
import type { ViewGraph, ViewNode } from '@shared/contracts/view';
import { workItemId } from '@shared/contracts/keys';
import { TRAIL_FADE_MS, TRAIL_MS } from '@shared/playback/constants';
import type { GraphScene } from '../scenes/GraphScene';
import { Streak } from './effects';
import { SIDE_PANEL_PX, TRAIL_COLOR, ZOOM_CONTROLS_PX, clip } from './timing';
import type { BeatContext, DirectorHost } from './director';

/** The lingering streak a departed captain leaves, with "→ destination" and a Go button. */
export class JumpTrail {
  age = 0;
  private readonly g: Streak;
  readonly el: HTMLDivElement;
  constructor(private readonly host: DirectorHost, scene: GraphScene, readonly from: [number, number], readonly to: [number, number], private readonly px: number, dest: { key: CanonicalKey; label: string; captain?: CanonicalKey }) {
    this.g = new Streak(scene.fxLayer(), TRAIL_COLOR);
    this.el = document.createElement('div');
    this.el.className = 'jump-trail';
    const text = document.createElement('span');
    text.className = 'jump-trail__dest';
    text.textContent = `→ ${dest.label}`;
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'jump-trail__go';
    go.textContent = 'Go';
    go.setAttribute('aria-label', `Go to ${dest.label}`);
    go.addEventListener('click', () => host.onGo(dest.key, dest.captain));
    this.el.append(text, go);
    host.labelHost.appendChild(this.el);
  }
  render(): void {
    const fade = 1 - Math.max(0, (this.age - (TRAIL_MS - TRAIL_FADE_MS)) / TRAIL_FADE_MS);
    // A hyperspace streak: bright at the far end, where the ship went.
    this.g.draw(this.from, this.to, 3 * this.px, 0.55 * fade);
    const p = this.host.worldToScreen(this.to[0], this.to[1]);
    this.el.style.opacity = String(fade);
    // Never cover a label: from the trail's end, try spots stepping up, then down, for a free one.
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const host = this.host.labelHost.getBoundingClientRect();
    const others = [...this.host.labelHost.querySelectorAll<HTMLElement>('.callout, .jump-trail')]
      .filter((el) => el !== this.el && el.style.display !== 'none')
      .map((el) => el.getBoundingClientRect());
    const free = (x: number, y: number) => others.every((r) => x + w + 4 < r.left - host.left || r.right - host.left + 4 < x || y + h + 2 < r.top - host.top || r.bottom - host.top + 2 < y);
    let x = p.x + 8;
    let y = p.y - h / 2;
    for (const dy of [0, -1, 1, -2, 2, -3, 3, -4, 4].map((k) => k * (h + 4))) {
      if (free(p.x + 8, p.y - h / 2 + dy)) { y = p.y - h / 2 + dy; break; }
      if (free(p.x - w - 8, p.y - h / 2 + dy)) { x = p.x - w - 8; y = p.y - h / 2 + dy; break; }
    }
    // Keep it, and its Go, inside the view into space: never under the side panel or off the edge (a wide
    // board can send a ship out past them).
    x = Math.min(Math.max(4, x), host.width - SIDE_PANEL_PX - ZOOM_CONTROLS_PX - w - 8);
    y = Math.min(Math.max(4, y), host.height - h - 4);
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }
  get done(): boolean {
    return this.age >= TRAIL_MS;
  }
  destroy(): void {
    this.g.destroy();
    this.el.remove();
  }
}

/** Out and up, away from the scene's middle and the rows of labels: where departures go. */
export function exitDir(n: ViewNode, g: ViewGraph): [number, number] {
  const cx = g.nodes.reduce((s, m) => s + m.world.x, 0) / Math.max(1, g.nodes.length);
  const dir: [number, number] = [n.world.x >= cx ? 1 : -1, -0.35];
  const l = Math.hypot(dir[0], dir[1]);
  return [dir[0] / l, dir[1] / l];
}

/**
 * Where a departing captain went: the item this beat assigned them (outside this scene), else their
 * most recent other assignment. Null when they hold none: no trail is left.
 */
export function destinationOf(ctx: BeatContext, captain: CanonicalKey, inScene: Set<CanonicalKey>): { key: CanonicalKey; label: string } | null {
  const arrived = ctx.plan.find((p) => p.name === 'captainJump' && p.arriving === captain && !inScene.has(p.entityKey));
  const candidates = [...ctx.snapshot.workItems.values()].filter((w) => w.assigneeKey === captain && !inScene.has(w.key));
  const pick = arrived ? ctx.snapshot.workItems.get(arrived.entityKey) : candidates.sort((a, b) => (b.assignedAt ?? 0) - (a.assignedAt ?? 0))[0];
  if (!pick) return null;
  return { key: pick.key, label: `${pick.type} #${workItemId(pick.key)} · ${clip(pick.title)}` };
}
