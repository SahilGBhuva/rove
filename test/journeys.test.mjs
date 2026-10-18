import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHandler } from '../lib/app.mjs';
import { RealtimeService } from '../lib/realtime/service.mjs';
import { OtpClient } from '../lib/routing/otp.mjs';
import { StopSearch } from '../lib/stops-search.mjs';
import { JourneyRequestError, parseJourneyBody, toJourneyResponse } from '../lib/journeys.mjs';
import { fixtureIndexes } from './helpers.mjs';
import { OTP_RESPONSE } from './fixtures/otp-plan-response.mjs';

const root = path.resolve(import.meta.dirname, '..');
const network = JSON.parse(fs.readFileSync(path.join(root, 'public/data/network.json'), 'utf8'));
const NOW = new Date('2026-10-20T16:00:00Z');
const BODY = { from: { name: 'Powell', lat: 37.7849, lon: -122.4073 }, to: { name: 'Lake Merritt', lat: 37.7974, lon: -122.2651 }, dateTime: '2026-10-20T08:15:00-07:00', arriveBy: false, modes: ['TRANSIT', 'WALK'] };

test('journey body maps onto the validated planner request', () => {
  const r = parseJourneyBody(BODY, NOW);
  assert.equal(r.from.name, 'Powell');
  assert.equal(r.arriveBy, false);
  assert.equal(r.transitModes, null, 'TRANSIT and WALK mean all modes');
  assert.deepEqual(parseJourneyBody({ ...BODY, modes: ['TRANSIT', 'SUBWAY'] }, NOW).transitModes, ['SUBWAY']);
});

test('journey body validation names the field the frontend should highlight', () => {
  assert.throws(() => parseJourneyBody({ ...BODY, from: null }, NOW), e => e instanceof JourneyRequestError && e.field === 'from');
  assert.throws(() => parseJourneyBody({ ...BODY, to: { lat: 34.05, lon: -118.24 } }, NOW), e => e.field === 'to' && /outside/.test(e.message));
  assert.throws(() => parseJourneyBody({ ...BODY, dateTime: 'soon' }, NOW), e => e.field === 'dateTime');
  assert.throws(() => parseJourneyBody({ ...BODY, modes: ['CAR'] }, NOW), e => e.field === 'modes');
  assert.throws(() => parseJourneyBody('nope', NOW), e => e.field === 'body');
});

test('journey response has the frontend contract shape, honest realtime flags and stable ids', async () => {
  const plan = await new OtpClient({ fetchImpl: async () => new Response(JSON.stringify(OTP_RESPONSE)) }).plan(parseJourneyBody(BODY, NOW));
  const r = toJourneyResponse(plan, NOW);
  const it = r.itineraries[0];
  assert.equal(it.startTime, '2026-10-20T09:02:00-07:00');
  const ride = it.legs.find(l => l.mode === 'TRANSIT');
  assert.equal(ride.vehicleMode, 'SUBWAY');
  assert.equal(ride.agencyId, 'bart');
  assert.equal(ride.routeName, 'Yellow-N');
  assert.equal(ride.routeColor, '#FFFF33');
  assert.equal(ride.from.stationId, 'POWL');
  assert.equal(ride.geometry.type, 'LineString');
  assert.equal(ride.realtime, true, 'the fixture leg carries an OTP realtime estimate');
  assert.equal(ride.delaySeconds, 60);
  assert.equal(it.legs[0].mode, 'WALK');
  assert.equal(it.legs[0].realtime, false);
  assert.equal(toJourneyResponse(plan, NOW).itineraries[0].id, it.id, 'same trip, same id');
  assert.equal(r.error, undefined);
});

test('no itinerary becomes a NO_PATH error, never an invented trip', () => {
  const r = toJourneyResponse({ routing: {}, request: {}, itineraries: [], errors: [{ code: 'NO_TRANSIT_CONNECTION', message: 'No transit connection was found between these places.' }] }, NOW);
  assert.deepEqual(r.itineraries, []);
  assert.deepEqual(r.error, { code: 'NO_PATH', message: 'No transit connection was found between these places.' });
});

async function serve(otpFetch, fn) {
  const realtime = new RealtimeService({ indexes: fixtureIndexes(), apiKey: undefined, bartDirect: false });
  const otp = new OtpClient({ url: 'http://otp.test/otp/gtfs/v1', fetchImpl: otpFetch });
  const server = http.createServer(createHandler({ root, realtime, otp, stops: new StopSearch(network), log: { error() {} } }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}
const post = (base, body, headers = {}) => fetch(`${base}/api/journeys`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('HTTP: POST /api/journeys returns itineraries, 404 NO_PATH, 400 and 503 with the error envelope', async () => {
  let reply = OTP_RESPONSE;
  await serve(async () => new Response(JSON.stringify(reply)), async base => {
    const ok = await post(base, { ...BODY, dateTime: new Date(Date.now() + 3600_000).toISOString() });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).itineraries.length, 1);
    reply = { data: { planConnection: { searchDateTime: null, routingErrors: [{ code: 'NO_TRANSIT_CONNECTION', description: 'x', inputField: null }], pageInfo: { searchWindowUsed: null }, edges: [] } } };
    const none = await post(base, { ...BODY, dateTime: undefined });
    assert.equal(none.status, 404);
    assert.equal((await none.json()).error.code, 'NO_PATH');
    const bad = await post(base, { ...BODY, from: { lat: 'x', lon: 1 } });
    assert.equal(bad.status, 400);
    assert.deepEqual(Object.keys((await bad.json()).error).sort(), ['code', 'field', 'message']);
    assert.equal((await post(base, '{not json')).status, 400);
    assert.equal((await post(base, JSON.stringify({ pad: 'x'.repeat(20_000) }))).status, 413);
    assert.equal((await fetch(`${base}/api/journeys`)).status, 405);
  });
  await serve(async () => { throw new TypeError('fetch failed'); }, async base => {
    const down = await post(base, { ...BODY, dateTime: undefined });
    assert.equal(down.status, 503);
    assert.equal((await down.json()).error.code, 'ROUTING_UNAVAILABLE');
  });
});

test('HTTP: CORS is granted to local development origins only, including preflight', async () => {
  await serve(async () => new Response(JSON.stringify(OTP_RESPONSE)), async base => {
    const local = await fetch(`${base}/api/v2/stops/search?q=powell`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const other = await fetch(`${base}/api/v2/stops/search?q=powell`, { headers: { Origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
    const pre = await fetch(`${base}/api/journeys`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:3000', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
    const page = await fetch(`${base}/app.js`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(page.headers.get('access-control-allow-origin'), null, 'static files are not shared cross-origin');
  });
});

test('HTTP: /api/v2/status reports subsystems honestly when routing and address search are down', async () => {
  await serve(async () => { throw new TypeError('fetch failed'); }, async base => {
    const s = await (await fetch(`${base}/api/v2/status`)).json();
    assert.equal(s.region, 'San Francisco Bay Area');
    assert.equal(s.routing.available, false);
    assert.equal(s.search.addresses, false);
    assert.equal(s.agencies.find(a => a.id === 'bart').vehicles, 'not-published');
    assert.ok(s.agencies.every(a => a.arrivals === 'unverified'), 'nothing is verified without live data');
  });
});
