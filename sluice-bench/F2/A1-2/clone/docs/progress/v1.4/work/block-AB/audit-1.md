# Audit blocks A and B, round 1 · Verdict: fix needed
Range: d39649b..09f4e78, items A1–A4 (8c95ec2, 36bd0a2, b5d041f) and B1–B4 (6055a5e, fa8ec69, 75fb4a7, c212105).
Method: git, grep and reading only (a C3 perf build was measuring on this machine; no e2e, drive, gallery, build or app run).

1. Major — B2's Features list opens on selection, and entering a pod selects its star. So in the first view of every pod, the
   star plate shows the whole open list (up to 8 lines) instead of B2's one line, and it stays open until another object is
   selected. Nothing in the app clears a selection by clicking empty sky. In that view, Quasar's open list covers
   `payments-sync` and `search-api` again, which is the problem B2 was built to fix. B2's tests and stills reach "rest" only
   by calling `select(null)` first.
   Evidence: `src/renderer/src/nav.ts:748` and `:981` push the entered scene with `selectedKey: at.ref.key`, and `:617`
   applies it. `src/renderer/src/chart/labels.ts:779` sets `featWantedAt` while `node.canonicalKey === this.selected`.
   `labelTiers.ts:44`: paused and selected is `expanded`, not compact, so `.is-compact .holo__features { display: none }`
   doesn't hide the list. It is hidden only while playing. `select(null)` is called only by Remove from View (`nav.ts:265`;
   `grep -rn "select(null)" src/renderer/src`). `tests/drive/steps/feature-row.ts:15` says "entering selects the star; rest
   means nothing selected", and `tests/e2e/demo.spec.ts:252` deselects before the rest assertions. `work/B1/pulsar-rest.png`
   (taken after entry) shows Pulsar Pod selected in In View and the Inspector. B2 review 1 saw that the opened Quasar list
   "covers those two plates while open".
   Acceptance line or rule: B2 Asked ("At rest, show one line") and acceptance line 2 (the star plate doesn't cover Quasar's
   `payments-sync` and `search-api` plates). These hold only in a state users don't reach on their own. Scope goal: "The
   chart rests quieter". This needs a decision. Either (a) the selection that scene entry makes doesn't open the list (open
   it on pointing and on a user's own select), or (b) entry stops selecting the star, or (c) accept as built and judge it at
   the final check. A fix for (a) belongs in `labels.ts`, with a demo case that enters a pod and asserts one line without
   calling `select(null)`.

2. Minor — 03's normative `PieceState` block doesn't list `awaiting` (B4) or `vacant` (23 C3). Both are on the contract,
   and 03's stage paragraph names them. B4's State line says it "amends 03: `PieceState.awaiting`", but only the stage grammar
   paragraph was amended. A2 rewrote this same block and didn't add `vacant`. `src/shared/engine/stageCode.ts:6` is the header
   both A2 and B4 edited: its grammar still ends at `[|sb=1]`, without `[|vc=1][|aw=1]`, and the next lines say fields are
   "written in that order". The `PieceState` sketch in 14 §2.4 (`docs/14-architecture.md:282`) is missing the same two fields.
   Evidence: `docs/03-contracts.md:782-784` against `src/shared/contracts/view.ts` (`vacant?`, `awaiting?`) and
   `docs/03-contracts.md:866,878`. In `git show c212105 -- docs/03-contracts.md`, the only edits are to lines 866 and 878.
   Acceptance line or rule: CLAUDE.md "02 and 03 are normative … update the doc in the same change". B4's State line.

3. Minor — The "2 vsyncs" budget doesn't stop the flip A3 set out to stop. It moves the flip to the hidden window's refresh,
   and 09 §7 now contradicts itself about which refresh that is. A3 recorded an 8.3 ms vsync on 2026-10-29: an 18.6 ms
   budget, and Pulsar at rest 25.1 ms misses it. B1 measured 16.7 ms on 2026-10-31: a 35.4 ms budget, and Pulsar at rest
   (p95 34.2 ms) passes it. B1's text still calls all three Pulsar assertions "known red". These are the same scene
   quantised to 3 frames at 120 Hz and 2 frames at 60 Hz, so which way the budget falls depends on the window, not the code.
   The scope's goal ("the frame budget (p95 ≤ 2 vsyncs) holds on Pulsar") inherits that.
   Evidence: `docs/09-signal-ladder.md:185` ("measured an 8.3 ms vsync (about 120 Hz), not the 60 fps it ran at from
   2026-10-27") against `:193` ("vsync 16.7 ms, budget 35.4 ms … at rest … 33.2 / 34.2 ms … stay soft and known red"). The
   block A note's "18.6 ms at 120 Hz".
   Acceptance line or rule: A3 Asked ("At 120 Hz the p95 flips between 17, 25.x and 33 ms"). Docs must match the
   measurements. Fix: in 09 §7, say the window's refresh varies by run and that the budget is judged at each run's measured
   vsync (the reports carry `vsyncMs`). Correct "known red" for rest at 60 Hz. Name the refresh, or C3's relative check, that
   the final check will judge Pulsar by. This sits with C3, which is editing 09 §7 and `perf.spec.ts` now.

4. Nit — In 15 §6's holo-tiers table, the T1, T2 and T3 `-line` rows still say "Frame and pointer at rest". Since B1, those
   tiers are drawn only when raised, and every plate rests at T4.
   Evidence: `docs/15-reference.md:659,667,675` against the paragraph above the table (`:647`, "At rest every plate is T4 Sky").

5. Nit — The fix for a sideways scroll is applied one way in one place and not in the other. A4 gave `.holo__rows`
   `overflow-x: hidden` because `overflow-y: auto` makes `overflow-x` compute to `auto`. B2's star list box,
   `.holo__feat-scroll`, has the same `overflow-y: auto` and no `overflow-x`. No overflow has been seen: the name ellipsises,
   and the count and `+N more` are short. If a narrow plate ever overflows, though, it would scroll sideways.
   Evidence: `src/renderer/src/chart/holo/holo.css` `.holo__rows` (A4) against `.holo__feat-scroll` (B2).

6. Nit — The block's items cite themselves four ways in the docs: "(A4)" bare in 06 §9, "27 B1"/"27 B2", "v1.4 A2"/"v1.4 B4",
   and B2's State line says "03's `FEATURE_ROW_CAP` row" when 03 has no such row (the change is the `featureLines` comment,
   `docs/03-contracts.md:777`). Bare "(A4)" sits among 22-series citations ("22 A6") in the same doc.
   Evidence: `docs/06-visual-brief.md:1288`, `docs/27-v1.4.md` B2 State.

Not findings (checked; settled by the item reviews or fine):
- A2 and B4 share the stage codec. `o=` is gone and `aw=1` follows `vc=1`. `FIELDS` order matches the encoder. `seatLook`
  still writes `.m0r0`, so a reused world view clears outcomes. B4's goldens move only by `|aw=1`.
- A4 and B1: an expanded station plate is raised (`expanded` raises), so A4's stat-line wrap and `scrollWidth` case run at the
  station's own tier. B1's `applyTier` re-measures on a tier change, and `render()` redraws at `label.drawn`.
- B1 and B2: the star's own tier is `sky`, so B2's open list never changes its tier. B2's open decision comes before
  measuring and placing, as B1's settle does. `render()` passes `label.drawn` to both.
- B3 and B4 treat transients the same way: wall time, cleared by a seek, scene entry or `settle`, nothing under reduced
  motion, and no change to the look at the playhead (INV-15).
- The docs B1 amended (13 R1, 15 §6 paragraph, 06 §9, 05 A-1, 12 glossary) agree. The piece glow rows in 15 §2 say
  "raised only".
- B2: 02 INV-10, 15 §6 `feature-row`, 06 §9, 13 and `tests/README.md` agree with `FEATURE_ROW_CAP` 1 and
  `featureLinesEver`. `fewerText` being dead was already found in B2's review.
- A3's 15 row went to §10, not §9 (settled in A1-A3's review). C4c has since moved it to the profile.
