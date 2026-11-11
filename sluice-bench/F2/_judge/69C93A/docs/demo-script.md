# Demo script: Halcyon Reach, four pods

**Status:** current as of 2026-10-27 (23 Block A, A1). Fixture data only (INV-18). Run it with `npm run dev`
(the default fixture; Solar opens by default). The data is fixed by seeds, so it's the same every time.

The arc: start on **All projects**, open **Halcyon Reach**, open **Sprint 41**, then step through its four
pods. Each one has more captains, more repos and more going on than the one before. Press Esc to go back up a
level between pods.

## Before you start
- Play lengths are at 1× and are long for the big pods: merges and the key moments are never cut (05, B-7).
  Use **4×** for Quasar and Pulsar (rate keys in the player; ¼× to 4×).
- To jump about, drag the ruler or click a row in History; a seek lands exactly where playing would.
- Everything in the sprint is fictional: the people, repos and titles are invented.

| Pod | Captains (planets) | Repos | Plays at 1× | At 4× |
|---|---|---|---|---|
| Comet | 1 | 1 (monorepo) | ~50 s | ~13 s |
| Nova | 3 | 1 (monorepo) | ~3½ min | ~1 min |
| Quasar | 6, plus a manager | 10 | ~17 min | ~4 min |
| Pulsar | 20 | 14 | ~10 min | ~2½ min |

## 1. Comet Pod: one captain, two victories
- One planet, one Story (an asteroid) and one Bug (an enemy ship), each climbing every rung: New, Ready,
  Active, Resolved, Ready to Accept, Closed.
- Both PRs go into the **same repo**: its dreadnought changes form at the first merge, then fires again at the
  second.
- On each merge **an outside captain jumps in** to approve, then jumps out (a guest).
- The Bug closes last, so the final beat is the planet complete and the region clear: the victory.

## 2. Nova Pod: three captains, one shared dreadnought
- Three planets: one captain with 3 Stories, one with 3 Bugs, one with 2 of each.
- **One shared repo, one dreadnought** serving all three planets. Each captain approves the other two's PRs.
- **Spotlight:** at each working day's start one captain gets a short turn in the limelight; over the sprint all
  three do (05 §8.5b, M-28).
- Two captains finish everything. The bug captain ends with **one Bug still open and its PR still waiting**, so
  there is no "all clear": not every sprint ends in victory.

## 3. Quasar Pod: six captains and a manager
- Six planets, ten stations (polyrepo): a Story spans 1 to 3 repos, with 1 or 2 PRs in each.
- **The manager has no planet** (they hold no Story or Bug), yet they approve **every** PR, with one developer
  beside them, and do 5 to 8 Tasks under other people's work.
- **Two items reopen**: one Story and one Bug, on different captains, are Closed and then go back to Active
  (a reverse flare, not a victory), and are finished again before the sprint ends.
- Everyone ends with all their work Closed.
- **A station stands by** (23 C2): `search-api`'s last PR merges on Wed 16 Sep (about 2 PM Pacific), and nothing
  opens there after. Two days of history later, **Fri 18 Sep about 2 PM Pacific**, with the rest of the pod
  still at work, its hull and lights dim to grey over ~2.4 s, its plate drops to the quiet look, and its drift
  stops. Play at 4× from Thu 17 Sep to watch it. The weekend then quiets most stations (every one is on
  standby by Sat evening), so don't read that as the example. They wake as Monday to Thursday's PRs land;
  `search-api`, `inbox-mobile` and `checkin-worker` have no PR after the first week, so they never wake. It is
  not a designed beat, just the data: `halcyonCoverage` fails if a reseed loses a weekday standby.

## 4. Pulsar Pod: twenty captains
- Twenty planets and fourteen stations. Between them the captains fly **all nine hull designs in all eight
  colourways**; the stations show all nine looks.
- Each captain has 1 to 4 items, and 1 to 5 Tasks under other people's work.
- PRs have **two reviewers as a rule**, one or three now and then.
- **About a fifth of the work closes with no PR** (a landing or a strike run with no station beam).
- The odd ones out: a Story that was **Removed** (a ghost), a Bug **Rejected** (a ghost with a strike), a Story
  **Deferred** (pause bars) before it started, a PR **abandoned** and redone, and a Story **nobody has picked
  up**, waiting in the frontier belt.

## If something looks off
- A pod that seems empty: it's Sprint 41 you want (the current one). Sprint 40 is a quiet one: three Stories.
- The data comes from `fixtures/scenarios/halcyon/pods.ts`. To reroll a pod, change its seed there and run
  `npm test`: `halcyonCoverage` fails if a change loses a variant (a hull, world, station design, a rung).
- To change who the captains are or what the repos are called, run
  `npx vite-node -c vitest.config.ts scripts/find-cast.ts`: a name fixes a look (a hash, INV-12), so it
  searches names that keep every variation.
