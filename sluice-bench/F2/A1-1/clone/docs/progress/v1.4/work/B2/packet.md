# Packet B2: Star plate: one-line Features at rest
Risk: medium (the shared label layer's per-frame loop, like B1, which failed its first review on frame ordering; the probe settles the layout) · Score: blast 1, verify 1, design 1, acceptance 0, track 2
Start commit: 6055a5ebc4c4f2fbd7a59fde31fe34c6c2d6c76e

**The planner's probe** (`probe-oneline.ts` in this folder; output in `test-results/drive/b2-probe` and `b2-probe-early`).
It emulates a one-line row with CSS. Quasar at 1.0 of the session hides `payments-sync` and `search-api` today, and
shows both with one line. Harbor's plate sits `left` today, and sits `above` with one line, **but only when the plate
is placed fresh**. A plate that shrinks in place keeps the side it had, because of the `label.k` "keep the place while
it's clear" rule (`labels.ts:914`). So opening the list must never overwrite the resting place (Approach 5).

## Acceptance
- The Quasar case in `demo.spec.ts`: the resting star plate shows one Feature line and `+N more`, and
  pointing at it opens the list in place.
- At rest, the star plate doesn't cover Quasar's `payments-sync` and `search-api` plates (an overlap test).
- Harbor's star plate sits above its star.

## Approach
1. **`FEATURE_ROW_CAP` becomes 1** (`featureRow.ts:8`). Update the header and doc comments ("the top Feature, then `+N more`
   on the same line"). `featureRows` keeps its body.
2. **At rest, one line.** `+N more` sits at the end of the last shown line, not on a line of its own. In `featuresBlock`
   (`labels.ts:182–230`), when not open and `more > 0`, append a `span.holo__feat-more` (text `moreText(more)`) inside the last
   `.holo__feat` line, after the name, count and word. Make it plain text: no `role`, no `tabIndex`, no listeners.
   `used = shown.length`. When open, show every Feature in the scroll box (`FEATURE_OPEN_LINES`, as today), with no `+N more` and no
   `show fewer`. Pointing away closes the list, so the toggle has no job. Remove `FeaturesUi.toggle` and its use in `render()`,
   leaving `FeaturesUi = { open: boolean; word?: string }`. Set `box.classList.toggle('is-open', ui.open)`.
3. **The reservation follows.** `featureLinesEver` (`solarSource.ts:128`) returns `Math.min(FEATURE_ROW_CAP, n)`, because `+N more`
   no longer takes a line. Fix its doc comment. (Why not keep the extra line: the extra line is the height that hides the stations.)
4. **Open while pointed at or selected, plus a grace period.** Repurpose `Label.featuresOpen` as "the list is open now", and add
   `featWantedAt?: number`. In `position()`'s loop, after `el.style.display = ''` (`labels.ts:779`) and **before** the note block
   (`:813`, because `render()` clears `label.note`) and before the first measure (`:823`), add:
   `if (node.features) { if (key === this.pointed || key === this.selected) label.featWantedAt = wall; const open = wall - (label.featWantedAt ?? -Infinity) <= GRACE_MS; if (open !== !!label.featuresOpen) { label.featuresOpen = open; if (!open) label.openK = undefined; this.render(label); } }`.
   Here `key` is `node.canonicalKey`. The grace (`GRACE_MS`, 450 ms, already imported) stops flicker at the plate's edge.
   A History card's light (`hovered` without `pointed`) doesn't open the list. This keeps it to the scope's "pointed at or selected".
5. **"In place": opening holds the resting place.** Add `openK?: number` to `Label`. In the non-expanded, non-`under` placement
   branch (`labels.ts:910–927`), when `label.featuresOpen`:
   (a) if `label.k` is a valid index and `all[label.k]` is `inView` and doesn't collide with `near` (other plates; bodies are
   ignored, since the plate was opened to be read), use it.
   (b) Otherwise run the existing search, using `label.openK` in place of `label.k` for "kept" and writing the result to
   `label.openK`.
   **Never write `label.k` while open.** For an upright star the candidate keeps its edge at the star (`holoVerticalCandidates`
   anchors `above` by its bottom), so the plate grows away from the star and stays under the pointer. On close, the resting
   `k` comes back if it's still clear, and if it was never set (the plate opened selected on entry), a fresh search is run, which
   gives `above` on Harbor.
6. **A resting row adds height, not width** (`holo.css:242–252`). Add `.callout.callout--holo .holo__features:not(.is-open) { contain: inline-size; align-self: stretch; }`.
   The plate's width then comes from its title and counts, and the Feature name gives way to its ellipsis. Make `.holo__feat-more`
   `flex: none; white-space: pre; padding-left: 0.5em`, with no underline or pointer cursor. Delete `.holo__feat-more:hover` and
   the `align-self` on `.holo__feat-more`. Rewrite the comment block: one line at rest, the list opened in place when pointed at
   or selected. (Why: `.callout` centres its children (`styles.css:49`), so `stretch` is needed. Containment keeps a long Feature
   title from widening the plate into its neighbours.)
7. **Inspector** (`Inspector.tsx:158–176`): `PodFeatures` lists every Feature, with no button. The Inspector shows only while
   the star is selected, and then the plate shows the open list, so the two match (R3). With a cap of 1 it would otherwise show
   one line in a panel with room. Drop the `useState`, `featureRows`, `FEATURE_ROW_CAP` and `fewerText`/`moreText` uses that
   become unused. Rewrite the doc comment.
8. **Docs (the same change; this amends 02 and 03, so say so in the build record):** 15 §6 *The Features row* prose and its
   `Cap` row (`3` → `1`); 06 §9 (`:1268–1270`); 02 INV-10 (`:161–163`); 03 (`:777`); the `featureLines` doc comment
   (`view.ts:116–119`); `tests/README.md:84` and `:194`. See Excerpts for the wording. Edit only these lines: B3 and B4 also edit
   15, 06 and 03, in other places.
9. **The drive walk** `tests/drive/steps/feature-row.ts`: change "expanded" to hovering the star plate (no click), and fix its header.

## Files
- `src/shared/featureRow.ts`: all (35 lines).
- `src/shared/hierarchy/solarSource.ts`: 110–129.
- `src/renderer/src/chart/labels.ts`: 44–67 (`Label`), 174–230 (`FeaturesUi`, `featuresBlock`), 237–279 (`renderHoloPlate`),
  525–551 (`render`), 631–714 (`position`'s top: `wall`, `focus`, `othersPlaced`), 715–830 (the loop up to the first measure), 838–930
  (placement: `all`, the star's extra candidates at 877, and the kept-place branch at 910–927).
- `src/renderer/src/chart/holo/holo.css`: 242–252. `src/renderer/src/styles.css`: 48–55 (read only).
- `src/renderer/src/chart/holo/holoLabel.ts`: 109–124 (`holoVerticalCandidates`, read only).
- `src/renderer/src/panels/Inspector.tsx`: 13, 31, 158–176.
- `src/shared/contracts/view.ts`: 110–120.
- `tests/unit/featureRow.test.ts`: 30–45, 100–115.
- `tests/e2e/demo.spec.ts`: 76–90 (setup), 248–330 (the Quasar and Pulsar Features tests).
- `tests/e2e/solar.spec.ts`: 242–266 (Harbor's star plate).
- `tests/drive/steps/feature-row.ts`: all.
- Docs: `docs/15-reference.md:609–637`; `docs/06-visual-brief.md:1266–1271`; `docs/02-domain-rules.md:159–163`;
  `docs/03-contracts.md:776–777`; `tests/README.md:84, 194`.

## Excerpts
- **Scope (27 B2, Decided):** "At rest: one line, the top Feature and `+N more`. When pointed at or selected: the open list, as
  today. `FEATURE_ROW_CAP` becomes 1, and its 15 §6 row changes with it."
- **15 §6, to rewrite** (`:609–626`): "…the pod's **top three Features by piece count**, one line each… then `+N more` when there
  are others. Pressing `+N more` opens the rest in place (it does not select the star) and it reads `show fewer`… stays drawn when the
  pointer leaves. **What moves:** … On Quasar the four-line row already hides the labels of two stations near the star
  (`payments-sync`, `search-api`)… A busier region can put the star's plate to a side instead of above it (22 A3's "above" loses in
  Harbor)… The Inspector's pod body lists the same (*Features*, with the same button)… `min(4, Features ever + 1 when there are more
  than three)`…". New substance: at rest **one line**, the top Feature, then `+N more` on the same line; the row adds no width (the
  name gives way). Pointed at or selected (and `GRACE_MS` after), the plate opens the whole list in place: it holds its resting place
  and grows away from its star, over the work if it must, since it was opened to be read, and it takes its resting place again when it
  closes. The opened list shows at most eight lines and scrolls. There's no button. At rest it hides no station plate on Quasar and
  stands above Harbor's star (27 B2, 2026-10-31). The Inspector lists every Feature. Reservation: `min(1, Features ever)`. Keep the
  counting, order, colour and INV-10 sentences as they are.
- **06 §9 (`:1268`), now:** "names the pod's top three Features as quiet text (`Feature #123 · Title · 5`, then `+N more`, which
  opens the rest in place; the Inspector lists the same)". New: "names the pod's top Feature as one quiet line at rest (`Feature #123 ·
  Title · 5 +N more`), and opens the whole list in place when the star is pointed at or selected (27 B2); the Inspector lists them all".
- **02 INV-10 (`:161`), now:** "the region's star plate and Inspector name the pod's top three Features by piece count as text". New:
  "the region's star plate names the pod's top Feature by piece count as text at rest (and the whole list when pointed at or selected,
  27 B2), and the Inspector lists them all".
- **03 (`:777`), now:** "min(4, Features ever + (more than 3 ? 1 : 0))". New: "min(1, Features ever) (`FEATURE_ROW_CAP`; `+N more`
  shares the line, 27 B2)".
- **R4 (counts first, no reflow)** and **R9 (the drawn count is the true count):** `+N more` is `features.length − 1` at the
  playhead. A pod with a Feature at any point of the round keeps its one line, blank if needed.
- **Project lens, the effect where it's meant:** check on Halcyon's Quasar and Pulsar pods, not only the default scene.
- **B1 review, round 1 (the same loop):** "`position()` works out the tier before it decides the plate's rows, so a plate that
  collapses this frame keeps its raised tier for one frame". Decide the open state before this frame's measure and placement.

## Checks
- **Unit** (`featureRow.test.ts`): `FEATURE_ROW_CAP` is 1, and at rest `featureRows` shows one Feature with `more: 4` on five.
  Quasar's `featureLines` is `FEATURE_ROW_CAP` (1); Nova's is still 1.
- **demo.spec, the Quasar test** (retitle it "…names its top Feature and +N more on one line, and pointing at it opens the list in
  place (23 B3, 27 B2)"). First `select(null)`, pause, and move the mouse to (2, 2). Then check:
  - At rest: one `.holo__feat-name`, equal to `featureName(all[0])`.
  - `.holo__feat-more` reads `+${all.length - 1} more` and sits inside that `.holo__feat` line (`.holo__feat .holo__feat-more`).
  - The `.holo__feat-scroll` holds exactly one line (`clientHeight ≤ FEATURE_LINE_PX + 1`).
  - Record the plate's `data-side` and rect, and its width with `.holo__features` hidden (an evaluate that sets
    `display: none` on it, measures, then restores it). The width is the same within 1 px.
  Then `plate.hover()` (not on the scroll box). Check:
  - Every Feature shows, in order, and there's no `.holo__feat-more`.
  - `data-side` is unchanged, and the edge toward the star is within 1 px of the resting rect (the bottom for `above`, the top for
    `below`).
  - `selected()` hasn't changed.
  Then move the mouse to (2, 2), and `expect.poll` back to one name. Then `select(star)`: the list is open with the mouse away, and the
  Inspector's `li` count is `all.length`, with no button.
- **New demo case, the overlap test** (after the Quasar test): "at rest, Quasar's star plate covers neither payments-sync nor
  search-api (27 B2)". Call `select(null)` and move the mouse away. For f in 1, 0.5 and 0.2, seek `totalMs × f − 1`, then `settle`. Each
  station's `.callout--facility` (by its exact `.callout__title`) is displayed, and its rect doesn't intersect the star plate's.
  (At the start commit this fails at f = 1. The probe found both hidden there.)
- **demo.spec, the Pulsar test:** replace the `+N more` click with `select(star)` and the mouse away. Keep the 8-line box, the
  scroll and the in-view assertions. End with `select(null)`, so B1's next case starts clean.
- **solar.spec:252:** Harbor's star plate: `await expect(own).toHaveAttribute('data-side', 'above')` (it polls, so it allows for
  the grace after `select(null)`). Rewrite the B3 comment: "27 B2: one line at rest, it stands above". Keep the covered-body check.
- Run: `npm test`, then (with `.claude/sluice/with-lock.sh`) `npm run e2e:spec -- demo solar density slice1`, `npm run e2e:keystone`,
  and `GALLERY_FAMILY=labels npm run e2e:spec -- gallery-v1`. Look at it with `npm run drive -- tests/drive/steps/feature-row.ts
  --paradigm solar` and `POD="Pulsar Pod"`, and copy the four stills (rest and pointed, for Quasar and Pulsar) into this folder for
  the final check.

## Out of scope
- B1's tiers, and the placement of any plate other than the star's.
- A press on the resting Feature line: it's inside `.holo__feat-scroll`, so it doesn't select the star (`inRows`), as today.
- The round's stars (they carry no Features), and the Pulsar frame budget (C3).
- Refactoring `featuresBlock` or the expanded-rows machinery (`expand`, `growPlacement`). The star has no list and doesn't use it.
