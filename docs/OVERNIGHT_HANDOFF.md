# Overnight handoff (resume checkpoint)

- Worktree: `~/rove-a11y-journey`
- Branch: `feature/rove-a11y-journey-20261023` (pushed to origin; never force-pushed)
- Base: `origin/integration/rove-accessible-preview` @ `03ec00c`
- Merged in: `claude/routing-quality-20261023` (routing subagent; local branch, not pushed separately)
- Preview: https://rove-cac-preview-m4au73b38-sahilgbhuva.vercel.app (Vercel Preview, behind deployment protection). Production was not touched by this session.

## Resume
```
cd ~/rove-a11y-journey
git pull --ff-only
npm ci
npm test                         # expect 0 failures (5 skipped need OTP or a 511 key)
node scripts/preview-site.mjs    # http://localhost:4321, serves site/ plus api/v2 like Vercel
node scripts/bench-routing.mjs   # routing p50/p95
```

## Where things are
- Journey rules: `site/public/js/journey-guide.js` (tests: `test/journey-guide.test.mjs`)
- Speech: `site/public/js/speech.js` (tests: `test/speech.test.mjs`)
- Guided UI: `site/app.js`, section "Guided journey" (contracts: `test/guided-ui-contract.test.mjs`)
- Design layer: end of `site/styles.css` (`rg-*` classes)
- Planner: `api/v2/experimental-plan.mjs`, `experiments/bay-router/{route,rank}.mjs`, `docs/ROUTING.md`, `test/routing-quality.test.mjs`
- Progress log: `OVERNIGHT_PROGRESS.md`. CAC draft: `docs/CAC_SUBMISSION.md`. QA report: `docs/qa/QA_REPORT.md`.

## Not verified (needs a person and a phone)
1. Audible speech on a physical iPhone (Safari) and in iPhone Chrome; behaviour with the silent switch on. Procedure in `OVERNIGHT_PROGRESS.md`, section 2.
2. VoiceOver and TalkBack reading order and focus moves on real devices.
3. Real speech recognition on iPhone Safari (`webkitSpeechRecognition`): only simulated recognizers were tested.
4. Wake lock and behaviour while the phone is locked during a trip.

## Merge (do not force-push; review first)
See the final report section "Merge instructions" in OVERNIGHT_PROGRESS.md.
