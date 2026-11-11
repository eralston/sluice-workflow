# Slice 1.1-P1: Pod previews that match the inside, counts first (and the pod star's subtitle, L4)

Built 2026-10-14, following [19 §3](../19-v1.1.md#3-items) item P1, rules R3 and R4, the §5 decisions
(homeworld planets, an asteroid cluster by Story count, hive marks by Bug count, no stations or ships;
today's assignees first, then planets fade in as history adds people) and Q11 for L4's subtitle text.
Built on L1, L2, L6, L7, L8, N1 and S2 ([slice-1.1-L1.md](slice-1.1-L1.md) and after). N1's inspector
change (`PodBody`) shares a line with this item; its Remove from View is untouched.
**Waiting on HG-P1.** Review findings fixed the same day (seat slots under any history order, wider
rings instead of respacing, the subtitle's overflow, the count's scope recorded, 14's file table).

## 1. What was built
- **Solar's round has its own field source,** `solarRoundField` (`src/shared/hierarchy/solarRound.ts`).
  - It reuses the Sprints sector's order, member and pass-through, reading them through the chain as
    `solarSource.ts` already does, so `sprints.ts` is untouched.
  - In place of the v0 miniature (a planet per Story, an anomaly per Bug), each pod star gets a
    **preview** (`FieldSource.preview`, a `FieldPreview`). `solar.ts`'s `ROUND` uses it, and the v0
    Sprints round keeps `sprintField` and its miniatures.
- **What the preview shows** (`regionPreview`):
  - **Planets:** the region's seats, by the region's own rule (`seatsOf`, through the same board facts,
    `solarSource.facts`). Each planet has its homeworld's seed, so it's the same world you find inside,
    and its seat's own share at the playhead (`seatPiece`, now exported from `scene/project/solar.ts`
    and used by the region too).
  - **Rocks and hive marks:** the region's objectives and threats at the playhead, on the ladder, in a
    neutral Ready look (counts, not states).
- **Where it goes** (`src/shared/scene/project/preview.ts`, `PREVIEW`):
  - The planets sit on the front of a ring round the star, in 8 slots filled from the front outward at
    a fixed pitch. Each has a short orbit arc, as inside. More seats go on wider rings outside it (7,
    then 8 slots, each half a pitch round and 30% wider, `ringStep`). A slot's place depends on its
    number alone (`previewSlot`), so a ninth seat never respaces the first eight.
  - On the star's left, a sunflower-packed asteroid cluster, one rock per objective (up to 24). On its
    right, hive marks, one per threat (up to 5).
  - Everything is decorative: not selectable, not labelled, keyed to the pod. There are no stations or
    ships. The node kinds are the region's: `seat`, `objective`, `threat`, each with its asset.
- **Counts first (R4) with no reflow (INV-14), whatever order history comes in:**
  - First, everyone holding a piece in the region now (today's assignees), by key. ADO's first look
    has them all, and they're read from the round's own facts (not the board's), so this group is
    fixed from the first look; someone in it who isn't a seat keeps an empty slot.
  - The seats history adds are held back until every piece in the region now has its history
    (`coverage.history`), then arrive together, in the region's order: first those who held one of the
    region's current pieces, then those who held only pieces that have since left (whose histories
    can come later). The first version placed each as it came, by first-held time, but histories
    stream newest-changed first, so a later one could move an earlier planet (the review's finding).
  - When they arrive, each planet Arrives in its free slot (the scene's usual streamed arrival) and
    no other planet moves.
  - The preview's footprint is fixed (`reachX` 340, `reachY` 255, two rings), so the field's spacing
    never depends on the data.
- **The pod star's subtitle (L4, Q11)** is `Tidewater Array\Harbor Pod · 16 items` (`solarPodStar` in
  `solarSource.ts`). It's on the round's stars and on the region's star, so one pod star reads one way.
  The count is the preview's objectives plus threats, on the ladder only (see §5). The inspector keeps
  the done count (`Area Path · 16 items · 10 done`) through a new `ViewNode.detail`.
  - **It never runs past the plate** (`renderHoloPlate` in `chart/labels.ts`, `holo.css`): any holo
    subtitle splits at its last ` · `; that last part keeps its width, and what's before it gives way
    from its start with an ellipsis, so a deep path reads `…rbor Night Shift\Harbor Pod · 16 items`.
    The meta's text is unchanged.
- **Floors only on selectable nodes** (`GraphScene.setCameraScale`). Without this, the hive marks were
  drawn at a hive ship's 14.4 px floor, bigger than the preview's planets. 15 §5 already defines a floor
  as being for a selectable object, as the kinds' floors already were (`sizing.ts`). Every node on a
  Solar board is selectable, so nothing inside a region changed (`solar`, `density` and `solar-play`
  pass).
- **Drive:** `tests/drive/steps/v11-P1.ts`, for fixtures and for fake ADO.

## 2. Contracts changed, with doc edits
- **Shared:**
  - `FieldSource.preview?` and `FieldPreview` (`hierarchy/types.ts`).
  - `ViewNode.detail?` (`contracts/view.ts`).
  - New `solarRound.ts` (`solarRoundField`, `regionPreview`) and `scene/project/preview.ts` (`PREVIEW`,
    `projectPreview`, `previewSlot`). `FieldPreview` has no `slots`: a slot's place is its number's.
  - `solarSource.ts` exports `regionCounts` and `solarPodStar`; `solarSource.center` now rewrites the
    star's `meta`.
  - `seatPiece` is exported from `scene/project/solar.ts` (a refactor: the region's output is
    unchanged).
  - `field.ts` draws a source's preview and reserves its footprint. Sources without one (every v0
    level) are unchanged.
- **Renderer:** the Inspector's `PodBody` reads `detail ?? meta`. GraphScene's asset floor now needs
  `selectable`. A holo plate's subtitle is two spans in `.callout__meta` (`.holo__meta-head`,
  `.holo__meta-tail`); its `textContent` is the meta, as before.
- **Departs from 13 §2** (as 19 P1 says): the round's row and a new bullet describe the preview.
  Amended in the same change.
- **Doc edits:**
  - **13** §2.
  - **15** §5: the floors note (selectable only), and a new `preview` table, checked by
    `docTables.test.ts` (added to `GUARDED` and the value loop); after review, `ringStep` added,
    `seatSlots` reworded, `reachX` 330 → 340 and `reachY` 205 → 255. §6: the round's pod star plate
    row, with the subtitle's overflow rule.
  - **03** §5a: the field source's `preview`, `FieldPreview` (no `slots`), Solar's round and its slot
    order, the subtitle's overflow rule, and `ViewNode.detail` in the ViewNode block.
  - **14** §1: the `solar.ts` row (its own round source now), new rows for `solarRound.ts` and
    `preview.ts`, and `solarSource.ts`'s and `scene/project/solar.ts`'s exports.
  - **06** §3: the round row. §9: the pod star subtitle.
  - **12**: *Round*.
  - **19**: P1's and L4's **State**, and §5 decisions: four, then after review the slot row corrected
    and two more (the count is on-ladder work only, for HG-P1; the subtitle's overflow).
  - **tests/README**: a mapping row and the `v11-P1.ts` drive row.
- **Goldens, accepted deliberately** (`npx vitest run -u tests/golden/solar.test.ts`):
  - `solar.scenes.json`: only the region star's `meta` changed, at every playhead. Before the update
    the diff was exactly those 10 lines, and the counts agree with the old line at each one: 0, 16, 17,
    17, 16 and 0, 3, 2, 2, 2.
  - `solar.round.json` is new: the round at its end, with both previews. Accepted again after review:
    the wider `reachX` moves each pod star and its preview 10 world units outward (x only); no seat
    changed slot.
  - The v0 goldens (`sprint-pods.*`, the Backlog scenarios) are unchanged.

## 3. Checks
| Check | Result |
|---|---|
| `npm test` (856, incl. `solarRound.test.ts`: seats equal the region's, same seeds, kinds and decor only, counts 11 / 5; the subtitle and `detail`; v0 round unchanged; slots fill the front first, then a wider ring, 15 slots never touch and stay in the reach; a streamed first look → full history on pod-sprint keeps every planet and star in place; **new:** a synthetic pod where history adds two people in reverse first-held order, projected after every `changed` batch, keeps every drawn planet in place and ends with the region's 4 seats. Confirmed it fails with the gate removed. `docTables` `preview`) | Pass |
| `npm run typecheck` | Pass |
| `npm run lint` | **3 errors, none mine:** `chart/art/aura.ts` lines 92 and 226 and `tests/drive/steps/tmp-s1.ts`, all `no-explicit-any`, in S1's uncommitted work. `eslint` over every file I touched passes |
| `npm run e2e:spec -- solar explore sprints density` (solar's round test checks the subtitle, the preview's kinds, decor only, no v0 planets, anomalies, stations or ships; **new:** a 4-level path on Harbor Pod's plate keeps the plate at 220 px, the count inside it, and the path cut) | 36 passed |
| `npm run e2e:spec -- slice1 slice4` (v0 VC-1 pixel baselines, VC-2; N1's round in fake ADO) | 25 passed |
| `npm run e2e:keystone` | 38 passed |
| Drives (fixtures, and `--fake-ado pod-sprint --delay 400`) | Passed, no page errors; stills reviewed |
| Full `npm run e2e` | Not run (the run's final phase does) |

## 4. Human gate: HG-P1
Regenerate the stills with the drives below. An e2e run clears `test-results/`.
- **Fixtures:** `npm run drive -- tests/drive/steps/v11-P1.ts --paradigm solar` →
  `test-results/drive/v11-P1/`.
  - `01-round-rest`: Sprint 13's round. Harbor Pod has 4 planets below its star, 11 rocks on its left
    and 5 hive marks on its right. Lantern Pod has 2 planets, 1 rock and 1 hive mark. Both subtitles
    read `Tidewater Array\… Pod · N items`.
  - `03-round-long-path`: Harbor Pod's plate with a 4-level path set on it, reading
    `…rbor Night Shift\Harbor Pod · 16 items` (the note line gives the plate's width, 220 px).
  - `04-round-harbor-pointed` (the plate lifted) and `05-round-harbor-close` (scale 1.6): read the
    miniature itself. The planets are lit on their star-facing limbs, like the homeworlds inside.
  - `06-region-harbor`: inside, for comparison: the same 4 homeworlds. The inspector still says
    `Area Path · 16 items · 10 done`.
- **Fake ADO:** `npm run drive -- tests/drive/steps/v11-P1.ts --paradigm solar --fake-ado pod-sprint --delay 400 --name v11-P1-ado`
  → `test-results/drive/v11-P1-ado/`.
  - `01-round-first-look`: "Filling in", with today's assignees only. Lantern Pod has 1 planet.
  - `03-round-after-history`: once the stream is done, Lantern Pod has its second planet (its earlier
    assignee), and the first one hasn't moved. The note lines give each star's counts.
- **Judge:**
  - Whether the cluster (rim-dominated at the fitted zoom) and the hive marks read as "stories" and
    "bugs" beside the planets.
  - Whether rocks and marks on either side of the star, with planets below, is the right composition.
  - Whether the caps (24 rocks, 5 marks) are right.
  - **The count's scope** (19 §5): the plate's `16 items` and the rocks count on-ladder work only, as
    v0's line did, while the region's object list counts its Off ghosts too (12 User Stories, one of
    them Removed, and 5 Bugs). Kept as recommended; say if the ghosts should count.

## 5. Known limitations and open questions
- **The rocks and hive marks don't show state.** Every one is drawn Ready, because the decision was
  counts. Inside, finished objectives are platforms in orbit and Off pieces are ghosts. The preview and
  the plate count only on-ladder pieces, so Harbor shows 11 rocks and `16 items` while the region's
  object list counts 12 User Stories (one a Removed ghost) and 5 Bugs. Recorded in 19 §5 for HG-P1.
- **What can still move a planet while history streams:** two people who held *only* pieces that have
  since left the region can arrive out of order and swap slots (their histories can come after the
  region's own). And a new item joining the region mid-stream holds the history group back until its
  own history is in, so those planets fade out and back. Both are narrow.
- **History that never arrives** (an item whose history fails to load) holds the history group back
  for that region: the preview keeps today's assignees only. Inside, the region shows what it has.
- **A third ring** (16 seats or more) reaches past the reserved footprint. It stays clear of the next
  star (the field's step is 840 by 595), but the reach is sized for two.
- **The new planet's arrival** is the scene's usual streamed Arrive (a short spiral in along its orbit
  arc, fading up), not a plain fade. I didn't capture it mid-motion in a still.
- **P2's map key** isn't built. Because the round now draws `seat`, `objective` and `threat` nodes, the
  key under Solar will find those kinds in the round, which is P2's premise ("the key reads the same
  at both levels"). It still teaches v0's mapping until P2.
- **The rocks are small** (11 world units). At the fitted zoom the 2 px opportunity rim dominates
  each one, so the cluster reads as blue outlines over rock. Closer in, they're plainly asteroids.
