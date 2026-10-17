# Frontend use of the backend API

Updated October 17, 2026. The authoritative contract is `docs/API_CONTRACT.md` on the backend branch (`claude-development`, commit `41849f9`). This file records how the frontend on `claude-frontend` uses it, and what the frontend asks the backend to change.

The earlier `POST /api/journeys` proposal is withdrawn. The frontend now uses the backend's real endpoints.

## Endpoints the frontend calls

| Endpoint | Used for | Frontend code |
|---|---|---|
| `GET /api/v2/realtime` | Live vehicles, alerts, per-agency quality gate, feed ages. Polled every 60 seconds while the tab is visible. | `loadRealtime`, `liveVehicles`, `coverage`, `activeAlerts` |
| `GET /api/v2/arrivals?agency=&stop=` | Departures on stop pages, and the next departure on nearby and saved rows. Cached for 25 seconds per stop. | `fetchArrivals`, `viewStop`, `placeRow` |
| `GET /api/v2/plan/status` | Shows an offline notice and removes the Find routes button when routing is down. | `fetchPlanStatus`, `planNoticeHtml` |
| `GET /api/v2/plan` | Trip results, timeline, and step-by-step navigation. | `submitPlan`, `normalizeItinerary`, `viewResults`, `buildSteps` |
| `GET /api/realtime` | Fallback only, when `/api/v2/realtime` returns 404 (an older server). | `loadRealtime` |

Origin and destination search uses the browser's copy of `network.json` for instant results, and sends the station's coordinates (the parent station when one exists). Riders can also choose any point on the map, or right-click the map on desktop.

## How the frontend follows the display rules

- Times are shown from `start.estimated` when present, otherwise `start.scheduled`, and are labeled "Scheduled" unless the leg is real time.
- `staySeated: true` is shown as "Stay on board. It continues as ..." and is not counted or drawn as a transfer.
- `canceled` legs and `hasCancellation` itineraries are labeled in the canceled color.
- Leg `alerts` are shown under the leg in the timeline and on the navigation step.
- An empty `itineraries` list shows `errors[0].message`.
- `400` responses highlight the field named in `field` (origin, destination, or time) with plain-language text. `503` shows the offline notice. Other failures show a retry message. No trip is ever fabricated.
- Arrivals with status `unverified` show "Live arrivals are unavailable right now" instead of an empty board. `canceled` entries are listed separately as "Canceled" or "Not stopping here". `stale` arrivals show their age and "Live times may be out of date."
- Vehicles are drawn only when `routeId` is not null. BART never has vehicles.

## Requests for the backend

1. **Several stops in one arrivals call.** Same-named stops on opposite sides of a street (for example both Muni platforms at "Market St & Sansome St") are one place in the interface. The frontend currently makes up to four `/api/v2/arrivals` calls for one place. Accepting `stop=15689,15690` would make that one call.
2. **Alert entity IDs.** 511 alerts keep prefixed IDs (`SF:38R`) while BART alerts use static IDs. The frontend handles both, but static IDs plus `agency` on every entity would be simpler and less fragile.
3. **Fonts.** `lib/app.mjs` has no MIME type for `.woff2`. The self-hosted font in `public/fonts/` is served as `application/octet-stream`. Browsers accept this, but please add `'.woff2': 'font/woff2'`.
4. **Route type bug, still present.** `scripts/build-data.mjs` writes `type:+r.route_type||3`, which turns route type `0` (light rail) into `3` (bus). Muni Metro and VTA light rail are typed as buses in `network.json`. Please change it to treat `0` as a valid value and rebuild the data. Until then, `app.js` classifies those lines explicitly (`RAIL_ROUTE_IDS`).
