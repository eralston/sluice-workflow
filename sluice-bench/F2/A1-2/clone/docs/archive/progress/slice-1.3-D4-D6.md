# Slice 1.3 D4-D6: Packs play and count, pack chrome, CRM range

## What was built
- **D4.** A region's scene keys (and the round's) come from its board facts for a non-SDLC pack: every piece with the
  objective or threat role, plus its subtree (`regionKeys` in `shared/hierarchy/solar.ts`). SDLC keeps `podOrder`, so
  ADO behaviour is byte-identical. Todo and CRM regions now have beats. `roundFacts` is untouched.
- **D5.** `shared/hierarchy/chrome.ts` (`chromeWords`) reads the pack's round and region words. Solar's vocab
  (`typeLabel`, `pill`, `enter.ado`, `playNounFor`), `labelOf` typeName, the region star's `typeName`/`detail`, the
  breadcrumb, player, inspector (fact label, "On the chart" line, sprint list heading) and the sibling menu group
  (`solarUi.ts`) speak Week/List (Todo) and Quarter/Territory (CRM). SDLC words are unchanged.
- **D6.** In fixture mode `rangeFor` asks for the sprint's whole dates; `ownClock` (`main/fixtures.ts`) now clamps the
  active scenario's too. The loaded range was already whole for v1 scenarios; the request and default were the
  default scenario's week (Sep 21, mid-Q3).

## Fix round (review)
- Inspector work-item facts, seat-why text and headings now use `chromeWords` (`item`, `regionSentence`, `region`; Epic
  row hidden for a pack). Empty inspector says `record` for a pack. `chromeWords` also gives `workspace` (crumbs' `Project`
  type), the round pill's switch wording (SDLC byte-identical: "Switch team", "Loading teams…", "Switch to another Area Path or Epic"),
  and the player gate's tip. `ProjectSummary.pack` (fixture mode only) lets the galaxy chooser use the pack's words before a bundle opens.
- **D6, honestly.** The cut path: the renderer's `rangeFor` asked for a sprint up to the *default* scenario's range end
  (quiet-week, 21 Sep), so a CRM quarter opened under the default fixture was *requested* to 21 Sep. The main process
  already re-clocked a non-active v1 scenario (`ownClock`), so the **loaded** bundle was whole even before my change: the
  new default-fixture e2e (range ends 2026-10-01) passes with and without the `rangeFor` change (I verified: it passes with
  it reverted). I could not reproduce a failing path, so D6's code change is a correctness tidy (the request is now whole too, and
  `ownClock` clamps the active scenario), not a visible fix. The status bar's "As of Mon, 21 Sep 2026" is a different cause: it
  shows the playhead's state at the end of play, which is the last beat (the CRM's last event is 21 Sep 14:00), not the range end.
  Left as is (by design, 05 §1).

## Contracts changed
03 §8 note: optional `h` on `LevelVocab` words, `playNounFor`, `crumbsOf(..., h?)`. 05 §8.2c, 14 §8, tests/README.

## Checks
Typecheck, lint and `npm test` pass (new `tests/unit/packsPlay.test.ts`); no golden moved. e2e `packs-play` passes
(stills in `review/v1.3/D/`: `crm-quarter-*`, `todo-week-*`).

## Human gates
HG-D: Todo and CRM regions playing with their own words (stills above).

## Known limitations and open questions
- Deliberately left (ADO-mode only, or the project plate's saved-Area-Path/Epic editors, which fixture packs don't offer
  through `addable`): "+ Area Path"/"+ Project" add button, the project plate's "Saved Area Paths"/"Epics" panels and Epic search,
  "Select a project to choose an Area Path or Epic", the Sprints/Backlog toggle tips in App.tsx, ADO-sync tips in Transport
  ("Ask ADO ..."), the object list's stale tip, "Disabled in fixture mode: ... ADO record" (fixture-only note).
- D6 has no failing-before test (see the fix round).
