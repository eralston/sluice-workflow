# Slice 1.2-A12: completed work told apart by silhouette

**Status:** built 2026-10-14. [22 §3, A12](../22-v1.2.md#3-blocks).

## 1. What was built
- **A done asteroid is a round orb** (`asteroids.ts` `buildPlatform`).
  - A gold hoop at `ORB_R`, 0.86 of its radius, with a fainter inner ring, rings the processed core and
    its compact mine.
  - Its victory-gold outline (the aura) follows a circle, not the rock's facets.
  - The core and bands are unchanged, inside the disc.
- **A done hive ship is an asterisk** (`swarm.ts`, the `platform` look).
  - `SPIKES` sharp wreckage blades, eight, alternately long and short, out to `SPIKE_REACH`, 1.55 of the
    platform's radius.
  - They are dark steel edged in victory gold, behind the caged hulk, which stays the head.
  - Its gold outline follows the hulk and the spikes.
  - Seeded per design, and shared like the bakes (`asteriskOf`).
- The threat asset's sample label now matches the resting look ("accomplished (research platform)",
  was "(ruin)").
- The gallery's cell notes describe the orb and the asterisk.

## 2. Contracts changed
- **09 §9:** the asteroid and hive rows' Accomplished column, amended as 22 A12 said (R10).
- **06 §9:** the board text.
- No 15 rows: these are art constants (as the other art shapes), reviewed in the gallery.

## 3. Checks
- **Unit:** `npm test` passes (895). Typecheck and lint are clean.
- **e2e:** `gallery`, `gallery-assets`, `gallery-v1` and `solar-play` pass (16); keystone passes (38).
- **Gallery:** `v1-asteroids` (the three done cells are gold circles round the core) and `v1-swarm` (all
  three swarms' research platforms are gold asterisks).
- **Drive** `v12-dense`, the region's end at the fit zoom, with 18 pieces done in a busy pod: rings and
  asterisks read apart at a glance.

## 4. Human gates
**HG-A-shapes.** Judge:
- the orb against the asterisk at the fit zoom and in the gallery;
- whether the spikes are too much: they reach past the platform's old footprint (INV-19's same footprint
  is for the live ship);
- whether the orb's hoop should be bolder.

## 5. Known limitations and open questions
- A-Q2: no spin of its own for the asterisk; today's idle drift only.
- The spikes widen the done hive's drawn footprint. Placement keeps platforms apart by their hit circle,
  which is unchanged, so neighbouring spikes may touch in a very dense orbit.
