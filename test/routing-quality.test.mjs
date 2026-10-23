// Routing-quality regression matrix for the schedule-only planner behind /api/v2/plan.
//
// IMPORTANT: every scenario here depends on the bundled GTFS timetables in
// public/data/schedule/2026-10-19.json.gz .. 2026-10-27.json.gz. All dates are fixed inside
// that window so the results are deterministic. When the timetables are regenerated for a new
// window, move these dates (and re-check the expected agencies) together with the data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {planExperimental} from '../api/v2/experimental-plan.mjs';
import {findJourney, forwardRounds, latestDeparture, directFootpaths, reverseFootpaths}
  from '../experiments/bay-router/route.mjs';
import {revisitsEarlierStations, dominates, paretoFilter, rankItineraries} from '../experiments/bay-router/rank.mjs';

// ---- Synthetic networks: pin the algorithmic root cause and the transfer rules without data. ----
// Sunnyvale SB/NB platforms (0,1), Tamien SB/NB platforms (2,3), San Francisco (4).
const mini = {
  date: '2026-10-23',
  stops: [['c:sun-sb', 'Sunnyvale SB', 37.3784, -122.0308], ['c:sun-nb', 'Sunnyvale NB', 37.3786, -122.0308],
    ['c:tam-sb', 'Tamien SB', 37.3112, -121.8828], ['c:tam-nb', 'Tamien NB', 37.3114, -121.8828], ['c:sf', 'San Francisco', 37.7765, -122.3943]],
  trips: [['caltrain', 'south-1', 'L', 'Local', 'Tamien', '2'], ['caltrain', 'north-1', 'L', 'Local', 'San Francisco', '2']],
  connections: [[0, 2, 3900, 5100, 0, 3], [3, 1, 16600, 17880, 1, 3], [1, 4, 17900, 21300, 1, 3]],
};
const miniFoot = directFootpaths(mini.stops, 260, 12);

test('root cause: plain earliest-arrival CSA boards the northbound train at Tamien after riding south', () => {
  const old = findJourney(mini, 0, 4, 1500, {footpaths: miniFoot, maxSeconds: 8 * 3600});
  // Same 21300 arrival either way, so a single earliest-arrival label cannot prefer the direct train.
  assert.equal(old.arrivalSeconds, 21300);
  assert.deepEqual(old.legs.filter(l => l.type === 'transit').map(l => l.tripId), ['south-1', 'north-1']);
});

test('fix: transfer-bounded search + latest departure boards the same train at Sunnyvale', () => {
  const seeds = [{index: 0, accessSeconds: 60}, {index: 1, accessSeconds: 70}], targets = [{index: 4, egressSeconds: 0}];
  const front = forwardRounds(mini, seeds, targets, 1500, {footpaths: miniFoot});
  assert.deepEqual(front, [{rides: 1, doorArrival: 21300}]);
  const j = latestDeparture(mini, seeds, targets, 21300, 1500, {incomingFootpaths: reverseFootpaths(miniFoot), maxRides: 1});
  assert.deepEqual(j.legs.map(l => [l.type, l.tripId, l.from]), [['transit', 'north-1', 'c:sun-nb']]);
  assert.equal(j.doorDeparture, 17900 - 60 - 70);
});

test('transfer feasibility: 2 minute minimum at the same stop, walking time plus 2 minutes across stops', () => {
  const stops = [['a:0', 'A0', 37.0, -122.0], ['a:1', 'A1', 37.01, -122.0], ['b:2', 'B2', 37.0109, -122.0], ['x:3', 'End', 37.03, -122.0]];
  const trips = [['a', 't1', 'r', '1', 'A1', '3'], ['b', 'same-too-soon', 'r', '2', 'End', '3'], ['b', 'same-ok', 'r', '3', 'End', '3'],
    ['b', 'cross-too-soon', 'r', '4', 'End', '3'], ['b', 'cross-ok', 'r', '5', 'End', '3']];
  const foot = directFootpaths(stops, 260, 12);
  const walk = foot[1].find(([j]) => j === 2)[1]; // seconds from A1 to B2, includes 45 s overhead
  const run = connections => {
    const data = {stops, trips, connections: connections.sort((x, y) => x[2] - y[2])};
    const seeds = [{index: 0, accessSeconds: 0}], targets = [{index: 3, egressSeconds: 0}];
    const front = forwardRounds(data, seeds, targets, 0, {footpaths: foot});
    if (!front.length) return null;
    const best = front.at(-1);
    return latestDeparture(data, seeds, targets, best.doorArrival, 0, {incomingFootpaths: reverseFootpaths(foot), maxRides: best.rides});
  };
  const ride = [0, 1, 500, 600, 0, 3];
  assert.equal(run([ride, [1, 3, 600 + 60, 900, 1, 3]]), null, '60 s same-stop transfer is refused');
  assert.equal(run([ride, [1, 3, 600 + 120, 900, 2, 3]]).legs.at(-1).tripId, 'same-ok');
  assert.equal(run([ride, [2, 3, 600 + walk + 60, 900, 3, 3]]), null, 'cross-stop transfer without the 2 minute buffer is refused');
  assert.equal(run([ride, [2, 3, 600 + walk + 120, 900, 4, 3]]).legs.at(-1).tripId, 'cross-ok');
  // First boarding needs the walk to the stop plus a 60 s margin.
  const data = {stops, trips, connections: [[0, 3, 50, 900, 0, 3]]};
  assert.equal(forwardRounds(data, [{index: 0, accessSeconds: 0}], [{index: 3, egressSeconds: 0}], 0, {footpaths: foot}).length, 0);
});

test('detour detection: a later vehicle passing back through earlier stations', () => {
  const p = (lat, lon) => ({lat, lon});
  const sunnyvale = p(37.3784, -122.0308), santaClara = p(37.3531, -121.9366), diridon = p(37.3297, -121.9025), tamien = p(37.3112, -121.8828);
  assert.equal(revisitsEarlierStations([[sunnyvale, santaClara, diridon, tamien], [tamien, diridon, santaClara, sunnyvale, p(37.7765, -122.3943)]]), true);
  assert.equal(revisitsEarlierStations([[sunnyvale, p(37.4, -122.1), p(37.6, -122.39)], [p(37.6002, -122.3902), p(37.7, -122.4)]]), false);
});

test('Pareto dominance drops an option that is no better on any criterion', () => {
  const base = {start: '2026-10-23T08:00:00Z', legs: [{transit: true, agency: {id: 'x'}, route: {id: 'r'}, trip: {id: 'a'}}]};
  const A = {...base, end: '2026-10-23T09:00:00Z', transfers: 0, walkMeters: 200, initialWaitSeconds: 60, transferWaitSeconds: 0, longestWaitSeconds: 60};
  const B = {...A, legs: [{...base.legs[0], trip: {id: 'b'}}], end: '2026-10-23T09:10:00Z', longestWaitSeconds: 3 * 3600};
  const C = {...A, legs: [{...base.legs[0], trip: {id: 'c'}}], end: '2026-10-23T08:50:00Z', transfers: 2};
  assert.ok(dominates(A, B) && !dominates(A, C) && !dominates(C, A));
  assert.deepEqual(paretoFilter([A, B, C]), [A, C]);
  assert.ok(!rankItineraries([A, B, C], 3).includes(B));
  const detour = {...A, legs: [{...base.legs[0], trip: {id: 'd'}}], end: '2026-10-23T08:30:00Z', detour: true};
  assert.ok(!rankItineraries([A, detour], 3).includes(detour), 'detours are dropped when a non-detour exists');
});

const MIN = 60_000;
const at = iso => ({time: iso, now: new Date(iso)});
const P = {
  sunnyvaleCaltrain: [37.3784, -122.0308],
  sunnyvaleHome: [37.3715, -122.0375],
  chaseCenter: [37.7680, -122.3877],
  ucBerkeley: [37.8719, -122.2585],
  powell: [37.78461, -122.40734],
  oakland19th: [37.79740, -122.26510],
  castro: [37.7622, -122.4350],
  ferryBuilding: [37.7930, -122.3965],
  sanJoseDowntown: [37.3361, -121.8906],
  milpitas: [37.4087, -121.9541],
  fruitvale: [37.7570, -122.2530],
  alameda: [37.7748, -122.2242],
  fourthKing: [37.7765, -122.3943],
  paloAlto: [37.4434, -122.1650],
  ashby: [37.8530, -122.2700],
  oaklandAirport: [37.7126, -122.2197],
};
function plan(from, to, iso, extra = {}) {
  const {time, now} = at(iso);
  return planExperimental({fromLat: from[0], fromLon: from[1], toLat: to[0], toLon: to[1], time, ...extra}, now);
}
const transitLegs = it => it.legs.filter(l => l.transit);
const agencies = it => transitLegs(it).map(l => l.agency.id);
const ms = s => Date.parse(s);
const dist = (a, b) => Math.hypot((a.lat - b.lat) * 111200, (a.lon - b.lon) * 111200 * Math.cos(a.lat * Math.PI / 180));

// Invariants that must hold for EVERY itinerary the planner returns.
function assertSaneItinerary(it, requestIso, label) {
  const request = ms(requestIso);
  assert.ok(it.legs.length, `${label}: has legs`);
  assert.ok(transitLegs(it).length, `${label}: has a transit leg`);
  assert.equal(it.start, it.legs[0].start.scheduled, `${label}: start is first leg start`);
  assert.equal(it.end, it.legs.at(-1).end.scheduled, `${label}: end is last leg end`);
  assert.ok(ms(it.start) >= request - 1000, `${label}: never leaves before the requested time`);
  let previousEnd = -Infinity, previousTransit = null;
  for (const [i, leg] of it.legs.entries()) {
    const s = ms(leg.start.scheduled), e = ms(leg.end.scheduled);
    assert.ok(e >= s, `${label}: leg ${i} ends after it starts`);
    assert.ok(s >= previousEnd - 1000, `${label}: leg ${i} starts after the previous leg ends`);
    if (leg.transit) {
      assert.ok(leg.agency?.id && leg.route?.shortName !== undefined && leg.trip?.id, `${label}: transit leg ${i} identifies agency/route/trip`);
      assert.ok(leg.from?.stop?.id && leg.to?.stop?.id, `${label}: transit leg ${i} has stop ids`);
      assert.ok(Number.isFinite(leg.from.lat) && Number.isFinite(leg.to.lon), `${label}: transit leg ${i} has coordinates`);
      assert.equal(leg.realtime, false, `${label}: schedule-only legs never claim realtime`);
      if (previousTransit) {
        const gap = (s - ms(previousTransit.end.scheduled)) / 1000;
        const sameStop = previousTransit.to.stop.id === leg.from.stop.id;
        // No zero-second transfers; a cross-stop transfer also needs walking time.
        assert.ok(gap >= 120, `${label}: transfer before leg ${i} has at least a 2 minute buffer (got ${gap}s)`);
        if (!sameStop) assert.ok(gap >= 120 + dist(previousTransit.to, leg.from) / 1.2 - 1, `${label}: cross-stop transfer before leg ${i} allows walking time`);
      }
      previousTransit = leg;
    } else {
      assert.equal(leg.approximate, true, `${label}: walking leg ${i} is marked approximate`);
      assert.ok(Number.isFinite(leg.distanceMeters), `${label}: walking leg ${i} has a distance`);
    }
    previousEnd = e;
  }
  // No stop is boarded or alighted twice.
  const boardings = transitLegs(it).map(l => l.from.stop.id), alightings = transitLegs(it).map(l => l.to.stop.id);
  assert.equal(new Set(boardings).size, boardings.length, `${label}: no stop boarded twice`);
  assert.equal(new Set(alightings).size, alightings.length, `${label}: no stop alighted twice`);
  assert.ok(!boardings.some((b, i) => alightings.slice(i).includes(b)), `${label}: never returns to a stop it already left`);
  assert.ok(it.durationSeconds > 0 && it.durationSeconds <= 5 * 3600, `${label}: total duration is sane (${it.durationSeconds}s)`);
  assert.equal(it.durationSeconds, Math.round((ms(it.end) - ms(it.start)) / 1000), `${label}: duration matches start/end`);
  assert.ok(Array.isArray(it.warnings), `${label}: warnings array present`);
  assert.equal(it.transfers, Math.max(0, transitLegs(it).length - 1), `${label}: transfers count`);
}
function assertAllSane(body, iso, label) {
  for (const [i, it] of body.itineraries.entries()) assertSaneItinerary(it, iso, `${label} #${i}`);
}
// A journey that rides one way and then comes back through the same corridor.
function reverses(it) {
  const t = transitLegs(it);
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], b = t[i];
    // The second leg ends closer to where the first leg started than to where the first ended.
    if (a.agency.id === b.agency.id && dist(b.to, a.from) < dist(b.to, a.to) && dist(a.from, a.to) > 3000 &&
        dist(b.from, a.to) < 500) return true;
  }
  return false;
}

test('P0: Sunnyvale to Chase Center at 00:24 never rides south and reverses or waits hours', () => {
  const iso = '2026-10-23T00:24:00-07:00';
  for (const origin of [P.sunnyvaleCaltrain, P.sunnyvaleHome]) {
    const r = plan(origin, P.chaseCenter, iso);
    assert.equal(r.status, 200);
    const body = r.body;
    for (const it of body.itineraries) {
      assert.ok(!reverses(it), 'no south-then-north reversal');
      assert.ok(!transitLegs(it).some(l => /tamien|san jose|diridon|santa clara|college park/i.test(l.to.name)),
        'never rides away from San Francisco to a station south of Sunnyvale');
      assert.ok((it.longestWaitSeconds ?? 0) < 60 * 60, 'no multi-hour transfer wait');
      assert.ok(ms(it.start) - ms(iso) <= 90 * MIN, 'no recommendation that starts hours later');
    }
    assertAllSane(body, iso, 'P0');
    // Nothing practical runs at this hour: be honest instead of recommending a 5 hour trip.
    assert.equal(body.itineraries.length, 0, 'no normal "leave now" recommendation');
    assert.equal(body.errors[0].code, 'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW');
    assert.ok(body.routing.serviceGap, 'machine-readable service gap');
    const gap = body.routing.serviceGap;
    assert.equal(gap.reason, 'NO_PRACTICAL_SERVICE_NEAR_REQUESTED_TIME');
    assert.ok(ms(gap.nextPracticalDeparture) > ms(iso) + 2 * 3600 * 1000, 'next departure is a real later trip');
    // The later option it points to must exist in the timetable and go north, not via Tamien.
    assert.ok(Array.isArray(body.laterItineraries) && body.laterItineraries.length);
    const later = body.laterItineraries[0];
    assert.equal(later.start, gap.nextPracticalDeparture);
    assert.ok(later.warnings.includes('DEPARTS_MUCH_LATER'));
    assert.equal(agencies(later)[0], 'caltrain');
    assert.match(transitLegs(later)[0].from.name, /Sunnyvale/);
    assert.match(transitLegs(later)[0].headsign, /San Francisco/i);
    assert.ok(later.durationSeconds < 2 * 3600, 'the later option is a direct trip, not a 5 hour detour');
    assertSaneItinerary(later, iso, 'P0 later');
    assert.ok(body.routing.notes.some(n => /no practical/i.test(n)));
  }
});

const ok = (r, label) => { assert.equal(r.status, 200, `${label}: HTTP 200`); assert.ok(r.body.itineraries.length, `${label}: has itineraries`); return r.body; };
const only = (it, agency) => agencies(it).length > 0 && agencies(it).every(a => a === agency);

test('Sunnyvale to Chase Center at 08:15 is a direct northbound Caltrain-based trip under 2 hours', () => {
  const iso = '2026-10-23T08:15:00-07:00';
  for (const origin of [P.sunnyvaleCaltrain, P.sunnyvaleHome]) {
    const body = ok(plan(origin, P.chaseCenter, iso), 'Sunnyvale 08:15');
    assertAllSane(body, iso, 'Sunnyvale 08:15');
    const top = body.itineraries[0];
    assert.equal(agencies(top)[0], 'caltrain');
    assert.match(transitLegs(top)[0].from.name, /Sunnyvale/);
    assert.match(transitLegs(top)[0].headsign, /San Francisco/i, 'boards northbound first');
    assert.ok(top.durationSeconds < 2 * 3600);
    assert.ok(ms(top.start) - ms(iso) <= 30 * MIN, 'leaves soon after the requested time');
    assert.ok(body.itineraries.every(it => !reverses(it) && !it.detour));
    assert.equal(body.routing.serviceGap, undefined);
    assert.deepEqual(body.errors, []);
  }
});

test('Caltrain + Muni: Sunnyvale to Chase Center offers a Caltrain then Muni connection', () => {
  const iso = '2026-10-23T08:15:00-07:00';
  const body = ok(plan(P.sunnyvaleHome, P.chaseCenter, iso), 'Caltrain+Muni');
  assert.ok(body.itineraries.some(it => agencies(it).join() === 'caltrain,muni'), 'a Caltrain then Muni option is offered');
});

test('Sunnyvale to UC Berkeley finds a sane multi-agency trip without reversals', () => {
  const iso = '2026-10-23T08:15:00-07:00';
  const body = ok(plan(P.sunnyvaleCaltrain, P.ucBerkeley, iso), 'Sunnyvale-Berkeley');
  assertAllSane(body, iso, 'Sunnyvale-Berkeley');
  assert.ok(body.itineraries[0].durationSeconds < 2.5 * 3600);
  assert.ok(body.itineraries.every(it => !reverses(it) && !it.detour));
  assert.ok(body.itineraries.some(it => agencies(it).includes('bart')), 'uses BART for the East Bay');
});

test('SF Powell to Oakland: BART-only, no transfer', () => {
  const iso = '2026-10-20T08:15:00-07:00';
  const body = ok(plan(P.powell, P.oakland19th, iso), 'BART');
  assertAllSane(body, iso, 'BART');
  assert.ok(only(body.itineraries[0], 'bart'));
  assert.equal(body.itineraries[0].transfers, 0);
  assert.ok(body.itineraries[0].durationSeconds < 40 * 60);
});

for (const [label, from, to, iso, agency] of [
  ['Muni-only (Castro to Ferry Building)', P.castro, P.ferryBuilding, '2026-10-20T08:15:00-07:00', 'muni'],
  ['VTA-only (downtown San Jose to Milpitas)', P.sanJoseDowntown, P.milpitas, '2026-10-20T08:15:00-07:00', 'vta'],
  ['AC Transit-only (Alameda South Shore to Fruitvale)', P.fruitvale, P.alameda, '2026-10-20T08:15:00-07:00', 'act'],
  ['Caltrain-only (4th & King to Palo Alto)', P.fourthKing, P.paloAlto, '2026-10-20T08:15:00-07:00', 'caltrain'],
]) {
  test(`${label} returns a single-agency option`, () => {
    const body = ok(plan(from, to, iso), label);
    assertAllSane(body, iso, label);
    assert.ok(body.itineraries.some(it => only(it, agency)), `${label}: an all-${agency} itinerary`);
  });
}

test('BART + AC Transit: Embarcadero to the Oakland hills combines both', () => {
  const iso = '2026-10-21T10:00:00-07:00';
  const body = ok(plan(P.ferryBuilding, [37.8247, -122.2105], iso), 'BART+ACT');
  assertAllSane(body, iso, 'BART+ACT');
  assert.ok(body.itineraries.some(it => agencies(it).includes('bart') && agencies(it).includes('act')));
});

test('cross-midnight trip keeps times monotonic across the service-day boundary', () => {
  const iso = '2026-10-21T23:55:00-07:00';
  const body = ok(plan(P.powell, P.ucBerkeley, iso), 'cross-midnight');
  assertAllSane(body, iso, 'cross-midnight');
  const midnight = ms('2026-10-22T00:00:00-07:00');
  assert.ok(body.itineraries.some(it => ms(it.end) > midnight), 'an itinerary finishes after midnight');
  for (const it of body.itineraries) assert.ok(ms(it.end) - ms(iso) < 2 * 3600 * 1000);
});

test('all-night bus after BART closes is offered honestly (no service-gap flag needed)', () => {
  const iso = '2026-10-22T01:30:00-07:00';
  const body = ok(plan(P.powell, P.oakland19th, iso), 'owl');
  assertAllSane(body, iso, 'owl');
  assert.ok(body.itineraries.every(it => it.practical && it.longestWaitSeconds < 3600));
  assert.equal(body.routing.serviceGap, undefined);
});

test('invalid coordinates are rejected with 400', () => {
  const iso = '2026-10-20T08:15:00-07:00', now = new Date(iso);
  for (const q of [
    {toLat: 37.7, toLon: -122.2, time: iso},
    {fromLat: 'abc', fromLon: -122.4, toLat: 37.7, toLon: -122.2, time: iso},
    {fromLat: 40.7, fromLon: -74.0, toLat: 37.7, toLon: -122.2, time: iso},
    {fromLat: 37.78, fromLon: -122.4, toLat: 37.7, toLon: 'Infinity', time: iso},
  ]) assert.equal(planExperimental(q, now).status, 400, JSON.stringify(q));
});

test('a day without a bundled timetable fails closed with 503', () => {
  // 2026-10-28 is outside the bundled window; 00:30 on 2026-10-19 would also need 2026-10-18.
  for (const iso of ['2026-10-28T08:15:00-07:00', '2026-10-19T00:30:00-07:00']) {
    const r = plan(P.powell, P.oakland19th, iso);
    assert.equal(r.status, 503, iso);
    assert.match(r.body.error, /timetable unavailable/i);
  }
});

test('a long walking connection is flagged LONG_WALK', () => {
  const iso = '2026-10-21T10:00:00-07:00';
  // Presidio point about 1.15 km (straight line) from the nearest stop.
  const body = ok(plan([37.800, -122.490], P.powell, iso), 'long walk');
  assertAllSane(body, iso, 'long walk');
  const top = body.itineraries[0];
  assert.ok(top.legs[0].distanceMeters > 800);
  assert.ok(top.warnings.includes('LONG_WALK'));
  assert.ok(body.itineraries.every(it => it.walkMeters <= 1500 || it.warnings.includes('LONG_WALK')));
});

test('response contract keeps the fields the frontend reads, plus additive quality fields', () => {
  const iso = '2026-10-23T08:15:00-07:00';
  const body = ok(plan(P.sunnyvaleHome, P.chaseCenter, iso), 'contract');
  assert.equal(body.routing.engine, 'EXPERIMENTAL_SCHEDULE_ONLY');
  assert.equal(body.routing.realtime, 'none');
  assert.ok(Array.isArray(body.routing.notes) && body.routing.notes.length);
  for (const it of body.itineraries) {
    for (const k of ['id', 'start', 'end', 'durationSeconds', 'walkMeters', 'walkSeconds', 'transfers', 'legs',
      'initialWaitSeconds', 'transferWaitSeconds', 'longestWaitSeconds', 'warnings', 'practical', 'generalizedCost'])
      assert.ok(k in it, `itinerary.${k}`);
    for (const l of it.legs) {
      for (const k of ['mode', 'transit', 'from', 'to', 'start', 'end', 'durationSeconds']) assert.ok(k in l, `leg.${k}`);
      assert.ok(l.from.name && Number.isFinite(l.from.lat) && Number.isFinite(l.from.lon));
      if (l.transit) {
        assert.ok(l.agency.id && 'shortName' in l.route && l.headsign && l.trip.id && l.from.stop.id && l.to.stop.id);
        assert.ok(l.start.scheduled && l.end.scheduled);
      } else {
        assert.equal(l.approximate, true);
        assert.ok(Number.isFinite(l.distanceMeters));
      }
    }
  }
});
