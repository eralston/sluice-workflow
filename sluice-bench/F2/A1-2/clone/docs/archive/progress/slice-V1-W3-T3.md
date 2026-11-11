# Slice V1-W3-T3: Solar consistency

Built 2026-10-10, finished 2026-10-12. This is an extra W3 task, not listed in 17. Its owned files
are `src/shared/engine/solar/*.ts`, `engine/{facts,terminology,achievements}.ts`,
`scene/project/{solar,lists}.ts`, `hierarchy/solarSource.ts`, the `SolarSource.fallback` removal in
`hierarchy/types.ts`, the dead branch in `scene/projectScene.ts`, and their tests. It closes the
consistency follow-ups that W1 and W2 carried forward
([W2-T1 §5](slice-V1-W2-T1.md), [W2-T7 §5](slice-V1-W2-T7.md), [W1-T5 gate](slice-V1-W1-T5.md)).
The first agent on this task was cut off by a network outage after the code changes. This pass kept
its edits (each one reviewed), wrote the probe tests, and ran the checks. v0 behaviour and every v0
golden are unchanged.

## 1. What was built
- **One timeline for seat and membership (`engine/facts.ts`).** It's now the only home of the
  readers. `slots.ts` no longer has its own `seatAtTime` and `memberAt`.
  - New readers:
    - `onSpans(p)`: the stretches a piece's signal isn't known to be Off. An unknown state
      (INV-11) counts as on.
    - `heldSpans(p, round)`: the stretches a piece is a member, on the ladder and at one seat,
      clipped to the round.
    - `parentAtTime(p, t)`, plus the existing `knownOff`, `meet` and `eventsAt`.
    - `seatAtEvent(f, p, eventKey)`: the seat as it stood at one event, in event order.
  - Before its first `seatAt` entry, a piece is unassigned (the frontier). `heldSpans` starts
    there.
  - **`seatsOf` excludes Off pieces at source.** A seat is someone who held an objective or threat
    while it was on the ladder (`heldSpans`).
  - **The fold keeps a parent series** (`PieceFacts.parentAt`): one entry per change, and a second
    change in the same millisecond replaces the first.
  - **`RoundFacts.at`** maps each board event key to its `UtcMs`.
- **The plan agrees with the facts (`engine/solar/{slots,plan}.ts`).**
  - `visitsOf` is `heldSpans` grouped by seat. So a member gets a frontier slot before its first
    seat entry, and a visit made while Off opens no seat and no slot.
  - `pieceAt` reads `memberAt` and `seatAtTime` from `engine/facts`, and `slotAt` in the projection
    is `pieceAt`. The projection, the plan and the fold all read one timeline.
- **The projection (`scene/project/solar.ts`).**
  - **`boardFacts` keeps attachments only where they link to board pieces** (or to a step whose
    parent is on the board). An attachment with no such link is dropped, so a facility linked only
    to dropped pieces is never drawn.
  - **Off ghosts aren't ship anchors for a new assignee.** A ghost reassigned while Off stays at its
    old seat. So `projectCaptains` isn't given it as an anchor when the snapshot's assignee isn't
    the seat it stands at.
  - **Seats are passed to `projectCaptains` as `homes`.** A seat holder with no assignable piece
    shown still gets one ship. It goes beside where they last worked (`activityAnchors`, INV-07),
    else beside their planet, at the shared `SHIP_R` radius (see 2).
- **`SolarSource.fallback` is gone**, and with it the dead `projectSystem` branch in `projectScene`.
  The solar arm always calls `projectSolar`. `solarSource` is `{ center, facts, pack }`.
- **Terminology (`engine/terminology.ts`).**
  - A climb into or out of an unknown state reads as the raw state name (INV-11), not the rung it
    falls to. The line still names the piece by its role's noun, never an SDLC type.
  - `terminology` takes a narrower `WordsPack` (`words` and an optional `mapping`), so the
    achievements' engine context needs no cast.
- **Achievements (`engine/achievements.ts`).**
  - `arrivalsAt` reads each move's time from `RoundFacts.at`. It no longer counts back through the
    signal series. Of two climbs in the same millisecond, only the last is an arrival, at its own
    event.
  - Landings read the holder with `seatAtEvent`, so a reseat later in the same millisecond doesn't
    move the credit.
  - **Clean landing** keeps unknown-state steps (they aren't known to be Off), so they spoil it.
    It binds a step to the parent it had then (`parentAtTime`).
  - **Wingman** uses the step's parent at the time, and reads the holder at the help's own event.
  - **Clear skies** is earned at the start of the seat's last clear stretch: the last landing, or
    a later move that cleared the seat (a reseat away, leaving the region, going Off).
- **`scheduleFacts` (`engine/maneuvers.ts`).**
  - A piece created inside the bundle's scope is a member from its creation (that `appear` has no
    `enter`).
  - An unbind clears the child's parent.
- **Mega-list subtitles (`scene/project/lists.ts`)** carry the container's key, so main's
  allowlisted `openInAdo` can open it (read-only, INV-21). This was a W3-T1 follow-up that falls in
  this file.
- **Probe tests**, one per fixed case. Each was mutation-checked: putting the old logic back makes
  its probe fail.
  - `solarLayout.test.ts`, "one timeline" (5 tests): `slots.ts` exports no reader; a frontier slot
    before the first seat entry; no seat or slot for an Off-only visit; `seatsOf` excludes Off but
    keeps unknown; the plan agrees with the facts' readers at every hour.
  - `solarSeek.test.ts`, mini sprints (4 tests): a ghost reseated while Off gives its new assignee
    no ship; a facility linked only to a dropped piece isn't planned or drawn; the fallback ship
    sits beside where its person last worked, then beside the planet before that, at a captain's
    radius; `paceFacts` falls back to `scheduleFacts` on an area bundle, with in-scope creation as
    membership and an unbind clearing the parent.
  - `achievements.test.ts`, "read at the event" (6 tests): an unknown-state step spoils Clean
    landing; the holder is read before a same-millisecond reseat; Clear skies falls at a clearing
    reseat or Off move; Clean landing and Wingman use the step's parent at the time; two climbs in
    one millisecond land at the second, with no dated first start.
  - `moves.test.ts` (1 test): an unknown-state climb line is `objective #10 Ready → Parked`, with no
    type name.
  - `solarChain.test.ts` and `facts.test.ts`: updated for the removed fallback and the new
    `parentAt` field.

## 2. Contracts changed
- **Additive, inside owned files**:
  - `heldSpans`, `onSpans`, `parentAtTime`, `seatAtEvent`, `eventsAt` and `knownOff` in
    `engine/facts.ts`;
  - `WordsPack` in `terminology.ts`.
- **Removed**: `SolarSource.fallback` in `hierarchy/types.ts`, and the `projectSystem`-over-fallback
  branch in `projectScene.ts`.
- **Tiny additive changes outside the owned files**, made by the first agent on this task. Each one
  is type-only or confined to one function, and none conflicts with another W3 task's files:
  - `src/shared/engine/types.ts`: optional `PieceFacts.parentAt?` and `RoundFacts.at?`. Facts built
    by hand that lack them read as before: the final parent, and nothing dated.
  - `src/shared/contracts/view.ts`: optional `MegaRow.subtitle.key?`.
  - `src/shared/scene/project/traffic.ts`: `projectCaptains(ctx, assignable, homes = new Map())`
    and the shared `SHIP_R = 56`. With no `homes` (every v0 caller), it runs exactly as before.
  - `src/shared/engine/maneuvers.ts`: inside `scheduleFacts` only (appear membership, unbind). No W3
    task owns this file.
- **Departure from 14, recorded here for W4-T3:** `boardFacts` filters attachments as well as
  pieces and seats. 03 §5d should list this with the other W2-T1 seams, along with:
  - `heldSpans` as the seat rule;
  - `RoundFacts.at`;
  - `PieceFacts.parentAt`;
  - the `homes` argument;
  - `MegaRow.subtitle.key`.
- **02 is unchanged.** These are fixes that bring the code in line with INV-02, INV-07, INV-11 and
  INV-14 as they stand. 03 is W4-T3's.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean, including the import fence and literal fence on the engine and solar
    files.
  - `npm test`: 49 files, 758 tests pass. That includes the other W3 tasks' tests in the tree.
- **v0 goldens unchanged.** `git status tests/golden` shows only untracked v1 files. No tracked
  golden changed.
- **v1 goldens**:
  - `solar.plan.json` and `v1-awards.json` are byte-identical to their state before this task.
  - `solar.scenes.json` changed in one way only: each facility row's `subtitle` gained
    `"key": "wi:…:<container id>"` (the containers #20001, #20002 and #20003). No position, stage,
    node or award moved, so the fixes don't touch pod-sprint, whose ghosts aren't reseated and whose
    facilities all serve board pieces.
- **Probes**: all 16 new tests pass. All 9 mutations (the old logic put back, one fix at a time)
  are caught by their probe.
- **e2e** (not among this task's checks; run because the shared projection changed), under the
  build lock:
  - **`solar.spec.ts`: 7 of 7 pass.** VC-3 ("no two hits overlap") is W3-T1's marked expected
    failure (`test.fail()`), so it counts as a pass.
  - **`@keystone`: 37 of 38 pass.**
    - The failure is `pictures.spec.ts` "add, keep through Purge, and remove a picture". It
      times out waiting for the v0 Sprints round (`sprint:`) after the Connect modal flow, which
      W3-T1 and W3-T4 are reworking (`.connect__close`, the Connection tab). Its sibling in the
      same file fails the same way.
    - None of this task's code runs in the v0 Sprints chain. `projectCaptains` without `homes`
      behaves as before, and the v0 goldens are unchanged. The similar keystone "Sprints in ADO
      mode" passes.
    - **Follow-up for W3-T1 or W4-T2:** update `pictures.spec.ts`' `openPod` for the new Connect
      flow.

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **The chart register's `typeName` still returns a type the mapping doesn't know as its raw name**
  (for example `Spike`), and with no mapping it returns any type as is. `packs.test.ts` pins this
  ("a type the mapping doesn't know keeps its name"), and that file isn't this task's.
  - The app always passes `mapping: h.stateMapping` (`v1/lines.ts`, `Read.tsx`), so every mapped
    type reads as its role's noun.
  - If unknown types should read as a neutral `item` in the chart register too, change
    `terminology.ts` and that test together.
- **A ghost Off from before the round, then reseated while Off, has no slot** at its old seat until
  it comes back on the ladder. So `pieceAt` is null there and it isn't drawn for that stretch. No
  fixture has this case. It follows the rule "a stay Off throughout opens no slot".
- **Achievements on board facts versus round facts.**
  - W2-T7 said to call `achievementsFor(roundFacts(…))`. `seatAtEvent` reads the raw reseat moves.
  - On board facts (whose `seatAt` delays a ghost's reseat), `seatAtTime` and `seatAtEvent` could
    disagree about an Off piece. Every rule ignores Off pieces, so this has no effect today.
  - **For W3-T1:** pass round facts, as W2-T7 said.
- **`scheduleFacts` is still coarser than `roundFacts`.** It has no region filter, and no seats
  before the first dated move. Only bundles that aren't rounds use it.
