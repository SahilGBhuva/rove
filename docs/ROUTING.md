# Journey planning with OpenTripPlanner

Rove plans trips with OpenTripPlanner (OTP) 2.8.1, running locally and reached only through `server.mjs` (`/api/v2/plan`). The browser never calls OTP.

## What the graph contains

- Streets and paths: the Geofabrik Northern California OpenStreetMap extract, clipped to the Bay Area (`-122.62,36.95,-121.50,38.12`) with complete ways, so walking legs follow real streets.
- Transit: the same five validated GTFS archives the map uses (`data/raw/*.zip`), loaded with feed ids `bart`, `muni`, `caltrain`, `vta`, `act`. OTP stop, route and trip ids therefore look like `muni:15550`, and the API maps them back to Rove agencies directly.
- Transfers between agencies are computed by OTP from the street network (walking between a BART platform and a Muni stop, for example).

Routing is schedule-based. Real-time-adjusted routing is a follow-up: OTP can consume BART's key-free GTFS-RT trip updates, but it must be verified against live data before it is switched on.

## One-time setup (Sahil's Mac)

Requires Java 21 and roughly 2 GB of disk. Clipping uses `osmium` if installed (`brew install osmium-tool`), otherwise pyosmium (`pip3 install osmium`).

```bash
cd ~/rove-claude
npm install
npm run otp:setup     # downloads and checksum-verifies the OTP jar and OSM, clips OSM, installs GTFS
npm run otp:build     # builds data/otp/graph/graph.obj (about 6 minutes in two steps; OTP_HEAP=5g by default)
```

## Running

One step, from the saved graph (no rebuild): `npm run rove`. See [LOCAL_STARTUP.md](LOCAL_STARTUP.md).

The two-terminal form still works: `npm run otp:start`, then `npm start`.

Check it: `curl -s localhost:4173/api/v2/plan/status` should report `available: true` and five feeds. Then `npm run verify-routing` plans eleven real multi-agency trips for the next weekday morning and writes `data/reports/routing-verification.json`.

## Walking and driving to transit

- Walking legs follow OSM streets and paths and carry turn-by-turn steps (`steps` on each leg).
- Park-and-ride (`access=park-and-ride`): OTP drives on OSM roads to a park-and-ride lot that OpenTripPlanner imported from OpenStreetMap, then walks to the platform. Lot capacity is shown only when mapped. Availability is never known.
- Drop-off (`access=drop-off`): OTP drives to the nearest drivable street at the station, then walks. It is not a designated drop-off zone.
- Drive times use OSM speed limits with no live traffic. The drive is capped at 20 minutes (`routingDefaults.accessEgress.maxDurationForMode` in `otp/router-config.json`, read when OTP loads the graph, so no rebuild is needed).
- Not supported: driving the whole trip, live traffic, parking availability or prices, and station entrances beyond what OSM maps.

## After a GTFS refresh

`npm run refresh-data`, then `npm run otp:setup && npm run otp:build`, and restart `otp:start`. The graph only knows the schedules it was built with; rebuild at least monthly and whenever a feed changes.

## Files

- `otp/build-config.json`, `otp/router-config.json`: committed configuration, copied into the graph directory by setup.
- `scripts/otp/setup-otp.sh`, `build-graph.sh`, `start-otp.sh`, `clip_osm.py`.
- `data/otp/` and `data/osm/`: downloaded and generated files, ignored by Git.
