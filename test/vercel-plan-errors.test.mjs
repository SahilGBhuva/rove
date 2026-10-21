import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/v2/experimental-plan.mjs';

test('invalid coordinates return JSON validation error, not server failure', async () => {
 const out={};
 const res={setHeader(){},status(n){out.status=n;return this;},json(v){out.body=v;return this;}};
 await handler({method:'GET',url:'/api/v2/experimental-plan?fromLat=bad&fromLon=0&toLat=37.8&toLon=-122.2'},res);
 assert.equal(out.status,400);
 assert.match(out.body.error,/coordinates/i);
});
