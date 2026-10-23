# Journey planning

The deployed app (Vercel) uses the schedule-only planner described first. The OpenTripPlanner setup further down is for a full local install.

## Schedule-only planner (`/api/v2/plan` on Vercel)

`api/v2/plan.mjs` re-exports `api/v2/experimental-plan.mjs`. It plans from the bundled gzipped GTFS timetables `public/data/schedule/YYYY-MM-DD.json.gz` (currently 2026-10-19 through 2026-10-27). It uses scheduled times only: no live delays, no vehicle positions and no realtime adjustment (`routing.realtime: "none"`). Walking legs are straight-line estimates at 1.2 m/s (`approximate: true`), not checked pedestrian routes.

Code path: `planExperimental` → `searchJourneys` → `forwardRounds` + `latestDeparture` (`experiments/bay-router/route.mjs`) → `buildItinerary` → `rankItineraries` (`experiments/bay-router/rank.mjs`). `planWithWalking` then asks `experiments/bay-router/pedestrian.mjs` for walking geometry on the top two itineraries. `findJourney` in `route.mjs` is the old single-label search, kept only for its unit tests and as the documented root-cause reproduction.

### Root cause of the P0 "south to Tamien, wait 3 hours, back north" trip (fixed 2026-10-23)

Request: Sunnyvale to Chase Center at 00:24 on Friday 2026-10-23. Old answer: board a southbound Caltrain at 1:08 AM, reach Tamien at 1:28 AM, wait until the 4:37 AM northbound, reach 22nd Street at 5:55 AM, arrive 6:11 AM. Five causes worked together:

1. **Earliest-arrival search with one label per stop** (`findJourney`, a plain Connection Scan). It optimised arrival time only. Transfers, waiting and direction counted for nothing.
2. **Boarding a trip at the first reachable stop.** The scan marks a trip as boarded at the first stop where it becomes reachable, and never revisits that choice. Riding south to Tamien made the 4:37 AM northbound reachable at Tamien, which is earlier in that trip than Sunnyvale (4:58 AM). Both ways arrive at 5:55 AM, so the tie went to the detour and the direct train was never generated.
3. **Candidate generation could not recover.** Each of the roughly 20×20 origin/destination stop pairs ran the same search. Each one reached the same detour, so the "alternatives" were copies.
4. **The ranking ignored waits and direction.** It sorted by arrival time. The 3-hour wait at Tamien and the 51 minutes between the request and the walk were never measured. The itinerary's start was the walk start (1:07 AM), so `durationSeconds` hid the initial wait.
5. **No overnight honesty.** Any reachable trip was returned as a normal "leave now" recommendation, however late it started or however long the waits were.

Date handling was **not** the cause: overnight requests correctly load the previous service day's 24:xx trips plus the current day (`loadFor`, `combineServiceDays`).

### The search now

1. **Forward, transfer-bounded scan (`forwardRounds`).** A round-based Connection Scan runs from all candidate origin stops at once: the 12 nearest stops plus up to 4 Caltrain and 4 BART stations, within 1.8 km. Each stop is seeded with its walking time. Round *r* allows at most *r* vehicles (up to 4, so 3 transfers). The output is the Pareto front of door-to-door arrival time against number of vehicles.
2. **Reverse, latest-departure scan (`latestDeparture`).** For each Pareto point, a reverse scan with the same vehicle limit finds the journey that leaves the door as late as possible and still arrives by that time. Ties go to fewer vehicles. This removes early departures, detours and waits that do not improve arrival. For the P0 request it boards the same 4:37 AM train at Sunnyvale at 4:58 AM.
3. **Alternatives (`searchJourneys`).** Two profiles run: a normal one, and a walk-averse one where walking counts 2.5 times. Each does up to 3 "next departure" passes. Those passes stay within 4 hours of the request.
4. **Transfer feasibility, identical in both directions:**
   - The first vehicle departs no earlier than the request time plus the walk to the stop plus 60 s (`BOARDING_MARGIN_SECONDS`).
   - Every transfer needs at least 120 s after alighting (`MIN_TRANSFER_SECONDS`).
   - A transfer to a different stop also needs the walking time: straight line at 1.2 m/s plus 45 s fixed overhead, for stops within 260 m.
   - Zero-second and cross-stop "teleport" transfers are impossible.

Performance: the combined two-day timetable, footpaths, reverse footpaths and per-trip index are built once per service day and cached (they are immutable). `node scripts/bench-routing.mjs` benchmarks 15 representative queries. On 2026-10-23 on Sahil's Mac:

| | Before p50 / p95 | After p50 / p95 |
|---|---|---|
| Cold (fresh process, includes loading two days) | 1249 / 4471 ms | 680 / 1114 ms |
| Warm (day already loaded) | 735 / 2361 ms | 25 / 122 ms |

### Ranking (`rankItineraries`)

1. Keep the cheapest copy of each identical vehicle sequence.
2. Drop detours whenever any option without a detour exists.
3. Apply Pareto dominance. A dominates B when A arrives no later, with no more transfers, walking, initial wait, total transfer wait or longest single wait, and is strictly better on at least one.
4. Sort by generalized cost (seconds). Drop options that cost more than the best one plus 45 minutes. Default limit 3, maximum 5.

Generalized cost (`RANKING` in `rank.mjs`):

```
cost = (arrival − requested time)                      # includes waiting at home before a later start
     + 300 × transfers                                  # 5 min per transfer
     + 1.0 × walking seconds                            # walking counts double
     + 0.5 × seconds waiting at stops between vehicles  # waiting at a stop counts 1.5×
     + max(0, longest single wait − 15 min)             # long waits at a stop cost extra
     + 3600 if detour
     + 1 × max(0, metres ridden away from destination − 2000)
```

**Detour:** a later vehicle passes within 250 m of a station that an earlier vehicle already served. Board, intermediate and alight stops all count. The area around the transfer point itself is ignored.

**Backtracking:** the summed increase in straight-line distance to the destination across transit legs. It earns the `BACKTRACKS` warning when it exceeds the larger of 2 km and 25% of the trip distance.

### Overnight honesty and warnings

Each itinerary gets these additive fields:

- `initialWaitSeconds`: start minus the requested time.
- `transferWaitSeconds`: total waiting at stops between vehicles.
- `longestWaitSeconds`: the longest single wait at a stop.
- `warnings[]`: any of the codes below.
- `practical`: whether the itinerary meets the thresholds below.
- `detour`
- `backtrackMeters`
- `generalizedCost`
- `legs[].intermediateStopCount`: on transit legs.

| Warning | Meaning |
|---|---|
| `DEPARTS_LATER` | Leaves 30 to 90 minutes after the requested time |
| `DEPARTS_MUCH_LATER` | Leaves more than 90 minutes after the requested time (never in `itineraries`) |
| `LONG_WAIT` | One wait at a stop of 30 minutes or more |
| `LONG_WALK` | A walking leg over 800 m, or more than 1.5 km of walking in total (straight-line estimate) |
| `DETOUR` | Passes back through stations an earlier vehicle served |
| `BACKTRACKS` | Rides substantially away from the destination |

An itinerary is **practical** when all of these hold:

- It leaves within 90 minutes of the requested time.
- No single wait at a stop reaches 60 minutes.
- It is not a detour.

Only practical itineraries appear in `itineraries`. When none exists:

- `itineraries` is `[]` and `errors[0].code` is `NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW`. The frontend already shows its no-route message for this code. `errors[0]` also carries `message` and `nextPracticalDeparture`.
- `routing.serviceGap` is `{ reason: "NO_PRACTICAL_SERVICE_NEAR_REQUESTED_TIME", requestedTime, nextPracticalDeparture, nextPracticalArrival, minutesUntilNextDeparture }`.
- `laterItineraries` lists up to 2 real later trips from the timetable, flagged `DEPARTS_MUCH_LATER`, for a "first train is at …" display.
- `routing.notes` gains a plain sentence that says the same thing.

Times always come from the timetable, and no departure is invented. If no later trip exists within the search window (8 hours per pass), `serviceGap` is omitted. Searches late in the evening cannot see the next morning, because only the previous and current service days are loaded.

`routing.search` describes the algorithm and its limits for debugging.

### Tests

- `test/routing-quality.test.mjs`: the P0 regression (two Sunnyvale origins) and synthetic networks that pin the root cause and the transfer rules. It also holds a regression matrix: Caltrain, BART, Muni, VTA and AC Transit single-agency trips; Caltrain+Muni and BART+AC Transit; cross-midnight; an all-night bus; 400 for invalid coordinates; 503 for missing days; `LONG_WALK`. Invariants are checked on every itinerary returned: monotonic times, transfer buffers, no stop boarded or alighted twice, sane duration.
- Every scenario depends on the bundled timetables and uses fixed dates in 2026-10-19..27. Move the dates when the data is rebuilt.

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
