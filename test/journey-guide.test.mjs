import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planExperimental } from '../api/v2/experimental-plan.mjs';
import '../site/public/js/journey-guide.js';

const G = globalThis.RoveJourneyGuide;
const MIN = 60000;
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');

/* Mirrors the fields site/app.js normalizeItinerary() gives the guide (checked below). */
function normalize(it) {
  return {
    id: it.id, startTime: it.start, endTime: it.end,
    legs: it.legs.map(leg => ({
      mode: leg.transit ? 'TRANSIT' : leg.mode === 'CAR' ? 'CAR' : 'WALK',
      transitMode: leg.mode, agencyId: leg.agency?.id || null,
      routeName: leg.route?.shortName || leg.route?.longName || null,
      headsign: leg.headsign || leg.trip?.headsign || null, tripShortName: leg.trip?.shortName || null,
      from: leg.from ? { name: leg.from.stop?.station?.name || leg.from.name, platform: leg.from.stop?.platform || null } : null,
      to: leg.to ? { name: leg.to.stop?.station?.name || leg.to.name } : null,
      startTime: leg.start?.estimated || leg.start?.scheduled, endTime: leg.end?.estimated || leg.end?.scheduled,
      delaySeconds: leg.start?.delaySeconds ?? null, realtime: Boolean(leg.realtime && leg.start?.estimated),
      canceled: Boolean(leg.canceled), staySeated: Boolean(leg.staySeated),
      intermediateStops: Array.isArray(leg.intermediateStops) ? leg.intermediateStops : null,
      distanceMeters: leg.distanceMeters ?? null, steps: leg.steps || [], geometry: leg.geometry
    }))
  };
}

const NOW = new Date('2026-10-20T08:15:00-07:00');
function plan(name, [fromLat, fromLon, toLat, toLon], predicate) {
  const { status, body } = planExperimental({ fromLat, fromLon, toLat, toLon, time: NOW.toISOString() }, NOW);
  assert.equal(status, 200, `${name} planner status`);
  const its = body.itineraries.map(normalize);
  const it = its.find(predicate) || its[0];
  assert.ok(it, `${name} itinerary`);
  return it;
}
const transitAgencies = it => it.legs.filter(l => l.mode === 'TRANSIT').map(l => l.agencyId);
const kinds = guide => guide.phases.map(p => p.kind);
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Walk a guide to the end the way a rider would: one explicit confirmation per phase. */
function ride(guide) {
  let s = G.createState(guide, 0);
  const visited = [];
  for (let n = 0; n < 40 && !s.done; n++) {
    visited.push(guide.phases[s.index].kind);
    s = G.reduce(s, { type: 'CONFIRM', phaseIndex: s.index, now: n });
  }
  return { s, visited };
}

test('app normalizeItinerary still provides every field the journey guide reads', () => {
  for (const field of ['transitMode: leg.mode', 'agencyId: leg.agency?.id', 'routeName:', 'headsign:', 'tripShortName:', 'platform: p.stop?.platform', 'realtime:', 'canceled:', 'staySeated:', 'intermediateStops:', 'delaySeconds:']) {
    assert.ok(app.includes(field), `normalizeItinerary missing ${field}`);
  }
});

const JOURNEYS = {
  BART: { coords: [37.78461, -122.40734, 37.79740, -122.26510], agency: 'bart', name: /^BART Blue line$/ },
  // K, L and M all run Castro -> Embarcadero. The 8:16 K is no longer offered to an 8:15 request:
  // the planner now requires a 60 s boarding margin after the walk to the stop (it used to allow 17 s
  // to reach an underground platform), so the next train, an L, is the honest answer.
  Muni: { coords: [37.7622, -122.4350, 37.7930, -122.3965], agency: 'muni', name: /^Muni [KLM] train$/ },
  VTA: { coords: [37.3361, -121.8906, 37.4087, -121.9541], agency: 'vta', name: /^VTA .*Line$/ },
  Caltrain: { coords: [37.7765, -122.3943, 37.4434, -122.1650], agency: 'caltrain', name: /^Caltrain (Express|Limited|Local)/ },
  'AC Transit': { coords: [37.7570, -122.2530, 37.7748, -122.2242], agency: 'act', name: /^AC Transit \d+ bus$/ }
};

for (const [label, j] of Object.entries(JOURNEYS)) {
  test(`${label}: real scheduled journey becomes board, ride, arrive with rider confirmations`, () => {
    const it = plan(label, j.coords, x => transitAgencies(x)[0] === j.agency);
    assert.equal(transitAgencies(it)[0], j.agency);
    const guide = G.buildGuide(it, { destinationName: 'Test destination' });
    const board = guide.phases.find(p => p.kind === 'board');
    assert.match(board.vehicle.name, j.name);
    assert.ok(board.facts.some(f => /^Toward /.test(f)), 'direction stated');
    assert.ok(board.facts.some(f => /Scheduled time, not live/.test(f)), 'schedule-only data is labeled');
    assert.equal(board.live, false);
    if (board.vehicle.noun !== 'bus') assert.ok(board.facts.some(f => /Platform not provided/.test(f)), 'missing platform is said, not invented');
    assert.match(G.speech(board), /choose I've boarded/);
    assert.match(G.speech(board), new RegExp(escape(board.vehicle.check)));
    const { visited } = ride(guide);
    assert.equal(visited.at(-1), 'arrive');
    assert.ok(visited.indexOf('board') < visited.indexOf('ride'), 'boarding precedes riding');
    assert.equal(guide.phases.at(-1).heading, "You've arrived at Test destination");
  });
}

test('Muni N to BART transfer: transfer phase names the next line and connection time', () => {
  const it = plan('transfer', [37.7600, -122.5090, 37.79740, -122.26510], x => transitAgencies(x).join() === 'muni,bart');
  assert.deepEqual(transitAgencies(it), ['muni', 'bart']);
  const guide = G.buildGuide(it);
  const k = kinds(guide);
  assert.deepEqual(k.filter(x => x !== 'walk'), ['board', 'ride', 'transfer', 'board', 'ride', 'arrive']);
  const firstRide = guide.phases[k.indexOf('ride')];
  assert.ok(firstRide.facts.some(f => /^Then transfer to BART/.test(f)), 'ride warns about the coming transfer');
  const transfer = guide.phases[k.indexOf('transfer')];
  assert.match(transfer.heading, /^Transfer to BART/);
  assert.ok(transfer.facts.some(f => /straight-line estimate/.test(f)));
  const secondBoard = guide.phases[k.lastIndexOf('board')];
  assert.equal(secondBoard.isTransfer, true);
  assert.match(G.speech(secondBoard), /^Transfer\. At /);
});

/* ---- Deterministic synthetic itineraries for state rules ---- */
const T0 = Date.parse('2026-10-20T15:00:00Z');
const iso = ms => new Date(ms).toISOString();
const busLeg = (o = {}) => ({ mode: 'TRANSIT', transitMode: 'BUS', agencyId: 'act', routeName: '51A', headsign: 'Fruitvale BART', from: { name: 'College & Ashby' }, to: { name: 'Broadway & 14th' }, startTime: iso(T0 + 5 * MIN), endTime: iso(T0 + 25 * MIN), realtime: false, ...o });
const railLeg = (o = {}) => ({ mode: 'TRANSIT', transitMode: 'SUBWAY', agencyId: 'bart', routeName: 'Yellow-S', headsign: 'SFO / Millbrae', from: { name: '12th Street / Oakland City Center', platform: '2' }, to: { name: 'Montgomery Street' }, startTime: iso(T0 + 28 * MIN), endTime: iso(T0 + 40 * MIN), intermediateStops: [{}, {}, {}], realtime: true, delaySeconds: 120, ...o });
const walk = (o = {}) => ({ mode: 'WALK', distanceMeters: 240, from: { name: 'Start' }, to: { name: 'College & Ashby' }, startTime: iso(T0), endTime: iso(T0 + 4 * MIN), ...o });
const synth = () => ({ legs: [walk(), busLeg(), walk({ distanceMeters: 60, to: { name: '12th Street / Oakland City Center' } }), railLeg(), walk({ distanceMeters: 8, to: { name: 'Destination' } })] });

test('a stale double tap cannot skip the next confirmation', () => {
  const guide = G.buildGuide(synth());
  let s = G.createState(guide, 0);
  s = G.reduce(s, { type: 'CONFIRM', phaseIndex: 0, now: 1 });
  const again = G.reduce(s, { type: 'CONFIRM', phaseIndex: 0, now: 2 });
  assert.equal(again.index, s.index);
});

test('phases advance only on CONFIRM; time, reminders and waiting never advance them', () => {
  const guide = G.buildGuide(synth());
  let s = G.createState(guide, T0);
  for (const type of ['STILL_WAITING', 'REMINDED', 'TICK', 'GPS_NEAR_STOP']) s = G.reduce(s, { type, now: T0 + 60 * MIN, key: 'x' });
  assert.equal(s.index, 0);
});

test('tiny final walk is folded into arrival; real walks are confirmed', () => {
  const guide = G.buildGuide(synth(), { destinationName: 'Ferry Building' });
  assert.deepEqual(kinds(guide), ['walk', 'board', 'ride', 'transfer', 'board', 'ride', 'arrive']);
  assert.equal(guide.phases[0].confirmLabel, "I'm at College & Ashby");
  assert.match(guide.phases[0].facts.join(' '), /Walking path not verified/);
});

test('BACK undoes the last confirmation (accidental tap recovery)', () => {
  const guide = G.buildGuide(synth());
  let s = G.createState(guide, 0);
  s = G.reduce(s, { type: 'CONFIRM', phaseIndex: 0, now: 1 });
  s = G.reduce(s, { type: 'CONFIRM', phaseIndex: 1, now: 2 });
  assert.equal(guide.phases[s.index].kind, 'ride');
  s = G.reduce(s, { type: 'BACK', now: 3 });
  assert.equal(guide.phases[s.index].kind, 'board');
});

test('known platform and live delay are stated; boarding confirmation names the vehicle', () => {
  const guide = G.buildGuide(synth());
  const bart = guide.phases[4];
  assert.equal(bart.kind, 'board');
  assert.ok(bart.facts.includes('Platform 2'));
  assert.match(bart.facts.join(' '), /Live time, about 2 minutes late/);
  assert.equal(bart.confirmAria, "I've boarded BART Yellow line toward SFO / Millbrae");
  assert.match(bart.confirmSpeech, /Rove cannot verify the vehicle/);
  assert.match(G.speech(bart), /Platform 2\./);
});

test('ride reminders: prepare at 3 minutes, next stop at 1, overdue uncertainty, each once', () => {
  const guide = G.buildGuide(synth());
  let s = { ...G.createState(guide, T0), index: 2 }; // AC Transit ride, arrives T0+25
  const at = m => G.dueReminders(s, T0 + m * MIN);
  assert.deepEqual(at(10), []);
  const prep = at(22.5);
  assert.equal(prep.length, 1);
  assert.match(prep[0].message, /Broadway & 14th in about 3 minutes by the schedule\. Get ready to exit\. Press the stop request strip/);
  s = G.reduce(s, { type: 'REMINDED', key: prep[0].key });
  assert.deepEqual(G.dueReminders(s, T0 + 23 * MIN), [], 'not repeated');
  assert.match(at(24.5)[0].message, /should be next by the schedule\. Confirm with the announcement/);
  assert.match(at(29)[0].message, /was expected at .* ask the operator\. If you passed it, open Help/);
});

test('tight transfer is warned about during the preceding ride', () => {
  const it = synth();
  it.legs[3] = railLeg({ startTime: iso(T0 + 26 * MIN) }); // 1 minute after the bus arrives
  const guide = G.buildGuide(it);
  const s = { ...G.createState(guide, T0), index: 2 };
  assert.equal(guide.phases[2].connectMin, 1);
  assert.ok(G.dueReminders(s, T0 + 22 * MIN).some(r => /Tight connection after this stop: 1 minute/.test(r.message)));
});

test('missed departure: offers recovery, "still waiting" snoozes, then asks again', () => {
  const guide = G.buildGuide(synth());
  let s = { ...G.createState(guide, T0), index: 1 }; // board bus, departs T0+5
  assert.equal(G.departureStatus(s, T0 + 2 * MIN).state, 'upcoming');
  assert.equal(G.departureStatus(s, T0 + 5 * MIN).state, 'due');
  const missed = G.departureStatus(s, T0 + 8 * MIN);
  assert.equal(missed.state, 'maybe-missed');
  assert.match(missed.message, /Find another route.*Rove has no live data for this trip/);
  s = G.reduce(s, { type: 'STILL_WAITING', now: T0 + 8 * MIN });
  assert.equal(G.departureStatus(s, T0 + 10 * MIN).state, 'waiting');
  assert.equal(G.departureStatus(s, T0 + 14 * MIN).state, 'maybe-missed');
  assert.equal(s.index, 1, 'missing a departure never skips boarding');
});

test('canceled service is announced and never presented as departing', () => {
  const it = synth();
  it.legs[1] = busLeg({ canceled: true });
  const guide = G.buildGuide(it);
  const s = { ...G.createState(guide, T0), index: 1 };
  assert.equal(G.departureStatus(s, T0).state, 'canceled');
  assert.match(G.speech(guide.phases[1]), /marked canceled\. Open Help/);
  assert.doesNotMatch(G.speech(guide.phases[1]), /It departs at/);
  assert.ok(G.dueReminders(s, T0 + 4 * MIN).every(r => !/departs in/.test(r.message)));
});

test('missing direction and platform are admitted, not invented', () => {
  const guide = G.buildGuide({ legs: [railLeg({ headsign: null, from: { name: 'Somewhere' } })] });
  const board = guide.phases[0];
  assert.ok(board.facts.includes('Direction not provided. Ask the operator before boarding.'));
  assert.ok(board.facts.includes('Platform not provided. Check signs or ask staff.'));
  assert.match(G.speech(board), /direction was not provided; ask the operator/);
});

test('certainty line never claims vehicle, crossing or obstacle detection', () => {
  const guide = G.buildGuide(synth());
  for (const phase of guide.phases) for (const q of ['good', 'poor', null]) {
    assert.doesNotMatch(G.certainty(phase, q), /(?<!not )(detects?|verif(y|ies)) (obstacles|crossings|your vehicle)|safe to cross/i);
  }
  assert.match(G.certainty(guide.phases[1], null), /Rove cannot see which vehicle you board\. No GPS signal\./);
  assert.match(G.certainty(guide.phases[0], 'poor'), /GPS signal is weak\. Rove does not detect crossings or obstacles/);
});

test('agency vocabulary covers Muni modes, VTA bus and Caltrain train numbers', () => {
  assert.equal(G.vehicle({ agencyId: 'muni', transitMode: 'CABLE_CAR', routeName: 'PH' }).name, 'Muni PH cable car');
  assert.equal(G.vehicle({ agencyId: 'muni', transitMode: 'BUS', routeName: '38R' }).name, 'Muni 38R bus');
  assert.equal(G.vehicle({ agencyId: 'vta', transitMode: 'BUS', routeName: '22' }).name, 'VTA 22 bus');
  assert.equal(G.vehicle({ agencyId: 'caltrain', transitMode: 'RAIL', routeName: 'Local', tripShortName: '128' }).name, 'Caltrain Local train 128');
  assert.match(G.vehicle({ agencyId: 'caltrain', tripShortName: '128' }).check, /Confirm train 128/);
});
