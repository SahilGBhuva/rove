import test from 'node:test';
import assert from 'node:assert/strict';
import { tripLive, nextOnRoute, rtId, plannerId } from '../lib/realtime/live-trip.mjs';

const NOW = 1_800_000_000;
const stu = (stopId, t, delay = 0) => ({ stopId, arrival: { time: t, delay }, departure: { time: t + 20, delay } });
const feed = (entities, age = 30) => ({ timestamp: NOW - age, entities });
const trip = (tripId, stus, extra = {}) => ({ id: tripId, tripUpdate: { trip: { tripId, ...extra }, stopTimeUpdate: stus } });

test('ids: 511 and planner prefixes are stripped', () => {
  assert.equal(rtId('SF:12345'), '12345');
  assert.equal(plannerId('bart:M30-2'), 'M30-2');
  assert.equal(rtId('1965570'), '1965570');
});

test('matches the exact trip at the boarding and exit stops, with stops away', () => {
  const f = feed([trip('SF:777', [stu('100', NOW + 60), stu('200', NOW + 240, 120), stu('300', NOW + 600, 120)]), trip('SF:888', [stu('200', NOW + 900)])]);
  const r = tripLive(f, [{ tripId: 'SF:777', lat: 37.7, lon: -122.4, bearing: 90, timestamp: NOW - 20 }], { tripId: '777', boardStopId: '200', exitStopId: '300' }, NOW);
  assert.equal(r.status, 'live');
  assert.deepEqual(r.board, { time: NOW + 260, delay: 120, source: 'stop', stopsAway: 1 });
  assert.equal(r.exit.time, NOW + 600);
  assert.equal(r.exit.stopsAway, 2);
  assert.equal(r.vehicle.lat, 37.7);
});

test('stop id mismatch (e.g. VTA) falls back to schedule + reported delay, labelled "delay"', () => {
  const f = feed([trip('SC:5', [stu('x1', NOW + 60, 180)])]);
  const r = tripLive(f, [], { tripId: '5', boardStopId: 'unknown', scheduledBoard: NOW + 300 }, NOW);
  assert.deepEqual(r.board, { time: NOW + 480, delay: 180, source: 'delay', stopsAway: null });
});

test('no trip in feed, stale feed, and canceled trip are reported honestly', () => {
  assert.equal(tripLive(feed([]), [], { tripId: '1' }, NOW).status, 'no-trip');
  assert.equal(tripLive(feed([trip('1', [stu('a', NOW + 60)])], 900), [], { tripId: '1' }, NOW).status, 'stale');
  const c = tripLive(feed([trip('1', [stu('a', NOW + 60)], { scheduleRelationship: 3 })]), [], { tripId: '1' }, NOW);
  assert.equal(c.status, 'canceled');
  assert.equal(c.board, undefined, 'no departure time is offered for a canceled trip');
});

test('passed stops are ignored when counting stops away', () => {
  const f = feed([trip('9', [stu('a', NOW - 300), stu('b', NOW + 60), stu('c', NOW + 200)])]);
  assert.equal(tripLive(f, [], { tripId: '9', boardStopId: 'c' }, NOW).board.stopsAway, 1);
});

test('next live departures on the same route from the boarding stop', () => {
  const f = feed([
    { tripUpdate: { trip: { tripId: 'SF:1', routeId: 'SF:N' }, stopTimeUpdate: [stu('200', NOW + 400)] } },
    { tripUpdate: { trip: { tripId: 'SF:2', routeId: 'SF:N' }, stopTimeUpdate: [stu('200', NOW + 100)] } },
    { tripUpdate: { trip: { tripId: 'SF:3', routeId: 'SF:K' }, stopTimeUpdate: [stu('200', NOW + 50)] } },
    { tripUpdate: { trip: { tripId: 'SF:4', routeId: 'SF:N', scheduleRelationship: 3 }, stopTimeUpdate: [stu('200', NOW + 60)] } }
  ]);
  assert.deepEqual(nextOnRoute(f, { boardStopId: '200', routeId: 'N' }, NOW).map(x => x.tripId), ['2', '1']);
});
