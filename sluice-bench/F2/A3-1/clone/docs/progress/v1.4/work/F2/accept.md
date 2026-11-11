# F2 acceptance (orchestrator)

- Round 1 (planner, builder, reviewer, fixer, re-review) built nothing: the planner prototyped and returned
  without a packet. Its records are build-1.json, review-1/2, fix-1.json. Round 2 planned and built in one
  builder pass (packet.md, plan-2.json, build-2.json); review-3 accepted it with minors only, so no fix round.
- Minors fixed by the orchestrator: 15 §8's jump-in tell Beat ms 585 → 300 and fold ring 600 → 0 (it played
  inside the gather); 13 §6 and 05 M-13 no longer say the ship goes on to a waiting next sortie.
- Decision recorded as a departure from 27 F2's Decided text (in its State line): the ship always flies on to
  its rest; P4's park-for-a-close-turn wait isn't applied to a pass, and a sortie close behind flies out from
  where the ship is drawn.
- Minors left: solar-dense's held-turn check exempts any event that plans a jump-in (it still needs one held
  episode); the guest path's `pointOf(f.at)!`; and under reduced motion a guest summoner's blip plays at an
  empty spot.
- Checks at accept: typecheck and lint pass; unit 1721/1721; gallery-assets and solar-dense 25/25;
  e2e:keystone 42/43. The failure, touch.spec.ts:70 (long press on a plate row), passed 3/3 when rerun
  alone; it's a timing flake under load in code F2 doesn't touch. The full e2e suite wasn't run.
