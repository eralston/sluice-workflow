# Slice 1.3-B6 to B9: load count, partial history, Starting…, banner placement

**Status:** built 2026-10-27. Plan: [23-v1.3.md](../23-v1.3.md) Block B. Fixture data only (INV-18). Gate: HG-B stills in `review/v1.3/B/B6-B9-*.png`.

## 1. What was built
- **B6.** The streaming banner reads `Filling in · N of ~M reads`. `SprintStream.fillCount()` (main) gives N (queue) and M: until discovery is over (closure ran, no new roots) M = max(queued + finished, member count), shown with `~`; after, M = queued + finished, exact, no `~`. N never exceeds M (M grows). `scope.updated` carries `total` and `exact`; pure code in `src/shared/streamCount.ts`.
- **B7.** Per-item history reads that fail transiently (`failureTier` transient) are recorded per scene in `LevelState.history[].missing` (and `capped` when B5's feed hit its cap), surfaced as `coverage.played[].missing/.capped`. A ready player shows `⚠ History partial · N missing · Retry`, or `⚠ History partial · more on the next load` (no button) for a capped crawl alone. Retry = `history` level with `retry: true`: reads only the saved missing items still in the scope (`retrySet`), skipping ancestors, rescan, PRs. 403/404 are not "missing". The line hangs under the bar (absolute), so no reflow (R4). Sprint gathering widget unchanged.
- **B8.** `requestHistory` sets `historyLoad` with `jobId: ''` synchronously; the widget reads `Starting…` (Cancel disabled) until the first progress event. Cleared if the start fails.
- **B9.** `OverlayStack` measures the player's bottom (bar's full height, partial slot, ⋯ pop) into `--overlay-top` and the stack's own bottom into `--stack-bottom` on the stage. The error banner, the sync/quiet "Filling in" banner and the follow bar stack in that order, centred on the view; the map key starts below the stack and the zoom buttons below `--overlay-top`.
- **Review fixes.** M is monotone (deferred items counted; high-water mark per run); the banner says "reads"; Cancel during Starting… is remembered and sent once the job id is known; `played[].missing` is filtered by scope membership; Retry skips the Feature former-children block; the partial line has a fixed slot and dims (35%, not clickable) with a faded bar.

## 2. Contracts changed
03 (`played[]` missing/capped; `SyncLevel` retry; `scope.updated` total/exact), 04 §5a (partial and Retry), 05 §2, 06 §3 (plate wording, Starting…, partial line, banner). No 15 rows (no timings or tables). New test hook `showError(message)`.

## 3. Checks
See the final report. New: `tests/unit/historyPartial.test.ts` (7), a `stream.test.ts` case, `tests/e2e/partial-history.spec.ts` (5).

## 4. Human gates
HG-B stills: `review/v1.3/B/B6-B9-{plate-mid-load,partial,starting,banner}.png`.

## 5. Deviations from 23
None. Wording choice: capped crawl reads `History partial · more on the next load` with no Retry, since a re-ask would repeat the capped request.

## 6. Known limitations and open questions
- M's estimate is the member count; actual queued task count differs, so M can grow mid-load.
- A capped line has no button; the next scene load resumes the crawl.
- The partial line shows while the bar is faded in play; not styled differently.
- Sprint scenes' failed items stay in the existing "History stopped" path.

## Audit fixes (Block B correctness audit)
- **Plate cap vs the overlay stack (B9).** The measured `--stack-bottom` feeds `LabelMotion.topInset` (`plateTopInset`, `@shared/plateInset`), so a capped plate starts below the partial line and stacked banners. Unit: `plateTopInset.test.ts`; e2e: `partial-history.spec.ts` (the stack publishes its bottom).
- **OverlayStack idles:** ResizeObserver and MutationObserver on the stage, `.transport` and the stack's children, plus window resize, replace the per-frame measurement.
- **B7's `missing`**: a transient update-read failure inside the feed is now recorded (see B5 audit fixes).
- **`teams()`** de-duplicates concurrent reads (one in-flight promise per project). No abort on scope change (kept simple).
- **Test flake:** `avatars.spec.ts` waits for the crop dialog (heading and focus) before pressing Escape; the dialog opens after the dropped file is read, so under load Escape came first. Proved with `--repeat-each=3` beside a keystone run.
