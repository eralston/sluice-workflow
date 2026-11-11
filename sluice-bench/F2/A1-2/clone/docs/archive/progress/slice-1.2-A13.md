# Slice 1.2-A13: the dense-pod fixture

**Status:** built 2026-10-14. Block A's stress scene ([22 §3, A13](../22-v1.2.md#a13-a-dense-pod-fixture-built-first-every-other-item-is-checked-against-it)).

## 1. What was built
- **`fixtures/scenarios/v1/meridian-sprint.ts`**, a new SDLC scenario with invented names (INV-18), registered in
  `v1Scenarios`, so it is served under Sprints and Solar, and by fake ADO. It has:
  - Meridian Works' Sprint 7 over two regions: Convoy Planning Pod (`…\Fleet Operations\Logistics\Convoy
    Planning Pod`, the default) and Signals Pod;
  - 12 homeworlds in Convoy, holding 30 Stories and 9 Bugs (past the old preview caps of 24 and 5);
  - 9 titles of 60 characters and more;
  - the three empty-homeworld cases: Rook's Story moves to Signals, Tove's is handed to Hana, Ulla's is
    Removed;
  - a Bugs-only seat (Vash), Tasks-only and review-only guests (Pim, Quin), a frontier that empties, a
    carry-over from Sprint 6, a Deferred move to Sprint 8, and back-to-back work by Mara, Bram and Esme.
- **`tests/drive/steps/v12-dense.ts`**, the Block A tour. Each still's note lists the plates shown and
  each captain's distance from the nearest planet, in planet radii.
- **The `select(key | null)` test hook** (`testHooks.ts`): drives can clear or set a selection. Escape goes
  back a level, and a click on the sky keeps the selection.

## 2. Contracts changed
None. The test hook is test-only (03 §10).

## 3. Checks
- `tests/unit/meridian.test.ts` (new) checks the fixture's promises: 12 seats, more pieces than the old caps,
  the three empty cases and the Bugs-only seat, the long titles.
- `tests/golden/v1-ingest.test.ts` gains meridian's area and sprint scopes (AC-27). Sprint 6 needed work
  in it, hence the carry-over.
- `tests/golden/solar.test.ts` now runs over both rounds. It wrote `meridian.{plan,scenes,round}.json`;
  pod-sprint's goldens are unchanged.
- `npm test` passes (885). Typecheck is clean.
- The drive `v12-dense` passes, and reproduces the review on fixtures:
  - the 24/5 preview caps;
  - star plates cut off at the path's start;
  - the region's star labelled on its left;
  - three empty planets;
  - captains over planet surfaces;
  - a cast title clipped at both ends with no ellipsis ("econcile convoy manifests against custo").

## 4. Human gates
None of its own. It is the scene for HG-A-labels, HG-A-counts and HG-A-motion.

## 5. Known limitations and open questions
- All Convoy seats start on one instant, so their order is by key, not the person order in the file.
- A fifth Solar galaxy (Meridian Works) in fixture mode moved no existing test.
