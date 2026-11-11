# Packet E10: Late-day montage
Risk: medium (the shared director's forms in every Solar episode, behind a switch only the ledger turns off; unit tests and the ledger decide it, the e2e guard checks the notes) · Score: blast 1, verify 1, design 1, acceptance 1, track 1
Start commit: db74d6b

## Acceptance
- Unit tests (`director.test.ts`): under the cap, a routine repeat folds only in the tight end, never a
  climax, a `first` merge, an arc's merge, a progress beam or a volley; deterministic over the goldens.
- The montage guard (every montage beat names its cause) passes on every pod.
- The ledger: each pod's change; Comet reported against its ~60.8 s yardstick (judged live at the final check).

## Approach
What the planner measured at db74d6b (probes over `resolvePods()`): the director's estimate keeps exactly the beats
the schedule plays, on all six pods (same T, same p for every beat). Under the cap, the only routine repeats are the
monotony short forms (P-21): Comet none, Nova 2 (p 1/8 and 5/8, both outside the tight end), Convoy Planning 4 (p 7/9
and 1), Harbor 1 (p 1). So expect Convoy Planning and Harbor to fold and the rest not to move. Decisions:
1. **The tight end is a share:** new `RISING_TIGHT_SHARE = 0.7` in `playback/constants.ts` (after `RISING_FLOOR_MS`).
   A beat is in the tight end when `risingShare(p) <= RISING_TIGHT_SHARE + 1e-9`. That means p ≥ 2/3: the last third
   of the day turns, and on a sprint of three days or fewer only its last day. The `1e-9` is needed because
   `risingShare(2/3)` evaluates to `0.7000000000000001`. An episode with no day turn (T = 0) has no curve, so it has no
   tight end. Chosen over a p threshold because the Decided line says "a 15 §10 value read from `risingShare`".
2. **p is the schedule's chapter count.** New pure helpers in `playback/schedule.ts`, next to `risingMs`:
   `chapterPs(spans: readonly (readonly [UtcMs, UtcMs])[], tz): number[]` gives each played beat's p. Each span is
   [first event, last event]. A beat opens a day when `localDay(first) !== localDay(previous span's last)`, which is
   `layout()`'s test. p = (day turns at or before it) / T, and every p is 0 when T = 0. The second helper is
   `inTightEnd(p): boolean`. `layout()` is not refactored (E8's numbers must not move); a unit test proves the two agree.
3. **The director's step e2, Late-day montage** (`directorOf`). Give the inner `estimate` an optional
   `kept?: number[]`: it pushes each beat it keeps, just after its `durationMs <= 0` check. The first call,
   `let est = estimate(direction(), kept)`, records them. Then, after `rerun` is declared and before lever 1, when
   `late` is set: compute `chapterPs(kept.map((b) => [beats[b]![0]!.occurredAt, beats[b]!.at(-1)!.occurredAt]), tz)`.
   Every moment whose beat is in the tight end and passes `routine` folds to `'montage'`. Then `rerun()` if anything
   folded. This runs over the cap too, before the levers.
4. **One eligibility.** Factor lever 2's condition into `const routine = (today: Moment[], i: number) => i > 0 &&
   !climaxes.has(m.key) && form.get(m.key) !== 'progress' && m.variant !== 'first' && !m.arcMerge && !m.volley &&
   hasShort(m) && played(today[i - 1]!) === m.rule`, with `m = today[i]`. Step e2 and lever 2 both use it, so lever 2
   is a pure refactor and every current exclusion holds by construction.
5. **It is no lever.** It is not pushed to `pulled` (`Direction.levers`), and `LEVERS` is unchanged. B-23's dense test
   (`levers.length > 0`) must not turn Convoy Planning and Harbor dense.
6. **Over the cap, the lever runs as today.** Quasar and Pulsar still pull montage, which folds a superset of the
   tight end, so their Direction should be identical with and without step e2. A test asserts this.
7. **The switch:** `directorOf(..., volleys?, late = true)`, an 11th positional parameter in its existing style.
   `VolleyOptions.late?: false` passes it to `volleysOf`'s D0, so the volleys are measured on the pass that plays.
   `PacingOptions.lateMontage?: false` (the ledger's "before"; the app never sets it) reaches both calls in `pacing()`.
   The ledger gets `EngineInputs.lateMontage?: false`, passed through `scheduleOf` and added to its early-return test.
8. **Ledger:** add `BuiltItem.late?: true`. Every item without it runs both schedules with `lateMontage: false`, as
   `rises` does. New row `{ id: 'E10', name: 'Late-day montage', inputs: { lateMontage: false }, directs, sweeps, rises,
   late: true, estimateMs: 0 on all six pods }` (C2 never modelled it). `pacing-candidates.ts` is untouched, because its
   runs are `direct: false`.
9. **The guard covers every pod.** New `tests/e2e/montageBeats.ts` (no Playwright import) exports
   `MONTAGE_BEATS: Record<string, string[]>`: per pod label, the ISO `sourceUtc` of each played beat holding a
   plate-lit montage (`m.plate`). A unit test pins these lists to `planOf`, and `montage-names.spec.ts` walks each
   non-empty pod in a fresh app. Today's spec lists 5 of Quasar's **13** plate-lit beats, and Pulsar's 4 are unguarded.

## Files
- `src/shared/engine/director.ts` 1-14 (header: add step e2), 36-41 (`LEVERS`: unchanged), 65 (signature),
  144-153 (step e), 154-188 (estimate, rerun), 196-207 (lever 2), 243-258 (`VolleyOptions`, D0's call).
- `src/shared/playback/schedule.ts` 15-19 (imports), 125-130 (`risingShare`/`risingMs`: add the two helpers below),
  137-160 (`layout`'s first pass: the rule to mirror, read only).
- `src/shared/playback/constants.ts` 13-18: add `RISING_TIGHT_SHARE` with a doc comment.
- `src/shared/engine/maneuvers.ts` 851-870 (`PacingOptions`), 897-910 (`pacing().limelight`: both calls).
- `scripts/pacing-ledger.ts` 29-63 (`EngineInputs`, `scheduleOf`).
- `scripts/pacing-built.ts` 8-27 (`BuiltItem`), 121-131 (E8's row, the pattern), 135-150 (`buildBuilt`'s `base`).
- `tests/unit/director.test.ts` (all, 201 lines), `tests/unit/pacingBuilt.test.ts` 1-20, 136-147.
- `tests/e2e/montage-names.spec.ts` (all); `tests/e2e/solar-dense.spec.ts` 17-32 and `tests/e2e/allevents.spec.ts`
  8-23 (how to reach Convoy Planning and Harbor); `tests/e2e/montageBeats.ts` (new).
- `tests/golden/__golden__/director.json` (moves on purpose; see Checks).
- `docs/05-playback.md` 683 (B-23), 790-791 (P-23, P-24); `docs/15-reference.md` 1211 (after Rising tempo);
  `docs/03-contracts.md` 1455, 1468-1473; `tests/README.md` 93.
- Regenerated: `docs/progress/v1.4/pacing-ledger.md`, `pacing-ledger.json`, `pacing-built.json`.

## Excerpts
- 27 E10, Decided: "Under the cap too, a routine repeat folds to montage in the rising-tempo curve's **tight end**: the
  sprint's last working day, or its last third on a sprint long enough for the curve to say so (a 15 §10 value read
  from `risingShare`). Every current exclusion holds, so each day's climax and every hero shot stay full, and a montage
  still names its cause (R13; E5c's fallback note). Applies to every pod, Comet included. Over the cap, the lever runs
  as today."
- 27 Decisions, 2026-11-06: "Comet's yardstick is its current length, about 60.8 s ... judged by feel at the final
  check. If it feels rushed, rising tempo turns off for pods under the cap." (E8's ledger: Comet 60 795 ms.)
- Today's lever 2 (director.ts:196-207): "a non-climax moment that plays the rule of the one before it that day (not a
  `first` merge, not an arc's merge, not a progress beam, not a volley: a montage names no one) folds to a plate and a
  note".
- `layout()`'s day test (schedule.ts:150): `if (dayTurns && played && localDay(b.firstUtc, tz) !== localDay(played.sourceUtc, tz))`.
  `firstUtc` is the beat's first event and `sourceUtc` its last. p is `turnsSoFar / dayTurnCount`.
- `risingShare(p) = RISING_FIRST_DAY + (RISING_LAST_DAY - RISING_FIRST_DAY) * p` (1.1 to 0.5).
- B-23 (05:683): "**Dense** (over the director's target: it pulled any lever, P-23), every day turn is the floor".
- Project notes: "every constant with a row in `docs/15-reference.md` changes with its row, in the same edit"; "A
  departure [from 03] means amending the doc in the same change, and saying so in the run record"; "**The effect where
  it's meant:** check the change on the busy fixtures it's for (Halcyon's Pulsar and Quasar pods)"; "**Goldens:** update
  only the golden your item meant to move; check its diff line by line".

Doc rows to write:
- 05 P-24, Rule: append "**Late-day montage** (27 E10): in rising tempo's tight end (B-23: where `risingShare(p)` is at
  most `RISING_TIGHT_SHARE`, 0.7, the last third of the day turns or, on a sprint of three days or fewer, its last
  day), the same eligible repeats fold to montage even under the target, before the levers run. It is no lever: `levers`
  doesn't list it". Notes: add "E10: `directorOf` step e2, `chapterPs`, `inTightEnd`; `montage-names.spec.ts` covers
  every pod (`MONTAGE_BEATS`)".
- 05 B-23 Notes: replace "The montage threshold the item named is not scaled: there is none (P-24 folds a back-to-back
  repeat)." with "Its tight end (p ≥ 2/3, `RISING_TIGHT_SHARE`) also folds routine repeats to montage (P-24's late-day
  montage, 27 E10)."
- 15 §10, a new row after "Rising tempo": `| Late-day montage (new, 27 E10) | 0.7 | \`@shared/playback/constants.ts\`
  RISING_TIGHT_SHARE | Rising tempo's tight end: where a solar episode's share (B-23) is at most this (the last third of
  its day turns; on a sprint of three days or fewer, its last day), a routine repeat folds to montage even under the
  director's target (05 P-24) |`.
- 03 (normative; Touches doesn't list it, so say so): l.1468 `directorOf(..., volleys?, late?: boolean)` with "false:
  no late-day montage (27 E10), the ledger's before"; l.1455 `opts?: { windowMs?; guard?: false; late?: false }`;
  after l.1472 `PacingOptions += { lateMontage?: false }  // the ledger's "before"; the app never sets it (27 E10)`;
  after l.1473 `chapterPs(spans, tz) -> number[]; inTightEnd(p) -> boolean   // schedule.ts, pure (27 E10, B-23's p)`.

## Checks
In `tests/unit/director.test.ts`. A beat's p comes from the schedule: the played beats' `opensDay` count up to it,
divided by T. The tight end is `inTightEnd(p)`. A key's beat is the one whose `eventKeys` holds `key.slice(0, key.lastIndexOf('|'))`.
- Per pod: **the director's chapters are the schedule's.** `chapterPs` over the played beats' `[firstUtc, sourceUtc]`
  equals the `opensDay`-derived p for every played beat.
- Per pod, when `dir.levers` is empty: **compare with `{ lateMontage: false }`** (call it `early`; it must have no
  levers either). The keys of `forms` are equal, and `climaxes` are equal. For each key, today's form is `'montage'`
  exactly when `early`'s is `'short'` and its beat is in the tight end, unless early's plan for it is an arc's merge
  (`m.id === RULE.attachmentMerge && m.arc`) or a volley (`m.volley`). Every other key's form is unchanged. This one
  check is both "only in the tight end" and "every tight-end repeat folds".
- Per pod, the existing montage case: add `expect(m.volley).toBeUndefined()`.
- **Over the cap, as today:** on Quasar and Pulsar, `dirJson` of today's Direction equals that of `{ lateMontage: false }`.
- **The busy pods under the cap** (the effect where it's meant): on Quasar and Pulsar with `targetMs: 1e9`, both runs
  have no levers. Run the same comparison against `{ targetMs: 1e9, lateMontage: false }`, and expect at least one
  montage on each. This is where volleys and arc merges are actually excluded.
- **The guard's lists:** per pod, the sorted `sourceUtc` of the played beats holding a plan with `m.plate` equals
  `MONTAGE_BEATS[rp.label].map(Date.parse)`, or `[]` when the pod has no entry. Write this first and fill the lists from
  its failure output.
- Deterministic: the existing "two fresh builds" case. Update the director golden with
  `npx vitest run tests/golden/director.test.ts -u`, then check the diff line by line. Only Convoy Planning (expect
  `short` 4 to become `montage` 4) and Harbor (`short` 1 to `montage` 1) may change, in `forms` and `estimateMs`. Their
  climaxes stay the same, and Comet, Nova, Quasar and Pulsar must not change. If anything else moves, stop and explain.

`pacingBuilt.test.ts`: a new case, "E10, late-day montage: rows on all six pods, never costing time; Convoy Planning and
Harbor save; Comet unchanged within 5% of 60 795 ms". Also add `&& !x.id.startsWith('E10')` to the BEFORE_VOLLEYS
filter (otherwise the E10 rows join the fixed-row comparison and fail it). E1 to E8's rows must not move:
`pacing-built.json` only gains six lines' worth of E10 rows.

`montage-names.spec.ts`: one test per pod with a non-empty list, each in a fresh `launchApp`. Reach the pods this way:
- Halcyon (Quasar, Pulsar): `{ STAR_CHART_PARADIGM: 'solar' }`, dblclick "Halcyon Reach", then the pod.
- Convoy Planning: `{ STAR_CHART_PARADIGM: '', STAR_CHART_FIXTURE: 'meridian-sprint' }`, click "Meridian Works", then
  "Sprint 7".
- Harbor: `STAR_CHART_FIXTURE: 'pod-sprint'`, "Tidewater Array", then "Sprint 13".
Keep today's per-beat loop (seek, `stepBeat`, poll for a drawn `.holo__note` matching an annotation), with a 180 s
timeout each. Rewrite the header comment.

Run: `npm test` (the gate). The mapped tests are `director`, `golden/director`, `pacingBuilt`, `rising`, `volleys`,
`maneuvers`, `limelight`, `sweep`, `docTables` and `pacingCandidates`. Then run `npm run pacing -- --candidates`.
`pacing-candidates.json` must come out byte-identical. The Summary and Convoy Planning's and Harbor's tables move, and
Built gains E10. Then run `npm run e2e:spec -- montage-names camera-directs solar-dense solar-play` and
`npm run e2e:keystone`.
**If a montage beat doesn't draw its note** (new or pre-existing), stop and report the beat, the pod and a still in
this folder. Don't change `labels.ts`.

Record in `build-1.json`: each pod's E10 row (before, now, saved). Report Comet against 60 795 ms; it should be 0 s,
because it has no back-to-back repeat in a day. Also record each pod's plate-lit montage beat count, whether any volley
changed (Harbor's `joined`), and the 03 amendment.

## Out of scope
- `layout()`, rising tempo's numbers, `DIRECTOR_TARGET_MS`, the levers' order, and the dense test (B-23).
- Turning late montage off together with rising tempo. That is the human's fallback for Comet, not built here.
- `labels.ts` and the renderer's montage drawing (E5c), and E9's camera. A montage beat already returns the camera to
  the board.
- A montage form that finds no plate plays its short form. The guard covers only plate-lit beats, as today.
- The scope doc's State line (the orchestrator's).
