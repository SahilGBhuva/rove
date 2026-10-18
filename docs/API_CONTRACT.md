# Rove backend API contract

Owner: backend (`claude-development`). Audience: the frontend session.
All endpoints are `GET`, return JSON, and send `Cache-Control: no-store`.
The browser never talks to 511, BART, or OpenTripPlanner directly, and no response contains a credential.

Times: realtime values are Unix seconds. Planner values are ISO 8601 with a Pacific offset (`2026-10-20T08:15:00-07:00`).
Agency ids everywhere: `bart`, `muni`, `caltrain`, `vta`, `act`.

## Integration quick start (frontend)

All data is for the San Francisco Bay Area only (BART, Muni, Caltrain, VTA, AC Transit).

1. On load, call `GET /api/v2/status`. It says whether address search and routing are available and, per agency, whether live arrivals are verified. Hide or label features from it; never show a control that cannot work.
2. Search box: `GET /api/v2/places/search?q=…&near=<map center>`. Debounce about 150 ms. Each result has `lat`, `lon`, `name`.
3. "Current location": browser geolocation, then `GET /api/v2/places/reverse?lat&lon` for a label.
4. Plan: either `POST /api/journeys` (the frontend contract from the work-frontend branch) or `GET /api/v2/plan`. Both run the same planner.
5. Stop and station screens: `GET /api/v2/arrivals?agency&stop`. Map vehicles: `GET /api/v2/realtime` (or the existing `/api/realtime`).

Serving and origins:

- `npm start` serves the frontend from the repository: `index.html`, `app.js`, `styles.css`, and anything under `public/`. Put new frontend files (scripts, stylesheets, icons, a web manifest) under `public/`; other paths return 404 by design.
- A separate local dev server (for example Vite on port 5173) can call the API directly: loopback origins (`http://localhost:*`, `http://127.0.0.1:*`) get CORS headers. Other origins are added only through `ROVE_CORS_ORIGINS`.
- Every response is JSON with `Cache-Control: no-store`. The browser never calls 511, BART or OpenTripPlanner itself.

### `GET /api/v2/status`

```json
{ "region": "San Francisco Bay Area",
  "agencies": [ { "id": "bart", "name": "BART", "arrivals": "verified", "vehicles": "not-published" },
                { "id": "muni", "name": "Muni", "arrivals": "verified", "vehicles": "live" } ],
  "search": { "stations": true, "addresses": true, "counts": { "address": 880197, "poi": 95057, "street": 79392, "area": 885 } },
  "routing": { "available": true, "access": ["WALK","CAR_PARKING","CAR_DROP_OFF"], "walkSteps": true, "driveTraffic": false, "maxDriveMinutes": 20,
               "bounds": { "minLat": 36.9, "maxLat": 38.2, "minLon": -122.75, "maxLon": -121.4 },
               "feeds": ["bart","muni","caltrain","vta","act"], "serviceTimeRange": { "start": 1791961200, "end": 1802937600 } },
  "realtime": { "feed511": true, "bartDirect": true } }
```

`routing.access` lists the first-mile options the planner accepts (`[]` while routing is down); `walkSteps` says walking legs carry turn-by-turn steps; `driveTraffic: false` means drive times come from speed limits, not live traffic; `maxDriveMinutes` is the cap on the drive to a station; `bounds` is the service area every coordinate must fall inside.

`arrivals` is `verified` only while the live feed passes the 99% matching gate; otherwise `unverified`. `vehicles` is `live`, `none`, `not-configured` (no 511 key) or `not-published` (BART publishes no vehicle positions).

## Journey planning

### `GET /api/v2/plan`

| Parameter | Required | Notes |
|---|---|---|
| `fromLat`, `fromLon`, `toLat`, `toLon` | yes | WGS84. Must be inside the Bay Area service area. |
| `fromName`, `toName` | no | Labels echoed back in `request`. |
| `time` | no | ISO 8601. Defaults to now. Must be within the next 60 days. |
| `arriveBy` | no | `true` makes `time` the latest arrival. |
| `modes` | no | Comma list of `BUS,RAIL,SUBWAY,TRAM,CABLE_CAR,FERRY,FUNICULAR,TROLLEYBUS`. Omit for all. |
| `limit` | no | 1 to 6 itineraries. Default 5. |
| `access` | no | How the trip reaches transit: `walk` (default), `park-and-ride` or `drop-off`. The OTP names `WALK`, `CAR_PARKING` and `CAR_DROP_OFF` (any case, also `car_parking`, `park_and_ride`, `drop_off`) are accepted. Anything else is a `400` with `field: "access"`. |

Use `/api/v2/stops/search` (below) or the map to get coordinates. Stop pickers should send the station's `lat`/`lon`.

`200` response:

```json
{
  "request": { "from": {"lat":37.7849,"lon":-122.4073,"name":"Powell"}, "to": {...}, "time": "2026-10-20T08:15:00-07:00", "arriveBy": false, "modes": null },
  "searchDateTime": "2026-10-20T08:15:00-07:00",
  "searchWindowSeconds": 2400,
  "routing": { "engine": "OpenTripPlanner", "realtime": "scheduled" },
  "errors": [],
  "itineraries": [{
    "id": "it-0",
    "start": "2026-10-20T08:17:00-07:00",
    "end": "2026-10-20T08:41:00-07:00",
    "durationSeconds": 1440, "walkSeconds": 420, "waitingSeconds": 60, "walkMeters": 512, "transfers": 0,
    "agencies": ["bart"], "usesRealtime": false, "hasCancellation": false,
    "legs": [{
      "mode": "SUBWAY", "transit": true,
      "agency": { "id": "bart", "name": "BART" },
      "route": { "id": "2", "gtfsId": "bart:2", "shortName": "Yellow-N", "longName": "...", "color": "#FFFF33", "textColor": "#000000" },
      "trip": { "id": "1965527", "gtfsId": "bart:1965527", "headsign": "Antioch", "shortName": null },
      "headsign": "Antioch",
      "from": { "name": "Powell Street", "lat": 37.78, "lon": -122.41, "stop": { "agency": "bart", "id": "M30-1", "gtfsId": "bart:M30-1", "code": "903301", "platform": "1", "station": { "agency": "bart", "id": "POWL", "name": "Powell Street" } } },
      "to": { ... },
      "start": { "scheduled": "2026-10-20T08:22:00-07:00", "estimated": null, "delaySeconds": null },
      "end":   { "scheduled": "2026-10-20T08:37:00-07:00", "estimated": null, "delaySeconds": null },
      "durationSeconds": 900, "distanceMeters": 12000,
      "realtime": false, "realtimeState": null, "canceled": false, "serviceDate": "20261020", "staySeated": false,
      "intermediateStops": [{ "agency": "bart", "id": "M20-1", "name": "Montgomery Street", "lat": 37.79, "lon": -122.40 }],
      "geometry": { "type": "LineString", "coordinates": [[-122.4073, 37.7846], ...] },
      "alerts": [{ "header": "...", "description": "...", "start": 1792200000, "end": null }]
    }]
  }]
}
```

Walking legs have `transit: false` and `agency`, `route`, `trip` set to `null`. `geometry` is GeoJSON and can be added to a MapLibre source as is.

Every itinerary also has `access` (`walk`, `park-and-ride` or `drop-off`) and `drivingMeters` (0 for walking trips). The time to leave home is `start`.

#### Walking and driving legs (`WALK`, `CAR`)

Non-transit legs carry turn-by-turn `steps` built from OpenTripPlanner's street graph (OpenStreetMap):

```json
"steps": [
  { "instruction": "Head east on Lily Avenue", "distanceMeters": 95, "relativeDirection": "DEPART", "absoluteDirection": "EAST",
    "streetName": "Lily Avenue", "unnamed": false, "stayOn": false, "area": false, "exit": null, "lat": 37.3621, "lon": -122.0007 },
  { "instruction": "Turn left onto Timberpine Avenue", "distanceMeters": 560, ... },
  { "instruction": "Take the escalator", "distanceMeters": 12, "relativeDirection": "CONTINUE", "streetName": "escalator", "unnamed": true, ... }
]
```

- `instruction` is ready-to-show American English. `lat`/`lon` is where the step begins (use it to place a maneuver marker).
- `unnamed: true` means OSM has no name for the way (a sidewalk, path, crosswalk or escalator); the instruction already says "the path" or "the sidewalk".
- `stayOn: true` means the rider continues on the same street; `area: true` means the step crosses an open area such as a plaza; `exit` is the roundabout exit number or `null`.
- Step distances add up to the leg distance to within rounding.

Park-and-ride and drop-off itineraries start with a `CAR` leg that also has `steps`, plus:

```json
"driving": { "traffic": "not-included", "source": "OpenStreetMap roads and speed limits" }
```

- Park-and-ride: the `CAR` leg ends at an OpenStreetMap parking lot, given as `to.parking = { id, name, lat, lon, capacity, availability: "unknown" }`. `capacity` is the mapped number of spaces or `null`. Availability is never known; say so.
- Drop-off: the `CAR` leg ends at the nearest drivable street to the station, not a designated drop-off zone, followed by a short walk.
- The drive to transit is capped at 20 minutes, so Rove never proposes a long drive to a distant station.
- Drive times assume no traffic. `routing.notes` repeats these limits in plain sentences; show them with the itinerary.

Display rules:

- Show `start.scheduled`/`end.scheduled`. Show `estimated` and `delaySeconds` only when non-null; today routing is schedule-based (`routing.realtime: "scheduled"`), so label times as scheduled.
- `staySeated: true` means the rider stays on the same vehicle (interlined); do not render it as a transfer.
- When `itineraries` is empty, show `errors[0].message`; codes are `NO_TRANSIT_CONNECTION`, `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW`, `NO_STOPS_IN_RANGE`, `LOCATION_NOT_FOUND`, `OUTSIDE_BOUNDS`, `OUTSIDE_SERVICE_PERIOD`, `WALKING_BETTER_THAN_TRANSIT`.

Errors: `400 {error, field, code:"BAD_REQUEST"}` for invalid input (highlight `field`); `503 {code:"ROUTING_UNAVAILABLE"|"ROUTING_TIMEOUT"}` when the engine is not running; `502` for engine failures. Never fabricate a trip on error.

### `POST /api/journeys`

The frontend's contract (`docs/FRONTEND_ROUTING_API_CONTRACT.md` on work-frontend), implemented as specified.

Request: `{ "from": { "name", "lat", "lon" }, "to": { … }, "dateTime": "2026-10-23T17:30:00-07:00", "arriveBy": false, "modes": ["TRANSIT", "WALK"], "access": "walk" }`. `access` takes the same values as on `/api/v2/plan`. `dateTime` defaults to now; `modes` may also list specific transit modes (`SUBWAY`, `BUS`, `RAIL`, `TRAM`, `CABLE_CAR`, `FERRY`). Body limit 16 KB.

Response `200`: `{ generatedAt, routing, request, itineraries: [{ id, startTime, endTime, leaveAt, durationSeconds, walkMeters, walkSeconds, waitingSeconds, transfers, access, drivingMeters, agencies, hasCancellation, legs: [{ mode: "TRANSIT" | "WALK" | "CAR", vehicleMode, agencyId, agencyName, routeId, routeName, routeLongName, routeColor, routeTextColor, tripId, headsign, from: { name, lat, lon, stopId, agencyId, stationId, platform, parking }, to, startTime, endTime, durationSeconds, distanceMeters, intermediateStops, geometry, steps, driving?, realtime, delaySeconds, canceled, staySeated, alerts }] }] }`. `steps`, `parking` and `driving` are as described under `/api/v2/plan`.

- `id` is stable for the same trip (built from the boarded trips and times), so it can key list items and saved trips.
- `realtime` is true only when the planner itself applied live data to that leg. Planning is schedule-based today, so expect `false` and label times as scheduled.

Errors use `{ "error": { "code", "message", "field"? } }`:

| Status | `code` | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid body; `field` is `from`, `to`, `dateTime`, `modes` or `body` |
| 404 | `NO_PATH`, `WALKING_BETTER`, `NO_STOPS_NEARBY`, `LOCATION_NOT_ROUTABLE`, `OUTSIDE_SERVICE_AREA`, `OUTSIDE_SCHEDULE` | No itinerary; `message` is ready to show |
| 413 | `BAD_REQUEST` | Body over 16 KB |
| 503 | `ROUTING_UNAVAILABLE`, `ROUTING_TIMEOUT` | The planner is not running |
| 502 | `ROUTING_UPSTREAM_ERROR`, `ROUTING_QUERY_ERROR` | The planner failed |

### `GET /api/v2/plan/status`

`200 {available:true, engine, access, walkSteps, maxDriveMinutes, bounds, feeds:["bart","muni",...], serviceTimeRange:{start,end}}` or `503 {available:false, bounds, error, code}`. Use it to enable or disable the Plan button.

## Places

### `GET /api/v2/places/search?q=1355%20market%20st&limit=8&near=37.78,-122.41`

The single search box: transit stations (from the agencies' GTFS) plus addresses, businesses, landmarks, streets, cities and neighborhoods (from OpenStreetMap, about 880,000 addresses and 95,000 named places across the Bay Area).

- `near=lat,lon` (optional): bias toward the map center or the rider's location. Send it; chains such as coffee shops otherwise come back in arbitrary order.
- An agency name in the query ("Powell St BART", "Diridon Caltrain") narrows stations to that agency.

```json
{ "query": "1355 market st", "addressSearch": "available",
  "results": [
    { "kind": "address", "id": "osm:123", "name": "1355 Market Street", "address": "San Francisco, CA", "city": "San Francisco", "category": null, "lat": 37.776955, "lon": -122.416637, "source": "openstreetmap" },
    { "kind": "station", "id": "bart:CIVC", "name": "Civic Center / UN Plaza", "category": "BART station", "agency": "bart", "stopIds": ["M40-1","M40-2","CIVC"], "lat": 37.779413, "lon": -122.413836, "source": "gtfs" }
  ] }
```

- `kind` is `station`, `stop`, `address`, `poi`, `street` or `area` (city or neighborhood). Show `name` as the title and `address` or `category` as the subtitle.
- `approximate: true` with a `note` means the house number is not in the map data and the result is the street. Show the note.
- When the address index is not installed, `addressSearch` is `"unavailable"` with a `reason`, and only stations are returned.
- To plan, pass the chosen result's `lat`/`lon` and `name` to `/api/v2/plan` as `fromLat`/`fromLon`/`fromName` (or `to...`).

### `GET /api/v2/places/reverse?lat=37.7769&lon=-122.4166`

The closest address or named place within about 250 m, for "Current location" labels and map taps: `{ "result": { ...place, "distanceMeters": 6 } }`, or `{ "result": null }`. `503` when the index is not installed.

## Stops

### `GET /api/v2/stops/search?q=powell&limit=10&agencies=bart,muni`

Returns `{query, results:[{agency, agencyName, id, name, station, stopIds:[...], lat, lon}]}`. Platforms that share a parent station collapse into one station result. Queries shorter than two characters return no results.

## Realtime

### `GET /api/v2/arrivals?agency=muni&stop=15550`

```json
{ "agency":"muni", "stop":{...search result shape...},
  "status":"live",                      // live | no-predictions | unverified | unknown-agency
  "reasons":[],                         // present when unverified: why predictions are withheld
  "arrivals":[{"tripId":"...","routeId":"38R","routeName":"38R","headsign":"Ocean Beach","stopId":"15550","platform":null,"platformChange":false,"time":1792281000,"delay":60,"uncertainty":null,"source":"511","scheduled":true,"note":null}],
  "canceled":[{"tripId":"...","routeId":"14","routeName":"14","headsign":"...","stopId":"15550","reason":"trip-canceled"}],
  "stale": false, "feed": {"headerTimestamp":..., "fetchedAt":..., "stale":false, "cache":"fresh", "error":null}, "generatedAt": 1792280000000 }
```

- `unverified` means live matching for that agency is below the 99% gate right now. Show "Live arrivals unavailable" and the scheduled data; do not show an empty board as if no service runs.
- `no-predictions` means the agency is verified but nothing is predicted for this stop in the next three hours.
- `canceled` lists canceled trips and skipped stops for this stop. Show them as canceled; they never appear in `arrivals`.
- For a station id (BART `POWL`), predictions for all of its platforms are included.
- `platform` is the GTFS `platform_code` of the stop the live feed itself named (by stop id or stop code), for example `"2"` for BART `M50-2`. It is `null` when the schedule gives that stop no platform code (Muni, AC Transit and Caltrain publish none; VTA publishes bay numbers at some transit centers) or when the stop was inferred from the trip's stop sequence rather than named by the feed. It is never derived from stop id patterns. `platformChange: true` means the feed moved the train to a different platform of a station the trip serves.
- `scheduled: false` marks a real prediction for a trip that is not in the published schedule: BART's Antioch line (Pittsburg Center and Antioch stations) and BART added trips. These have `routeId: null` and a `note`; show them as "BART" with the note rather than guessing a line.
- When `stale` is true, label the data with its age (`feed.headerTimestamp`).

### `GET /api/v2/realtime`

Full matched snapshot: `{generatedAt, configured:{feed511, bartDirect}, feeds, errors, requestBudget, quality, vehicles, updates, alerts}`.

- `vehicles[]`: `{agency, source, id, label, tripId, tripMatch, routeId, routeName, headsign, directionId, lat, lon, bearing, speed, timestamp, stopId, status}`. `routeId` is a static route id or `null`; draw only vehicles with a non-null `routeId` on a route. BART publishes no vehicle positions, so there are never BART vehicles.
- `updates[]`: `{agency, source, tripId, tripMatch, routeId, routeName, headsign, directionId, serviceDate, tripStatus, delay, stopTimes:[{stopId, stopMatch, sequence, relationship, arrival, departure, delay}]}`. `tripMatch` is `matched`, `documented-exception` (BART Antioch line, recognized by its Pittsburg Center and Antioch stops), `added`, `unknown-trip`, or `service-date-mismatch`.
- `alerts[]`: `{id, source, agencies:[...], header, description, url, cause, effect, activePeriods, entities}`. BART alerts come from BART directly; route and stop ids in BART alert entities are BART static ids.
- `quality[agency]`: `{tripMatchPct, stopMatchPct, vehicleMatchPct, arrivalsVerified, gateReasons, ...counts}`.

### `GET /api/v2/realtime/quality`

Quality plus hourly history: `{quality, feeds, errors, unassigned, hourly:{currentHour, completedHours}}`.

### `GET /api/realtime` (existing endpoint used by `app.js`)

Shape unchanged so the current frontend keeps working, with three behavior changes:

1. `routeId` and `stopId` are `PREFIX:static_id` (for example `CT:77119`) only when the server resolved them exactly, and `""` otherwise. The browser's suffix matcher therefore cannot attach a vehicle or prediction to the wrong route.
2. `stopTimes` is empty for canceled trips, for unmatched trips, and for any agency whose live quality is below the gate. VTA arrivals stay hidden until live stop matching reaches 99%.
3. BART trip updates and alerts come from BART's own feed (`tripId` is unprefixed; alert entities use `agencyId: "BA"` and `BA:` route/stop ids). The response adds `quality` per agency.

New frontend work should use the v2 endpoints.

## Frontend compatibility (checked against `claude-frontend` at bd56758, October 2026)

Read only; the frontend branch was not changed. Every endpoint it calls exists and returns the fields it reads:

| Frontend call | Backend | Status |
|---|---|---|
| `GET /api/v2/status` reading `routing.access`, `routing.walkSteps` | as above | Supported |
| `GET /api/v2/plan/status` | as above, now with `bounds` (request 9) | Supported |
| `GET /api/v2/plan?…&access=CAR_PARKING` | OTP mode names are accepted as aliases | Supported |
| Walking steps with `stayOn` and `area` (request 12) | added to every step | Supported |
| Cap the drive to a station (request 13) | 20 minutes, in `otp/router-config.json` (`accessEgress.maxDurationForMode` for `CAR_TO_PARK` and `CAR_PICKUP`) | Supported |
| `GET /api/v2/places/search`, `/api/v2/places/reverse` | as above | Supported |
| `GET /api/v2/arrivals`, `/api/v2/realtime`, `/api/realtime` | as above | Supported |
| `POST /api/journeys` | implemented, though the frontend withdrew its proposal and uses `GET /api/v2/plan` | Supported (optional) |

Remaining differences:

- Landmark ranking (request 14): "uc berkeley", "stanford" and "stanford university" return the campus first. The bare word "berkeley" returns the Berkeley City Club first and the University of California second, because the index has no popularity signal. Riders get the campus with any second word.
- Realtime in routing (request 10): planning is schedule-based. Live arrivals are shown on stop boards, not folded into itineraries. This is a follow-up that needs verification against live feeds before it is enabled.
- Also resolved from the frontend's list: `.woff2` fonts are served as `font/woff2`; `public/data/network.json` now keeps GTFS route type `0`, so Muni Metro, the F line and VTA light rail are typed as light rail instead of bus (the frontend's `RAIL_ROUTE_IDS` workaround is no longer needed but does no harm); OTP's `routingErrors[].code` values pass through unchanged in `errors[].code`; all five feeds include `shapes.txt`, so transit legs follow the real route shape.
- Not done (optional requests 1 and 2): `/api/v2/arrivals` takes one stop per call, so a place with several same-named stops needs one call per stop; 511 alert entities keep their prefixed ids (`SF:38R`) while BART alerts use static ids.
- The frontend falls back to Stadia and then Photon for geocoding when `/api/v2/places/search` is unavailable. Those calls go from the browser to third parties, outside this backend; with the backend running, Rove's own index answers.
