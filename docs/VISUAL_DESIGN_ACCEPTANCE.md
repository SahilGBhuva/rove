# Rove visual-design acceptance — October 21, 2026

## Scope
The map-first Bay Area web app on the integrated Rove Node + OpenTripPlanner server.

## Design changes
- Standard, dark, and satellite styles remain available. Satellite imagery is brighter and its reference labels more legible; the selector preview shows actual satellite texture.
- The map has a small Rove identity on phones, without occupying map touch space. Map outage messages take priority over the identity badge.
- The tablet panel no longer floats directly over the middle of the Bay Area map.
- Home includes a compact five-agency color key; saved places, directions, nearby stops, and all lines remain unchanged.
- Planner input focus, route selection, navigation step cards, map controls, accessibility focus styles, and responsive safe-area spacing were refined.
- Expanded itineraries put “Start navigation” before the long list of instructions.
- The app has an SVG favicon and updated light/dark browser theme colors.

## Browser QA
Tested Chrome/Playwright headlessly using the integrated backend:
- 320 x 700 compact phone
- 390 x 844 phone
- 820 x 900 tablet
- 1440 x 900 desktop

For each size:
- Home loaded after the map-style spinner, with no horizontal overflow.
- Standard, Satellite, and Dark styles switched.
- Satellite imagery and reference labels loaded; no map outage banner.
- Map layer panel opened and closed; agency toggles were present.
- Browser page errors and failed network requests were recorded.

Also verified actual input-to-navigation journeys at 390 x 844 and 1440 x 900:
Ferry Building -> UC Berkeley; select address results, set departure time, request routes, expand an itinerary, start navigation, advance one instruction. Geolocation during this test was simulated.

## Automated checks
- Frontend: 30/30 tests, syntax checks, clean git whitespace check.
- Backend integrated demo: 11/11 checks.
- Backend verify-all: 114/114 tests, secret scan, five agencies' live arrivals and realtime matching, 11 schedule routing checks, 26 address and routing checks, 11 schedule scenarios and five live scenarios.
- Public HTTPS tunnel: 11/11 checks; favicon returned HTTP 200.

## Limits / manual verification
- Headless Chrome simulation does not replace touch and GPS checks on an actual iPhone, especially Safari navigation, real off-route movement, gestures, and system location permissions.
- Free ephemeral HTTPS tunnel has no uptime guarantee and needs the local Mac, Node backend, OTP, and cloudflared to remain running.
- Satellite imagery and basemap depend on external tile hosts. Preserve all attributions and recheck imagery licensing before permanent public deployment.
- This QA does not assert a permanent production deployment.
