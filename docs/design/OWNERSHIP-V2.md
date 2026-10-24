# Redesign v2 file ownership (5 agents + lead)

Base branch: `claude/rove-redesign-20261024` (from `feature/rove-a11y-journey-20261023` @ 8475383, which is the PRODUCTION branch: never push to it).
Each workstream works on its own branch `redesign/<letter>-<name>` and edits ONLY what it owns.

| Agent | Workstream | Owns |
|---|---|---|
| A | Visual system, desktop, home, directions, search, settings | `css/rg-tokens.css`, `css/rg-home.css`, `css/rg-search.css`, `css/rg-desktop.css`; app.js: `viewHome`, `HOME_MOTIF`, `ROVE_MARK`, `RG_ICON`, `rgIcon`, `viewPlan`, `updatePlanSuggestions`, `placeOptionRow`, `viewAccess`, `viewSources`; `index.html` `<header class="panel-top">` and `<head>` meta only |
| B | Map graphics | `css/rg-map.css`; app.js: `THEME`, `mapLineColor`, `restyleBasemap`, `fetchStyle`, `routeFeatures`, `stopFeatures`, `addTransitLayers`, `applyMapState`, `revealSelectedRoute`, `revealJourney`, `highlightPlace`, `renderVehicles`, `journeyFeatures`, `journeyPointFeatures`, `renderJourney`, `cameraPadding`, `fitCoordinates`, `fitJourney`, `setupMapInteractions`; `index.html` `.map-controls`, `#layersPopover`, `.map-area` blocks |
| C | Mobile sheet, classic/audio-first modes, station & nearby screens | `css/rg-sheet.css`; app.js: `measureSafeArea`, `detentHeight`, `currentSheetHeight`, `setDetent`, `applySheetHeight`, `nearestDetent`, `setupSheet`, `viewStop`, `departureRow`, `viewRoute`, `viewLines`, `viewAccessNearby`, `viewSearch`, the `rove-accessible` line in `init()`, and a new `setMode`/`viewModeChoice` pair; may add ONE block at the very end of `styles.css` marked `/* MODE SWITCH (agent C) */` |
| D | Route results, route details, active navigation, motion | `css/rg-results.css`, `css/rg-journey.css`, `css/rg-states.css`; app.js: `viewResults`, `routeStripHtml`, `routeMetaHtml`, `itineraryTimeline`, `viewNavigate` (keep the `#rgLive` element), `journeyLineHtml`, `factIcon`, `guideHelpHtml`, `arrivalSummaryHtml`, `viewDemo`, `toast` |
| E | Accessibility, voice errors, QA | `css/rg-voice.css`; app.js: `voiceStatusHtml`, `renderSpeechBar`, `VOICE_ERRORS`; `test/design-*.test.mjs`, `test/a11y-*.test.mjs`, `docs/design/qa/**` |
| Lead | Live tracking + integration | `css/rg-live.css`, `site/public/js/live-*.js`, `api/v2/realtime.mjs`, `api/v2/arrivals.mjs`, new `api/v2/live*.mjs`, `lib/realtime/**`; app.js guided-journey functions (`guideStatus`, `guideTick`, `updateGuideLive`, `beginNav`, `onNavPosition`, `guideGpsHint`) |

Never edit: `journey-guide.js`, `speech.js`, `voice-capture.js` (except E for presentation-only needs: ask the lead), `api/v2/plan.mjs`, `experimental-plan.mjs`, `experiments/**`, other workstreams' files or functions.
Safety rules that must survive: rider-confirmed steps only (GPS/time never advance); while Help is open the dock shows only Close help; focus moves to `#rgHeading` after each step; `prefers-reduced-motion` removes decorative motion; never fabricate live data, geometry or accessibility facts.
