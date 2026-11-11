// The Star Chart theme table (17 W2-T3, 14 §5 Registries): every drawn role's asset is registered and
// bound once the theme is active, the parts drawn inside a parent are not, the asset defs declare
// their capabilities and gallery samples, the one Faction agrees with both art files, and the
// viewer's style reaches only their own ship and the stations they summon (13 §7).
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CanonicalKey } from '@shared/contracts/keys';
import type { CaptainStyle } from '@shared/contracts/settings';
import type { PieceState, ViewNode } from '@shared/contracts/view';
import { decodePiece } from '@shared/engine/stageCode';
import { terminology } from '@shared/engine/terminology';
import type { SourceWords } from '@shared/engine/types';
import { packById } from '@shared/packs/registry';
import '@shared/packs/all';

// Renderer code sits outside this project's tsconfig, so it's loaded by a runtime path and typed by
// hand. Importing it is fine under Node; building a view isn't (no WebGL, no canvas), so `make` and
// `rebuildOn` are left to the gallery.
const SRC = resolve(__dirname, '../../src/renderer/src');
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(SRC, rel))) as T;

interface Def {
  id: string; layer: string; moving: boolean; framed: boolean; flare: boolean; body: boolean;
  floorPx?: number; hitFloorPx?: number; rank: number; acts?: readonly string[];
  make: unknown; rebuildOn?: unknown;
  samples?(): { id: string; title: string; stage?: string; make: unknown; cycle?: { label: string; stage?: string; make?: unknown }[] }[];
}
interface Ctx { theme: string; viewer: CanonicalKey | null; captain: CaptainStyle | null }
type FleetDesign = { hull: number; colourway: number };

const { starChart, INNER_PARTS } = await load<{
  starChart: { id: string; roleAsset: Record<PieceState['role'], string>; assets: Def[]; words: Partial<SourceWords> };
  INNER_PARTS: readonly string[];
}>('theme/starChart/index.ts');
const { useTheme } = await load<{ useTheme(id: string): { id: string } | null }>('theme/registry.ts');
const { assetFor, assetById } = await load<{ assetFor(n: { asset?: string }): Def | undefined; assetById(id: string): Def | undefined }>('chart/assets/registry.ts');
const factions = await load<{
  FACTIONS: readonly string[]; ART_FACTIONS: { fleet: string[]; stations: string[] };
  hullsOf(f: string): number[]; designOfStyle(s: CaptainStyle): FleetDesign; agentDesign(seed: number, s: CaptainStyle | null): FleetDesign;
  stationLook(seed: number, faction?: string): { faction: string; colourway: number };
}>('theme/starChart/factions.ts');
const fleet = await load<{ FLEET_HULLS: { faction: string }[]; COLOURWAYS: unknown[]; fleetDesign(seed: number): FleetDesign }>('chart/art/fleet.ts');
const stations = await load<{ colourways(f: string): unknown[] }>('chart/art/dreadnoughts.ts');
const { facilityStyle } = await load<{ facilityStyle(n: ViewNode, ctx: Ctx): { faction: string; colourway: number } }>('theme/starChart/assets/facility.ts');
type Fake = { root: object; drawn: string[]; setStage(s: string): void; tick(t: number): void; destroy(): void };
const { AdaptedView, ACT_S } = await load<{
  AdaptedView: new (art: Fake, look: (s: string) => string | null, acts?: Record<string, (art: Fake, s: string) => void>, restore?: (art: Fake) => void) =>
    { setStage(s: string): void; act(name: string): void; tick(t: number): void };
  ACT_S: number;
}>('theme/starChart/assets/adapt.ts');
const { agentStyle } = await load<{ agentStyle(n: ViewNode, ctx: Ctx): FleetDesign }>('theme/starChart/assets/agent.ts');

const DRAWN = ['seat', 'objective', 'threat', 'facility', 'agent'] as const;
const viewer = 'id:org:00000000-0000-4000-8000-000000000001' as CanonicalKey;
const other = 'id:org:00000000-0000-4000-8000-000000000002' as CanonicalKey;
const NONE: Ctx = { theme: 'star-chart', viewer: null, captain: null };
const style = (faction: 'trek' | 'wars' | 'mecha', hull = 1, colourway = 4): CaptainStyle => ({ faction, hull, colourway });
const node = (key: CanonicalKey, seed: number, compound?: ViewNode['compound']) => ({
  projectionKey: `t:${key}`, canonicalKey: key, kind: 'facility', asset: 'facility', world: { x: 0, y: 0, r: 10 }, stage: '', seed,
  label: '', openable: false, selectable: true, labelled: true, flags: {}, evidence: [], ...(compound ? { compound } : {}),
}) as ViewNode;

describe('roleAsset → registered assets', () => {
  it('every drawn role names a registered asset; the inner parts name none', () => {
    const ids = starChart.assets.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [role, id] of Object.entries(starChart.roleAsset)) {
      if (INNER_PARTS.includes(id)) expect(DRAWN as readonly string[]).not.toContain(role);
      else expect(ids, role).toContain(id);
    }
    expect(Object.keys(starChart.roleAsset).filter((r) => !INNER_PARTS.includes(starChart.roleAsset[r as PieceState['role']])).sort()).toEqual([...DRAWN].sort());
    // Every registered asset is some role's.
    for (const id of ids) expect(Object.values(starChart.roleAsset)).toContain(id);
  });

  it('once active, a node’s neutral role finds its asset; inner parts and v0 nodes fall through', () => {
    expect(useTheme('star-chart')?.id).toBe('star-chart');
    for (const role of DRAWN) expect(assetFor({ asset: role })?.id).toBe(starChart.roleAsset[role]);
    for (const role of ['step', 'attachment', 'guard', 'container']) expect(assetFor({ asset: role })).toBeUndefined();
    expect(assetFor({})).toBeUndefined();
    expect(assetById('world')?.id).toBe('world');
  });
});

describe('asset defs', () => {
  const byRole = Object.fromEntries(DRAWN.map((r) => [r, starChart.assets.find((a) => a.id === starChart.roleAsset[r])!]));

  it('celestial art is painted and has no screen floor; hardware has a sublayer and a floor', () => {
    for (const r of ['seat', 'objective'] as const) {
      expect(byRole[r]!.layer).toBe('celestial');
      expect(byRole[r]!.floorPx).toBeUndefined();
    }
    for (const r of ['threat', 'facility', 'agent'] as const) {
      expect(['infrastructure', 'traffic']).toContain(byRole[r]!.layer);
      expect(byRole[r]!.floorPx).toBeGreaterThan(0);
    }
    expect(byRole.agent!.layer).toBe('traffic');
    // The v0 kind tables, as capabilities: captains are never framed nor flared (FRAMED_KINDS, FLARE_KINDS).
    expect([byRole.agent!.framed, byRole.agent!.flare, byRole.agent!.moving]).toEqual([false, false, false]);
    expect(byRole.facility!.framed).toBe(true);
    // Formation members keep the 12 px hit floor (D12, VC-3).
    expect([byRole.objective!.hitFloorPx, byRole.threat!.hitFloorPx]).toEqual([12, 12]);
    // Labels: a planet outranks its station, which outranks pieces, which outrank ships.
    expect(byRole.seat!.rank).toBeLessThan(byRole.facility!.rank);
    expect(byRole.facility!.rank).toBeLessThan(byRole.objective!.rank);
    expect(byRole.threat!.rank).toBeLessThan(byRole.agent!.rank);
  });

  it('every def has gallery samples whose stages are its own role’s neutral stages', () => {
    for (const role of DRAWN) {
      const def = byRole[role]!;
      const items = def.samples!();
      expect(items.length, role).toBeGreaterThan(0);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const item of items) {
        expect(typeof item.make).toBe('function');
        for (const step of item.cycle ?? []) {
          expect(step.stage !== undefined || typeof step.make === 'function', `${item.id} ${step.label}`).toBe(true);
          // An agent carries no rung, so its cells change ship rather than stage.
          if (step.stage !== undefined) expect(decodePiece(step.stage)?.role, `${item.id} ${step.label}`).toBe(role);
        }
      }
    }
  });

  it('the acts are named', () => {
    expect(byRole.threat!.acts).toEqual(['emerge', 'breakup', 'warp', 'retreat', 'engage', 'victory']); // engage: shields and guns (22 C3); victory: the gold outline flares (27 B3)
    expect(byRole.facility!.acts).toEqual(['jump', 'intake', 'cover', 'dock', 'charge', 'transform', 'muster', 'launch', 'operate']); // transform: a first merge; charge: before a beamed strike (2026-10-12); muster: the opening (2026-10-13); launch, operate: 22 C3
  });
});

describe('factions', () => {
  it('one Faction, in the same order as both art files', () => {
    expect(factions.ART_FACTIONS.fleet).toEqual([...factions.FACTIONS]);
    expect(factions.ART_FACTIONS.stations).toEqual([...factions.FACTIONS]);
  });

  it('a chosen style is a hull of that faction and a valid colourway, wrapping out-of-range picks', () => {
    for (const f of factions.FACTIONS) {
      const hulls = factions.hullsOf(f);
      expect(hulls.length).toBeGreaterThan(0);
      for (let hull = 0; hull < 7; hull++) {
        for (const colourway of [0, 5, 13, 255]) {
          const d = factions.designOfStyle(style(f as 'trek', hull, colourway));
          expect(fleet.FLEET_HULLS[d.hull]!.faction).toBe(f);
          expect(d.hull).toBe(hulls[hull % hulls.length]);
          expect(d.colourway).toBe(colourway % fleet.COLOURWAYS.length);
        }
      }
    }
    expect(factions.agentDesign(4242, null)).toEqual(fleet.fleetDesign(4242));
  });

  it('a station keeps its repo’s colourway within whichever faction it takes', () => {
    for (let seed = 0; seed < 40; seed++) {
      const own = factions.stationLook(seed);
      expect(factions.FACTIONS).toContain(own.faction);
      for (const f of factions.FACTIONS) {
        const look = factions.stationLook(seed, f);
        expect(look.faction).toBe(f);
        expect(look.colourway).toBe(Math.floor(seed / 3) % stations.colourways(f).length);
      }
    }
  });
});

describe('the viewer’s style reaches only their own ship and what they summon (13 §7)', () => {
  const summoned = (by: CanonicalKey | null) => ({ slots: [], more: 0, intensity: 0, summoner: by, guards: 1 });
  const ctx: Ctx = { theme: 'star-chart', viewer, captain: style('mecha') };

  it('stations', () => {
    const seed = 3; // seeded as trek
    expect(factions.stationLook(seed).faction).toBe('trek');
    expect(facilityStyle(node('repo:org:r1' as CanonicalKey, seed, summoned(viewer)), ctx)).toEqual(factions.stationLook(seed, 'mecha'));
    // Someone else summoned it, or no viewer, or a viewer with no style chosen: the repo's seed.
    expect(facilityStyle(node('repo:org:r1' as CanonicalKey, seed, summoned(other)), ctx)).toEqual(factions.stationLook(seed));
    expect(facilityStyle(node('repo:org:r1' as CanonicalKey, seed, summoned(viewer)), NONE)).toEqual(factions.stationLook(seed));
    expect(facilityStyle(node('repo:org:r1' as CanonicalKey, seed, summoned(viewer)), { ...ctx, captain: null })).toEqual(factions.stationLook(seed));
    expect(facilityStyle(node('repo:org:r1' as CanonicalKey, seed, summoned(null)), { ...ctx, viewer: null })).toEqual(factions.stationLook(seed));
    expect(facilityStyle(node('repo:org:r1' as CanonicalKey, seed), ctx)).toEqual(factions.stationLook(seed));
  });

  it('ships', () => {
    expect(agentStyle(node(viewer, 77), ctx)).toEqual(factions.designOfStyle(style('mecha')));
    expect(agentStyle(node(other, 77), ctx)).toEqual(fleet.fleetDesign(77));
    expect(agentStyle(node(viewer, 77), { ...ctx, captain: null })).toEqual(fleet.fleetDesign(77));
    expect(agentStyle(node(viewer, 77), NONE)).toEqual(fleet.fleetDesign(77));
  });
});

// A seek lands resting looks only; an act that outlived its moment would make play-to-x and seek-to-x
// draw different views (14 §4, INV-12).
describe('acts end on their own', () => {
  const fake = (): Fake => {
    const f: Fake = { root: {}, drawn: [], setStage: (s) => f.drawn.push(s), tick: () => {}, destroy: () => {} };
    return f;
  };
  const make = (art: Fake, restore?: (a: Fake) => void) =>
    new AdaptedView(art, (s) => `look:${s}`, { flash: (a, s) => a.setStage(`flash:${s}`) }, restore);

  it('the resting look comes back ACT_S after the act, on the clock the view is ticked with', () => {
    expect(ACT_S).toBe(3);
    const art = fake();
    const v = make(art);
    v.setStage('a');
    v.act('flash');
    v.tick(100); // the act's clock starts at the first tick after it
    v.tick(100 + ACT_S - 0.01);
    expect(art.drawn).toEqual(['look:a', 'flash:a']);
    v.tick(100 + ACT_S);
    expect(art.drawn).toEqual(['look:a', 'flash:a', 'look:a']);
    v.tick(200); // ended: nothing more
    expect(art.drawn).toHaveLength(3);
  });

  it('rest, the next stage or a replay end or restart it; an unknown act does nothing', () => {
    const art = fake();
    let restored = 0;
    const v = make(art, () => restored++);
    v.setStage('a');
    v.act('flash');
    v.act('rest');
    expect(art.drawn.at(-1)).toBe('look:a');
    expect(restored).toBe(1);
    v.act('flash');
    v.setStage('b'); // the stage's look replaces the act's
    v.tick(0); v.tick(ACT_S);
    expect(art.drawn.slice(-2)).toEqual(['flash:a', 'look:b']);
    v.act('flash');
    v.tick(0); v.tick(2);
    v.act('flash'); // a replay restarts the count
    v.tick(4); v.tick(4 + ACT_S - 0.01);
    expect(art.drawn.at(-1)).toBe('flash:b');
    v.tick(4 + ACT_S);
    expect(art.drawn.at(-1)).toBe('look:b');
    expect(restored).toBe(2);
    const n = art.drawn.length;
    v.act('nope');
    v.tick(0); v.tick(10);
    expect(art.drawn).toHaveLength(n);
  });

  it('an act that returns null plays nothing, and an overlay\'s end runs when it is cleared (27 B3)', () => {
    const art = fake();
    art.root = { addChild: () => {} };
    let ended = 0;
    const o = Object.assign(() => {}, { durS: 1, end: () => ended++ });
    const v = new AdaptedView(art, (s) => `look:${s}`, { none: () => null as never, over: () => o as never });
    v.setStage('a');
    v.act('none');
    v.tick(0); v.tick(ACT_S + 1);
    expect(art.drawn).toEqual(['look:a']);
    v.act('over');
    v.tick(0); v.tick(0.5);
    expect(ended).toBe(0);
    v.act('rest'); // a seek
    expect(ended).toBe(1);
    v.act('over');
    v.tick(0); v.tick(1.2); // its own length
    expect(ended).toBe(2);
  });

  it('an act on a view whose stage draws nothing (a captain) still ends, through restore', () => {
    const art = fake();
    const v = new AdaptedView(art, () => null, { transform: (a) => a.setStage('hybrid') }, (a) => a.setStage('fighter'));
    v.setStage('x');
    v.act('transform');
    v.tick(0); v.tick(ACT_S);
    expect(art.drawn).toEqual(['hybrid', 'fighter']);
  });
});

describe('chart-register words', () => {
  it('name every role, level and the agent in theme words, never source words', () => {
    const t = terminology(packById('sdlc')!, 'chart', { chart: starChart.words });
    expect([t.noun('objective'), t.noun('threat', 2), t.noun('facility'), t.noun('agent')]).toEqual(['asteroid', 'enemy ships', 'station', 'captain']);
    expect([t.level('region'), t.level('seat'), t.level('frontier')]).toEqual(['solar system', 'homeworld', 'frontier belt']);
    const all = JSON.stringify(starChart.words);
    for (const w of ['User Story', 'Bug', 'Task', 'Feature', 'Pull Request', 'Repository', 'Sprint', 'Area Path', 'Closed', 'Active', 'Resolved']) {
      expect(all).not.toContain(w);
    }
  });
});
