// Live tracking: endpoint validation (no network) and app wiring contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/v2/live.mjs';
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const call = query => { const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { this.c = c; return this; }, json(b) { this.b = b; return this; } }; return Promise.resolve(handler({ method: 'GET', query }, res)).then(() => res); };

test('live endpoint validates input and never claims live data without a key', async () => {
  assert.equal((await call({ agency: 'nope', trip: '1' })).c, 400);
  assert.equal((await call({ agency: 'muni', trip: 'bad trip!' })).c, 400);
  const saved = process.env.SF_511_API_KEY; delete process.env.SF_511_API_KEY;
  const r = await call({ agency: 'muni', trip: 'muni:123' });
  if (saved) process.env.SF_511_API_KEY = saved;
  assert.equal(r.b.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(r.b), /api_key/);
});

test('itineraries carry trip and stop ids for live matching', () => {
  assert.match(app, /tripId: leg\.trip\?\.id \|\| null,/);
  assert.match(app, /stopId: p\.stop\?\.id \|\| null/);
  assert.ok(html.indexOf('live-tracker.js') < html.indexOf('app.js?'));
});

test('live data updates text in place, never moves focus, and never advances a step', () => {
  const panel = app.slice(app.indexOf('function renderLivePanel()'), app.indexOf('\nfunction ', app.indexOf('function renderLivePanel()') + 10));
  assert.match(panel, /if \(slot\.contains\(document\.activeElement\)\) return;/);
  for (const name of ['liveTick', 'pollLive', 'applyLive', 'renderLivePanel']) {
    const start = app.indexOf(`function ${name}(`);
    const body = app.slice(start, app.indexOf('\nfunction ', start + 10));
    assert.doesNotMatch(body, /CONFIRM|render\(\)/, `${name} must not confirm steps or re-render`);
  }
  assert.match(app, /livePacer\.offer\(/, 'announcements are paced');
  assert.match(app, /id="rgLive" class="rg-live" role="group" aria-label="Live status"/);
});

test('demo journeys never show or poll live data', () => {
  assert.match(app, /if \(!p \|\| nav\.demo \|\| !\['board', 'ride'\]\.includes\(p\.kind\)\) return null;/);
  assert.match(app, /if \(!window\.RoveLive \|\| nav\.demo\) return;/);
});
