import test from 'node:test';
import assert from 'node:assert/strict';
import {planExperimental,dateContext,loadFor,candidateStops,straightLineMeters}
  from '../api/v2/experimental-plan.mjs';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const ROOT=new URL('../public/data/schedule/',import.meta.url);
const fixtureDay=(day)=>JSON.parse(gunzipSync(readFileSync(new URL(day+'.json.gz',ROOT))));
const now=new Date('2026-10-20T08:15:00-07:00');
const powell={fromLat:37.78461,fromLon:-122.40734,toLat:37.79740,toLon:-122.26510,time:now.toISOString()};
test('date selection follows Pacific time, not UTC date',()=>{
  assert.equal(dateContext(new Date('2026-10-20T01:00:00Z')).day,'2026-10-19');
  assert.equal(dateContext(now).day,'2026-10-20');
  assert.equal(dateContext(now).seconds,116100);
});
test('reject bad coordinates, invalid time, unsupported modes',()=>{
  assert.equal(planExperimental({toLat:37.7,toLon:-122.2},now).status,400);
  assert.equal(planExperimental({...powell,time:'abc'},now).status,400);
  assert.equal(planExperimental({...powell,arriveBy:'true'},now).status,422);
  assert.equal(planExperimental({...powell,access:'CAR_PARKING'},now).status,422);
});
test('planned BART trip returns frontend-compatible scheduled-only legs',()=>{
  const {status,body}=planExperimental(powell,now);
  assert.equal(status,200);
  assert.equal(body.routing.engine,'EXPERIMENTAL_SCHEDULE_ONLY');
  assert.equal(body.routing.realtime,'none');
  assert.match(body.routing.notes.join(' '),/NOT safe pedestrian routes/);
  assert.ok(body.itineraries.length);
  const it=body.itineraries[0];
  assert.ok(it.legs.some(l=>l.transit&&l.agency.id==='bart'));
  assert.ok(it.legs.filter(l=>l.transit).every(l=>l.trip.id&&l.route.id&&l.from.stop.id&&l.to.stop.id));
  assert.ok(it.legs.every(l=>Date.parse(l.end.scheduled)>=Date.parse(l.start.scheduled)));
  assert.ok(it.legs.filter(l=>!l.transit).every(l=>l.approximate&&!l.steps.length&&l.geometry===null));
});
test('missing days fail closed rather than pretending service exists',()=>{
  const result=planExperimental({...powell,time:'2026-10-29T08:15:00-07:00'},now);
  assert.equal(result.status,503);
});
test('endpoints must be close enough to a real GTFS stop',()=>{
  assert.equal(planExperimental({...powell,fromLat:37.7,fromLon:-122.5},now).status,422);
});
test('all five published agency feeds appear in timetable',()=>{
  const d=fixtureDay('2026-10-20');
  assert.deepEqual([...new Set(d.trips.map(t=>t[0]))].sort(),['act','bart','caltrain','muni','vta']);
});
test('nearest-stop selection favors platform and respects radius',()=>{
  const d=fixtureDay('2026-10-20');
  const nearby=candidateStops(d.stops,{lat:37.78461,lon:-122.40734},350,3);
  assert.equal(nearby.length,3);
  assert.ok(nearby[0].distance<=nearby[1].distance);
  assert.ok(straightLineMeters({lat:37.7,lon:-122.2},{lat:37.7,lon:-122.2})===0);
});
test('overnight request loads the prior service date',()=>{
  const {context,timetable}=loadFor(new Date('2026-10-20T00:45:00-07:00'));
  assert.deepEqual(timetable.serviceDates,['2026-10-19','2026-10-20']);
  assert.ok(context.seconds>86400);
});
