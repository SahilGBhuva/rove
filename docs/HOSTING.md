# Hosting Rove (research only; nothing is deployed)

Researched in October 2026. Prices and limits change; recheck them before buying anything.

## What has to run

| Part | Size and behavior | Hosting need |
|---|---|---|
| OpenTripPlanner 2.8.1 | Graph about 290 MB on disk (plus a 200 MB street graph used only for rebuilds), loads in 30 to 60 s, needs a 5 GB Java heap (about 6 to 7 GB of RAM in total) | A long-running process with 8 GB of RAM. It cannot start per request. |
| Rove API (`server.mjs`) | Node 22; holds the GTFS static index (about 1.5 s to load) and the realtime cache in memory | A long-running process next to OTP |
| Place index | SQLite FTS5, about 220 MB, read-only | A local disk |
| Schedules (GTFS) | Five agency zips; must be refreshed at least monthly and the graph rebuilt (about 6 minutes, 6 GB of RAM) | A scheduled job |
| 511 key | One secret, server-side only | The host's secret store |
| Realtime | 511 allows a limited number of requests per hour; every API instance polling separately multiplies them | One poller, or a shared cache |

## Recommendation

**One persistent machine runs the routing service; Vercel can serve the frontend.**

1. **Routing service: one VM or container with 8 GB of RAM and a persistent disk** running OTP, the Rove API and the SQLite index together, exactly as `npm run rove` runs them locally. OTP stays on `127.0.0.1`; only the Rove API is exposed, behind HTTPS.
   - Fly.io: a `shared-cpu-4x` with 8 GB costs about $51 a month in US East from Fly's published per-second rates (about 1.2 times that in San Jose), plus $0.15 per GB-month for a volume. A `performance-1x` with 8 GB is about $69.
   - Comparable choices: Render or Railway (an 8 GB instance with a persistent disk), or a plain VM (Hetzner, DigitalOcean, AWS Lightsail or EC2) with Docker or systemd.
   - Put it in or near the Bay Area (Fly `sjc`, AWS `us-west-1`) to keep latency low.
2. **Frontend: Vercel (or any static host).** The static files and light API routes that only proxy to the routing service fit Vercel well. Set `ROVE_CORS_ORIGINS` on the routing service to the frontend's origin.
3. **Secrets:** the 511 key goes in the host's secret store (`fly secrets set`, Render or Vercel environment variables), never in the repository or the image. `.env` stays local.
4. **Schedule refresh:** a weekly job that runs `npm run refresh-data`, `npm run otp:setup` and `npm run otp:build` on a temporary machine (the build needs about 6 GB), checks the new graph with `npm run verify-routing`, and only then swaps it in and restarts OTP. A failed build keeps the old graph.
5. **Realtime cache:** with one API instance the in-memory cache is enough. If the API is ever scaled to several instances, move the 511 and BART polling into one worker that writes to a shared cache (Redis, for example Upstash or Fly's Redis) and have the API instances read from it, so the 511 request budget is not multiplied.
6. **Health checks:** `GET /api/v2/status` for the load balancer; alert when `routing.available` is false or an agency drops to `unverified`.

## Why not run the routing service on Vercel

From Vercel's published function limits (updated August 2026):

- Memory tops out at 2 GB on Hobby and 4 GB on Pro. OTP needs a 5 GB heap.
- Functions start per request and stop after at most 300 s (Hobby) or 800 s (Pro). OTP takes 30 to 60 s just to load the graph, so every cold start would time out or be unusably slow.
- The standard bundle limit is 250 MB uncompressed (5 GB in the large-functions beta); the graph, the Java runtime and the place index together exceed the standard limit.
- In-memory realtime state is not shared between function instances, so each one would poll 511 separately.

Vercel is a good fit for the frontend and for thin API routes; it is the wrong place for OTP.

## Not done

Nothing has been deployed, bought or configured. Choosing a provider and adding a Dockerfile are next steps that need approval.

Sources: [Vercel Functions limits](https://vercel.com/docs/functions/limitations), [Fly.io resource pricing](https://docs.fly.io/about/pricing).
