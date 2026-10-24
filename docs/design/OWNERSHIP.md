# Design sprint file ownership (8 parallel workstreams)

Base branch: `claude/rove-premium-design-20261023`. Each workstream works on its own branch and edits ONLY what it owns, so the lead can merge all of them.

| # | Workstream | Branch | Owns (may edit) |
|---|---|---|---|
| 1 | Tokens & motion system | design/1-motion | `site/css/rg-tokens.css`; in app.js: `RG_ICON`, `rgIcon`, `pushView`/`popView`/`goHome` nav-direction lines, the `render()` view-enter lines |
| 2 | Home screen | design/2-home | `site/css/rg-home.css`; app.js: `viewHome`, `HOME_MOTIF`, `ROVE_MARK` |
| 3 | Route results & timeline | design/3-results | `site/css/rg-results.css`; app.js: `viewResults`, `routeStripHtml`, `routeMetaHtml`, `itineraryTimeline` |
| 4 | Active journey screen | design/4-journey | `site/css/rg-journey.css`; app.js: `viewNavigate`, `journeyLineHtml`, `factIcon` |
| 5 | Voice listening/speaking | design/5-voice | `site/css/rg-voice.css`; app.js: `voiceStatusHtml`, `renderSpeechBar`; `site/public/js/voice-capture.js` |
| 6 | Search screen & panels | design/6-search | `site/css/rg-search.css`; app.js: `viewPlan`, `updatePlanSuggestions`, `placeOptionRow` |
| 7 | Help, errors, loading, arrival | design/7-states | `site/css/rg-states.css`; app.js: `guideHelpHtml`, `arrivalSummaryHtml`, `viewDemo`, `toast` |
| 8 | QA, accessibility, performance | design/8-qa | `docs/design/qa/**`, `test/design-*.test.mjs` only |

Shared rules: never edit `styles.css`, `index.html`, `journey-guide.js`, `speech.js`, `api/**`, or another workstream's CSS file/functions. Motion uses the tokens in `rg-tokens.css` (`--m-press/small/card/journey`, `--e-out/std`) and must be removed under `prefers-reduced-motion`.
