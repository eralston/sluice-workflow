# Slice V1-W1-T4: Maneuver rules and schedule hooks

Built 2026-10-10, following [17 W1-T4](../17-v1-phases.md#w1-t4-maneuver-rules-and-schedule-hooks)
and [14 §2.6–2.7, §4](../14-architecture.md#26-schedule-hooks-playbackschedulets-optional). v0
behaviour doesn't change: with the hooks unset, the schedule code path is the v0 one, and every
golden is byte-identical.

## 1. What was built
- **`src/shared/engine/pace.ts`**: the engine's maneuver rules, as data.
  - `RULE`: the 13 rule ids from 17 (`piece.appear` … `agent.light`), and `RuleId`.
  - `PaceRule extends ManeuverRule` adds three optional fields that the planner reads:
    - `protectWhen(mv, f)`: protection for some moves only. `attachment.settle` uses it, so it's
      protected only when the attachment lands (`to.rung === 'accomplished'`).
    - `waitsFor`: rule ids of the same event that this rule starts after. `attachment.open` waits
      for `facility.enter`.
    - `light`: marks `agent.light`, which plays only where nothing else does and costs no time.
  - `PACE_RULES`, in this order. The lengths are close to the v0 accents they replace:

    | Rule | Matches | Tier | Length (1×) |
    |---|---|---|---|
    | `piece.appear` | `appear` of an objective, or of a threat as a sketch | narrative | 1600 |
    | `threat.emerge` | `appear` of a solid threat, or its sketch → ready | narrative | 2200 |
    | `objective.underway` | `climb` to underway | narrative | 2400 |
    | `objective.nearing` | `climb` to nearing | narrative | 2400 |
    | `objective.accomplish` | `climb` to accomplished (**protected**) | essential | 3100 |
    | `threat.engage` | `climb` to underway or nearing | narrative | 2400 |
    | `threat.accomplish` | `climb` to accomplished (**protected**) | essential | 4000 |
    | `piece.off` | an objective or threat `climb`s to off | narrative | 1800 |
    | `piece.reseat` | `reseat` of an objective or threat to another seat or the frontier | narrative | 2400 |
    | `facility.enter` | the first `attach` into a facility opened inside the round | narrative | 2800 |
    | `attachment.open` | every `attach` (waits for `facility.enter`) | narrative | 1700 |
    | `attachment.settle` | `settle` (protected when it lands) | narrative | 2800 |
    | `agent.light` | any move but `retitle`, on events nothing else plays | ornament | 1200 |

    A climb within the same rung (a step change) matches nothing.
  - Casts:
    - Every cast list is sorted and de-duplicated, and empty parts are dropped (`castOf`).
    - A piece's cast is `subject`, the `agent` (the move's actor, else `e.changedBy`) and its
      `seat` at the event. If the piece is unassigned, `frontier` holds it.
    - The defeat adds the reviewers of the attachments linked to the threat as `support`, and those
      attachments' facilities as `facility`.
    - Engage and nearing add those facilities too.
    - A reseat casts `fromSeat` and `toSeat`.
    - A settle casts its author and approvers as `support`.
  - Helpers: `phases(...)` (phases played in sequence), `spanMs`, `attachmentsOf`,
    `firstAttachment`, `seatAt`, `subjectOf`, `ruleById`. Every facts lookup is memoised per
    facts object and is independent of Map insertion order.
- **`src/shared/engine/maneuvers.ts`**
  - `planManeuvers(h, beat, f, rules = PACE_RULES, eng = ENGAGEMENT.calm, opts = {})`:
    - **Accented beat:** it plans one maneuver for every rule that a beat event's moves
      (`f.moves`) match, in event, move and rule order. Light rules are left out of this pass.
      - A protected moment starts once every earlier moment it shares an actor with has finished.
      - Any other maneuver starts once every moment whose actors it shares has finished, and after
        its `waitsFor` rules in the same event.
      - The actors are the cast's `subject`, `agent`, `support` and `attachment`. Seats and
        facilities don't move, so they don't count.
      - With `eng.lightActions`, events that no rule plays get `agent.light`.
    - **Unaccented beat:** it plans `agent.light` only, gated by `Engagement`:
      - `lightActions` gates it, capped at `actionsPerBeat`, `staggerS` apart.
      - With `subjects`, the other person in the change (the new seat, the attachment's author, or
        the piece's seat) is cast as `support`.
    - Each `PlannedManeuver` has:
      - `seed = fnv1a32(eventKey)`;
      - `protect = { keys: sorted actors, windowMs: durationMs }`;
      - `from` and `to` from the move;
      - `keys`: every cast key, sorted.
    - `opts.priorityOf` must match the schedule's.
  - `shapeOf(h, events, f, rules, prio)`: the `BeatShape` that the same drafting and sequencing
    gives. So a beat is always exactly as long as its non-light maneuvers.
  - `pacing(pack, { rules?, facts? })` returns `Partial<ScheduleOptions>`:
    - `beatShape` is always set.
    - `priorityOf` and `focusOf` are set only when `pack.adapter` has `priority` or `focusOf`, so
      SDLC keeps `e.priority` and the chain's focus.
  - `scheduleFacts(h, pack)`: the default facts for `pacing`. It folds the whole bundle once from
    `pack.adapter.moves`, memoised per bundle and pack:
    - moves for every event;
    - attachments, with links, approvers and settle times (attachments are collected in a first
      pass, because a link can be dated at the attachment's own opening);
    - pieces, with seat and signal changes;
    - the round is `h.range`.
  - `priorityFor(pack, facts)`: the pack's priority hook, or undefined.
- **`src/shared/playback/schedule.ts`**
  - `ScheduleOptions` gains the optional hooks `priorityOf`, `focusOf` and `beatShape`.
  - New exports: `BeatShape`, `v0BeatShape` (`protectBeat` plus the group burst, moved verbatim
    out of the beat map), `prLinkTimesOf` (the link-time loop, moved verbatim) and `focusOf` (the
    v0 focus, now exported).
  - With a hook unset, the line that uses it runs the v0 expression.
- **`src/shared/playback/highlights.ts`**: `buildScene` and `buildHighlights` spread
  `hier.pacing?.(h)` first, so their own `include`, `hier` and the highlights' budget win.
- **Tests**: `tests/unit/scheduleHooks.test.ts` (8 tests) and `tests/unit/maneuvers.test.ts` (41
  tests).

## 2. Contracts changed
- **Additive only, no doc edits** (03 isn't this task's file). **Follow-up (W4-T3):** copy into
  03 §5d:
  - the three hooks and `BeatShape`;
  - `PaceRule`'s extras;
  - the planner's sequencing rule (who counts as an actor);
  - the as-built signatures below.
- **Departures from 14:**
  - **`planManeuvers` takes an optional sixth argument, `opts: { priorityOf? }`.** `rules` and
    `eng` have defaults. Without it, a pack with its own priority could plan maneuvers for events
    that the schedule treated as Low.
  - **`pacing(pack, opts)` returns the hooks object directly**, not a function of `h`, because
    every hook already receives `h`. W2-T1 writes `SOLAR.pacing = (h) => pacing(packFor(h), …)`.
  - **Conditional protection and in-event ordering are `PaceRule` fields** (`protectWhen`,
    `waitsFor`), not `ManeuverRule` fields. `contracts/maneuver.ts` (W0-T1's file) is untouched. A
    rule written against the bare contract still plays.
  - **`piece.appear` doesn't match steps**, and no rule plays a step's or container's climb. Steps
    are drawn inside their parent (13 §4.2), so a Task-only beat isn't accented. It costs no time,
    and gets light maneuvers under Lively or Maximum. (v0 gave Task waves `GROUP_BURST_MS`.)
  - **Light maneuvers also play in accented beats**, for events no rule plays. v0's
    `planAccents` gave accented beats no ship actions. They still cost no time.
  - **`buildScene` takes a chain's `budgetMs`** from its pacing (no v0 chain sets one).
    `buildHighlights`' own budget wins.
- 02 is unchanged: no rule changed. INV-15 holds, because sequencing happens only inside a beat.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean.
  - `npm run lint`: clean.
  - `npm test`: 36 files and 549 tests pass. That includes other in-flight tasks' tests that were
    present at the time.
- **Goldens unchanged**: `tests/golden/schedule.test.ts` passes byte-identical.
  `git status tests/golden` shows only `v1-ingest.test.ts`, which is W1-T2's file, not this task's.
- **`scheduleHooks.test.ts`**
  - On every v0 scenario, under Backlog and Sprints, these give a deep-equal schedule: hooks unset,
    hooks explicitly `undefined`, and hooks set to the v0 defaults (`e.priority`, `focusOf` over
    `prLinkTimesOf`, `v0BeatShape`). The comparison covers beats, `totalMs`, and `toSource`,
    `stateUtc` and `toPresentation` sampled.
  - A chain with an empty `pacing` gives the same scene and highlights.
  - Each hook is used when set.
  - A chain's pacing reaches `buildScene` and `buildHighlights` under their own filter, and the
    highlights' budget wins.
- **`maneuvers.test.ts`**
  - The table holds all 13 ids, with phases in `PHASES` order.
  - Protection: the two successes, plus settle only when it lands.
  - 22 move-matching cases, including the rung-step, step, container, same-seat and retitle
    non-matches.
  - `facility.enter` fires only for the first in-round attachment per facility. Ties go to the
    lower key.
  - Casts for the defeat (support, facility, seed, protect keys).
  - Sequencing:
    - a reseat waits for the landing of the same piece, and unrelated work plays alongside;
    - two moments that share an actor play in series;
    - an attachment opens after its facility enters;
    - a dropped settle isn't protected.
  - Determinism: the plan is equal on a second run and with reversed Map insertion order.
  - Light maneuvers:
    - Calm gives none.
    - Lively gives 3, at 0, 300 and 600 ms, with the other person in `support`.
    - Maximum gives all 5.
    - None are planned when no light rule is in the table.
  - Light work never sizes a beat.
  - Every rule is ≤ 5 s.
  - **Paced schedules on every v0 scenario**, through a test-local adapter:
    - `totalMs` ≤ 1.1 × `BUDGET_MS`, the same bound as v0's busy-week, because High beats are
      never cut.
    - Every beat is ≤ `BUDGET_MS`.
    - Every non-light maneuver, and every protect window, ends inside its beat.
    - Every accented beat plays something.
    - The plans repeat.
  - The pack's own priority drives the schedule.
  - `scheduleFacts` is memoised, and folds links and approvers.
- **Literal fence**: passes on `pace.ts` and `maneuvers.ts`. They name no SDLC states or types,
  and no theme words.
- Keystone and e2e weren't run. They aren't among this task's checks, and nothing here is wired
  into the app yet (no chain sets `pacing` until W2-T1).

## 4. Screenshots
None. This task has no human gate.

## 5. Known limitations and open questions
- **The schedule and the planner must read the same facts.** `pacing` defaults to
  `scheduleFacts`, which is coarser than W1-T1's `roundFacts`: no region filter, and seats held
  before the first dated move are unknown. Timing reads only moves, attachments and links, so it
  is consistent today.
  - **W2-T1 / W3-T1:** give `pacing({ facts })` and `planManeuvers(f)` the same facts object (or
    both `scheduleFacts`). Otherwise a protect window could fall outside its beat.
- **The rules' `match` reads `f.moves`, so the planner sees only events whose moves the facts
  hold.** If W1-T1's `roundFacts.moves` holds only in-region events, a beat event outside the region
  plays nothing. That's intended.
- **`buildHighlights` still filters on `e.priority === 'high'`**, not on the `priorityOf` hook. That
  file's include predates the hooks. A pack that re-prioritises would need the highlights filter to
  read the hook (a one-line change in `highlights.ts`).
- **The test adapter in `maneuvers.test.ts` is a stand-in** for W1-T1's SDLC adapter. Once
  `packs/all.ts` lands, the paced-schedule cases could use the real pack, plus a `v1-schedule.json`
  golden (14 §5).
- **Pace lengths are first guesses**, close to v0. They're tuned in `pace.ts` only. The gallery
  maneuver demos (W4-T1) are the place to review them.
- **Haul** (13 §6) has no rule of its own. The theme can play it inside `objective.underway` or
  `objective.nearing`, whose casts carry the linked facilities (`nearing` does today; `underway`
  could add them).
