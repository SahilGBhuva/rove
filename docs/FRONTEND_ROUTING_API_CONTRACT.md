# Frontend routing API contract

This document defines the frontend boundary for Claude's OpenTripPlanner work. The frontend must not guess OTP's raw GraphQL schema or call OTP directly.

## Endpoint

`POST /api/journeys`

Request:

```json
{
  "from": { "name": "Montgomery St", "lat": 37.7894, "lon": -122.4011 },
  "to": { "name": "19th St Oakland", "lat": 37.8079, "lon": -122.2680 },
  "dateTime": "2026-10-23T17:30:00-07:00",
  "arriveBy": false,
  "modes": ["TRANSIT", "WALK"]
}
```

Successful response:

```json
{
  "generatedAt": "2026-10-23T23:55:00Z",
  "itineraries": [
    {
      "id": "stable-result-id",
      "startTime": "2026-10-23T17:32:00-07:00",
      "endTime": "2026-10-23T17:51:00-07:00",
      "durationSeconds": 1140,
      "walkMeters": 240,
      "transfers": 0,
      "legs": [
        {
          "mode": "TRANSIT",
          "agencyId": "bart",
          "routeId": "Yellow-N",
          "routeName": "Yellow",
          "routeColor": "#F9E300",
          "from": { "name": "Montgomery St", "lat": 37.7894, "lon": -122.4011 },
          "to": { "name": "19th St Oakland", "lat": 37.8079, "lon": -122.2680 },
          "startTime": "2026-10-23T17:35:00-07:00",
          "endTime": "2026-10-23T17:48:00-07:00",
          "headsign": "Antioch",
          "geometry": { "type": "LineString", "coordinates": [] },
          "realtime": false,
          "delaySeconds": null
        }
      ]
    }
  ]
}
```

Errors use `{ "error": { "code": "NO_PATH", "message": "No transit journey found." } }` with an appropriate HTTP status. `realtime` must be false unless OTP has actually applied verified realtime data. The frontend will label scheduled-only results honestly.

The existing global search remains the sole search entry point. Once the endpoint exists, it can gain an explicit Plan mode that collects origin and destination without reintroducing a permanent dashboard form.

## Additions from the claude-frontend branch (October 17, 2026)

The frontend now implements this contract in `app.js` (`submitPlan`, `viewResults`, `viewNavigate`). It also reads these optional fields when present. None are required.

| Field | Where | Used for |
|---|---|---|
| `legs[].distanceMeters` | Walk legs | "Walk 0.2 mi" in the timeline and step view |
| `legs[].intermediateStops` | Transit legs (array) | Stop counts, for example "5 stops" |
| `legs[].routeLongName`, `legs[].routeShortName` | Transit legs | Fallback labels when the route is not in `network.json` |
| `legs[].agencyId` + `legs[].routeId` | Transit legs | When these match `network.json` IDs (`bart`, `muni`, `caltrain`, `vta`, `act`), the frontend uses Rove's own badge text and colors |

HTTP 404 or 501 from `/api/journeys` is shown as "Trip planning is not available on this server yet." Error code `NO_PATH` is shown as a no-route message.

## Realtime fields the frontend understands

`/api/realtime` keeps its current shape. Two optional additions let the backend take over matching without another frontend change:

1. `meta.coverage[agencyId] = { "vehicles": true|false, "arrivals": true|false }` overrides the frontend's built-in coverage table (Muni and AC Transit fully on, Caltrain on with train numbers, VTA vehicles only, BART off).
2. Per item, `agencyId` and `routeKey` (`"<agencyId>::<routeId>"`, for example `"bart::1"`) from a server-side exact index. When present, they are used directly instead of the 511 prefix match. This is the hook for BART direct Trip Updates and the VTA and Caltrain fixes.

The frontend never guesses a route by name. Items it cannot match exactly are not shown.
