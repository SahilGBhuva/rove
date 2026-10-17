# Rove

Rove is a map-first Bay Area transit application using the complete static GTFS networks for BART, Muni, Caltrain, VTA, and AC Transit.

## Run locally

```bash
cd /Users/Sahil/Documents/Codex/2026-10-17/files-pasted-by-the-user-build/rove
python3 -m http.server 4173
```

Open `http://localhost:4173`.

## Map and data

- Map engine: MapLibre GL JS 5.6.1
- Vector basemap: OpenFreeMap Liberty/Dark, using OpenStreetMap and OpenMapTiles data
- Attribution: provided automatically by the map style and MapLibre control
- Transit geometry and stops: official agency GTFS archives parsed into `public/data/network.json`
- Current processed totals: 281 routes and 11,487 stops

| Agency | Routes | Stops | Static source |
|---|---:|---:|---|
| BART | 14 | 155 | `https://www.bart.gov/dev/schedules/google_transit.zip` |
| Muni | 68 | 3,238 | `https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip` |
| Caltrain | 5 | 95 | `https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip` |
| VTA | 71 | 3,307 | `https://gtfs.vta.org/gtfs_vta.zip` |
| AC Transit | 123 | 4,692 | AC Transit’s documented GTFS download endpoint |

The browser receives simplified representative shapes for each route direction. Route and stop records remain complete; no locations are fabricated.

## Refresh the static network

Run:

```bash
./scripts/refresh-data.sh
```

The workflow downloads all five current archives, extracts them, parses `routes.txt`, `trips.txt`, `stops.txt`, `stop_times.txt`, `shapes.txt`, `calendar.txt`, and `calendar_dates.txt`, then regenerates the compact browser dataset. Raw archives and extracted files are ignored by Git.

AC Transit’s static download endpoint requires its download token. Set `AC_TRANSIT_STATIC_TOKEN` in the private `.env` file before refreshing that feed. The checked-in processed network remains sufficient to run the application after cloning.

## 511 realtime credentials

511 SF Bay requires one 511 Open Data API key. It is separate from the Mobility Database refresh token. Configure it without placing it in shell history:

```bash
cd /Users/Sahil/Documents/Codex/2026-10-17/files-pasted-by-the-user-build/rove
npm run configure-511
```

Paste the key at the hidden prompt and press Return. The script writes `.env` with owner-only `600` permissions. `.env` is ignored by Git. Restart the server afterward:

```bash
npm start
```

Confirm configuration without revealing the key:

```bash
curl -s http://localhost:4173/api/realtime/status
```

The response should contain `"configured":true`. Never type the key into the browser, commit it, put it in `app.js`, or pass it directly on a command line.

That key enables the regional (`agency=RG`) GTFS-Realtime endpoints for vehicle positions, trip updates, and service alerts. The regional feed is the simplest way to cover all five agencies. No Mobility Database credential is required when using the official direct static feeds and 511 realtime endpoints. Do not put the 511 key in `app.js` or any browser-delivered file.

## Realtime architecture

- The browser polls Rove once per minute but never contacts 511 directly.
- The server caches each of the three regional feeds for five minutes, so normal maximum use is 36 upstream requests/hour.
- A rolling limiter hard-caps the server at 48 upstream requests/hour, leaving 12 requests/hour of headroom under the default 511 allowance.
- Concurrent browser requests are coalesced into one upstream request.
- Last-good data may be served for up to 15 minutes and is visibly marked stale.
- Protobuf is decoded server-side. The browser receives normalized JSON without the API key.
- Vehicle markers, stop predictions, delays, and alerts are shown only when present in the actual feed.
