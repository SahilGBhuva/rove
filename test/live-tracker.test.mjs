import test from 'node:test';
import assert from 'node:assert/strict';
import '../site/public/js/live-tracker.js';
const L = globalThis.RoveLive;
const NOW = 1_800_000_000;
const live = (board, extra = {}) => ({ status: 'live', board, ...extra });

test('countdown announces each threshold once, in live terms', () => {
  const given = new Set();
  const at = mins => L.liveNotices({ kind: 'board', vehicleName: 'Muni N train', live: live({ time: NOW + mins * 60, delay: 0, stopsAway: 4 }), now: NOW, given });
  assert.match(at(4.6)[0].message, /^Muni N train in about 5 minutes, live\.$/);
  given.add('count:5');
  assert.deepEqual(at(4.2), [], 'same threshold not repeated');
  assert.match(at(2.5)[0].message, /about 3 minutes/);
  assert.match(at(0.5)[0].message, /arriving now, live\. Confirm the route and direction/);
});

test('one stop away is urgent; delay changes of 2+ minutes are announced', () => {
  const n = L.liveNotices({ kind: 'board', vehicleName: 'AC Transit 51A bus', live: live({ time: NOW + 200, delay: 240, stopsAway: 1 }), now: NOW, given: new Set(), memory: { delay: 0 } });
  assert.equal(n[0].key, 'one-stop'); assert.equal(n[0].priority, 2);
  assert.ok(n.some(x => /now about 4 minutes late, live/.test(x.message)));
  const small = L.liveNotices({ kind: 'board', vehicleName: 'x', live: live({ time: NOW + 2000, delay: 60, stopsAway: 9 }), now: NOW, given: new Set(), memory: { delay: 0 } });
  assert.ok(!small.some(x => x.key.startsWith('delay')), 'a 1-minute change is not worth interrupting');
});

test('riding: two stops and next stop, from live stop counts', () => {
  const two = L.liveNotices({ kind: 'ride', place: 'Civic Center', live: { status: 'live', exit: { time: NOW + 300, stopsAway: 1 } }, now: NOW, given: new Set() });
  assert.match(two[0].message, /^Two stops to Civic Center, live\.$/);
  const next = L.liveNotices({ kind: 'ride', place: 'Civic Center', live: { status: 'live', exit: { time: NOW + 90, stopsAway: 0 } }, now: NOW, given: new Set() });
  assert.match(next[0].message, /Civic Center is the next stop, live\. Get ready to exit, and confirm with the announcement/);
});

test('canceled trips are announced; stale or missing data is silent', () => {
  assert.match(L.liveNotices({ kind: 'board', vehicleName: 'BART Blue line', live: { status: 'canceled' }, now: NOW, given: new Set() })[0].message, /canceled\. Open Help/);
  for (const status of ['stale', 'no-trip', 'unavailable']) assert.deepEqual(L.liveNotices({ kind: 'board', vehicleName: 'x', live: { status }, now: NOW, given: new Set() }), []);
});

test('walking guidance: direction and distance from good GPS only, never a confirmation', () => {
  const words = m => `${Math.round(m * 3.28)} feet`;
  const target = [-122.4000, 37.7800];
  const near = L.walkNotices({ fix: { point: [-122.4012, 37.7800], accuracy: 8, time: NOW }, target, place: 'Judah', now: NOW, given: new Set(), distanceWords: words });
  assert.equal(near.direction, 'east');
  assert.match(near.notices[0].message, /^About \d+ feet to Judah, to the east\. GPS estimate\.$/);
  const close = L.walkNotices({ fix: { point: [-122.4002, 37.7800], accuracy: 8, time: NOW }, target, place: 'Judah', now: NOW, given: new Set(), distanceWords: words });
  assert.match(close.notices[0].message, /should be very close\. Confirm when you're there/);
  assert.equal(L.walkNotices({ fix: { point: [-122.4002, 37.78], accuracy: 80, time: NOW }, target, place: 'J', now: NOW, given: new Set(), distanceWords: words }).status, 'weak');
  assert.equal(L.walkNotices({ fix: null, target, place: 'J', now: NOW, given: new Set(), distanceWords: words }).status, 'no-gps');
});

test('pacer: urgent now, others spaced out, latest pending kept', () => {
  const p = L.createPacer(15000);
  assert.ok(p.offer({ priority: 1, message: 'a' }, 0));
  assert.equal(p.offer({ priority: 1, message: 'b' }, 5000), null);
  assert.ok(p.offer({ priority: 2, message: 'urgent' }, 6000));
  assert.equal(p.flush(10000), null);
  assert.equal(p.flush(21001).message, 'b');
});

test('turn-by-turn: one cue per maneuver about 200 feet before, from good GPS only', () => {
  const words = m => `${Math.round(m * 3.28)} feet`;
  const step = { instruction: 'Turn left onto Jessie Street.' };
  const fix = { accuracy: 8, time: NOW };
  const far = L.maneuverNotices({ maneuver: { index: 1, step, metersAhead: 120 }, fix, now: NOW, given: new Set(), distanceWords: words, text: s => s.instruction });
  assert.deepEqual(far, []);
  const near = L.maneuverNotices({ maneuver: { index: 1, step, metersAhead: 45 }, fix, now: NOW, given: new Set(), distanceWords: words, text: s => s.instruction });
  assert.equal(near[0].message, 'In about 148 feet, turn left onto Jessie Street.');
  const now = L.maneuverNotices({ maneuver: { index: 1, step, metersAhead: 8 }, fix, now: NOW, given: new Set(), distanceWords: words, text: s => s.instruction });
  assert.equal(now[0].message, 'Turn left onto Jessie Street now.');
  assert.deepEqual(L.maneuverNotices({ maneuver: { index: 1, step, metersAhead: 45 }, fix, now: NOW, given: new Set(['turn:1']), distanceWords: words, text: s => s.instruction }), []);
  assert.deepEqual(L.maneuverNotices({ maneuver: { index: 1, step, metersAhead: 45 }, fix: { accuracy: 60, time: NOW }, now: NOW, given: new Set(), distanceWords: words, text: s => s.instruction }), [], 'weak GPS stays silent');
});
