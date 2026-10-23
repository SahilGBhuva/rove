# Rove accessibility implementation and validation — October 22, 2026

## Product scope

Rove is one accessibility-first Bay Area transit web app. The visual map is optional; the primary journey is destination search → real transit itinerary → boarding-stop details → manual boarding confirmation → riding and transfer information → rider-confirmed exit → arrival verification. The web experience is foreground-only and must not be portrayed as independent safety-certified navigation.

## Research-to-feature mapping

| Evidence / requirement | Rove implementation |
|---|---|
| American Foundation for the Blind transportation research: independent transit access is constrained by navigating unfamiliar stops, inconsistent information, and usable interfaces | Nearby GTFS stop directory, route and direction readouts, boarding verification reminders, and recovery screen |
| WCAG 2.2: semantic content, keyboard access, status announcements, focus visibility, sufficient target sizes, reduced motion | Native buttons, heading-based flow, focused help view, 48-pixel-minimum accessible controls, live status messages, and no blank-screen entry animations |
| GTFS Realtime best practices: explicit static identifiers and freshness matter | Route/stop ID matching, source timestamps, freshness gating, no unverified route-name matching, stale predictions rejected |
| Transit GO already provides voice countdowns | Rove emphasizes transparent uncertainty, manual verification, saved journey recovery, and transfer guidance; these are not claims of uniqueness |

Research sources: https://afb.org/research-and-initiatives/research/fact-sheets/transportation ; https://www.w3.org/TR/WCAG22/ ; https://gtfs.org/documentation/realtime/realtime-best-practices/ ; https://help.transitapp.com/article/549-how-to-use-go .

## Verified implementation

- Unified, mobile-first home and trip-planning entry without accessibility-mode switching.
- Stop discovery from the Bay Area schedule database with approximate straight-line distances and stated GPS accuracy limits.
- Route planning from backend itinerary data, including scheduled boarding and exit details.
- Actual local OpenTripPlanner Sunnyvale → Berkeley itinerary with 5 legs and 8 navigation steps tested in a browser at 320, 390, and 1440 pixels; local routing is not equivalent to the deployment's schedule-only engine.
- Rider-confirmed boarding, exit, continuation, and transfer stage transitions; navigation never equates a GPS fix with confirmed boarding.
- Journey snapshot in device localStorage; refresh and continue were browser-tested, with denied GPS permission.
- Journey-help panel with last step, next planned service, location uncertainty, refresh/replan actions.
- Destination-stop GPS proximity advisory; only an estimate, never obstacle or crossing detection.
- Intermediate stop counting only when an explicit, usable stop sequence is supplied; otherwise Rove states that stop count is unavailable. GPS stop progress requires repeated good-quality readings and is explicitly an estimate.
- Muni and AC Transit exact-identifier departure monitoring when fresh backend predictions exist; all other agencies fall back to scheduled or unknown, not invented live ETAs.
- Optional map on mobile, explicitly opened and closed; not required for primary route interaction.
- Automated unit and browser tests, including small viewport, mobile map, full walkthrough, and journey restoration.

## Transit data audit

| Source | Status | Important limitation |
|---|---|---|
| GTFS static schedules for BART, Muni, VTA, AC Transit, Caltrain | Stop and route directories plus itinerary inputs present | Route geometry or exact indoor boarding location does not establish accessible pedestrian paths |
| Production trip planner | Schedule-only experimental engine | Route times are scheduled, not vehicle-matched; availability depends on provider and date |
| Muni / AC Transit real-time TripUpdates | Exact-match arrivals endpoint functioning at sampled real stops | Not every stop/route has a prediction; feed may be unavailable or stale; trip headsign is not independently verified by this endpoint |
| BART / VTA / Caltrain real-time arrival predictions | Not independently verified in this deployment | App must never label planned arrivals as live or assert exact approaching vehicle |
| Real-time vehicle positions | Available from configured 511 service where the feed provides valid matches | Vehicle positions are not proof of boarding or precise curb-side vehicle identification |

GTFS-Realtime freshness follows a conservative feed-age cutoff of ~110 seconds. Backend caching and per-agency restrictions are intended to limit feed requests.

## Remaining limitations and required field tests

- No field test with blind transit riders yet. No verified real-device VoiceOver or TalkBack test, and no claim of WCAG 2.2 AA certification.
- Browser background tracking, spoken directions while locked, and screen-off alerts are not reliable on all mobile platforms.
- No validated obstacle detection, curb-edge detection, platform identification, crossing safety, indoor wayfinding, or automatic identification of which vehicle the rider physically boards.
- Production's schedule-only routing results often lack full intermediate-stop sequences. Rove states this and uses rider-controlled checks.
- No guaranteed offline shell after browser refresh; locally saved trip instructions do not make the web app fully offline.
- Accessibility alerts for elevators and stations need integration against verified agency sources before claims are made.

## Three-minute Congressional App Challenge demonstration

This is a *software interaction demonstration*, not a real-world blind-rider safety validation.

**0:00–0:30 — Problem and home:** Explain why reaching the correct transit service and knowing when to exit can be stressful without a visual map. Open Rove at phone width. Choose Plan a trip.

**0:30–1:10 — Real itinerary:** Use actual Bay Area origin and destination (for a reproducible example, Sunnyvale → Downtown Berkeley on Friday October 23, 2026, morning, subject to service calendar). Identify scheduled versus live sources, route, direction, boarding stop, and transfer.

**1:10–1:55 — Continuous journey:** Start guidance. Demonstrate spoken repeat, the explicit I boarded action, the ride step, transfer continuation, and manual confirmation of exiting. If live predictions are unavailable, show the truthful unavailable state.

**1:55–2:30 — Recovery:** Tap Need help?, show the last itinerary step, destination, uncertainty about GPS, and replacement route button only when supported.

**2:30–3:00 — Engineering and limitations:** Briefly show optional map and explain the GTFS/static + selective GTFS-Realtime integrations, manual confirmation state machine, repeat-observation GPS guardrails, and the important need for blind-user field testing.

## Student engineering contribution summary

Rove integrates multi-agency transit schedules into a common interface, adds conservative location tracking and route/stop data matching, manages a persistent journey state across refreshes, supports manual confirmation and recovery at safety-critical transitions, and presents verified versus uncertain information explicitly. Tool-assisted coding must be disclosed accurately under the competition's AI-assistance rules; this document does not substitute for the student's own engineering documentation or real-world user testing.
