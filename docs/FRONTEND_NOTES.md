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

## Phase 4: real routing, real address search, Bay Area scope

Rove is a San Francisco Bay Area app. The short-lived nationwide changes from the end of Phase 3 were narrowed back: address search is limited to the Bay Area again, the map's pan limit is back, and the page title says Bay Area. The service-area check stayed, so a place outside the Bay Area is explained rather than routed.

Changes:

- **Real backend integration.** Tested against the backend at `47ecca6` and a real OpenTripPlanner 2.8.1 graph (details below). The frontend needed no contract changes; the response shape matched `docs/API_CONTRACT.md`.
- **Map framing bug fixed.** After any camera move with padding (opening a place, a stop, or the map centering on your location), journeys on a phone did not zoom to fit: MapLibre kept the old padding, added the new one, ran out of room, and silently skipped the move. `fitCoordinates` now clears padding first. This affected Phases 2 and 3 as well.
- **Map ready even when label fonts fail.** The loading cover now lifts once the style and transit layers are in, instead of waiting forever for every font tile.
- **Opens on your location.** When location permission was already granted and you are in the Bay Area, the map centers on you. Outside the Bay Area, Rove says so and does not offer "Your location" as a trip start.
- **Address search.** No focus point (it hurt ranking), Photon as a backup geocoder, addresses that match a typed house number ranked first, duplicates removed, and a note on results when an end point is a whole city or neighborhood.
- **BART trips missing from the schedule** (Antioch line, added trips) show "BART", "Live", and "Not in the published schedule, so the line is not shown." instead of "Trip".
- **Touch targets.** "Show the introduction" is now a full-size button. Home and Work rows show the place name under the label.

## Phase 4 testing and data sources

| What | Source | Status |
|---|---|---|
| Routing | **Real.** Backend `claude-development` at `47ecca6`, with an OTP 2.8.1 graph built in this session from the backend's own inputs: `otp-shaded-2.8.1.jar` (SHA-1 matches Maven Central), the clipped Bay Area OSM extract (SHA-256 matches the backend's `SHA256SUMS`), and the five GTFS feeds from `data/raw`. The backend's own `verify-routing` script passed all 11 checks against it. | Verified |
| Address search | **Real** Stadia responses recorded from a browser on the Mac, replayed in the browser tests, plus a direct run of Rove's `geocode` code in that browser against live Stadia and Photon. | Verified |
| Stops, lines, colors, shapes | Real `network.json` and GTFS | Verified |
| BART realtime | `api.bart.gov` is unreachable from the test environment, so the live board correctly showed "Live arrivals for BART are unavailable." The Antioch display was tested with a **fixture** in the contract's shape. | Fixture for display only |
| 511 realtime | No key in this environment | Not tested |
| Basemap tiles and label fonts | Blocked in the test environment; fallback style | Visual check earlier on the Mac |

Journeys planned through the interface with real routing (Saturday evening schedules, "Leave now"), at 390 x 844 and 1440 x 900:

1. UC Berkeley to Ferry Building: AC Transit 51B to Rockridge, then BART Yellow to Montgomery; AC Transit F; AC Transit 27, 18, and NL. Five options, sorting, leg focus from the list and the map, and Edit all work.
2. Downtown Oakland to SFO: BART Yellow from 19th Street to SFO, 56 minutes, several departures.
3. Stanford University to San Jose Diridon: walk to Palo Alto, Caltrain Local Weekend to Diridon, 56 minutes.
4. Oakland to Palo Alto: AC Transit NL, Muni 12, and Caltrain; BART Blue and Caltrain; AC Transit 54, BART Orange, and VTA Rapid 500. The area note appears because both ends are whole cities.

An address in New York (1600 Broadway) and one in Los Angeles (200 N Spring St) return no results, with "No Bay Area results for ..." (real Stadia, Bay Area rectangle). Also tested: autocomplete loading, empty, and error states; typed text resolved on Find routes; Enter to pick; swap; Your location; Choose on map; saved places; screen widths from 320 to 1440 with no overflow and no buttons under 44 px. The Phase 2 and Phase 3 suites still pass.

Not tested here: a physical iPhone, live BART and 511 feeds through the interface, and realtime-adjusted routing (the backend routes on schedules).

## Phase 5: door-to-door directions and visual refinement

Changes:

- **Address search through Rove's own index.** `/api/v2/places/search` and `/api/v2/places/reverse` (backend `fb4d30c`) come first; Stadia and Photon are used only when the server has no address index. Stations already listed under "Stops and stations" are not repeated under "Addresses and places".
- **Capabilities from `/api/v2/status`.** Routing availability, address search, and the ways of reaching transit the planner supports.
- **Walk or Drive to transit.** A Walk and Drive selector in Directions. Drive is enabled only when the server advertises `CAR_PARKING`; until then it is shown as unavailable and explains why when tapped. No drive route, time, or parking claim is ever made up. When available, Rove drives the rider to a park-and-ride lot, says that parking availability is not known, and plans transit from there.
- **Walking and driving directions.** When legs carry `steps`, the timeline offers "Walking directions" or "Driving directions", and step-by-step navigation lists the turns.
- **Route options redesigned.** Duration first, then departure and arrival, then a compact sequence of mode icons and line badges (walk minutes, drive minutes, each line), then the departure stop and time, then walk to start, transfers, waiting, and walk at the end, and the live or scheduled state.
- **Map.** Drive legs are a solid gray line; walk legs stay dotted blue; park-and-ride lots are marked.
- **Desktop.** The sidebar now floats over a full-bleed map and is only as tall as its content.
- **Home.** A Directions button (and Home and Work when saved) replaces the "Plan a trip" link.
- **Wording.** "Trip planning is not available right now" replaces the server-specific message.

### Phase 5 testing

| What | Source | Status |
|---|---|---|
| Routing | **Real.** Backend `fb4d30c` with a real OTP 2.8.1 graph built here from the backend's checksum-verified inputs | Verified |
| Address search | **Real.** Backend `fb4d30c` place search over an index built here with the backend's own `build_places.py` from the same OSM extract. It has fewer addresses (137,087) than the backend's own index (880,197), because the extract is clipped. | Verified with that index |
| Walking steps and drive to transit | **Real OTP output** through `contract-shim.mjs`, a test-only prototype of requests 12 and 13 built from the backend's own `lib/routing/otp.mjs`. Not backend code and not committed. | Verified as a prototype; needs the backend change |
| Live arrivals and vehicles | Feeds unreachable from the test environment | Not tested |

Journeys planned through the interface (Saturday evening, "Leave now"), at 390 x 844 and 1440 x 900:

1. Sunnyvale Station to SFO: Caltrain to Millbrae, BART Yellow to SFO.
2. University of California (Berkeley) to the Ferry Building: AC Transit 18 and BART Yellow, or AC Transit 6 and NL.
3. Stanford to San Jose Diridon: walk to Palo Alto, Caltrain to Diridon.
4. 1002 Hollenbeck Avenue, Sunnyvale (a residential address) to the Ferry Building: a 1.6-mile walk with 10 real turns, Caltrain, Muni N.
5. The same address to SFO with Drive: drive 1.8 miles to the Sunnyvale Caltrain park-and-ride lot, then Caltrain and BART.

Every screen was inspected in light and dark mode. No horizontal overflow, no controls overlapping the panel, and no buttons under 36 px tall on either size (primary buttons are 44 px or taller).

## Integration preparation (after Phase 5)

- Checked the frontend against the backend contract at `fb4d30c`; see the compatibility table in `FRONTEND_ROUTING_API_CONTRACT.md`.
- Walking and driving steps accept either `distanceMeters` or OTP's `distance`.
- A Drop-off option appears when `/api/v2/status` lists `CAR_DROP_OFF` (tested only with a mocked status response; no drop-off route has been seen from the real planner).
- Fixed: the map layer picker's Standard, Satellite and Dark buttons had lost their layout since Phase 3 (a sort-control style applied to every segmented control). The sort control now has its own class, and its labels no longer wrap on phones.
- Fixed: stop names in Nearby and similar lists now start at the same position, whatever the number of line badges.

Tests on the final code: real-data journeys (`qa5`, real backend and OTP; steps and Drive through the test-only prototype), the Phase 2 and Phase 3 suites on the fallback server, a visual review of every main screen at 390 x 844 and 1440 x 900, and the drop-off UI test above. No page errors, no horizontal overflow, no overlapping controls.

## Final integration test against backend `7e1c2f2` (October 18, 2026)

Setup: this frontend served by the backend's own `server.mjs` at `7e1c2f2`, real OpenTripPlanner 2.8.1 (graph built from the backend's checksum-verified inputs, the backend's `router-config.json`), and the backend's full place index. No shim or mock in the routing or search path. Map tiles are blocked in the test environment, so the plain fallback basemap was used. Phone 390 x 844 and desktop 1440 x 900.

Real tests (all passed, no page errors, no horizontal overflow, no controls under the panel):

- Walk to transit with turn-by-turn steps: UC Berkeley to Ferry Building, Stanford University to San Jose Diridon, Sunnyvale Station to SFO, 1105 Lily Avenue to SFO.
- Park and ride, 1105 Lily Avenue to SFO: 7 minute drive to the Sunnyvale Caltrain lot (439 spaces mapped), 7 driving steps, route notes shown.
- Drop-off, 1105 Lily Avenue to SFO: 5 minute drive to a street near Lawrence Station, then a walk to the platform. From Half Moon Bay the drop-off drive was 18 minutes, inside the 20 minute limit.
- No service at 2:30 am (Milpitas to Fremont): "No transit route was found for this time."
- Place search: "UC Berkeley" and "Stanford University" return the campuses first. The Berkeley point is in the hills (backend request 15).
- Muni Metro (N Judah) and VTA light rail (Green, Orange) show as light rail.
- Platforms appear on BART legs in trip results and navigation.

Simulated tests (live feeds are blocked in the test environment; the backend reported `bartUpdates` network errors and no 511 key):

- Departure boards with live, stale ("Updated 10 min ago. Live times may be out of date.") and unverified BART arrivals, an alert, an Antioch line trip and an added trip.
- Planner outage (503), network loss, and address search down.

Not tested with real live data: BART and 511 arrivals and alerts. Run `npm run rove` on the Mac and open a BART station and a Muni, VTA, Caltrain and AC Transit stop.

Fixed in this pass:

- A 404 "no route" answer from `/api/v2/plan` was shown as "Trip planning is offline" and turned the planner off.
- Drop-off drives were labeled as park-and-ride.
- The backend's step `instruction`, parking capacity and `routing.notes` are now shown, and the Drive and Drop-off hints state the drive limit from `/api/v2/status`.
- Unscheduled BART arrivals now say whether they are an Antioch line train or an extra train, from the backend's `note`.

## Final frontend pass against backend `76bfe8b` (October 18, 2026)

Setup: this frontend served by the backend's own server at `76bfe8b` (a `git archive` of that commit), real OpenTripPlanner 2.8.1 with the backend's router config, and the full place index. Live feeds are blocked in this test environment, so live arrival boards were tested with simulated responses in the backend's shape; the backend's own live verification on the Mac covers the feeds.

Fixed:

- Drop-off trips showed a "Park and ride" map marker. The marker now says "Drop-off" unless the drive ends at a mapped parking lot. The timeline and navigation already said "drop-off point near <station>".
- The directions screen showed "Trip planning is offline" twice during an outage. The notice with Check again is now the only message.
- Stop pages now give the backend's reason when live arrivals are withheld, instead of always saying predictions could not be matched.
- Driving notes ("without live traffic", parking availability) are left out when every option is walk-only.
- The planner hint now says any Bay Area address, place, or stop works for either end of the trip.

Checked, no change needed:

- The traffic warning: "Driving times use mapped roads and speed limits without live traffic." appears with every Drive and Drop-off result, and the Drive and Drop-off hints say drives do not include traffic.
- The planner entry point: the home screen's first button is Directions (a real button, 44 px tall, reached in five or six Tab presses and opened with Enter). Place and stop pages also have Directions and Leave from here. The old server on port 4173 is the October 17 prototype from `~/rove`, which has no trip planner.
- Labels: every trip shows "Scheduled times" and each transit leg says "Scheduled"; the only "live" wording in results is "Check live departures at your stop before you leave" and the no-traffic note. Live arrival boards say Live, minutes late or on time, and the feed age.

Tests (all passed; no page errors, horizontal overflow, small tap targets, or controls under the panel):

- Real journeys at 390 x 844 and 1440 x 900: UC Berkeley to Ferry Building, Stanford University to San Jose Diridon, Sunnyvale Station to SFO, and 1105 Lily Avenue to SFO by walking, park and ride, and drop-off. Each checks walking directions, boarding, transfers (Caltrain to BART at Millbrae, AC Transit to BART), choosing the second option (the map follows it), and the first five navigation steps.
- No service at 2:30 am, Muni N and VTA Green shown as light rail, home and planner entry point with keyboard.
- Simulated: planner outage, network loss, address search down; live, stale, and unavailable arrival boards.
- Screen review of home, address search, place, stop, planner, results, and map layers on phone and desktop.
