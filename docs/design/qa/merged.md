# Rove design QA report

Base URL: http://localhost:4330  
Run: 2026-10-24T01:02:00.553Z (142 s)  
Chrome: Chrome/155.0.8059.86

Rerun: `node scripts/preview-site.mjs 4348` then `node docs/design/qa/design-qa.mjs --base http://localhost:4348 --puppeteer <dir with node_modules/puppeteer-core> --out docs/design/qa/<name>`. Configs: widths 320/375/390/430/768/1024 at 844 high, 390 dark, landscape 844x390, short 390x500, 390 with 200% root font size.

Audits run with `prefers-reduced-motion: reduce`; motion/performance sections use normal motion. Contrast counts are unique element+colour pairs with ratio < 4.5:1 (WCAG fail column applies the 3:1 large-text threshold). Dock overlap counts interactive elements whose centre hits `.rg-dock` after `scrollIntoView({block:"nearest"})`.

## Summary by viewport and scene

| Config | Scene | View | H-overflow | Targets | <44px | <48px | Contrast <4.5 | WCAG fail | Dock overlap (now / after scroll) | Console errors |
|---|---|---|---|---|---|---|---|---|---|---|
| 320 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 |
| 320 | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 |
| 320 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 |
| 320 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 320 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 |
| 375 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 |
| 375 | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 |
| 375 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 |
| 375 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 375 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 375 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 375 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 375 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 375 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 375 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 375 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 375 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 |
| 390 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 |
| 390 | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 |
| 390 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 |
| 390 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 390 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 390 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 390 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 |
| 430 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 |
| 430 | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 |
| 430 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 |
| 430 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 430 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 430 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 430 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 430 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 430 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 430 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 430 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 430 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 |
| 768 | home | home | no | 8 | 0 | 2 | 0 | 0 | — | 0 |
| 768 | plan-search | plan | no | 17 | 0 | 2 | 0 | 0 | — | 0 |
| 768 | results-demo | results | no | 13 | 0 | 2 | 0 | 0 | — | 0 |
| 768 | trip-1 | navigate | no | 6 | 0 | 2 | 0 | 0 | 0 / 0 | 0 |
| 768 | trip-2 | navigate | no | 7 | 0 | 2 | 0 | 0 | 0 / 0 | 0 |
| 768 | trip-3 | navigate | no | 7 | 0 | 2 | 0 | 0 | 1 / 0 | 0 |
| 768 | trip-4 | navigate | no | 6 | 0 | 2 | 0 | 0 | 0 / 0 | 0 |
| 768 | trip-5 | navigate | no | 7 | 0 | 2 | 0 | 0 | 0 / 0 | 0 |
| 768 | trip-6 | navigate | no | 7 | 0 | 2 | 0 | 0 | 0 / 0 | 0 |
| 768 | arrival | navigate | no | 3 | 0 | 2 | 0 | 0 | 0 / 0 | 0 |
| 768 | help-open | navigate | no | 9 | 0 | 2 | 0 | 0 | 0 / 0 | 0 |
| 768 | results-real | results | no | 12 | 0 | 2 | 0 | 0 | — | 0 |
| 1024 | home | home | no | 17 | 4 | 10 | 0 | 0 | — | 0 |
| 1024 | plan-search | plan | no | 27 | 4 | 10 | 0 | 0 | — | 0 |
| 1024 | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 |
| 1024 | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| 1024 | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 0 |
| 1024 | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 0 |
| 1024 | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| 1024 | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 1 / 0 | 0 |
| 1024 | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| 1024 | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| 1024 | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| 1024 | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 |
| 390-dark | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 |
| 390-dark | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 |
| 390-dark | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 |
| 390-dark | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-dark | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 390-dark | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 390-dark | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-dark | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 1 / 0 | 0 |
| 390-dark | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-dark | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-dark | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-dark | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 |
| landscape-844x390 | home | home | no | 17 | 4 | 10 | 0 | 0 | — | 0 |
| landscape-844x390 | plan-search | plan | no | 27 | 4 | 10 | 0 | 0 | — | 0 |
| landscape-844x390 | results-demo | results | no | 22 | 4 | 10 | 0 | 0 | — | 0 |
| landscape-844x390 | trip-1 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | trip-2 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | trip-3 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | trip-4 | navigate | no | 15 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | trip-5 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | trip-6 | navigate | no | 16 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | arrival | navigate | no | 12 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | help-open | navigate | no | 18 | 4 | 10 | 0 | 0 | 0 / 0 | 0 |
| landscape-844x390 | results-real | results | no | 21 | 4 | 10 | 0 | 0 | — | 0 |
| short-390x500 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 |
| short-390x500 | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 |
| short-390x500 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 |
| short-390x500 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| short-390x500 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 |
| 390-text200 | home | home | no | 7 | 0 | 1 | 0 | 0 | — | 0 |
| 390-text200 | plan-search | plan | no | 16 | 0 | 1 | 0 | 0 | — | 0 |
| 390-text200 | results-demo | results | no | 12 | 0 | 1 | 0 | 0 | — | 0 |
| 390-text200 | trip-1 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | trip-2 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | trip-3 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | trip-4 | navigate | no | 5 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | trip-5 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | trip-6 | navigate | no | 6 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | arrival | navigate | no | 2 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | help-open | navigate | no | 8 | 0 | 1 | 0 | 0 | 0 / 0 | 0 |
| 390-text200 | results-real | results | no | 11 | 0 | 1 | 0 | 0 | — | 0 |

## Focus after Confirm (must be #rgHeading)

| Config | Results |
|---|---|
| 320 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 375 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 430 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 768 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 1024 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-dark | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| landscape-844x390 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| short-390x500 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |
| 390-text200 | 1:board=ok, 2:ride=ok, 3:transfer=ok, 4:board=ok, 5:ride=ok, 6:arrive=ok |

(dom-click) means the Confirm centre was not hittable by a real pointer at that moment, so the script fell back to element.click().

## Help open, scrolled to bottom

| Config | Dock has Confirm | Close help in dock | Buttons hit | Obscured | Offscreen | Focus after open |
|---|---|---|---|---|---|---|
| 320 | no | yes | 3/5 | 0 | "Find another route", "Where am I?" | rgHelpHeading |
| 375 | no | yes | 3/5 | 0 | "Find another route", "Where am I?" | rgHelpHeading |
| 390 | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 430 | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| 768 | no | yes | 3/5 | "Find another route" by main#panel > header.panel-top > div.brand-row; "Where am I?" by main#panel > header.panel-top | 0 | rgHelpHeading |
| 1024 | no | yes | 2/5 | "Undo last confirmation" by main#panel > header.panel-top > div.brand-row | "Find another route", "Where am I?" | rgHelpHeading |
| 390-dark | no | yes | 3/5 | "Where am I?" by main#panel > header.panel-top | "Find another route" | rgHelpHeading |
| landscape-844x390 | no | yes | 1/5 | 0 | "Find another route", "Where am I?", "Undo last confirmation", "Rove voice: Off" | rgHelpHeading |
| short-390x500 | no | yes | 1/5 | 0 | "Find another route", "Where am I?", "Undo last confirmation", "Rove voice: Off" | rgHelpHeading |
| 390-text200 | no | yes | 1/5 | 0 | "Find another route", "Where am I?", "Undo last confirmation", "Rove voice: Off" | rgHelpHeading |

## Reduced motion

Running animations/transitions with non-zero duration under `prefers-reduced-motion: reduce`: **0**


## Performance (390x844, normal motion)

### Demo journey: layout shift and long tasks

| CPU | CLS (all / excl. recent input) | Long tasks (count / total / max ms) |
|---|---|---|
| 1x | 0 / 0 | 0 / 0 / 0 |
| 4x | 0 / 0 | 1 / 51 / 51 |

### requestAnimationFrame intervals over 3 s (vsync measured at 16.7 ms)

"dropped" = missed vsyncs relative to the measured refresh interval. Transition = home → results (startDemo) → trip (Start) → next step (Confirm) inside one 3 s recording. 4x = CDP CPU throttling to approximate a phone.

| CPU | Home motif p50 / p95 / max ms | dropped / frames | Transition p50 / p95 / max ms | dropped / frames |
|---|---|---|---|---|
| 1x | 16.7 / 16.8 / 16.8 | 0 / 180 | 16.7 / 16.7 / 16.8 | 0 / 180 |
| 4x | 16.7 / 16.8 / 16.8 | 0 / 180 | 16.7 / 16.8 / 50 | 3 / 178 |

Home motif animations running during measurement: 6.

## Keyboard-only Tab order (390x844)

### home

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Speak destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-primary.rg-speak[data-action="voice-destination"]` | yes | yes | no |
| 3 | button | Type a destination | `div.rg-home > div.rg-stack.rg-hero > button.rg-field[data-action="plan"]` | yes | yes | no |
| 4 | button | Try the demo journey . A simulated trip with a transfer | `div.rg-home > nav.rg-links > button.rg-link[data-action="demo"]` | yes | yes | no |
| 5 | button | Nearby stops . Uses your location | `div.rg-home > nav.rg-links > button.rg-link[data-action="access-nearby"]` | yes | yes | no |
| 6 | button | Voice and accessibility . Rove voice, vibration, how it work | `div.rg-home > nav.rg-links > button.rg-link[data-action="access"]` | yes | yes | no |
| 7 | button | Transit data . Sources and what is live | `div.rg-home > nav.rg-links > button.rg-link[data-action="sources"]` | yes | yes | no |

### results

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | Back | `div#panelBody > div.view-head > button.back-button[data-action="back"]` | yes | yes | no |
| 3 | button | Edit | `div#panelBody > div.trip-card.rg-trip > button.text-button.rg-trip-edit[data-action="back"]` | yes | yes | no |
| 4 | button | Read route choices aloud | `div#panelBody > div.rg-results-head > button.rg-read[data-action="access-all-routes"]` | yes | yes | no |
| 5 | button | Route 1: 1 hour 2 minutes. Muni N train, then BART Blue line | `ul.itineraries.rg-routes > li.rg-route-item > button.itinerary.rg-route[data-action="it-toggle"]` | yes | yes | no |
| 6 | button | Listen to route 1 stop by stop | `li.rg-route-item > div.rg-route-actions.has-start > button.button.secondary[data-action="access-route"]` | yes | yes | no |
| 7 | button | Start route 1 | `li.rg-route-item > div.rg-route-actions.has-start > button.button.primary[data-action="nav-start"]` | yes | yes | no |
| 8 | button | Walk 260 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 9 | button | Judah/La Playa/Ocean Beach | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 10 | button | Walk 180 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 11 | button | Civic Center / UN Plaza | `li.rg-tl-row.seg-ride > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |
| 12 | button | Walk 70 ft | `li.rg-tl-row.seg-walk > span.rg-tl-body > button.leg-link[data-action="leg-focus"]` | yes | yes | no |

### trip

| # | Role | Accessible name | Selector | In view | Focus ring | Under dock |
|---|---|---|---|---|---|---|
| 1 | link | Skip to transit information | `html > body.rove-accessible > a.skip-link` | yes | yes | no |
| 2 | button | End trip | `div.rg-nav > div.rg-top > button.rg-end[data-action="rg-end"]` | yes | yes | no |
| 3 | button | I'm at Judah/La Playa/Ocean Beach | `div.rg-nav > div.rg-dock > button.rg-confirm[data-action="rg-confirm"]` | yes | yes | no |
| 4 | button | Repeat | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-repeat"]` | yes | yes | no |
| 5 | button | Help | `div.rg-dock > div.rg-dock-row > button.rg-secondary[data-action="rg-help"]` | yes | yes | no |

## Contrast issues (unique, most widespread first)

| Selector | Text | Ratio | Size/weight | WCAG fail | fg / bg | Seen in |
|---|---|---|---|---|---|---|

## Targets smaller than 44x44 (unique)

| Selector | Name | Size | Inline link | Seen in |
|---|---|---|---|---|
| `div.maplibregl-ctrl-bottom-left > details.maplibregl-ctrl.maplibregl-ctrl-attrib > summary.maplibregl-ctrl-attrib-button` | Toggle attribution | 24x48 | no | 24: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `details.maplibregl-ctrl.maplibregl-ctrl-attrib > div.maplibregl-ctrl-attrib-inner > a` | OpenFreeMap | 76x16 | no | 24: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |

## Targets 44–47px (meet 44, miss 48)

| Selector | Name | Size | Seen in |
|---|---|---|---|
| `html > body.rove-accessible > a.skip-link` | Skip to transit information | 211x44 | 120: 320/home, 320/plan-search, 320/results-demo, 320/trip-1… |
| `button#menuButton` | More options | 44x48 | 36: 768/home, 768/plan-search, 768/results-demo, 768/trip-1… |
| `button#zoomIn` | Zoom in | 46x48 | 24: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `button#zoomOut` | Zoom out | 46x48 | 24: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `button#locateButton` | Show my location | 46x48 | 24: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |
| `button#layersButton` | Map layers | 46x48 | 24: 1024/home, 1024/plan-search, 1024/results-demo, 1024/trip-1… |

## Horizontal overflow offenders

None.

## Elements hidden under the dock after scrollIntoView

None.

## Console errors (unique)

None.
