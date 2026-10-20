import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../navigation-core.js', import.meta.url), 'utf8') + '\nthis.Nav=RoveNavigation;', context);
const { Nav } = context;

test('route geometry measures off-route position, not distance to last stop', () => {
  const line = [[-122.03, 37.37], [-122.03, 37.38], [-122.04, 37.38]];
  assert.ok(Nav.distanceToPolyline([-122.03,37.375], line) < 1);
  assert.ok(Nav.distanceToPolyline([-122.04,37.375], line) > 400);
  assert.equal(Nav.distanceToPolyline([-122.03,37.375], []), null);
});
test('GPS quality filter ignores impossible jumps and invalid fixes', () => {
  const a = { point: [-122.03,37.37], accuracy: 6, time: 1000 };
  assert.ok(Nav.validFix(null, a));
  assert.ok(Nav.validFix(a, { point: [-122.0301,37.3701], accuracy: 6, time: 3000 }));
  assert.equal(Nav.validFix(a, { point: [-121.4,37.5], accuracy: 6, time: 3000 }), false);
  assert.equal(Nav.validFix(a, { point: [-122.03,37.37], accuracy: 300, time: 3000 }), false);
  assert.equal(Nav.validFix(a, { point: [-122.03,37.37], accuracy: 10, time: 500 }), false);
});
test('reroute waits for several accurate off-route fixes and cooldown', () => {
  const fix = { accuracy: 12 };
  assert.equal(Nav.shouldReroute(fix, 120, 2, 60000), false);
  assert.equal(Nav.shouldReroute(fix, 120, 3, 1000), false);
  assert.equal(Nav.shouldReroute(fix, 40, 6, 60000), false);
  assert.equal(Nav.shouldReroute({accuracy: 180}, 250, 8, 60000), false);
  assert.equal(Nav.shouldReroute(fix, 120, 3, 60000), true);
});
test('direction of travel east means ~90 degrees', () => {
  const deg=Nav.bearing([-122,37],[-121.999,37]);
  assert.ok(Math.abs(deg-90)<0.1);
});
