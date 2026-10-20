# Rove: zero-dollar, no-card deployment decision (October 2026)

## Goal

Judges can open the Rove site and plan a trip when the developer Mac is off, without entering a credit card or incurring charges. Preserve the current working OpenTripPlanner implementation as the local reference; do not switch the public site until a replacement passes real trips.

## Candidate: Transitland Explorer + Vercel

Sources (recheck before signup):
- https://www.transit.land/plans-pricing/
- https://www.transit.land/documentation/routing-platform/transitland-routing-api/
- https://www.transit.land/documentation/routing-platform/

Transitland Explorer lists 1,000 free routing queries/month. Hobbyist/Academic is listed as free *by application* and has a higher quota. **Card-free signup has not been verified**, and no API key or account is available. The free tier must be confirmed in the actual signup flow without entering a card.

The Transitland OTP-compatible endpoint is REST (`/api/v2/routing/otp/plan`) with `fromPlace`, `toPlace`, `date`, `time`, `arriveBy`, `maxItineraries`; it is **not** a drop-in replacement for Rove's OTP 2.8 GraphQL `planConnection` client (`lib/routing/otp.mjs`).

## Compatibility matrix

| Rove feature | Transitland compatibility | Required work |
|---|---|---|
| Scheduled transit and walking | Likely | New REST client, normalized itinerary adapter, compare real Bay Area trips |
| Five agency coverage | Claims US coverage; individual routes unverified | Validate BART, Muni, VTA, Caltrain, AC Transit |
| Arrive by | Documented | Test with Pacific time and DST |
| Transfers | Supported with limitations | Verify transfer walks and time consistency |
| Detailed walking directions | Not returned by transit routing | Separate street-routing call or show map geometry without fabricated steps |
| Realtime delay-aware routing | Not supported in transit routing | Clearly mark scheduled vs live predictions; never imply rerouting around delays |
| Park-and-ride and drop-off | Not supported by transit-only endpoint | Separate street-routing + parking candidate logic; don't promise parity |
| Current stop arrivals and place search | Rove Node API depends on GTFS index, SQLite and live pollers | Port to serverless/static indexes or use additional provider endpoints |
| Public API keys | Requires API key | Vercel server-side env only; add caching and strict rate controls |
| Monthly quota | 1,000 on Explorer | Cache identical searches; avoid background calls; show quota error gracefully |

## Implementation sequence (no public switch until verified)

1. Confirm Explorer registration works without a card and permits competition use; if not, stop.
2. Get key into local `.env` (never Git) and Vercel protected environment settings.
3. Build `TransitlandClient` adapter behind an environment flag, preserving existing OTP client as default.
4. Compare normalized responses for the existing 11 routing scenarios and five agency arrival/transfer checks.
5. Separate supported features from unavailable ones in UI (especially park-and-ride and street maneuvers).
6. Migrate place search and live arrivals from the persistent Node process; verify quotas and credentials.
7. Deploy Vercel serverless API and check HTTPS, error handling, mobile browser, and Mac-off behavior.
8. Only then point the public app at the new API. Keep the local OTP implementation as fallback for recording.

## Immediate fallback

Cloudflare Quick Tunnel exposes the current local Rove server without a card, but the Mac must remain awake and the URL can change. Suitable for demos, **not** a Mac-independent judging submission.

## Non-goals

Do not silently drop driving-to-transit, fake live predictions, expose API keys in browser JavaScript, or sign up for billable resources.
