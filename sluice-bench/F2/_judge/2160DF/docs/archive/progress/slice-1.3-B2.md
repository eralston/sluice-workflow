# Slice 1.3-B2: a station's last pipeline run

**Status:** built 2026-10-27; waiting on HG-B (this item's part). Plan: [23-v1.3.md](../23-v1.3.md) Block B. Fixture data only (INV-18).

## 1. What was built
- **The line.** A station's expanded plate shows `Last run: passed · 2 h ago` above its PR rows, with a neutral dot; the
  repository's Inspector body shows the same line (*Pipeline*). Words: passed, partly passed, failed, canceled,
  running, queued. Pure code in `src/shared/runLine.ts`; drawn in `holoRows.ts` (`.holo__run`, 9 px, T2's subtitle colour).
  **Tones** (15 §6 `run-line`): a soft green `#6EDC82` for passed, partly passed, running, queued; a light cool slate `#B4BCC9` for failed and
  canceled. Neither is red, in the ladder (§3) or a hostile colourway (§2); the green is at least 40 apart in RGB from the fleet's Seafoam,
  `--cyan` and the ladder (tested). The slate is a grey, lighter than the ladder's two, and a dot beside text. Every result has its own shape
  (full, half, ring, dotted ring, hollow diamond for failed, bar for canceled), so colour never carries it alone.
- **No animation.** Guards stay idle art: no event, flare or fact in the timeline. 13 §4.4 says so; **Q7 moved to §10 as decided.**
- **R4.** Every station's list carries `run` (empty text when none read), so the line's height is reserved from the first draw.
- **Data.** The **Builds API** (not Pipelines runs: one call per repo answers "latest on the default branch"; Pipelines needs a
  pipeline list first and cannot filter by repository): `GET {project}/_apis/build/builds?repositoryId&repositoryType=TfsGit&branchName&$top=1&queryOrder=queueTimeDescending`
  (queue order, not start order, so a waiting build counts). New client family `builds` (client, activity phrase, quiet in the activity list, probe row with a Build (read) note on 403).
  `parseBuildRun` maps status/result. **A 401 on builds is a missing Build scope** (review fix): quiet in `isQuiet`, never rethrown; any of 401/403/404/400/409 stores "read, no run" and backs off for the interval. A threads 401 changed the same way in B1 (see its note). The default branch comes from the repo list (`parseRepo`, now one parser for the three loaders).
- **Cache.** Migration `006_repo_runs.sql`: `repositories.default_branch`, `run_json` (`{ readAt, run? }`). Additive, no `DERIVATION_VERSION` bump. `putRepos` names its columns and never touches `run_json`.
- **Machinery reused.** `runStatsJobs` takes a second queue (`runs`, `onRun`): same two-at-a-time batches, throttle gate, stop on abort. 401 stops the run and stores nothing; 403/404 store "read, no run" (no line, no banner, no note); 0/408/429/5xx store nothing and retry at the next refresh; a failed call never fails a load. Full sync reads inline (4 at a time, so AC-27 holds); the stream and level loads defer (`runJobsFor`, `runStatsInBackground`), the stream tells the view (`onRun`).
- **Cadence.** `RUN_REREAD_MS` = 15 min (15 row): a repo is read when never read or last read that long ago; a refresh inside the interval sends no call.
- **As-of.** "2 h ago" counts from the later of the last sync (`coverage.syncedAt`, else range end) and the run's `readAt` (on `entities.repos[].run`), on the plate and in the Inspector; not the playhead; the run is current state like B1's votes.
- **Fixtures.** DSL `run(repo, state)`; the fake serves builds (and `defaultBranch`), empty for a repo with no run; the bundle's repos carry `run`. Halcyon (`halcyon/runs.ts`): a seeded cycle over the repos, ages by hash (finished: 5 min to about 30 h; running: minutes); passed, failed, running, partly passed, canceled and no pipeline all appear among stations with PRs.
- **Drive steps:** `tests/drive/steps/run-line.ts`. Stills: `review/v1.3/B/B2-quasar-{failed,running,partly,passed,canceled,none}.png`.

## 2. Contracts changed
03 §2 (`RunState`, `RepoRun`, `RepoFact`), §4 (`entities.repos[].run`), §9 (migrations 005 and 006 listed; the new columns); 04 §3 (`latestBuild` row), new §6a-2; 13 §4.4 (guards text), §10 (Q7 decided), §11 (Q7 removed); 15 §6 (new `run-line` table); `tests/README.md`.

## 3. Checks
See the final report: typecheck, lint, `npm test` (goldens `solar.scenes.json` and `meridian.scenes.json` gain `run: { text: "" }` on every facility list, the reserved line; nothing else), `e2e:spec -- demo slice4 explore activity offline solar`, `e2e:keystone`.
New tests: `repoRuns.test.ts` (29), `halcyonCoverage` +3, `ado.test` +1 (probe), `demo.spec` +1.

## 4. Human gates
**HG-B (run line part):** `review/v1.3/B/B2-quasar-*.png`. Looked at: the line sits under the station's subtitle, quiet and legible at 9 px; retaken after the review fixes: the dot is a soft green mark or a slate one, a different shape per result (a hollow slate diamond for failed, a filled green dot for passed); the dots are small at 9 px but the shapes read; nothing reads red or alarming.

## 5. Known limitations and open questions
- The line shows the run as of the last read (at most 15 minutes old), not the playhead's time.
- A level load (feature or history step) has no channel to the view: its lines show on the scope's next load.
- A repo with no `defaultBranch` (an empty repo) is never read: no line.
- A 401 on builds is read as a missing scope, so a truly dead token shows through the other calls (reviewers, the PR record), not this one.
- Fixture ages: a Halcyon run can read `29 h ago`; the age bands switch to days at 48 h.
