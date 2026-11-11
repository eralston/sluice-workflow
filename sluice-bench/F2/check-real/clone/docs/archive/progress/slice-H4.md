# Slice H4: Playback in the scene

Started 2026-10-08, from the user's first play-through of a real sprint. H3's time to first look held
up (`stream-look` 0.9–1.4 s in the dev log), but playing the sprint showed four faults, and the dev
log and the code explained all four.

## What was wrong, with its evidence
- **The scope ran away.** One sprint grew **575 → 702 → 7,501 → 8,020 members** inside a single
  stream, spending **11,691 calls** (6,546 history, 2,896 review, 1,981 PR) on work outside the
  sprint while the scene's own history waited (`waiting: 6233`). H3's `closure()` re-ran on every
  drain pass and re-seeded its frontier from *every* member, so each pass dragged in the ancestors'
  own subtrees. This was the root cause of most of what followed.
- **Playback played the whole bundle.** `buildBeatSchedule` filtered by time only; the scene filter
  existed but just behind the H toggle, and `SPRINT.sceneKeys` and `SECTOR.sceneKeys` both returned
  `null` (= everything), so at a sprint even H did nothing.
- **The scene didn't open on its end state.** `attachHistory` pinned the end only on the *first*
  attach; every stream reload re-seeked by source time and dropped `'ended'`, and a scene change
  didn't re-pin at all.
- **PRs and repos never arrived.** A PR draws no station and no vessel until the linking item's
  *updates* load: `traffic.ts` built stations only from `link_pr_added` events, so a PR known from
  current state alone sat in the bundle, invisible.

## Decided with the user (2026-10-08)
- **The playhead starts at the end of every scene;** the first Play rewinds.
- **Playback plays only the scene's own events**, and **H becomes "the big moments"** — its High
  beats, in the 30 s budget.
- **The player is ready when the scene and everything below it is complete.**
- **The moved story is fixed with one WIQL query,** not a database index.

## Built
- **The scope is the sprint's own.** The closure walks out from the sprint's **roots** only, once per
  set of roots, in the full sync's order (down, then up, ancestors never feeding the downward walk).
  `MAX_SCOPE_MEMBERS` (3,000) is the backstop, with `SCOPE_CAPPED_NOTE` and a `stream-capped` log. A
  failed closure leaves `filledAt` null, so the next open streams it again instead of looking complete.
- **Migration 004** indexes `events (org_key, entity_key)`: `rebuildDerived` deletes per entity key,
  which was a scan per entity. It clears nothing.
- **The scene's own schedule.** Every level has real `sceneKeys`; `subtreeKeys` is now a BFS over a
  per-bundle link index (it was a fixed-point pass over every event, per call), and `sceneEntityKeys`
  is memoised per bundle and scene. `scheduleFor` filters by default; the recap follows the scene.
- **A scene's keys include its captains**, so a reassignment that takes a ship away is still its news
  (its jump trail). Without this, a departure drawn in the scene had no beat to play it.
- **The playhead opens at the end.** `sceneChanged(scene)` builds the new scene's schedule and holds
  it at the end; `attachHistory` keeps `'ended'` across a stream reload. The play button shows **↻**
  with "Play from the start".
- **Complete coverage below the scene.** `inScene` gained ever-semantics and ancestors (a Feature was
  previously deferred forever at a pod focus); a pod's PR records, review votes and pictures are
  `fill`; identities are read in the look, so assignees aren't "Unknown".
- **A PR docks as soon as its record is known:** `traffic.ts` seeds stations from `link_pr`
  observations and current links too, both playhead-independent, so stations stay put across a seek.
  They don't sway the row's barycenter, which still follows the routes actually drawn.
- **Ever in the sprint, in one query:** `sprintItemsEver` (`[System.IterationPath] EVER`), run as a
  `fill` task off the first-look path, with a fallback to the daily samples on a 400 and a probe row.
  The fake ADO evaluates `EVER`, and `noEver` exercises the fallback.

## Departures from the plan
- **The end-pinning lives in `nav.render`, not the playback subscriber.** Re-rendering from the store
  subscriber ran *between* nav's store update and `chart.show`, which hijacked the mount, cancelled
  the navigation's transition and left the wheel lock at `Infinity` — wheel zoom-out stopped going
  back (caught by `slice1`). `sceneChanged` is quiet: the caller draws the new scene.
- **No load worker.** Still not needed; measure before moving `load()` off the main thread.

## Contracts and docs changed
- **02:** ever in the sprint (one query, samples as backstop).
- **03 §5c:** the closure's bounds, the member cap, history waiting for its scene.
- **04 §5b:** the `EVER` query and its fallback; the class table; approvers at `fill`.
- **05 §2:** a scene opens at its end. **§3:** the default schedule is the scene's; H is the big moments.
- **06 §3:** the ↻ button.
- **07:** this slice.

## Checks
- **Unit (241 pass):** `tests/unit/stream.test.ts` — the streamed scope's member count **equals the
  full sync's**, and still does after several focus changes (the regression test for the runaway);
  the `EVER` query finds 9105 in one call; the fallback fires on a 400; a leaver materialises under a
  pod focus; a PR docks with **no** item history at all. `tests/unit/sceneplay.test.ts` (new) — a pod
  plays only its own, a pod's events are part of its sprint's, filtering only ever drops beats, and
  state is still the whole scope's.
- **Golden:** only `inView` (every level now has keys, plus captains) and `highlights` (High-only)
  changed. Projections, the unfiltered schedules and follow are untouched, and no key was lost.
- **e2e (113 pass):** `sprints.spec.ts` — each scene opens at its end with ↻, a pod has no
  out-of-view ruler ticks, and Play starts from the beginning. Several older tests were revised
  because they assumed absolute beat indices or the old "same moment" rule: AC-20, AC-21, the jump
  trails, the History tab, and the follow-abandon test. `History.tsx` gained `data-beat` so a card's
  own beat can be named instead of hard-coded.
- **Driver:** `npm run drive -- tests/drive/steps/sprints.ts --paradigm sprints` — the sprint and pod
  dumps both show `status: ended` with `x === totalMs`.

## Known limitations and open questions
- **A body that left both the sprint and the pod's Area Path** is still only found by the daily
  samples (`EVER` has no `UNDER` form). It arrives at `idle`. **Deferred to slice 7** (2026-10-09).
- **Beat counts can coincide** between a sprint and a pod even though the pod's events are a strict
  subset: grouping absorbs the dropped ones. The subset property is what the unit tests assert.
- **Greedy coverage is still about 2 calls per item**, so a 575-item sprint is roughly 1,150 calls and
  the player can take a minute to be ready at the sprint level. A tenth of H3's 11,691.
- **HG-H4 passed (2026-10-09):** the user watched a real sprint and saw movement, plus work arriving
  and departing. H1, H2 and H3 were signed off at the same time.
- **Left for later (decided 2026-10-09):** Backlog moves onto the streaming engine just after
  slice 5. The gallery's Arrive/Depart row and "Filling in"'s N of M are **deferred to slice 7**.
  **H1–H4 are closed:** every open item of theirs now has a home in slice 5 or slice 7.
- **The original gate wording:** the user opens their sprint and plays it. The dev log should show `stream-done.members`
  within about 2× the sprint's item count, no `stream-capped`, and total calls down roughly an order
  of magnitude.
