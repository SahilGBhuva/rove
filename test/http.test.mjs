import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHandler } from '../lib/app.mjs';
import { RealtimeService } from '../lib/realtime/service.mjs';
import { OtpClient } from '../lib/routing/otp.mjs';
import { StopSearch } from '../lib/stops-search.mjs';
import { feed, fixtureIndexes, manyMuniUpdates } from './helpers.mjs';
import { OTP_RESPONSE } from './fixtures/otp-plan-response.mjs';

const root = path.resolve(import.meta.dirname, '..');
const network = JSON.parse(fs.readFileSync(path.join(root, 'public/data/network.json'), 'utf8'));

async function withServer({ otpFetch, updates = manyMuniUpdates(30), frontendRoot } = {}, fn) {
  const realtime = new RealtimeService({
    indexes: fixtureIndexes(), apiKey: 'test-key-never-real',
    loaders: { updates: async () => feed(updates), vehicles: async () => feed([]), alerts: async () => feed([]), bartUpdates: async () => feed([]), bartAlerts: async () => feed([]) }
  });
  const otp = new OtpClient({ url: 'http://otp.test/otp/gtfs/v1', fetchImpl: otpFetch || (async () => { throw new TypeError('fetch failed'); }) });
  const server = http.createServer(createHandler({ root, frontendRoot, realtime, otp, stops: new StopSearch(network), log: { error() {} } }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(async p => { const r = await fetch(base + p); return { status: r.status, text: await r.text() }; }); }
  finally { server.close(); }
}

test('HTTP boundary: secrets, Git metadata, backend code and raw data are never served', async () => {
  await withServer({}, async get => {
    for (const p of ['/.env', '/.env.example', '/.git/config', '/server.mjs', '/lib/app.mjs', '/scripts/configure-511-key.sh', '/data/raw/bart.zip', '/data/otp/graph/build-config.json', '/package.json', '/public/../server.mjs', '/public/%2e%2e/server.mjs', '/test/helpers.mjs']) {
      assert.equal((await get(p)).status, 404, p);
    }
    assert.equal((await get('/app.js')).status, 200);
    assert.equal((await get('/public/data/network.json')).status, 200);
    assert.equal((await get('/')).status, 200);
    assert.equal((await get('/api/nope')).status, 404);
  });
});

test('HTTP: the 511 key never appears in any API response', async () => {
  await withServer({}, async get => {
    for (const p of ['/api/realtime', '/api/realtime/status', '/api/v2/realtime', '/api/v2/realtime/quality', '/api/v2/arrivals?agency=muni&stop=15550']) {
      const r = await get(p);
      assert.equal(r.status, 200, p);
      assert.ok(!r.text.includes('test-key-never-real'), p);
      assert.ok(!r.text.includes('api_key'), p);
    }
  });
});

test('HTTP: /api/v2/plan validates input and reports an unavailable engine honestly', async () => {
  await withServer({}, async get => {
    const bad = await get('/api/v2/plan?fromLat=37.78&fromLon=-122.40');
    assert.equal(bad.status, 400);
    assert.equal(JSON.parse(bad.text).field, 'toLat');
    const down = await get('/api/v2/plan?fromLat=37.7849&fromLon=-122.4073&toLat=37.7974&toLon=-122.2651');
    assert.equal(down.status, 503);
    assert.equal(JSON.parse(down.text).code, 'ROUTING_UNAVAILABLE');
    const status = await get('/api/v2/plan/status');
    assert.equal(status.status, 503);
    assert.equal(JSON.parse(status.text).available, false);
  });
});

test('HTTP: /api/v2/plan returns normalised itineraries from OpenTripPlanner', async () => {
  const otpFetch = async () => new Response(JSON.stringify(OTP_RESPONSE), { status: 200 });
  await withServer({ otpFetch }, async get => {
    const r = await get('/api/v2/plan?fromLat=37.7849&fromLon=-122.4073&toLat=37.7974&toLon=-122.2651&fromName=Powell&toName=Lake%20Merritt');
    assert.equal(r.status, 200);
    const body = JSON.parse(r.text);
    assert.equal(body.itineraries[0].legs[1].route.shortName, 'Yellow-N');
    assert.equal(body.request.from.name, 'Powell');
    assert.equal(body.routing.engine, 'OpenTripPlanner');
  });
});

test('HTTP: stop search groups platforms into stations', async () => {
  await withServer({}, async get => {
    const body = JSON.parse((await get('/api/v2/stops/search?q=powell%20street&agencies=bart')).text);
    assert.equal(body.results[0].id, 'POWL');
    assert.ok(body.results[0].stopIds.includes('M30-1'));
    assert.deepEqual(JSON.parse((await get('/api/v2/stops/search?q=a')).text).results, []);
  });
});

test('HTTP: arrivals endpoint distinguishes live, unverified and bad requests', async () => {
  await withServer({}, async get => {
    const live = JSON.parse((await get('/api/v2/arrivals?agency=muni&stop=15550')).text);
    assert.ok(['live', 'no-predictions'].includes(live.status));
    const vta = JSON.parse((await get('/api/v2/arrivals?agency=vta&stop=4737')).text);
    assert.equal(vta.status, 'unverified');
    assert.equal((await get('/api/v2/arrivals?agency=nope&stop=1')).status, 400);
  });
});

test('HTTP: place search merges stations and map places; reverse lookup and missing index are reported', async () => {
  const { PlaceIndex } = await import('../lib/places.mjs');
  const { fixtureDb, ROWS } = await import('./helpers-places.mjs');
  const { index } = await PlaceIndex.open(fixtureDb(ROWS));
  const realtime = new RealtimeService({ indexes: fixtureIndexes(), apiKey: undefined, bartDirect: false });
  const otp = new OtpClient({ fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  for (const [places, expectAvailable] of [[index, true], [null, false]]) {
    const server = http.createServer(createHandler({ root, realtime, otp, stops: new StopSearch(network), places, placesUnavailableReason: 'place index not found', log: { error() {} } }));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const s = await (await fetch(`${base}/api/v2/places/search?q=powell%20st%20bart`)).json();
      assert.equal(s.results[0].kind, 'station');
      assert.equal(s.results[0].agency, 'bart');
      assert.equal(s.addressSearch, expectAvailable ? 'available' : 'unavailable');
      const a = await (await fetch(`${base}/api/v2/places/search?q=1355%20market%20st`)).json();
      if (expectAvailable) assert.equal(a.results[0].name, '1355 Market Street');
      else assert.equal(a.reason, 'place index not found');
      const rev = await fetch(`${base}/api/v2/places/reverse?lat=37.77697&lon=-122.4166`);
      assert.equal(rev.status, expectAvailable ? 200 : 503);
      assert.equal((await fetch(`${base}/api/v2/places/reverse?lat=x`)).status, 400);
    } finally { server.close(); }
  }
});

test('HTTP: a separate frontend checkout serves the page files, while data and secrets stay with the backend', async () => {
  const fe = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'rove-fe-'));
  fs.writeFileSync(path.join(fe, 'index.html'), '<!doctype html><title>frontend checkout</title>');
  fs.writeFileSync(path.join(fe, 'app.js'), '// frontend app');
  fs.writeFileSync(path.join(fe, '.env'), 'SECRET=never');
  fs.mkdirSync(path.join(fe, 'public/data'), { recursive: true });
  fs.writeFileSync(path.join(fe, 'public/data/network.json'), '{"stale":true}');
  await withServer({ frontendRoot: fe }, async get => {
    assert.match((await get('/')).text, /frontend checkout/);
    assert.equal((await get('/app.js')).text, '// frontend app');
    assert.notEqual((await get('/public/data/network.json')).text, '{"stale":true}', 'network data comes from the backend');
    for (const p of ['/.env', '/server.mjs', '/public/../.env', '/public/%2e%2e/.env']) assert.equal((await get(p)).status, 404, p);
  });
});

test('HTTP: static files accept only GET and HEAD, bad encodings are 400, symlinks cannot escape, and the page cannot be framed', async () => {
  const os = await import('node:os');
  const fe = fs.mkdtempSync(path.join(os.tmpdir(), 'rove-fe-'));
  fs.writeFileSync(path.join(fe, 'index.html'), '<!doctype html><title>x</title>');
  fs.mkdirSync(path.join(fe, 'public'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rove-outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside the site');
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(fe, 'public', 'link.txt'));
  await withServer({ frontendRoot: fe }, async get => {
    assert.equal((await get('/public/link.txt')).status, 404, 'a symlink out of the folder is not followed');
    assert.equal((await get('/..%c0%af.env')).status, 400);
    assert.equal((await get('/public/%E0%A4%A')).status, 400);
  });
  const server = http.createServer(createHandler({ root, realtime: null, otp: null, stops: new StopSearch(network), log: { error() {} } }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const m of ['PUT', 'DELETE', 'POST', 'PATCH']) {
      const r = await fetch(`${base}/index.html`, { method: m, body: m === 'DELETE' ? undefined : 'x' });
      assert.equal(r.status, 405, m);
      assert.equal(r.headers.get('allow'), 'GET, HEAD');
    }
    const page = await fetch(`${base}/`);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('content-security-policy'), "frame-ancestors 'none'");
    assert.equal(page.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    const plain = await fetch(`${base}/api/journeys`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{"from":{"lat":37.78,"lon":-122.41},"to":{"lat":37.79,"lon":-122.39}}' });
    assert.equal(plain.status, 415, 'a text/plain post (what a cross-site form can send) is refused');
    const form = await fetch(`${base}/api/journeys`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
    assert.equal(form.status, 415);
  } finally { server.close(); }
});
