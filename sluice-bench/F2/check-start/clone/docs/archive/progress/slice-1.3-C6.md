# Slice 1.3 C6: per-slot satellites

**Status:** built 2026-10-28. Item: [23 §3 Block C](../23-v1.3.md#3-blocks), C6.

## 1. What was built
- **Slot assignment** (`engine/solar/compound.ts` `attachmentSegments`, review fix 1, orchestrator decision 2026-10-28:
  PROMOTE). Events are processed in time order (closes before opens at an instant), so the result depends on the
  history alone. A PR takes the lowest free slot when it opens and keeps it for life. With all six held it waits past
  the cap (counted in "+N") and, when a drawn PR closes, the earliest-opened waiting PR takes the freed slot from that
  instant. That waiting PR becomes a second `CompoundSlot` segment of the same key (one at a time); a drawn tender
  never changes slot. So at every playhead drawn = min(open, 6) and "+N" = the rest; it never shows with a free slot
  (this replaces interval first-fit, which gave a PR that opened under overflow a slot above the cap for life, e.g.
  `pr=1|pm=0` with one "+1"). New pure `slotMask(live, cap)` turns the live attachments into a bit mask.
- **Stage grammar.** `PieceState.slots` (`pm=<decimal mask>`, after `pr=`, canonical decimal only). `pr=` is kept: it is
  the count of every open PR, so "+N" = `pr` minus the drawn slots. `projectSolar` writes both.
- **Art.** `stationStage`/`parseStationStage` take `pm=` and `ds=` (the docking slot). Pure exported `shuttleSlots(state)`
  gives the mask, "+N" and the docking slot; `DreadnoughtView` keeps them from `applyStage`, so `tickShuttles` allocates
  nothing new per frame. Without `pm` the art fills by count (gallery, old stages). `DreadnoughtView.slotDir(i)`.
- **Dock of a PR with no drawn slot** (review fix 2): with `pm` present and no `ds`, `shuttleSlots` docks no tender
  (before, "the last drawn", which belongs to a PR that stays open). A no-`pm` stage keeps the old last-drawn dock
  (gallery). After promotion only a PR still waiting in "+N" lacks a slot.
- **Per-slot acts.** `CommandCall.act` carries an optional `slot` (`cmd.act(key, act, delayMs, slot)`); `CastView.slot` is
  set for an attachment's cast view; `FxHost.act`, `GraphScene.actView`, `AssetView.act(name, slot?)`, `Act<V>(art, stage,
  slot?)` pass it through. `shuttleTender` (launch), `satelliteCycle` (operate) and `powerLink` (dock) pass the PR's slot;
  `dock` puts `ds=` in the stage (that tender goes home, the others stay), `launch` and `operate` overlays aim at the slot.
  An act with no slot is whole-station as before.
- **Gallery:** tender cells "Slots 0, 2, 3 (gap at 1)", "Slots 1, 4", and "slot 2 docks".

## 2. Contracts changed
03 §5d (grammar, `PieceState`, per-slot acts), 14 §2.4 sketch and §9 D2/D6, 09 (satellites row), tests/README. No 15 row
(no new constant). 02 unchanged.

## 3. Checks
- typecheck, lint, `npm test` pass (see the final message for counts). New: `shuttleSlots` (gaps, reuse, cap, canonical
  `pm`, `ds`, docking incl. none for a PR with no slot), `stationSlotsInvariant` (every sprint fixture, Halcyon, pod-sprint
  and meridian-sprint, every pod, 71 playheads: bits(mask) = min(open, 6), compound slots distinct, "+N" = open - drawn, a
  tender that stays drawn keeps its slot), and the rewritten `solarLayout` compound tests (segments per key).
- **Goldens moved.** `meridian.scenes.json`, `solar.scenes.json`: facility `stage` lines gain `|pm=N` after `pr=` (every
  station writes its mask). Solar shows real gaps, e.g. `pr=6|pm=59`-style masks in the drive. Then the promotion change moved
  only two solar scene lines, both the tide-gateway/d3e7ad28 station: `pr=2|pm=32|mg=4` became `pm=34` (compound.slots gains
  `...21006@1`, `more` 1 to 0) and `pr=1|pm=0|mg=5` became `pm=2` (`slots` gains `...21006@1`, `more` 1 to 0): PR 21006
  was waiting in "+N" with free slots, and is now promoted into slot 1. `solar.plan.json` gains that station's second
  segment for 21006 (slot 1, from the promotion instant). Nothing else moved.
- Drive `c6-slots` (Harbor Pod, tide-gateway): `pr=7/pm=63` (one "+1"), then `6/63` (the waiting PR promoted when one
  closed), `5/59` (slot 2 empty: gap kept), `4/58`. Gap stills `C6-01..03-gap-*.png` are crops of the pod view.

### Per-slot acts, seen in the app (review fix 3, and the proof round)
New read-only test hook `window.__starChartTest.tenders(pk)` (03 §10 list; `DreadnoughtView.tenders()`/`bay()` through the
adapter and `GraphScene.tendersOf`): each drawn tender's slot, place in px from the view's origin and whether it is docking,
and the dock bay. Drive `c6-slots` seeks to just before tide-gateway's merge beat 24 and open beat 12, zooms to 5x the fit,
sets the rate to 0.2 and reads the hook every ~200 ms of wall time through the act.
- **Dock (merge beat 24, PR in slot 2; mask 63 to 59).** The hook shows slot 2 alone flagged docking, its distance to the
  bay falling 215, 201, 133, 92, 52, 2, 0 px over frames 5 to 11, then slot 2 gone; the other slots read `[0,1,3,4,5]` in
  every frame before and after (none moved to fill the gap, none left). The drive notes print this as `dock check`.
  Stills `review/v1.3/C/C6-dock-frames-24-before.png` (six blue tenders on the ring), `-24-0.png` (the author's ship and
  tractor arriving; one tender on the right has turned gold, the others stay blue) and `-24-1.png` (that gold tender now
  crossing the hull's disc towards a gold glow at the bay on the ring's left edge; the other five on the ring).
- **Launch (open beat 12, PR into slot 1; mask 1 to 3).** `C6-launch-frames-12-1.png` shows the launch overlay: a Progress-blue
  capsule with its glow and a trail from the hull's middle out to the lower left, along slot 1's own direction, the one
  existing tender elsewhere. By `-12-3.png` the overlay has gone; the second tender only appears when the stage lands
  (frame 5 in the hook: `[0]` to `[0,1]`), a beat after the capsule. That gap (capsule first, tender after) is as in v1.2.
- Earlier crops `C6-04..18-*` (5x, 0.55 s apart) are superseded by these.
Gallery: the review capture of the stations family is blank for cells outside the viewport of the tall section screenshot
(also the colourway and "every state" cells, which C6 did not touch); a still of the cell itself, scrolled to, is
`C6-gallery-tenders-step{3,7,8,9,10,11}.png`: step 8 shows three tenders (slots 0, 2, 3), step 10 the old dock.

## 4. Human gates
HG-C (with the rest of Block C): look at the gap stills and the gallery's tender cells.

## 5. Known limitations and open questions
- (Resolved in the fix round: "+N" with a free slot is gone, by promotion. A promoted tender appears in its freed slot
  when the stage lands; it is not flown in from "+N".)
- `jump`, `intake`, `cover`, `charge`, `transform`, `muster` stay whole-station. `operate`'s slot cue is a soft pulse only.
- Gap stills are crops of the full window (a station is small at pod zoom).
