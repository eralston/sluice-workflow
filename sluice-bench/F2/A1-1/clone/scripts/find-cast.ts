// `npx vite-node -c vitest.config.ts scripts/find-cast.ts`: write fixtures/scenarios/halcyon/cast.ts.
// Looks come only from hashes (INV-12): a handle fixes a captain's ship and world, a repo name fixes
// its station. So the Halcyon Reach demo's variety is *chosen* here, once, and committed: the script
// searches name pools for the people and repos that cover every hull, colourway, world line and
// station design across the five pods. Re-run it only to change the cast; the output is deterministic.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { keys } from '../src/shared/contracts/keys';
import { shipSeedFor } from '../src/shared/captains';
import { artSeed } from '../src/shared/scene/project/ctx';
import { guardCount } from '../src/shared/engine/solar/compound';
import { FIXTURE_ORG, guidFromName } from '../fixtures/dsl';

// The art functions live in the renderer (they sit beside Pixi code), which this project doesn't
// compile; load them the way the unit tests do.
const load = async <T>(rel: string) => (await import(/* @vite-ignore */ resolve(__dirname, '../src/renderer/src', rel))) as T;
const { fleetDesign, FLEET_HULLS } = await load<{ fleetDesign: (seed: number) => { hull: number; colourway: number }; FLEET_HULLS: unknown[] }>('chart/art/fleet');
const { worldLineOf } = await load<{ worldLineOf: (seed: number) => string }>('chart/art/worlds');
const { stationLook } = await load<{ stationLook: (seed: number) => { faction: string; colourway: number } }>('theme/starChart/factions');

const PROJECT = 'Halcyon Reach';

// ---- People -------------------------------------------------------------------------------------

const FIRST = `Aiko Alden Amara Anselm Arlo Asha Beck Bram Briar Caius Calla Cass Cyrus Dalia Darcy Declan Delia Dev
Edda Eero Elio Emre Esme Fenn Fern Finch Freya Gael Galen Greta Hale Hana Hollis Idris Ines Ione Isak Jory Juno
Kai Kestrel Kira Lars Leif Lena Liora Lukas Lyra Mace Maia Marek Mira Nadia Nell Nico Noor Odette Orla Otis
Pavel Pia Quill Rafe Remy Rhea Rilke Rowan Sabine Salo Seren Silas Sora Soren Tamsin Tarek Thea Tobin Ulla
Una Vera Viggo Wren Xan Yara Yusuf Zane Zeno Zora Abel Bea Cato Dara Enzo Faye Gus Hugo Iris Joss Kit Luz
Milo Nia Oren Pax Rue Sage Tess Uri Vale Wyn Yael Zev Ada Bo Cleo Dov Eli Fox Gia Hux Ivo Jun Kes Lev Mo Nox`.split(/\s+/);
const LAST = `Ashgrove Brightwater Calloway Dunmore Eastwick Fairbanks Grantham Hargrove Ironside Jessamy Kingsley Larkspur
Marlowe Northcott Oakhurst Penhallow Quennell Ravenscroft Stonebridge Thistledown Underhill Vanterpool Whitlock
Yarrow Zellmer Albrecht Bellweather Corrigan Delacroix Ferreira Goldsmith Halloran Ishikawa Jankowski Kowalczyk
Lindqvist Moreau Nakamura Okonkwo Petrov Quigley Rasmussen Sorensen Takahashi Uzun Valdez Westerberg`.split(/\s+/);

interface Cand { handle: string; hull: number; colour: number; line: string; faction: number }
const personId = (handle: string) => guidFromName('person', handle);
const candidates: Cand[] = [...new Set(FIRST)].map((first) => {
  const handle = first.toLowerCase();
  const seed = shipSeedFor(FIXTURE_ORG, personId(handle));
  const d = fleetDesign(seed);
  return { handle, hull: d.hull, colour: d.colourway, line: worldLineOf(seed), faction: Math.floor(d.hull / 3) };
});

const used = new Set<string>();
/** Greedy: repeatedly take the candidate that adds the most unseen hulls, colourways, lines, then pairs. */
function pick(n: number, want: { hulls?: boolean; colours?: boolean } = { hulls: true, colours: true }, have = { hulls: new Set<number>(), colours: new Set<number>(), lines: new Set<string>(), pairs: new Set<string>() }): Cand[] {
  const out: Cand[] = [];
  while (out.length < n) {
    let best: Cand | undefined, bestScore = -1;
    for (const c of candidates) {
      if (used.has(c.handle)) continue;
      const score =
        (want.hulls && !have.hulls.has(c.hull) ? 100 : 0) +
        (want.colours && !have.colours.has(c.colour) ? 60 : 0) +
        (!have.lines.has(c.line) ? 30 : 0) +
        (!have.pairs.has(`${c.hull}.${c.colour}`) ? 10 : 0) +
        ((fnv(c.handle) % 7) / 10); // a stable tie-break that isn't alphabetical
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (!best) throw new Error('out of candidates');
    used.add(best.handle); out.push(best);
    have.hulls.add(best.hull); have.colours.add(best.colour); have.lines.add(best.line); have.pairs.add(`${best.hull}.${best.colour}`);
  }
  return out;
}
function fnv(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

// Pulsar first: 20 captains must show every hull and colourway. Then the smaller pods take what's
// left, each aiming for a spread of factions (Nova's three are one of each).
const pulsar = pick(20);
const quasar = pick(7, { hulls: true }, { hulls: new Set(), colours: new Set(), lines: new Set(), pairs: new Set() });
const nova = [0, 1, 2].map((faction) => {
  const c = candidates.filter((x) => x.faction === faction && !used.has(x.handle)).sort((a, b) => fnv(a.handle) - fnv(b.handle))[0]!;
  used.add(c.handle);
  return c;
});
const comet = pick(2, { hulls: false });
// Meteor (27 F1) last, so every pick above stays byte-identical: eight, who again cover what hulls and colourways they can.
const meteor = pick(8, { hulls: true, colours: true }, { hulls: new Set(), colours: new Set(), lines: new Set(), pairs: new Set() });

// ---- Repos --------------------------------------------------------------------------------------

const AREAS = ['booking', 'guest', 'calendar', 'payments', 'rates', 'inbox', 'search', 'checkin', 'housekeeping', 'reviews', 'photos', 'billing', 'notify', 'channel', 'loyalty', 'reports'];
const KINDS = ['api', 'web', 'worker', 'ui', 'sync', 'gateway', 'cli', 'mobile'];
interface Repo { name: string; faction: string; colour: number; guards: number; design: string }
const repoPool: Repo[] = [];
for (const a of AREAS) for (const k of KINDS) {
  const name = `${a}-${k}`;
  const repoKey = keys.repo(FIXTURE_ORG, guidFromName(`repo:${PROJECT}`, name));
  const look = stationLook(artSeed(repoKey));
  repoPool.push({ name, faction: look.faction, colour: look.colourway, guards: guardCount(repoKey), design: `${look.faction}.${look.colourway}` });
}
const usedRepo = new Set<string>();
/** Round-robin over the 9 station designs, then over guard counts, so each pod's repos are varied. */
function pickRepos(n: number, seen = new Set<string>(), guards = new Set<number>()): Repo[] {
  const out: Repo[] = [];
  while (out.length < n) {
    let best: Repo | undefined, bestScore = -1;
    for (const r of repoPool) {
      if (usedRepo.has(r.name)) continue;
      const score = (!seen.has(r.design) ? 100 : 0) + (!guards.has(r.guards) ? 20 : 0) + (fnv(r.name) % 7) / 10;
      if (score > bestScore) { best = r; bestScore = score; }
    }
    if (!best) throw new Error('out of repos');
    usedRepo.add(best.name); out.push(best); seen.add(best.design); guards.add(best.guards);
  }
  return out;
}
const designsSeen = new Set<string>();
const guardsSeen = new Set<number>();
const pulsarRepos = pickRepos(14, designsSeen, guardsSeen);
const quasarRepos = pickRepos(10, designsSeen, guardsSeen);
const novaRepo = pickRepos(1, new Set(), new Set());
const cometRepo = pickRepos(1, new Set(), new Set());
// Meteor's 36 run repos, then the lone summon's (27 F1).
const meteorRepos = pickRepos(37, new Set(), new Set());

// ---- Output -------------------------------------------------------------------------------------

const people = (cs: Cand[], offset: number) => cs.map((c, i) => {
  const last = LAST[(fnv(c.handle) + offset + i) % LAST.length]!;
  return `  { handle: '${c.handle}', name: '${c.handle[0]!.toUpperCase()}${c.handle.slice(1)} ${last}', hull: ${c.hull}, colourway: ${c.colour}, line: '${c.line}' },`;
}).join('\n');
const repoLines = (rs: Repo[]) => rs.map((r) => `  '${r.name}', // ${r.faction} ${r.colour}, ${r.guards} guards`).join('\n');

const text = `// GENERATED by scripts/find-cast.ts: do not edit by hand. Invented names only (INV-18).
// A handle fixes a captain's ship and world, a repo name fixes its station (hashes, INV-12), so these
// were searched for, once, to cover every hull, colourway, world line and station design.

export interface CastMember { handle: string; name: string; hull: number; colourway: number; line: string }

/** Comet: the solo captain, then the outside reviewer who jumps in on each merge. */
export const COMET_CAST: CastMember[] = [
${people(comet, 0)}
];
/** Nova: three developers; one of each faction when the pool allows. */
export const NOVA_CAST: CastMember[] = [
${people(nova, 7)}
];
/** Quasar: six developers, then the manager (last). */
export const QUASAR_CAST: CastMember[] = [
${people(quasar, 13)}
];
/** Pulsar: twenty captains, every hull and colourway between them. */
export const PULSAR_CAST: CastMember[] = [
${people(pulsar, 29)}
];
/** Meteor: [0] the run's captain, [1] the other captain, [2] the second author, [3..7] approvers who hold no items. */
export const METEOR_CAST: CastMember[] = [
${people(meteor, 41)}
];

export const COMET_REPOS: string[] = [
${repoLines(cometRepo)}
];
export const NOVA_REPOS: string[] = [
${repoLines(novaRepo)}
];
export const QUASAR_REPOS: string[] = [
${repoLines(quasarRepos)}
];
export const PULSAR_REPOS: string[] = [
${repoLines(pulsarRepos)}
];
/** Meteor: [0..35] the run's repos, [36] the lone summon's. */
export const METEOR_REPOS: string[] = [
${repoLines(meteorRepos)}
];
`;

const file = resolve(__dirname, '../fixtures/scenarios/halcyon/cast.ts');
mkdirSync(resolve(__dirname, '../fixtures/scenarios/halcyon'), { recursive: true });
writeFileSync(file, text);

const all = [...comet, ...nova, ...quasar, ...pulsar, ...meteor];
const designs = new Set([...pulsarRepos, ...quasarRepos, ...novaRepo, ...cometRepo].map((r) => r.design));
console.log(`wrote ${file}`);
console.log(`captains: ${all.length}; hulls ${new Set(all.map((c) => c.hull)).size}/${FLEET_HULLS.length}; colourways ${new Set(all.map((c) => c.colour)).size}/8; world lines ${new Set(all.map((c) => c.line)).size}/3`);
console.log(`pulsar alone: hulls ${new Set(pulsar.map((c) => c.hull)).size}/9; colourways ${new Set(pulsar.map((c) => c.colour)).size}/8`);
console.log(`station designs ${designs.size}/9; guard counts ${[...new Set([...pulsarRepos, ...quasarRepos].map((r) => r.guards))].sort().join(',')}`);
