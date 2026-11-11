# Slice 1.2-token-retry: a refused token said out loud, and Retry when history doesn't finish

**Status:** built 2026-10-22, from the user's note after a real-data run ("the 'ADO refused the token'
error is buried in the requests history panel… add a tooltip… and the same text and button to the
loading widget… Actually, the token itself appears able to make some requests. I wonder if the real
error is deeper… add a Retry button should it detect that requests were attempted, but not completed").

## 1. What the run log showed (the real error, one level down)
The last real run's dev log (redacted: statuses and counts only) shows the token is not dead: 498
history reads, projects, work items, PRs and states all answered 200. The 401s were the `teams` family
(30 refused, 31 fine, interleaved: some teams' settings are readable and some aren't) plus the quiet
picture ones. `service.ts` already carries on without a team's settings (`teams-unavailable`), but the
Requests panel counted each as a red error whose Details said "ADO refused the token: it's expired,
revoked…". So the scary text was about something the app handles.

So the notice is not "any 401 in the request list" (that would have fired on this very data):
- **A flag, `tokenRefused`, set only where a 401 stops the work** (`refusesToken`): a failed sync, a
  stream cut short, or a call that threw. A team's 401 and the picture 401 never set it.
- **The team's 401 is now explained as itself** in the Requests details ("Team settings not readable…
  Everything else the token asks for works"), not as an expired token.

## 2. What was built
- **The notice** (`panels/TokenNotice.tsx`): under the mode chip, in words, with **Enter a new token**
  and a dismiss (it returns for a newer refusal). The chip turns coral. Its words say what was refused
  ("signing in" and "listing projects" mean the token has expired; anything else: expired, revoked, or
  lacking the read scope for that).
- **The button** opens Connect with the token field focused, and Connect says why. A new token (or
  Forget token) clears the flag.
- **The player's widgets** (request, loading, gathering) show the same words and button in place of
  what can't finish.
- **Retry** (`Transport.tsx`):
  - **A history request that failed or was cancelled** (`historyAttempt` in the store): "⚠ Didn't
    finish" / "⚠ Stopped before it finished" and **Retry** in the load button's place, the same range.
  - **A streamed sprint's history that stopped short**: "History stopped N / M" and **Retry**, which
    reads the open scope again (`refreshScope`), once the stream has ended for `GATHER_STOP_GRACE_MS`
    with history still missing, or no request has started or finished for `GATHER_STALL_MS`
    (`gather.ts`, pure).
- Docs: 04 §6, 05 §2, 06 §5, 15 §10 (the two timings).

## 3. Checks
- **Unit:** `npm test` passes (1019): `refusesToken`, the team's wording, and `gatherStalled` (the
  grace, the stall, a request in flight).
- **E2E** (`token-notice.spec.ts`, new, 5): a 401 on history shows the notice, the coral chip and the
  player's button, which opens the token field; a dismissed notice stays gone; a stopped request offers
  Retry, which asks again; a sprint whose history stops short says "History stopped" and offers Retry;
  and a 401 on team settings changes none of it, with honest details.
- Mapped specs (offline, explore, activity, slice4, sprints) and keystone pass. The full suite: 167 + 21 passed.

## 4. Human gate
None new. For the user's eye: the notice's words, and Retry in the two widgets, on a real run.

## 5. Known limitations and open questions
- **Team 401s are quiet (decided 2026-10-26).** `isQuiet('teams', 401)`: listed in Requests with their
  details, never a red error. Other statuses on `teams` stay loud. (Guard: `activity.test.ts`, `token-notice.spec.ts`.)
- **Per-item history failures are tolerated** (a 5xx or timeout keeps last-known facts, marked stale),
  so a load can finish with history missing and the player never says so. The gathering widget now
  does; a team's request that finishes this way still shows a ready player.
- **No signal between clicking Load history and its first progress** (a few slow calls): the widget
  still reads "Load history…". Not changed.
