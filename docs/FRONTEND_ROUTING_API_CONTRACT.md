# Frontend use of the backend API

Updated October 17, 2026. The authoritative contract is `docs/API_CONTRACT.md` on the backend branch (`claude-development`, commit `41849f9`). This file records how the frontend on `claude-frontend` uses it, and what the frontend asks the backend to change.

The earlier `POST /api/journeys` proposal is withdrawn. The frontend now uses the backend's real endpoints.

## Endpoints the frontend calls

| Endpoint | Used for | Frontend code |
|---|---|---|
| `GET /api/v2/realtime` | Live vehicles, alerts, per-agency quality gate, feed ages. Polled every 60 seconds while the tab is visible. | `loadRealtime`, `liveVehicles`, `coverage`, `activeAlerts` |
| `GET /api/v2/arrivals?agency=&stop=` | Departures on stop pages, and the next departure on nearby and saved rows. Cached for 25 seconds per stop. | `fetchArrivals`, `viewStop`, `placeRow` |
| `GET /api/v2/plan/status` | Shows an offline notice and removes the Find routes button when routing is down. | `fetchPlanStatus`, `planNoticeHtml` |
| `GET /api/v2/plan` | Trip results, timeline, and step-by-step navigation. | `submitPlan`, `normalizeItinerary`, `viewResults`, `buildSteps` |
| `GET /api/realtime` | Fallback only, when `/api/v2/realtime` returns 404 (an older server). | `loadRealtime` |

Origin and destination can be any address or place. Suggestions combine, in this order: your location, saved and recent places (stored in the browser), stops and stations from the browser's copy of `network.json`, and addresses and places from the geocoder. Stations lead only when the query names one; otherwise addresses lead. Riders can also choose any point on the map, or right-click the map on desktop. The frontend sends the chosen point's coordinates and name to `/api/v2/plan` unchanged.

### Address search (Phase 3)

| Call | Used for | Frontend code |
|---|---|---|
| `GET /api/v2/places/autocomplete?q=&lat=&lon=` | **Not built yet.** Preferred automatically when it exists (any non-404 answer). | `geocode` |
| `GET https://api.stadiamaps.com/geocoding/v1/autocomplete` | Suggestions while typing (debounced 220 ms, 3 characters minimum, previous request canceled). Covers the whole United States (`boundary.country=USA`), ranked toward the rider's location or the map center. | `geocode`, `requestAutocomplete` |
| `GET https://api.stadiamaps.com/geocoding/v1/search` | Text the rider typed but did not pick, resolved when they tap Find routes. | `resolveDraft` |
| `GET https://api.stadiamaps.com/geocoding/v1/reverse` | Names a point chosen on the map, if a result lies within 120 m. Otherwise the point keeps "Near <stop>" or "Pinned location". | `reverseGeocode`, `refinePointName` |

No API key is in the frontend. Stadia authenticates browser requests by domain, and accepts `localhost` without a key during development. Typed text that neither a stop name nor the geocoder recognizes is flagged on the field: the frontend never guesses a location.

### Routing regions

Rove's target is the whole United States, so address search and the map work nationwide. Trip planning is a separate question: it only works where the backend has a verified routing graph. Today that is one region, the San Francisco Bay Area, with the same bounds as `PLAN_BOUNDS` in `lib/routing/otp.mjs`.

- The frontend keeps a default region list (`DEFAULT_ROUTING_REGIONS` in `app.js`) and uses the server's list instead when `/api/v2/plan/status` returns one.
- If either place is outside every region, or the two places are in different regions, the planner shows a plain notice in place of Find routes and makes no `/api/v2/plan` request. Example: "Rove cannot plan trips to this destination yet. Trip planning is available in the San Francisco Bay Area today."
- A place outside every region still opens, can be saved, and shows on the map. Its Directions and Leave from here buttons, and its nearby stops, are replaced by the same kind of notice.
- A `400` "outside" answer or an `OUTSIDE_BOUNDS` routing error from the backend produces the same honest wording.

## How the frontend follows the display rules

- Times are shown from `start.estimated` when present, otherwise `start.scheduled`, and are labeled "Scheduled" unless the leg is real time.
- `staySeated: true` is shown as "Stay on board. It continues as ..." and is not counted or drawn as a transfer.
- `canceled` legs and `hasCancellation` itineraries are labeled in the canceled color.
- Leg `alerts` are shown under the leg in the timeline and on the navigation step.
- An empty `itineraries` list shows `errors[0].message`.
- `400` responses highlight the field named in `field` (origin, destination, or time) with plain-language text. `503` shows the offline notice. Other failures show a retry message. No trip is ever fabricated.
- Arrivals with status `unverified` show "Live arrivals are unavailable right now" instead of an empty board. `canceled` entries are listed separately as "Canceled" or "Not stopping here". `stale` arrivals show their age and "Live times may be out of date."
- Vehicles are drawn only when `routeId` is not null. BART never has vehicles.

## Requests for the backend

**New in Phase 3**

9. **Routing regions in plan status (needed for the second region).** Please add `regions: [{ "id": "bay-area", "name": "the San Francisco Bay Area", "status": "verified", "bounds": { "minLat", "maxLat", "minLon", "maxLon" } }]` to `GET /api/v2/plan/status`, generated from the same source as `PLAN_BOUNDS`, so the frontend and backend cannot drift. `name` is used in sentences, so it carries its article. Longer term, each region needs its own OTP graph or router, and `/api/v2/plan` needs to pick the router by region.
5. **Address search proxy (recommended before a public launch).** `GET /api/v2/places/autocomplete?q=&lat=&lon=` returning `{ "results": [{ "id", "name", "detail", "layer", "lat", "lon" }] }`, with the geocoder key kept on the server, a per-IP rate limit, and a short cache. Optional siblings: `/api/v2/places/search` and `/api/v2/places/reverse` with the same result shape. The frontend already calls the autocomplete route first and falls back to Stadia on a 404.
6. **Walking directions.** The plan API has no walk `steps`. OTP's `legs.steps { distance relativeDirection absoluteDirection streetName stayOn area }` would let the frontend show turn-by-turn walking ("Turn left onto Shattuck Ave"). Today walking legs show distance and time only, and the map draws them from `legGeometry`.
7. **Leg geometry.** The frontend draws `legs[].geometry` as is. If a transit leg has no geometry, or only its two end points while it passes intermediate stops, the frontend dashes it and says "Route shape not available." Please confirm OTP's graph is built with GTFS `shapes.txt` for all five feeds so this never appears in practice.
8. **Routing error codes.** Please pass OTP's `routingErrors[].code` through unchanged in `errors[].code`. The frontend has specific copy for `WALKING_BETTER_THAN_TRANSIT`, `OUTSIDE_SERVICE_PERIOD`, `OUTSIDE_BOUNDS`, and `LOCATION_NOT_FOUND`.

**Still open from Phase 2**


1. **Several stops in one arrivals call.** Same-named stops on opposite sides of a street (for example both Muni platforms at "Market St & Sansome St") are one place in the interface. The frontend currently makes up to four `/api/v2/arrivals` calls for one place. Accepting `stop=15689,15690` would make that one call.
2. **Alert entity IDs.** 511 alerts keep prefixed IDs (`SF:38R`) while BART alerts use static IDs. The frontend handles both, but static IDs plus `agency` on every entity would be simpler and less fragile.
3. **Fonts.** `lib/app.mjs` has no MIME type for `.woff2`. The self-hosted font in `public/fonts/` is served as `application/octet-stream`. Browsers accept this, but please add `'.woff2': 'font/woff2'`.
4. **Route type bug, still present.** `scripts/build-data.mjs` writes `type:+r.route_type||3`, which turns route type `0` (light rail) into `3` (bus). Muni Metro and VTA light rail are typed as buses in `network.json`. Please change it to treat `0` as a valid value and rebuild the data. Until then, `app.js` classifies those lines explicitly (`RAIL_ROUTE_IDS`).
