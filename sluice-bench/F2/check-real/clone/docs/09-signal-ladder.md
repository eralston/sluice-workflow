# 09 — The signal ladder: one visual language for progress

**Status:** current as of 2026-10-27 (through v1.3 Block B). Adopted on 2026-10-01 and built (`art/progress.ts` and every
state-bearing art class); amended in place to match the build. The v0 looks are in
[06 §6](06-visual-brief.md), Solar's in §9 here. The rung colours, tempos and every pack's state
mapping are in [15 §3, Signal ladder](15-reference.md#3-signal-ladder), which wins where the two
differ; this doc keeps the reasons. Review in `npm run gallery`, where each cell shows its rung.
Decisions are in §8.

## 1. The idea
*Applies to: both views.*

Every object with a state climbs the same four rungs. Each rung has one **color**, one **level of
ornament**, one **rank of contrast**, and one **kind of motion**, so the eye learns the ladder once
and reads it on stars, planets, anomalies, cargo vessels, and mission points alike.

| Rung | Color | Ornament (shape) | Contrast | Motion |
|---|---|---|---|---|
| **Ready** | Steel grey | Silhouette only: the object as a sketch or a plain form | Lowest: understated, recedes | Still, or one very slow, faint breath |
| **Underway** | Progress blue | Detail arrives: the object becomes visibly its kind | **Highest**: the brightest thing in the view | Strongest: sweeps and pulses on the shared progress beat |
| **Nearing** | Violet, with gold creeping in | Fuller form: most detail present | High | The same motion, accelerating and starting to settle |
| **Accomplished** | Success gold | Final form: one satisfying, unique ornament (the check, the starburst) | Second: clearly done, calmer than active work | A burst when it happens (a playback accent), then **still** |

The hex values, the beats and each rung's activity level are in
[15 §3](15-reference.md#3-signal-ladder) (`RUNG_COLOR`, `PROGRESS_PERIOD`, `NEARING_PERIOD`,
`ACTIVITY` in `art/progress.ts`).

Off the ladder: **Removed, Rejected, abandoned PRs** are ghosts (desaturated, dashed); **Deferred** is
Ready grey plus pause bars; an **unknown** state is neutral grey with "?" (INV-11).

**One exception to stillness:** a closed Story's world keeps its gold city lights glimmering. It's
the chart's one living reward, and the reason a team wants to see the map fill with gold.


> **Blue also powers hero craft (2026-10-13).** Hero energy is blue too (06 §9, `art/energy.ts`), a
> deeper blue (`HERO`, 15 §2) than this ladder's progress blue, so a beam never reads as near white. Every beam,
> tractor and reactor a hero craft emits is that blue, at every rung. On the objects themselves, the
> ladder's own blue still means Underway. A rung's light lives on the piece (its
> cut lines, lamps and flares); a beam's blue says who is acting, not how far along the work is.

## 2. Why this ladder (research)
*Applies to: both views.*

- **Grey → blue → purple → gold is the most widely learned value ladder there is.** Color-coded
  loot tiers came from Angband, through Diablo (white, blue, gold), to World of Warcraft (grey,
  white, green, blue, purple, orange), and most games have used them since
  ([Loot (video games), Wikipedia](https://en.wikipedia.org/wiki/Loot_(video_games))). Players read
  purple as "nearly the best" and gold as "the best" without being taught.
- **Blue for in-progress is the norm in work tools.** Atlassian's lozenges use "inprogress" (blue)
  for current status, "success" for completed, and default grey for "to do" or "not started"
  ([Atlassian Design, Lozenge](https://atlassian.design/components/lozenge/lozenge/examples)). ADO
  colors its In Progress state category blue as well.
- **Shape carries state, not only color.** Carbon's progress indicator draws not started as an
  outlined circle, current as a half-filled circle, and completed as a circle with a checkmark
  ([Carbon Design System, Progress indicator](https://preview.carbondesignsystem.com/building-blocks/core/components/progress-indicator/guidelines)).
  That's the same simple → fuller → final-form pattern as rung ornament, and it keeps INV-20 (hue is
  never the only signal).
- **Motion means "working".** Looping animation signals that the system is actively working
  ([Lollypop, Progress indicator design](https://lollypop.design/blog/2025/november/progress-indicator-design/));
  guidance also warns against motion that's decorative or excessive
  ([Eleken, Progress indicator UX](https://www.eleken.co/blog-posts/progress-indicator-ux)). So
  motion belongs to underway work, and done work goes still. The art of the time got this backwards
  (gold motes and a breathing check on finished work; fixed 2026-10-01, §6).

## 3. Mapping ADO states to rungs
*Applies to: both views.*

The mapping for every pack (SDLC, Todo, CRM), state by state, is
[15 §3, States → rungs, by pack](15-reference.md#3-signal-ladder). (Moved there on 2026-10-13; this
section's SDLC table duplicated it.) The reasons behind the SDLC mapping:

- **Ready** holds everything not yet started: New, Draft, Ready for Review and Ready. Ready for Review
  stays on Ready (§8, decision 1).
- **Nearing** is Resolved and Ready to Accept: development is done and the work is with quality or
  product. Ready to Accept sits a step further on (more gold).
- **Tasks skip Nearing**, and so do PRs: a PR's Nearing would need review votes, which are shown
  on its plate only (the stat line, 15 §6 `pr-stat`), never on the ladder (23 B1). Votes change no rung, colour,
  ornament or motion.
- **Off the ladder:** Removed (every type), Rejected (Bugs, with a strike) and abandoned PRs.
  Deferred is Ready plus pause bars.

Within Ready, **New** is the bare silhouette (a sketch). **Ready** and **Ready for Review** add the
first solid form, still muted. That's a step in shape only, not color.

## 4. Each object on the ladder
*Applies to: the v0 views.*

Each object keeps one part as its identity and lets another carry the rung. The look at every stage
is the one table in [06 §6](06-visual-brief.md) (moved there on 2026-10-13; the two tables had
drifted).

| Object | Identity (never changes with the rung) | Carries the rung | Accomplished ornament |
|---|---|---|---|
| **Star** (Feature; a pod's star by its share) | The warm core | The **corona** | A still gold eight-point **starburst crown** (the mid-century Googie starburst). It replaced the white dwarf |
| **Planet** (Story) | The world's seed palette | **Rim light and halo**; the surface evolves from barren to lush | Lush in a soft gold halo, city lights glimmering (the one exception to stillness) |
| **Anomaly** (Bug) | The spiked silhouette | The **glow** and the ripples | **Sealed**: the spikes fold into a small gold faceted knot, still |
| **Cargo vessel** (PR) | The train of cars | The **trim** stripe and running lights; blue motes on its route while open | Gold trim and check, docked, still; its route a faint, still gold line |
| **Mission point** (Task) | The pin | The pin's head and its pedestal | A faded pin with a still gold check |

**Source:** `chart/art/{star,planet,anomaly,infrastructure}.ts` · **Update when:** an object moves
its rung to a different part.

**Contrast in practice:** a sector with one active Feature should show that star first, closed ones
second as warm gold, and pending ones last as quiet grey shapes. The same goes inside a system
(planets) and a close-up (pins).

## 5. Motion, by rung
*Applies to: both views.*

The tempos and activity levels are in [15 §3, rung motion](15-reference.md#3-signal-ladder). The
shape of it:

| Rung | Intensity | Tempo | Examples |
|---|---|---|---|
| Ready | Minimal | Still, or a very slow breath | A barely breathing outline; Solar's sensor contacts |
| Underway | Full | The shared progress beat | Ripples, pulses, route motes, corona turn; Solar's glowing cut lines |
| Nearing | Strong, settling | A quicker beat, smaller amplitude | The same motions, quicker and lighter; Solar's violet work light |
| Accomplished | Burst, then none | One accent or maneuver on the transition, then still | The starburst flares once; the check strikes on once; Solar's grand gold flare, and its gold outline flaring, then settling |

Ambient object motion (rotation, window lights, ship bob) is identity, not state. It stays on all
rungs, at the scale tempos in 06 §7.

## 6. What changes from today
*Applies to: both views.*

All of this was done on 2026-10-01; the list is kept as the record of what the ladder replaced.

- **Retired:** readiness cyan (the survey grid and new pins become Ready grey); the white dwarf;
  gold unloading motes on completed PRs (motes move to active PRs, in blue); the breathing check;
  coral as a Bug *state* color (coral stays only for genuine alerts, such as sync errors).
- **Selection reticle:** amber is too close to Accomplished gold, so the reticle is ivory
  (white-gold; proposed here, built 2026-10-01, §8). It's the strongest line by shape and weight, not
  by a ladder color.
- **Routes (v0 views):** take their PR's rung color (blue when active, gold when completed).

## 7. Are we nailing the oil painting?
*Applies to: both views.*

Honest assessment: **partly.**
- The nebula skies and planets come closest: soft fBm, painterly terminators, warm and cool light.
- The mechanical art (ships, stations, vessels, pins) reads as clean vector illustration: smooth
  gradients, perfect edges.
- The labels and panels are rightly crisp, but nothing yet says "brush".

**Built (2026-10-01), following the 06 §1 layer rule.** The painted universe is painted; the chart
layer and the annotations stay crisp for legibility. Code: `art/paint.ts`.

| Layer | Treatment | Cost per frame |
|---|---|---|
| Skies | `PaintFilter` (radius 4, sharp sectors) + `ImpastoFilter`, baked at full resolution: big flat strokes following the swirls of gas, value planes kept out of the darks, lit ridges; stars baked as a separate crisp layer on top | None (baked when the scene or size changes) |
| Celestial bodies (stars, planets, anomalies, galaxies) | Live `PaintFilter` (radius 3, sharp sectors, strokes along the form's contours, value planes) + `ImpastoFilter` (ridges and silhouettes lit warm from the upper left, shadowed cool) | Two filter passes |
| Mechanical art (ships, stations, vessels, pins) | Ships, stations, and vessels are 3D hulls (`hull3d.ts`) painted face by face in gouache value planes: a warm key from the upper left, cool shadows, a cool bounce light, small glints, and a slight value wobble per face like separate brush touches. Pins use the gradients in `lit.ts`. Window lights bloom as small dabs. **No filter**: the faceted gouache is already the painting, and the impasto pass muddied its facet edges (removed 2026-10-02) | None |
| Whole picture | `CanvasTooth`: a baked canvas-weave tile in screen space, at 16% | One quad |
| Kept crisp | Mechanical art (ships, stations, vessels, pins), chart lines and routes, the reticle, off-ladder marks (pause bars, ghost dashes, strike, "?"), DOM labels | — |

In Solar (2026-10-12) the same split holds: worlds and asteroid rock are celestial and take the live
paint; hive ships, dreadnoughts and the fleet are hulls and stay crisp; an asteroid's rigging and
platform, the stations' satellites and every role outline (`art/aura.ts`) are crisp marks drawn over
the paint, which would otherwise smear a thin line away.

**What made it read as paint rather than blur** (2026-10-02 tuning):
1. Sharp sector selection: a high variance exponent, so pixels take the calmest sector rather than
   a blend.
2. Strokes along contours, not one direction: a single direction reads as rain.
3. Impasto lighting of the ridges.
4. Full-resolution sky bakes: upscaled strokes are blur.

**What to avoid:**
- Value banding in near-black space, which crushes it into ragged black blots.
- Impasto on faint gradients, which turns them into zebra stripes; it's now thresholded.
- Glow dabs on closely spaced windows, which merge into a white wash.

**Technique.** The generalized Kuwahara filter, after Papari: four overlapping sectors, each pixel
taking the variance-weighted mean, so flat areas become strokes and edges stay sharp. Its
anisotropic variant follows edges better but is far costlier, so it's left for later. The glaze nods
to Bonestell's thin oil glazes over strongly raked light, and the gouache bands to McCall's
illustration. Sources:
[Maxime Heckel, On Crafting Painterly Shaders](https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders);
[Chesley Bonestell, Wikipedia](https://en.wikipedia.org/wiki/Chesley_Bonestell);
[PixiJS 8 Filters](https://pixijs.com/8.x/guides/components/filters).

**Performance.** `tests/e2e/perf.spec.ts` measures frame times in the densest system and close-up,
painted and plain, and writes `test-results/perf-report.json`. At 2026-10-02, after the stronger stylization, both held the display's
120 Hz (mean 8.3 ms, p95 9.2 ms), painted or plain; the paint cost was too small to measure. The
harness's hidden window's refresh varies from run to run (8.3 ms, about 120 Hz, on 2026-10-29; 16.7 ms, 60 Hz, on 2026-10-31); a like-for-like
check uses `STAR_CHART_TEST_SHOW=1`. Budget: p95 ≤ 2 vsyncs of the display, plus 2 ms (the spec measures the vsync interval in its window as the median
requestAnimationFrame delta, and the 2 ms is the profile's `render.budget.toleranceMs`; 15 §11). On 2026-10-29 the window measured an 8.3 ms vsync,
so the budget was 18.6 ms. The dense system and close-up pass (painted p95 9.3 and 9.1 ms, plain 8.9 and 9.1 ms, paint cost ≈ 0).
The same spec also times Pulsar Pod (Halcyon Reach, Sprint 41, 20 captains) at rest, playing at 1× and 4×, and across seeks
(23 F10; `test-results/perf-pulsar-report.json`). Measured 2026-10-29 against the same 18.6 ms budget: at rest p95 25.1 ms,
playing p95 33.8 ms at 1× and 41.6 ms at 4×, so all three miss it; seeks land in p50 118 ms and p95 194 ms (bound 250 ms).
Re-measured on a quiet machine at block A's end (2026-10-29): Pulsar's p95 is 25.1 ms at rest, 33.4 ms at 1× and 41.7 ms at
4×, the same as under load, so the cost is the scene's, not the machine's. B1 (27 v1.4) put every plate at T4 Sky at rest, with no filter or text shadow; it did not move Pulsar. Measured 2026-10-31 on a quiet machine (vsync 16.7 ms, budget 35.4 ms), p50 / p95, before (start commit) then after: at rest 32.4 / 34.3 ms then 33.2 / 34.2 ms; 1× 33.3 / 50.0 then 33.3 / 50.0; 4× 33.4 / 50.1 then 33.3 / 50.1; seeks p95 196.6 then 203.8. The cost is the Pixi scene's, not the plates' (probes: all holo filters off, the label layer hidden, paint off: no change), so the same scene lands on a different side of the budget depending on the window's refresh: at 60 Hz, rest (p95 34.2 ms) passes the 35.4 ms budget, and playing at 1× and 4× (50.0 ms) misses it; at 8.3 ms, all three miss (2026-10-29). The budget is judged at each run's measured vsync (the reports carry `vsyncMs`); the Pulsar p95 assertions stay soft, and C3's relative gain (same run, alternating rounds) is what the final check judges Pulsar by. C3 (2026-11-01) profiled the GPU side: the cost is the role outlines' filter chains (about 400 offscreen passes a frame, each on a tiny target), and caching them (`auraBake`, 15 §11) cuts 4× playback from 884 draws and 404 passes to 184 and 8.5, and Pulsar's p95 from 33.4-34.0 ms to 17.6 ms (about 47%, same run, three alternating rounds, 1× and 4×). The cut cannot be made pixel-identical to the live filters (the live rim ignores its container's alpha, its glow is clipped to the keyline's box, and its antialiasing depends on the device pixel ratio; the baked outline now reads within about 0.7 of the live contrast but `c3-aura-diff` still fails), so by HG-C's decision (2026-11-01) it ships on for `tablet` and `phone` only; the absolute budget stays soft and relative gains are judged. Note: [C3 profile note](progress/v1.4/work/C3/profile-note.md). Full note: [slice-1.3-F10](archive/progress/slice-1.3-F10.md).

**Compare.** Press **P** in the app or the gallery to toggle the paint.

**Pixi gotchas found on the way:**
- A filter's uniforms must be a `UniformGroup`, not a plain object, or the filter renders nothing.
- A uniform shared with the vertex shader (`uInputSize`) must be declared `highp` in the fragment,
  or the program fails to link and also renders nothing.

## 8. Decisions (2026-10-01)
*Applies to: both views.*

1. **Nearing** = Resolved and Ready to Accept. Ready to Accept means development is complete and the
   work is with quality or product for final review. Ready for Review stays on Ready.
2. **New vs Ready:** every object shows the step from sketch to first solid form, on our own
   idealized terms for now; revisit when real ADO data arrives.
3. **Selection:** the reticle and the selected label edge are ivory.
4. **Bugs:** anomalies change color entirely with the rung; coral is now for alerts only.
5. **Painterly pass:** a separate step, after the ladder; built, see §7.

**Pods (decided 2026-10-07):** a Sprints pod's star uses the Feature stages for its sprint's
progress: `feature.faint` empty, `.ready`, `.active`, `.accept` (Nearing at three quarters), and
`.whiteDwarf` all done. It's the one aggregate look, and it applies only to pods, never to a work
item (02 INV-05).

**Loading energy (decided 2026-10-07):** the effects that play while data loads (06 §3) use the
galaxy's cobalt and violet, and the aurora's blue and purple. That's an exception to keeping ladder
hues for states. It's allowed because the effects are brief and always moving, so they never read as
a work state.

**Implementation notes.**
- The stage keys in `state-mapping.json` (such as `feature.whiteDwarf`) are contracts, so they keep
  their names; only their looks changed.
- The burst on reaching Accomplished is a playback accent, so it arrives with slice 2.

## 9. v1: the rung carried by light (13 §4, §9; amended 2026-10-12)
*Applies to: Solar.*

v1's Solar view keeps the ladder and adds objects whose **own colour is fixed**: a hive ship in the
hostile palette, a planet's world line, a station's faction colourway, a ship's colourway. Their hue
is identity, not state, so **the rung is carried by their light**: rim, halo, cut lines, work light,
lit windows, or its fire. (Threats no longer carry a lock mark, removed 2026-10-12 as hard to read.
An outline says what a piece is: the role colour, Deadly Red or Opportunity Blue, on every open rung,
wireframe contact included; victory gold once Accomplished; none when Off. It never marks the rungs
between. Each outline holds at least 3:1 against the night sky, red, blue and gold alike at rest (27 B3; gold flares to full brightness at a victory, then settles), and wears a thin dark keyline so its neighbour is dark on any backdrop; the keyline is the outline's own edge, with no hue or motion, so it is not an ornament. Measured in 15 §8, 23 C1.) The rung colours and beats are the ones in §1 and §5; values in
[15 §3](15-reference.md#3-signal-ladder). Hue is still never the only signal (INV-20): every rung
also changes form.

| Object (13) | Fixed colour | Ready | Underway | Nearing | Accomplished | Off |
|---|---|---|---|---|---|---|
| **Seat planet**, by its own share (02 INV-05) | Its world line (terran, glacial, volcanic) | Share 0: grey rim, harsh barren world | Under ¾: blue rim and halo on the beat; the surface starts to turn | From ¾: violet rim, gold creeping in | Share 1: a soft gold halo, still but for its settlements' lights | — |
| **Asteroid** (objective) | Its material (metal, crystal, energy); an Opportunity Blue outline while open | Rough, worn stone; New: a grey radar wireframe | Laser-cut facets; **cut lines glow blue** on the beat | Gantry arches rising over it, crane jibs at the tips in **violet work light**, gold creeping in with the step | A **round orb** (22 A12): a gold hoop round a compact orbital mine (two crossing catwalk bands, gold rivets) in low orbit, gently lit gold, its outline a victory-gold circle, so done work reads round at any size | A drifting ghost |
| **Hive ship** (threat) | Its hostile colourway; a Deadly Red outline while open | Solid and dormant, running lights breathing; New: a grey wireframe contact | Bristling with fire, absorbed by shields | Venting sparks, cracked plates, frantic fire | Breaks apart (the strike run), leaving a ruin cloud with glints of gold; then an **orbital research platform** in low orbit, the hulk caged in titanium with gold windows, bristling with eight sharp wreckage spikes (22 A12: an **asterisk**, told from the asteroid's round orb by shape), its outline victory gold round the spikes | Warps out, then a ghost (Rejected: struck) |
| **Captain ship** (agent) | Its colourway | Carries no rung (as in v0) | | | | |

- **A station carries intensity, not a rung.** Its lit windows and bays, its engine glow and the
  Mecha cannon swell with its own share of linked pieces done, 0 → 1 (02 INV-05). Its satellites
  never move it.
- **A station's form is not a rung (2026-10-13).** Its second form says a PR merged into it in the
  round so far (13 §4.4), nothing more. The flash at the joints as it transforms, and the faint
  breath of a Wars station's seams in its second form, are ornament, off the ladder. Both are the
  at-rest hero blue (`HERO_GLOW`, `chart/art/dreadnoughts.ts`), not a rung colour. *Open for
  HG-V3′:* the seam breath runs on a 12 s sine, the same tempo as Ready's slow breath (§1). A station
  carries no rung, so it can't claim Ready, but beside a Ready piece the two may read as one signal.
- **Idle density is not a rung signal.** Where people worked lately the idle life is a little busier
  (13 §4, Idle life; `ViewNode.activity`). It says where work is happening, never how far along
  anything is, and it never uses the 2.4 s or 1.6 s beat or gold.
- **Satellites** are drawn by slot (23 C6): one tender shuttle per open attachment, in its own slot, "+N" for the open ones beyond 6 (a waiting PR takes the first slot that frees). A settle
  plays the satellite cycle (05 §8), and a merge docks with a gold bay light, both on the PR's own slot. A closed
  PR's slot empties and no other moves. Per-slot rung looks still wait on the art. Guards are visual only for now.

- **Steps** climb their own ladder on their parent: an asteroid's augmentations (an outline waiting,
  a plate going on under a blue work light, a plate fixed with a gold rivet) and a hive's weapon pods
  (charging while New or Active, dark and disabled once Closed). A step never moves its parent's rung
  (INV-05). (Superseded 2026-10-13: "empty socket, lit rig, finished module" and "marked, under
  fire".)
- **The sketch is a sensor contact.** v1 draws New as a grey radar wireframe on every piece, the
  same step in shape the ladder already has (§3).
- **The hostile palette never carries a rung.** Its reds are a threat's identity; a threat's rung is
  its light, fire and form (superseded 2026-10-12: "its lock and its form"). (The threat light on the
  frontier belt, identity too, retired in 19 S2: the belt is never red.) No hero colourway uses the hostile palette or leads with a ladder hue
  (06 §9).
- **Off-ladder marks** are unchanged: ghosts are desaturated and dashed, Deferred adds pause bars,
  and an unknown state is neutral with "?" (INV-11). The hive has no deferred or unknown look of its
  own, so a deferred threat shows Ready and an unknown one shows as a ghost (17 W2-T3).
- **Packs map states to rungs** (`MappedState.rung` and its flags, 03 §5d). Every pack's mapping is
  in [15 §3](15-reference.md#3-signal-ladder). A parity test (`tests/unit/signal.test.ts`) keeps
  SDLC's equal to `SIGNALS` in `art/progress.ts`. The Todo and CRM packs reuse v0 stage keys, so
  their rungs read the same way (`packs.test.ts`).
- **Guides use cyan, never a rung colour**: the frontier belt (06 §9). (Superseded 2026-10-12:
  formation halos, no longer drawn.)
- **Finales are not rungs** (2026-10-13). Homeworld complete, All clear and the round's end
  (06 §9) use the Accomplished gold and hero blue they already own, after the closes that earned
  them. They never mark a piece's rung.
- **A vacated homeworld is not a rung** (23 C3, 2026-10-28). A planet that holds nothing at the playhead
  dims its surface and puts its lights out; it adds no colour or ornament and marks no piece. It has no
  work, so it has no state to show; its inspector says why it is there (13 §3). Review: the gallery's
  `seat · vacated` cell. First light (v1.4 B4) plays once, on a seat's first arrival in the round, as a transient
  sweep of lights; it isn't a rung, and the look at rest is unchanged.
