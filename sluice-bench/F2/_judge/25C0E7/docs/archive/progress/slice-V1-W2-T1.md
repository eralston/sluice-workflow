# Slice V1-W2-T1: Solar projection and mega-lists

Built 2026-10-10, following [17 W2-T1](../17-v1-phases.md#w2-t1-solar-projection-and-mega-lists) and
[14 §2.3–2.5, §3 step 5, §4](../14-architecture.md#4-determinism-and-seek-stability). A solar region
is now drawn by `projectSolar`, not the v0 pod-system fallback. Until W2-T3's assets and W3-T1's
wiring land, the renderer draws the new kinds with its v0 default view (a pin). v0 chains, their
goldens and their schedules are unchanged.

## 1. What was built
- **`src/shared/scene/project/solar.ts`**: the real projection.
  - **Star**: at the plan's centre (r 240), with the v0 pod aggregate look.
  - **Seats**:
    - Every seat is drawn at every playhead, as a `seat` node (`asset: 'seat'`) on its fixed orbit,
      with one orbit edge from the star.
    - `piece`: `share` is the fraction of what the seat holds now that is Accomplished (Off pieces
      don't count). `outcomes` counts landed objectives (`m`) and defeated threats (`r`).
    - The rung is aggregated the way a pod's star is: all done, ≥ ¾ nearing or done, anything
      moving, otherwise ready. The category is the rung's closed category.
    - The projection key is `scene|person|seat`. The ship keeps `scene|person|ship` (D1).
  - **Pieces**:
    - Each objective and threat is drawn at the slot of the seat the facts say holds it at the
      playhead, or at its frontier slot while unassigned.
    - Its look comes from the snapshot: `resolveSignal`, the category, and `steps` (n/a/c in the
      facts' first-bind order, Off steps dropped).
    - **`steps` is left unset when there are none**, so identical looks give one stage string. This
      settles the open builders question.
    - Resting looks follow 14 §4: a landed objective is hidden and counted on its seat; a defeated
      threat rests at its slot; an Off piece is a ghost.
    - A formation member gets `cluster {id, index, size}` and `labelOnHover`.
    - Built with `workNode`, so `meta`, `meta2`, `openable`, the flags and the evidence match v0.
  - **Facilities**:
    - Each appears from its `enterAt` and stays. Node kind `facility`, `asset: 'facility'`.
    - `compound.slots`: the first-fit slots live now, plus the guards (rung ready). An attachment
      is live only while its **snapshot** status is `active`, and its signal comes from that
      status. This fixes the seeded-PR mismatch for display.
    - `more` counts the slots past the cap. `intensity` is the share of linked pieces done.
    - `piece.open` is the count of open attachments, including those under "+N" (D2/R3).
    - The noun (`meta`, `typeName`) comes from the pack's words (SDLC: Repository).
  - **Agents**:
    - Ships come from `projectCaptains` over the piece nodes, then get `asset: 'agent'` and
      `meta` = the call sign. The stage stays `captain`: per `fleet.ts`, a captain carries no rung,
      so there's no agent `piece`.
    - A seat whose person has no shown piece (all landed, or nothing yet) gets a ship beside its
      planet, so every seat has a clickable, followable ship (Q10).
  - **`graph.solar`** is `{ star, seats, frontier, formations }`, and **`graph.lists`** is keyed
    by projection key.
  - **`boardFacts(f)`**: the facts the board is planned from. These are the W1 follow-up
    "seats only from pieces held on the ladder", fixed here because `facts.ts` isn't this task's
    file.
    - An objective or threat that's never on the ladder while a member during the round is
      dropped.
    - A reseat made while Off waits until the piece is back on the ladder, so a ghost stays where
      it went off.
    - Seats are re-ordered by the first instant each was held on the ladder (ties by key).
    - Memoised. Board facts map to themselves.
  - **`slotAt(plan, f, key, t)`** reads membership and seat with **`engine/facts.ts`'s** readers.
    The projection doesn't use `slots.ts`' `seatAtTime` or `memberAt`. `solarSeek.test.ts` shows
    the two give the same answer at every beat time on pod-sprint.
- **`src/shared/scene/project/lists.ts`** (new):
  - `ROW_BUDGET = 16` and `megaList(title, rows)`, which keeps 16 rows and counts the rest in
    `more`.
  - `itemRow` (title; `Type #id · raw state`, so INV-11's raw name survives; the rung).
  - `seatList`: objectives, then threats, free before formation, by slot index. Landed pieces
    are included.
  - `pieceList`: the steps in slot order. A piece with no steps gets no list.
  - `facilityList`: every objective and threat linked through an attachment opened by the
    playhead, in opening order. A step stands in for its parent. Each row has
    `subtitle { label: '#<id> <title>', url }` when its parent is a container. `url` comes from
    `pack.containerUrl` (read-only, INV-21).
- **`src/shared/hierarchy/solarSource.ts`**:
  - `fallback` is gone, so `projectScene` now takes the `projectSolar` branch.
  - `facts` = `boardFacts(roundFacts(h, ref, packFor(h)))`.
  - `pack` = `packFor(h)`. It imports `packs/all` for registration.
  - **`paceFacts(h)`** is the whole round's board facts (sprint ref), or `scheduleFacts` for a
    bundle that isn't a round.
- **`src/shared/hierarchy/solar.ts`**: `pacing: (h) => pacing(packFor(h), { facts: paceFacts })`.
  Solar schedules are now sized by `pace.ts`. They read `roundFacts` (membership by placement,
  unbinds and seeded PRs handled), not `scheduleFacts`. This sidesteps the `scheduleFacts`
  enter/appear and unbind follow-ups for solar.
- **Tests**:
  - `tests/golden/solar.test.ts` writes `__golden__/solar.plan.json` and `solar.scenes.json`
    (Harbor and Lantern Pods, Sprint 13, at the start, each quarter and the last instant).
  - `tests/unit/solarSeek.test.ts` has 12 tests.

## 2. Contracts changed
- **A type-only addition outside this task's files:** `SolarSource.pack?(h): DomainPack` in
  `src/shared/hierarchy/types.ts`. The projection needs the crowding cap, the words and
  `containerUrl`, and the import fence keeps it from looking up packs itself. With no `pack`, the
  projection uses 3 + 3 and no links.
- **Test edits outside this task's files**, needed because the fallback was dropped as 17 asks:
  - `tests/unit/solarChain.test.ts`: the "empty facts plus fallback" test and the "fallback
    equals v0" test now check the board facts, the pack, and a solar-drawn region.
  - `tests/e2e/solar.spec.ts`: the region assertion now looks for `seat`, `objective` and `threat`
    instead of v0 planets.
- **Departures from 14, as built:**
  - **Pacing reads the whole round's facts, not the region's.** `Hierarchy.pacing(h)` sees no
    scene. The planner must use the same object (`paceFacts(h)`); see 5.
  - **Seat facts are refined by `boardFacts`** (above), at the source, so the planner and
    achievements can share the board's seats.
  - **Agents carry no `piece`.** Their stage stays `captain`.
  - **`ROW_BUDGET` lives in `scene/project/lists.ts`** (shared). W2-T5's `labelTiers.ts` should
    re-export it rather than declare its own.
- **03 isn't edited** (not this task's file). **Follow-up for W4-T3:** add to 03 §5d:
  - `SolarSource.pack`, `boardFacts`, `slotAt` and `paceFacts`;
  - the projection's node table (keys, assets, resting looks, the share and intensity rules, the
    ship fallback);
  - the mega-list rules and `ROW_BUDGET` in shared;
  - "steps unset when empty".
- 02 is unchanged: no rule changed. The share is INV-19 as 13 §9 amends it, and that edit is
  W4-T3's.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean, including the import fence on `solar.ts` and `lists.ts` (only
    `projectCaptains` comes from traffic).
  - `npm test`: 46 files, 689 tests pass. That includes in-flight W2 tests in the tree.
- **v0 goldens unchanged**: `git status tests/golden` shows only new files: mine
  (`solar.test.ts`, `solar.plan.json`, `solar.scenes.json`), W1-T2's `v1-ingest.test.ts` and
  W2-T7's `v1-awards.*`.
- **New goldens written and reviewed**:
  - Harbor has 4 seats (Kit, Wren, Ossian, Juno). Pell (Tasks only) and the reviewer guests have
    none.
  - Ossian's formations are 2 objectives and 1 threat.
  - There are 3 facilities: tide-gateway (midpoint, 4 seats, "+1" at ¾), harbor-console (beside
    Kit), ledger-sync (midpoint).
  - Lantern has 2 seats and no facilities.
  - Steps show as `s=n`, `s=nn` and `s=a`, and the ghost bug reads `off+ghost+strike`.
- **`solarSeek.test.ts`**:
  - Every `(kind, key, seat)` keeps one position at every beat time of each region's paced
    schedule.
  - Every shown piece sits on a planned slot, `slotAt` equals the plan's `pieceAt`, and every
    member has a slot.
  - A seek to *x* on a fresh copy, latest first, deep-equals a play to *x*. A seek back after the
    end changes nothing.
  - Free pieces are ≤ 3 + 3 per seat, and formation members carry the right `cluster`.
  - Every mega-list has ≤ 16 rows and `more ≥ 0`, and a 21-row list gives 16 rows plus `more: 5`.
  - **Facility rows carry the Feature subtitle** (`#2000x …`). Their URL is `null` on fixtures,
    and `https://dev.azure.com/tidewater/_workitems/edit/<id>` when the project has an ADO
    address.
  - Every non-light maneuver and protect window, planned from `paceFacts`, ends inside its beat.
  - `boardFacts`: an Off-all-round piece makes no seat; a ghost's reseat waits for its reopen (or
    never lands); memoised.
- **Literal fence**: passes, and covers `lists.ts`.
- **Spec `solar`**: 2 of 2 pass (built under the lock). The screenshot shows sprint-pods' Comet
  Pod drawn by the solar layout, with seats on orbits, ships beside them and a facility, all in v0
  placeholder views.
- **Keystone** (not required, run because the shared projection changed): 38 of 38 pass.

## 4. Screenshots
No human gate. `test-results/solar-1-region.png` (fixture data, sprint-pods, Comet Pod).

## 5. Known limitations and open questions
- **For W3-T1:**
  - Plan beats with `planManeuvers(h, beat, paceFacts(h))`, the object pacing used. Region facts
    can fire `facility.enter` at a different event from the round's, which would break the
    protect-window guarantee.
  - The board's facility `enterAt` comes from region facts, so a repo first opened from another
    region of the round appears in this region without its jump-in maneuver. Possible fixes: a
    per-scene pacing hook, or a jump-in derived from the region in the planner.
- **Ghost casts.** The planner reads moves, so a `piece.reseat` of an Off piece casts a `toSeat`
  the board may not have (the ghost stays put). The interpreter should skip missing cast views.
- **Ships only for seat holders.** People who act without holding an objective or threat
  (reviewers, Task-only Pell) have no ship, as in v0. Strike-run `support` casts may name them.
- **Fixture URLs are null.** Fixture bundles carry empty `adoUrl`s.
- **Pieces with no steps get no mega-list.** Their callout is enough. W2-T5 may want an empty list
  for a uniform hover.
- **Untouched W1 follow-ups.** These were adapted here, not fixed at the source:
  - the two `seatAtTime`/`memberAt` versions (`slots.ts` versus `facts.ts`);
  - `seatsOf`' Off seats (`facts.ts`);
  - region-scoped `enter`/`leave`;
  - `scheduleFacts`' appear and unbind gaps;
  - `terminology`'s unknown-state line;
  - `buildHighlights`' `priorityOf`.

  The plan still uses `slots.ts`' readers internally, and the test pins that they agree today.
- **Aggregate rung thresholds** (¾ for Nearing) and the share are first guesses, for HG-V3.
