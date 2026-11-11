// The asteroid atlas pilot (23 C7, 06 §7, 14): the asteroids' rest looks baked from the procedural art to a
// PNG + Pixi spritesheet (`assets/atlas/asteroids.{png,json}`, `assets/LEDGER.md`), and a view that draws
// them. Procedural stays the default. The atlas path is on only under the dev flag (`atlasAsteroids`:
// localStorage `starChart.atlasAsteroids` = "1", or the test hook), and any miss falls back to the
// procedural view with a dev log line, never a crash. What the atlas does not cover (steps drawn, deferred,
// unknown, the contact arrival, the closing glint, the live light and the tumble) goes procedural.
// The outline (aura) is never baked: it is a live layer built from the silhouette stored in the sheet.
import { Assets, Container, Sprite, Spritesheet, RenderTexture, type Renderer, type SpritesheetData, type Texture } from 'pixi.js';
import atlasPng from '../../../../../assets/atlas/asteroids.png?url';
import { Aura, AURA } from './aura';
import { AsteroidView, ASTEROID_MATERIALS, asteroidMaterial, asteroidStage, type AsteroidStage, type AsteroidMaterial, type StepState } from './asteroids';
import { atlasKey, atlasStateOf, ATLAS_PARTS, ATLAS_STATES, ATLAS_VARIANTS, BAKE_R, BAKE_RES, BAKE_SEEDS, FRAME, variantOf, type AtlasState } from './asteroidAtlasKeys';
import { motion } from './motion';

const FLAG = 'starChart.atlasAsteroids';

interface AtlasMeta { aura: Record<string, { polygon: number[] } | { circle: number } | null> }
interface Loaded { textures: Record<string, Texture>; aura: AtlasMeta['aura'] }
let loaded: Loaded | null = null;
let loading: Promise<void> | null = null;

/** What the atlas path did this session (an e2e reads it): sprites drawn, procedural by design, and misses. */
export const atlasStats = { hits: 0, uncovered: 0, missing: 0 };

let on = false;
try { on = localStorage.getItem(FLAG) === '1'; } catch { /* storage may be blocked */ }
export const atlasEnabled = (): boolean => on;
export function setAtlasEnabled(v: boolean): void {
  on = v;
  try { localStorage.setItem(FLAG, v ? '1' : '0'); } catch { /* storage may be blocked */ }
}

/** Load the atlas once (a failure is logged and leaves every asteroid procedural). */
export function loadAsteroidAtlas(): Promise<void> {
  loading ??= (async () => {
    try {
      // The CSP has no worker-src, so Pixi's image-decoding worker is blocked: decode on the main thread.
      Assets.setPreferences({ preferWorkers: false });
      const tex = await Assets.load<Texture>(atlasPng);
      // The sheet's JSON loads on demand, so it stays out of the main bundle while the flag is off.
      const atlasJson = (await import('../../../../../assets/atlas/asteroids.json')).default;
      const sheet = new Spritesheet(tex, atlasJson as unknown as SpritesheetData);
      await sheet.parse();
      loaded = { textures: sheet.textures, aura: (atlasJson as unknown as { meta: AtlasMeta }).meta.aura };
    } catch (e) {
      console.warn('[asteroid-atlas] not loaded; asteroids stay procedural:', e);
    }
  })();
  return loading;
}
if (on) void loadAsteroidAtlas();

/** An asteroid with the AsteroidView's shape, drawn from the atlas where it can be, procedural elsewhere. */
export class AtlasAsteroidView {
  readonly root = new Container();
  readonly marks = new Container();
  readonly layer = 'celestial' as const;
  readonly material: AsteroidMaterial;
  private readonly body = new Container();
  private readonly mbody = new Container();
  private readonly rock = new Sprite();
  private readonly hw = new Sprite();
  private aura: Aura | null;
  private proc: AsteroidView | null = null;
  /** A victory's gold flare now (27 B3), re-applied to the procedural view if it takes over. */
  private flare = 0;
  private stage = 'asteroid.ready';
  /** The state the stage names, parsed once in setStage. */
  private state: AsteroidStage['state'] = 'ready';
  private steps: StepState[] = [];
  private activity = 0;
  private light: [number, number] | null = null;
  private readonly phase: number;

  constructor(private readonly radius: number, private readonly seed: number, material?: AsteroidMaterial) {
    this.material = material ?? asteroidMaterial(seed);
    this.phase = ((seed >>> 0) % 997) / 997;
    for (const s of [this.rock, this.hw]) s.anchor.set(0.5);
    this.aura = new Aura(AURA.objective, radius * 0.16, { outside: true });
    this.body.addChild(this.rock);
    this.mbody.addChild(this.aura.root, this.hw);
    this.root.addChild(this.body);
    this.marks.addChild(this.mbody);
    this.setStage(this.stage);
  }

  private toProcedural(why: string, missing: boolean): void {
    if (this.proc) return;
    if (missing) { atlasStats.missing++; console.warn(`[asteroid-atlas] fallback to procedural (${why}) for ${this.material} seed ${this.seed}`); } else atlasStats.uncovered++;
    const v = new AsteroidView(this.radius, this.seed, this.material);
    v.ambient({ activity: this.activity });
    if (this.light) v.setLightFrom(...this.light);
    if (this.flare) v.setAuraFlare(this.flare);
    this.proc = v;
    this.body.visible = false;
    this.mbody.visible = false;
    this.aura?.destroy();
    this.aura = null;
    this.root.addChild(v.root);
    this.marks.addChild(v.marks);
    if (this.steps.length) v.setSteps(this.steps);
    v.setStage(this.stage);
  }

  setStage(stage: string): void {
    this.stage = stage;
    this.state = asteroidStage(stage).state;
    if (this.proc) return this.proc.setStage(stage);
    const state = atlasStateOf(stage, this.steps);
    if (!state) return this.toProcedural('state not in the atlas', false);
    if (!this.show(state)) return this.toProcedural(`no frames for ${state}`, true);
    atlasStats.hits++;
  }

  private show(state: AtlasState): boolean {
    const l = loaded;
    if (!l) return false;
    const v = variantOf(this.seed);
    const rock = l.textures[atlasKey(this.material, state, v, 'rock')];
    const hw = l.textures[atlasKey(this.material, state, v, 'marks')];
    const shape = l.aura[atlasKey(this.material, state, v, 'rock')];
    if (!rock || !hw || shape === undefined) return false;
    this.rock.texture = rock;
    this.hw.texture = hw;
    // A frame is FRAME logical px at the bake radius; size by it, whatever resolution the sheet was baked at.
    for (const s of [this.rock, this.hw]) s.scale.set((FRAME * this.radius) / BAKE_R / s.texture.width);
    const R = this.radius;
    const a = this.aura!;
    a.setColor(state === 'accomplished' ? AURA.accomplished : AURA.objective);
    if (!shape) a.setPolygon([]);
    else if ('circle' in shape) a.setCircle(shape.circle * R);
    else a.setPolygon(shape.polygon.flatMap((r, i) => [Math.cos((i / shape.polygon.length) * Math.PI * 2) * r * R, Math.sin((i / shape.polygon.length) * Math.PI * 2) * r * R]));
    this.body.scale.set(1);
    return true;
  }

  /** Steps are drawn only by the procedural view. */
  setSteps(steps: StepState[]): void {
    this.steps = steps;
    if (this.proc) this.proc.setSteps(steps);
    else if (steps.length) this.toProcedural('steps drawn', false);
  }

  /** A victory's gold flare, 0..1 (27 B3; aura.ts). */
  setAuraFlare(share: number): void {
    this.flare = share;
    if (this.proc) this.proc.setAuraFlare(share);
    else this.aura?.setFlare(share);
  }

  contact(): void {
    this.toProcedural('arrival contact', false);
    this.proc!.contact();
  }

  glint(): void {
    this.toProcedural('closing glint', false);
    this.proc!.glint();
  }

  ambient(a: { activity?: number }): void {
    if (a.activity !== undefined) this.activity = a.activity;
    this.proc?.ambient(a);
  }

  /** The baked light is fixed; a procedural fallback follows it. */
  setLightFrom(x: number, y: number): void {
    this.light = [x, y];
    this.proc?.setLightFrom(x, y);
  }

  tick(seconds: number): void {
    if (this.proc) return this.proc.tick(seconds);
    const reduced = motion.reduced;
    const still = this.state === 'accomplished';
    const ghost = this.state === 'ghost';
    const live = !ghost && this.state !== 'unknown';
    const base = still ? 0.45 : this.state === 'sketch' ? 0.4 : 0.5;
    this.aura?.setAlpha(live ? (reduced ? base + 0.05 : base + 0.12 * Math.sin((2 * Math.PI * seconds) / 6 + this.phase * 6.28)) : 0);
    // The same identity motion as the procedural rock: a slow rock and drift.
    const rockA = still || reduced ? 0 : 0.05 * Math.sin((2 * Math.PI * seconds) / 40 + this.phase * 6.28);
    const drift = still || reduced ? 0 : (ghost ? 0.08 : 0.025) * this.radius;
    const dx = Math.sin((2 * Math.PI * seconds) / 23 + this.phase * 9) * drift;
    const dy = Math.cos((2 * Math.PI * seconds) / 17 + this.phase * 5) * drift * 0.6;
    for (const c of [this.body, this.mbody]) { c.rotation = rockA; c.position.set(dx, dy); }
  }

  destroy(): void {
    this.proc?.destroy();
    this.aura?.destroy();
    this.marks.destroy({ children: true });
    this.root.destroy({ children: true });
  }
}

/** The asteroid view the objective asset makes: atlas-backed under the flag, procedural otherwise. */
export function makeAsteroidView(radius: number, seed: number, material: AsteroidMaterial): AsteroidView | AtlasAsteroidView {
  return on ? new AtlasAsteroidView(radius, seed, material) : new AsteroidView(radius, seed, material);
}

/**
 * Bake the atlas from the procedural art (dev only; `npm run bake:asteroids` drives it through the
 * gallery). Returns the PNG as a data URL and the spritesheet JSON. Each part is drawn at rest (reduced
 * motion, outline hidden, no steps) into its own cell of a grid: states across, material x part down.
 */
export function bakeAsteroidAtlas(renderer: Renderer): { png: string; json: object } {
  const cols = ATLAS_STATES.length;
  const rows = ASTEROID_MATERIALS.length * ATLAS_VARIANTS * ATLAS_PARTS.length;
  const w = cols * FRAME;
  const h = rows * FRAME;
  const rt = RenderTexture.create({ width: w, height: h, resolution: BAKE_RES });
  const wasReduced = motion.reduced;
  motion.reduced = true;
  const frames: Record<string, unknown> = {};
  const auraMeta: AtlasMeta['aura'] = {};
  let row = 0;
  let first = true;
  for (const m of ASTEROID_MATERIALS) {
    for (let v = 0; v < ATLAS_VARIANTS; v++) {
      const rockRow = row++;
      const marksRow = row++;
      ATLAS_STATES.forEach((st, col) => {
        const view = new AsteroidView(BAKE_R, BAKE_SEEDS[m][v]!, m);
        view.setStage(`asteroid.${m}.${st}`);
        view.tick(0);
        view.bareForBake();
        for (const [part, c, r] of [['rock', view.root, rockRow], ['marks', view.marks, marksRow]] as const) {
          const x = col * FRAME;
          const y = r * FRAME;
          c.position.set(x + FRAME / 2, y + FRAME / 2);
          renderer.render({ container: c, target: rt, clear: first });
          first = false;
          const key = atlasKey(m, st, v, part);
          frames[key] = {
            frame: { x: x * BAKE_RES, y: y * BAKE_RES, w: FRAME * BAKE_RES, h: FRAME * BAKE_RES },
            rotated: false, trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: FRAME * BAKE_RES, h: FRAME * BAKE_RES },
            sourceSize: { w: FRAME * BAKE_RES, h: FRAME * BAKE_RES },
          };
        }
        auraMeta[atlasKey(m, st, v, 'rock')] = view.auraShape;
        view.destroy();
      });
    }
  }
  motion.reduced = wasReduced;
  const png = renderer.extract.canvas(rt).toDataURL!('image/png');
  rt.destroy(true);
  const json = {
    frames,
    meta: { app: 'star-chart bake:asteroids', image: 'asteroids.png', format: 'RGBA8888', size: { w: w * BAKE_RES, h: h * BAKE_RES }, scale: '1', aura: auraMeta },
  };
  return { png, json };
}
