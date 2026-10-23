> Note: this audit and its screenshots were taken at commit a422054, **before** the fixes in da396b2 (P0 Help/Confirm overlap, P1 control heights, rem text, desktop speech bar, short-screen dock). Only the 390 px set plus 320/1440 trip screens are committed; the rest are local.

# Rove QA and accessibility audit: demo journey

Branch `feature/rove-a11y-journey-20261023`, run on 2026-10-23. No source files were changed. Screenshots are in this folder and named `<width>-<theme>-<screen>.png`.

## Environment

- **Browser:** headless Google Chrome 155.0.8059.86 (the system install), driven over CDP by puppeteer-core. A throwaway script and profile lived in the session scratchpad, not in the repo.
- **The chrome-devtools MCP could not be used.** Its shared profile (`~/.cache/chrome-devtools-mcp/chrome-profile`) was locked by another running browser. Puppeteer drives the same CDP engine, so the emulation and measurements are the same kind the MCP would produce.
- **Server:** `node scripts/preview-site.mjs 4399`. It was stopped at the end of the run.
- **Emulated, not real:**
  - Viewport size; DPR 1 for the main runs and 1.5 or 2 for the zoom runs.
  - `isMobile` and `hasTouch` below 768px.
  - `prefers-color-scheme` and `prefers-reduced-motion`.
  - Browser zoom, simulated by shrinking the layout viewport and raising DPR.
- **Not done: no testing on a physical iPhone or Android device, and none with VoiceOver or TalkBack.** The accessibility tree comes from Chrome. Speech synthesis in headless Chrome stays in the `starting` state, so the speech bar was showing for most screenshots. Where noted, it was also forced on with `renderSpeechBar({state:'speaking'})` to test overlap.
- **Viewports:** 320x568, 375x812, 390x844 (light and dark), 430x932, 768x1024, 1024x768, 1440x900.
- **Flow:** clear `rove-active-trip-v1` → Home → Try the demo journey → Continue without speaking → Start route 1 → Confirm through walk, board N, ride, transfer, board BART, ride, arrive. At 390 the run also used Skip ahead on a ride step and a real POWL→LAKE plan.

## Results per width

"Targets <44" means visible on-screen controls only. The skip link sits off-screen at top -60px and was left out.

| Width | H-overflow (scrollWidth / innerWidth) | Elements past right edge | Targets <44 | Targets <48 | Dock fully in view (board) | Speech bar overlaps dock | Focus → `#rgHeading` after every Confirm |
|---|---|---|---|---|---|---|---|
| 320 light | 320/320 no | 0 | 0 | 0 | yes (dock 379–568 of 568 = 33% of screen) | no (bar at top) | yes, 6/6 |
| 375 light | 375/375 no | 0 | 0 | 0 | yes (681–812) | no | yes, 6/6 |
| 390 light | 390/390 no | 0 | 0 | 0 | yes (713–844) | no | yes, 5/5 |
| 390 dark | 390/390 no | 0 | 0 | 0 | yes (713–844) | no | yes, 5/5 |
| 430 light | 430/430 no | 0 | 0 | 0 | yes (801–932) | no | yes, 6/6 |
| 768 light | 768/768 no | 0 | 0 | More options 44x48 | yes (857–988) | no (bar at top) | yes, 6/6 |
| 1024 light | 1024/1024 no | 0 | 0 | More options 44x48; map controls 46x48 (x4) | yes (600–731) | **YES: covers Repeat and Help** (bar 696–756) | yes, 6/6 |
| 1440 light | 1440/1440 no | 0 | 0 | same as 1024 | yes (732–863) | **YES: covers Repeat and Help** (bar 828–888) | yes, 6/6 |

At 390 only 5 Confirms were logged because the Close help click landed on Confirm and moved the trip forward. See P0-1.

Other measurements:

- **Text contrast (390 light and dark), every trip class passes.**
  - Lowest in light: `.rg-certainty`, `.rg-step`, `.rg-end`, `.rg-next` and `.rg-kind`, all #4a524b on #f6f3ec = 7.29:1.
  - `.rg-confirm`: #fff on #1f5a3d = 8.11:1.
  - `.rg-demo-banner`: #6e3d00 on #fbefd9 = 7.92:1.
  - Exit-reminder `.rg-status[data-level=prepare]`: 8.11:1.
  - Dark lows: `.rg-certainty` 9.56:1 and `.rg-confirm` 9.72:1. No failures.
- **Focus:**
  - Visible ring on Confirm: `3px solid rgb(31,90,61)`, offset 2px, `:focus-visible` true (`390-light-focus-confirm.png`).
  - Help opens with focus on `#rgHelpHeading`.
  - Tab order through one full cycle: skip link → End trip → Skip ahead → Confirm → Repeat → Help → Stop speaking (`#speechBar`, which is last in the DOM but drawn at the top).
- **Accessibility tree (board step):**
  - `main "Transit journey"` contains a region "Board Muni N train" with one H1.
  - Buttons: End trip, Skip ahead, "I've boarded Muni N train toward Caltrain/Ballpark", Repeat, Help (expanded=false). The Confirm name contains its visible text "I've boarded" (passes WCAG 2.5.3).
  - No empty or duplicate names. Two `role=status` live regions.
  - The trip controls are a `group "Trip controls"`, not a landmark.
- **Reduced motion:**
  - With `reduce`, `animation-name` is `none` for `.panel-body.view-enter > *` and `.rg-card`, and `.rg-confirm` transition is 0s. No running animations were found on the page.
  - With `no-preference`, both use `rg-settle`. Pass.
- **Real planning (390):** POWL→LAKE at 08:15 returned results (1 itinerary). The results screen has no overflow, but `summary` "Walking directions 9 steps" is **198x36**, under both 44 and 48.

## Failures and findings (with measurements)

### P0

**P0-1. The sticky dock covers the end of the Help section, so a tap meant for "Close help" lands on Confirm and moves the trip forward.**

- Selectors: `.rg-help .rg-text-button` under `.rg-dock` (`position: sticky; bottom: 0`, 131px tall at 390).
- Measured at 390x844 with Help open: after `scrollIntoView({block:'end'})`, Close help sits at y 796–844 and the dock top is at 713. `elementFromPoint` at the button's centre returns `.rg-secondary`.
- A real click on Close help changed the phase **board → ride**: the user was confirmed as boarded without meaning to.
- The same click hit Repeat at 375 and 1440, and hit Confirm at 390 light and dark.
- VoiceOver and TalkBack activate at the element's centre, so this can happen to screen-reader users. That is a false "I've boarded" on a transit trip.
- Fix:
  - Add `scroll-padding-bottom: <dock height + 16px>` on `.panel-body` when it contains `.rg-nav`. Also add `padding-bottom` or `scroll-margin-bottom` on `.rg-help`.
  - Move "Close help" to the top of `#rgHelp`, next to the H2.
  - Consider hiding Confirm while Help is open.

### P1

**P1-1. Designed button heights are overridden to 48px by an old generic rule.**

- `styles.css:1259` and `:1283` contain `.rove-accessible button{min-height:48px}`. Its specificity is 0,1,1, which beats `.rg-confirm` and the other component classes at 0,1,0.
- Computed values:
  - `.rg-confirm`: min-height 48px, height 48 (designed 68px).
  - `.rg-secondary`: 48 (designed 56).
  - `.rg-primary`: 48 (designed 64).
  - `.rg-row-button`: 48 (designed 56).
- The most important control on the trip screen is about 30% smaller than designed.
- Fix: change those rules to `:where(.rove-accessible) :is(button,input,select){min-height:48px}`, or raise specificity with `.rove-accessible .rg-confirm{min-height:68px}` and similar.

**P1-2. The desktop speech bar covers the trip controls (≥801px).**

- `.speech-bar` is fixed at bottom-left, 512px wide (`styles.css:1349`, `:1359`).
- At 1024x768 the bar sits at y 696–756 and the dock buttons Repeat and Help at 671–719, so it overlaps both.
- At 1440x900 the bar is at 828–888 and the buttons at 803–851 (`1440-light-trip-board.png`).
- Fix: on wide screens place the bar at the top of the panel as on phones, or offset it with `bottom: calc(dock height + 12px)` while `.rg-nav` is present.

**P1-3. Text does not respond to the user's text size.**

- Setting `document.documentElement.style.fontSize='150%'` moved the root from 16px to 24px. `.rg-card h1` stayed at 28/32.76px, `.rg-facts li` at 18px and `.rg-confirm` at 20px: no change.
- All `.rg-*` type is in px, so iOS Dynamic Type and browser text-size settings are ignored.
- Fix: write type in rem (for example `.rg-facts li{font-size:1.125rem}`). On iOS also set `html{font: -apple-system-body}` with an `@supports` guard so Dynamic Type scales the root.

**P1-4. At page zoom the sticky dock takes up most of the screen and controls are clipped.**

- 150% zoom on a 320 device (layout 213x563):
  - The dock takes 189 of 563px.
  - `.speech-bar-stop` runs past the right edge (R230 > 213).
- 200% zoom on a 320 device (160x422):
  - The dock takes 201 of 422px (48%), leaving about 70px for content.
  - `.rg-nav` sits at L-13, `.rg-demo-skip` at R192 > 160, and `.speech-bar-stop` at R230. "End trip" and "Step 2 of 7" wrap (`320-light-trip-board-zoom200.png`).
- At 200% on a 390 device (195 wide), `.rg-demo-skip` R205 and `.speech-bar-stop` R230 overflow.
- Fix:
  - Use `@media (max-height: 560px) { .rg-dock { position: static } }`.
  - Let `.rg-demo-banner` wrap (`flex-wrap: wrap`) so Skip ahead drops onto its own row.
  - Let `.speech-bar` wrap (`flex-wrap: wrap`, `min-width: 0`).

**P1-5. The real results screen has a small target.**

- `summary` "Walking directions 9 steps" measures 198x36.
- Fix: `.rove-accessible summary{min-height:48px; display:flex; align-items:center}`.

### P2

- **P2-1. On 320x568 the trip screen shows very little.** The dock covers 33% of the screen, the speech bar another 68px, and only the H1 and one fact are visible above the dock (`320-light-trip-board.png`). Fix: tighten the dock (Repeat and Help side by side, which the 340px media query currently stacks; 12px gaps) or collapse the demo banner.
- **P2-2. Content scrolls under the fixed speech bar on phones.** The panel scrolls beneath the bar, which can hide focused help buttons (WCAG 2.4.11). Fix: `scroll-padding-top: 80px` on `.panel-body` when `body.has-speech-bar`.
- **P2-3. The arrival screen leaves the dock mid-screen.** Done sits at y 392–440 of 844. There is no summary content, `p.rg-certainty` renders empty, and the top-left is a blank span. Fix: pin the dock to the bottom (`.is-arrived .rg-dock{margin-top:auto}` with the nav at `min-height:100%`), add arrival facts (time, exit, "Trip took 1 hr 2 min"), and remove the empty `<p>`.
- **P2-4. Tab order is skip link → End trip → Skip ahead → Confirm → Repeat → Help → Stop speaking.** This matches the requested order. The speech bar's Stop button is drawn first but comes last in focus order. Acceptable; consider moving `#speechBar` before `main` in the DOM.

## Console errors and network

- **Console:** no errors and no uncaught exceptions in any run. There were 44 warnings, all from MapLibre:
  - `Map cannot fit within canvas with the given bounds, padding, and/or offset.` (once per load)
  - `Expected value to be of type number, but found null instead.` (three times per load, a style expression getting null)
- **Network:** no HTTP ≥400 responses and no failed `/api/v2` calls. About 70 `net::ERR_ABORTED` requests for `tiles.openfreemap.org/...pbf`, which are tiles cancelled when the map view changes or the page closes. Not app failures.

## Visual and UX review: the 10 most impactful problems

1. **The results screen looks like a different app.** Selectors: `.trip-card`, `.caption.results-when`, `.back-button`, `.it-meta`, the beta notice. The from/to card is pale blue, and the "Back" link, the "Walk to transit · Leaving…" line and the itinerary meta text are slate blue-grey, all from the old blue theme. Fix: map them to `--rg-surface`, `--rg-ink-2` and `--rg-line`.
2. **The results card and "Listen to route 1" run edge to edge (390).** Measured: `.itinerary` L0 R390 and `.audio-route` L0, while everything else sits at a 22px gutter (`--pad`) and the trip and home screens use 16px (`--rg-gutter`). The rounded bordered card meets the screen edge and looks broken. Fix: one gutter token (16px on phones) for every view, and make `.audio-route` full width or align it with the gutter.
3. **Main buttons are 48px instead of the designed 64–68px** (P1-1). The trip dock looks like a generic web form. Restoring 68/56 brings back the heavy, thumb-first feel.
4. **The exit reminder looks like a button.** `.rg-status[data-level=prepare]` has the same solid green fill and radius as `.rg-confirm` (`390-light-trip-ride-skip.png`), so a sighted or low-vision user may tap it. Fix: use a tinted green background with a 4px left accent bar and an icon, and keep solid green only for actions.
5. **The arrival screen feels unfinished** (P2-3): a floating Done button, an empty lower half and no trip summary. Fix: add a success moment (large check, arrival time, exit guidance) and pin Done to the bottom.
6. **There is no gap between the progress bar and the demo banner.** `.rg-progress` sits 4px under `.rg-demo-banner` and reads as the banner's underline. Fix: 12px top margin on `.rg-progress`, or move the progress under `.rg-top`.
7. **The legacy blue brand is still visible.** The desktop wordmark `.wordmark-mark` and the walking line on the map are blue. `<meta name="theme-color">` is `#f4f8fc` / `#192739` (blue) while the app background is `#f6f3ec` / `#0f1411`, so the iOS status bar and toolbar tint will not match. Fix: update theme-color and the mark to the forest-green palette.
8. **768px has a large empty band at the top** (`768-light-trip-board.png`). The trip starts at y≈190 because the empty `.panel-top` area (a hairline only) and the speech bar padding stack up. Fix: hide `.panel-top` during a trip, or let the bar sit inside it.
9. **The dark-mode speech bar blends into the page.** `#1d2a22` on a `#0f1411` background has almost no separation. Fix: raise the surface (for example `#26352b`) and add a hairline border in dark mode.
10. **The demo banner is crowded at 320–390.** The text wraps to two lines beside a 48px "Skip ahead" and the banner takes 64px of the top of the screen. Fix: shorten the copy to "Demo · simulated times" with a details link, or put Skip ahead on its own row.

## Prioritized fix list

1. P0-1: stop the sticky dock covering Help content (scroll-padding, move Close help to the top, hide Confirm while Help is open).
2. P1-1: remove the `.rove-accessible button` specificity override (`styles.css:1259`, `:1283`).
3. P1-2: desktop speech bar placement.
4. P1-3: switch `.rg-*` type to rem and support Dynamic Type.
5. P1-4: no sticky dock on short viewports; wrap the banner and speech bar.
6. P1-5: 48px `summary` targets.
7. Visual items 1, 2 and 4 (results-screen theme and gutter, exit reminder styling), then P2-3 (arrival screen).
8. The rest of the P2 and visual items.
