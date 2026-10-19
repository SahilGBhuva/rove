# OTP runtime memory test — October 18, 2026

Tested against the existing, unmodified full Bay Area graph (five agencies) with independent OTP processes bound to localhost on alternate ports. The existing 8080 OTP server was not terminated.

| Java maximum heap | Started? | End-to-end routing checks | Notes |
| --- | --- | --- | --- |
| 5g | Existing configuration | Existing working server | Previous default; not a measured minimum |
| 2g | Yes | 11/11 passed | Tested with independent Rove API on 4188 |
| 1536m | Yes | 11/11 passed | Tested with independent Rove API on 4189 |

Source logs (local only, gitignored): `data/reports/otp-memory/`. Java heap allocation is not total system RAM; JVM native memory, OS and Node processes also consume memory. During warm-up the 1536m process had approximately 1.4 GiB RSS. More extensive load/uptime testing is needed before deploying to a small server.

`start-otp.sh` now defaults to a 2g maximum heap; override with `OTP_HEAP=5g npm run otp:start` if necessary. `build-graph.sh` retains its 5g default because graph building has higher peak memory requirements. Existing running Java processes are unaffected until restarted.

Potential deployment optimization: `graph.obj` (~289 MB) is used by `--load`; `streetGraph.obj` (~203 MB) is build-only for the two-stage graph build. Test packaging a runtime bundle without `streetGraph.obj` and OSM input; preserve original local graph inputs for rebuilding. This alone does not make OTP compatible with a stateless Vercel Function: it remains a persistent Java HTTP server.
