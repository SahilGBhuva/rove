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

test('preview route includes transparent endpoint walking legs when places differ from station coordinates',()=>{
  const {status,body}=planExperimental({...powell,fromLat:37.78530,fromLon:-122.40734,toLat:37.79790},now);
  assert.equal(status,200);
  assert.ok(body.itineraries.length);
  const it=body.itineraries[0];
  assert.equal(it.legs[0].mode,'WALK');
  assert.equal(it.legs.at(-1).mode,'WALK');
  assert.equal(it.legs[0].from.name,'Starting point');
  assert.equal(it.legs.at(-1).to.name,'Destination');
  assert.ok(it.legs[0].approximate && it.legs.at(-1).approximate);
  assert.ok(it.walkMeters>0 && it.walkSeconds>0);
  assert.ok(it.legs.filter(l=>!l.transit).every(l=>l.geometry===null&&!l.steps.length));
  assert.equal(it.start,it.legs[0].start.scheduled);
  assert.equal(it.end,it.legs.at(-1).end.scheduled);
});

test('404 South Murphy Avenue to Berkeley city center finds a scheduled itinerary',()=>{
 const result=planExperimental({fromLat:37.372448,fromLon:-122.031308,toLat:37.870839,toLon:-122.272863,time:'2026-10-20T21:00:00-07:00'},new Date('2026-10-20T21:00:00-07:00'));
 assert.equal(result.status,200);
 assert.ok(result.body.itineraries.length>0);
 assert.ok(result.body.itineraries[0].legs.some(l=>l.transit));
});

test('seven regional origin/destination pairs find transit on weekday mornings',()=>{
 const points={sunnyvale:[37.372448,-122.031308],berkeley:[37.870839,-122.272863],powell:[37.78461,-122.40734],downtownBerkeley:[37.79740,-122.26510],paloAlto:[37.4432,-122.1644],mountainView:[37.3945,-122.076],oakland:[37.8047,-122.271],fremont:[37.5575,-121.9765],sanjose:[37.3299,-121.903]};
 const pairs=[['sunnyvale','berkeley'],['powell','downtownBerkeley'],['paloAlto','mountainView'],['oakland','powell'],['fremont','downtownBerkeley'],['sanjose','sunnyvale'],['berkeley','oakland']];
 for(const [a,b] of pairs){const [fl,fn]=points[a],[tl,tn]=points[b];const r=planExperimental({fromLat:fl,fromLon:fn,toLat:tl,toLon:tn,time:'2026-10-21T08:15:00-07:00'},now);assert.equal(r.status,200,`${a} → ${b} HTTP`);assert.ok(r.body.itineraries.length,`${a} → ${b} must have a route`);}
});

test('broader stop search finds a late Sunnyvale to Berkeley connection',()=>{
 const t='2026-10-22T21:50:00-07:00';
 const r=planExperimental({fromLat:37.36,fromLon:-122.01,toLat:37.8671,toLon:-122.2532,time:t},new Date(t));
 assert.equal(r.status,200);
 assert.ok(r.body.itineraries.length>0,'should find a transit route beyond the four nearest stops');
});
