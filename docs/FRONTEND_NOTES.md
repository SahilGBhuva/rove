# Frontend notes (claude-frontend branch)

Updated October 17, 2026.

## What changed

- `index.html`, `styles.css`, and `app.js` were rewritten as one map-first interface: a docked 400 px sidebar on desktop (360 px from 768 to 1279 px) and a draggable bottom sheet with three heights on phones.
- One search field covers lines and stops. The duplicate "Transit layers" panel, the separate search modal, and the 5-card tour were removed.
- Map modes: Standard (OpenFreeMap Positron), Satellite (Esri World Imagery), and Dark (OpenFreeMap Dark). If a basemap style cannot load, the map falls back to a plain background and transit layers still draw.
- Clutter control: BART and Caltrain always draw. Light rail appears from zoom 9.5. Buses appear from zoom 11.5 as thin gray lines. Bus stops appear from zoom 15. Selecting a line fades everything else.
- Preserved: agency filters (now in the Layers control, saved per browser), favorites (same `rove-saved-v2` storage key), live vehicles, live arrivals, alerts, the introduction (finish, skip, and replay), dark mode, and polling that pauses in the background.
- New: Nearby stops with live next departures, a stop page with grouped departures, a line page with a stop diagram, a lines directory, a data sources and credits page, trip planning against `/api/journeys`, and step-by-step navigation.
- All feed text is HTML-escaped before display.
- The font is Atkinson Hyperlegible Next, self-hosted in `public/fonts/` under the SIL Open Font License (`public/fonts/OFL.txt`).

## Requests for the backend session

1. **Route type bug in `scripts/build-data.mjs`:** `type:+r.route_type||3` turns route type `0` (light rail) into `3` (bus). Muni Metro and VTA light rail are therefore typed as buses in `network.json`. The fix is `type:Number.isFinite(+r.route_type)&&r.route_type!==''?+r.route_type:3`, followed by a data rebuild. Until then, `app.js` classifies Muni J, K, L, M, N, T, F and VTA Blue, Green, Orange as rail through an explicit list (`RAIL_ROUTE_IDS`).
2. **`/api/journeys`** is not implemented yet. The frontend shows an honest "not available" message until it exists. See `FRONTEND_ROUTING_API_CONTRACT.md`.
3. **Exact realtime index:** see the "Realtime fields" section of the contract.
4. **Fonts MIME type:** `server.mjs` has no `.woff2` entry, so fonts are served as `application/octet-stream`. Browsers accept this, but adding `'.woff2':'font/woff2'` is cleaner.
5. **Request to `//`:** a request for the path `//` makes `new URL()` throw and returns 500. It should return 404.

## Testing done

Tested with Playwright and Chromium at 320, 375, 390, 430, 768, 1024, and 1440 px widths, against the real `server.mjs` with no 511 key, plus test-only fixtures for live data and journeys (the fixtures are not in this repository). Checked: no horizontal overflow, no text under 13 px outside the map attribution and badges, no touch target under 24 px, no console errors, and that alert text containing `<script>` renders as text. The HTTP boundary still returns 404 for `.env`, `.git/config`, `server.mjs`, and `scripts/configure-511-key.sh`.

Not yet tested: real basemap tiles (blocked in the test environment), a real 511 key, and a physical phone.

## Open item

Esri World Imagery terms need review before any public launch.
