# Bay Area-only routing feasibility prototype

**Status: experimental, not used by the public or local Rove application.** No API key, provider account, paid server, or credit card required.

The builder reads only the five existing GTFS archives from `data/raw/` and produces a **single service day's** sorted connection-scan timetable. Nothing changes in the current OpenTripPlanner integration. The generated `out/` files are excluded from Git.

## Reproduce

```sh
cd ~/rove-claude
python3 experiments/bay-router/build.py 2026-10-20
node --test experiments/bay-router/route.test.mjs
```

Measured on the Mac, for **Tuesday 2026-10-20**:

- 11,673 GTFS stops (including platforms and parent locations)
- 19,712 active GTFS trips
- 753,243 successive-stop connections
- **8,001,626 bytes gzip** (about 7.6 MiB) for the full day, versus around 25.6 MB JSON
- Build time approximately 5.6 s; sample JavaScript loading/decompression ~144 ms; walking-neighbor generation ~53 ms; stop-to-stop queries ~0–4 ms in the tested Node process
- Five agencies included: BART, Muni, Caltrain, VTA, AC Transit
- Synthetic routing tests cover transfers, pickup/drop-off restrictions, search horizon and invalid inputs.
- Real-data smoke runs returned scheduled BART and Caltrain journeys; these have **not** yet been compared systematically against OTP.

## Major blockers before production

1. The prototype uses **straight-line proximity** for transfers; streets, bridges, gates, waterways, station entrances, crossing rules, accessibility and gradients are NOT incorporated. Never show a calculated walk as actual pedestrian navigation.
2. The simple connection scan keeps one earliest-arrival label per stop and one boarding state per trip. It cannot yet guarantee correct transfer/wait constraints, multiobjective options, overtaking edge cases, or same-trip ride-through semantics in all cases.
3. Builds a **single GTFS service date**. After-midnight GTFS times can exceed 24:00, and a wall-clock nighttime search may require the *previous* and current service-date timetables combined. DST handling and calendar-based date selection remain to be implemented.
4. The compressed timetable is around 8 MB per day; many day-specific copies would be wasteful. Production would reuse weekly service patterns, use rolling service-date generation, and cache or stream subsets of connections.
5. No door-to-door street routing, geometry, user location integration, realtime delays/cancellations, park-and-ride, stop accessibility, or live arrival integration.
6. Schedules must refresh, since GTFS data expires. The builder reads local archives, so a production update process must run on an authorized machine or no-card automation.
7. No browser performance, cache management, mobile memory footprint, multi-agency OTP parity, or Mac-off Vercel deployment has been completed.
8. GTFS snapshot data may have provider licensing/attribution conditions; review before public redistribution.

**Decision:** The Bay Area timetable can be reduced enough to make a browser-delivered routing engine promising. However, this is a research proof of concept—not a substitute for Rove's already verified OTP navigation backend yet.
