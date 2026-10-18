# Frontend use of the backend API

Updated October 18, 2026. The authoritative contract is `docs/API_CONTRACT.md` on the backend branch (`claude-development`, commit `7e1c2f2`). This file records how the frontend on `claude-frontend` uses it, and what the frontend asks the backend to change.

The earlier `POST /api/journeys` proposal is withdrawn. The frontend now uses the backend's real endpoints.

## Endpoints the frontend calls

| Endpoint | Used for | Frontend code |
|---|---|---|
| `GET /api/v2/realtime` | Live vehicles, alerts, per-agency quality gate, feed ages. Polled every 60 seconds while the tab is visible. | `loadRealtime`, `liveVehicles`, `coverage`, `activeAlerts` |
| `GET /api/v2/arrivals?agency=&stop=` | Departures on stop pages, and the next departure on nearby and saved rows. Cached for 25 seconds per stop. | `fetchArrivals`, `viewStop`, `placeRow` |
| `GET /api/v2/status` | Whether routing and address search are available, and which ways of reaching transit the planner supports (`routing.access`). Falls back to `/api/v2/plan/status` on older servers. | `fetchPlanStatus`, `driveSupported` |
| `GET /api/v2/plan/status` | Fallback for the above. | `fetchPlanStatus`, `planNoticeHtml` |
| `GET /api/v2/plan` | Trip results, timeline, and step-by-step navigation. Adds `access=CAR_PARKING` (Drive) or `access=CAR_DROP_OFF` (Drop-off) when the rider chooses one and `/api/v2/status` lists it. Shows `routing.notes`, step `instruction`s, parking capacity, and `maxDriveMinutes`. | `submitPlan`, `normalizeItinerary`, `viewResults`, `buildSteps` |
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

## Compatibility with the backend at `7e1c2f2` (checked October 18, 2026)

`7e1c2f2` is the latest commit on `claude-development`. Tested end to end: this frontend served by the backend's own `server.mjs` at `7e1c2f2`, real OpenTripPlanner 2.8.1 with the backend's `router-config.json`, and the backend's full place index (880,197 addresses). See `FRONTEND_NOTES.md` for results.

| Backend feature | Frontend status |
| --- | --- |
| `GET /api/v2/status` | Used. `routing.access`, `walkSteps` and `maxDriveMinutes` decide what the planner offers and say. |
| `GET /api/v2/places/search`, `/reverse` | Used first, with `near`. |
| `GET /api/v2/plan` | Used. A 404 with an `itineraries` array is "no route", not an outage (fixed in this pass; it used to show "Trip planning is offline"). |
| Walk and drive `steps` with `instruction` | Used. The backend's `instruction` text is shown as is. |
| `access=CAR_PARKING` | Used. The drive row shows the lot name, mapped spaces, and "Space availability is not known." |
| `access=CAR_DROP_OFF` | Used. The drive row says "to the drop-off point near <station>" (it used to say park-and-ride). |
| `routing.notes` | Shown under the results caption. |
| `GET /api/v2/arrivals` with `scheduled: false` | Shown as "BART · Live". A `note` naming the Antioch line is shown as an Antioch line train; other unscheduled trips as an extra train. |
| Light rail (`type: 0`) in `network.json` | Muni Metro and VTA light rail show as light rail. |
| `.woff2` content type | Fixed in the backend. |
| `POST /api/journeys` | Not used. |

### Running the real thing

`npm run rove` in `~/rove-claude` starts OpenTripPlanner and the server, on port 4173 or the next free port. If an old server is still running on 4173 (for example an earlier `npm start` in `~/rove-frontend`), that old copy answers on 4173 and shows "Trip planning is not available right now". Stop it, or open the port `npm run rove` prints.

To try this frontend before the branches are merged, copy `index.html`, `app.js`, `styles.css` and `public/fonts/` from `~/rove-frontend` into a separate worktree of `claude-development` and run `npm run rove` there. At merge time the same four paths replace the backend branch's copies; the backend's `server.mjs`, `lib/` and `public/data/network.json` stay as they are.

## Requests for the backend

**New after `7e1c2f2` (found in final integration testing)**

15. **UC Berkeley place point.** Request: `GET /api/v2/places/search?q=UC%20Berkeley&limit=3`. Response, first result: `{"name":"University of California, Berkeley","kind":"poi","category":"University","address":"Oakland","lat":37.8755,"lon":-122.239069,"id":"osm:975983"}`. The point is in the hills east of campus, and the address says Oakland. A trip from it starts "Head southeast on the path, Turn right onto Centennial Drive" and walks 1.2 miles to the first bus. Expected: a point in central campus (near Sather Tower, about 37.8721, -122.2578) and "Berkeley". Suggest using the OSM label or admin-centre node, or a curated point, for large campuses. Stanford is fine (450 Jane Stanford Way).
16. **Platform on arrivals.** `/api/v2/arrivals` gives `stopId` (for example `M50-2`) but no platform. Trip plans already carry `stop.platform` from GTFS. Please add `platform` to each arrival so the departure board can show it; the frontend will not parse stop IDs to guess it.
17. **Park-and-ride "no stops" message (minor).** `GET /api/v2/plan?fromLat=37.4636&fromLon=-122.4286&toLat=37.7955&toLon=-122.3937&time=2026-10-20T08:00:00-07:00&access=park-and-ride` returns 200, no itineraries, and `NO_STOPS_IN_RANGE` with "No transit stops are within walking distance." For a drive, expected wording is about no park-and-ride lot within the drive limit. The frontend shows its own neutral text for this code, so this is not a demo blocker.

**Done in `7e1c2f2`:** requests 3 (fonts), 4 (light rail type), 12 (steps), 13 (park and ride, with a 20 minute cap), and drop-off. Request 14: Stanford University and UC Berkeley now come first; see 15 for the Berkeley point.

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
