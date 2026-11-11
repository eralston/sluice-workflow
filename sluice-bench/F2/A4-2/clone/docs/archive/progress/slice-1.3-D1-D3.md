# Slice 1.3 D1 to D3: All events, insignia on the beat, one facts view

**Status:** built 2026-10-28. Items: [23 §3 Block D](../23-v1.3.md#3-blocks), D1, D2, D3.

## 1. What was built
- **D3.** `scheduleFacts(h, pack)` is now `roundFacts` over the bundle's whole scope (key: the round's iteration for a
  round, `''` otherwise), so pacing and the scene fold once, one way. `paceFacts` wraps the fallback in `boardFacts` as it
  does for rounds. `roundFacts`' signature is unchanged. The old 60-line fold in `maneuvers.ts` is gone.
- **D1.** A chip `All events` in the player bar (`.transport__allevents`, `aria-pressed`), store flag `allEvents` (never
  persisted). `setAllEvents` rebuilds the schedule at the same source time (as Highlights does) with `budgetMs: Infinity`
  (no cap: no gap squeezed, no accent cut; review fix 1: a 240 s cap changed nothing on busy scenes because the default
  already overruns). No constant and no 15 row. Beats still silent are silent by rule (05 §3): Low, or a zero-length
  shape because no maneuver rule plays any of the beat's events (e.g. a field edit that moves nothing on the board).
  The chip is dimmed and disabled while Highlights is on (Highlights owns the budget).
- **D2.** `Director.insignia(awards, calledAt)` (optional; v1 interpreter implements it, `ChartApp.insignia` calls it and
  stamps `calledAt` where the beat is crossed, so a reintroduced wait would show; the hook's log keeps the last 64): the first
  insignia lights at the beat's start (delay 0, then 0.22 s apart), without the recap's wait-for-calm (up to 4.3 s) and
  forced past the ornament load gate. Hook `insignias()` returns each lit insignia's id and lag (asked for to lit).

## 2. Contracts changed
03 §10 hooks block (`insignias()`), 03 (`scheduleFacts`, `paceFacts`), 05 §3 (All events) and new §8.2b, 14 (file map),
tests/README. (No 15 row after review fix 1.)

## 3. Checks
- typecheck, lint, `npm test` (see final report). New unit tests in `tests/unit/maneuvers.test.ts`: `one facts view`
  (per fixture: `scheduleFacts` is the very object `roundFacts` builds; pace facts are its board) and `All events`
  (no cap: every beat the default accented stays accented, silent ones are silent by rule, same beat at the playhead's
  source time; and over the Halcyon round and pods through `buildScene(..., SOLAR, ...)`: at least as many accented, strictly more on some). Two assertions updated: `solarSeek` (area bundle's facts are `boardFacts(scheduleFacts)`;
  a piece never in scope is absent, not an empty-member piece) and `maneuvers` (`moves` holds board moves only).
- **No golden moved.**
- e2e: new `tests/e2e/allevents.spec.ts` (chip, strictly more accented beats on the busy pod: on/off, schedule kept at the playhead, off after relaunch; insignia lag
  under 400 ms). Stills in `review/v1.3/D/` (`D1-chip-off.png`, `D1-chip-on.png`, `D2-insignia-on-beat.png`).

## 4. Human gates
Review the chip's place in the bar and the insignia's timing by eye (HG: playback).

## 5. Known limitations and open questions
- With no cap a busy round runs long (Halcyon's round about 2000 s unbounded vs 1860 s default); that is the chip's point.
- `scheduleFacts` for a sprint sector now uses the sprint ref, sharing one memo with `paceFacts`.
- The chip is not in the keyboard help and has no hotkey.
- `scheduleFacts` for an area bundle no longer holds moves for off-board events; pacing for those now matches the scene.
- Unrelated failures seen from other batches in the shared tree: `packsPlay.test.ts` typecheck, `crumbs.ts` lint (D4-D6 work).
