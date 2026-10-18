# Real-world verification log

Only checks against live upstream data or real builds are recorded here. Fixture and unit tests (`npm test`) are not real-world verification and are not counted.

## BART direct realtime: verified (October 17, 2026)

Source: BART's own GTFS-RT trip updates (`api.bart.gov/gtfsrt/tripupdate.aspx`), captured three times through the in-app browser on Sahil's Mac and run through Rove's real matcher and the installed BART static GTFS (`scripts/analyze-feed-files.mjs`).

| Capture (UTC) | Trip updates | Matched to schedule | Antioch 600-range | Added | Stop predictions matched | Conflicts |
|---|---:|---:|---:|---:|---:|---:|
| 22:58:47 | 69 | 59 / 59 (100%) | 10 | 0 | 859 / 859 (100%) | 0 |
| 23:03:35 | 70 | 61 / 61 (100%) | 9 | 0 | 893 / 893 (100%) | 0 |
| 23:10:18 | 73 | 62 / 62 (100%) | 10 | 1 | 890 / 890 (100%) | 0 |

Every stop matched by exact `stop_id` (platform ids such as `K10-1`). BART's realtime `stop_sequence` numbering does not follow the static `stop_sequence` (839 of 859 differed in the first capture), which confirms that the matcher must treat the stop id, not the sequence, as authoritative.

Independent check against bart.gov "Real Time Departures" for 12th St. Oakland City Center, read in the same minute as the feed capture:

| Time | bart.gov | Rove (from the BART feed) |
|---|---|---|
| 4:03 pm | P1 Richmond Leaving, 10; P2 SF Airport 6, Berryessa 9, Millbrae 14; P3 Antioch 19 | P1 Red-N 0, Orange-N 9; P2 Yellow-S 6, Orange-S 9, Red-S 14; P3 Yellow-N 19 |
| 4:10 pm | P1 Richmond 3, 16; P2 SF Airport Leaving, 20, Berryessa 4, 22, Millbrae 7; P3 Antioch 14 | P1 Orange-N 3, Red-N 15; P2 Yellow-S 0, 19, Orange-S 4, 22, Red-S 7; P3 Yellow-N 13 |

All 16 departures agree on line, platform and destination, and every time agrees to within one minute (rounding).

Findings:

- Antioch-line trips (Pittsburg Center and Antioch, trip ids 600-699) appear in every capture with exact static stop ids (`E20-1`, `E30-2`). They are now returned at those stations as unscheduled predictions with no route.
- BART publishes added trips (one at 23:10 between Pittsburg/Bay Point and North Concord). They are treated the same way.
- BART's alerts feed was empty (header only) at all three captures, although bart.gov showed a planned-work advisory for Sunday, October 18. Advisories published only on the website do not reach GTFS-RT, so Rove cannot show them from this feed.

## OpenTripPlanner: in progress

- `otp-shaded-2.8.1.jar` downloaded from Maven Central; SHA-1 `f0cb33760d228084b1f7046b3f5b5f302aceee87` matches Maven's published checksum.
- A transit-only build of the five real GTFS feeds exposed a real configuration failure: BART and other feeds declare different time-zone names (`America/Los_Angeles` and `US/Pacific`), and OTP refuses to build. Fixed with `transitModelTimeZone` in `otp/build-config.json`; the transit build then succeeded.
- With that graph served, `/api/v2/plan/status` reported all five feeds, and `/api/v2/plan` reached the live engine, which accepted the query and returned the correct `LOCATION_NOT_FOUND` errors (no streets were loaded yet).
- Full build with OpenStreetMap streets and real journeys: pending the OSM download.

## VTA, Caltrain, Muni and AC Transit realtime: pending

These come only from 511, which requires the 511 key held on Sahil's Mac. Run `npm run configure-511`, `npm start`, then `npm run verify-realtime`; the report includes diagnostic samples for any unmatched trips or stops.
