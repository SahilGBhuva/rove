# Rove

Rove is a map-first Bay Area transit application using the complete static GTFS networks for BART, Muni, Caltrain, VTA, and AC Transit.

## Run locally

```bash
cd /Users/Sahil/Documents/Codex/2026-10-17/files-pasted-by-the-user-build/rove
npm install
npm start
```

Open `http://localhost:4173`.

## Map and data

- Map engine: MapLibre GL JS 5.6.1
- Vector basemap: OpenFreeMap Liberty/Dark, using OpenStreetMap and OpenMapTiles data
- Attribution: provided automatically by the map style and MapLibre control
- Transit geometry and stops: official agency GTFS archives parsed into `public/data/network.json`
- Current processed totals: 281 routes and 11,489 stops

| Agency | Routes | Stops | Static source |
|---|---:|---:|---|
| BART | 14 | 155 | `https://www.bart.gov/dev/schedules/google_transit.zip` |
| Muni | 68 | 3,240 | 511 `operator_id=SF` |
| Caltrain | 5 | 95 | `https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip` |
| VTA | 71 | 3,307 | `https://gtfs.vta.org/gtfs_vta.zip` |
| AC Transit | 123 | 4,692 | 511 `operator_id=AC` |

The browser receives simplified representative shapes for each route direction. Route and stop records remain complete; no locations are fabricated.

## Refresh the static network

The refresh requires `SF_511_API_KEY` because Muni's direct archive expired on August 28, 2026 and because the old AC Transit Mobility Database record was superseded. Run:

```bash
npm run refresh-data
```

The workflow downloads to temporary files, validates required tables and active service for today plus 14 days, and only then replaces the installed archive. A failed or expired feed cannot replace the last good copy. It parses `routes.txt`, `trips.txt`, `stops.txt`, `stop_times.txt`, `shapes.txt`, `calendar.txt`, and `calendar_dates.txt`, then regenerates the compact browser dataset. Run `npm run audit-data` at any time to produce the same service and integrity report.

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

That key enables the regional (`agency=RG`) GTFS-Realtime endpoints for vehicle positions, trip updates, and service alerts, plus current 511 static feeds for Muni and AC Transit. Do not put the 511 key in `app.js` or any browser-delivered file.

## Realtime architecture

- The browser checks Rove once per minute while visible, pauses while hidden, and refreshes immediately when foregrounded. It never contacts 511 directly.
- The server polls regional vehicle positions every 120 seconds, trip updates every 180 seconds, and alerts every 900 seconds: 54 requests/hour at most.
- A rolling limiter hard-caps 511 traffic at 54 requests/hour under the default 60-request allowance.
- Concurrent browser requests are coalesced into one upstream request.
- Staleness follows the test plan: 270 seconds for positions, 390 seconds for trip updates, and 1,230 seconds for alerts. Data age is visible.
- Protobuf is decoded server-side. The browser receives normalized JSON without the API key.
- Vehicle markers, stop predictions, delays, and alerts are shown only when present in the actual feed.

The server only serves the three browser entry files and content below `public/`. `.env`, Git metadata, source archives, scripts, and server code are not web-accessible. Run `npm run check-secrets` before every push.
