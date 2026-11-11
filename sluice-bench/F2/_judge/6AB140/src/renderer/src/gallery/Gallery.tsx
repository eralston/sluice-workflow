// Art gallery (npm run gallery; development builds only): every object in every stage, in isolation,
// for reviewing visual identity, lighting, and animation side by side, and for screenshot regression
// tests (tests/e2e/gallery.spec.ts). Uses the same art classes as the chart, with no scene logic.
import { Application, Container, Graphics, type WebGLRenderer } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { AnomalyView } from '../chart/art/anomaly';
import { GalaxyView } from '../chart/art/galaxy';
import { BlackHoleView } from '../chart/art/blackhole';
import { motion } from '../chart/art/motion';
import { bakeAsteroidAtlas, loadAsteroidAtlas } from '../chart/art/asteroidAtlas';
import { ENERGY_BASE, ENERGY_PEAK, ENERGY_RATE, EnergyFx, type EnergyKind } from '../chart/fx/explore';
import { FlightView, STATION_KINDS, VESSEL_KINDS, StationView, TaskDotView } from '../chart/art/infrastructure';
import { NebulaBackdrop, type BackdropLevel } from '../chart/art/nebula';
import { CanvasTooth, ImpastoFilter, PaintFilter } from '../chart/art/paint';
import { PlanetView } from '../chart/art/planet';
import { HULLS, LIVERIES, seedFor, ShipView } from '../chart/art/ships';
import { RUNG_COLOR, RUNG_NAME, signalOf, type Rung as RungName } from '../chart/art/progress';
import { StarView } from '../chart/art/star';
import stateMapping from '@config/state-mapping.json';
import { fnv1a32 } from '@shared/hash';
import { LOOKS } from '../vocab';
import { CYCLE_S, type ArtView, type CycleStep, type DomCell, type Item, type Section } from './types';
import { V1_SECTIONS } from './v1';
import { extraSections } from './extraSections';


/** The ADO type · state (category) pairs each stage portrays, from the same mapping the app uses. */
const ADO_STATES = new Map<string, string[]>();
for (const [type, def] of Object.entries(stateMapping.types)) {
  for (const [state, m] of Object.entries(def.states as Record<string, { category: string; stage: string }>)) {
    ADO_STATES.set(m.stage, [...(ADO_STATES.get(m.stage) ?? []), `${type} · ${state} (${m.category})`]);
  }
}
const PR_STATES: Record<string, string[]> = {
  'flight.active': ['Pull Request · active'],
  'flight.completed': ['Pull Request · completed (merged)'],
  'flight.abandoned': ['Pull Request · abandoned'],
};
const adoFor = (stage: string | undefined): string[] =>
  !stage ? [] : stage === 'unknown' ? ['Any state with no mapping (raw name shown)'] : PR_STATES[stage] ?? ADO_STATES.get(stage) ?? [];

const stages = (prefix: string) => [...Object.keys(LOOKS).filter((s) => s.startsWith(prefix)), 'unknown'];
const look = (stage: string) => LOOKS[stage] ?? '';



/**
 * Loading energy (decided 2026-10-07) over its object, held at one strength: the object's art, with
 * the effect on top (crisp, as the app draws it in the overlay).
 */
class EnergyDemo implements ArtView {
  readonly root = new Container();
  readonly marks = new Container();
  private readonly fx: EnergyFx;
  constructor(private readonly base: ArtView, kind: EnergyKind, private readonly r: number, energy: number, stage?: string) {
    if (stage) base.setStage(stage);
    this.root.addChild(base.root);
    this.fx = new EnergyFx(this.marks, kind, 0.37);
    this.fx.base = energy;
    this.fx.rate = 0;
  }
  setStage(): void {}
  tick(seconds: number): void {
    this.base.tick(seconds);
    this.fx.holdAt(seconds);
    this.fx.update(0, { x: 0, y: 0, r: this.r }, motion.reduced);
  }
  destroy(): void {
    this.fx.destroy();
    this.base.destroy();
  }
}
const ENERGY_LEVELS: [string, number][] = [['starting', ENERGY_BASE], ['a long wait', +(ENERGY_BASE + 8 * ENERGY_RATE).toFixed(2)], ['at its peak', ENERGY_PEAK]];

/** Representative on-screen sizes (radius in px), close to how each object appears on the chart. */
const RAW_SECTIONS: Section[] = [
  { key: 'sky', title: 'Skies (one per scene level)', items: [], sky: ['galaxy', 'sector', 'feature', 'body'] },
  {
    key: 'empty', title: 'The empty cosmos · no projects chosen yet',
    items: [{ id: 'blackhole', title: 'black hole', note: 'Before any project is chosen (onboarding)', ado: ['No project'], make: () => new BlackHoleView(90) }],
  },
  {
    key: 'energy', title: 'Loading energy · while data loads (grows with the wait; flares out when done)',
    items: [
      ...ENERGY_LEVELS.map(([name, e]) => ({ id: `energy-galaxy-${e}`, title: `galaxy · ${name}`, note: 'Opening a team', make: () => new EnergyDemo(new GalaxyView(60, fnv1a32('project|alpha')), 'galaxy', 60, e) })),
      ...ENERGY_LEVELS.map(([name, e]) => ({ id: `energy-star-${e}`, title: `star · ${name}`, note: 'Entering a Feature; its history', make: () => new EnergyDemo(new StarView(36, 7), 'star', 36, e, 'feature.active') })),
      ...ENERGY_LEVELS.map(([name, e]) => ({ id: `energy-planet-${e}`, title: `planet · ${name}`, note: 'A body’s history', make: () => new EnergyDemo(new PlanetView(40, 834), 'planet', 40, e, 'story.lush') })),
      ...([['gentle pull', 0.3], ['the storm', 1.1], ['tearing spacetime', ENERGY_PEAK]] as [string, number][]).map(([name, e]) => ({ id: `energy-blackhole-${e}`, title: `black hole · ${name}`, note: 'Connecting; filling the cosmos', make: () => new EnergyDemo(new BlackHoleView(70), 'blackhole', 70, e) })),
    ],
  },
  {
    key: 'galaxy', title: 'Galaxies · projects',
    // Hashed like real project keys: small sequential seeds barely move the shader.
    items: ['alpha', 'bravo', 'charlie', 'delta'].map((name) => fnv1a32(`project|${name}`)).map((seed) => ({ id: `galaxy-${seed}`, title: `seed ${seed}`, note: 'Galaxy (seed varies the look)', ado: ['Project (no state)'], make: () => new GalaxyView(72, seed) })),
  },
  {
    key: 'feature', title: 'Stars · Features',
    items: stages('feature.').map((stage) => ({ id: stage, stage, title: stage, note: look(stage), make: () => new StarView(44, 7) })),
  },
  {
    key: 'story', title: 'Planets · User Stories',
    items: stages('story.').map((stage) => ({ id: stage, stage, title: stage, note: look(stage), make: () => new PlanetView(46, 834) })),
  },
  {
    key: 'palette', title: 'Planet palettes (seed only; never encodes state)',
    // Palette = fract(4 × seed / 10007) in the planet shader: these seeds step it by sixths.
    items: [0, 417, 834, 1251, 1668, 2085].map((seed) => ({ id: `palette-${seed}`, stage: 'story.lush', title: `seed ${seed}`, note: 'story.lush', make: () => new PlanetView(46, seed) })),
  },
  {
    key: 'bug', title: 'Anomalies · Bugs',
    items: stages('bug.').map((stage) => ({ id: stage, stage, title: stage, note: look(stage), make: () => new AnomalyView(42, 5) })),
  },
  {
    key: 'task', title: 'Mission points · Tasks (close-up size, then system size)',
    items: [
      ...stages('task.').map((stage) => ({ id: stage, stage, title: stage, note: look(stage), make: () => new TaskDotView(36) })),
      ...stages('task.').filter((s) => s !== 'unknown').map((stage) => ({ id: `${stage}-small`, stage, title: `${stage} · small`, note: 'In a star system', make: () => new TaskDotView(13) })),
    ],
  },
  {
    key: 'flight', title: 'Cargo vessels · Pull Requests',
    items: [
      ...Object.keys(LOOKS).filter((s) => s.startsWith('flight.')).map((stage) => ({ id: stage, stage, title: stage, note: look(stage), make: () => new FlightView(40) })),
      ...VESSEL_KINDS.flatMap((name, kind) => [1, -1].map((dir) => ({
        id: `vessel-${kind}-${dir}`, stage: kind % 2 ? 'flight.completed' : 'flight.active', title: `${name} · ${dir > 0 ? 'east' : 'west'}`,
        note: `seed ${kind * 6}`, face: dir, make: () => new FlightView(40, kind * 6),
      }))),
    ],
  },
  {
    key: 'station', title: 'Supply stations · Repositories',
    items: STATION_KINDS.flatMap((name, kind) => [0, 1].map((a) => ({ id: `station-${kind}-${a}`, stage: 'station.active', title: name, note: `seed ${kind + a * 3}`, ado: ['Repository (no state)'], make: () => new StationView(56, kind + a * 3) }))),
  },
  {
    key: 'ship', title: `Captain ships · people (${HULLS.length} classes, flying east and west)`,
    items: HULLS.flatMap((hull, h) => [1, -1].map((dir) => {
      const livery = (h * 5) % LIVERIES.length;
      const seed = seedFor(h, livery);
      return {
        id: `ship-${h}-${dir > 0 ? 'east' : 'west'}`, title: `${hull.name} · ${dir > 0 ? 'east' : 'west'}`, note: `${hull.nod} · ${LIVERIES[livery]!.name}`,
        ado: ['Person: assignee or PR author (no state)'], face: dir, make: () => new ShipView(seed, 70),
      };
    })),
  },
  {
    key: 'livery', title: `Ship liveries (${LIVERIES.length}; no ladder hues)`,
    items: LIVERIES.map((l, i) => ({ id: `livery-${i}`, title: l.name, note: `Tug · seed ${seedFor(6, i)}`, make: () => new ShipView(seedFor(6, i), 40) })),
  },
];

/**
 * Item ids are unique per section only (every family has an "unknown"); prefix them. The v1 families
 * (13-game-design.md §4) come first while the redesign is under review.
 */
const SECTIONS: Section[] = [...V1_SECTIONS, ...extraSections(), ...RAW_SECTIONS].map((s) => ({ ...s, items: s.items.map((i) => ({ ...i, id: `${s.key}:${i.id}` })) }));

/** The step a cycling cell shows at a given cycle count (the gallery clock, or a pinned index). */
const stepOf = (item: Item, cycle: number): CycleStep | undefined =>
  item.cycle?.length ? item.cycle[cycle % item.cycle.length] : undefined;

const BACKGROUNDS: (BackdropLevel | 'ink')[] = ['ink', 'galaxy', 'sector', 'feature', 'body'];

/**
 * A cell's views: one, or for a cycling cell one per step that builds its own (`make`), with the rest
 * sharing the base view. Only the view for the current step is shown and ticked.
 */
interface Placed {
  el: HTMLElement; item: Item; views: ArtView[]; viewOf: number[]; shown: number; step: number;
  /** Near the viewport: drawn. A cell far off screen still ticks (its demo keeps looping) but isn't rendered. */
  inView: boolean;
  /** The cell's own layers and their masks, when its section clips. */
  clip?: { painted: Container; art: Container; masks: Graphics[] };
}

class GalleryScene {
  private readonly placed: Placed[] = [];
  private readonly skies: { sky: NebulaBackdrop; mask: Graphics; el: HTMLElement; level: BackdropLevel }[] = [];
  private readonly backdrop: NebulaBackdrop;
  private readonly art = new Container();
  /** Celestial bodies get the live paint pass, as on the chart; mechanical art stays crisp. */
  private readonly painted = new Container();
  private readonly paint = [new PaintFilter({ radius: 3, sharp: 6, streak: 0.22, bands: 0.35 }), new ImpastoFilter(0.75, 1.5)];
  private readonly tooth: CanvasTooth;
  paintOn = true;
  time = 0;
  playing = true;
  background: BackdropLevel | 'ink' = 'ink';

  constructor(private readonly app: Application, private readonly content: HTMLElement) {
    this.backdrop = new NebulaBackdrop(app.renderer, 4242);
    this.backdrop.root.visible = false;
    this.tooth = new CanvasTooth(app.renderer);
    this.painted.filters = this.paint;
    app.stage.addChild(this.backdrop.root, this.painted, this.art);
    for (const el of content.querySelectorAll<HTMLElement>('[data-sky]')) {
      const level = el.dataset.sky as BackdropLevel;
      const sky = new NebulaBackdrop(app.renderer, 9000 + this.skies.length);
      const mask = new Graphics();
      app.stage.addChild(sky.root, mask);
      sky.root.mask = mask;
      this.skies.push({ sky, mask, el, level });
    }
    const items = new Map(SECTIONS.flatMap((s) => s.items).map((i) => [i.id, i]));
    const clipped = new Set(SECTIONS.filter((s) => s.clip).flatMap((s) => s.items.map((i) => i.id)));
    for (const el of content.querySelectorAll<HTMLElement>('[data-art]')) {
      const item = items.get(el.dataset.art!)!;
      const clip = clipped.has(item.id) ? this.cellLayers() : undefined;
      const views = [this.mount(item.make(), item, clip)];
      const viewOf = (item.cycle ?? []).map((step) => (step.make ? views.push(this.mount(step.make(), item, clip)) - 1 : 0));
      const placed: Placed = { el, item, views, viewOf, shown: 0, step: -1, clip, inView: true };
      if (item.stage) views[0]!.setStage(item.stage);
      for (let i = 1; i < views.length; i++) this.show(views[i]!, false);
      this.placed.push(placed);
      this.applyStep(placed);
    }
    app.stage.addChild(this.tooth.root);
    // Draw only the cells near the viewport: the gallery is hundreds of cells and a score of whole
    // scenes, and rendering them all makes it crawl (2026-10-12).
    const byEl = new Map(this.placed.map((p) => [p.el, p]));
    this.observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const p = byEl.get(e.target as HTMLElement);
        if (p) p.inView = e.isIntersecting;
      }
    }, { rootMargin: '300px' });
    for (const p of this.placed) this.observer.observe(p.el);
    app.ticker.add(this.onTick);
  }

  private readonly observer: IntersectionObserver;

  /** A pinned cycle index (review copies, tests/e2e/gallery-v1.spec.ts), or null to follow the clock. */
  cyclePin: number | null = null;

  get cycle(): number {
    return this.cyclePin ?? Math.floor(this.time / CYCLE_S);
  }

  /** A clipping cell's own painted and crisp layers, each masked to the cell's frame (in layout()). */
  private cellLayers(): NonNullable<Placed['clip']> {
    const painted = new Container();
    const art = new Container();
    const masks = [new Graphics(), new Graphics()];
    painted.mask = masks[0]!;
    art.mask = masks[1]!;
    this.painted.addChild(painted, masks[0]!);
    this.art.addChild(art, masks[1]!);
    return { painted, art, masks };
  }

  private mount(view: ArtView, item: Item, clip?: Placed['clip']): ArtView {
    view.face?.(item.face ?? 1);
    const celestial = view.layer === 'celestial' || view instanceof StarView || view instanceof PlanetView || view instanceof AnomalyView || view instanceof GalaxyView;
    (celestial ? clip?.painted ?? this.painted : clip?.art ?? this.art).addChild(view.root);
    if (view.marks) (clip?.art ?? this.art).addChild(view.marks); // crisp, outside the paint pass
    return view;
  }

  private show(view: ArtView, on: boolean): void {
    view.root.visible = on;
    if (view.marks) view.marks.visible = on;
  }

  /** Move a cycling cell to the step for the current cycle count. */
  private applyStep(p: Placed): void {
    const n = p.item.cycle?.length ?? 0;
    if (!n) return;
    const step = this.cycle % n;
    if (step === p.step) return;
    p.step = step;
    const next = p.viewOf[step]!;
    if (next !== p.shown) {
      this.show(p.views[p.shown]!, false);
      this.show(p.views[next]!, true);
      p.shown = next;
    }
    const stage = p.item.cycle![step]!.stage;
    if (stage) p.views[next]!.setStage(stage);
  }

  setPaint(on: boolean): void {
    this.paintOn = on;
    this.painted.filters = on ? this.paint : [];
    this.tooth.root.visible = on;
    this.backdrop.setPainted(on);
    for (const s of this.skies) s.sky.setPainted(on);
  }

  /**
   * The canvas spans the whole page, so on a dense display a long page can ask for a drawing buffer
   * bigger than the GPU allows. The browser then quietly shrinks the buffer and everything drawn
   * slides off its frame. So: pick the sharpest resolution that fits, check what the browser really
   * allocated, and step down until the two agree. The art always sits in its frames, at any display
   * density or window size.
   */
  private fit(width: number, height: number): void {
    const gl = (this.app.renderer as WebGLRenderer).gl;
    const limit = gl ? (gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number) : 8192;
    let res = Math.min(window.devicePixelRatio || 1, limit / Math.max(width, height, 1));
    for (let i = 0; i < 4; i++) {
      this.app.renderer.resize(width, height, res);
      if (!gl) return;
      const canvas = this.app.canvas;
      const short = Math.min(gl.drawingBufferWidth / canvas.width, gl.drawingBufferHeight / canvas.height);
      if (short >= 0.999) return;
      res = Math.floor(res * short * 0.98 * 100) / 100; // a little margin below the clamp
    }
  }

  /** Place every view at its cell's center (the DOM grid does the layout). */
  layout(): void {
    const box = this.content.getBoundingClientRect();
    this.fit(box.width, this.content.scrollHeight);
    const at = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    };
    for (const { views, el, clip } of this.placed) {
      const r = at(el);
      for (const m of clip?.masks ?? []) m.clear().rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff });
      for (const view of views) {
        view.root.position.set(r.x + r.w / 2, r.y + r.h / 2);
        view.marks?.position.set(r.x + r.w / 2, r.y + r.h / 2);
        view.setLightFrom?.(r.x + r.w / 2 - 900, r.y + r.h / 2 - 700); // light from the upper left, as in a close-up
      }
    }
    for (const s of this.skies) {
      const r = at(s.el);
      s.sky.resize(r.w, r.h);
      s.sky.setLevel(s.level, 777);
      s.sky.root.position.set(r.x, r.y);
      s.mask.clear().rect(r.x, r.y, r.w, r.h).fill({ color: 0xffffff });
    }
    this.backdrop.resize(box.width, this.content.scrollHeight);
    this.tooth.resize(box.width, this.content.scrollHeight);
    this.setBackground(this.background);
  }

  /** For the e2e layout check: buffer integrity, and each view against its frame as the DOM has it now. */
  alignment(): { bufferOk: boolean; resolution: number; worstPx: number; views: number } {
    const gl = (this.app.renderer as WebGLRenderer).gl;
    const c = this.app.canvas;
    const bufferOk = !gl || (gl.drawingBufferWidth === c.width && gl.drawingBufferHeight === c.height);
    const box = this.content.getBoundingClientRect();
    let worstPx = 0;
    for (const { views, shown, el } of this.placed) {
      const view = views[shown]!;
      const r = el.getBoundingClientRect();
      const dx = view.root.position.x - (r.left - box.left + r.width / 2);
      const dy = view.root.position.y - (r.top - box.top + r.height / 2);
      worstPx = Math.max(worstPx, Math.hypot(dx, dy));
    }
    return { bufferOk, resolution: this.app.renderer.resolution, worstPx, views: this.placed.length };
  }

  setBackground(level: BackdropLevel | 'ink'): void {
    this.background = level;
    this.backdrop.root.visible = level !== 'ink';
    if (level !== 'ink') this.backdrop.setLevel(level, 4242);
  }

  private onTick = (): void => {
    if (this.playing) this.time += Math.min(this.app.ticker.deltaMS, 100) / 1000;
    motion.pulseTime = this.time; // blinking art reads the pulse clock (05 §5): frozen with the gallery
    for (const p of this.placed) {
      this.applyStep(p);
      const view = p.views[p.shown]!;
      view.tick(this.time);
      if (view.root.visible !== p.inView) this.show(view, p.inView);
    }
  };

  destroy(): void {
    this.observer.disconnect();
    this.app.ticker.remove(this.onTick);
    for (const { views } of this.placed) for (const view of views) view.destroy();
    for (const s of this.skies) s.sky.destroy();
    this.backdrop.destroy();
    this.tooth.destroy();
    for (const f of this.paint) f.destroy();
    this.app.destroy(true, { children: true });
  }
}

export function Gallery() {
  const host = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GalleryScene | null>(null);
  const [status, setStatus] = useState({ time: 0, playing: true, background: 'ink' as string, paint: true, cycle: 0 });

  useEffect(() => {
    let disposed = false;
    let resolveReady: () => void = () => {};
    const ready = new Promise<void>((r) => (resolveReady = r));
    let scene: GalleryScene | null = null;
    // Re-lay out on anything that can move a frame: the window, a reflow inside the page (a scrollbar
    // appearing, fonts, wrapping), or a move to a display with another pixel density.
    let queued = 0;
    const onResize = () => {
      if (queued) return;
      queued = requestAnimationFrame(() => { queued = 0; scene?.layout(); });
    };
    const observer = new ResizeObserver(onResize);
    let density: MediaQueryList | null = null;
    const watchDensity = () => {
      density?.removeEventListener('change', onDensity);
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      density.addEventListener('change', onDensity);
    };
    function onDensity() { watchDensity(); onResize(); }
    (async () => {
      await document.fonts.ready;
      await loadAsteroidAtlas();
      const app = new Application();
      await app.init({ preference: 'webgl', antialias: true, background: 0x081629, resolution: window.devicePixelRatio, autoDensity: true });
      if (disposed) { app.destroy(true); return; }
      host.current!.appendChild(app.canvas);
      scene = new GalleryScene(app, content.current!);
      sceneRef.current = scene;
      scene.layout();
      window.addEventListener('resize', onResize);
      observer.observe(content.current!);
      watchDensity();
      window.__starChartGallery = {
        ready,
        freeze: (seconds) => { scene!.playing = false; scene!.time = seconds; },
        setBackground: (level) => scene!.setBackground(level as BackdropLevel | 'ink'),
        setPaint: (on) => scene!.setPaint(on),
        bakeAsteroids: () => bakeAsteroidAtlas(app.renderer),
        alignment: () => scene!.alignment(),
        setCycle: (index) => { scene!.cyclePin = index; },
        cycleLength: (family) => Math.max(0, ...(SECTIONS.find((s) => s.key === family)?.items ?? []).map((i) => i.cycle?.length ?? 0)),
      };
      app.ticker.addOnce(() => requestAnimationFrame(() => resolveReady()));
    })();
    const status = setInterval(() => {
      const s = sceneRef.current;
      if (s) setStatus({ time: s.time, playing: s.playing, background: s.background, paint: s.paintOn, cycle: s.cycle });
    }, 100);
    const onKey = (e: KeyboardEvent) => {
      const s = sceneRef.current;
      if (!s) return;
      if (e.key === ' ') { e.preventDefault(); s.playing = !s.playing; }
      else if (e.key === 'ArrowRight' && !s.playing) s.time += 1 / 30;
      else if (e.key === 'ArrowLeft' && !s.playing) s.time = Math.max(0, s.time - 1 / 30);
      else if (e.key === 'p' || e.key === 'P') s.setPaint(!s.paintOn);
      else if (e.key === 'b' || e.key === 'B') s.setBackground(BACKGROUNDS[(BACKGROUNDS.indexOf(s.background) + 1) % BACKGROUNDS.length]!);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      disposed = true;
      clearInterval(status);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      density?.removeEventListener('change', onDensity);
      if (queued) cancelAnimationFrame(queued);
      scene?.destroy();
    };
  }, []);

  return (
    <div className="gallery">
      <header className="gallery__bar">
        <span className="titlebar__brand">STAR CHART</span>
        <span>Art gallery</span>
        <span className="muted mono">
          t = {status.time.toFixed(2)} s · {status.playing ? 'playing' : 'paused'} · background: {status.background} · paint: {status.paint ? 'on' : 'off'}
        </span>
        <span className="muted">Space pause · ← → step a frame (paused) · B background · P paint on/off · cycling cells move every {CYCLE_S} s</span>
      </header>
      <div className="gallery__scroll">
        <div className="gallery__content" ref={content}>
          <div className="gallery__canvas" ref={host} />
          {SECTIONS.map((section) => (
            <section key={section.key} className="gallery__section" data-family={section.key}>
              <h2>{section.title}</h2>
              <div className="gallery__grid">
                {section.sky?.map((level) => (
                  <figure key={level} className="gallery__cell gallery__cell--sky">
                    <div className="gallery__art" data-sky={level} />
                    <figcaption><b className="mono">{level}</b></figcaption>
                  </figure>
                ))}
                {section.items.map((item) => {
                  const step = stepOf(item, status.cycle);
                  const stage = step?.stage ?? item.stage;
                  return (
                    <figure key={item.id} className={`gallery__cell${item.wide ? ' gallery__cell--wide' : ''}`}>
                      <div className="gallery__art" data-art={item.id} />
                      <figcaption>
                        <b className="mono">{item.title}</b>
                        {step && <span className="gallery__step mono">{(status.cycle % item.cycle!.length) + 1}/{item.cycle!.length} · {step.label}</span>}
                        {step?.rung === null ? null : step?.rung ? <Rung rung={step.rung} /> : stage && <Rung stage={stage} />}
                        <span>{step?.note ?? item.note}</span>
                        {(item.ado ?? adoFor(stage)).map((a) => <span key={a} className="gallery__ado">{a}</span>)}
                      </figcaption>
                    </figure>
                  );
                })}
                {section.dom?.map((cell) => <DomFigure key={cell.id} cell={cell} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A DOM cell (the label plates): its frame, over its sky when it has one, filled by its `build`. */
function DomFigure({ cell }: { cell: DomCell }) {
  const art = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Built once the fonts are in, so each plate is measured in Inter, as on the chart.
    let undo = () => {};
    let gone = false;
    void document.fonts.ready.then(() => { if (!gone) undo = cell.build(art.current!); });
    return () => { gone = true; undo(); };
  }, [cell]);
  return (
    <figure className="gallery__cell gallery__cell--full" data-dom={cell.id}>
      <div className="gallery__art gallery__art--dom" ref={art} {...(cell.sky === 'ink' ? {} : { 'data-sky': cell.sky })} />
      <figcaption><b className="mono">{cell.title}</b><span>{cell.note}</span></figcaption>
    </figure>
  );
}

/** The rung a stage sits on (09 §1), as a colored chip. A v1 step can name its rung directly. */
function Rung({ stage, rung }: { stage?: string; rung?: RungName }) {
  const s = rung ? { rung } as ReturnType<typeof signalOf> : signalOf(stage ?? 'unknown');
  const color = `#${RUNG_COLOR[s.rung].toString(16).padStart(6, '0')}`;
  const extra = [s.sketch && 'sketch', s.deferred && 'paused', s.step !== undefined && `step ${s.step}`].filter(Boolean).join(' · ');
  return (
    <span className="gallery__rung" style={{ color }}>
      ● {RUNG_NAME[s.rung]}{extra ? ` · ${extra}` : ''}
    </span>
  );
}
