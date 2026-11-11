# Review C4a, round 1 · Verdict: pass
1. Nit — the `'merged'` fault in `resolveProfile` cannot be reached, so the packet's "override that fails the merge" unit case is not written.
   Evidence: `src/shared/profile/resolve.ts` validates the override with `profileOverrideSchema` (same ranges, partial) before merging into a valid base, so the merge cannot fail. `tests/unit/profile.test.ts` has no `merged` case. The defensive branch and the notice text are harmless.
   Acceptance line or rule: C4 acceptance "a broken override falls back to the bundle (unit)" is met by the parse, schema and unknown-id cases.
Not findings:
- Checks run: typecheck, lint and `npm test` (99 files, 1458 tests) green. `with-lock npm run e2e:keystone` 43 passed (re-run once; the first was queued behind another agent's lock). Goldens and `docTables` unchanged in value.
- Real-launch probe (throwaway, scratchpad) of `window.starChart.env.profile`: no env gives desktop/bundled/45000; `STAR_CHART_PROFILE=phone` gives phone/pinned/30000; `nope` gives desktop with the unknown-id notice; bad JSON gives the parse notice; `{profile:'tablet',pacing:{budgetMs:12345}}` gives tablet/override/overridden/12345. The launch argument, preload parse and sandboxed preload bundle all work.
- No behaviour change: nothing under `src/` reads the profile yet; `BUDGET_MS` and the other constants are untouched (the grep acceptance is C4b/C4c's). 15 §10 rows were correctly not retargeted; §11 says so.
- Devlog carries `source` and `reason` codes only, and both keys are in the redactor's allow-list. `STAR_CHART_PROFILE` is honoured only when unpackaged. `src/shared/` stays pure (JSON import and zod only).
- Docs 03 (env.profile, launch variable), 14 §2.9, 15 §11 and the `tests/README.md` row match the code. `profile-deltas` is correctly in `UNGUARDED`.
