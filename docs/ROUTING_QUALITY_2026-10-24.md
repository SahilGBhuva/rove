# Rove routing quality upgrade — integration handoff

**Workstream:** `chatgpt/rove-routing-quality-20261024` (backend-only, isolated from Claude's UI redesign)

## Implemented

1. **Faster stop searches:** Multi-destination connection scanning replaces repeated scans for every boarding/exit pair. Cache combined GTFS service days and transfer footpaths in warm serverless processes.
2. **Transfer-aware routing:** Search both earliest-arrival and a second transfer-penalized profile; prioritize simpler itineraries when the time difference is small. Keep the absolute fastest as an alternative.
3. **Accurate modes:** GTFS rail type `2` is `RAIL` (Caltrain), not `BUS`; cable-car type `5` is distinguished from ordinary buses.
4. **Service-day correctness:** Carry the exact scanned GTFS trip index, including duplicate trip IDs across adjacent service days. Calculate real Pacific midnight and 23/25-hour service-day offsets across daylight saving transitions.
5. **Walking transfer safeguards:** Do not rank a verified walking connection that takes longer than the available transfer window ahead of feasible options. Unknown paths remain labeled as unverified; never invent geometry.
6. **External routing efficiency:** Deduplicate concurrent pedestrian-router lookups for shared walking legs.
7. **Regression tests and QA:** New deterministic transfer, time-zone, trip-identity, and geometry tests; reproducible eight-journey Bay Area scenario runner (`node scripts/verify-preview-routing.mjs`).

## Demo examples checked against the Oct 23 schedule

- Haight/Ashbury → Chase Center: first result uses Muni 37 + 22, one transfer, approximately 43 minutes.
- Sunnyvale → downtown Berkeley: first result uses Caltrain → BART at Millbrae, one transfer, approximately 136 minutes; the 127-minute, four-transfer option remains a faster alternative rather than the recommended first choice.
- Powell → Oakland: BART with zero transfers, approximately 16 minutes.

These are **scheduled example results, not live trip predictions**. Durations and service depend on the requested time and date. Warm local algorithm-only checks were approximately 0.5–1.5 seconds for several sample journeys when the machine was not under load; external pedestrian routing can add up to 3.8 seconds. No production latency SLA is established.

## Remaining limitations — do not overclaim

- The Vercel preview is still `EXPERIMENTAL_SCHEDULE_ONLY`; it is **not** the full OTP street/transit router.
- Walking geometry comes from an external OSM/Valhalla demonstration service when available, without guaranteed uptime or accessibility verification. GTFS transfers are initially straight-line estimates and may cross unsafe or inaccessible areas.
- No live delay-aware re-routing, verified elevator/platform accessibility, or native screen-off GPS navigation.
- Stop-to-stop search uses a bounded single-label approximation and does not guarantee a globally optimal multicriteria itinerary for every Bay Area journey.
- Only the published GTFS snapshot dates are supported. Actual device and blind-rider field tests remain necessary.

## Integration

Review and merge the routing branch into the backend only after regression tests pass. Keep the frontend visual workstream separate. Do not overwrite Claude's concurrent local changes in `scripts/demo-readiness.mjs`, `scripts/verify-places.mjs`, or the frontend repo's `server.mjs`.

```bash
npm run check
npm test
node scripts/verify-preview-routing.mjs
```
