# Slice 1.3 E4 and E5: "Is this you?" and Sign in with Azure CLI

**Status:** built 2026-10-28, awaiting the user's review.

## 1. What was built
- **E5.** `src/main/credentials/azCli.ts`: `parseAzToken` (`expires_on`, then `expiresOn`, else an hour), `execAz`
  (`execFile`, no shell, fixed arguments, 15 s timeout, 64 KB output cap), `azLoggedIn` (`az account show`),
  `fetchAzToken` (`account get-access-token --resource 499b84ac-…`), and `AzSession` (memory only; refreshes before
  expiry, about hourly; a failed refresh keeps the old token and retries in a minute; `refetch()` for a 401, at most
  once per 20 s). `AzOverlayStore` (in `store.ts`) puts the az token ahead of the stored PAT without ever passing it to
  the Keychain store. `HttpTransport` sends `Bearer` for an az token and re-fetches once on a 401. `AdoService`
  gained `azAvailable`, `azSignIn`, `resumeAz` (launch asks `az` again if that was how you connected) and shares one
  `connectWith` check with `setPat`. The Connection tab shows `Sign in with Azure CLI` only when `az` answers, and
  `Sign out of Azure CLI` in place of `Forget token` while signed in that way.
- **E4.** `connectionData`'s `authenticatedUser` is kept (identity key and name) at connect and carried in
  `auth.status().me`. `settings/tabs/SuggestViewer.tsx`, first in *Your captain*, asks "Is this you?" in ADO mode when no
  viewer is chosen and the person is in the loaded history: `Yes, that's me` chooses them; `No, choose myself` hides it
  until the tab is reopened. Fixtures never show it. Q8 closed.
- Test support: fake ADO's `authenticatedUser` can be a scenario person (`STAR_CHART_FAKE_ME=<handle>`, test mode);
  in test mode `az` is looked up on the process PATH only.

## 2. Contracts changed
03 §6 (`auth.status` gains `method` and `me`; `azAvailable`, `azSignIn`; the channel table; the `auth` log line),
04 §1a (new), 02 INV-17 (the az token), 13 §7 and §10–§11 (Q8 closed), tests/README.

## 3. Checks
See the handoff message: typecheck, lint, `npm test` (new `azCli` unit file, 14 tests), `az-signin` e2e (3 tests), keystone.

## 4. Human gates
None added. Stills in `review/v1.3/E/`: `E5-connect.png` (the Connection tab after an az sign-in), `E4-is-this-you.png`,
`E4-confirmed.png`. Real-`az` check (the user, pass or fail only): with a logged-in `az`, the button appears and connects.

## 5. Known limitations and open questions
- Not run against a real `az` or a real org (INV-18): only the fake script and fake ADO.
- The 401 re-fetch is unit-tested (`azCli.test.ts`), not e2e. Quiet 401s (pictures, team settings) also trigger one re-fetch.
- An az sign-in does not survive a launch without `az` still being logged in; then you are asked for a PAT again.
- `me` matches only if ADO's `authenticatedUser.id` equals the identity id on work items (true for the fake; expected for ADO).

## Fix round (2026-10-28)
- `HttpTransport.send` reads the token and scheme together when the request leaves (not before waiting for a slot); on a 401, if the
  current token differs from the one sent it retries with it, no fetch. Unit test: concurrent requests, one re-fetch, both succeed.
- The launch resume no longer blocks the window: it starts in parallel, only in ADO mode; IPC channels that read the connection
  (`auth.status`, `projects`, `sync.start`, ...) wait for it. After it succeeds, `connectionData` is re-read so `me` matches the
  current az account (a 401 clears it).
- A refused PAT entered while az is signed in restores the saved PAT (`AzOverlayStore.stored()`, never the az token) and then the az session.
- Test mode runs `az` only from `STAR_CHART_TEST_AZ_DIR`; absent, az is missing. `az-signin.spec` uses it.
