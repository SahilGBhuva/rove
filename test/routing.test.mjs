import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSchema, parse, validate } from 'graphql';
import { getVariableValues } from 'graphql/execution/values.js';
import {
  HEALTH_QUERY, OtpClient, PLAN_QUERY, PlanRequestError, buildPlanVariables, decodePolyline, sortItineraries,
  isoDurationToSeconds, normalizeItinerary, parsePlanParams, splitGtfsId, toPacificOffsetDateTime
} from '../lib/routing/otp.mjs';

import { OTP_RESPONSE } from './fixtures/otp-plan-response.mjs';

const schema = buildSchema(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/otp-2.8.1-schema.graphqls'), 'utf8'));
const NOW = new Date('2026-10-20T16:00:00Z');
const params = o => new URLSearchParams(o);
const sfToOakland = { fromLat: '37.7849', fromLon: '-122.4073', toLat: '37.7974', toLon: '-122.2651' };

test('the plan and health queries validate against the OpenTripPlanner 2.8.1 GTFS GraphQL schema', () => {
  for (const q of [PLAN_QUERY, HEALTH_QUERY]) {
    const errors = validate(schema, parse(q));
    assert.deepEqual(errors.map(e => e.message), []);
  }
});

test('plan variables have the shapes the schema requires', () => {
  const req = parsePlanParams(params({ ...sfToOakland, modes: 'subway,bus' }), NOW);
  const v = buildPlanVariables(req);
  assert.deepEqual(v.origin.location.coordinate, { latitude: 37.7849, longitude: -122.4073 });
  assert.equal(v.dateTime.earliestDeparture, '2026-10-20T09:00:00-07:00');
  assert.deepEqual(v.modes.transit.transit, [{ mode: 'SUBWAY' }, { mode: 'BUS' }]);
  // Coerce the variables through graphql's own input validation against the real schema.
  const op = parse(PLAN_QUERY).definitions[0];
  for (const variables of [v, buildPlanVariables(parsePlanParams(params({ ...sfToOakland, arriveBy: 'true' }), NOW)), buildPlanVariables(parsePlanParams(params(sfToOakland), NOW))]) {
    const coerced = getVariableValues(schema, op.variableDefinitions, variables);
    assert.deepEqual(coerced.errors?.map(e => e.message) || [], []);
  }
});

test('arrive-by requests use latestArrival', () => {
  const req = parsePlanParams(params({ ...sfToOakland, arriveBy: 'true', time: '2026-10-21T17:30:00-07:00' }), NOW);
  assert.deepEqual(buildPlanVariables(req).dateTime, { latestArrival: '2026-10-21T17:30:00-07:00' });
});

test('Pacific offsets are correct on both sides of the November DST change', () => {
  assert.equal(toPacificOffsetDateTime(new Date('2026-11-01T08:30:00Z')), '2026-11-01T01:30:00-07:00');
  assert.equal(toPacificOffsetDateTime(new Date('2026-11-01T09:30:00Z')), '2026-11-01T01:30:00-08:00');
  assert.equal(toPacificOffsetDateTime(new Date('2026-12-15T20:00:00Z')), '2026-12-15T12:00:00-08:00');
});

test('planner input validation rejects bad, missing and out-of-area coordinates', () => {
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, fromLat: '' }), NOW), PlanRequestError);
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, toLon: 'abc' }), NOW), /toLon/);
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, toLat: '34.05', toLon: '-118.24' }), NOW), /outside/);
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, toLat: sfToOakland.fromLat, toLon: sfToOakland.fromLon }), NOW), /same place/);
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, time: 'tomorrow' }), NOW), /ISO 8601/);
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, time: '2027-06-01T09:00:00-07:00' }), NOW), /60 days/);
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, modes: 'BUS,CAR' }), NOW), /CAR/);
  assert.equal(parsePlanParams(params({ ...sfToOakland, limit: '99' }), NOW).limit, 6);
});

test('polyline decoding matches the reference example', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@'), [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  assert.deepEqual(decodePolyline(''), []);
});

test('ISO durations convert to seconds, including negative delays', () => {
  assert.equal(isoDurationToSeconds('PT2M30S'), 150);
  assert.equal(isoDurationToSeconds('-PT45S'), -45);
  assert.equal(isoDurationToSeconds('PT1H'), 3600);
  assert.equal(isoDurationToSeconds('P1DT1S'), 86401);
  assert.equal(isoDurationToSeconds(null), null);
});

test('gtfsIds map back to Rove agencies through the feed id', () => {
  assert.deepEqual(splitGtfsId('muni:1234'), { agency: 'muni', feedId: 'muni', id: '1234', gtfsId: 'muni:1234' });
  assert.equal(splitGtfsId('bart:A10-1').id, 'A10-1');
  assert.equal(splitGtfsId('other:1').agency, null);
});

test('OTP itineraries normalise into the Rove contract with real times, legs, stops and geometry', () => {
  const it = normalizeItinerary(OTP_RESPONSE.data.planConnection.edges[0].node, 0);
  assert.equal(it.durationSeconds, 1320);
  assert.equal(it.walkMeters, 512);
  assert.equal(it.transfers, 0);
  assert.deepEqual(it.agencies, ['bart']);
  assert.equal(it.usesRealtime, true);
  const [walk, ride, walk2] = it.legs;
  assert.equal(walk.transit, false);
  assert.equal(walk.to.stop.station.id, 'POWL');
  assert.equal(walk.steps.length, 2);
  assert.equal(walk.steps[0].instruction, 'Head south on Powell Street');
  assert.deepEqual([walk.steps[1].stayOn, walk.steps[1].area, walk.steps[1].exit], [true, false, null]);
  assert.equal(walk.steps[1].instruction, 'Continue on Powell Street');
  assert.equal(ride.agency.id, 'bart');
  assert.equal(ride.route.id, '2');
  assert.equal(ride.route.color, '#FFFF33');
  assert.equal(ride.trip.id, '1965527');
  assert.equal(ride.start.delaySeconds, 60);
  assert.equal(ride.start.estimated, '2026-10-20T09:08:00-07:00');
  assert.equal(ride.geometry.type, 'LineString');
  assert.equal(ride.geometry.coordinates.length, 3);
  assert.equal(ride.intermediateStops[0].id, 'M20-1');
  assert.equal(ride.alerts[0].header, 'Elevator out of service');
  assert.deepEqual(walk2.geometry.coordinates, []);
});

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init: { ...init, body: JSON.parse(init.body) } }); return handler(url, init); };
  f.calls = calls;
  return f;
}
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('OtpClient posts the GraphQL query to the configured endpoint and returns itineraries', async () => {
  const fetchImpl = fakeFetch(() => jsonResponse(OTP_RESPONSE));
  const client = new OtpClient({ url: 'http://otp.test/otp/gtfs/v1', fetchImpl });
  const result = await client.plan(parsePlanParams(params(sfToOakland), NOW));
  assert.equal(fetchImpl.calls[0].url, 'http://otp.test/otp/gtfs/v1');
  assert.equal(fetchImpl.calls[0].init.method, 'POST');
  assert.match(fetchImpl.calls[0].init.body.query, /planConnection/);
  assert.equal(result.itineraries.length, 1);
  assert.equal(result.searchWindowSeconds, 2400);
  assert.equal(result.routing.realtime, 'partial');
  assert.deepEqual(result.errors, []);
});

test('OtpClient: routing errors are returned with readable messages and no itineraries are invented', async () => {
  const fetchImpl = fakeFetch(() => jsonResponse({ data: { planConnection: { searchDateTime: null, routingErrors: [{ code: 'NO_TRANSIT_CONNECTION', description: 'x', inputField: null }], pageInfo: { searchWindowUsed: null }, edges: [] } } }));
  const result = await new OtpClient({ fetchImpl }).plan(parsePlanParams(params(sfToOakland), NOW));
  assert.equal(result.itineraries.length, 0);
  assert.equal(result.errors[0].code, 'NO_TRANSIT_CONNECTION');
  assert.match(result.errors[0].message, /No transit connection/);
});

test('OtpClient: an unreachable engine is a 503 ROUTING_UNAVAILABLE', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(new OtpClient({ fetchImpl }).plan(parsePlanParams(params(sfToOakland), NOW)), e => e.status === 503 && e.code === 'ROUTING_UNAVAILABLE');
});

test('OtpClient: HTTP and GraphQL failures are 502s', async () => {
  await assert.rejects(new OtpClient({ fetchImpl: async () => jsonResponse({}, 500) }).plan(parsePlanParams(params(sfToOakland), NOW)), e => e.status === 502);
  await assert.rejects(new OtpClient({ fetchImpl: async () => jsonResponse({ errors: [{ message: 'Validation error' }] }) }).plan(parsePlanParams(params(sfToOakland), NOW)), e => e.code === 'ROUTING_QUERY_ERROR');
});

test('itineraries are ordered by arrival (or by latest departure for arrive-by), so a slow walk-only option is not listed first', () => {
  const walk = { start: '2026-10-20T08:15:00-07:00', end: '2026-10-20T09:16:00-07:00', legs: [] };
  const bus = { start: '2026-10-20T08:20:00-07:00', end: '2026-10-20T08:49:00-07:00', legs: [] };
  const later = { start: '2026-10-20T08:30:00-07:00', end: '2026-10-20T08:59:00-07:00', legs: [] };
  assert.deepEqual(sortItineraries([walk, later, bus]).map(n => n.end.slice(11, 16)), ['08:49', '08:59', '09:16']);
  assert.deepEqual(sortItineraries([walk, bus, later], true).map(n => n.start.slice(11, 16)), ['08:30', '08:20', '08:15']);
});

test('walking instructions read naturally for named streets and generic paths', async () => {
  const { stepInstruction } = await import('../lib/routing/otp.mjs');
  assert.equal(stepInstruction({ relativeDirection: 'DEPART', absoluteDirection: 'EAST', streetName: 'Lily Avenue' }), 'Head east on Lily Avenue');
  assert.equal(stepInstruction({ relativeDirection: 'LEFT', streetName: 'Toyon Avenue' }), 'Turn left onto Toyon Avenue');
  assert.equal(stepInstruction({ relativeDirection: 'RIGHT', streetName: 'link' }), 'Turn right onto the ramp', 'an OSM link is a highway ramp');
  assert.equal(stepInstruction({ relativeDirection: 'RIGHT', streetName: 'open area', area: true }), 'Turn right across the open area');
  assert.equal(stepInstruction({ relativeDirection: 'DEPART', absoluteDirection: 'NORTH', streetName: 'corridor' }), 'Head north through the corridor');
  assert.equal(stepInstruction({ relativeDirection: 'CONTINUE', streetName: 'underpass' }), 'Continue through the underpass');
  assert.equal(stepInstruction({ relativeDirection: 'SLIGHTLY_RIGHT', streetName: 'path', bogusName: true }), 'Bear right onto the path');
  assert.equal(stepInstruction({ relativeDirection: 'LEFT', streetName: 'escalator', bogusName: false }), 'Take the escalator');
  assert.equal(stepInstruction({ relativeDirection: 'CONTINUE', streetName: 'Market Street', stayOn: true }), 'Continue on Market Street');
  assert.equal(stepInstruction({ relativeDirection: 'CIRCLE_COUNTERCLOCKWISE', exit: '2', streetName: 'Hope Street' }), 'At the roundabout, take exit 2 onto Hope Street');
  assert.equal(stepInstruction({ relativeDirection: 'ELEVATOR' }), 'Take the elevator');
});

test('access modes map to OTP modes, and drop-off carries WALK as OTP 2.8 requires', () => {
  const base = parsePlanParams(params(sfToOakland), NOW);
  assert.deepEqual(buildPlanVariables(base).modes.transit.access, ['WALK']);
  assert.deepEqual(buildPlanVariables({ ...base, access: 'park-and-ride' }).modes.transit.access, ['CAR_PARKING']);
  assert.deepEqual(buildPlanVariables({ ...base, access: 'drop-off' }).modes.transit.access, ['CAR_DROP_OFF', 'WALK']);
  assert.equal(parsePlanParams(params({ ...sfToOakland, access: 'park-and-ride' }), NOW).access, 'park-and-ride');
  assert.throws(() => parsePlanParams(params({ ...sfToOakland, access: 'helicopter' }), NOW), /access must be one of/);
  for (const access of ['walk', 'park-and-ride', 'drop-off']) {
    const op = parse(PLAN_QUERY).definitions[0];
    const coerced = getVariableValues(schema, op.variableDefinitions, buildPlanVariables({ ...base, access }));
    assert.deepEqual(coerced.errors?.map(e => e.message) || [], [], access);
  }
});


test('canceled transit legs are never offered as boardable itineraries', async () => {
  const valid = structuredClone(OTP_RESPONSE.data.planConnection.edges[0]);
  const canceled = structuredClone(valid);
  canceled.node.legs.find(leg => leg.transitLeg).realtimeState = 'CANCELED';
  const payload = structuredClone(OTP_RESPONSE);
  payload.data.planConnection.edges = [canceled, valid];
  const client = new OtpClient({ fetchImpl: fakeFetch(() => jsonResponse(payload)) });
  const result = await client.plan(parsePlanParams(params(sfToOakland), NOW));
  assert.equal(result.itineraries.length, 1);
  assert.equal(result.itineraries[0].hasCancellation, false);
  assert.equal(result.itineraries[0].id, 'it-0');
});

test('only canceled routes result in no recommended itineraries', async () => {
  const payload = structuredClone(OTP_RESPONSE);
  payload.data.planConnection.edges[0].node.legs.find(leg => leg.transitLeg).realtimeState = 'CANCELED';
  const client = new OtpClient({ fetchImpl: fakeFetch(() => jsonResponse(payload)) });
  const result = await client.plan(parsePlanParams(params(sfToOakland), NOW));
  assert.deepEqual(result.itineraries, []);
});
