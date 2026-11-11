# Slice 4: ADO ingestion via the fake transport

Started 2026-10-04, after HG-3 was signed off.

## Decided with the user (2026-10-04)
- **HG-3 is signed off.** The rest of the 3b review is deferred to [91](../91-ux-polish.md) (slice 6).
- **The user commits.** Nothing in this slice was committed by the agent.
- **ADO profile pictures are in this slice.** Ingest fetches each captain's picture once and inlines
  it as a `data:image` URL in the bundle, the same shape fixtures use.
- **The Connect UI sits behind the mode chip.** The FIXTURE/ADO chip opens it.

## Built
- **The DSL records what ADO would hold** (`fixtures/dsl.ts`, `simulate().ado`):
  - Per-item revisions and updates. Every update is one revision, as in ADO.
  - Parent links recorded on both ends. This shifted the parents' revision and update numbers, so
    the schedule goldens were regenerated. Only key numbers changed.
  - PR records, and the undated removal as an update with no date and no revision.
- **The fake ADO org** (`fixtures/ado.ts`, `toAdoPayloads(s, mapping)`):
  - It answers every call the client makes, in ADO's shapes: connectionData, projects, the area tree
    (`\Project\Area\…` paths), WIQL (only the client's own templates, including `ASOF` and the
    tree/MustContain link queries), workitemsbatch, revisions and updates (paged), PRs, PR work items,
    reviewers, VoteUpdate threads, work item states, and avatars.
  - Relation-only updates carry `System.ChangedDate` on odd IDs only, so both 04 §4 time rules run.
    `revisedDate` is realistic (the next revision's time, or 9999-01-01), and is never read.
- **The pure derivation** (`src/shared/ingest/derive.ts`) turns cached facts into the bundle. It
  follows 03 §§3–4 and mirrors `toHistory`:
  - Events, with the canonical link side.
  - Observations: `unknown` when undated, `observed_only` when seen only in current relations.
  - Membership from `historyFrom` on.
  - Captains, using the stored profile when there is one.
  - Unlinked PRs.
  - The derived `links` rows.
- **Parsers** (`src/shared/ingest/parse.ts`):
  - Revisions, updates, relations (the 04 §3 PR artifact regex, with the exact "Pull Request" name),
    PRs, and identities (groups dropped).
  - `approversAt`: VoteUpdate threads replayed up to `closedDate`, falling back to final votes.
- **Main** (`src/main/`):
  - `ado/http.ts`: the allowlist (the org's own origin and path, https, no redirects), at most 4 in
    flight, Retry-After, full-jitter backoff (1 s base, 60 s cap), and a pause when
    `X-RateLimit-Remaining` is low. Headers are never logged.
  - `ado/client.ts`: read-only calls named by endpoint family, and the api-version fallback (7.1,
    then 7.1-preview, then none), remembered per family.
  - `ado/probe.ts`: the 04 §2 matrix, including the timestamp-rule row and state-mapping mismatches.
  - `ado/fake.ts`: the fake transport, with an intercept hook for failure tests.
  - `db/cache.ts`, `db/migrations/001_init.sql`: SQLite via `node:sqlite`, WAL, the 03 §9 schema plus
    the additions below, one transaction per item with its checkpoint, and a wholesale derived
    rebuild per scope.
  - `sync/sync.ts`, `sync/wiql.ts`: the 04 §5 sequence:
    - Area discovery now, plus `ASOF` daily at 12:00 UTC back four weeks. Epic discovery by link
      query, plus former children from the Epic's updates.
    - Descendants by tree query (split under 32k characters), then former children from parents'
      `relations.removed`, until nothing new turns up. Then ancestors.
    - Hydrate 200 at a time with errorPolicy Omit. History from checkpoints.
    - PRs through ArtifactLinks, approvers, and the unlinked reconcile (created/closed in range,
      `searchCriteria.` prefix, then `…/workitems`).
    - Identities and pictures, captain profiles, and derive.
  - `credentials/store.ts`: `KeychainStore` (`safeStorage.encryptStringAsync`, with ciphertext in
    `userData/pat.bin`) and `MemoryStore`. Memory is forced in dev and test.
  - `ado/service.ts`: connect (only `https://dev.azure.com/{org}`), the probe, projects and pinning,
    the area tree and favorites (with unavailable and repair), the Epic chooser and search, sync jobs
    with cancel, `history.load` from the cache, web links and `openInAdo` from keys, cache stats, and
    Purge.
- **The renderer:**
  - The mode chip opens the **Connect panel**:
    - Fixture/ADO switch.
    - Org URL and PAT (the PAT field is uncontrolled and clears before the call).
    - Forget token.
    - Check access (the matrix).
    - Pinned projects.
    - Cache size, path, and Purge (asks once).
  - In ADO mode, the project inspector has **+ Save an Area Path** (the area tree, filtered as you
    type), **Repair** and **Remove** for favorites, and **Find an Epic** by ID or title (fixture mode
    too).
  - Opening a scope in ADO mode syncs first, behind a **sync banner** (phase, count, Cancel). Errors
    show in plain words with a dismiss.
  - A reboot (mode switch, connect, pin, or Purge) mounts the galaxy afresh. Before this fix it kept
    the empty galaxy's camera, and clicks missed.
- **`npm run dev:fake-ado`** runs the app against the fake org. Connect to
  `https://dev.azure.com/fixture-org` with any token, switch to ADO, then save Comet Crew from the
  area tree and open it. Its cache lives in `userData/fake-ado`, apart from a real org's.

## Contracts and docs changed
- **03 §2:** `RevisionFact.changedBy`, `PullRequestFact.closedBy`, and `IdentityRefFact.imageUrl`.
  The first two were already used since 3a.
- **03 §4:** AC-27 equivalence also ignores `coverage.notes`, because ingest adds the fixed
  area-sampling note and fixtures carry none. Observations cite `wi:{id}:u0` with `at: null`.
- **03 §6:** the IPC as built:
  - `auth.status` gains `connected`.
  - `history.range()` gives the default range: the fixture's in fixture mode, the last 7 days in
    ADO mode.
  - Plus `areas.tree`, `favorites.save/remove/reorder`, `epics.search`, `sync.*`, `cache.*`, and
    `projects.setPinned`.
  - `captains.setCallSign` isn't built yet (call signs are editable later).
- **03 §9:** `identities.image_url` and `.avatar`; `pull_requests.approvers_json`;
  `wi_current_relations.ado_url`; `scope_checkpoints.coverage_json`; and a new `scope_prs` table
  for the reconcile's finds. Migrations are `.sql` files imported with `?raw`.
- **03 §10:** the `storeJson()` hook, and the test-only IPC log (`globalThis.__starChartIpcLog`).
- **04 §2:** Epic states are never a mismatch (they're neutral by design), and 401 on `org` stops
  the probe.
- **04 §6:** a WIQL result at the 20,000 cap marks coverage partial, with no split yet.
- **04 §7:** pictures.
- **Web links:** bundles keep `adoUrl` empty when ADO doesn't send one, so derive stays pure and
  AC-27 exact. Main fills in web links from canonical keys before sending, and `openInAdo` resolves
  from keys behind the allowlist.

## Checks
| Check | Result |
|---|---|
| AC-25 (E) | ✅ After connecting with the canary token and syncing: the PAT field is empty, and the canary is absent from the store, DOM, and web storage. In IPC it appears only in `auth.setPat`'s request, never a response. It's absent from stdout, stderr, and the console, and from every file in the DB folder (including WAL) |
| AC-26 (U) | ✅ Every family reads ok on a healthy org. 401 means an expired token and stops. 403 on repos and PRs carries the Basic-license hint. 404, 429, and empty are each told apart. A rejected api-version falls back to 7.1-preview and records it |
| AC-27 (G) | ✅ All 12 scopes across the 4 scenarios (areas and Epics) ingest to the same bundle as `toHistory`: events, observations (edge-history), unlinked PRs, captains, and Mina's picture |
| AC-28 (U) | ✅ Re-syncing, and an overlapping Epic scope, give the same event keys and fact counts. A fresh DB gives a deep-equal bundle. A resync fetches only pages after the checkpoints |
| AC-29 (U) | ✅ `revisedDate` is never read. A relation-only update takes its revision's time. Without that revision, it's an observation, not an event |
| AC-32 (U, E) | ✅ Favorites are keyed by node ID: a renamed area keeps its favorite, and a vanished one goes unavailable. In the app, favorites are per project, Repair and Remove work, and they survive a relaunch |
| AC-33 (E) | ✅ The panel shows the size and `…/star-chart.sqlite`. Purge shrinks it, the scope must sync again, the favorites are gone, and the connection stays |
| ADO mode end to end (E) | ✅ Connect, switch, check access (all ok), save Comet Crew, sync, chart. Same stars and beats as fixture mode |
| Regression | Unit and golden 153/153; e2e 81/81 (77 earlier, plus 4 new); typecheck and lint clean |

**Stills** (`test-results/slice4-*.png`):
1. The Connect panel with the access matrix.
2. The area picker.
3. The synced Comet Crew sector.
4. An unavailable favorite with Repair and Remove.

## Known limitations and open questions
- **ADO's default pictures:** for someone who never uploaded one, ADO serves a generated initials
  image, so they'd show that instead of our own avatar circle. This is noted in 91.
- **The WIQL cap:** 20,000 results marks coverage partial, without splitting by date or sub-area.
- **Not in this slice:** staleness badges for items that turn unreadable (they're kept and marked
  partial), incremental refresh, the 7-day PR refetch, and the 14-day rescan. Those are slice 5.
- **Offline:** ADO-mode reads (projects, favorites, history) still need a stored token. A relaunch
  in dev or test asks for it again, because the token lives in memory there. Offline mode is slice 5.
- **The default range in ADO mode** is the last 7 whole UTC days up to now. The fake org's "now" is
  its last scenario op, so its week ends a few days after the fixture's.
- **AC-34 and AC-35 are manual,** run by the user against the real org, reporting pass or fail only
  (slice 5).
