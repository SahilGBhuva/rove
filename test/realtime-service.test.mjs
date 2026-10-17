import test from 'node:test';
import assert from 'node:assert/strict';
import { FeedCache, RateBudget } from '../lib/realtime/feed-cache.mjs';
import { RealtimeService, MAX_511_REQUESTS_PER_HOUR } from '../lib/realtime/service.mjs';
import { NOW_MS, NOW_S, alert, feed, fixtureIndexes, manyMuniUpdates, tripUpdate, vehicle } from './helpers.mjs';

function clock(start = NOW_MS) {
  let t = start;
  const now = () => t;
  now.advance = ms => { t += ms; };
  return now;
}

const decodeFake = buf => JSON.parse(Buffer.from(buf).toString());
const payload = (headerTimestamp, n = 1) => Buffer.from(JSON.stringify({ headerTimestamp, items: Array.from({ length: n }, (_, i) => i) }));

test('feed cache: serves fresh data inside the TTL without another upstream call', async () => {
  const now = clock();
  let calls = 0;
  const c = new FeedCache({ name: 't', ttlMs: 60_000, staleMs: 120_000, now, decode: decodeFake, load: async () => { calls++; return payload(NOW_S); } });
  assert.equal((await c.get()).cache, 'miss');
  now.advance(30_000);
  const second = await c.get();
  assert.equal(second.cache, 'fresh');
  assert.equal(calls, 1);
});

test('feed cache: concurrent callers share one upstream request', async () => {
  let calls = 0;
  const c = new FeedCache({ name: 't', ttlMs: 60_000, staleMs: 120_000, decode: decodeFake, load: async () => { calls++; await new Promise(r => setTimeout(r, 20)); return payload(Date.now() / 1000); } });
  await Promise.all([c.get(), c.get(), c.get()]);
  assert.equal(calls, 1);
});

test('stale data: upstream failure serves the last good copy marked stale, then fails once it is too old', async () => {
  const now = clock();
  let fail = false;
  const c = new FeedCache({ name: 't', ttlMs: 60_000, staleMs: 120_000, now, decode: decodeFake, load: async () => { if (fail) throw new Error('upstream down'); return payload(NOW_S); } });
  await c.get();
  fail = true;
  now.advance(90_000);
  const stale = await c.get();
  assert.equal(stale.cache, 'stale');
  assert.equal(stale.stale, true);
  assert.equal(stale.error, 'upstream down');
  now.advance(60_000);
  await assert.rejects(c.get(), /upstream down/);
});

test('stale data: a successful response whose feed header is old is flagged stale', async () => {
  const now = clock();
  const c = new FeedCache({ name: 't', ttlMs: 60_000, staleMs: 120_000, now, decode: decodeFake, load: async () => payload(NOW_S - 600) });
  const r = await c.get();
  assert.equal(r.cache, 'miss');
  assert.equal(r.stale, true);
});

test('rate limit: the hourly budget is never exceeded; cached data is served as rate-limited', async () => {
  const now = clock();
  const budget = new RateBudget(2, now);
  let calls = 0;
  const c = new FeedCache({ name: 't', ttlMs: 1_000, staleMs: 600_000, now, budget, decode: decodeFake, load: async () => { calls++; return payload(now() / 1000); } });
  await c.get(); now.advance(2_000);
  await c.get(); now.advance(2_000);
  const limited = await c.get();
  assert.equal(calls, 2);
  assert.equal(limited.cache, 'rate-limited');
  now.advance(3_600_000);
  assert.equal((await c.get()).cache, 'miss', 'budget refills after an hour');
});

test('rate limit: with no cached data the request fails rather than exceeding the budget', async () => {
  const budget = new RateBudget(0);
  const c = new FeedCache({ name: 't', ttlMs: 1_000, staleMs: 10_000, budget, decode: decodeFake, load: async () => payload(0) });
  await assert.rejects(c.get(), /budget/);
});

test('511 budget default stays under the 60 requests/hour allowance', () => {
  assert.ok(MAX_511_REQUESTS_PER_HOUR <= 54);
});

function service({ updates = [], vehicles = [], alerts = [], bartUpdates = null, bartAlerts = [], bartFails = false, apiKey = 'test-key-never-real', now = clock() } = {}) {
  const ok = data => async () => data;
  return new RealtimeService({
    indexes: fixtureIndexes(), apiKey, now,
    loaders: {
      updates: ok(feed(updates)), vehicles: ok(feed(vehicles)), alerts: ok(feed(alerts)),
      bartUpdates: bartFails ? async () => { throw new Error('BART trip updates request failed (network error)'); } : ok(feed(bartUpdates || [])),
      bartAlerts: bartFails ? async () => { throw new Error('BART alerts request failed (network error)'); } : ok(feed(bartAlerts))
    }
  });
}

test('legacy /api/realtime: ids are exact PREFIX:static values; unmatched ids are blank', async () => {
  const s = service({
    updates: [...manyMuniUpdates(120), tripUpdate('c', { tripId: 'CT:141', routeId: 'CT:Local', stops: [{ stopId: 'CT:70261', seq: 2, t: NOW_S + 60 }] }), tripUpdate('u', { tripId: 'SF:unknown', routeId: 'SF:38R', stops: [{ stopId: 'SF:15550', seq: 1, t: NOW_S + 60 }] })],
    vehicles: [vehicle('v1', { tripId: 'SF:11001', routeId: 'SF:38R' }), vehicle('v2', { tripId: 'SF:bad', routeId: 'SF:38R' })]
  });
  const body = await s.legacy();
  assert.equal(body.configured, true);
  const ct = body.updates.items.find(u => u.tripId === 'CT:141');
  assert.equal(ct.routeId, 'CT:77119');
  const unknown = body.updates.items.find(u => u.tripId === 'SF:unknown');
  assert.equal(unknown.routeId, '', 'unknown trips get no route, so the browser cannot attach them by route');
  assert.deepEqual(unknown.stopTimes, []);
  assert.equal(body.vehicles.items[0].routeId, 'SF:38R');
  assert.equal(body.vehicles.items[1].routeId, '');
  const muni = body.updates.items.find(u => u.tripId === 'SF:11001');
  assert.equal(muni.stopTimes[0].stopId, 'SF:15550');
  assert.equal(body.quality.muni.arrivalsVerified, true);
});

test('legacy /api/realtime: arrivals are withheld for agencies that fail the live gate', async () => {
  const s = service({ updates: [...manyMuniUpdates(25), tripUpdate('c', { tripId: 'CT:141', stops: [{ stopId: 'CT:70261', seq: 2, t: NOW_S + 60 }] })] });
  const body = await s.legacy();
  const ct = body.updates.items.find(u => u.tripId === 'CT:141');
  assert.equal(body.quality.caltrain.arrivalsVerified, false, 'one prediction is too few to verify');
  assert.deepEqual(ct.stopTimes, []);
  assert.equal(ct.routeId, 'CT:77119', 'route enrichment still applies');
});

test('BART direct: when live, it replaces the 511 BA entries and BART-only 511 alerts', async () => {
  const s = service({
    updates: [tripUpdate('ba511', { tripId: 'BA:1965118', stops: [{ stopId: 'BA:LAKE', seq: 1, t: NOW_S + 60 }] })],
    alerts: [alert('a1', 'BART delay from 511', [{ agencyId: 'BA' }]), alert('a2', 'Muni reroute', [{ agencyId: 'SF', routeId: 'SF:14' }])],
    bartUpdates: [tripUpdate('b1', { tripId: '1965118', stops: [{ stopId: 'A10-1', seq: 0, t: NOW_S + 60 }] })],
    bartAlerts: [alert('ba1', 'BART delay from BART', [{ routeId: '1' }])]
  });
  const snap = await s.snapshot();
  assert.deepEqual(snap.updates.map(u => `${u.agency}/${u.source}`), ['bart/bart']);
  assert.deepEqual(snap.alerts.map(a => a.header).sort(), ['BART delay from BART', 'Muni reroute']);
  const legacy = await s.legacy();
  const bartAlert = legacy.alerts.items.find(a => a.header === 'BART delay from BART');
  assert.deepEqual(bartAlert.entities[0], { agencyId: 'BA', routeId: 'BA:1', stopId: '', tripId: '' });
  assert.equal(legacy.vehicles.items.length, 0, 'BART publishes no vehicle positions and none are fabricated');
});

test('BART direct: when BART is unreachable, 511 BART entries are kept and the error is reported without URLs', async () => {
  const s = service({ bartFails: true, updates: [tripUpdate('ba511', { tripId: 'BA:1965118', stops: [] })] });
  const snap = await s.snapshot();
  assert.deepEqual(snap.updates.map(u => u.source), ['511']);
  assert.ok(snap.errors.some(e => e.feed === 'bartUpdates'));
  const text = JSON.stringify(await s.legacy());
  assert.ok(!text.includes('test-key-never-real'), 'the 511 key never appears in responses');
  assert.ok(!text.includes('api.bart.gov'));
});

test('511 not configured: BART direct still works and the 511 feeds are not requested', async () => {
  let called = false;
  const s = new RealtimeService({
    indexes: fixtureIndexes(), apiKey: undefined,
    loaders: { updates: async () => { called = true; return feed([]); }, vehicles: async () => { called = true; return feed([]); }, alerts: async () => { called = true; return feed([]); }, bartUpdates: async () => feed([tripUpdate('b', { tripId: '1965200', stops: [] })]), bartAlerts: async () => feed([]) }
  });
  const legacy = await s.legacy();
  assert.equal(called, false);
  assert.equal(legacy.live, true);
  assert.equal(legacy.updates.items[0].routeId, 'BA:7');
});

test('nothing configured: the response says so instead of pretending to be live', async () => {
  const s = new RealtimeService({ indexes: fixtureIndexes(), apiKey: undefined, bartDirect: false });
  const body = await s.legacy();
  assert.equal(body.configured, false);
  assert.equal(body.live, false);
});

test('hourly match log records each distinct snapshot once and rolls over by hour', async () => {
  const now = clock();
  const s = service({ updates: manyMuniUpdates(25), now });
  await s.snapshot();
  await s.snapshot();
  assert.equal(s.matchLog.report().currentHour.snapshots, 1);
  now.advance(3_600_000);
  await s.snapshot();
  const report = s.matchLog.report();
  assert.equal(report.completedHours.length, 1);
  assert.equal(report.completedHours[0].agencies.muni.tripMatchPct, 100);
});
