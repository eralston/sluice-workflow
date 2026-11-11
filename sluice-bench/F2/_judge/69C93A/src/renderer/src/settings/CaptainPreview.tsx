// Your captain's ship, live (23 E1): a small Pixi v8 canvas that draws the chosen hull in the chosen
// colourway with the same `CaptainView` the chart flies, and redraws when the faction, hull or
// colourway changes. One renderer per mounted preview, destroyed (and its WebGL context released) on
// unmount, so opening and closing Settings never grows the context count. In reduced motion it draws
// one still frame per design and runs no ticker.
import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { CaptainView, type FleetDesign } from '../chart/art/fleet';
import { motion } from '../chart/art/motion';
import { previewCensus } from './previewCensus';

const W = 220;
const H = 110;
const SIZE = 46; // CaptainView's half-length in px: about 92 px long


const reducedMotion = () => motion.reduced || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export function CaptainPreview({ design }: { design: FleetDesign }) {
  const host = useRef<HTMLDivElement>(null);
  const draw = useRef<((d: FleetDesign) => void) | null>(null);
  const latest = useRef(design);
  latest.current = design;

  useEffect(() => {
    let gone = false;
    let app: Application | null = null;
    let mq: MediaQueryList | null = null;
    let follow: (() => void) | null = null;
    const el = host.current;
    (async () => {
      const a = new Application();
      try {
        await a.init({ preference: 'webgl', antialias: true, backgroundAlpha: 0, width: W, height: H, resolution: window.devicePixelRatio, autoDensity: true, autoStart: false });
      } catch {
        try { a.destroy({ removeView: true }, { children: true }); } catch { /* never initialised */ }
        return;
      }
      if (gone || !el) { release(a); return; }
      app = a;
      previewCensus.live++;
      previewCensus.created++;
      a.canvas.className = 'captain-preview__canvas';
      a.canvas.setAttribute('aria-hidden', 'true');
      el.appendChild(a.canvas);
      let ship: CaptainView | null = null;
      let t = 0;
      const frame = () => { ship?.tick(t); a.render(); previewCensus.draws++; };
      const show = (d: FleetDesign) => {
        ship?.destroy();
        ship = new CaptainView(d, SIZE);
        ship.face(1);
        ship.root.position.set(W / 2, H / 2);
        a.stage.addChild(ship.root);
        a.canvas.dataset.hull = String(d.hull);
        a.canvas.dataset.colourway = String(d.colourway);
        previewCensus.hull = d.hull;
        previewCensus.colourway = d.colourway;
        frame();
      };
      draw.current = show;
      show(latest.current);
      a.ticker.add((tk) => { t += tk.deltaMS / 1000; frame(); });
      // Reduced motion: one still frame, no ticker; a change of the setting while Settings is open follows.
      follow = () => { if (reducedMotion()) { a.ticker.stop(); frame(); } else a.ticker.start(); };
      mq = window.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
      mq?.addEventListener('change', follow);
      follow();
    })();
    return () => {
      gone = true;
      if (follow) mq?.removeEventListener('change', follow);
      draw.current = null;
      if (app) { release(app); previewCensus.live--; }
      app = null;
    };
  }, []);

  useEffect(() => { draw.current?.(design); }, [design.hull, design.colourway]);

  return <div ref={host} className="captain-preview" role="img" aria-label="Your ship" style={{ width: W, height: H }} />;
}

/**
 * Destroys this preview's renderer and its canvas. Never `destroy(true)` and never `releaseGlobalResources`:
 * in Pixi 8 those empty module-global pools (the batcher's textures) that the main chart's renderer shares,
 * and every later frame of the chart would throw. Pixi's own context system gives the WebGL context back.
 */
function release(a: Application): void {
  try { a.ticker.stop(); } catch { /* already stopped */ }
  try { a.destroy({ removeView: true }, { children: true }); } catch { /* half-built */ }
}
