# Slice 1.2-A3–A7: the labels (star labels, the inspector's path, T4 Sky, role outlines, two-line titles)

**Status:** built 2026-10-14. Block A's labels group ([22 §3](../22-v1.2.md#3-blocks): A3, A4, A5, A6, A7).
These share `chart/labels.ts`, `holo.css` and the Solar plates, so they were built together.

## 1. What was built
- **A3. Star labels.**
  - A pod star, in the round and at the region's centre, carries `roleCounts` (objectives, threats,
    done) and `path` (new `ViewNode` fields).
  - The renderer words the counts in the Names toggle's register when it builds a graph (`nav.ts`
    `graphFor` → `wordCounts`): `12 asteroids · 4 hive ships` under Star Chart, the pack's
    `12 User Stories · 4 Bugs` under ADO. A zero part is dropped. The toggle redraws in place.
  - The wording itself is pure: `countsLine` in `engine/terminology.ts`.
  - No path on any star plate.
  - The region's star plate is now vertical: above its star, or below when a planet holds above, never
    beside it. It shows its counts at rest (`labelCompact` dropped).
  - A star's plate with no clear place may cross bodies, never another plate. Without this, Convoy's
    star lost its plate at the round's end.
- **A4. The details panel.** The pod's line is its counts by role and done count, in the toggle's words,
  then an *Area path* row with the full path.
- **A5. T4 Sky**, a fourth holo tier for both star plates:
  - title `#8ca6ad` (7.3:1 on ink, 4.9:1 over white), subtitle `#84a0a8` (6.7:1, 4.6:1);
  - a cyan frame at 0.36 and a dot at 0.5, no glow, weight 400, 11 px.

  It lifts like every plate.
- **A6. Role outlines.** An objective's plate frame, pointer and dot are Opportunity blue, and a threat's
  Deadly red, at rest and lifted, each with a glow of its own colour. This uses `HoloFrame`'s new `role`
  and `data-holo-role`. Titles keep the tier's text colours.
- **A7. Two-line titles.**
  - A holo plate's own title (not its rows) wraps onto a second line, then a line clamp ends it in "…"
    inside the plate's 10 px side padding.
  - The holo title cap is now `HOLO_TITLE_MAX_CHARS`, 82 characters, two lines' worth.
  - Short titles keep their width.
- **Gallery** *Label hierarchy*: T3 is now a homeworld sample; T4, an asteroid and a hive ship are added.
  The cell grows to its rows.

## 2. Contracts changed
- **`ViewNode`** gains `roleCounts` and `path` (03's view contract is described by the type; no 03 table
  names node fields). `meta` on a pod star is now the plain `N items` fallback.
- **15 §2** (palette-ui): new `--holo-objective-*` and `--holo-threat-*` rows; the `--holo-line` row now
  excepts a piece's plate.
- **15 §6:**
  - the holo-tiers prose and eight T4 rows;
  - the holo-variants rows for both star plates and the two piece plates;
  - label-values `HOLO_TITLE_MAX_CHARS`;
  - the type prose (T4's size, two lines).
- **06** (the visual brief): the hierarchy now has four tiers, and a piece's frame is its role's hue. The
  old "kept clear of the aura hues" is amended. This departs from v1.1's one-palette rule, as 22 A6 says.
- **13 §1:** the v1.2 rules (R8–R11) were added in Step 1.

## 3. Checks
- **Unit:** `npm test` passes (890).
  - `solarRound.test.ts`: a star's counts, its path off the plate, the region's star upright with counts
    at rest; `countsLine` in both registers, singulars, a zero part dropped, all zero.
  - `docTables.test.ts` passes. The literal fence holds: the shared wording names no theme word.
- **Goldens:** `solar.round.json` and `solar.scenes.json` (pod-sprint) and `meridian.*`, accepted on
  purpose. Each star's `meta` is now `N items`, and the goldens now record `counts`.
- **e2e:**
  - `solar.spec` (15): T4 on the round's stars; the counts follow the Names toggle and back; no path; the
    region's star T4, upright, counts at rest; a frontier piece's frame in its role's colour.
  - The new `solar-dense.spec` (2) on meridian-sprint: T4 and no path in the round; while playing at 2×,
    every title is at most 2 lines and inside its plate's padding (captains' pictures excepted).
  - The A7 guard fails with the old CSS: the long titles overflow by about 100 px each side.
  - `slice1`, `density`, `gallery-v1`, `solar-play` (36) pass, and keystone (38) passes.
- **Drive** `v12-dense`:
  - the round's plates read `28 asteroids · 9 hive ships` and `2 asteroids · 1 hive ship`;
  - the inspector reads `28 asteroids · 9 hive ships · 18 done` over the full path;
  - in play, "Reconcile convoy manifests against / customs declarations at every…" is on two lines.

## 4. Human gates
**HG-A-labels.** Judge these:
- T4 against T1–T3 at rest, especially whether the stars still read as cyan;
- the red and blue frames;
- the two-line titles;
- the star plates in the round and the region (unselected).

Where to look: `npm run gallery` → *Label hierarchy*, and `review/v1.2/v12-dense/` and `review/v1.2/gallery/`.

## 5. Known limitations and open questions
- The other plates still speak the source register ("Repository", "User Story #…"). Only the star counts
  follow the Names toggle, as decided.
- At pod-sprint's end Harbor's star plate stands below, since Juno's Rest holds above.
- The blue and red were brightened from the auras for a 1 px line; V5's balance question applies here too.
