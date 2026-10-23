#!/usr/bin/env node
// Benchmark the schedule-only planner (/api/v2/plan) on representative Bay Area queries.
//   node scripts/bench-routing.mjs            cold (fresh process per query) + warm (in process)
//   node scripts/bench-routing.mjs --warm     warm only
//   PLANNER=/abs/path/experimental-plan.mjs node scripts/bench-routing.mjs   benchmark another build
// Dates are fixed inside the bundled timetable window (public/data/schedule, 2026-10-19..27).
// "Cold" includes reading and gunzipping two timetable days and building the per-day indexes.
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const PLANNER = process.env.PLANNER || fileURLToPath(new URL('../api/v2/experimental-plan.mjs', import.meta.url));
export const QUERIES = [
  ['Sunnyvale -> Chase Center 00:24', 37.3784, -122.0308, 37.7680, -122.3877, '2026-10-23T00:24:00-07:00'],
  ['Sunnyvale -> Chase Center 08:15', 37.3715, -122.0375, 37.7680, -122.3877, '2026-10-23T08:15:00-07:00'],
  ['Sunnyvale -> UC Berkeley', 37.3784, -122.0308, 37.8719, -122.2585, '2026-10-23T08:15:00-07:00'],
  ['Powell -> Oakland 19th', 37.78461, -122.40734, 37.79740, -122.26510, '2026-10-20T08:15:00-07:00'],
  ['Castro -> Ferry Building', 37.7622, -122.4350, 37.7930, -122.3965, '2026-10-20T08:15:00-07:00'],
  ['San Jose -> Milpitas', 37.3361, -121.8906, 37.4087, -121.9541, '2026-10-20T08:15:00-07:00'],
  ['Fruitvale -> Alameda', 37.7570, -122.2530, 37.7748, -122.2242, '2026-10-20T08:15:00-07:00'],
  ['4th & King -> Palo Alto', 37.7765, -122.3943, 37.4434, -122.1650, '2026-10-20T08:15:00-07:00'],
  ['Ocean Beach -> Oakland', 37.7600, -122.5090, 37.79740, -122.26510, '2026-10-20T08:15:00-07:00'],
  ['Fremont -> Berkeley', 37.5575, -121.9765, 37.8710, -122.2730, '2026-10-21T08:15:00-07:00'],
  ['Powell -> Oakland 23:40', 37.78461, -122.40734, 37.79740, -122.26510, '2026-10-21T23:40:00-07:00'],
  ['Sunnyvale -> Berkeley 21:50', 37.36, -122.01, 37.8671, -122.2532, '2026-10-22T21:50:00-07:00'],
  ['Palo Alto -> Mountain View', 37.4432, -122.1644, 37.3945, -122.076, '2026-10-21T08:15:00-07:00'],
  ['Oakland -> Powell Sat', 37.8047, -122.271, 37.78461, -122.40734, '2026-10-24T11:00:00-07:00'],
  ['San Jose -> Sunnyvale Sun', 37.3299, -121.903, 37.372448, -122.031308, '2026-10-25T14:00:00-07:00'],
];
const pct = (values, p) => { const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };

async function runOne(planExperimental, q) {
  const [, fl, fn, tl, tn, time] = q;
  const t0 = performance.now();
  const r = planExperimental({fromLat: fl, fromLon: fn, toLat: tl, toLon: tn, time}, new Date(time));
  return {ms: performance.now() - t0, status: r.status, n: r.body.itineraries?.length ?? 0, gap: Boolean(r.body.routing?.serviceGap)};
}

if (process.argv[2] === '--child') {
  const {planExperimental} = await import(pathToFileURL(PLANNER));
  const r = await runOne(planExperimental, QUERIES[Number(process.argv[3])]);
  process.stdout.write(JSON.stringify(r));
} else {
  const warmOnly = process.argv.includes('--warm');
  console.log('planner:', PLANNER);
  if (!warmOnly) {
    const cold = [];
    for (let i = 0; i < QUERIES.length; i++) {
      const out = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', String(i)], {encoding: 'utf8', env: process.env});
      const r = JSON.parse(out.stdout);
      cold.push(r.ms);
      console.log(`cold ${r.ms.toFixed(0).padStart(6)} ms  status ${r.status} itineraries ${r.n}${r.gap ? ' (service gap)' : ''}  ${QUERIES[i][0]}`);
    }
    console.log(`COLD p50 ${pct(cold, 50).toFixed(0)} ms  p95 ${pct(cold, 95).toFixed(0)} ms`);
  }
  const {planExperimental} = await import(pathToFileURL(PLANNER));
  // Warm = the timetable for that service day is already loaded in this process (the normal case
  // for a warm serverless instance). Each query runs once to fill caches, then 3 measured times.
  const warm = [];
  for (const q of QUERIES) {
    await runOne(planExperimental, q);
    for (let rep = 0; rep < 3; rep++) {
      const r = await runOne(planExperimental, q);
      warm.push(r.ms);
      if (rep === 0) console.log(`warm ${r.ms.toFixed(0).padStart(6)} ms  status ${r.status} itineraries ${r.n}${r.gap ? ' (service gap)' : ''}  ${q[0]}`);
    }
  }
  console.log(`WARM p50 ${pct(warm, 50).toFixed(0)} ms  p95 ${pct(warm, 95).toFixed(0)} ms  (${warm.length} runs)`);
}
