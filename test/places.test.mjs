// Fixture tests for place search ranking and normalization. The real index is
// checked separately in test/static-data.test.mjs when it is installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaceIndex, normalizePlaceText } from '../lib/places.mjs';
import { ROWS, fixtureDb } from './helpers-places.mjs';



const { index } = await PlaceIndex.open(fixtureDb(ROWS));

test('normalization makes abbreviations and full words equivalent', () => {
  assert.equal(normalizePlaceText('1355 Market St.'), normalizePlaceText('1355 Market Street'));
  assert.equal(normalizePlaceText('Dr Carlton B Goodlett Pl'), normalizePlaceText('Doctor Carlton B Goodlett Place'));
  assert.equal(normalizePlaceText('Café & Bar'), 'cafe and bar');
});

test('house number search prefers the exact number over neighbors on the same street', () => {
  const r = index.search('1355 market st');
  assert.equal(r[0].name, '1355 Market Street');
  assert.ok(!r.slice(0, 1).some(x => x.name === '135 Market Street'));
});

test('abbreviated street names find the full OSM name', () => {
  assert.equal(index.search('1 dr carlton b goodlett pl')[0].name, '1 Doctor Carlton B Goodlett Place');
});

test('alternate names such as airport codes are searchable', () => {
  assert.equal(index.search('sfo')[0].name, 'San Francisco International Airport');
});

test('a location bias puts the nearer of two same-named places first', () => {
  assert.equal(index.search('philz', { near: { lat: 37.44, lon: -122.16 } })[0].city, 'Palo Alto');
  assert.equal(index.search('philz', { near: { lat: 37.77, lon: -122.39 } })[0].city, 'San Francisco');
});

test('typing an unfinished word matches by prefix', () => {
  assert.equal(index.search('philz cof')[0].name, 'Philz Coffee');
});

test('queries that are too short or match nothing return no results', () => {
  assert.deepEqual(index.search('a'), []);
  assert.deepEqual(index.search('zzzzqqq'), []);
});

test('reverse lookup returns the closest address', () => {
  const r = index.reverse(37.77697, -122.41660);
  assert.equal(r.name, '1355 Market Street');
  assert.ok(r.distanceMeters < 10);
});

test('a curated anchor moves a misplaced campus to its center', () => {
  const r = index.search('uc berkeley')[0];
  assert.equal(r.name, 'University of California, Berkeley');
  assert.equal(r.city, 'Berkeley');
  assert.equal(r.address, 'Berkeley');
  assert.deepEqual([r.lat, r.lon], [37.872073, -122.257829]);
  // The stored hill point no longer names a tap there.
  assert.notEqual(index.reverse(37.8755, -122.239069)?.name, 'University of California, Berkeley');
});

test('a missing index reports why instead of failing', async () => {
  const r = await PlaceIndex.open('/nonexistent/places.sqlite');
  assert.equal(r.index, null);
  assert.match(r.reason, /not found/);
});
