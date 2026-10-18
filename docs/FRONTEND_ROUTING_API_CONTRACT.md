# Frontend use of the backend API

Updated October 18, 2026. The authoritative contract is `docs/API_CONTRACT.md` on the backend branch (`claude-development`, commit `fb4d30c`). This file records how the frontend on `claude-frontend` uses it, and what the frontend asks the backend to change.

The earlier `POST /api/journeys` proposal is withdrawn. The frontend now uses the backend's real endpoints.

## Endpoints the frontend calls

| Endpoint | Used for | Frontend code |
|---|---|---|
| `GET /api/v2/realtime` | Live vehicles, alerts, per-agency quality gate, feed ages. Polled every 60 seconds while the tab is visible. | `loadRealtime`, `liveVehicles`, `coverage`, `activeAlerts` |
| `GET /api/v2/arrivals?agency=&stop=` | Departures on stop pages, and the next departure on nearby and saved rows. Cached for 25 seconds per stop. | `fetchArrivals`, `viewStop`, `placeRow` |
| `GET /api/v2/status` | Whether routing and address search are available, and which ways of reaching transit the planner supports (`routing.access`). Falls back to `/api/v2/plan/status` on older servers. | `fetchPlanStatus`, `driveSupported` |
| `GET /api/v2/plan/status` | Fallback for the above. | `fetchPlanStatus`, `planNoticeHtml` |
| `GET /api/v2/plan` | Trip results, timeline, and step-by-step navigation. Adds `access=CAR_PARKING` when the rider chooses Drive and the server supports it. | `submitPlan`, `normalizeItinerary`, `viewResults`, `buildSteps` |
| `GET /api/realtime` | Fallback only, when `/api/v2/realtime` returns 404 (an older server). | `loadRealtime` |

Origin and destination can be any address or place. Suggestions combine, in this order: your location, saved and recent places (stored in the browser), stops and stations from the browser's copy of `network.json`, and addresses and places from the geocoder. Stations lead only when the query names one; otherwise addresses lead. Riders can also choose any point on the map, or right-click the map on desktop. The frontend sends the chosen point's coordinates and name to `/api/v2/plan` unchanged.

### Address search

| Call | Used for | Frontend code |
|---|---|---|
| `GET /api/v2/places/search?q=&limit=&near=` | **Primary.** Rove's own index of addresses, businesses, landmarks, streets, areas and stations. `near` is the rider's location or the map center, rounded to about 1 km. `approximate` results show their `note`. | `geocode`, `normalizeRovePlace` |
| `GET /api/v2/places/reverse?lat=&lon=` | **Primary** label for a point chosen on the map. | `reverseGeocode` |
| `GET https://api.stadiamaps.com/geocoding/v1/autocomplete` | Fallback when the server has no address index (`addressSearch` not `available`, or a 404 or 503). Suggestions while typing (debounced 220 ms, 3 characters minimum, previous request canceled). Limited to the Bay Area rectangle, with no focus point (see below). | `geocode`, `requestAutocomplete` |
| `GET https://api.stadiamaps.com/geocoding/v1/search` | Text the rider typed but did not pick, resolved when they tap Find routes. A house-number query prefers an address with that number. | `resolveDraft`, `bestGeocodeMatch` |
| `GET https://api.stadiamaps.com/geocoding/v1/reverse` | Names a point chosen on the map, if a result lies within 120 m. Otherwise the point keeps "Near <stop>" or "Pinned location". | `reverseGeocode`, `refinePointName` |
| `GET https://photon.komoot.io/api/` and `/reverse` | Backup. Used for the rest of the session if Stadia answers 401 or 403, and for a single request if Stadia is unreachable or returns a server error. | `photonGeocode` |

No API key is in the frontend. Typed text that neither a stop name nor a geocoder recognizes is flagged on the field: the frontend never guesses a location.

**Verified with real requests (October 18, 2026, from a browser on the Mac):** Stadia answered cross-origin requests from an unregistered origin (`https://example.com`) without a key, and Rove's own `geocode` code returned correct Bay Area results for all test places. Photon also answered cross-origin and normalized correctly. A focus point made Stadia's ranking worse ("Oakland" typed with a San Francisco focus listed bridge viewpoints first; "Stanford University" listed a Daly City business first), so it was removed. City results are geometric centers (Oakland's is in the hills), so the results screen says when an end point is a whole area.

### Service area

Rove covers the San Francisco Bay Area only. `SERVICE_AREA` in `app.js` matches `PLAN_BOUNDS` in the backend's `lib/routing/otp.mjs` (latitude 36.9 to 38.2, longitude -122.75 to -121.4). Address search is limited to it, the map's pan limit surrounds it, and a place outside it (for example one saved earlier) shows "This place is outside the Bay Area" in place of Directions and nearby stops. No `/api/v2/plan` request is sent for such a trip.

## How the frontend follows the display rules

- Times are shown from `start.estimated` when present, otherwise `start.scheduled`, and are labeled "Scheduled" unless the leg is real time.
- `staySeated: true` is shown as "Stay on board. It continues as ..." and is not counted or drawn as a transfer.
- `canceled` legs and `hasCancellation` itineraries are labeled in the canceled color.
- Leg `alerts` are shown under the leg in the timeline and on the navigation step.
- An empty `itineraries` list shows `errors[0].message`.
- `400` responses highlight the field named in `field` (origin, destination, or time) with plain-language text. `503` shows the offline notice. Other failures show a retry message. No trip is ever fabricated.
- Arrivals with status `unverified` show "Live arrivals are unavailable right now" instead of an empty board. `canceled` entries are listed separately as "Canceled" or "Not stopping here". `stale` arrivals show their age and "Live times may be out of date."
- Vehicles are drawn only when `routeId` is not null. BART never has vehicles.

## Why the local site says "Trip planning is not available right now"

`npm start` in the frontend working copy runs that branch's own `server.mjs`, which predates the v2 API and only serves `/api/realtime`. `/api/v2/status` and `/api/v2/plan/status` return 404 there, so the planner correctly reports that trip planning is unavailable. Nothing is wrong with the frontend; it is running without the backend.

To run the real thing before the branches are merged (without changing either working copy):

1. Make a separate worktree of the backend branch: `git -C ~/rove-claude worktree add ~/rove-integration claude-development`.
2. Copy the frontend files into it: `cp ~/rove-frontend/{index.html,app.js,styles.css} ~/rove-integration/` and `cp -R ~/rove-frontend/public/fonts ~/rove-integration/public/`.
3. Give it the backend's data: link or copy `data/raw`, `data/extracted`, `data/places/bay-area-places.sqlite`, `data/otp/bin` and `data/otp/graph` from `~/rove-claude`.
4. Start OpenTripPlanner: `npm run otp:start` (build the graph first with `npm run otp:build` if `data/otp/graph/graph.obj` is missing).
5. Start the server: `npm start`, then open `http://localhost:4173`. `/api/v2/status` should report `routing.available: true` and `search.addresses: true`.

At merge time the same four frontend paths (`index.html`, `app.js`, `styles.css`, `public/fonts/`) replace the backend branch's copies. The backend's `server.mjs` and `lib/` stay as they are.

## Requests for the backend

**New in Phase 5 (verified against the real OTP graph through a prototype; see `FRONTEND_NOTES.md`)**

12. **Walking and driving directions.** Add OTP's `steps { distance relativeDirection absoluteDirection streetName stayOn area lat lon }` to the plan query and return them on every non-transit leg as `steps: [{ distanceMeters, relativeDirection, absoluteDirection, streetName, stayOn, area, lat, lon }]`. Advertise it in `/api/v2/status` as `routing.walkSteps: true`. The frontend already renders these as "Walking directions" in the timeline and in step-by-step navigation; without them, walking legs show distance and time only.
13. **Drive to transit (park and ride).** Accept `access=CAR_PARKING` on `/api/v2/plan` (default `WALK`) and send OTP `modes: { direct: [WALK], transit: { access: [CAR_PARKING], egress: [WALK], transfer: [WALK] } }`. Return the drive leg with `mode: "CAR"`, geometry and steps, and add `from.parking` / `to.parking: { name }` from OTP's `vehicleParking { name }`. Advertise it as `routing.access: ["WALK", "CAR_PARKING"]` in `/api/v2/status`; the frontend enables Drive only then. Tested on the real graph: OTP uses OpenStreetMap park-and-ride lots (for example the Sunnyvale and San Mateo Caltrain lots). It sometimes chose a 23-mile drive to a lot near the destination, so cap the car access time (OTP `routingDefaults.accessEgress.maxDurationForMode` for `CAR_PARKING`, for example 20 minutes) before enabling it. OTP 2.8 rejected `CAR_DROP_OFF` (drop-off at the station) with our settings; that option stays out until it is configured and verified.
14. **Place search ranking for landmarks.** In an index built here from the clipped Bay Area extract, "UC Berkeley" and "Stanford University" did not return the campuses first. Please check these in the full index, and consider boosting large universities, airports and major landmarks.


**New in Phase 4 (from testing against the real backend)**

9. **Keep `PLAN_BOUNDS` and the frontend's `SERVICE_AREA` the same.** If the bounds change, change both, or expose them in `/api/v2/plan/status` as `bounds: { minLat, maxLat, minLon, maxLon }` and the frontend will read them.
10. **Realtime in routing.** `/api/v2/plan` reports `routing.realtime: "scheduled"`, and OTP returned no leg alerts. The frontend already shows `estimated`, delays, cancellations, and leg alerts when present. Feeding the BART and 511 trip updates and alerts into OTP would light these up.
11. **A running OTP for integration.** The frontend was tested against an OTP graph built in the frontend session from the backend's checksum-verified inputs (see `FRONTEND_NOTES.md`). A shared, always-on instance (or a documented `npm run otp:start` on the demo machine) is needed before October 23.

**New in Phase 3**

5. **Address search.** Done in `fb4d30c` as `/api/v2/places/search` and `/reverse`; the frontend now uses them first.
6. **Walking directions.** See request 12.
7. **Leg geometry.** The frontend draws `legs[].geometry` as is. If a transit leg has no geometry, or only its two end points while it passes intermediate stops, the frontend dashes it and says "Route shape not available." Please confirm OTP's graph is built with GTFS `shapes.txt` for all five feeds so this never appears in practice.
8. **Routing error codes.** Please pass OTP's `routingErrors[].code` through unchanged in `errors[].code`. The frontend has specific copy for `WALKING_BETTER_THAN_TRANSIT`, `OUTSIDE_SERVICE_PERIOD`, `OUTSIDE_BOUNDS`, and `LOCATION_NOT_FOUND`.

**Still open from Phase 2**


1. **Several stops in one arrivals call.** Same-named stops on opposite sides of a street (for example both Muni platforms at "Market St & Sansome St") are one place in the interface. The frontend currently makes up to four `/api/v2/arrivals` calls for one place. Accepting `stop=15689,15690` would make that one call.
2. **Alert entity IDs.** 511 alerts keep prefixed IDs (`SF:38R`) while BART alerts use static IDs. The frontend handles both, but static IDs plus `agency` on every entity would be simpler and less fragile.
3. **Fonts.** `lib/app.mjs` has no MIME type for `.woff2`. The self-hosted font in `public/fonts/` is served as `application/octet-stream`. Browsers accept this, but please add `'.woff2': 'font/woff2'`.
4. **Route type bug, still present.** `scripts/build-data.mjs` writes `type:+r.route_type||3`, which turns route type `0` (light rail) into `3` (bus). Muni Metro and VTA light rail are typed as buses in `network.json`. Please change it to treat `0` as a valid value and rebuild the data. Until then, `app.js` classifies those lines explicitly (`RAIL_ROUTE_IDS`).
