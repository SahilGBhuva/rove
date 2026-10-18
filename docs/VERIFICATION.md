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

- Antioch-line trips (Pittsburg Center and Antioch) appear in every capture with exact static stop ids (`E20-1`, `E30-2`) and no schedule match. They are returned at those stations as unscheduled predictions with no route. They were first recognized by their 600-range trip ids; a later capture showed 700-range ids for the same service (see below), so they are now recognized by their stations instead.
- BART publishes added trips (one at 23:10 between Pittsburg/Bay Point and North Concord). They are treated the same way.
- BART's alerts feed was empty (header only) at all three captures, although bart.gov showed a planned-work advisory for Sunday, October 18. Advisories published only on the website do not reach GTFS-RT, so Rove cannot show them from this feed.

## OpenTripPlanner journey planning: verified (October 17-18, 2026)

Inputs, all real and checksum-verified:

- `otp-shaded-2.8.1.jar` from Maven Central, SHA-1 `f0cb33760d228084b1f7046b3f5b5f302aceee87` (matches Maven's published checksum).
- Geofabrik `norcal-261017.osm.pbf` (654,222,874 bytes), MD5 `e7f85de95f198cd21d240611496a6473` (matches Geofabrik's published checksum). Downloaded through the Mac's browser in ranged pieces because the shells cannot reach Geofabrik; the reassembled file was checked against the published MD5 before use.
- Clipped with `scripts/otp/clip_osm.py` to the Rove bounding box: 807,994 ways, 894,049 tagged nodes, 29,490 relations, 64 MB.
- The five validated GTFS archives in `data/raw/`.

Build: street graph then transit graph (`scripts/otp/build-graph.sh`), about 3 minutes each at a 4.5 GB heap. A single-step build at 6 GB was killed by the 6 GB memory limit of the cloud workspace, which is why the script now builds in two steps. OTP linked all agencies; it reported 27 stops not linked for transfers and 188 stops on pruned street islands out of 11,335, and removed trips whose service falls outside its four-month window.

Configuration failure found and fixed: the feeds declare both `America/Los_Angeles` and `US/Pacific`, and OTP refused to build until `transitModelTimeZone` was set.

Real door-to-door journeys (`npm run verify-routing`, departures Monday, October 19, 2026 at 8:15 am, all through `/api/v2/plan`):

| Trip | Best itinerary returned |
|---|---|
| Powell St to Lake Merritt | Walk 7 m, BART Blue-N 08:23 to 08:38, walk 36 m (20 min) |
| Ocean Beach to Mission and 24th | Muni 5R 08:20 to 08:56, walk 187 m, BART Yellow-S 09:05 to 09:09 (53 min) |
| Downtown Berkeley to Fruitvale | BART Orange-S 08:37 to 08:58 (26 min) |
| 4th and King to San Jose Diridon | Caltrain Express 08:20 to 09:20 (63 min) |
| Mountain View to Downtown San Jose | Caltrain 08:24 to Santa Clara 08:36, VTA Rapid 522 08:41 to 08:57 (37 min) |
| Downtown Oakland to Palo Alto | BART Yellow-S to Montgomery, Muni N to 4th and King, Caltrain 09:25 to 10:14 (107 min) |
| Richmond to Milpitas | BART Orange-S 08:24 to 09:41 (83 min) |
| Alameda South Shore to Downtown Oakland | AC Transit 30, 08:21 to 08:48 (39 min) |
| Haight and Ashbury to Chestnut St | Muni 43, 08:22 to 08:46 (29 min) |
| Downtown Mountain View to Tasman | VTA Orange Line 08:18 to 08:50 (38 min) |
| Arrive by 9:00 at Civic Center from Daly City | BART Yellow-N 08:42 to 08:55 |

All 11 passed the script's checks: transit legs present, legs in time order, every transit leg carries agency, route, trip and stop ids, geometry present, and the expected operator used. Every agency appears in at least one itinerary.

Spot check against the source schedule: the Powell to Lake Merritt legs (BART trips 1965825 and 1965541) depart and arrive at exactly the GTFS `departure_time` at Powell and `arrival_time` at Lake Merritt, so there is no time-zone shift.

Defect found and fixed: OTP returned a 61-minute walk-only option ahead of a 29-minute Muni trip. The API now orders itineraries by arrival time (latest departure first for arrive-by), and the check verifies ordering.

Not yet verified: realtime-adjusted routing (routing is schedule-based), and trips outside the morning peak.

## Place search and door-to-door planning: verified (October 18, 2026)

Index: `scripts/places/build_places.py` over the same checksum-verified Geofabrik extract, clipped to the Rove area. It holds 880,197 addresses, 95,057 named places (businesses, landmarks, parks, campuses, airports), 79,392 streets and 885 cities and neighborhoods. Cities come from `addr:city`, then from the 104 municipal boundaries in OSM (including the San Francisco city-county), then from the nearest named place. Index size 232 MB; typical query time 1 to 10 ms.

`npm run verify-places` against the running server (search through `/api/v2/places/search`, trips through `/api/v2/plan` from the searched coordinates). The expected positions are the places' publicly known coordinates; each top result had to land within the stated tolerance.

| Search | Top result | Tolerance |
|---|---|---|
| Ferry Building | San Francisco Ferry Building | 300 m |
| SFO | San Francisco International Airport | 2.5 km (airport area) |
| Oakland airport | Oakland International Airport | 3 km |
| Salesforce Tower, Oracle Park, Chase Center, Coit Tower, Pier 39 | the landmark itself | 200 to 300 m |
| Stanford University, Levi's Stadium, Lake Merritt | the campus, stadium, and Lake Merritt BART station | 0.4 to 1.5 km |
| 1355 Market St | 1355 Market Street (address) | 150 m |
| 2150 Shattuck Ave Berkeley | 2150 Shattuck Avenue (address) | 150 m |
| 1600 Amphitheatre Pkwy, 1 Infinite Loop Cupertino | the addresses | 300 m |
| Powell St BART, San Jose Diridon, 4th and King | the stations | 300 to 400 m |

Door-to-door trips planned from the search results (Tuesday, October 20, 8:30 am):

- 1355 Market St to 2150 Shattuck Ave: walk 375 m, BART Red-N Civic Center 08:44 to Downtown Berkeley, walk 48 m (38 min).
- Ferry Building to Stanford University: Muni N to 4th and King, Caltrain 09:25 to Palo Alto, walk 1.9 km (106 min).
- Oracle Park to Levi's Stadium: Caltrain Limited 08:48 to Mountain View, VTA Orange Line to Great America (107 min).
- Coit Tower to SFO: walk 1.7 km, BART Yellow-S from Montgomery 09:02 to SFO (79 min).

Frontend journey contract (`POST /api/journeys`, October 18): 1355 Market St to Chase Center at 5:30 pm returned walk 250 m, Muni 9 at 17:37, walk 79 m, Muni 22 at 17:50, walk 689 m, with every contract field present and no leg marked realtime. With it, `npm run verify-places` runs 23 checks, all passing.

All 22 checks passed. Defects found and fixed while testing: San Francisco places were labeled with neighborhood names because San Francisco's boundary is a city-county; chain stores in one city were merged into a single result; "Powell St BART" found nothing because "BART" is not part of the station name; landmark relations (the Ferry Building, lakes, stadiums) were missing until multipolygon places were added; airport codes such as SFO now match through alternate names.

Known limits: OSM address coverage is uneven between cities; when a house number is not mapped, search returns the street with `approximate: true` and says so. Walks to large areas (an airport, a campus) end at the area's representative point, not a specific terminal or building.

## 511 realtime (Muni, VTA, Caltrain, AC Transit): verified (October 18, 2026)

Sahil ran `npm run verify-realtime` on the Mac with the 511 key from `.env` (the key never left the Mac). Report: `data/reports/realtime-verification.json`, 03:22 UTC on October 18 (8:22 pm Pacific, Saturday).

| Agency | Trip updates | Trips matched | Stops matched | Vehicles matched | Arrivals |
|---|---:|---:|---:|---:|---|
| Muni | 810 | 100% | 100% (22,017 exact) | 100% (330) | verified |
| VTA | 204 | 100% | 100% (4,685 by public stop code) | 100% (117) | verified |
| Caltrain | 11 | 100% | 100% (142 exact) | 100% (7) | verified |
| AC Transit | 349 | 100% | 100% (8,406 exact) | 100% (188) | verified |
| BART (direct feed) | 57 | 88.7% | 100% (627 exact) | not published | withheld by the gate |

Zero stop conflicts for every agency. Notes:

- VTA: 511 publishes VTA stops by their public stop code, so every VTA stop matched through `stop_code`, not `stop_id`. Its 196 sequence mismatches are harmless because the stop, not the sequence, is authoritative. 27 canceled trips were reported as canceled, never as arrivals.
- Caltrain: 511 route ids are service names ("Local Weekend"); routes are resolved through the matched trip (`77120`), never through the name.
- 511 also carried 231 trip updates and 642 vehicles for operators Rove does not cover; they are counted as unassigned and ignored.

### BART: defect found and fixed

At the same time, BART's trip match was 88.7%, below the 99% gate, so Rove correctly withheld BART arrivals. The unmatched trips (700, 701, 702, 703, 705, 707 and more) served only Pittsburg Center and Antioch platforms (`E20-*`, `E30-*`): the Antioch line, now numbered in the 700s. The matcher recognized Antioch trips by a 600-range trip id, which BART had changed.

Fix: a trip with no schedule match is treated as Antioch service when every stop it predicts is at Pittsburg Center or Antioch, whatever its id. A trip that is not in the schedule and predicts any other station is still an unknown trip and keeps counting against the gate. Rerunning the matcher on the four saved BART captures (October 17, 22:58, 23:03 and 23:10 UTC, and October 18, 03:57 UTC) gives 100% trip and stop matching with zero conflicts in each. This has not yet been rechecked against a fresh live run; `npm run verify-all` on the Mac does that.

### BART fresh capture (October 18, 2026, 16:33 UTC): second defect found and fixed

A new capture of BART's live feed, through the Mac's browser: 70 trip updates, 60 matched to the schedule, 10 Antioch-line trips (back in the 600 range, recognized by station), no unknown trips. One stop prediction failed: trip 1973631 is scheduled at SFO platform 2 (`Y10-2`), and BART reported that the train used platform 3 (`Y10-3`). The matcher counted it as a conflict, and that one conflict withheld all BART arrivals.

Fix: a platform of a station the trip serves is accepted as a platform change, under the platform the feed reports, and counted separately (`platformChanges`). A stop at any station the trip does not serve is still a conflict. Result for this capture: 100% of trips, 853 of 853 stop predictions, 0 conflicts, 1 platform change, arrivals verified.

BART's alerts feed was empty (header only) in this capture as well.

## Launch scenarios (October 20, 2026 schedules)

`npm run verify-scenarios` against the API (`/api/v2/places/search`, then `/api/v2/plan`). These are schedule-based: real GTFS schedules and OpenStreetMap streets through OpenTripPlanner, not live data. Run in the cloud workspace for a Tuesday.

| Scenario | Result |
|---|---|
| 1105 Lily Avenue, Sunnyvale → SFO, walking | Leave 08:16; walk 1.6 km to Lawrence, Caltrain 08:39 to Millbrae, BART Red-N 09:31 to SFO; arrive 09:52 (96 min) |
| Same, park-and-ride | Leave 08:22; drive 3.9 km to the Sunnyvale Caltrain lot (OSM capacity 439, availability unknown), Caltrain Express 08:32, BART at Millbrae; arrive 09:32 (70 min) |
| Same, drop-off | Leave 08:20; drive 3.9 km to Sunnyvale station, same trains; arrive 09:32 (72 min) |
| UC Berkeley → Ferry Building | AC Transit 52 to Downtown Berkeley, BART Red-S to Montgomery, walk 1 km (83 min) |
| Stanford → San Jose Diridon | Walk 1.9 km, Caltrain 10:44 from Palo Alto (57 min) |
| Oakland City Hall → Palo Alto City Hall | BART Yellow-S, Muni 45 to 4th and King, Caltrain Limited 08:48 (96 min) |
| Walk, board, transfer, walk: Haight and Ashbury → Chase Center | Walk 167 m, Muni 7, transfer to Muni 22, walk 689 m (48 min) |
| Outside the Bay Area (to Los Angeles) | Refused: 400 on `toLat` |
| A date beyond the published schedules | Refused: 400 |
| Milpitas → Fremont at 2:30 am | "No transit connection was found near the requested time"; no invented trip |

Every itinerary passed the structural checks: durations equal end minus start, legs in time order, geometry on every leg, route, trip and stop ids on every transit leg, and turn-by-turn steps on every walk or drive over 80 m whose distances add up to the leg. Sample directions: "Head east on Lily Avenue (95 m); Turn left onto Timberpine Avenue (560 m)".

A park-and-ride trip from south San Jose to San Francisco used a 12-minute drive, confirming the 20-minute cap on driving to transit.

Live arrivals (scenario 7) were skipped in the cloud workspace because it cannot reach 511 or BART; they are counted as skipped, not passed. Running `npm run verify-all` on the Mac covers them.

## Walking and driving: limits

- Walking directions come from OpenStreetMap. Unnamed ways are described as "the path" or "the sidewalk".
- Drive times use speed limits, not live traffic. Parking availability is never known; lot capacity is shown only where OSM maps it. Drop-off ends at the nearest drivable street, not a designated zone.
- Sunnyvale has partial OSM address coverage (about 15,000 addresses). Unmapped house numbers fall back to the street, labeled approximate.

## Combined frontend and backend (October 18, 2026)

Frontend `claude-frontend` at `9521bb0` (its `index.html`, `app.js`, `styles.css` and fonts) served by this backend with the real OpenTripPlanner graph and place index, driven in a headless browser at 390 x 844 through the real interface: search box, suggestions, Walk/Drive/Drop-off, Depart at Monday, October 19, 8:00 am, Find routes. Run in the cloud workspace (Linux, 8 GB). Map tiles were blocked there, which does not affect planning.

| Trip | Result in the interface |
|---|---|
| 1105 Lily Avenue, Sunnyvale → SFO, Walk | 8:16–9:37 (1 hr 21 min): walk to Lawrence, Caltrain 8:39, BART Red; 12 walking steps |
| Same, Drive | 8:22–9:17 (55 min): drive 2.5 mi (7 min) to the Sunnyvale Caltrain lot, Caltrain Express, BART; 7 driving steps |
| Same, Drop-off | 8:20–9:17 (57 min): walk 310 ft, drive 2.4 mi to Sunnyvale station, Caltrain, BART |
| UC Berkeley → Ferry Building | 8:04–9:07 (1 hr 2 min): walk to Downtown Berkeley, BART Red, no transfers (after the campus-location fix below) |
| Stanford → San Jose Diridon | 8:03–8:59: walk to Palo Alto, Caltrain Limited, no transfers |
| Oakland City Hall → Palo Alto City Hall | 8:02–9:38: BART Yellow, Muni 45, Caltrain Limited, 2 transfers |

Every result was labeled "Scheduled times". No page errors and no horizontal overflow.

Routing outage, also seen through the interface: with OpenTripPlanner stopped, `/api/v2/status` reported `routing.available: false` and `access: []`, and the interface hid Find routes and disabled Drive rather than offering trips it could not plan.

Two frontend issues were found and handed to the frontend (details in `API_CONTRACT.md`): drop-off results are worded as park-and-ride, and drive results do not say that traffic is not included.

## Live, stale and failed realtime through the API (October 18, 2026)

The real BART capture from 16:33 UTC was replayed to the running server from a local test server (`BART_TRIP_UPDATES_URL`). For the first state, every timestamp was moved forward so the feed looked current; that copy is test data derived from the real capture.

| Feed state | `/api/v2/arrivals` (Powell Street) | `/api/v2/status` (BART) |
|---|---|---|
| Current (shifted test copy) | `live`, 33 arrivals, matching the board computed from the original capture | `verified` |
| The real capture as sent, 136 minutes old | `unverified`: "The newest BART live data is 136 minutes old." | `unverified`, same reason |
| Feed returning HTTP 503, within BART's 2-minute grace | last good data with its age | same |
| Feed still failing after the grace period | `unverified`: "The BART live feed could not be reached (BART trip updates returned HTTP 503)." | same |
| 511 agencies without a key | `unverified`: "Live data from 511 is not configured on this server." | same |

Defects found and fixed: before this change, a two-hour-old feed returned `no-predictions` (shown to riders as "no live predictions for the next three hours") while the status said BART was verified; and a feed that failed with nothing cached returned `unknown-agency` for BART. Both now report `unverified` with the reason, and the board and the status share one decision (`liveArrivalState`). BART is now fetched over HTTPS.

## Search ranking and campus location (October 18, 2026)

60 real searches compared before and after (top three results each). Four first results changed, all improvements; none got worse:

| Search | Before | After |
|---|---|---|
| berkeley | Berkeley City Club (a hotel) | Berkeley (the city), then the University of California, Berkeley |
| san jose airport | San Jose Airport Sign Shop | San José Mineta International Airport |
| ucsf | UCSF Mount Zion Campus | University of California, San Francisco |
| embarcadero | Embarcadero Center 1 | Embarcadero station |

"uc berkeley", "stanford", "stanford university", "san jose state", "sfo" and the addresses kept their first result. Cause: a one-word query got the exact-match bonus when the word appeared anywhere in a place's alternate names, which is meant for codes such as "SFO". It now does so only when the word is not already in the main name, and universities, colleges, airports and stadiums get a small boost when the word is in their name.

UC Berkeley's location: OSM's campus outline includes the Berkeley Hills, so its center was 1.8 km east of central campus and inside the Oakland boundary. Fixed in `8e293e9` (committed to this branch by the frontend session): `config/place-anchors.json` places the campus at the Campanile (Sather Tower), and those coordinates match the OSM feature `w24024507` in the installed index exactly. UC Berkeley → Ferry Building went from 83 minutes (a 1.2-mile walk from the hills, AC Transit, BART) to 62 minutes (walk 1.1 km to Downtown Berkeley BART, BART Red-S), with directions starting on Campanile Way.

Walking and driving wording: a survey of every instruction from 30 real trips found "onto the link" (OSM's word for a highway ramp) 30 times; it now says "the ramp". Open areas are "across", underpasses and corridors "through".

Drive cap: the scenario checks now fail any drive longer than 20 minutes. A park-and-ride trip from Santa Teresa (south San Jose) to Salesforce Tower drove 15.6 km to Tamien Caltrain and passed.
