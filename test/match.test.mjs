import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENCIES } from '../lib/agencies.mjs';
import { decode } from '../lib/realtime/decode.mjs';
import { RealtimeMatcher, arrivalsForStop } from '../lib/realtime/match.mjs';
import { NOW_S, feed, fixtureIndexes, manyMuniUpdates, tripUpdate } from './helpers.mjs';

const matcher = () => new RealtimeMatcher(fixtureIndexes());
const updatesOf = entities => decode('updates', feed(entities)).items;
const run511 = entities => matcher().match([{ source: '511', updates: updatesOf(entities) }]);

test('Muni: 511 prefixes are stripped and trip, route and stop match exactly', () => {
  const r = run511([tripUpdate('a', { tripId: 'SF:11001', routeId: 'SF:38R', stops: [{ stopId: 'SF:15550', seq: 1, t: NOW_S + 120 }] })]);
  const u = r.updates[0];
  assert.equal(u.agency, 'muni');
  assert.equal(u.tripMatch, 'matched');
  assert.equal(u.routeId, '38R');
  assert.equal(u.stopTimes[0].stopId, '15550');
  assert.equal(u.stopTimes[0].stopMatch, 'exact');
  assert.equal(r.quality.muni.tripMatchPct, 100);
});

test('Caltrain: route comes from static trips.txt even when the realtime route id does not match', () => {
  const r = run511([tripUpdate('c', { tripId: 'CT:141', routeId: 'CT:Local', stops: [{ stopId: 'CT:70261', seq: 2, t: NOW_S + 600 }] })]);
  const u = r.updates[0];
  assert.equal(u.tripMatch, 'matched');
  assert.equal(u.rawRouteId, 'CT:Local');
  assert.equal(u.routeId, '77119');
  assert.equal(u.routeName, 'Local Weekday');
  assert.equal(u.stopTimes[0].stopId, '70261');
});

test('Caltrain: missing realtime route id is filled from the trip', () => {
  const r = run511([tripUpdate('c', { tripId: 'CT:412', stops: [{ stopId: 'CT:70271', seq: 2, t: NOW_S + 600 }] })]);
  assert.equal(r.updates[0].routeId, '77121');
});

test('VTA: realtime stop ids that are public stop codes resolve through the unique stop_code', () => {
  const r = run511([tripUpdate('v', { tripId: 'SC:4042835', routeId: 'SC:BLUE', stops: [{ stopId: 'SC:64737', seq: 2, t: NOW_S + 60 }, { stopId: 'SC:64738', seq: 3, t: NOW_S + 180 }] })]);
  const u = r.updates[0];
  assert.equal(u.routeId, 'Blue');
  assert.deepEqual(u.stopTimes.map(s => [s.stopId, s.stopMatch]), [['4737', 'code'], ['4738', 'code']]);
  assert.equal(r.quality.vta.stopMethods.code, 2);
});

test('VTA: an unknown stop id falls back to the exact (trip_id, stop_sequence) key', () => {
  const r = run511([tripUpdate('v', { tripId: 'SC:4042835', stops: [{ stopId: 'SC:XYZ', seq: 3, t: NOW_S + 60 }] })]);
  assert.equal(r.updates[0].stopTimes[0].stopId, '4738');
  assert.equal(r.updates[0].stopTimes[0].stopMatch, 'sequence');
});

test('VTA: a stop id and stop code naming different stops is a conflict, never a guess', () => {
  const r = run511([tripUpdate('v', { tripId: 'SC:4042835', stops: [{ stopId: 'SC:4736', seq: 1, t: NOW_S + 60 }] })]);
  assert.equal(r.updates[0].stopTimes[0].stopId, null);
  assert.match(r.updates[0].stopTimes[0].conflict, /different stops/);
  assert.equal(r.quality.vta.stopConflicts, 1);
  assert.equal(r.quality.vta.arrivalsVerified, false);
});

test('VTA: a stop the trip does not serve is rejected', () => {
  const r = run511([tripUpdate('v', { tripId: 'SC:4042835', stops: [{ stopId: 'SC:9001', seq: 1, t: NOW_S + 60 }] })]);
  assert.equal(r.updates[0].stopTimes[0].stopId, null);
  assert.match(r.updates[0].stopTimes[0].conflict, /not served/);
});

test('BART direct: trip ids join exactly; Antioch 600-range ids are a documented exception, not a failure', () => {
  const bart = matcher().match([{ source: 'bart', agency: AGENCIES.bart, updates: updatesOf([
    tripUpdate('b1', { tripId: '1965118', stops: [{ stopId: 'A10-1', seq: 0, t: NOW_S + 60 }, { stopId: 'M30-1', seq: 1, t: NOW_S + 900 }] }),
    tripUpdate('b2', { tripId: '612', stops: [{ stopId: 'PCTR', seq: 1, t: NOW_S + 60 }] }),
    tripUpdate('b3', { tripId: '1999999', stops: [{ stopId: 'A10-1', seq: 0, t: NOW_S + 60 }] })
  ]) }]);
  const [ok, antioch, unknown] = bart.updates;
  assert.equal(ok.routeId, '1');
  assert.deepEqual(ok.stopTimes.map(s => s.stopId), ['A10-1', 'M30-1']);
  assert.equal(antioch.tripMatch, 'documented-exception');
  assert.equal(antioch.routeId, null, 'no route is invented for unmatched Antioch trips');
  assert.equal(unknown.tripMatch, 'unknown-trip');
  assert.equal(bart.quality.bart.documentedExceptions, 1);
  assert.equal(bart.quality.bart.tripMatchPct, 50, 'the 600-range trip is excluded from the denominator; the unknown one is not');
});

test('BART: a platform stop id is accepted when the realtime stop_sequence numbering differs', () => {
  const r = matcher().match([{ source: 'bart', agency: AGENCIES.bart, updates: updatesOf([tripUpdate('b', { tripId: '1965118', stops: [{ stopId: 'M30-1', seq: 7, t: NOW_S + 60 }] })]) }]);
  assert.equal(r.updates[0].stopTimes[0].stopId, 'M30-1');
  assert.equal(r.quality.bart.sequenceMismatches, 0, 'sequence 7 does not exist on the trip, so nothing disagrees');
});

test('service date: a trip whose service does not run on start_date is not matched', () => {
  const r = run511([tripUpdate('w', { tripId: 'SF:11003', startDate: '20261020', stops: [{ stopId: 'SF:15550', seq: 1, t: NOW_S }] })]);
  assert.equal(r.updates[0].tripMatch, 'service-date-mismatch');
  assert.equal(r.updates[0].routeId, null);
  assert.equal(r.quality.muni.serviceDateMismatch, 1);
});

test('cancellations: a canceled trip carries no prediction times and is reported as canceled', () => {
  const r = run511([...manyMuniUpdates(25), tripUpdate('x', { tripId: 'SF:11002', rel: 3, stops: [{ stopId: 'SF:15552', seq: 4, t: NOW_S + 300 }] })]);
  const canceled = r.updates.find(u => u.rawTripId === 'SF:11002');
  assert.equal(canceled.tripStatus, 'CANCELED');
  assert.equal(canceled.stopTimes[0].arrival, null);
  assert.equal(r.quality.muni.canceledTrips, 1);
  const board = arrivalsForStop({ updates: r.updates, quality: r.quality, agencyId: 'muni', stopId: '15552', now: NOW_S });
  assert.equal(board.status, 'no-predictions');
  assert.equal(board.arrivals.length, 0);
  assert.equal(board.canceled[0].reason, 'trip-canceled');
});

test('skipped stops and NO_DATA stops produce no arrival time', () => {
  const r = run511([...manyMuniUpdates(25), tripUpdate('s', { tripId: 'SF:11001', stops: [
    { stopId: 'SF:15551', seq: 2, rel: 1, t: NOW_S + 400 },
    { stopId: 'SF:15552', seq: 3, rel: 2 }
  ] })]);
  const u = r.updates.find(x => x.stopTimes.length === 2);
  assert.equal(u.stopTimes[0].relationship, 'SKIPPED');
  assert.equal(u.stopTimes[0].arrival, null);
  assert.equal(u.stopTimes[1].relationship, 'NO_DATA');
  assert.equal(u.stopTimes[1].arrival, null);
  const board = arrivalsForStop({ updates: r.updates, quality: r.quality, agencyId: 'muni', stopId: '15551', now: NOW_S });
  assert.equal(board.arrivals.length, 0);
  assert.equal(board.canceled[0].reason, 'stop-skipped');
  assert.equal(r.quality.muni.skippedStops, 1);
  assert.equal(r.quality.muni.noDataStops, 1);
});

test('missing predictions: a verified agency with no prediction for a stop reports no-predictions, not an error', () => {
  const r = run511(manyMuniUpdates(25));
  assert.equal(r.quality.muni.arrivalsVerified, true);
  const board = arrivalsForStop({ updates: r.updates, quality: r.quality, agencyId: 'muni', stopId: '15551', now: NOW_S });
  assert.deepEqual([board.status, board.arrivals.length], ['no-predictions', 0]);
});

test('arrivals: sorted, past departures older than a minute dropped, beyond the horizon dropped', () => {
  const r = run511([...manyMuniUpdates(25, NOW_S - 600)]);
  const board = arrivalsForStop({ updates: r.updates, quality: r.quality, agencyId: 'muni', stopId: '15550', now: NOW_S, horizonSeconds: 600 });
  assert.equal(board.status, 'live');
  assert.ok(board.arrivals.every(a => a.time >= NOW_S - 60 && a.time <= NOW_S + 600));
  assert.deepEqual(board.arrivals.map(a => a.time), [...board.arrivals.map(a => a.time)].sort((a, b) => a - b));
});

test('quality gate: an agency below 99% stop match keeps arrivals hidden', () => {
  const updates = Array.from({ length: 30 }, (_, i) => tripUpdate(`v${i}`, { tripId: 'SC:4042835', stops: [{ stopId: i < 2 ? 'SC:NOPE' : 'SC:64737', seq: i < 2 ? 99 : 2, t: NOW_S + 60 }] }));
  const r = run511(updates);
  assert.equal(r.quality.vta.stopMatchPct, 93.3);
  assert.equal(r.quality.vta.arrivalsVerified, false);
  const board = arrivalsForStop({ updates: r.updates, quality: r.quality, agencyId: 'vta', stopId: '4737', now: NOW_S });
  assert.equal(board.status, 'unverified');
  assert.ok(board.reasons.some(x => /stop match/.test(x)));
});

test('quality gate: too few samples is not treated as verified', () => {
  const r = run511(manyMuniUpdates(3));
  assert.equal(r.quality.muni.arrivalsVerified, false);
});

test('vehicles resolve their route through the trip and never through route-name similarity', () => {
  const vehicles = decode('vehicles', feed([
    { id: 'v1', vehicle: { trip: { tripId: 'CT:141', routeId: 'CT:Local' }, vehicle: { id: '901' }, position: { latitude: 37.4, longitude: -122.1 }, timestamp: NOW_S } },
    { id: 'v2', vehicle: { trip: { tripId: 'SF:nope', routeId: 'SF:38R' }, vehicle: { id: '902' }, position: { latitude: 37.78, longitude: -122.44 }, timestamp: NOW_S } }
  ])).items;
  const r = matcher().match([{ source: '511', vehicles }]);
  assert.equal(r.vehicles[0].routeId, '77119');
  assert.equal(r.vehicles[1].routeId, null, 'unknown trip: the vehicle is not attached to route 38R by name');
  assert.equal(r.quality.caltrain.vehicleMatchPct, 100);
  assert.equal(r.quality.muni.vehicleMatchPct, 0);
});

test('entities without a recognisable operator prefix are counted as unassigned', () => {
  const r = run511([tripUpdate('z', { tripId: 'ZZ:1', stops: [] })]);
  assert.equal(r.unassigned.updates, 1);
  assert.equal(r.updates.length, 0);
});
