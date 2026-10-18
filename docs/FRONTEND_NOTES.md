# Frontend notes (claude-frontend branch)

Updated October 17, 2026 (Phase 2).

## What changed

- `index.html`, `styles.css`, and `app.js` were rewritten as one map-first interface: a docked 400 px sidebar on desktop (360 px from 768 to 1279 px) and a draggable bottom sheet with three heights on phones.
- One search field covers lines and stops. The duplicate "Transit layers" panel, the separate search modal, and the 5-card tour were removed.
- Map modes: Standard (OpenFreeMap Positron), Satellite (Esri World Imagery), and Dark (OpenFreeMap Dark). If a basemap style cannot load, the map falls back to a plain background and transit layers still draw.
- Clutter control: BART and Caltrain always draw. Light rail appears from zoom 9.5. Buses appear from zoom 11.5 as thin gray lines. Bus stops appear from zoom 15. Selecting a line fades everything else.
- Preserved: agency filters (now in the Layers control, saved per browser), favorites (same `rove-saved-v2` storage key), live vehicles, live arrivals, alerts, the introduction (finish, skip, and replay), dark mode, and polling that pauses in the background.
- New: Nearby stops with live next departures, a stop page with grouped departures, a line page with a stop diagram, a lines directory, a data sources and credits page, trip planning against `/api/journeys`, and step-by-step navigation.
- All feed text is HTML-escaped before display.
- The font is Atkinson Hyperlegible Next, self-hosted in `public/fonts/` under the SIL Open Font License (`public/fonts/OFL.txt`).

## Requests for the backend session

1. **Route type bug in `scripts/build-data.mjs`:** `type:+r.route_type||3` turns route type `0` (light rail) into `3` (bus). Muni Metro and VTA light rail are therefore typed as buses in `network.json`. The fix is `type:Number.isFinite(+r.route_type)&&r.route_type!==''?+r.route_type:3`, followed by a data rebuild. Until then, `app.js` classifies Muni J, K, L, M, N, T, F and VTA Blue, Green, Orange as rail through an explicit list (`RAIL_ROUTE_IDS`).
2. **`/api/journeys`** is not implemented yet. The frontend shows an honest "not available" message until it exists. See `FRONTEND_ROUTING_API_CONTRACT.md`.
3. **Exact realtime index:** see the "Realtime fields" section of the contract.
4. **Fonts MIME type:** `server.mjs` has no `.woff2` entry, so fonts are served as `application/octet-stream`. Browsers accept this, but adding `'.woff2':'font/woff2'` is cleaner.
5. **Request to `//`:** a request for the path `//` makes `new URL()` throw and returns 500. It should return 404.

## Testing done

Tested with Playwright and Chromium at 320, 375, 390, 430, 768, 1024, and 1440 px widths, against the real `server.mjs` with no 511 key, plus test-only fixtures for live data and journeys (the fixtures are not in this repository). Checked: no horizontal overflow, no text under 13 px outside the map attribution and badges, no touch target under 24 px, no console errors, and that alert text containing `<script>` renders as text. The HTTP boundary still returns 404 for `.env`, `.git/config`, `server.mjs`, and `scripts/configure-511-key.sh`.

Not yet tested: real basemap tiles (blocked in the test environment), a real 511 key, and a physical phone.

## Open item

Esri World Imagery terms need review before any public launch.

## Phase 2 changes

- **Backend integration:** the frontend uses the backend's v2 endpoints (`/api/v2/realtime`, `/api/v2/arrivals`, `/api/v2/plan`, `/api/v2/plan/status`). See `FRONTEND_ROUTING_API_CONTRACT.md` for how each display rule is handled and what the frontend asks the backend to change.
- **Trip planning:** search for stops, use your location, choose any point on the map, or right-click the map on desktop. Results show transfers, walking legs, platforms, interlined trains ("Stay on board"), cancellations, and leg alerts. Navigation shows one step at a time, keeps the screen awake, and advances walking and riding steps automatically when it can follow the rider's location.
- **Map:** Standard and Dark both start from OpenFreeMap Positron and are recolored in `restyleBasemap()`: warm off-white land, soft blue water, sage parks, and subtle gold roads. Bright lines such as BART Yellow get a darker edge so they stay readable.
- **Phone layout:** the sheet can be dragged from its handle, its header, or its content. Below full height, a vertical swipe moves the sheet; at full height the content scrolls, and pulling down from the top lowers the sheet. Safe areas are measured, and the search field is hidden on detail screens to give the content more room.

## Phase 2 testing and data sources

| What | Data | Kind |
|---|---|---|
| Backend code | `claude-development` at `41849f9`, run locally with the frontend files from this branch | Real code |
| Backend unit tests | 51 passed, 5 skipped, 0 failed | Real |
| BART arrivals | A live BART feed recorded by the backend session at 23:10 UTC today, replayed to the server. 100% trip and stop match; 31 arrivals at Montgomery Street. The feed was more than two minutes old, so the stale label was exercised too. | Real data, recorded |
| 511 realtime (Muni, VTA, Caltrain, AC Transit) | Not tested. No 511 key is available in this environment. The "Live arrivals unavailable" state was tested for those agencies. | Not tested |
| Journey planning | The real `lib/routing/otp.mjs` talking to a stand-in OpenTripPlanner that returns three itineraries built from real `network.json` geometry, and a no-route error. A real OTP graph was not available (it needs Java 21 and about 6 GB of memory). | Fixture |
| Routing engine down | Fake OTP stopped; `/api/v2/plan/status` returned 503 and the planner showed its offline notice | Real backend behavior |
| Basemap tiles | The new palette rendered on real OpenFreeMap tiles in a browser on the Mac, at Bay Area and city zoom, light and dark | Real tiles |
| Layout | 320, 375, 390, 430, 768, 1024, and 1440 px: no horizontal overflow, no text under 12.5 px, no touch target under 24 px, no console errors | Headless Chromium |
| Bottom sheet | Swipe up from half to full, down to half, down to peek (synthetic touch events) | Headless Chromium |

Not yet tested: real trips from OpenTripPlanner, 511 live data, and a physical phone.

## Phase 3 changes: door-to-door trips

- **Any address to any address.** The trip fields and the main search suggest addresses, venues, neighborhoods, and cities from Stadia Maps, alongside stops, stations, your location, and saved and recent places. Text that was typed but not picked is resolved when Find routes is tapped; if nothing matches, the field is flagged with "We could not find ...", and nothing is guessed.
- **Typing no longer rebuilds the form.** Suggestions update in their own container, so the caret, the keyboard, and the screen reader focus stay put. Enter takes the first suggestion (waiting for address results if they are still loading). Arrow keys move through the list.
- **Places.** Picking an address from the main search opens a place card with Directions, Leave from here, Set as Home, Set as Work, Save place, and nearby stops. Saved places appear on the home screen under Your places.
- **Choose on map** names the point with a street address when the reverse geocoder finds one within 120 m.
- **Results.** A compact from and to card with Edit (inputs are kept), sorting by Fastest, Fewer transfers, or Less walking, a Fastest tag, the boarding stop and time, walking time and distance, transfers, service alert flags, and skeleton rows while loading.
- **Map.** Transit legs in their line colors with a darker casing for pale colors, dashed walking legs, labeled boarding, exit, and transfer stops, and other lines faded. Tapping a leg on the map or its name in the timeline highlights it in both places and frames it. A transit leg without a route shape is dashed and labeled "Route shape not available."

## Phase 3 testing and data sources

| What | Source | Result |
|---|---|---|
| Frontend and backend code | Real (frontend Phase 3; backend `claude-development` at `41849f9`) | No page errors in any run |
| Stops, lines, colors, shapes | Real `network.json` | Used for every itinerary leg and suggestion |
| Address search | **Fixture.** `api.stadiamaps.com` is blocked from the test environment, so Playwright answered with Pelias-format GeoJSON for eleven known places | Suggestions, loading skeleton, empty, error, Enter, typed-then-submitted, reverse naming all pass |
| Journey planning | Real backend routing code in front of a **fixture** OTP server (`fake-otp3.mjs`). Lines, stops, and shapes are real; times are generated; walking legs are straight lines | All four journeys below plan and draw correctly |
| Basemap | Blocked here; fallback style | Visual check only |

Journeys tested at 390 x 844 and 1440 x 900 by typing both places and picking suggestions:

1. UC Berkeley to Ferry Building: BART Red, BART Orange then Yellow (transfer at 12th Street), AC Transit F. Sorting, leg focus from the timeline and from the map, and Edit keeping the inputs all pass.
2. Downtown Oakland to SFO: BART Yellow and BART Red from 12th Street.
3. Stanford to San Jose Diridon: Caltrain Limited and Local from Palo Alto, VTA 22.
4. Berkeley to Palo Alto: BART Red to Millbrae, then Caltrain. One option has no route shape, which shows the dashed line and the note.

Also tested: swap, Your location, Choose on map, saved Home and Work, recents, no horizontal overflow and no buttons under 44 px tall at 320, 375, 390, 430, 768, 1024, and 1440 wide.

**Not tested here:** real Stadia responses (needs a reachable network and domain authentication), real OTP itineraries (needs the OTP graph, which needs OSM data this environment cannot download), and a physical phone. Location-denied could not be simulated reliably in headless Chromium.

## Nationwide scope (Phase 3 update)

Rove's target is now the whole United States. The Bay Area is the first, and so far only, region where trip planning is verified.

- **Removed Bay Area limits:** address search is no longer boxed to the Bay Area (it covers the United States, ranked toward the rider), the map can pan anywhere, and Bay Area wording was removed from search messages, the page title, the description, and the loading text.
- **Kept honest:** places outside a routing region open and can be saved, but Rove says plainly that it cannot plan trips there yet and removes Directions, Leave from here, Find routes, and the time options rather than showing controls that cannot work. No planner request is sent for those trips.
- **Ready for more regions:** the region list comes from `/api/v2/plan/status` when the backend provides it (request 9 in `FRONTEND_ROUTING_API_CONTRACT.md`), with a built-in default for the Bay Area.
- **Still Bay Area only:** stops, lines, live times, and nearby stops come from Rove's Bay Area network data. The home screen copy names the five Bay Area agencies, which is accurate today.

Tested with fixture address results for Times Square and Chicago Union Station: the place card, the planner notice for a picked destination and for typed text resolved at Find routes, no planner request sent, and the map centering on New York.
