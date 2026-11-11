# Slice 1.2 · Pictures by several routes (2026-10-15)

Off the plan's list: the user's real-org run answered **401** on every captain's picture.

1. **What was built.** Pictures are fetched by three strategies (`src/main/avatars/strategies.ts`): the
   identity's own `imageUrl` (the old and only route), the **Graph Avatars API** on the org's identity
   host, and the web app's `identityImage`. Per org the order is learned (the route that last worked
   goes first); a route the token is refused on twice with no success is set aside for 24 h; a new PAT
   forgets refusals and re-asks everyone who came back "none". People are fetched four at a time
   (`sync.ts`, `levels.ts` both call `fetchPictures`). A person is stored "none" only when a route said
   so; if every route was refused or failed they stay unasked (before, any failure was stored as none
   for good). The transport allowlist gained the org's identity host (`vssps.dev.azure.com/{org}`),
   which Graph needs; opening ADO pages in the browser still uses the org origin only.
2. **Contracts changed.** 04 §1 (scope **Graph (read)**, optional; the allowlist), the `avatar` row of
   04 §2, 04 §7 (strategies, learned order, refusals). New setting `avatars:{org}`; no schema change.
   New dev-log events `avatar-fetch` (counts per route) and `avatar-denied`.
3. **Checks.** `tests/unit/avatarStrategies.test.ts` (new: allowlist, learning, TTL, fallback, reset, the
   fake org's Graph route). `npm test`, typecheck and lint pass. `solarRound.test.ts`'s "holds every
   planet in place" now pins the stream to one task at a time: its `partWay` flag depended on how many
   microtask hops the idle pictures task took, which the pool changed (the invariant it checks is
   unchanged). Mapped e2e and keystone: see the hand-back.
4. **Human gates.** The user's live check, pass or fail only (INV-18): reconnect with a PAT that has
   **Graph (read)**, open a sprint, and see whether captains wear pictures. The dev log's
   `avatar-fetch` lines say which route gave them (`via`, counts), with no names.
5. **Known limitations.** The `web` route is undocumented and unproven against a real org. Graph's
   `size=medium` is a guess at a good size; the label downscales it. The avatar family's 403 stays
   loud (`isQuiet`): a Graph 403 will show in the Requests panel for the few calls before the route is
   set aside. The descriptor is read from the `imageUrl`; an identity ref whose link doesn't name one
   skips the Graph route.
