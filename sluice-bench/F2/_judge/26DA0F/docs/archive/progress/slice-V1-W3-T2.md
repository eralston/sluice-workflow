# Slice V1-W3-T2: Todo and CRM packs

Built 2026-10-10, following [17 W3-T2](../17-v1-phases.md#w3-t2-todo-and-crm-packs) and
[14 §1.2, §1.3, §8](../14-architecture.md#8-how-to-remix). There are now two more domain packs,
both fixture-only, each with its own scenario. They're served under Solar only. v0 behaviour, the
SDLC pack and every golden are unchanged.

## 1. What was built
- **`config/packs/todo.mapping.json`** and **`config/packs/crm.mapping.json`**. Same shape as
  `config/state-mapping.json`, one type per role:
  - **Todo**:
    - Todo: objective, kind `story`. New, Planned, Someday (deferred), Doing, Almost Done, Done,
      Dropped.
    - Problem: threat, kind `bug`. Spotted, Confirmed, Fixing, Checking, Fixed, Dropped, Not a
      Problem (strike).
    - Checklist Item: step, kind `task`. Open, Started, Checked, Skipped.
  - **CRM**:
    - Deal: objective, kind `story`. Lead, Qualified, Proposal, On Hold (deferred), Negotiation,
      Verbal Commit, Contract Out, Closed Won, Closed Lost.
    - Escalation: threat, kind `bug`. Reported, Triaged, Working, Mitigated, Customer Review,
      Settled, Duplicate, Withdrawn (strike).
    - Follow-up: step, kind `task`. Scheduled, In Progress, Done, Cancelled.
  - Every state reuses a v0 stage key (`story.surveyed`, `bug.rejected`, `task.lit`, and so on).
    Its rung and flags equal that stage's on the ladder, so v0 views and v1 agree.
  - No raw state name is longer than 16 characters, and every category is one of the closed set.
  - Nearing states use category `Resolved`, not `InProgress`, so the pod-star aggregate
    (`podStage`) counts them as nearing.
  - `entities.attachment` gives the PR statuses SDLC's rungs: underway, accomplished, and off with
    ghost.
- **`src/shared/packs/todo/`** and **`src/shared/packs/crm/`**, each with `index`, `words` and
  `adapter`.
  - `index.ts` exports the pack, `TODO_MAPPING` / `CRM_MAPPING` (the JSON typed as `StateMapping`)
    and the thresholds. The thresholds live here because 17 lists no `thresholds.ts` for these
    packs.
    - **Todo (18 §5 A6):** `{ swiftDays: 2, wipK: 3, dayHours: 12 }`.
    - **CRM (18 §5 A6):** `{ swiftDays: 10, wipK: 4, dayHours: 12 }`.
    - Both packs keep the 3 + 3 crowd. Neither has `containerUrl`, since neither has containers.
  - `words.ts` follows 12's Todo and CRM columns:
    - **Todo:** Todo, Problem, Checklist Item, Context, Note, Reminder; Workspace, Week, List,
      Member, Unassigned.
    - **CRM:** Deal, Escalation, Follow-up, Account, Quote, Approval; Pipeline, Quarter, Territory,
      Sales rep, Unowned.
    - Each pack also names its rungs and its agent noun.
  - `adapter.ts` uses `contractMoves` for moves. Priority and focus stay v0's.
    - In the source register, a state change uses raw names ("Todo #30101 Planned → Doing"), and a
      PR's end uses the pack's own verb: a Todo note is "filed" or "discarded"; a CRM quote is
      "accepted, approved by …" or "lost".
    - Everything else is `describeMoves` in the register's words.
- **`src/shared/packs/all.ts`**: `PACKS = [sdlcPack, todoPack, crmPack]`.
- **`fixtures/scenarios/v1/todo-week.ts`**: *Juniper Household*. Work items are 30000+ and notes
  (PRs) 31000+, all on the repo `Home`.
  - The round is Week 41. The regions are House (the default) and Garden.
  - Seats: Hazel (the viewer), Bram and Odette.
  - The frontier: a Todo and a Problem. Odette picks up the Problem; the Todo is Dropped.
  - Also covered: a carry-over from Week 40, a Todo planned for Week 42, a reassignment, Someday
    and Not a Problem. One note is discarded and one is still open at the end.
  - Hazel earns Clear skies, Hat trick: landings, Swift passage, Steady hands, Clean landing and
    Wingman.
- **`fixtures/scenarios/v1/crm-quarter.ts`**: *Larch & Pine Trading*. Work items are 40000+ and
  quotes (PRs) 41000+.
  - The round is Q3 2026. The regions are North Territory (the default) and Coastal Territory.
  - Accounts are repos: Birchwood Mills, Osprey Freight, Quillon Dairy and Saltmarsh Outfitters.
  - The Discount Desk approves quotes (`approvedBy`), and a lost quote is `abandonPr`, alongside a
    Closed Lost deal.
  - Seats: Imelda (the viewer), Caspian and Noor.
  - Also covered: frontier leads, a carry-over from Q2, a reassignment, On Hold, Withdrawn and
    Duplicate.
  - Imelda earns Clear skies, Hat trick: landings, Steady hands, Clean landing and Wingman.
  - Both scenarios set `pack` and `mapping` on the built `Scenario`, using the spread
    `{ ...built, pack, mapping }`, so the builder isn't changed.
- **`fixtures/scenarios/v1/index.ts`**:
  - `v1Scenarios = [podSprint, todoWeek, crmQuarter]`.
  - The comment now says which paradigms serve what: SDLC under Sprints and Solar, the other
    packs under Solar only. This was a W1 gate follow-up.
- **`tests/unit/packs.test.ts`**: 16 new tests, 28 in all. For each demo pack:
  - **Registration and the bundle:** the pack is registered and named. The bundle carries the
    pack's own mapping. The mapping and the bundle both pass zod.
  - **Roles and rungs:**
    - Each type has its role and kind.
    - Every state has a rung, a closed category and a name of at most 16 characters, and its
      signal equals `signalOfStage` of its stage.
    - Each placed type reaches all 5 rungs, and the attachment statuses match their stages.
  - **Words and thresholds:** words cover every role it uses, every level and every rung. Its
    thresholds differ from SDLC's.
  - **The served round:**
    - Every event is moved, and ids stay in the pack's ranges.
    - No event state is unknown.
    - Every rung and every off-ladder mark (sketch, deferred, ghost, strike) is reached.
  - **Event lines:**
    - Source lines carry raw states and no SDLC words.
    - Chart lines are `describeMoves` and name no type.
  - **Projection:** both regions project through `SOLAR` at 5 playheads. The default region has
    the 3 seats and every board kind: star, seat, objective, threat, facility and captain.
  - **Awards:** the viewer's awards equal the designed set.
  - **Fixture mode**, through `src/main/fixtures.ts`:
    - Under `solar`, both workspaces list with their round and regions, and
      `loadFixtureHistory` serves the round with its `domainPack`.
    - Under `sprints` and `backlog`, they aren't listed.

## 2. Contracts changed
- No shape changed. The packs use `DomainPack` as it stands, and the mappings validate against
  `stateMappingSchema`. 02 and 03 aren't edited.
- **Follow-ups for W4-T3 (docs):**
  - 18 §5 A6 should record the two readings (Todo: 2 working days, K = 3; CRM: 10 working days,
    K = 4).
  - 03 §5d could list the two pack mappings, with their rule that states reuse v0 stage keys on
    the ladder.
  - 14 §1.2 could note that each demo pack's thresholds live in its `index.ts` (no
    `thresholds.ts`).

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 741 of 743 pass. The 2 failures come from other tasks still in flight, not this
    one:
    - `tests/golden/solar.test.ts`: mega-list rows now carry `subtitle.key`, the W3-T1
      container-key follow-up.
    - `tests/unit/facts.test.ts`: `PieceFacts` gains `parentAt`.
  - `packs.test.ts`: 28 of 28 pass.
- **Goldens unchanged**: `git status tests/golden` shows only other tasks' untracked files
  (`solar.*`, `v1-awards.*`, `v1-ingest.test.ts`). This task made none and changed none.
- **`npm run fixtures`**: wrote 14 bundles. `todo-week.week-41` has 75 events and `week-40` has
  2. `crm-quarter.q3-2026` has 85 events and `q2-2026` has 3. As with `pod-sprint`, the area
  default-scope bundles are empty.
- **The galaxies list in fixture mode under Solar, and their systems project**:
  - Checked by the unit tests above.
  - Also checked once in the app: a temporary e2e spec, run in the build lock and then deleted.
    Unpinned (Solar), it opened each workspace from the galaxy, then its round (stars House and
    Garden, or North Territory and Coastal Territory), then its default region. It saw no page or
    console errors, and pressed Space.
  - North Territory at its playhead drew 3 seats, 3 ships, 3 Accounts, 4 Deals and 4 Escalations.
- **Spec `solar`** (not required; run because the galaxy gained two projects): 2 of 2 pass.
- **Re-verified on resume (2026-10-12)**, with no code changes:
  - typecheck and lint are clean, and `npm test` passes 742 of 742.
  - `npm run fixtures` writes the same 14 bundles and event counts.
  - `git status tests/golden` still shows only other tasks' files.
  - Spec `solar`, which W3-T1 has since grown to 6 tests: 4 pass, 1 fails and 1 didn't run. The
    failure is in the SDLC `pod-sprint` "VC-2 and VC-3 in a solar scene" test: seats, threats and
    facilities overlap. That comes from W3-T1's in-flight layout work in `GraphScene` and
    placement. This task's packs don't touch layout.

## 4. Screenshots
There's no human gate. The temporary run left `/tmp/star-chart-pw/W3-T2/{House,North-Territory}.png`
and `*-play.png` (fixture data only), outside the repo.

## 5. Known limitations and open questions
- **The round view counts no items for these packs.** `sprints.ts` `podOrder` picks bodies by
  type name (`'User Story' || 'Bug'`), so the pod stars read "Area Path · 0 items" and their mini
  bodies are empty. Regions still open and project correctly.
  - `sprints.ts` is on 14's do-not-edit list.
  - A fix is to read kinds through `resolveState(h.stateMapping, type, '').kind`, or to give
    Solar its own round field source. This belongs to W3-T1 or a later task.
- **The UI chrome still uses Sprints and ADO words** ("SPRINT", "AREA PATH", "Assignees", "Star
  Chart | ADO") over a Todo or CRM board. The ObjectList already uses the pack's words ("Deals",
  "Todo"). The level words should come from `terminology(pack, …)` (W3-T1 or W4).
- **Fake ADO must not serve these scenarios.** W3-T1 adds `v1Scenarios` to the fake-ADO list in
  `main/index.ts`, and should filter it to `!s.pack || s.pack === 'sdlc'`, as
  `v1-ingest.test.ts` does. Their WIQL names SDLC types.
- **The default range covers only part of a quarter.** In the CRM run, the transport's playhead
  window ended on Sep 20, not at the quarter's end. A 92-day round may need the range picker, or
  a round-sized default range (W3-T1 or W4-T2 to judge).
- **Seat order is by key.** Every seat in both scenarios is first held on the first morning, so
  the tie-break (by key) orders them, not the authored order. The viewer isn't guaranteed the
  first seat.
- **The thresholds and the CRM pace are first guesses** for the user to review. For example, the
  pace rules are tuned for a two-week sprint, and a quarter's gaps are squeezed by the scheduler.
- **The CRM "guard" (Approval)** is named in the words but not drawn: the Discount Desk appears
  only as an approver, as 17 asks.
- **Person handles are unique across scenarios** (`hazel`, `imelda`, …). Person keys come from
  the handle alone, so a shared handle would give two scenarios the same identity key.
