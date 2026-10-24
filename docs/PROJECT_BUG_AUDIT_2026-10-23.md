# Rove — project-wide bug audit
**Audit date:** October 23, 2026 (Pacific)
**Scope:** `rove-frontend` (`claude-frontend`), `rove-claude` (`claude-development`), deployed preview at https://rove-cac-preview.vercel.app.
**Important:** The preview is a schedule-only demonstration, not independently verified navigation for blind travelers.

## Checks performed

| Area | Result | Evidence |
|---|---|---|
| Frontend syntax and unit tests | PASS — 46/46 | `npm run check && npm test` |
| Backend unit and integration tests | PASS — 122/122 | `npm test` |
| Backend syntax and secrets | PASS — 759 syntax files; 142 tracked files scanned | `npm run check && npm run check-secrets` |
| Frontend secrets | PASS — 39 tracked files scanned | `npm run check-secrets` |
| Dependency security | PASS — 0 reported npm audit vulnerabilities in both projects | `npm audit --json` |
| Published GTFS data | PASS — all five agencies have routes, stops and active services | `npm run audit-data` |
| Production smoke | PASS — 11/11 | `ROVE_URL=https://rove-cac-preview.vercel.app node scripts/demo-readiness.mjs` |
| Map rendering | PASS — Standard, Dark and Satellite; three cities; multiple zoom levels; selection and filters | `CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ROVE_URL=https://rove-cac-preview.vercel.app npm run verify-map-render` |
| Mobile/desktop browser smoke | PASS — 320, 390, 768, 1280px; no horizontal overflow or page JS errors | `/tmp/rove-project-audit.mjs` |
| Real itinerary and navigation smoke | PASS — Haight/Ashbury → Chase Center; journey help, minimize/resume | `/tmp/rove-project-audit.mjs` |
| Accessibility on actual devices | **NOT VERIFIED** | Requires VoiceOver/TalkBack and blind-rider testing |

## Bugs fixed in this audit

1. **P1 — Unsupported “Arrive by” option.** The Vercel schedule-only planner returns HTTP 422 for arrive-by, yet the UI offered it. The UI now reads the routing engine capability and hides that option in preview mode, even if the user is already typing.
2. **P1 — Unhelpful routing errors.** The preview's 14-day schedule limit and unsupported travel modes previously produced a generic failure. HTTP 422 responses now explain the actual limitation, and the planner discloses schedule-only and unverified walking.
3. **P1 — Future-trip countdown.** Starting a trip scheduled several days ahead displayed days until arrival as if they were travel time. The journey header now shows the departure date and actual trip duration, and distinguishes expired scheduled arrival times.
4. **P1 — Closely spaced stop GPS ambiguity.** Repeated GPS fixes near adjacent stops could advance a stop estimate without sufficient separation from the previous stop. Added a conservative separation check and unit regression test; close stops require rider confirmation.
5. **P2 — Invalid autocomplete ARIA structure.** A listbox contained buttons, headings and nested lists rather than options. Changed it to a named Suggestions region with ordinary keyboard-operable buttons.
6. **P2 — Misleading reroute recovery message.** A failed reroute previously told blind users to check the map. It now advises finding a safe location and asking transit staff for help.
7. **P2 — Map QA launcher failed without bundled Chromium.** Added fallback to installed Chrome when Playwright's bundled browser is absent.
8. **P2 — Backend verification scripts crashed against the preview.** The full-OTP routing and launch-scenario suites now identify the experimental preview and exit with an explicit SKIPPED status rather than reporting false failures or JSON parse crashes.
9. **P1 — Oversized deployment context.** Local agent workspace files under `.claude/` were not excluded from Vercel uploads (roughly 961 MB on disk). Added `.claude/` and `.playwright-cli/` to both `.gitignore` and `.vercelignore`, without deleting any workspace files.

## Remaining risks / blockers

| Priority | Issue | Next step |
|---|---|---|
| **P0 safety** | The deployed routing engine is `EXPERIMENTAL_SCHEDULE_ONLY`; walking and transfers are not independently verified for safe crossings, station entrances or platforms | Do not claim independent safe blind navigation; validate pedestrian routes and station access with real riders |
| **P1** | Many scheduled transit legs lack intermediate-stop sequences, so reliable stop-by-stop progress cannot be calculated | Add validated trip-specific stop sequences from GTFS, with correct service day and trip matching |
| **P1** | Screen-off/background GPS and speech are not reliable in a browser | Native mobile background capability and device testing, or clearly require foreground use |
| **P1** | `/api/v2/places/search` and `/api/v2/places/reverse` return 404 in the Vercel preview; the frontend falls back to external geocoders (Photon worked for “Chase Center”) | Deploy a bounded server-side place-search service or monitor fallback reliability and rate limits |
| **P1** | Live arrivals are verified for a subset of agencies/stops only, and predictions are not proof of boarding | Keep scheduled/live distinction visible; test agency-by-agency against actual stops |
| **P1** | No real VoiceOver/TalkBack, field, or blind-rider usability validation yet | Conduct keyboard, VoiceOver, TalkBack and real-world accompanied testing |
| **P2** | Full OTP route-quality checks are inapplicable to the serverless preview | Run those suites only against the full backend; use the 11-case readiness test for preview |
| **P2** | Some route alternatives can include extra transfers or walking; a sample Haight/Ashbury → Chase Center route returned four options | Add human-reviewed route-quality fixtures and penalize avoidable detours |

## Release criteria

The changes above are automated-test and browser-tested, but **not a safety certification**. Before any claim that blind riders can travel independently with Rove: verify walking geometry and accessible station entry, correct vehicle and direction confirmation, accurate transfer timing, stop sequence data, missed-stop recovery, voice accessibility, and foreground/background behavior on physical iOS and Android devices.

## Reproduction commands

```bash
cd /Users/Sahil/rove-frontend
npm run check && npm test && npm run check-secrets
CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ROVE_URL=https://rove-cac-preview.vercel.app npm run verify-map-render

cd /Users/Sahil/rove-claude
npm run check && npm test && npm run check-secrets && npm run audit-data
ROVE_URL=https://rove-cac-preview.vercel.app node scripts/demo-readiness.mjs
```
