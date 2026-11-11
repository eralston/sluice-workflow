# Packet B1: Resting plates at T4 Sky
Risk: large as it stands, medium once the human takes option A (it touches every Solar label, and the perf line can't be met by this design) · Score: blast 1, verify 1, design 2, acceptance 1, track 1 (sum 6; with option A, design 1, sum 5)
Start commit: 22bde78c5aae046aef472a0bf749f78ce91428dc

**Held for the human before building (plan-1.json `needs: "human"`).** Acceptance line 4 (Pulsar's playing
p95 ≤ 2 vsyncs, now a hard check) rests on the scope's claim that T4's missing filters are the saving that
brings Pulsar inside the budget. The planner's probes say they aren't. In the e2e-style hidden window (8.3 ms
vsync, so an 18.6 ms budget), Pulsar plays at p50 33 ms and p95 50 ms at both 1× and 4×. That doesn't change
with every holo filter and text-shadow forced off, with the whole label layer hidden, or with the label layer
hidden and paint off. The main thread is busy only 7–11 ms a frame, so the cost is GPU or compositor work in
the Pixi scene, not the plates. (Probes: `probe-filters.ts` and `probe-cost.ts` in this folder; output is
under `test-results/drive/b1-probe`, `b1-cost` and `b1-cost-hidden`.)
- **A (recommended):** build B1 for lines 1–3. Keep the Pulsar p95 assertions soft (known red), and record
  before and after numbers in 09 §7. Move the hard budget to a new item that profiles the GPU side of the
  Pulsar scene.
- **B:** widen B1 to find and cut the GPU cost. The design is open, and the item becomes large and needs a re-plan.
- **C:** keep line 4 and accept that it stays red.

The rest of this packet assumes A.

## Acceptance
- WHEN a pod is paused with nothing pointed at or selected, THE plates SHALL all be `data-holo-tier="sky"`
  (a new e2e case).
- WHEN an object is pointed at or selected, ITS plate SHALL take its asset's tier, and return to `sky` when
  released (the same spec).
- WHEN playback emphasizes an interaction, ITS plates SHALL rise for the interaction's hold (the attention
  case in `solar-dense.spec.ts`).
- Pulsar's playing p95 is ≤ 2 vsyncs at 1× and at 4× (`perf.spec.ts`, now a hard check, not a soft one).
  **(Held: see above. Under A, it stays soft, and the numbers are recorded.)**

## Approach
1. **One rule, pure.** In `chart/labelTiers.ts`, add `RaiseState { pointed; selected; followed; expanded; cast; acting }`
   (all booleans) and `raisedTier(own: HoloTier, s: RaiseState): HoloTier`, which returns `own` if any flag is true and `'sky'`
   otherwise. Import `HoloTier` as a type only. (Why here: it's the module of pure label rules, and it has a unit test.)
2. **Rename `restingTier` to `ownTier`** in `labels.ts:167–170`, keeping its body. A station on standby is still `place` when it's raised.
   Fix its doc comment: "the tier a plate rises to".
3. **The layer owns the drawn tier.** Add `drawn?: HoloTier` to `Label`, and add `private applyTier(label, tier)`. If
   `label.el.dataset.holoTier !== tier`, it sets the attribute and clears `label.w`, `label.h` and `label.ink` (T4's title is 11 px,
   so the plate is measured again). It always calls `label.holo.setTier(tier)` and stores `label.drawn`. Skip labels with no `holo`.
4. **Per frame, before any early `continue`,** at the top of `position()`'s loop (`labels.ts:700`, before line 711's hides and
   waits, so a hidden plate settles to sky too), compute
   `raisedTier(ownTier(node, label.holo.spec), { pointed: key === this.pointed || this.hovered.has(key) || pk === hostPointed,
   selected: key === this.selected || pk === hostSelected, followed: key === this.followed, expanded: !!label.rows?.attached,
   cast: (motion?.cast?.get(pk) ?? 0) > 0, acting: !!motion?.crew?.has(pk) })` and call `applyTier`. `hovered` already covers
   a row lighting its objects. `cast` and `crew` are the P-6 attention slots, and both fade to empty on the wall clock when
   paused (`castLabels.ts` `now`, `crew`).
5. **`renderHoloPlate` gains a last optional parameter, `tier?: HoloTier`** (default `ownTier(node, spec)`, so the gallery is
   unchanged). `render()` passes `label.drawn ?? 'sky'`, and calls `label.holo.setTier(label.drawn ?? 'sky')` instead of line 546.
   No plate flashes its own tier on a redraw.
6. **The planet name's ink cache** (`labels.ts:915`): add `label.el.dataset.holoTier` to the sig string, so the scene-drawn name
   follows the tier.
7. **T4 means no filters at all (`holo.css`).** Split the role rules (`:93–98`): the role's `--h-line` and `--h-dot` apply at any
   tier, and the role's `--h-frame-glow` moves to `.holo[data-holo-role='…']:not([data-holo-tier='sky'])`. A piece resting at T4
   then wears its colour with no `drop-shadow`. The lifted role rules (`:105–110`) stay as they are.
8. **A quiet galaxy (`holo.css:184`)**: add `:not([data-holo-tier='sky'])`, so a quiet title at rest is never brighter than
   T4. (At rest, quiet and active galaxies look alike. That's a limitation to show at the final check.)
9. **`holoLabel.ts:32–38`**: the `HoloTier` doc says "How loud the plate is *when raised*; every plate rests at T4 Sky (27 B1)".
   The constructor's initial `spec.tier` stays (the gallery relies on it, and the layer overrides it before the first show).
10. **Gallery**: in `labelHierarchy.ts:255`, change only the note: "Each tier raised (on the chart every plate rests at T4 Sky,
    27 B1), lifted and in play…". Don't touch the layout.
11. **Docs** (the same change): amend 13 §1 R1, 06 §9's hierarchy bullet, 15 §6's holo-tiers prose and three rows, 15 §10's
    standby-dim row, and 09 §7's Pulsar numbers (see Excerpts for the wording to replace). This amends R1 and 15 §6, and is
    called out in the build record.
12. **Perf (under A)**: run `perf.spec.ts` on a quiet machine before the change (stash nothing; take numbers at the start
    commit) and after it. Record both, dated, in 09 §7. Keep the `expect.soft` lines as they are, and change only the comment
    that says "until B1" (`09 §7` line 193, and wherever the spec says it).

## Files
- `src/renderer/src/chart/labels.ts`: 44–67 (`Label`), 92–115 (`LabelMotion`), 167–170, 230–277 (`renderHoloPlate`),
  385–431 (`sync`), 496–523 (`lightFrame`, `setHighlight`), 525–551 (`render`), 602–613 (`inkOf`), 615–720 (`position`'s
  top and the early hides), 745–766, 910–918.
- `src/renderer/src/chart/labelTiers.ts`: 1–48.
- `src/renderer/src/chart/holo/holoLabel.ts`: 32–41, 246–270.
- `src/renderer/src/chart/holo/holo.css`: 13–110, 183–184, 259–262.
- `src/renderer/src/chart/fx/v1/castLabels.ts`: 85–130, 190–210 (read only: how `cast` and `crew` fade when paused).
- `src/renderer/src/gallery/labelHierarchy.ts`: 1–8, 250–257.
- `tests/unit/labelTiers.test.ts` (add cases).
- `tests/e2e/demo.spec.ts`: 76–82, 301–333 (new case after the Pulsar Features test).
- `tests/e2e/solar.spec.ts`: 150–160, 316–325, 612–625.
- `tests/e2e/solar-dense.spec.ts`: 295–348.
- `tests/e2e/perf.spec.ts`: 82–90, 155–163 (comments only, under A).
- Docs: `docs/13-game-design.md:38`; `docs/06-visual-brief.md:1105–1114`; `docs/15-reference.md:94, 98, 641–651, 672` (the
  `--holo-t3-title` row), and 1132; `docs/09-signal-ladder.md:184–193`.

## Excerpts
- **Scope (27 B1, Decided):** "A plate at rest draws at T4 Sky. It rises to its own tier while its object is pointed at,
  selected, followed, or emphasized by playback (an interaction's attention slots, P-6), and settles back afterwards. The
  counts (R4) and the name stay readable at T4. R1 and 15 §6 are amended: a tier now says how loud a plate is *when raised*.
  T4 plates have no filters…"
- **Decision 2026-10-31 (B1-Q1):** "at rest, captains' plates drop to T4 Sky like every other plate; a captain rises when
  named in play, pointed at, selected or followed. Judge at the final check."
- **Decision 2026-10-29 (A3):** "Every Pulsar p95 assertion stays soft, known red, until B1 makes them hard; the re-measure
  is at the end of the block on a quiet machine."
- **05 P-6:** "At most `ATTENTION_MAX` (4) labels at once, counting the pieces' plates the interactions light … and the
  captains they name (their flying crew, K-4) … each holds its place for its length". In code, `LabelMotion.cast` (the pieces)
  and `LabelMotion.crew` (the named captains).
- **13 §1 R1 (now):** "Every chart label in Solar is a holo plate, balanced by a hierarchy of contrast and saturation (19 §2);
  no new legacy navy plates". Append: "Every plate rests at T4 Sky; its tier is how loud it is when raised: pointed at, selected,
  followed, or named by playback (P-6) (27 B1)."
- **15 §6 (now):** "Every holo plate carries a tier (`HoloSpec.tier`, the plate's and frame's `data-holo-tier`) that sets how
  loud it is at rest … A station on standby … is drawn at T3 until its next PR wakes it (`restingTier`). Pointed at (the object
  or its label), lit from a list, or selected, any plate is **lifted**…". Rewrite it: the tier is how loud the plate is when raised
  (the triggers above); at rest every plate is T4 (no glow, no filter, a piece keeps its role colour unglowed); raised, a
  standby station is T3 (`ownTier`). Rows: `--holo-t3-title` "a quiet galaxy's title when raised"; `--holo-objective-glow`
  and `--holo-threat-glow` "…frame glow, raised only (none at T4)". 15 §10 line 1132: "its plate drops from T1 to T3 (§6)"
  becomes "raised, its plate is T3, not T1 (§6)".
- **06 §9 (now):** "Each plate has a tier: **T1 Lead** … **T4 Sky** …". Add: "At rest every plate is T4 Sky; it rises to its
  tier while pointed at, selected, followed, or named by playback, and settles back (27 B1, 2026-10-31)."
- **Project lens, frame budget:** "Any per-object filter or extra pass needs a before-and-after perf run
  (`tests/e2e/perf.spec.ts`)." **The effect where it's meant:** check on Halcyon's Pulsar and Quasar pods.
- **Hard rules:** fixture data only (INV-18); keep `src/shared/` pure (nothing here goes in it).

## Checks
- **Unit** (`tests/unit/labelTiers.test.ts`): `raisedTier` returns `'sky'` with every flag false; each flag alone returns `own`;
  and `ownTier` of a standby station's spec, raised, is `'place'`.
- **New e2e case** (`demo.spec.ts`, in "the Halcyon Reach demo", after the Pulsar Features test): enter Pulsar Pod if not
  there; `select(null)`; close the Features list if the test before left it open; pause at 0.5 of the session; move the mouse
  to a corner of the canvas. Then `expect.poll` until every `.callout--holo[data-holo-tier]` and `.holo[data-holo-tier]` reads
  `sky` (allow `CAST_LABEL_FADE_MS` for fades). Point at a drawn captain (as `solar.spec.ts`'s `pointAt` does, by `displayed()`):
  its `.callout--captain` plate and its frame read `lead`. Move away: `sky`. `select(<a seat's key>)`: its `.callout--seat` reads
  `place`. `select(null)`: `sky`.
- **solar-dense attention case** (line 295): per sample, record any plate with a `.holo__note` whose `data-holo-tier` isn't
  `door`, any `.callout--captain.is-acting` that isn't `lead`, and any visible `.callout--seat`, `--star` or `--facility`, or
  a non-acting captain, that isn't `sky`. Expect the list to be empty (`wrong.slice(0, 5)` style). Retitle it "… (22 B5–B8, C10;
  27 B1)".
- **solar.spec** updates: `:155` the galaxy at rest reads `sky`, and pointed at, `door` (retitle it); `:320` the seat at rest reads
  `sky`, and expanded, `place`; `:617–620` every station at rest reads `sky`; pointing at Birchwood Mills gives `place`, and pointing
  at Quillon Dairy gives `lead`.
- Run: `npm test`, then `npm run e2e:spec -- demo solar solar-dense slice1 gallery-v1`, and `npm run e2e:keystone`. Run
  `GALLERY_FAMILY=labels` for `gallery-v1`'s label cells. Run `npm run e2e:spec -- perf` before and after, alone, on a quiet
  machine, and record the numbers. Look at Pulsar with `npm run drive -- docs/progress/v1.4/work/B1/probe-filters.ts --paradigm
  solar` (its census shows the tier counts). Save one still of Pulsar at rest and one while playing in this folder for the
  final check.

## Out of scope
- Any GPU or Pixi-side cost in Pulsar (the follow-up item under A).
- B2's one-line Features at rest, and the star plate's layout.
- Placement or collision changes. A plate re-measured on a tier change keeps its place if it's still clear (the existing `k` rule).
- Stations and planets rising when a maneuver plays at them: P-6's slots are pieces and captains only.
- Raising on a flash (`flash()`, v0 Tasks): no holo plates use it.
