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
