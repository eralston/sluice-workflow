# 04 — ADO ingestion

**Status:** current as of 2026-10-27 (through v1.3 Block B). Covers ADO mode in both views: authentication, the probe,
every call the app makes, timestamps, the full sync, the sprint stream (how Solar and the Sprints
view load a round), loading by level (the Backlog), failures, approvers, identities and the cache,
read against `src/main/ado/`, `src/main/sync/` and `src/main/db/` on 2026-10-13.

This doc covers how the main process reads ADO and turns responses into the source facts and events
defined in [03](03-contracts.md). All calls use REST `api-version=7.1` against the org URL the user
enters. The pilot org is `https://dev.azure.com/{org}` (the Federation's), but it is not hard-coded (INV-22). The app
never writes to ADO (INV-21). Fixture mode makes no calls; the fake org (`STAR_CHART_FAKE_ADO=1`,
`fixtures/ado.ts`) answers the same calls from a scenario.

Which loader each view uses, in ADO mode:

| View | Scope | Loader | § |
|---|---|---|---|
| Solar | a round (a sprint) and its regions (pods) | the sprint stream | §5b |
| Sprints (v0) | a sprint and its pods | the sprint stream | §5b |
| Backlog (v0) | an Area Path or an Epic | loading by level | §5a |
| Tests, AC-27 | any scope | the full sync | §5 |

## 1. Authentication

*Applies to: both views · ADO mode.*

- **Organization-scoped PAT.** Microsoft stops accepting global PATs on 2026-12-01. The token needs
  these read scopes: **Project and team (read)**, **Work items (read)**, **Code (read)**. No write
  scopes are needed. **Graph (read)** (`vso.graph`) is optional: it is what the Graph route to people's
  pictures needs (§7). Without it the other routes are tried, then initials. **Build (read)** (`vso.build`)
  is optional too: it is what a station's last-run line needs (§6a-2); without it the line is left out.
  **A call that needs a scope the token may lack can answer 401 (TF400813), not 403.** The calls where that
  is expected are treated as a missing scope, never a dead token (the **quiet 401s**): a picture (§7), a team's
  settings and boards (`teams` family: `teamBacklogs`, `teamBoardColumns`; §5b), a PR's threads (`vso.threads_full`,
  §6a; family `review`, handled by the stat code) and builds (§6a-2). Every other 401 is a dead token (§6).
- The PAT is sent as HTTP Basic with an empty username. Main is the only process that makes HTTP
  calls, and only to the allowlist: `https:`, the org's own origin and path prefix **or its identity
  host** (`vssps.dev.azure.com/{org}`, or `{org}.vssps.visualstudio.com` for a legacy org: where Graph
  lives, `vsspsBaseOf`), no credentials in the URL, and `redirect: 'manual'` so a redirect can't carry
  the PAT away (`ado/http.ts`). Opening an ADO page in the browser uses the org's own origin only.
- **Connecting** (`auth.setPat`) checks the token with `connectionData` alone. A refused token restores
  the previous one. A different org's key purges the cache first (keys are org-scoped).
- **1a. Sign in with the Azure CLI (23 E5).** Beside the PAT, `Sign in with Azure CLI` shows only when
  `az` is on the PATH and logged in (`az account show` answers; a GUI app's PATH also gets
  `/opt/homebrew/bin` and `/usr/local/bin`). It runs `az account get-access-token --resource
  499b84ac-1321-427f-aa17-267ca6975798 --output json` and sends the token as `Authorization: Bearer`
  (a PAT stays Basic). `AzSession` (`credentials/azCli.ts`) holds it **in memory only** and fetches a new
  one before `expires_on` (or `expiresOn`) less five minutes, not sooner than a minute from now, so about
  hourly; a failed refresh keeps the old token and tries again in a minute. **Failure tiers:** a 401 with
  an az token fetches a fresh token once (not within 20 s of the last fetch) and repeats the call; a
  second 401 is the dead-token path (§6). A PAT entered later signs the Azure CLI out; `Sign out of Azure
  CLI` keeps a saved PAT. If it was how you connected last time (ADO mode), launch asks `az` again, quietly and in parallel with the window (calls that need the connection wait for it), then re-reads `connectionData` so "Is this you?" follows the current az account.
  `az` missing, logged out, timed out (15 s) or answering anything unreadable only hides the button or says
  so in plain words; its output is never logged or shown. Safety: `execFile`, no shell, a fixed argument
  list, never the Keychain or disk (INV-17). **Who you are:** `connectionData`'s `authenticatedUser` is
  kept (identity key and name, not secret) for *Your captain*'s "Is this you?" (13 §7).
- **Storage:** a `CredentialStore` interface.
  - `KeychainStore` uses `safeStorage.encryptStringAsync` and saves the ciphertext under
    `userData`.
  - `MemoryStore` is used when `safeStorage` is unavailable, and forced on in test runs. Dev builds
    use the Keychain store too, so the token persists between runs (decided 2026-10-07): macOS may
    ask once to let Electron use its key; choose Always Allow.
- Never log request headers. The dev log records the endpoint *family*, a redacted endpoint (API
  words only) and the status code (INV-17; 03 §10). The response body is kept only in the app's
  error details, never logged.
- The PAT alone does not decide access. The PAT owner's permissions still apply. Reading repos and
  PRs needs a **Basic** access level; Stakeholder access cannot read them. The probe reports this in
  plain words.
- There is no published Federation PAT policy. Confirm lifetime and scope expectations with the
  Federation's DevOps team before the pilot.

## 2. Capability probe

*Applies to: both views · ADO mode.*

The probe runs on demand, from Connect's probe link (`probe.run`; `ado/probe.ts`). Each row records
`{family, endpoint, status: ok|empty|401|403|404|429|error, checkedAt, note, apiVersion?}`. Rows run
in this order, against the first project the org lists:

| Family | Call | Why it matters |
|---|---|---|
| org | `GET _apis/connectionData` | Gets the org key (`instanceId`) and the PAT owner's identity. A 401 here means the token is expired or invalid |
| projects | `GET _apis/projects?$top=100` | Discovers galaxies |
| recent | `POST _apis/wit/wiql` (your recent work, §3), `$top=50` | Whether the galaxy can start with your recent projects |
| areas | `GET {project}/_apis/wit/classificationnodes/Areas?$depth=2` | Area chooser |
| iterations | `GET {project}/_apis/wit/classificationnodes/Iterations?$depth=4` | Counts the dated sprints: Solar and the Sprints view need start and finish dates |
| teams | `GET _apis/projects/{project}/teams?$top=100` | Each pod gets its own team's sprints (§5b); none found means every pod runs the project's list |
| wiql | Flat Feature query (§3), `$top=5` | Work-item read |
| wiql | `[System.IterationPath] EVER '{project}'`, `$top=1` | Whether ADO accepts `EVER` (§5b); without it, sprint membership falls back to daily samples |
| history | Revisions + updates for one returned Feature | History read. Also records which **timestamp rule** (§4) fired, so it can be verified on live data |
| states | `GET {project}/_apis/wit/workitemtypes/{type}/states` for Epic, Feature, User Story, Bug, Task | Compares against `state-mapping.json` and lists any mismatches (INV-11) |
| repos | `GET {project}/_apis/git/repositories` | Code read |
| builds | `GET {project}/_apis/build/builds?$top=1` | Whether a station's plate can show its last run (§6a-2). Needs Build (read): a 401 or 403 notes that and the stations show no run line; no run is not a failure |
| prs | `GET {project}/_apis/git/pullrequests?searchCriteria.status=completed&$top=1` | PR read, and a completed PR for the review row. A 403 on repos or PRs may mean Stakeholder access (§1); mention it as a possible cause |
| review | `GET .../pullRequests/{id}/reviewers` and `.../pullRequests/{id}/threads` for that completed PR | The review formation's approvers (§6a). Threads may need more than Code (read) (`vso.threads_full`); if denied, fall back to final reviewer votes and say so. (The sync also reads them for open PRs, for the stat line, §6a-1; the probe still asks only about a completed one) |

**Source:** `src/main/ado/probe.ts` (`runProbe`) · **Update when:** a row is added, or its call or
note changes. (superseded 2026-10-13: the probe ran on connect; the PR row asked `status=all`.)

An *empty* result is not a denial, and an expired token (401) is not a denied repo (403). A 401 on
`org` ends the probe there (nothing else can work). Epic states are never reported as mismatches:
Epic visuals stay neutral by design (02 §2). The probe shows the capability matrix in the UI and
never shows response bodies; notes are fixed sentences plus counts.

**api-version:** all calls use `7.1`. If an endpoint rejects the version (HTTP 400 with an
api-version error), retry once with `7.1-preview`, then with no version. `connectionData` is
undocumented and often needs this. Record which version worked in the probe row, and use it from
then on (the client keeps one per endpoint family, `AdoClient.versions`).

## 3. Fetch recipes

*Applies to: both views · ADO mode.*

**Every call** (`src/main/ado/client.ts`; paths are under the org URL; all are reads, INV-21):

| Call | API path | When | Caching |
|---|---|---|---|
| `connectionData` | `GET _apis/connectionData` | Connect; the probe | org key in `meta` |
| `projects` | `GET _apis/projects` (paged by 100) | The galaxy | `projects` table; one fetch serves 30 s of callers (§8) |
| `wiqlOrg` (recent work) | `POST _apis/wit/wiql`, `$top=400` | Connect, the empty cosmos | `recent:{org}` setting |
| `areas` | `GET {project}/_apis/wit/classificationnodes/Areas?$depth=14` | The area chooser | `area_nodes`; cache-first, refreshed after 60 s (§8) |
| `iterations` | `GET {project}/_apis/wit/classificationnodes/Iterations?$depth=14` | The sprint chooser | `iteration_nodes`; cache-first, 60 s (§8) |
| `teams`, `teamFieldValues`, `teamIterations` | `GET _apis/projects/{project}/teams`; `{project}/{team}/_apis/work/teamfieldvalues`; `…/teamsettings/iterations` | The sprint chooser | `teams:{org}:{projectId}` setting; at most once a minute (§5b) |
| `teamBacklogs`, `teamBoardColumns` (v1.3 B4; family `teams`) | `GET {project}/{team}/_apis/work/backlogs`; `GET {project}/{team}/_apis/work/boards/{level name}/columns` | The v0 board's columns | In the same `teams:` setting, as `TeamFacts.columns`; read with the teams (once a minute, §5b), beside a sync and never before it (§5) |
| `wiql` | `POST {project}/_apis/wit/wiql` with a `$top` | Discovery, link and tree queries (below; templates in `sync/wiql.ts`) | not cached; results become `scope_members` |
| `workItems` | `POST _apis/wit/workitemsbatch`, 200 IDs, `$expand: Relations` | Hydrate | `wi_current`, `wi_current_relations` |
| `workItemFields` | `POST _apis/wit/workitemsbatch`, 200 IDs, `fields` | Recent work (`System.TeamProject`, `System.ChangedDate`) | no |
| `revisions`, `updates` | `GET _apis/wit/workItems/{id}/revisions` and `/updates`, `$top=200&$skip` | History | `wi_revisions`, `wi_updates`, from `item_checkpoints` |
| `revisionFeed` (v1.3 B5; family `history`) | `GET {project}/_apis/wit/reporting/workitemrevisions?fields&startDateTime` or `continuationToken&includeLatestOnly=false&includeIdentityRef=true&$maxPageSize` | A big batch of history reads (§5c) | `wi_revisions`, then `item_checkpoints`; the crawl's token in the setting `feed3:{org}:{scopeKey}` |
| `states` | `GET {project}/_apis/wit/workitemtypes/{type}/states` | The probe only | no |
| `repos` | `GET {project}/_apis/git/repositories` | Each sync and stream | `repositories` |
| `pullRequest` | `GET _apis/git/repositories/{repo}/pullRequests/{id}` | PRs from work-item links | `pull_requests`; re-read when open or closed within 7 days (§5) |
| `pullRequests` | `GET {project}/_apis/git/pullrequests?searchCriteria.*` (paged by 100) | The unlinked reconcile | `scope_prs` |
| `prWorkItems` | `GET …/pullRequests/{id}/workitems` | The unlinked reconcile | no |
| `reviewers`, `threads` | `GET …/pullRequests/{id}/reviewers`, `/threads` | A completed PR's approvers (§6a); and the stat line (§6a-1) of a PR that is open, closed within 7 days, or never read: with its record in a full sync, and *after* the load in a sprint stream or any level load | `pull_requests.approvers_json`, `.stats_json` |
| `latestBuild` (family `builds`) | `GET {project}/_apis/build/builds?repositoryId={repo}&repositoryType=TfsGit&branchName={default ref}&$top=1&queryOrder=queueTimeDescending` | A station repo's latest run (§6a-2): one per repo that has a PR in scope, when its last read is 15 minutes old or never; in a full sync inline, elsewhere deferred as the stat lines are. Needs the Build (read) scope | `repositories.default_branch`, `.run_json` |
| `prIterations`, `prChanges` | `GET …/pullRequests/{id}/iterations`; `…/iterations/{last}/changes?$top=1000&$skip` (paged by `nextSkip`, at most 10 pages) | The stat line (§6a-1): a PR never read, or whose last source commit moved since; deferred as above | `pull_requests.stats_json` |
| `avatar` | by strategy (§7): the identity's `imageUrl`; Graph `GET vssps…/{org}/_apis/graph/Subjects/{descriptor}/avatars?size=medium` (`7.1-preview.1`, scope `vso.graph`); the web app's `…/_api/_common/identityImage?id=` | Once per person, by the order the org has taught (§7) | `identities.avatar`; the order in setting `avatars:{org}` |

**Source:** `src/main/ado/client.ts` (`AdoClient`), `src/main/ado/service.ts` · **Update when:** a
call is added, its path or paging changes, or what caches it changes.

**Discover Features in an Area Path sector.**

```sql
SELECT [System.Id] FROM WorkItems
WHERE [System.TeamProject] = @project AND [System.WorkItemType] = 'Feature'
  AND [System.AreaPath] UNDER '{full path}'
ORDER BY [System.ChangedDate] DESC            -- featuresUnder(); bounded, below
```

Run this query **now**. In the full sync, also run it with `ASOF '{t}Z'` at 12:00 UTC on **each day** back to
`BACKFILL_MAX_WEEKS`, which is at most 28 cheap queries. Union the results, so Features that *left* the area are found too. **A known limit:** a Feature
that joined and left the area between two daily samples is missed. `coverage.notes` records the
sampling rule. The
revisions of each Feature then give its exact AreaPath history. Scope membership is stored in
`scope_members`.

**Discover Features in an Epic sector.** Use a link query with
`[System.Links.LinkType] = 'System.LinkTypes.Hierarchy-Forward'`, `[Source].[System.Id] = {epic}`,
`[Target].[System.WorkItemType] = 'Feature'`, and `MODE (MustContain)`. To also find former
children, include Features named in the Epic's updates under `relations.removed`.

**Epic chooser.** List the distinct parent IDs of type Epic among the Features in the user's saved
areas (a sample of each area's 100 most recently changed Features, hydrated for their parents). Title
search uses WIQL `[System.Title] CONTAINS '{q}'` with `[System.WorkItemType] = 'Epic'` (`$top=50`);
an ID search hydrates that one ID. Each Epic's Feature count is one `MustContain` link query.

**Descendants.** Use a tree query from the scope's Feature IDs, with
`System.LinkTypes.Hierarchy-Forward` and `MODE (Recursive)`. Split the `IN (...)` list so each query
stays under 32k characters. Then add former children: any child ID that appears in
`relations.removed` in the parents' updates. `ASOF` is **not** allowed in tree queries. Past
hierarchy comes from the link updates instead.

**Hydrate.** Call `POST _apis/wit/workitemsbatch` with at most **200 IDs** per call,
`$expand: "Relations"`, and `errorPolicy: "Omit"`, so a single deleted or forbidden ID doesn't fail
the whole batch. Leave out `fields`, because it can't be combined with `$expand`. Store the
relations in `wi_current_relations`; they're the source of `observed_only` link observations. This call gives the
current state and relations. History comes from the next step.

**History per item, resumed from checkpoints.** Call `GET _apis/wit/workItems/{id}/revisions` and
`.../updates` with `$top=200&$skip={n}`. Keep paging until a page comes back shorter than `$top`. A
single item has at most 10,000 revisions.

**PRs, primarily through work-item links.**
1. From each item's relations and updates, take the relations where `rel == "ArtifactLink"` and
   `attributes.name == "Pull Request"`. The name is case-sensitive.
2. Parse the URL with
   `^vstfs:///Git/PullRequestId/([0-9a-f-]{36})(?:%2F|/)([0-9a-f-]{36})(?:%2F|/)(\d+)$`
   (case-insensitive, with the IDs normalized). The three groups are the project, repo, and PR ID.
3. `GET _apis/git/repositories/{repoId}/pullrequests/{prId}`.
4. Other artifact links (commits, branches) become `RelationTarget.other` and are ignored.

**Unlinked PR reconcile, a secondary pass** (the full sync of an area or Epic, and a Backlog Feature
scene's history; never a sprint). For each repo in the scope's own project that has a station in scope, list PRs
created or closed within the range. Every parameter needs the `searchCriteria.` prefix:
`searchCriteria.repositoryId`, `searchCriteria.status=all`, `searchCriteria.minTime` and
`searchCriteria.maxTime`, and `searchCriteria.queryTimeRangeType=created`, then `closed`. Page with `$top=100&$skip`. Any PR that isn't already linked gets a check with
`GET .../pullRequests/{id}/workitems`. If that call returns nothing, the PR goes into `unlinkedPrs`.

**Bounded queries (decided 2026-10-07).** Every WIQL is newest first and capped: Feature discovery
`ORDER BY [System.ChangedDate] DESC` with `$top=200` (the Epic chooser samples 100), link and tree
queries `$top=5000`. A big Area Path can still trip ADO's 20,000-result cap (VS402337, seen on a real
root path): the query narrows by ChangedDate (365, 90, 30, 7, 1 days) and retries, and only an area
that can't be narrowed at all is marked partial ("too large; choose a smaller one"). A full first page
notes "Showing the 200 most recently changed Features". Paging by date (`ChangedDate < cursor`) is
Load more's (§5a). A sprint's queries take `$top=1000` (`SPRINT_TOP`). The page sizes and windows are
`FEATURE_PAGE`, `EPIC_SAMPLE`, `LINK_QUERY_TOP`, `NARROW_DAYS` and `QUERY_MAX` in
`sync/wiql.ts`.

**Your recent projects (decided 2026-10-07).** ADO has no documented "recent projects" API (the
home page uses internal data providers, and `@MyRecentActivity` runs only in the web portal), so an
org-wide WIQL (`POST {org}/_apis/wit/wiql`) finds your recent work: `([System.ChangedBy] = @Me OR
[System.AssignedTo] = @Me) AND [System.ChangedDate] >= @Today - 90`, newest first, `$top=400`; then
`workitemsbatch` with only `System.TeamProject` and `System.ChangedDate` groups it by project. The top
10 seed the galaxy (as pins the user accepts); the probe's `recent` row checks it.

**Errors (decided 2026-10-07).** Every failed call carries a `NetError` (03 §6 contracts,
`neterror.ts`): family, method, path and query, status (0 when unreachable), ADO's code and message,
`Retry-After` and `X-RateLimit-*`, attempts and time waited, and the literal body (cut at
`NET_BODY_MAX`, 8,000 characters; shown only in the app, never logged). Request headers are never
included (INV-17).

**Reference data.** `GET _apis/projects`, `{project}/_apis/git/repositories`, and area nodes. Repos
are refreshed on each sync and stream; projects, areas and sprints follow the cache policy (§8).

## 4. Timestamps: which field is the event time

*Applies to: both views · ADO mode.*

| Fact | Event time (`occurredAt`) | Notes |
|---|---|---|
| Revision | `fields["System.ChangedDate"]` | |
| Update that has `fields` | `fields["System.ChangedDate"].newValue` | |
| Update with relation changes only | the `System.ChangedDate` of the revision whose `rev` equals `update.rev` | This is rare, because link updates usually carry `fields`. If no time is found, the fact becomes an `Observation` with confidence `'unknown'` (INV-02) |
| PR opened / closed | `creationDate` / `closedDate` | |
| Anything found only by polling | none, so it becomes an `Observation` with confidence `'observed_only'` | Examples: a PR status change without `closedDate`, or a link in `wi_current_relations` with no matching update |

⚠️ **Never use an update's `revisedDate` as the event time.** It is the time that revision was
*superseded*, and the latest update reads `9999-01-01`. The probe's `history` row checks the §4 rule
against live data. If the rule turns out wrong, change it here first.

**The actor (`changedBy`, slice 3a).** Each work-item event takes `changedBy` from the
`System.ChangedBy` identity of its revision (or the matching revision of a relation-only update).
`pr_opened` takes the PR's `createdBy`; `pr_completed` and `pr_abandoned` take `closedBy` when present.
Normalize identities as in §7. Unknown means absent, never the assignee.

## 5. Sync sequence

*Applies to: both views · ADO mode.* The full sync (`syncScope`, `src/main/sync/sync.ts`) runs when
`sync.start` has no level: tests, the AC-27 golden and fixture-equivalence checks. The views load by
stream (§5b) or by level (§5a); step 7's refresh is shared by both.

0. **Board columns (v1.3 B4).** The team list (with each team's board columns, §5b) is read or refreshed beside a scope's sync,
   never before it: **the first look never waits on it.** A bundle built before it arrives places work by state, and the next load
   has the columns. A scope's board is the columns of the team that owns its Area Path (a sprint: its first pod with a clear team
   that has a board; an Epic: none), read from the cache each time a bundle is built, so a changed board shows on the next load. In a
   sprint whose pods belong to different teams, an item's column counts only while its area belongs to the chosen team; any other
   item is placed by state. Revisions carry `System.BoardColumn` and `System.BoardColumnDone` (03 §2); no extra calls. **A user's
   first launch after B4** (migration 007 clears only the item checkpoints): scopes keep their last success, members, events and
   team lists, so nothing is blocked and the chart draws as before (work placed by state). Each item's whole history is read again,
   lazily, the next time a sync, stream or refresh touches it (one revisions call and one updates call per item, 04 §3), replacing its
   old facts. **The revisions feed (§5c) does not serve such an item**: stored revisions with no checkpoint (and no seed) are an old
   whole history the feed's window rows would leave a gap after, so the item is read whole, per item, whatever the batch size, and the
   stream's single-item early return needs a checkpoint too; the team lists lack columns until their next read (the first load after launch refreshes them), so the headings
   appear on the load after that. Solar's and the v0 views' first look are unchanged.
1. The user picks a project, a sector, and a range. `scope_key` = `projectId|sector kind|sector id`
   (a sprint's adds `|` and a hash of its pods: `projectId|sprint|nodeId|podsHash`). The repos are
   read first.
2. Discover the scope's Features (§3), then their descendants and former children, then every
   ancestor any of them has had.
3. For each item, fetch revisions and updates from `item_checkpoints`. Write the facts in **one
   transaction per item**, then advance the checkpoint in that same transaction. **A batch of 300 items or more** (a
   discovery wave) is read through the project-wide revisions feed instead (§5c).
4. Collect PR references. Fetch and upsert the PRs, with a completed PR's approvers (§6a). Run the
   unlinked reconcile. Then the identities, their pictures (§7) and new captain profiles.
5. Rebuild the derived `links`, `observations`, and `events` for the scope wholesale, inside one
   transaction. Event keys are deterministic, so the result is identical every time (INV-13).
6. Mark the scope checkpoint. Report `SyncProgress` throughout.
7. **Incremental refresh:** repeat steps 2–6. Checkpoints make step 3 cheap. Rerunning step 2 finds
   Features that joined or left, and new children. For open PRs and those closed in the last 7 days,
   refetch PR records, and with them the stat line's facts (§6a-1). A PR whose facts were never read (cached
   before B1) is refetched too, until they are. Every 7th refresh, rescan the last 14 days of updates to catch late
   corrections.
   - **When it runs (decided 2026-10-09):** on **reopening a scope** — the cache draws at once and the
     refresh follows behind it (stale-while-revalidate, as the chooser and the sprint stream already
     do) — and on an explicit **Refresh**, for when you know ADO changed. Never on a timer and never
     on window focus: a scope you are looking at must not move under you.
   - **Where it lives (decided 2026-10-09):** at the shared layer (`src/main/sync/refresh.ts`), so both
     loaders use it — the sprint stream's `refresh()` (Solar and Sprints), and `loadLevel`'s
     `catchUp` (the Backlog, which as of 2026-10-13 still loads by level, not by stream).
   - **What checkpoints can't see,** and so what a refresh re-reads beyond them:
     - **A PR that moved on.** Its record is cached whole, with no checkpoint, so an open PR that has
       since merged would stay open on the chart forever. `PR_REFETCH_DAYS = 7`: re-read the records
       that could still change — open, or closed inside the last week.
     - **A late correction.** An update revised after we read it sits *behind* our checkpoint, so a
       plain refresh skips it. Every `RESCAN_EVERY = 7`th refresh, re-read items changed within
       `RESCAN_DAYS = 14` from the start (`history(..., { rescan: true })`). Facts are upserted and
       event keys are deterministic, so a rescan changes nothing unless ADO did (INV-13). The count
       is per scope, in settings `refresh:{org}:{scopeKey}`.

Cancelling keeps every committed transaction. If `derivation_version` changes, the derived tables are
cleared at boot and each scope's rows are rebuilt from the source tables with no network calls, when
it next opens or syncs (03 §9, v1.3 F1).

## 5b. Sprints (decided 2026-10-07)

*Applies to: both views · ADO mode* (Solar's round is a sprint, its regions the pods; the Sprints
view's sprint and pods are the same scope).

- **The iteration tree:** `GET {project}/_apis/wit/classificationnodes/Iterations?$depth=14`. Each
  node has `attributes.startDate` and `finishDate`. Paths read `\Project\Iteration\Sprint 41`, as
  `Project\Sprint 41` in work items. The list is cache-first, like the area tree (§8). The probe has
  an Iterations row that counts the dated sprints. The chooser offers only dated sprints that have
  started, newest first.
- **`System.IterationPath`** is read on every revision and every current item. Revisions cached
  before this change lack it, so migration 003 clears cached work-item history and the next sync
  reads it again. Favorites, settings and profiles are kept.
- **A sprint streams (decided 2026-10-08; 03 §5c).** Its first look is three calls (the sprint's
  Stories and Bugs now, their fields with any bodies known before, their Features' fields), and the
  scene opens on it with its assignees named (no pictures yet). The rest follows through the request
  scheduler (`sync/scheduler.ts`), whatever is on screen first:

  | Class | What |
  |---|---|
  | `look` | The first look; a pod's Tasks when it's entered |
  | `fill` | The repos; the sprint-wide and per-pod `EVER` queries; per pod, the focused one first: Tasks, PR records and their review votes, pictures, then history newest-changed first (a `feed:{pod}` task when the pod's batch is at least 300 items, §5c); on a reopen, the PR refetch. The stat lines' and runs' reads (§6a-1, §6a-2) are not tasks: they run after the view's work, in one per-org background queue |
  | `context` | The pods' Features' history; the closure's ancestors |
  | `idle` | Leavers by daily `ASOF` samples, the closure (descendants, former children), the closure's PRs' votes; on every 7th reopen, the rescan |

  **Source:** `src/main/sync/sprintStream.ts`, `scheduler.ts` · **Update when:** a task changes class
  or a new task is queued.

  **History waits for its scene (decided 2026-10-08).** An item's history is queued only while it is
  in the scene on screen, or drawn below it; the rest waits until a focus (`sync.focus`) brings it
  in. Current state still streams for every member.

  **Ever in the sprint, in one query (decided 2026-10-08):**

  ```
  SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project
    AND [System.IterationPath] EVER '{sprint}' AND [System.WorkItemType] IN ('User Story', 'Bug')
    AND ([System.AreaPath] UNDER '{pod}' OR …) ORDER BY [System.ChangedDate] DESC
  ```

  `EVER` is WIQL-only (the web editor calls it "Was Ever"), has no `UNDER` form, and can't be
  combined with `ASOF` — so the pod clause is present-tense and `derive`'s own rule (ever under a
  pod, in the sprint's window) does the filtering. This finds the story planned out to the next
  sprint, which daily sampling only reached much later, and it can't miss one that joined and left
  between two samples. It runs as a `fill` task, off the first-look path. An ADO that refuses the
  operator answers 400; the stream logs `wiql-ever-unsupported`, falls back to the samples, and
  coverage keeps the sampling note. The probe has an `EVER` row.

  **Child iterations (slice 7, decided 2026-10-10).** Work parked in `Sprint 41\Hardening` is part of
  Sprint 41. Membership is "under" the sprint's iteration everywhere: `inSprint`, `inPodNow`, the
  current-state filter, and `sprintItems` (`[System.IterationPath] UNDER`). Since `EVER` has no
  `UNDER` form, the `EVER` query ORs one clause per path in the sprint's iteration subtree (from the
  cached iteration tree; past a size limit, just the sprint itself, and the samples cover the rest).

  **Ever in the pod, too (slice 7).** After the sprint-wide `EVER`, one query per pod also requires the
  item to have **ever** been in the pod (an `AreaPath EVER` per node in the pod's area subtree):

  ```
  … AND (<IterationPath EVER each sprint path>) AND [System.WorkItemType] IN ('User Story', 'Bug')
    AND ([System.AreaPath] EVER '{pod}' OR [System.AreaPath] EVER '{pod}\{child}' …)
  ```

  This finds a body that has since left both the sprint and the pod at `fill`, rather than leaving it
  to the idle samples.

  **Teams on their own cadences (slice 7).** Pods are saved Area Paths; in ADO, teams own Area Paths
  and run their own sprint lists.
  - When the sprint chooser opens: `GET _apis/projects/{project}/teams`, then for each team
    `{project}/{team}/_apis/work/teamfieldvalues` and `{project}/{team}/_apis/work/teamsettings/iterations`.
    That's 1 + 2 per team, kept in settings and re-read at most once a minute. **Board columns (v1.3 B4)** ride on the
    same read: per team, `GET {project}/{team}/_apis/work/backlogs` (the backlog levels), the level whose id is
    `Microsoft.RequirementCategory` (else `type: requirement`) names the Stories board whatever the process calls it (Stories,
    Backlog items, Requirements, Issues, a renamed level), and `GET …/boards/{that name}/columns` reads its columns (`columnType`
    incoming / inProgress / outgoing, `isSplit`, `order`); ADO accepts a backlog level's name where `{board}` goes, so it is two
    calls, not three. That makes 1 + 4 per team. A team with no requirement level has no columns. **Failures:** the calls are in the `teams` family, so a 401 is a token without the
    scope (quiet, like the team's settings) and the team just has no columns; 403 and 404 likewise. A failure that may pass (no
    response, 429, 5xx) keeps the columns read before, and never fails the teams read or a sync.
  - **Matching pods to teams** (`teamOfArea`): an exact default value, then an exact value, then the
    nearest ancestor value that includes its children. Ties are ambiguous, and the pod is left
    unmatched.
  - **What each sprint carries:** the pods whose team runs it (`IterationSummary.pods`), plus any
    unmatched pod. The chooser lists only sprints at least one pod runs, and opening one includes only
    those pods.
  - **No team data** (an older server, a token without the scope): every pod runs every sprint, as
    before.
  - The probe has a Team settings row.

  **Approvers for the scene's PRs are `fill`, not `idle`:** without them `pr_completed` carries no
  `approvedBy`, and the review formation (05 §5) never plays.

  A reopen re-reads the first look and skips history the cache already has (§5 step 7). When the
  stream is done, the cache holds what the full sync below would. The scope is the sprint's own: the
  closure walks out only from its Stories and Bugs, and stops widening at `MAX_SCOPE_MEMBERS`
  (03 §5c), with coverage partial.
- **The full sync of a sprint** (§5, with target `sprint`) stays for the AC-27 golden:
  - Discovery is the `sprintItems` WIQL: the iteration, Stories and Bugs, and `UNDER` any pod.
  - It runs now, at the sprint's start, and daily at 12:00 UTC through the sprint so far, so items
    that joined and left are found. Coverage notes the daily sampling.
  - Descendants, former children and ancestors follow as usual. There's no unlinked reconcile.
  - The scope key includes a hash of the pods.

## 5a. Loading by level (decided 2026-10-07)

*Applies to: the v0 views (the Backlog) · ADO mode.* A sprint never loads by level: it streams (§5b).
This section sits after §5b for its anchor; the order is historical.

Current state is cheap: one query plus a batch call per 200 items. History (revisions and updates
per item, `ASOF` samples, PR records) is what costs. So ADO mode loads top-down, current state
first, and history only when someone asks to play a scene (`src/main/sync/levels.ts`).

| Level | Loads | Calls |
|---|---|---|
| `team` | Repos; the team's Features as they are now, newest first; their Epics | One bounded WIQL, batch hydrate. No history, PRs, or `ASOF` |
| `feature` | That Feature's subtree as it is now; PR records from its artifact links; people. The PRs' stat lines (§6a-1) are read after the level returns, two at a time | Tree WIQL, batch hydrate, PR GETs (then reviewers, threads, iterations, changes in the background) |
| `more` | The next 15 older Features (from the queue, then by `ChangedDate` cursor) | Usually none |
| `history` | A scene's revisions and updates over the last 1, 7, 14, or 30 days. Team: its Features plus daily `ASOF` samples. Feature: its subtree, ancestors, former children, approvers, and the unlinked reconcile for its own project's repos | Per item, from checkpoints; from the project-wide revisions feed instead when the batch is 300 items or more (§5c) |
| `catchUp` | History since the last load for every scene played before; it counts as a refresh, so every 7th one rescans (§5 step 7) | Per item, from checkpoints (the feed above the same threshold, §5c) |

- **Recent first:** a team opens on Features changed in the last 30 days, and at least the 10
  newest. The rest wait for Load more.
- **The state** lives in settings `levels:{org}:{scope}`: shown, queue, cursor, explored, and the
  scenes played with their days (`coverage.played`).
- **What current state can't see:** an item that's uncharted now (it lost its parent), a Feature
  that moved to another team, and a link removed by an undated update. Each appears once the
  relevant history is loaded: a Feature's history brings its former children.
- **The full sync** (§5) stays, for AC-27 and fixture-equivalent checks.
- **Partial history (23 B7).** A per-item read that fails for a reason that may pass (`failureTier` transient:
  no response, 408, 429, 5xx) is tolerated so the rest can play, and is **recorded**: the scene's entry in
  `levels:` history (`LevelState.history[]`) gets `missing` (item IDs), and `capped` when the revisions feed
  hit its page cap on that pass (§5c). They reach the bundle as `coverage.played[].missing` / `.capped`
  (03 §4), and the player says so (05 §2). A 403/404 is `gone`, not missing. Each pass of a scene
  replaces its set with what failed that time.
- **Retry (23 B7)** is the `history` level with `retry: true`: it reads **only** the scene's saved `missing`
  items that are still members of the scope (`retrySet`), skipping discovery, ancestors, the rescan, PRs and
  the unlinked search and the Feature's former-children block (the first pass read those; they come from current
  relations, not these items' history). A catch-up of played scenes is a normal pass, so it
  re-reads missing items too, since they have no checkpoint.

## 5c. Scale-up ingestion: the revisions feed (v1.3 B5)

*Applies to: both views · ADO mode.* Per-item reads cost two calls an item, even when nothing changed. Above a threshold the
history phase reads the project-wide **reporting feed** instead. Code: `src/main/sync/feed.ts` (`feedHistory`), constants in
`@shared/feed` (the values are in 15 §10, the budgets table, with the page cap and overlap; this section is where they are explained).

**The endpoint.** `GET {project}/_apis/wit/reporting/workitemrevisions` with `fields` (the ones `parseRevision` reads, plus
`System.TeamProject`, `System.CreatedDate`, board columns), `includeLatestOnly=false`, `includeIdentityRef=true` (identities
in the same shape as the item reads), `$maxPageSize` (a hint; ADO decides, **unchecked against a real ADO**, as B4's board
name was) and either `startDateTime` (the first page) or `continuationToken`. The answer is `{ values: [{ id, rev, fields }],
continuationToken, isLastBatch }`; `values` is not `value`. Needs only Work items (read), so a 401 is a dead token, like the
item reads. There is no ID filter: rows are kept client-side for the batch's IDs. Not used: the POST form (a `types` filter).

**When it is used.** `history()` (level loader, catch-up) and `syncScope`'s `fetchItems` (each discovery wave) take the feed
when the batch is **at least `FEED_THRESHOLD` (300)** items; the sprint stream does it per pod (one `feed:{pod}` fill task,
behind the look). Smaller batches, rescans (whole histories) and the stream's single-item reads stay per item. **The first
look (H3) is untouched**: the feed is a history-phase tool and runs only after it.

**One crawl per run (round 3).** A *run* is a full sync, a level load, or a stream's fill (`resetFeedBudget` starts a new one on a
long-lived context). The first batch that needs the feed starts the run's crawl and every later batch of the run is served from
the rows it kept in memory, per item, up to `FEED_BUFFER_ROWS` (15 §10); a batch never crawls again. Where the crawl starts
(`since`): for items with a checkpoint, `FEED_OVERLAP_MS` before the oldest of their watermarks; if the first batch has
`FEED_THRESHOLD` or more unread items, the **window**: the earlier of (range end minus `BACKFILL_MAX_WEEKS`) and the range's own start,
**snapped to the start of its UTC day** so a moving clock cannot change it within a day. A later batch is served only if the crawl
covers it: a checkpointed item whose watermark is no older than `since`, an unread item if the crawl began at the window,
and an item the buffer did not drop; any other item is read per item (the "uncovered" fallback). So the **per-wave cost** is:
the first run of a scope crawls the window once; later runs crawl from the checkpoints (a page or two); a later wave that
needs more than the crawl covers, or a stream pod whose rows fell over the buffer bound, costs per-item reads for those items.

**What it gives, and what it can't.** Revisions only; the feed has no relation changes, so **updates (parent, child, PR
links) are still read per item**, but only for items with something new: no checkpoint, or a fed revision newer than the
checkpoint. A refresh with nothing changed reads no per-item history at all. The `RevisionFact`s are the same parse of the
same fields. **Equality with the per-item path** (`feed.test.ts`, every scenario and sprint scope, through the fake with
paging): exact whenever no item was seeded (below); with seeds, exact from the window on, and what differs is stated below.

**Watermarks.** Each item's checkpoint (`last_success_at`) is its watermark; there is no project-wide one (it would be wrong for items
another scope read). It is **server time**: a finished crawl sets it to the newest `ChangedDate` the crawl saw (the whole project's), or
to where it started for an item with no checkpoint when the crawl saw nothing, and **never moves it back**: `max(previous, newest seen)`;
if the crawl saw nothing, existing checkpoints are left alone. The one assumption left is that the feed lags the work item store by less
than `FEED_OVERLAP_MS` (1 h, 15 §10). A finished crawl moves every served item's checkpoint, including items with nothing new and seeds.
Fed rows land in `wi_revisions` as pages arrive, for the items covered from the crawl's beginning (the scope's members and the first
batch), with **no checkpoint** until the crawl completes. No migration.

**The page budget and the saved crawl.** `FEED_MAX_PAGES` (40 pages of up to 500 rows) is spent **per run, across all its batches**,
reserved before each request. When it is spent mid-crawl the run stops (the scope is partial, with a note) and the **one saved crawl
per scope** is kept: the setting `feed3:{org}:{scopeKey}` = `{ day, since, token, maxChanged, covered }`. The next run resumes
from the token when `{ day, since }` match the window it would start; otherwise it starts over. A resumed crawl has only its
later rows in memory, so it serves the items it `covered` from the start (their earlier rows were stored); an item that joined
the scope after the crawl began is read per item. Under a small budget this converges (tested at 1 and 3 pages a run with a fresh context each
run). **A capped stream pod:** items that already have a checkpoint (a catch-up) read per item as before B5; the **unread** ones read per
item only in the pod the user is focused on (at the stream's normal priority); the rest wait for the next run.

**The window's edges, and seeds.**
- Born before the window and changed inside it (no checkpoint, first fed row not rev 1): read per item, whole.
- Nothing in the window: **seeded**. The item's current fields (a `workitemsbatch` with the feed's fields) are stored as one revision,
  `rev: 1`, `changedAt` its `CreatedDate`, flagged `seed: true` (03 §2), with **no updates read** and a **checkpoint at the crawl's
  mark**, so later crawls start from it. Its `wi_created` is at its real creation time, with its present state; its relations show as
  observed (02 §6).
- A seed is **replaced only by real history**: `Cache.checkpoint` hides a seeded item's checkpoint from the per-item paths (they see
  no history and read it whole, which upserts the real rev 1 over the seed), so a stream focus on it, a rescan, a level
  load below the threshold, and a feed read that shows it changed (it is then sent to the per-item path instead of appended to)
  all heal it. A feed read never drops a seed up front. (The stream's single-item early return also ignores a tail that
  doesn't start at rev 1.)
- **What a seed loses, exactly:** the item's changes before the window (events, and the state it was created in) and the dating of
  links made before it (they become `observed_only`, with no `link_*_added` event). Nothing inside the window or the played range
  is lost. The production-window equivalence tests assert equal events from the window on, and nothing before it, for scopes with
  seeds (orbit-week's Tide Team: items 601 and 702; one pre-window `link_parent_added` is observed instead).
- Items of another project are read per item.

**One crawl in flight.** Two batches of one session (two pods' `feed:` tasks) never crawl at once: the crawl is one in-flight promise per
session and a later batch awaits it, so the page budget is spent once; its outcome (done, capped, no feed) is every waiter's.
**Items with old history and no checkpoint** (migration 007 kept revisions, cleared checkpoints) are found when a crawl begins
(`pre`, saved with the crawl), never fed, and read whole per item.
**Reads beside the crawl.** The seed fetch of a batch that fails with a 429/5xx/timeout counts as capped (those items wait for the next run);
403/404 send them per item. A transient failure of an item's updates read is reported as *missing* (B7's retry set), not gone.
**Failures.** 401: the sync fails (dead token). 429 / 5xx / no response / 408: the crawl stops, the sync carries on, the scope is
partial with a note, the token is kept and a later run retries. 403 / 404 (and a 400 with no token): the saved crawl is cleared and the rest of the run is read per item, same bundle. **400** with a saved token is a stale token: the crawl restarts once from the start date (no fallback). The fake answers 400 for a bad token.

**Test hooks.** `SyncContext.scale` ({ threshold, maxPages, pageSize, windowFrom }); `STAR_CHART_FEED_THRESHOLD` in test runs; the
fake serves the feed with real paging: its token carries the position of the last row (time, id, rev), so a resume needs no
start date (`FakeOptions.feedPage`, `noFeed`).

## 6. Throttling and failures

*Applies to: both views · ADO mode.*

- ADO throttles at **200 TSTU per sliding 5 minutes** (`ado/http.ts`).
  - Honor `Retry-After` (seconds or a date; at most 5 minutes).
  - When `X-RateLimit-Remaining` is low (below 20), pause 1 s before the next call.
  - On `429`, `503` or `TF400733`, back off exponentially with full jitter: base 1 s, cap 60 s, up to
    6 retries. The wait also sets `throttleGate`, so the stream's whole queue pauses.
- At most **4 requests in flight**.
- WIQL has a 20,000-result cap. Error `VS402337` (HTTP 400) narrows the Feature query by ChangedDate
  (§3, `NARROW_DAYS`) and retries; an area that can't be narrowed is marked `partial`. (superseded
  2026-10-13: "split by date range or sub-area, open"; sub-areas are never split, and a result of
  exactly 20,000 is not checked.)
- **Offline:** the app works from cache. The header shows the last successful sync and marks stale
  data.
  - **Mid-session (decided 2026-10-09):** if ADO can't be reached when a scope opens, and it was synced
    before, its cached bundle opens and the status bar says **Offline**. "Unreachable" means no response
    at all (`status 0`); a refused token or a denied read is a different thing and still errors.
  - **A cold start (AC-31):** the galaxy opens from the cached projects (`projects.list({ cacheOnly })`)
    and says Offline, rather than failing to start. The ↻ beside it asks ADO again and clears Offline
    when it answers; opening a scope clears it the same way. A start that has never connected has
    nothing to fall back to, and says so as before.
- **How staleness reads (decided 2026-10-09):** both scope-level and per-object.
  - **Scope-level:** a header showing the scope's last successful sync (`coverage.syncedAt`), and the
    partial-coverage banner with `coverage.notes`. This answers "how old is all of this?".
  - **Per-object:** the entities that couldn't be re-read now (403/404 after being seen before) are
    listed in `coverage.stale`, and each is marked where it's drawn and in In view. This answers
    "which one of these is old?", so one unreadable item never looks like fresh data.
  - **Where it shows:** the status bar's coverage chip — "Synced 4 min ago", amber and "partial" when
    something is missing, an **Offline** marker when ADO is out of reach, and ↻ to refresh now. Its
    panel lists the coverage notes, and profiles the view (cache size on disk, frame times). On the
    chart, a stale object wears a small clock badge at its upper left, ivory on ink, where no ladder
    ornament goes (the unknown-state "?" takes the upper right) — never a hue, so it can't be read as
    a work state (INV-20). In view shows it as a "last known" chip.
- **401 during sync:** stop, and ask for a new PAT.
  - **At the first look**, the job fails and the error says to enter a new token from the mode chip.
  - **Part-way through a stream (decided 2026-10-09):** a 401 that is not one of §1's quiet 401s (pictures, team
    settings and boards, PR threads, builds) means the token has died, and every later call would fail the same way. The stream drops what's queued, stops,
    and sends `scope.updated { refused }`; the renderer shows the same error and ends "Filling in".
    What was already read stays in the cache, and the scope is marked partial with a note rather than
    complete, so the next open streams it again. (The quiet 401s of §1 are expected and don't do this.)
  - **Said where it's seen (decided 2026-10-22).** The error sat in the Requests panel, so the renderer
    also keeps a flag (`tokenRefused`), set only where a 401 stops the work (`refusesToken`): a failed
    sync or a call that threw, or a stream cut short. Not by any 401 in the request activity: a token can
    read the work and be refused one team's settings (`teams` 401, which `service.ts` carries on
    without), and that says nothing about the token. While the flag is set:
    - a notice hangs under the mode chip (`TokenNotice`) with *Enter a new token*, and the chip turns coral;
    - the player's widgets (request, loading, gathering) say it too, with the same button, in place of
      what can't finish;
    - the button opens Connect with the token field focused, and Connect says why;
    - a new token clears the refusals.

    The words say what was refused (for "signing in" or "listing projects", that it has expired) and
    the likely causes, since a token can lack a scope without having expired. A team's 401 is explained
    in the Requests panel as unreadable team settings, not as an expired token.
  - **A throttle pauses the whole queue** (`throttleGate`), not just the one request: a 429 sets a gate
    from its `Retry-After`, and nothing new starts until it opens. Work already in flight finishes.
- **403 or 404 on an item that was seen before:** keep the last known facts and mark them stale
  (02 §3).
- **What a failure does (slice 7, decided 2026-10-10; `failureTier` in `neterror.ts`):**

  | Tier | Statuses | Retries | Then |
  |---|---|---|---|
  | `stop` | 401 (except §1's quiet 401s: pictures, team settings and boards, PR threads, builds) | none | Stop, and ask for a new token (above) |
  | `gone` | 403, 404, 410 | none | That one thing: stale if seen before, else listed missing; the scope is partial |
  | `transient` | no response, 408, 429, 5xx | throttles: up to 6 with `Retry-After`; 500/502/504 and no response: 3, full jitter | On one item, the same as `gone` for this sync; on a scope-level call (the look, a WIQL), the sync fails |
  | `error` | anything else (400, 409) | none | It throws: a mistake in the request is never hidden |

  Every failure still carries its `NetError` details (§3, Errors; the Details panel). A picture's
  401 or 404 is quiet (`isQuiet`, §7), and so is a 401 on team settings and boards (`teams`) or builds (§1).

  **Source:** `src/shared/contracts/neterror.ts` (`failureTier`, `isQuiet`, `classify`),
  `src/main/ado/http.ts` (`TRANSIENT_STATUS`, `TRANSIENT_RETRIES`), `src/main/sync/sync.ts` (`isGone`) ·
  **Update when:** a status moves tier or a retry count changes.
- **PRs and repos that can't be read (slice 7).** Coverage gains
  `missing: { kind: 'pr' | 'repo'; key; status; seen }[]`.
  - A PR read before keeps its cached record, so it's still drawn, and its key joins `stale`; the
    vessel wears the clock badge.
  - A PR never read is only listed.
  - A repo whose PRs can't be listed (forbidden, deleted, or another project's: TF401019) is listed
    too.
  - The coverage panel shows "N pull requests couldn't be read", then each one with its last known
    title and why (not allowed (403), not found (404), no response).
  - Each sync asks for them again. The full sync re-reads every linked PR; the stream adds the missing
    ones to its PR refetch. An answer takes it off the list (`mergeMissing`).
- **Cache repair (slice 7):** a 404 during a rescan removes the item (02 §3, `Cache.forgetWorkItem`),
  logged as `cache-repair` with counts only.

## 6a. Approvers at completion (the review formation, slice 3a)

*Applies to: both views · ADO mode* (in Solar the approvers are the merge's `support`, 03 §5d; in
the v0 views, the review formation).

For each completed PR, `pr_completed.payload.approvedBy` lists the reviewers whose vote **standing
at `closedDate`** approved (`10`, or `5` approved with suggestions):
1. `GET .../pullRequests/{id}/reviewers`: identities and final votes. Skip `isContainer` groups.
2. `GET .../pullRequests/{id}/threads`: replay `VoteUpdate` threads (`properties.CodeReviewThreadType`,
   `CodeReviewVotedByTfId` normalized per §7, `CodeReviewVoteResult`, `publishedDate`) up to
   `closedDate`, so a vote reset on a later push is honored. These keys are undocumented: parse
   defensively and skip deleted threads.
3. If threads are unreadable, use the final votes (a completed PR's final approvals are almost always
   the ones that let it merge), and record that in the coverage notes.
Approvers are captains (they get ships and call signs) but never `changedBy`: approving is not
counted as activity on the chart (02 INV-07, INV-08).

## 6a-1. The PR stat line (v1.3 B1)

*Applies to: Solar · ADO mode.* A station's expanded plate shows one quiet line under each PR row, and the
PR's Inspector body shows it too (15 §6 `pr-stat`). Its four facts are kept in `pull_requests.stats_json`
(`PrStats`, 03 §2), with the source commit they were read at:
1. **Votes.** `GET .../reviewers`: each reviewer's *current* `vote`, counted: 10 approved, 5 approved with
   suggestions, -5 waiting for the author, -10 rejected; 0 (no vote) and groups (`isContainer`) are skipped.
   No history is kept and no event is made: approving stays a non-event (02 INV-07).
2. **Pushes.** `GET .../iterations`: how many.
3. **Threads.** `GET .../threads`: threads a person started. Not counted: a deleted thread, a thread with no
   live comment, any thread with a `properties.CodeReviewThreadType` (vote, reviewer, ref-update and policy
   threads), and a thread whose live comments are all `commentType: system`.
4. **Files.** `GET .../iterations/{last}/changes`, paged (`$top=1000`, `nextSkip`, at most 10 pages): the
   entries that are not folders. Skipped when there is no iteration.

**Which loads read them.**
- The **full sync** (`syncScope`): while the PR record is read, inline. The **level loader's scene step** reads the PR record
  and (completed PRs) the approvers' reviewers and threads inline, but **not the stat line**: that is queued like the
  feature step's, carrying the review it already read.
- The **sprint stream**, a level load's **feature** step and its **history** step: *after* the view's own work. The
  stream lists the PRs that need them (never read, or worth refetching) and reads them once it says it is
  done; a level load does the same once it has returned (`runStatsInBackground`): **one queue per org** (concurrent loads add
  to it, a PR is not queued twice, never 2 x N wide) on **one service-level controller**, stopped by a purge, a new or forgotten token
  and a change of scope. Either way: two at a time,
  never while the shared throttle gate (§6) is shut, ending at once on a stop or an abort, and without the
  scheduler: `drain`, `finish` and the derived rebuild never wait on them. A stream's finished PR tells the
  view which pieces it touches, so the line fills in behind the scene (`SprintStream.fill()`'s promise does
  wait, so a test can await them). A level load has no such channel: its lines show on the scope's next
  load. Plates reserve the line's height meanwhile (R4).
- A PR with its stats cached that is not worth refetching (closed over 7 days ago) is **not** read again.

**What a read costs** (calls per PR; `src/main/sync/prStats.ts`):

| Case | Calls |
|---|---|
| First read | reviewers, threads, iterations, changes: 4 (+1 per further 1000 files) |
| Refresh, open or closed within 7 days, no new push (last source commit unchanged) | reviewers, threads: 2 |
| Refresh, open or recent, a new push | 4 again |
| Refresh or sync, closed over 7 days, stats cached | 0 |
| A completed PR with no approvers yet (stream) | +2 for the approvers task (§6a), at the view's own priority; the stat read then reuses what it read (no second look) |
| A completed PR in the full sync or level loader | the approvers' reviewers and threads are read once and handed to the stats (inline in the sync, in the deferred job in a level load; no extra) |

Cadence follows the PR record's (§5 step 7): open, or closed in the last 7 days. A PR whose facts were never
read counts as worth re-reading until they are.

**Failures.** The stat line is a nice-to-have: **no refusal or transient failure of its calls fails a sync, a load or a
stream, or shows a banner**, with two exceptions: a 401 on reviewers, iterations or changes (a dead token, below) and the
approvers' own rules (last bullet).
- A **401 on reviewers, iterations or changes is not a refusal**: those need only Code (read), the PR record's own
  scope, so the token is no longer good (§6). Nothing is stored for that PR and the read stops: the full sync or
  level load fails as a dead token, and the stream's or a level load's deferred run ends (the stream refuses the
  token, `checkRefused`) instead of sending doomed calls.
- A **threads 401 is a missing scope** (`vso.threads_full`, §1): a refusal like a 403 (`threadsDenied`: the final-votes
  note for a completed PR; the line leaves threads out). It never stops a run or refuses the token.
- A refusal for good (403, 404) leaves that fact out; what was read is stored (`{}` when nothing was), so
  the PR is not asked again until it is next worth refetching.
- A failure that may pass (no response, 408, 429, 5xx) stores nothing: the PR stays unread and is tried once
  more at the next refresh. Facts already stored stay.
- **Approvers keep their own rules** (§6a): a thread list that fails for a reason the old code threw (429, 5xx,
  no response) still fails the completed PR's approvers step, as before B1; the stats are stored first. A
  threads refusal counts toward the "final votes" coverage note only when the PR itself was readable (a
  reviewers 404 means the PR is gone, and says nothing about scope).


## 6a-2. A station's last run (v1.3 B2)

*Applies to: Solar · ADO mode.* A station's expanded plate, and the repository's Inspector body, show
`Last run: passed · 2 h ago` (15 §6 `run-line`). A run is **state, not an event**: guards stay idle art, and no
event, flare or fact enters the timeline (13 Q7).

**Which API.** The **Builds API**, filtered by repository, over the Pipelines runs API: one call per repo answers
"latest on the default branch" (`repositoryId`, `repositoryType=TfsGit`, `branchName=<default>`, `$top=1`,
`queryOrder=queueTimeDescending`), where Pipelines needs a pipeline list first, then runs per pipeline, and
cannot filter by repository. Queue order (not start order) so a build still waiting is the latest. The default
branch is the repository list's `defaultBranch`, kept in `repositories.default_branch`; a repo without one
(empty) is never read. Scope: Build (read) (`vso.build`).

**Mapping** (`parseBuildRun`). `status: completed` by `result`: `succeeded` passed, `partiallySucceeded` partly
passed, `failed` failed, `canceled` canceled (no or unknown result: no run, never a guess). Not completed:
`notStarted` and `postponed` queued; `inProgress`, `cancelling` running. The time is the finish (completed), the
start (running) or the queue time (queued).

**Stored** in `repositories.run_json` (`{ readAt, run? }`, migration `006_repo_runs.sql`; additive, no
`DERIVATION_VERSION` bump) and on `RepoFact.run` / `ScopeHistory.entities.repos[].run`.

**Failure tiers** (one runner with §6a-1, its own rules): **401, 403, 404, 400 and 409** are all "no run": the repo is
stored as read with no run, no line shows, no banner or coverage note rises, and it is asked again only after
`RUN_REREAD_MS`. A builds **401 is a missing Build scope** (§1), never a dead token (`isQuiet`: `refusesToken` is
false), so it never stops the run, fails a sync or refuses the token, and it **keeps the run read earlier** (the read is stored only for the back-off); the probe's `builds` row says "Build (read)" for a 401
or a 403. **Transient**
(no response, 408, 429, 5xx) stores nothing and the next refresh tries again. A failed call never fails a sync or
load. An empty list is "no pipeline": no line.

**Cadence.** Read for each repo with a PR in the scope, only when the repo was never read or `RUN_REREAD_MS`
(15 minutes, 15 §6 `run-line`) have passed since: a refresh inside the interval sends no call. The full sync
reads inline (4 at a time); the sprint stream and level loads read after their own work, in the stat lines' runner
(`runStatsJobs`: two at a time, behind the throttle gate, ending on a stop or abort), and the stream tells the
view which pieces the station's PRs touch so the line fills in behind the scene. A level load has no channel, so
its lines show on the next load. Plates reserve the line from the first draw (R4).

**As-of time.** "2 h ago" counts from the later of the scope's last sync (`coverage.syncedAt`, else the range's end)
and when the run was read (`entities.repos[].run.readAt`), on the plate and in the Inspector alike, so a run read
after the sync is never aged backwards. It is not the playhead: a run is current state, like the PR votes, and does not rewind.

## 7. Identities

*Applies to: both views · ADO mode.*

Build an `IdentityRefFact` from `System.AssignedTo` and `System.ChangedBy` in revisions, from the
current items' assignees, and from PR `createdBy`, `closedBy` and reviewers, then normalize the `id`
(03 §1). The first time a captain is seen, create their profile:
- `ship_seed` per [03 §9](03-contracts.md#9-sqlite-schema-v1-main-process), using the shared `fnv1a32`.
- `call_sign` = the first name plus a 2-character suffix from the seed (`callSignFor`). (Editing it
  isn't offered.)

Skip containers (`isContainer`).

**Pictures (slice 4; strategies from 2026-10-15; `src/main/avatars/strategies.ts`).** Each person's
picture is fetched once and kept in `identities.avatar` as an inline `data:image` URL (png, jpeg, gif,
webp, or svg; at most 140 KB), four people at a time. ADO has more than one way to hand one over, and
which a token may use differs by org and scope, so there are three strategies:

| Strategy | Request | Needs |
|---|---|---|
| `member` | the identity ref's `imageUrl` (or `_links.avatar.href`), as ADO wrote it: a `GraphProfile/MemberAvatars` link, binary | what that link accepts; the first route we had, and the one that answered 401 on one real org |
| `graph` | [Avatars - Get](https://learn.microsoft.com/en-us/rest/api/azure/devops/graph/avatars/get?view=azure-devops-rest-7.1) on the identity host, with the descriptor read from the `imageUrl`; JSON, the picture in base64 | PAT scope **Graph (read)**, `vso.graph` |
| `web` | the web app's `_api/_common/identityImage?id={identity id}`, binary, no api-version | Undocumented, and not yet proven against a real org; last in the order |

**The order is learned per org** (setting `avatars:{org}`): the strategy that last gave a picture goes
first, then the rest in the order above. A strategy the token is **refused** on (401, 403, a redirect
to a sign-in page, a 200 that isn't an image) twice in one run with no success is set aside for 24 hours
(`DENIED_TTL_MS`), so a refused route costs a couple of calls, not one per person. A new PAT (`setPat`)
forgets the refusals and asks again for everyone who came back "none". A 404 or ADO's own drawn initials
(`isAutoGenerated`) means this person has no picture: it is believed from a route that has not been
refusing us, and otherwise the next route is asked. "None" is stored as `''` (asked once). If every
route was refused or failed, the person is left unasked, so a better token or a later sync finds them.
The renderer never fetches from ADO (INV-17).

**A picture ADO won't give us is quiet (decided 2026-10-09).** A picture is a visual nice-to-have, not
data. Some PATs can read work items but not other people's pictures: the call answers **401**. Other
people simply have none we can see: **404**. Both are expected, and say nothing about the connection.
The failure is kept as an error in the request panel, with details, but marked *quiet*: it never turns
the Requests button into an error (06 §5). It can't hide a real expired token or a deleted item, because
those fail the other kinds of call too, and those stay loud. Anything else wrong with a picture — a 403,
a 429, a 5xx, no response at all — is still trouble. (With the strategies, a 403 is a refused route and
is still loud for the few calls it takes to set the route aside.)

**Pictures you add by hand (slice 6, built; `src/main/avatars/pictures.ts`).** `pictures.add` opens a
file chooser in main, cuts the image to a 128 px square PNG (`PICTURE_PX`; sources up to 12 MB), and
keeps it at `userData/pictures/<org>/<identity id>.png`. Settings → Captain Avatars ([13 §7](13-game-design.md)) adds them in bulk through `pictures.set` (bytes the renderer holds: dropped, pasted, cropped), and copies the folder out and in (`exportTo`, `importFrom`), keyed by IDs, never by name (INV-22). It
wins over ADO's picture (`HandPictures.overlay`), and the bundle marks it `handAdded`. It lives
beside the cache, not in it, so Purge leaves it. (superseded 2026-10-13: "deferred to slice 6".)

## 8. Cache policy

*Applies to: both views · ADO mode.*

| What | Kept in | Served | Refreshed |
|---|---|---|---|
| Projects | `projects` table | from ADO, or the cache when offline (`cacheOnly`) | one fetch serves 30 s of callers (in memory) |
| Your recent projects | `recent:{org}` setting | the galaxy's order | on each `projects.recent` call |
| Area tree | `area_nodes` | the cache at once once read | in the background when older than 60 s; `chooserChanged { what: 'areas' }` on a difference |
| Sprints (iteration tree) | `iteration_nodes` | the cache at once once read | the same, `what: 'iterations'` |
| Teams and their cadences | `teams:{org}:{projectId}` setting | cached | at most once a minute, in the background |
| Epics | `epics:{org}:{projectId}` setting, keyed by the saved Area Paths | cached while those are unchanged | in the background when older than 60 s, `what: 'epics'` |
| Work items, history, PRs | the source tables (03 §9) | `history.load` derives from them | per item from checkpoints; PRs per §5 step 7 |
| A scope's derived tables | `links`, `observations`, `events` | the galaxy's activity | rebuilt wholesale after each sync or finished stream |

**Source:** `src/main/ado/service.ts` (`projects`, `areaTree`, `iterations`, `teams`, `epics`),
`src/main/db/cache.ts` · **Update when:** a chooser's freshness window or store changes.

**The galaxy's chooser answers from the cache (decided 2026-10-07).** After the first read, a
project's area tree, saved Area Paths, and Epics come straight from SQLite. Anything not refreshed this
session (or in the last minute) refreshes in the background. When the refresh finds a difference,
main sends `chooserChanged`, and the chooser, the Area Path plate, and the Inspector's picker read
again. Only a project's first read waits on ADO. Opening a project skips the Epic lookup when a saved
Area Path will open anyway.

- Cache only the facts in 03 §2. Never cache descriptions, comments, or attachments.
- The UI shows the cache size and path. **Purge** deletes the DB (with its `-wal` and `-shm` files)
  and recreates it from scratch, cancelling any sync and stream. It keeps the token (its own store),
  the connection (the org, the Azure CLI sign-in flag, and who you are: `auth_az`, `me_key`, `me_name`), `settings.json` and hand-added pictures.
- Work-item data counts as the Federation's *Internal* data. It stays on this Mac under `userData`, which is
  not the OneDrive project folder, and is protected by FileVault (INV-18).
