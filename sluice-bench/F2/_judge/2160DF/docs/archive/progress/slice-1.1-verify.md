# Slice 1.1-verify: the whole v1.1 build, checked together

Run 2026-10-14, after every item in [19 §3](../19-v1.1.md#3-items) had been attempted (L1, L2 with L5,
L3 and L4 with L1 and P1, L6, L7, L8, N1, P1, P2, S1, S2, M1; each has its own `slice-1.1-*.md`). This
note checks the combined working tree; it builds nothing new.

## 1. What was built
- Nothing new in the app. The combined tree passes every check on its first run, so no code fix was
  needed.
- Two small doc fixes found while checking:
  - `tests/README.md`: the `scenes/…` row now names `guidePresence.ts` and its unit test
    `guidePresence` (S2 added both; the README says it names every test file).
  - `docs/progress/handoff.md`: the v1 file map pointed at the retired `chart/megaLabels.ts`; it now
    points at `chart/holo/` (the one expandable plate, 19 L2).
- 19 §3 gains a *Verify* entry with its **State** line.

## 2. Contracts changed
None. Doc edits are the two above and 19 §3. Checked along the way, with nothing found:
- The v0 goldens and pixel baselines are unchanged. Only the Solar goldens moved:
  `solar.scenes.json` (L7, M1, accepted deliberately with `-u`) and the new `solar.round.json` (P1).
  `slice1.spec.ts` VC-2 now also asserts that v0 shows navy plates and no holo plate (19 R1), and it
  passes.
- None of the art files the art effort owns (`chart/art/{worlds,asteroids,swarm,dreadnoughts,fleet}.ts`,
  `gallery/v1/*.ts`) are edited. Only `chart/art/aura.ts` changed, which S1 was allowed to change.
- The new `src/shared/` files (`hierarchy/solarRound.ts`, `scene/project/preview.ts`) import only
  shared modules.
- No `console.log`, `debugger` or `.only(` in the diff, and no leftover `tmp-*` drive steps (P1's
  lint errors from S1's `tmp-s1.ts` and `aura.ts` are gone).

## 3. Checks

| Check | Result |
|---|---|
| `npm test` | Pass: 56 files, 873 tests (incl. `docTables`, goldens `solar`, `scenes`, `seek`). Re-run after the doc edits: pass |
| `npm run typecheck` | Pass (node, web and e2e configs) |
| `npm run lint` | Pass, no errors or warnings |
| `npm run e2e`, `[parallel]` | 144 passed (4.8 min) |
| `npm run e2e`, `[alone]` (`perf`, `slice1` with VC-1 pixel baselines) | 21 passed (1.9 min). perf: `dense-system` and `dense-body` mean 8.33 ms, p95 ≤ 9.2 ms, paint cost 0 ms |
| Flaky or retried tests | None. The two intermittent failures noted earlier, L6's dreadnought expansion in `solar.spec.ts` (L8's note) and L7's *pieces are hover-only* (P2's note), both passed in this run. They are still worth watching |

## 4. Human gates
No gate of its own. These are still open and waiting on the user (see each item's note for stills and
the moment to watch):
- **HG-L1**, the label hierarchy: [slice-1.1-L1.md](slice-1.1-L1.md) §4 (`tests/drive/steps/v11-L1.ts`,
  and the gallery's *Label hierarchy* cell).
- **HG-P1**, the round's previews at first look and after history: [slice-1.1-P1.md](slice-1.1-P1.md) §4
  (`v11-P1.ts`). The question of counting Off pieces is open there too (19 §5).
- **HG-M1**, a station on standby: [slice-1.1-M1.md](slice-1.1-M1.md) §4 (`v11-M1.ts`, crm-quarter's
  North Territory). Options B and C wait on it.

## 5. Known limitations and open questions
- One clean full run doesn't rule out the two intermittent tests above. If either fails again, start
  with L8's note §5: the L6 test passed 4 of 4 with a 400 ms wait after `pointAt`.
- Nothing is committed. CLAUDE.md asks for one commit per slice once its checks pass, and this run is
  told not to commit, so the whole v1.1 tree is uncommitted, waiting on the user.
- Each item's own open questions and limitations stay in its note. None were re-opened here.

## 6. Whole-change audit fixes (2026-10-14, second pass)
A fresh audit of the combined tree found 15 issues (2 medium in code and docs, the rest low). Fixed:
- **Subtitle order (medium, 19 P1, R3).** `.holo__meta-head` lays out right to left so a long path gives
  way from its start, and the bidi algorithm then moved a leading number to the end: a pointed
  galaxy read `areas 2 · 136 events this week`. `holo.css` now puts a left-to-right mark at each end of
  the head (`::before`, `::after`), so the start-side ellipsis stays and the DOM text is unchanged.
  `solar.spec.ts` (galaxy test) now compares the rendered x of the count and its word; it fails
  without the fix (`623.9 < 593` expected) and passes with it.
- **Docs (medium).** `handoff.md`: the v1.1 row says built, uncommitted, waiting on HG-L1, HG-P1 and
  HG-M1, with links to every note; the status line notes 19 S2 retired the threat light; dated
  2026-10-14. 13 §9's *Containers* row and 01's Solar paragraph no longer say a Feature is a station's
  row subtitle (since L6 a station's rows are its PRs).
- **Low, docs:** 19's header, §2 heading and its closing paragraph say §2 is decided (Q1) and built by
  L1, waiting on HG-L1; L4's State reads *Built (with L1 and P1)*; P2's State and §5 record that a
  Feature's History card still uses the star glyph under Solar (left for HG review); §5 records that
  no round source sets `loadMore`, so `SOLAR_PLATES.sprint.overflow` is held (kept so a future Load
  more is holo, not navy) and its 15 §6 row says so. 06 §9 says *the Title tier (`title`)*, not
  *compact*. Comments in `theme/starChart/index.ts` and `shared/packs/sdlc/links.ts` no longer claim a
  container subtitle (links.ts: nothing calls it since L6).
- **Low, gallery:** the *Label hierarchy* cell's T3 sample reads `Tidewater Array\Harbor Pod · 16 items`.
- **Low, guard:** `solar.spec.ts`'s galaxy, round and region tests assert no `.callout` without
  `callout--holo` (no navy plate anywhere in Solar, R1).
- **Low, labels.ts:** a plate shown only because a maneuver casts its piece (`Label.castOnly`) no
  longer takes `pointerenter`/`pointerleave`, so it can't hand itself to its host and flicker under a
  still pointer (it still takes presses). A pointed seated piece is *spoken* by its host only when the
  host's plate is near the view (`shown`); otherwise it keeps its own plate. Not reproduced before the
  fix (both came from reading the code); the L7 specs pass after it.
- **Low, per-frame allocation:** `CastLabels.now()` returns a shared empty map when no window is open
  (now `ReadonlyMap`); `LabelLayer.position` builds `expandedNow` without spreading every label.

Skipped: `GraphScene.stepGuides`' per-frame `guideMembers` set. Caching it needs invalidation on the
belt's list, the held members and the leaving count, and perf shows no cost (below). Left for later.

| Check | Result |
|---|---|
| `npm test` | Pass: 56 files, 873 tests (incl. `docTables`) |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass, no errors or warnings |
| `npm run e2e:spec -- solar` | 20 passed (solar, solar-play) |
| `npm run e2e`, `[parallel]` | 144 passed (4.6 min) |
| `npm run e2e`, `[alone]` (`perf`, `slice1` with VC-1 pixel baselines) | 21 passed (1.9 min). perf mean 8.32 to 8.34 ms, p95 ≤ 9.9 ms |
| Goldens | None changed (no `-u`); v0 goldens and pixel baselines untouched |
| Flaky or retried | None |
