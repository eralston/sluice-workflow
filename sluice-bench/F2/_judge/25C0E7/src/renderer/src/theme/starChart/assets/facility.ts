// A facility as a station (13 §4.4): a faction dreadnought with its satellites, tender shuttles for
// open attachments ("+N" past the cap) and point-defense guards on its hardpoints. Its faction and
// colourway come from the repo's seed, unless the viewer summoned it: then it takes the viewer's
// faction, with the colourway still the repo's pick within it (13 §7). Hardware, with a station's
// screen floor. Its moments (jump-in, intake, covering fire, docking) are acts; its standby (19 M1) is
// eased by its view (standby.ts).
import { LABEL_PX } from '@shared/scene/sizing';
import { encodePiece } from '@shared/engine/stageCode';
import type { ViewNode } from '@shared/contracts/view';
import { DreadnoughtView, stationStage } from '../../../chart/art/dreadnoughts';
import { rlog } from '../../../devlog';
import type { AssetCtx, AssetDef } from '../../../chart/assets/types';
import type { CycleStep, Item } from '../../../gallery/types';
import { FACTIONS, stationLook, type StationLook } from '../factions';
import { facilityLook, pieceOf, STATION_ACTS } from '../stageCodec';
import { launch, operate } from './acts';
import { type Act, NO_VIEWER, sampleKey, sampleNode, samplePiece } from './adapt';
import { StationView } from './standby';

/** Point-defense mounts the art has (DreadnoughtOptions.guardCount, 0..3). */
const MAX_GUARDS = 3;

/** The station's look for a node: the summoning viewer's faction when they chose one, else the seed's. */
export function facilityStyle(node: ViewNode, ctx: AssetCtx): StationLook {
  const summoned = ctx.viewer !== null && node.compound?.summoner === ctx.viewer;
  return stationLook(node.seed, summoned && ctx.captain ? ctx.captain.faction : undefined);
}

const guardsOf = (node: ViewNode) => Math.max(0, Math.min(MAX_GUARDS, node.compound?.guards ?? 0));
/** What the view was built with; a change needs a new view (the bakes and mounts are fixed). */
const builtKey = (node: ViewNode, ctx: AssetCtx) => {
  const s = facilityStyle(node, ctx);
  return `${s.faction}:${s.colourway}:${guardsOf(node)}`;
};
const built = new Map<string, string>();

export const facilityAsset: AssetDef = {
  id: 'dreadnought',
  layer: 'infrastructure',
  moving: false, framed: true, flare: false, body: false,
  floorPx: LABEL_PX * 1.2, // sizing.ts' facility floor: twice a captain ship (art session 2026-10-12)
  rank: 2,
  // The repo's name over its type word on a holographic plate, above or below the hull (2026-10-12).
  label: { frame: 'chamfer', variant: 'subtitle', layout: 'vertical', tier: 'lead' },
  labelRim: 0.5,
  // The station acts, and `transform`: its change to the second form begins now (a first merge's Power link, from its gather).
  // And `launch`, `operate` (22 C3, M-25): a tender out of the bay, the ring of lights turning.
  acts: [...STATION_ACTS, 'transform', 'muster', 'launch', 'operate'],
  make(node, ctx) {
    const { faction, colourway } = facilityStyle(node, ctx);
    built.set(node.projectionKey, builtKey(node, ctx));
    const stage = (s: string, act?: (typeof STATION_ACTS)[number], slot?: number | readonly number[]) => {
      const p = facilityLook(pieceOf(s, 'facility'), act, slot);
      return stationStage(faction, p.act, p.o);
    };
    const acts: Record<string, Act<DreadnoughtView>> = {};
    for (const a of STATION_ACTS) acts[a] = (art, s, slot) => art.setStage(stage(s, a, slot)); // `dock` plays on its PR's slot (23 C6), or on every slot of a volley (27 E6)
    acts.transform = (art) => art.beginTransform();
    acts.muster = (art) => art.muster(); // the episode's opening: tenders out to their patrol
    const one = (slot: number | readonly number[] | undefined) => (typeof slot === 'number' ? slot : slot?.[0]);
    acts.launch = (art, _s, slot) => { const i = one(slot); return launch(node.world.r, i === undefined ? null : art.slotDir(i)); };
    acts.operate = (art, _s, slot) => { const i = one(slot); return operate(node.world.r, i === undefined ? null : art.slotDir(i)); };
    // The node's r is half the hull's length; its satellites reach a little past it (GEOMETRY).
    const view = new DreadnoughtView({ faction, colourway, length: 2 * node.world.r, seed: node.seed, guardCount: guardsOf(node) });
    // What became of each change of form (the dev log, redacted: the repo's key is hashed).
    view.onForm = (n) => rlog('station-form', { key: node.canonicalKey, ...n });
    return new StationView(view, (s) => stage(s), acts);
  },
  rebuildOn: (_prev, next, ctx) => built.get(next.projectionKey) !== builtKey(next, ctx),
  samples() {
    const piece = (intensity: number, open: number) => samplePiece('facility', { rung: 'underway' }, { intensity, open });
    const steps: CycleStep[] = [
      { label: 'intensity 0 · 1 open', stage: encodePiece(piece(0, 1)), rung: null },
      { label: 'intensity ½ · 3 open', stage: encodePiece(piece(0.5, 3)), rung: null },
      { label: 'intensity 1 · 6 open', stage: encodePiece(piece(1, 6)), rung: null },
      { label: 'intensity ½ · 9 open (+3)', stage: encodePiece(piece(0.5, 9)), rung: null },
    ];
    const node = (n: number, summoner: ViewNode['compound'] = undefined) =>
      sampleNode({ key: sampleKey.repo(n), kind: 'facility', asset: 'facility', seed: n, r: 100, ...(summoner ? { compound: summoner } : {}) });
    const viewer = sampleKey.person(1);
    const summoned = { slots: [], more: 0, intensity: 0.5, summoner: viewer, guards: 2 };
    // Then none open, awake and on standby (19 M1): the cell powers down into standby over its step
    // (STANDBY_FADE_MS is inside CYCLE_S) and wakes as the cycle comes round.
    const idle = (standby: boolean) => encodePiece(samplePiece('facility', { rung: 'underway' }, { intensity: 0.5, open: 0, ...(standby ? { standby } : {}) }));
    const bySeed: Item[] = [0, 1, 2].map((n) => ({
      id: `facility-${stationLook(n).faction}`,
      title: `facility · seeded ${stationLook(n).faction}`,
      note: 'Intensity and open attachments, then on standby; the faction and colourway from the repo seed',
      wide: true,
      make: () => facilityAsset.make(node(n), NO_VIEWER),
      stage: steps[0]!.stage,
      cycle: [
        ...steps,
        { label: 'intensity ½ · none open', stage: idle(false), rung: null },
        { label: 'standby · none open, quiet 2 days', stage: idle(true), rung: null },
      ],
    }));
    // The same station awake and on standby side by side, each step a view of its own so it shows settled
    // (the gallery's review copies freeze the clock).
    const standby: Item = {
      id: 'facility-standby',
      title: 'facility · on standby (19 M1)',
      note: 'None open: awake, then on standby, settled (the hull at 70%, its lights at 30% of that, its drift still)',
      wide: true,
      make: () => facilityAsset.make(node(0), NO_VIEWER),
      stage: idle(false),
      cycle: [
        { label: 'awake · none open', stage: idle(false), rung: null },
        { label: 'standby · settled', stage: idle(true), rung: null, make: () => facilityAsset.make(node(0), NO_VIEWER) },
      ],
    };
    return [
      ...bySeed,
      standby,
      {
        id: 'facility-summoned',
        title: 'facility · summoned by the viewer',
        note: 'The viewer’s faction; the colourway still from the repo seed',
        wide: true,
        make: () => facilityAsset.make(node(5, summoned), NO_VIEWER),
        stage: steps[1]!.stage,
        cycle: FACTIONS.map((faction) => ({
          label: `viewer faction ${faction}`, stage: steps[1]!.stage, rung: null,
          make: () => facilityAsset.make(node(5, summoned), { ...NO_VIEWER, viewer, captain: { faction, hull: 0, colourway: 0 } }),
        })),
      },
    ];
  },
};
