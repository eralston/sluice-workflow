# Audit block C, round 1 · Verdict: pass (four Minors worth one cheap fixer round before E)
Range: C1 edaa526, C2 ecac64c, C4a f318980, C4b e567dfe, C4c 7a79302, C3 a42a986 + 2cccce3 (the B commits between them
are left out). Read from the committed state (`git show`), not the working tree, where a block A/B fixer is editing.
Method: the packets, run records and reviews of C1, C2, C3, C4 (C4a to C4c); the diffs of every C commit; a HEAD snapshot
(`git archive 2cccce3`) in the scratchpad for the runs below. No e2e, drive or gallery run.

1. Minor: the `ornament` switch covers one of the two ornament gates. `ornamentOk` gates ornament **commands** and calm()
   (the recap, the dawn sweep, idle work, seed sparks), but the v1 interpreter's **maneuver** gate still lets the
   ornament-tier rule through. That rule is `agentLight`, light work and the only ornament-tier maneuver. It plays unless
   busy, and always at Maximum, the default activity. So on `tablet` and `phone` (ornament off), light work still plays,
   along with every narrative command it calls.
   Evidence: `src/renderer/src/chart/fx/v1/interpreter.ts:479-484` (`spawn`:
   `tier === 'narrative' ? v < OVERLOAD : v < BUSY`, and `eng.ignoreLoad` passes everything) against `:805` (`make`:
   `!ornamentOk(v)`). `src/shared/engine/pace.ts:524` (`RULE.agentLight, tier: 'ornament', light: true`). 05 P-9 and X-2
   state the two gates. 15 §11:1189 says only "ornament plays when the scene is calm". C4's packet listed the CALM sites
   only, so C4c built what it was asked. The gap is between the switch's stated meaning and the two-gate rule.
   Acceptance line or rule: C4 Decided ("feature switches for render cost (… effect tiers …)"), and the same rule handled two
   ways. It matters for E: HG-C's lever "light work for more rules" makes this gate carry more. Fix: either gate `spawn`'s
   ornament tier on the switch too, or say in 15 §11 (and 05 P-9) that the switch drops ornament commands only and light
   work follows the activity level. Decide which before E5.

2. Minor: C3 measured that the live rim ignores `RIM_ALPHA`, but the reference row and B3's contrast model still assume it.
   The fix kept the live look (correct), and 09 §7 records the finding. But 15 §8's `RIM_ALPHA` row still reads "The rim's
   least alpha", and `auraContrast.test.ts`'s nominal model multiplies every rim by 0.8. That model is the basis of B3's
   decision that gold's resting weight is 0.68, because only 0.68 lands within 10% of red and blue. With the measured alpha
   of 1, the same model puts gold 10.8% from blue, outside B3's tolerance. The live pixels still pass (gold 4.84 against red
   5.31 and blue 5.33, within 9.2%), so nothing a user sees is wrong. But the model and the row describe a renderer that
   isn't there, and 90-later carries the glow's clipping and not this.
   Evidence: `src/renderer/src/chart/art/aura.ts:493-495` (the comment: "Pixi does not apply the rim container's alpha through
   its filter … the live rim composites at full strength whatever RIM_ALPHA says"). `docs/15-reference.md:897`.
   `tests/unit/auraContrast.test.ts:32-35`. My recomputation of that model
   (`node docs/progress/v1.4/work/block-C/probe-rim-alpha.mjs ffc76b`): at alpha 0.8, red 3.47, blue 4.18, gold 3.78 (gold–blue 9.5%); at alpha 1, 5.12,
   6.26, 5.58 (gold–blue 10.8%). The alpha-1 numbers sit closer to the live pixels (5.3, 5.3, 4.8;
   `work/C3/profile-note.md`, "After the fixes"). `docs/90-later.md` "Role glow's reach" row.
   Acceptance line or rule: values live in 15 (a row must describe what the constant does). This is a B3 × C3 interaction.
   Fix: note in the `RIM_ALPHA` row that the live rim draws at full strength (27 C3). Note in the `auraContrast` header
   that its alpha is nominal, so the drive measurement is the check. Fold "the rim ignores `RIM_ALPHA`" into the 90-later
   glow row, so the re-tune covers both.

3. Minor: `profile.spec`'s second case is titled "the effects cap and ornament read the profile", but it only reads back
   the patched value. Nothing checks that the director's cap, the ornament gate or the twinkle switch acts. `tests/README.md`
   maps `profile` as covering "the effects cap, ornament, paint and twinkle switches". Only paint is asserted (`paintOn()`).
   Three of the four switches the non-desktop profiles turn off could regress silently. That includes finding 1's gate.
   Evidence: `tests/e2e/profile.spec.ts:43-54` (`setProfile({ render: { limits: { maxActiveFx: 3 } } })`, then
   `expect(profile().render.limits.maxActiveFx).toBe(3)`; no ornament or twinkle assertion). `tests/README.md:60`.
   Acceptance line or rule: C4 acceptance 3 ("changes what's drawn … as the profile says") is met by paint alone. This is
   the test claiming more than it checks. Fix: assert one effect each, for example with `maxActiveFx: 3` the census of live
   cuttable effects stays at 3 or under during a busy beat, `calm()` is false with ornament off, and the twinkle layer is
   hidden. Otherwise, narrow the title and the README row.

4. Minor: 03 and 14 lag the profile contract that C4b, C4c and C3 finished.
   - `docs/14-architecture.md:465-472` (14 §2.9) lists `switches { paint, twinkle, ornament }` (no `auraBake`) and ends
     "Nothing consumes it yet (C4b, C4c)". C4b and C4c read it everywhere now. C4c review settled the `MAX_ACTIVE_FX` prose
     in 03, 05 and 09, but not this.
   - `docs/03-contracts.md:1705` still declares `buildHighlights(h, range, tz, scene)`. The line above it (`:1702`, edited by C4b)
     says it takes "a trailing `budgetMs` argument". The code is `(h, range, tz, scene, hier = BACKLOG, budgetMs = DESKTOP…)`
     (`src/shared/playback/highlights.ts:67`).
   - `docs/03-contracts.md:1517` says `env` comes "from main's launch flags (§10)". §10 (`:1922`) lists only
     `--star-chart-test`, `-gallery` and `-devlog`, as test-only flags. The `--star-chart-profile=` argument is in every
     launch, packaged too, and is the main-to-renderer contract that replaced an IPC call. 03 never names it. 14 does.
   Acceptance line or rule: 03 is normative ("Departures from 02 and 03 are amended there"). 14 §2.9 is named in C4's
   Touches. Fix: update 14 §2.9's schema line and drop "Nothing consumes it yet". Give 03's `buildHighlights` its two
   trailing parameters. Name `--star-chart-profile=<encoded ProfileState>` in 03 (§6 or §10), as a production argument.

5. Nit: one cut, three numbers. 15 §11's Aura bake row and 09 §7 say "about 48%". 27's C3 State line and the HG-C Decision
   say 47%. The profile note gives 47% at 1× and 48% at 4×, then "47% gain" after the fixes. 09 §7 says 884 draws, and the
   note says 885. Evidence: `docs/15-reference.md:1190`, `docs/09-signal-ladder.md:193`, `docs/27-v1.4.md:262`, `:584`.

6. Nit: the cuts test's skip threshold is `1.25 * vsync` (`tests/e2e/perf.spec.ts:161`), but its log line says "already
   fits one vsync". The threshold also isn't beside the Cut gain floor row in 15 §10. The absolute test's titles and
   messages say "2 vsyncs", but the budget now comes from the profile (`frameVsyncs`: 3 on `phone`).

7. Nit: preload's fallback for a missing or unreadable launch argument reports `reason: 'parse'`, the code for "profile.json
   is not valid JSON" (`src/preload/index.ts:21`). Main treats an unreadable `profile.json` (permissions, a directory) as
   absent, with no notice (`src/main/profile.ts:15`). 15 §11 promises a notice for a broken override.

Not findings (checked; the fixer shouldn't touch these):
- **The committed ledger reproduces at HEAD.** In a `git archive 2cccce3` snapshot, `npm run pacing -- --candidates`
  rewrote `pacing-ledger.md`, `pacing-ledger.json` and `pacing-candidates.json` byte-identical to the committed files
  (Comet 67.3 s, Pulsar 702.0 s, Quasar 1080.5 s). So C1's and C2's numbers, which C1 and C2 generated from a tree with B4
  uncommitted, hold after B4, C4b and C3. HG-C's yardsticks (Comet 67.3 s) are sound.
- Unit tests on the snapshot: `profile`, `docTables`, `auraContrast`, `pacing`, `pacingCandidates` and golden `schedule`
  gave 6 files and 91 tests passed.
- **Profile values against docs:** all four JSONs match 15 §11's desktop table and every row of the deltas table, including
  C3's `auraBake` (off, off, on, on). The schema, override schema and test hook carry `auraBake` (derived from
  `renderSchema`). So a user's `profile.json` can set it, and an old override without it still parses.
- **Interaction C4b × playback (INV-15):** `scheduleFor` is the only renderer site that builds a schedule. The gallery's
  `maneuverDemos` and the pacing scripts default to `DESKTOP`, and the two scripts reach it two ways (`inputs.profile ??
  DESKTOP` against `buildScene`'s default) with the same result. `patchProfile` re-applies render switches only, never the
  pacing (test hook, documented).
- **Interaction C4c × C3:** both `ChartApp.applyProfile` and `aura.ts`'s module-level `onProfile` listener run on a flip.
  The cuts test sets `auraBake` back to false before the absolute test. `applyProfile`'s `setPaint(true)` is a no-op on
  desktop.
- **The grep acceptance:** no `BUDGET_MS`, `HIGHLIGHT_BUDGET_MS`, `MAX_ACTIVE_FX` or `VSYNC_TOLERANCE_MS`, and no
  `45000`/`30000` literal, in `src/` or `scripts/`. The two `volatility() >= CALM && waited < 4` waits are queueing, as
  decided.
- `laptop-battery` keeps `auraBake` off (the measured cost) while it turns off paint and twinkle (measured free). That is
  HG-C's explicit decision, not drift.
- C3's 1× hard check was skipped in three of four recorded runs. Reviews 1 to 3 settled that as the decided skip clause.
- Hard rules: `src/shared/` stays pure (zod and JSON imports only). `STAR_CHART_PROFILE` works only unpackaged. The dev log
  carries codes only. Fixtures only.

For later blocks: HG-C's 5 min target and E6's `VOLLEY_WINDOW_MS` belong in the profile's `pacing` (C4 Decided), not in
code constants. E5's and E6's planners should add the keys to the schema, the four JSONs and both 15 §11 tables.
