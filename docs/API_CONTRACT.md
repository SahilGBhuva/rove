# Rove backend API contract

Owner: backend (`claude-development`). Audience: the frontend session.
All endpoints are `GET`, return JSON, and send `Cache-Control: no-store`.
The browser never talks to 511, BART, or OpenTripPlanner directly, and no response contains a credential.

Times: realtime values are Unix seconds. Planner values are ISO 8601 with a Pacific offset (`2026-10-20T08:15:00-07:00`).
Agency ids everywhere: `bart`, `muni`, `caltrain`, `vta`, `act`.

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

Display rules:

- Show `start.scheduled`/`end.scheduled`. Show `estimated` and `delaySeconds` only when non-null; today routing is schedule-based (`routing.realtime: "scheduled"`), so label times as scheduled.
- `staySeated: true` means the rider stays on the same vehicle (interlined); do not render it as a transfer.
- When `itineraries` is empty, show `errors[0].message`; codes are `NO_TRANSIT_CONNECTION`, `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW`, `NO_STOPS_IN_RANGE`, `LOCATION_NOT_FOUND`, `OUTSIDE_BOUNDS`, `OUTSIDE_SERVICE_PERIOD`, `WALKING_BETTER_THAN_TRANSIT`.

Errors: `400 {error, field, code:"BAD_REQUEST"}` for invalid input (highlight `field`); `503 {code:"ROUTING_UNAVAILABLE"|"ROUTING_TIMEOUT"}` when the engine is not running; `502` for engine failures. Never fabricate a trip on error.

### `GET /api/v2/plan/status`

`200 {available:true, engine, feeds:["bart","muni",...], serviceTimeRange:{start,end}}` or `503 {available:false, error, code}`. Use it to enable or disable the Plan button.

## Places

### `GET /api/v2/stops/search?q=powell&limit=10&agencies=bart,muni`

Returns `{query, results:[{agency, agencyName, id, name, station, stopIds:[...], lat, lon}]}`. Platforms that share a parent station collapse into one station result. Queries shorter than two characters return no results.

## Realtime

### `GET /api/v2/arrivals?agency=muni&stop=15550`

```json
{ "agency":"muni", "stop":{...search result shape...},
  "status":"live",                      // live | no-predictions | unverified | unknown-agency
  "reasons":[],                         // present when unverified: why predictions are withheld
  "arrivals":[{"tripId":"...","routeId":"38R","routeName":"38R","headsign":"Ocean Beach","stopId":"15550","time":1792281000,"delay":60,"uncertainty":null,"source":"511"}],
  "canceled":[{"tripId":"...","routeId":"14","routeName":"14","headsign":"...","stopId":"15550","reason":"trip-canceled"}],
  "stale": false, "feed": {"headerTimestamp":..., "fetchedAt":..., "stale":false, "cache":"fresh", "error":null}, "generatedAt": 1792280000000 }
```

- `unverified` means live matching for that agency is below the 99% gate right now. Show "Live arrivals unavailable" and the scheduled data; do not show an empty board as if no service runs.
- `no-predictions` means the agency is verified but nothing is predicted for this stop in the next three hours.
- `canceled` lists canceled trips and skipped stops for this stop. Show them as canceled; they never appear in `arrivals`.
- For a station id (BART `POWL`), predictions for all of its platforms are included.
- When `stale` is true, label the data with its age (`feed.headerTimestamp`).

### `GET /api/v2/realtime`

Full matched snapshot: `{generatedAt, configured:{feed511, bartDirect}, feeds, errors, requestBudget, quality, vehicles, updates, alerts}`.

- `vehicles[]`: `{agency, source, id, label, tripId, tripMatch, routeId, routeName, headsign, directionId, lat, lon, bearing, speed, timestamp, stopId, status}`. `routeId` is a static route id or `null`; draw only vehicles with a non-null `routeId` on a route. BART publishes no vehicle positions, so there are never BART vehicles.
- `updates[]`: `{agency, source, tripId, tripMatch, routeId, routeName, headsign, directionId, serviceDate, tripStatus, delay, stopTimes:[{stopId, stopMatch, sequence, relationship, arrival, departure, delay}]}`. `tripMatch` is `matched`, `documented-exception` (BART Antioch 600-range), `added`, `unknown-trip`, or `service-date-mismatch`.
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
