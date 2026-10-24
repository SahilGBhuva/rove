import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeShape,walkingPath,enrichWalks} from '../experiments/bay-router/pedestrian.mjs';
const sample=JSON.parse(readFileSync(new URL('./fixtures/pedestrian-valhalla.json',import.meta.url)));
const start={lat:37.7846,lon:-122.4073},end={lat:37.7852,lon:-122.4059};
const ok=async()=>({ok:true,json:async()=>sample});
const fail=async()=>({ok:false,status:503});
test('decodes Valhalla pedestrian polyline as [longitude, latitude] steps',()=>{
 const points=decodeShape(sample.trip.legs[0].shape);
 assert.ok(points.length>3);
 assert.ok(Math.abs(points[0][0]-start.lon)<0.0005);
 assert.ok(Math.abs(points[0][1]-start.lat)<0.0005);
});
test('pedestrian router extracts walkable geometry with geographic maneuvers',async()=>{
 const path=await walkingPath(start,end,ok);
 assert.equal(path.verified,true);
 assert.ok(path.geometry.coordinates.length>=3);
 assert.ok(path.distanceMeters>100);
 assert.match(path.steps[0].instruction,/Walk northeast/);
 assert.ok(Number.isFinite(path.steps[0].lat));
});
test('routing provider outage cannot create fake navigable path',async()=>{
 const result=await walkingPath({lat:37.786,lon:-122.4073},end,fail);
 assert.equal(result,null);
});
test('walking longer than available transfer slot disables navigation',async()=>{
 const initial='2026-10-20T16:00:00Z';
 const walk={mode:'WALK',from:start,to:end,start:{scheduled:initial},end:{scheduled:'2026-10-20T16:00:10Z'},durationSeconds:10};
 const ride={mode:'SUBWAY',transit:true,from:end,to:{lat:37.8,lon:-122.3},start:{scheduled:'2026-10-20T16:00:10Z'},end:{scheduled:'2026-10-20T16:15:00Z'}};
 const it={legs:[walk,ride],walkMeters:0};
 const ready=await enrichWalks(it,ok);
 assert.equal(ready,false);
 assert.equal(it.walkingVerified,false);
 assert.ok(walk.geometry.coordinates.length>2);
 assert.ok(walk.durationSeconds>walk.scheduledWalkSeconds);
});
test('walking with adequate time and real geometry enables navigation',async()=>{
 const walk={mode:'WALK',from:start,to:end,start:{scheduled:'2026-10-20T16:00:00Z'},end:{scheduled:'2026-10-20T16:03:00Z'}};
 const it={legs:[walk],walkMeters:0};
 assert.equal(await enrichWalks(it,ok),true);
 assert.ok(it.walkSeconds>0);
 assert.equal(it.walkingVerified,true);
});

test('walking instructions never show raw floating-point levels', async () => {
  const { cleanInstruction } = await import('../experiments/bay-router/pedestrian.mjs');
  assert.equal(cleanInstruction('Take the stairs to Level -1.5000000000.'), 'Take the stairs to Level -1.5.');
  assert.equal(cleanInstruction('Turn left onto Jessie Street.'), 'Turn left onto Jessie Street.');
});
