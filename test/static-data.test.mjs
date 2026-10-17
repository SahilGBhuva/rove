// Checks against the real, locally installed GTFS (data/extracted). Skipped when the data is absent (for example in CI).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AGENCIES } from '../lib/agencies.mjs';
import { loadStaticIndexes } from '../lib/gtfs/static-index.mjs';

const extracted = path.resolve(import.meta.dirname, '../data/extracted');
const present = Object.keys(AGENCIES).every(id => fs.existsSync(path.join(extracted, id, 'trips.txt')));
const opts = { skip: present ? false : 'data/extracted is not installed (run npm run refresh-data)' };

let cached;
const indexes = async () => (cached ||= (await loadStaticIndexes(Object.values(AGENCIES), extracted)).indexes);

test('real GTFS: every agency index loads with trips, stops and routes', opts, async () => {
  const idx = await indexes();
  for (const id of Object.keys(AGENCIES)) {
    const i = idx.get(id);
    assert.ok(i, id);
    assert.ok(i.trips.size > 0 && i.stops.size > 0 && i.routes.size > 0, id);
    for (const t of i.trips.values()) assert.ok(i.routes.has(t.routeId), `${id}: trip route ${t.routeId} exists`);
  }
});

test('real GTFS: VTA public stop codes are unique, so the stop_code crosswalk is an exact key', opts, async () => {
  const vta = (await indexes()).get('vta');
  assert.ok(vta.stopCodes.size > 3000);
  const ids = new Set(vta.stopCodes.values());
  assert.equal(ids.size, vta.stopCodes.size);
  assert.ok(vta.tripStops.size > 10000, 'trip/sequence crosswalk loaded');
});

test('real GTFS: every Caltrain trip resolves to a route for realtime enrichment', opts, async () => {
  const ct = (await indexes()).get('caltrain');
  assert.ok(ct.trips.size > 100);
  assert.ok([...ct.trips.values()].every(t => ct.routes.has(t.routeId)));
});

test('real GTFS: BART static has no 600-range trip ids, matching the documented Antioch exception', opts, async () => {
  const bart = (await indexes()).get('bart');
  assert.ok(![...bart.trips.keys()].some(id => /^6\d\d$/.test(id)));
});

test('real GTFS: every agency has active service on each of the next seven days', opts, async () => {
  const idx = await indexes();
  for (let d = 0; d < 7; d++) {
    const ymd = new Date(Date.now() + d * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).replaceAll('-', '');
    for (const [id, i] of idx) {
      const services = new Set([...i.trips.values()].map(t => t.serviceId));
      assert.ok([...services].some(s => i.calendar.isActive(s, ymd)), `${id} has service on ${ymd}`);
    }
  }
});
