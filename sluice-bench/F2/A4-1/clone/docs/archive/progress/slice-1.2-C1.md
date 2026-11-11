# Slice 1.2-C1: one rulebook for Solar playback

**Status:** built 2026-10-15. [22 §3, Block C](../22-v1.2.md#3-blocks): C1. Docs only, plus one guard;
no behavior changed.

## 1. What was built
- **05 §8 is rebuilt as the rulebook** ("The rules of Solar playback"): one table per area, each rule
  with a stable id, its trigger or meaning, and the code that does it. Values link to 15.
  - **§8.2 the static board** (S-1 to S-12): who has a planet, the ring, the lattice, platforms, the
    belt, what's drawn, stations, standby, previews.
  - **§8.3 events to beats** (B-1 to B-11), with the priority table by event: grouping, focus,
    priority, silent beats, gaps, frame, budget, lead-in, one accent per frame, highlights, region-only
    play.
  - **§8.4 what plays, by priority** (M-1 to M-21), in the user's framing:
    - (a) moments, always whole and labelled: merge, landing, strike run, homeworld complete, all clear;
    - (b) a beat's maneuvers, labelled within the budget;
    - (c) light work by Activity level;
    - (d) ambient: the opening, idle work and life, standby, recap and finale.
  - **§8.5 coordinating a beat** (P-1 to P-14): introducers, moments, one person one thing, the
    attention budget, the crew's turn, load at run time, carry, waiting captains, arrivals, looks
    landing, frozen guides.
  - **§8.6 captains** (K-1 to K-10), set against the user's expectations; **§8.7 stations** (T-1 to
    T-5); **§8.8 asteroids and enemy ships** (L-1 to L-6); **§8.9 labels and attention** (A-1 to A-8);
    **§8.10 seeks, reduced motion and rates** (R-1 to R-3).
  - **§8.11 conflicts** (X-1 to X-15), each resolved to the code unless noted.
  - **§8.12 gaps** (G-1 to G-16), each marked as confirmed or from code.
  - **§8.13 ideas** (I-1 to I-7), starting with the user's story arcs.
- **One probe, then deleted:** a throwaway e2e played meridian's dense pod at 2× and sampled every
  piece each frame. Each of the 16 closes moved 22–74 px in one 40 ms sample, its done look landing the
  same frame, so a closing piece jumps to its platform (G-2, confirmed). The other gaps are cited from
  the code.
- **The other docs point to 05** and keep their purpose:
  - **13:** §3 and §6 headers, *How ships move*, standby, the opening; §2's preview and star plate
    fixed; §6.2's crew hold fixed to 1.5 s.
  - **06:** the in-play plate windows, the star plates, the belt, the 45 s pace.
  - **03:** the planning and interpreter shapes, with A11, B7 and B9 noted.
  - **14:** four hooks, the resting looks.
  - **12:** the `CROWD_MIN` path, four tiers.
  - **02:** INV-07's Solar rest.
  - **15:** the paused-plate row; T1 is "captains, stations".
- **Names.** User-facing prose in 13, 15, 06 and 12 says *enemy ship* and *station* (22 B2); code
  identifiers (`hive`, `dreadnought`, `DreadnoughtView`, file names) are unchanged.
- **22:** Block C's intake, C1, and the candidates. The carried v1.1 questions are renamed V1–V7, since
  their C ids clashed with the block letter.

## 2. Contracts changed
None. Docs only: 05 §8 (rewritten), and pointers in 02, 03, 06, 12, 13, 14, 15 and 22. 05 keeps its
§1–§8 numbers, so every "05 §N" citation in code and docs still resolves.

## 3. Checks
- **Unit:** `npm test` passes (954). `rulebook.test.ts` (new) checks that:
  - every `PACE_RULES` id is in §8.4;
  - every Activity level is named;
  - each of the 128 ids is defined once;
  - every id §8 cites is one it defines.
- **docTables** passes: no guarded table moved.
- **Lint** passes.
- **No e2e:** nothing in the app changed.

## 4. Human gates
None to sign off. The next step is the user's: choose which candidates to take first, from 05
§8.12–§8.13 (22 Block C).

## 5. Known limitations and open questions
- **Suspected, not probed:** G-4 (the jump-in replay) and G-5 (guests arriving twice) come from
  reading the code; each is to be confirmed before it's fixed.
- **Values stay in 15:** the rulebook links to them, and its tables restate only the few numbers a rule
  needs to be read.
