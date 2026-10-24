// Deterministic subset of the routing stress suite (scripts/stress-routing.mjs).
//
// Real Bay Area places, coordinates from the cached Photon/OpenStreetMap geocodes in
// scripts/stress-geocodes.json (no network), planned with planExperimental against the bundled
// GTFS timetables (public/data/schedule, 2026-10-19..27). When the timetables are regenerated for
// a new window, move BANDS in scripts/stress-routing.mjs together with the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PAIRS, BANDS, loadGeocodes, runOne} from '../scripts/stress-routing.mjs';
import {planExperimental} from '../api/v2/experimental-plan.mjs';

const geocodes = loadGeocodes();
const band = name => BANDS.find(b => b[0] === name);
const pair = (from, to) => {
  const p = PAIRS.find(([f, t]) => f === from && t === to);
  assert.ok(p, `${from} -> ${to} is a stress pair`);
  return p;
};
// Representative: across the bay, Caltrain+Muni, BART+AC Transit, VTA+Caltrain, Peninsula/SFO,
// very long, very short, hills, edges of service and two places outside the bundled agencies.
const DAY = [
  ['sf_ferry', 'brk_sather'], ['sf_mission24', 'oak_fruitvale'], ['oak_city_hall', 'sf_ucsf_mb'],
  ['fre_bart', 'sf_chase'], ['dub_bart', 'sf_4th_king'], ['pa_caltrain', 'sf_castro'],
  ['sv_caltrain', 'sf_chase'], ['mv_google', 'sf_ferry'], ['oak_eastmont', 'brk_sather'],
  ['hay_csueb', 'oak_city_hall'], ['elc_plaza', 'ala_south_shore'], ['sj_diridon', 'mv_google'],
  ['sc_levis', 'sf_4th_king'], ['mil_great_mall', 'pa_caltrain'], ['sj_berryessa', 'brk_sather'],
  ['sfo_intl', 'sf_powell_st'], ['dc_bart', 'sf_ferry'], ['ant_bart', 'pa_caltrain'],
  ['sf_cliff_house', 'fre_bart'], ['sf_union_sq', 'sf_powell_st'], ['sj_diridon', 'sj_sap'],
  ['sf_bayview', 'sf_wash_sq'], ['sf_twin_peaks', 'sf_powell_st'], ['sf_coit', 'mil_station'],
  ['brk_lhs', 'brk_4th'], ['sf_treasure', 'sf_4th_king'],
  ['hmb_main', 'sf_ferry'], ['sf_ferry', 'sausalito'],
].map(([f, t]) => pair(f, t));
const NIGHT = DAY.filter(p => ['across-bay', 'caltrain+muni', 'south-east', 'peninsula', 'sf'].includes(p[2])).slice(0, 8);

const rows = [];
test('stress subset: plan every pair (08:15 all, 22:30 and 00:30 for a night subset)', () => {
  for (const p of DAY) rows.push(runOne(p, band('08:15'), geocodes));
  for (const p of NIGHT) for (const b of ['22:30', '00:30']) rows.push(runOne(p, band(b), geocodes));
  assert.equal(rows.length, DAY.length + 2 * NIGHT.length);
  const cpu = rows.map(r => r.ms).sort((a, b) => a - b);
  console.log(`stress subset: ${rows.length} requests, CPU p50 ${cpu[Math.floor(cpu.length / 2)]} ms, max ${cpu.at(-1)} ms`);
});

test('every returned itinerary satisfies the invariants', () => {
  // Monotonic leg times, never before the request, >= 120 s (+ walking) at every transfer,
  // no stop visited twice, first/last walk anchored at the requested points, boarding and
  // alighting within 2 km of them.
  for (const r of rows) for (const [i, m] of r.itineraries.entries())
    assert.deepEqual(m.violations, [], `${r.from} -> ${r.to} @${r.band} option ${i + 1}`);
});

test('daytime: every covered pair is routed, uncovered places are not', () => {
  for (const r of rows.filter(r => r.band === '08:15')) {
    if (r.category === 'no-coverage') assert.equal(r.count, 0, `${r.from} -> ${r.to} must not invent a route`);
    else assert.ok(r.count > 0, `${r.from} -> ${r.to} @08:15 has no itinerary (${r.failure})`);
  }
});

test('no missed one-seat rides and no top option much slower than one', () => {
  for (const r of rows.filter(r => r.count && r.oneSeat)) {
    const top = r.itineraries[0];
    if (top.transfers > 0)
      assert.ok(top.travelSeconds <= r.oneSeat.travelSeconds + 10 * 60,
        `${r.from} -> ${r.to} @${r.band}: ${top.routes.join(' > ')} arrives ${Math.round((top.travelSeconds - r.oneSeat.travelSeconds) / 60)} min after the direct ${r.oneSeat.route}`);
    assert.ok(!r.issues.includes('MISSED_ONE_SEAT'), `${r.from} -> ${r.to} @${r.band}: ${r.notes.join('; ')}`);
  }
});

test('quality bounds: duration ratio, walking, transfer waits, backtracking', () => {
  const ok = rows.filter(r => r.count && r.category !== 'no-coverage');
  const ratios = ok.map(r => r.ratio).sort((a, b) => a - b);
  assert.ok(ratios[Math.floor(ratios.length / 2)] <= 1.6, `p50 duration ratio ${ratios[Math.floor(ratios.length / 2)]}`);
  for (const r of ok) {
    const top = r.itineraries[0];
    assert.ok(top.longestWalkMeters <= 1800, `${r.from} -> ${r.to} @${r.band}: ${top.longestWalkMeters} m walk`);
    assert.ok(top.longestTransferWaitSeconds < 60 * 60, `${r.from} -> ${r.to} @${r.band}: transfer wait`);
    assert.ok(!top.detour, `${r.from} -> ${r.to} @${r.band}: detour`);
    assert.ok(top.backtrackMeters <= Math.max(3000, r.straightMeters), `${r.from} -> ${r.to} @${r.band}: rides ${top.backtrackMeters} m away`);
    assert.ok(top.initialWaitSeconds <= 90 * 60, `${r.from} -> ${r.to} @${r.band}: leaves too late to be leave-now`);
  }
});

test('night: no route is an honest service gap, never a hidden multi-hour wait', () => {
  for (const r of rows.filter(r => r.band !== '08:15' && !r.count)) {
    assert.equal(r.status, 200);
    assert.equal(r.error, 'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW', `${r.from} -> ${r.to} @${r.band}`);
    if (r.serviceGap) assert.ok(r.later > 0 && r.serviceGap.minutesUntilNextDeparture > 0);
  }
});

const plan = (f, t, iso) => planExperimental({fromLat: geocodes[f].lat, fromLon: geocodes[f].lon,
  toLat: geocodes[t].lat, toLon: geocodes[t].lon, time: iso}, new Date(iso));

test('regression: station entrance nodes no longer hide Embarcadero BART from the Ferry Building', () => {
  // Root cause: GTFS entrances/elevators (no service) took the candidate-stop slots, so the
  // planner rode Muni one stop to reach BART and went via Rockridge.
  const {body} = plan('sf_ferry', 'brk_sather', band('08:15')[1]);
  const top = body.itineraries[0].legs.filter(l => l.transit);
  assert.equal(top[0].agency.id, 'bart', 'first vehicle is BART, walked to from the Ferry Building');
  assert.ok(!body.itineraries.some(it => it.legs.find(l => l.transit)?.agency.id === 'muni' && it.transfers >= 2),
    'no option adds a one-stop Muni hop in front of the same BART trip');
});

test('regression: Coit Tower to Millbrae at 22:30 is routed (route-diverse stops, next-morning window)', () => {
  const {body} = plan('sf_coit', 'mil_station', band('22:30')[1]);
  assert.ok(body.itineraries.length || body.laterItineraries?.length, 'a route or the first later trip is offered');
});

test('very short trips say when walking may be as quick', () => {
  const {body} = plan('sf_union_sq', 'sf_powell_st', band('12:30')[1]);
  assert.ok(body.routing.directWalk && body.routing.directWalk.approximate);
  assert.ok(body.routing.directWalk.straightLineMeters < 400);
  assert.ok(body.itineraries.every(it => it.warnings.includes('WALKING_MAY_BE_FASTER')));
});

test('planning is deterministic', () => {
  const iso = band('17:30')[1];
  assert.deepEqual(plan('sj_diridon', 'oak_city_hall', iso).body, plan('sj_diridon', 'oak_city_hall', iso).body);
});
