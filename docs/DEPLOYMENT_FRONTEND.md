# Frontend notes for a future Vercel preview

Updated October 17, 2026. Nothing has been deployed. The backend session owns server compatibility; this file lists only what the frontend needs.

## What the frontend is

Three static files at the repository root (`index.html`, `app.js`, `styles.css`) plus `public/` (`public/data/network.json` and `public/fonts/`). There is no build step and no framework. All paths are relative, so the site works from any origin.

## What must be true on Vercel

1. **Static files.** Serve `index.html`, `app.js`, `styles.css`, and everything under `public/`. Nothing else in the repository should be public. In particular `.env*`, `server.mjs`, `lib/`, `scripts/`, `data/`, and `docs/` must not be served. With Vercel, put the four public items in an output directory (for example `dist/`) during the build, rather than serving the repository root.
2. **API routes on the same origin.** The browser calls relative URLs: `/api/v2/realtime`, `/api/v2/arrivals`, `/api/v2/plan`, `/api/v2/plan/status`, and, as a fallback only, `/api/realtime`. They must be served from the same origin as the page, either as serverless functions or by a rewrite to the Node server. No CORS configuration is needed if they share the origin.
3. **Caching.** `public/data/network.json` (about 1.6 MB) should be cached, for example `Cache-Control: public, max-age=300, stale-while-revalidate=86400`, and served with compression. `public/fonts/*.woff2` can be cached for a year. `index.html`, `app.js`, and `styles.css` use `?v=11` query strings; raise them on each release, or switch to `no-cache` for those three files.
4. **MIME types.** `.woff2` should be `font/woff2`.
5. **Rate limiting.** The 511 request budget is enforced in the server's memory. Serverless instances do not share memory, so the backend needs a shared cache or a single poller before a public deployment. This is a backend item, listed here because the frontend polls `/api/v2/realtime` every 60 seconds per open tab.

## Third-party hosts the page loads directly

| Host | What | Notes |
|---|---|---|
| `cdn.jsdelivr.net` | MapLibre GL JS 5.6.1 script and stylesheet | Consider self-hosting under `public/vendor/` to remove the dependency. |
| `tiles.openfreemap.org` | Basemap style, vector tiles, and label fonts | Free service without an SLA. Confirm usage terms before a public launch. |
| `services.arcgisonline.com` | Satellite imagery (Satellite mode only) | Esri terms must be reviewed before public use. |
| `api.stadiamaps.com` | Address autocomplete, search, and reverse geocoding | See "Address search licensing" below. Not needed once the backend proxy exists. |
| `photon.komoot.io` | Backup address search | Komoot's public Photon service, free with fair use and no availability guarantee. Fine for a demo; for a public launch rely on Stadia or a backend proxy. Results are OpenStreetMap data (ODbL), attributed under the suggestions. |

## Address search licensing (Stadia Maps)

- **Why Stadia.** Its Pelias geocoder is built for type-ahead, returns addresses, venues, and neighborhoods, and supports browser use without exposing a key. Public OSM Nominatim forbids client-side autocomplete, so it is not used.
- **Account and domain.** Before a preview or launch, create a Stadia account, add the preview and production domains under domain-based authentication, and confirm requests from those origins succeed. Without that, address search shows "Address search is unavailable right now" and riders can still use stops, their location, and the map.
- **Plan.** Stadia's free tier is for non-commercial use. A commercial Rove launch needs a paid plan. Check the current quota against expected traffic, since every typed query after 3 characters can make one request (debounced, cached per session).
- **Storage.** Stadia allows temporary caching on all plans; storing results permanently requires a paid plan with that right. Rove keeps up to 8 recent places and the rider's saved places in that rider's own browser (`rove-recent-places-v1`, `rove-saved-places-v1`). Confirm this counts as temporary storage under the chosen plan, or move to the backend proxy and a plan that allows storage.
- **Attribution.** Shown under every list of address suggestions and in Data sources.

A Content-Security-Policy for the preview would need `script-src 'self' cdn.jsdelivr.net; style-src 'self' cdn.jsdelivr.net 'unsafe-inline'; img-src 'self' data: blob: https://tiles.openfreemap.org https://services.arcgisonline.com; connect-src 'self' https://tiles.openfreemap.org https://services.arcgisonline.com https://api.stadiamaps.com https://photon.komoot.io; worker-src blob:; font-src 'self'`. The inline `style` attributes used for route colors need `'unsafe-inline'` in `style-src`.

## Browser features used

- Geolocation (only after the rider taps a location control, or when permission was already granted).
- Screen Wake Lock during step-by-step navigation, where supported.
- `localStorage` for saved stops, saved and recent places, agency filters, map mode, and the introduction flag. Every access is wrapped so the site works when storage is blocked.

## Preview checklist

1. Open the preview on an iPhone and an Android phone. Check the bottom sheet at all three heights, the safe areas, and the keyboard with search open.
2. Confirm the basemap loads, and that Standard, Satellite, and Dark switch correctly.
3. Confirm `/api/v2/plan/status` reports available. Type two street addresses, tap Find routes, and start navigation.
4. Confirm address suggestions appear on the preview domain (Stadia domain authentication).
5. Confirm `.env`, `server.mjs`, and `/data/` return 404.
