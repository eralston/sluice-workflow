# Slice V1-W2-T4: Commands and the maneuver interpreter

Built 2026-10-10, following [17 W2-T4](../17-v1-phases.md#w2-t4-commands-and-the-maneuver-interpreter)
and [14 §2.8, §3 step 9, §4](../14-architecture.md#28-renderer-registries). Nothing here is wired
into the app yet: W3-T1 swaps ChartApp's `AnimationDirector` for `SwitchingDirector`. So v0
behaviour is unchanged. `director.ts` gains only `implements FxDirector`.

## 1. What was built
- **`chart/fx/movers.ts`: `FxRunner`.** The v0 director's effect bookkeeping, copied (the v0 copy
  in `director.ts` stays as it is). It covers:
  - the live effects and the tells;
  - one mover per node, so a new move takes over from where the node is drawn;
  - `blockedFor` and protects;
  - the `MAX_ACTIVE_FX` budget over cuttable effects;
  - ducking while a grand flare bursts, and the one-grand-burst booking (`grandSlot`);
  - the effect clock, and `clear()`.
  - New in v1:
    - Each effect a command makes carries `RunMeta` (name, weight, cuttable, clock). A command's
      `clock` overrides the effect's own `kind`, so protects and fades run on the beat's clock.
    - `protect(...)` keeps each protect's actor keys, and `protectedFor(keys, owner)` says how long
      a whole maneuver must wait for them.
    - Two movers: `HoldFor` (a timed hold) and `Sortie` (out to a live point beside the work,
      hold there nosed toward it, then back to the node's own goal). `besideOf` builds the point.
- **`chart/fx/host.ts`: `FxHost`.** The director's host, plus what a command needs: `stage()`,
  `layer()`, `px()`, `reduced()`, `calm()`, `at()`, `add()`, `grandSlot()`, `bursting()` and
  `act(pk, act)`. `makeHost(base, runner, volatility)` builds it.
- **`chart/fx/commands.ts`: the command registry.**
  - **The ten seed commands**, with weights, tiers and budgets from the v0 director:

    | Command | Tier | Weight | Cuttable | Clock | Reduced |
    |---|---|---|---|---|---|
    | `flare` | narrative (a grand flare is essential and weighs 3) | 1 | yes | accent | `ring` |
    | `ring` | narrative | 0.25 | yes | accent | `same` |
    | `ink` | narrative | 0.5 | no | travel | `snap` (releases its held edge) |
    | `spark` | narrative | 0.5 | yes | accent | `skip` |
    | `tractor`, `support` | narrative | 1 | no | accent | `skip` |
    | `pursue` (mover) | essential | 1.5 | no | travel | `snap` |
    | `hold` (mover) | essential | 0 | no | travel | `same` |
    | `protect` | essential | 0 | no | travel | `same` |
    | `insignia` | ornament | 0.25 | yes | accent | `ring` |

    - `pursue` with a `to` anchor is a sortie. Without one, it's v0's `Pursue` toward the node's
      layout goal.
    - `insignia` is a new effect: an award's n-point mark in a ring.
    - A grand `flare` waits for the previous burst (`LateFlare`, capped by `capS`). Lesser flares
      lose their sparks unless the scene is calm, and shrink while a burst plays.
  - **Registry functions:** `registerCommand` (a theme's override, by name), `commandByName`,
    `allCommands` and `resetCommands`.
  - **`reducedCall`** applies INV-20.
  - **Typed `cmd.*` builders** for choreographies.
  - **A small kit:** `one`, `present`, `sortie`, `away`, `pointOf`, `phaseMs` and `phaseAtMs`.
- **`chart/fx/v1/registry.ts`.** `registerManeuver`, `maneuverFor`, `allManeuvers`,
  `resetManeuvers` and `installTheme`. It subscribes to `onThemeInstall`. Each theme made active
  replaces the maneuvers, and resets the commands to the seeds before applying that theme's
  overrides.
- **`chart/fx/v1/interpreter.ts`: `ManeuverInterpreter implements FxDirector`.** Per beat
  (`queue` → next `update`):
  1. **Gating.**
     - Maneuvers: essential always. Narrative ones play unless `v ≥ OVERLOAD`; ornament ones
       (light work) unless `v ≥ BUSY`. `Engagement.ignoreLoad` lifts both.
     - Here `v = volatility() + 0.6 × count`, as in v0.
  2. **Protects first.** Each protected maneuver's actors are held from now to
     `start + windowMs`, before anything moves, but only where the moment is on screen.
  3. **Start times.** A maneuver starts at `afterMs`, or later if another event's protect still
     holds any of its actors (`subject`, `agent`, `support`, `attachment`). This is the follow-up
     "agent.light can start inside a protect window".
  4. **Looks.**
     - A subject's pending stage is claimed at once and landed at the `land` phase, else when
       `act` ends.
     - So is the pending stage of the rest of the cast that was already on the board: `seat`,
       `fromSeat`, `toSeat`, `facility` and `attachment` (whose view is its facility). A landing or
       strike run changes the seat's `m<n>r<n>`, and that count now comes in with the grand flare
       instead of 2 frames into the beat.
     - Each claimed node lands once per beat. When maneuvers share a node, a protected moment's
       land wins, then the earliest.
     - A subject new to the scene fades up from its `act`.
     - Anything else new to the scene fades up (never pops).
  5. **Phases.**
     - Each phase runs on the beat's (travel) clock and calls the theme's `ManeuverDef.phase[p]`
       with fresh `CastViews`.
     - Each call goes through the registry: `delayMs`, reduced substitute, then tier gating at
       issue time (ornament only when calm; narrative cuttable calls rationed when busy).
     - Movers go through the runner, owned by the maneuver's event, so a protect lets its own moment
       move its cast.
     - A rule with no choreography still lands its look, with a plain ring.
     - A thrown phase or command is logged and skipped.
  6. **Cast views.**
     - Keys resolve per part. `subject` prefers objective, threat, facility; `agent` and `support`
       prefer the captain; the seat parts prefer the seat (14 §9 D1: a person's seat and ship
       share a key).
     - An attachment resolves to its slot on its facility (`compound.slots`, scaled by the
       facility's drawn r).
     - A key that left the scene this beat resolves to where it was (`CastView.gone`).

  Its other `FxDirector` methods:
  - `tell` glows each coming non-ornament subject in its new rung's colour.
  - `recap(keys, awards)` blooms the accomplished pieces in order, then shows each award's
    insignia over its first piece on screen. It waits up to 4 s for calm.
  - `clear()` follows 14 §4: it destroys every command and tell, then calls `releaseAllEdges`,
    `thawAll` and `landAllStages`.
  - `census()` returns v0's keys plus `maneuvers`.
  - `trailCount()` is 0: there are no trails in v1.
- **`chart/fx/v1/switching.ts`: `SwitchingDirector implements FxDirector`** (D10).
  - It sends a scene whose level layout is `solar` to the interpreter, and every other scene to
    the v0 `AnimationDirector`.
  - It picks the side per beat (`ctx.after.sceneKey`) and per frame (the mounted scene), memoised
    by scene key and hierarchy. The side left behind is cleared.
  - `bias` sets both sides. `census()` is `SwitchingCensus`: v0's shape plus `maneuvers`, so
    ChartApp's test hooks keep their keys.
- **`theme/starChart/maneuvers/*`.** One choreography per rule id (13 §6), listed in
  `maneuvers/index.ts`:

  | Rule | Maneuver | What it issues |
  |---|---|---|
  | `piece.appear` | Sensor contact | contact rings, a sensor spark from the seat |
  | `threat.emerge` | Hyperspace emergence | a fold ring and flash in `HOSTILE`, act `emerge` |
  | `objective.underway` | Carve | agent sortie, a blue cutting tractor and bolts, act `carve`, a blue flare |
  | `objective.nearing` | Rig up (+ Haul) | sortie, tractor, act `rig`, facilities haul (tractor, motes, act `intake`), a violet flare with gold sparks |
  | `objective.accomplish` | Landing | all against where the landed asteroid was (projectSolar draws it no more): sortie, tractor, a descent spark to the seat, a grand gold flare on the planet, act `megastructure` |
  | `threat.engage` | Engage | a target-lock ring in the rung's colour, bolts, return fire stopped on shields, stations' slow covering fire |
  | `threat.accomplish` | Strike run | agent and reviewer sorties, support beams into the agent, act `breakup`, a grand flare, debris to the seat, act `research` |
  | `piece.off` | Warp out | a threat streaks away on a seeded heading (act `warp`); an objective ghosts (act `ghost`) |
  | `piece.reseat` | Reassign | hold, route ink from seat to seat, then a pursue arc with a wake |
  | `facility.enter` | Station jump-in | a fold ring, the summoner's beacon, act `jump`, a green bloom; the served seats catch its light |
  | `attachment.open` | Shuttle tender | a launch spark from the bay to the slot, act `launch`, the author's beam |
  | `attachment.settle` | Satellite cycle | a charge ring, act `operate`, a dock spark on a merge, a rung flare, the gold bay light |
  | `agent.light` | Captain jump | a sortie to the work and a tractor (plus the other person's) |

  `haul.ts` is a helper. pace.ts has no Haul rule (W1-T4 handoff), so Rig up plays it.
- **`tests/unit/commands.test.ts`** (15 tests). It loads the renderer modules by runtime path, as
  `signal.test.ts` does, and Pixi loads under Node.

## 2. Contracts changed
- **`chart/fx/types.ts` (W0-T1's file): two small type-only, additive edits**, as W0-T1's
  handoff invited:
  - `FxHost` is now `fx/host.ts`'s `FxHost` (the director's host plus the runner's services)
    instead of a plain alias of `DirectorHost`. Nothing else used it.
  - `CastView` gains `gone?: boolean`: the member left the scene this beat, so `node` and `at`
    are where it was. A landed objective is hidden and counted on its seat.
- **Follow-up (W4-T3): copy into 03 §5d:**
  - the seed command table above;
  - `FxHost`, and the art-act seam;
  - the interpreter's order: gate, protect, wait, claim, phases, land;
  - `CastView.gone`;
  - the cast-resolution preferences.
- 02 is unchanged: no rule changed. INV-15 is kept by `clear()`; INV-20 by every command's
  `reduced`.

## 3. Checks
- **Base**
  - `npm run typecheck`: clean. (The first handoff said so wrongly: the test's cast literals
    weren't well-formed `CanonicalKey`s. They're now `wi:org:<n>` and `id:org:<x>`.)
  - `npm run lint`: clean.
  - `npm test`: 48 files and 716 tests pass, including other in-flight tasks' tests.
- **Goldens unchanged**: `git status tests/golden` shows only W1-T2's, W2-T1's and W2-T7's new
  files. None is this task's, and no existing golden is modified.
- **Keystone**: 38 of 38 passed.
- **Spec `motions`, `activity`, `activity-level`**: 6 of 6 passed (re-run after the review fixes).
- **Keystone** re-run after the review fixes: 38 of 38 passed.
- **`commands.test.ts`**:
  - Every command has a resolving `reduced`.
  - The seed weights, tiers, budget and movers match v0.
  - Reduced calls: a ring sits where the effect was; skip and snap play nothing; a snapped ink
    releases its edge.
  - Theme overrides, and the seeds restored on the next install.
  - Every rule id in `pace.ts` has exactly one `ManeuverDef`.
  - Each choreography fills only phases its rule plays.
  - The registry fills from the theme.
  - **The interpreter, on a stub scene with recording commands** (17 tests in the file):
    - A protected landing, with the after graph omitting the landed objective as `solar.ts` does:
      the person's views are frozen at spawn and the seat's look claimed. The sortie starts at
      300 ms; the tractor and the descent spark at 700 ms. The seat's look lands with the grand
      flare at 1500 ms. The cast thaws at 3100 ms.
    - A strike run claims both the threat's and the seat's looks at spawn and lands both at the
      rule's land, with the grand flare. A captain whose look didn't change claims nothing.
    - A seat shared by an unprotected underway (lands at 2000) and a protected landing (lands at
      2500) lands once, at the landing's flare.
    - Light work for the same captain waits for the window to end.
    - Under reduced motion: no pursue, tractor, spark or flare; rings instead; the look still lands.
    - `clear()` cancels everything pending, then releases, thaws and lands.
    - Overloaded (bias 20): only the essential pursue and grand flare play.
    - A rule without a choreography lands its look with a ring.

## 4. Screenshots
None. This task has no human gate, and the interpreter isn't wired in until W3-T1.

## 5. Known limitations and open questions
- **Art acts are a seam, not yet live.** GraphScene doesn't expose its entries' views, so
  `FxHost.act` duck-types a `GraphScene.actView(pk, act): boolean` and skips the act until one
  exists.
  - **Follow-up (W3-T1 or W2-T2's owner):** add `actView` to `GraphScene`. It should call the
    entry's `AssetView.act` when the asset's `AssetDef.acts` lists it, and return whether it did.
  - The choreographies already issue `emerge`, `carve`, `rig`, `intake`, `descend`,
    `megastructure`, `engage`, `breakup`, `research`, `warp`, `ghost`, `jump`, `launch` and
    `operate`. No art view has acts yet (D6), so the asset owners pick the names they support.
- **A landed asteroid has no view during its landing.** projectSolar drops an Accomplished
  objective, so GraphScene departs its view as the beat starts. Landing plays against its last
  point, and the descent is a gold spark to the seat, not a `descend` act (that is only issued if
  the asteroid is somehow still drawn). If the art should show the asteroid itself descending, the
  scene would have to hold a departing view for its maneuver (a later GraphScene seam).
- **Wiring (W3-T1):**
  - `new SwitchingDirector(host)` in ChartApp.
  - `fxCensus()`'s type becomes `SwitchingCensus`.
  - `recap(keys, awards)` passes the awards.
  - Import `chart/fx/v1/registry` once (it subscribes to the theme) before `useTheme`.
  - `playBeat` and `tellBeat` must carry `maneuvers` from the solar planner. For the tell, plan
    the next beat too, or the lead-in glow has nothing to show.
- **The planner and the interpreter must share facts** (W1-T4's note still applies): protect
  windows come from the plan.
- **Guests aren't summoned.** A support or agent with no ship in the scene is left out of the cast
  views. v0's guest ships (`GuestShip`) could come in through a `guest` command later.
- **The fallback `FadeIn` for new nodes** also covers a captain new to the region. The scene's own
  departure handles one that leaves.
- **Pace and look tuning** belong to the gallery's maneuver demos (W4-T1). Sortie gaps, bolt
  counts and colours are first guesses, and `HOSTILE` (0xd8503f) should match the swarm art's
  palette.
- **Not addressed here (owned elsewhere):**
  - the `sequence()` drafting order;
  - `buildHighlights` ignoring `priorityOf`;
  - the `signal.ts` `Object.hasOwn` fix.
