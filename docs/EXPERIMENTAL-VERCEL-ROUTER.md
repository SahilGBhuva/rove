# Rove experimental Vercel routing endpoint (October 20, 2026)

**Not yet rider-ready / not a replacement for the local OTP backend.**

This preview provides a no-Java, no-API-key serverless experiment at
`GET /api/v2/experimental-plan?fromLat=...&fromLon=...&toLat=...&toLon=...&time=...`.

- Timetables are bundled, offline-built GTFS snapshots for **October 19–27,
  2026** from the five configured agencies: BART, Muni, Caltrain, VTA, AC Transit.
- Trips, transfers, departure and arrival times are **scheduled**. No realtime,
  street directions, driving-to-transit, arrive-by, traffic, or live rerouting.
- Only start/end locations within **350m straight line** of nearby GTFS stops are
  eligible. Nearby inter-stop transfer walks within 65m are **not validated for
  pedestrian access**. For this reason, no turn-by-turn instructions or
  walking geometry are returned, and it must remain experimental.
- The API rejects unknown dates / bad coordinates / unsupported access requests.
  Vercel uses `vercel.json` `includeFiles` to bundle its schedule snapshots.
- The local full Rove OpenTripPlanner service and production `/api/v2/plan`
  route are **unchanged**. Do not promote the experimental API to full Rove
  until proper pedestrian geometry, itinerary accessibility, and live status
  validation are implemented.

Rebuild with: `python3 experiments/bay-router/build.py 2026-10-26` (from
the five locally downloaded GTFS zips under `data/raw`), then copy the
resulting `.json.gz` into `public/data/schedule/`. These snapshots are
time-limited and must be refreshed when agencies change schedules.

Run tests:

```
node --test experiments/bay-router/route.test.mjs
node --test test/experimental-plan.test.mjs
npm test
npm run check
npm run check-secrets
```

For production: refresh GTFS and compare routes against OTP; publish stop-to-stop
and safe pedestrian transfer routing only after passing real-world tests.
