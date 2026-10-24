import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context={};
vm.runInNewContext(readFileSync(new URL('../public/js/journey-assist.js',import.meta.url),'utf8'),context);
const j=context.RoveJourneyAssist;
const stops=[
  {name:'Board',lat:37.78,lon:-122.40},
  {name:'First',lat:37.781,lon:-122.40},
  {name:'Second',lat:37.782,lon:-122.40},
  {name:'Exit',lat:37.783,lon:-122.40}
];
const now=Date.now();
const fix=(lat,time=now,accuracy=12)=>({point:[-122.4,lat],accuracy,time});
test('stop sequence is explicit: missing intermediate stops are unknown',()=>{
  assert.equal(j.stopSequence({from:stops[0],to:stops[3]}),null);
  assert.equal(j.stopSequence({from:stops[0],intermediateStops:[],to:stops[3]}),null);
  assert.equal(j.stopSequence({from:stops[0],intermediateStops:[{name:'Missing geometry'}],to:stops[3]}),null);
  assert.equal(j.stopSequence({from:stops[0],intermediateStops:stops.slice(1,-1),to:stops[3]}).length,4);
});
test('GPS needs two time-separated accurate fixes; does not skip stops',()=>{
  const initial={confirmed:0,pending:null};
  const a=j.updateStopProgress(stops,initial,fix(37.781,now-6000),now);
  assert.equal(a.confirmed,0);assert.equal(a.reason,'awaiting-second-fix');
  const b=j.updateStopProgress(stops,a,fix(37.781,now),now);
  assert.equal(b.changed,true);assert.equal(b.confirmed,1);assert.equal(b.remaining,2);
  const c=j.updateStopProgress(stops,b,fix(37.783,now+1000),now+1000);
  assert.equal(c.confirmed,1);
});
test('closely spaced stops never advance from a stationary GPS position',()=>{
 const close=[{name:'Board',lat:37.7800,lon:-122.4},
   {name:'Stop A',lat:37.7805,lon:-122.4},
   {name:'Stop B',lat:37.7810,lon:-122.4},
   {name:'Exit',lat:37.7820,lon:-122.4}];
 const first=j.updateStopProgress(close,{confirmed:0,pending:null},fix(37.7805,now-6000),now);
 const second=j.updateStopProgress(close,first,fix(37.7805,now),now);
 assert.equal(second.confirmed,0);
 assert.equal(second.reason,'still-near-previous-stop');
 const manual={confirmed:1,pending:null};
 const next=j.updateStopProgress(close,manual,fix(37.7805,now),now);
 assert.equal(next.confirmed,1);
 assert.equal(next.changed,false);
});
test('reject stale inaccurate or repeated fixes',()=>{
 const initial={confirmed:0,pending:null};
 assert.equal(j.updateStopProgress(stops,initial,fix(37.781,now-30000),now).reason,'location-uncertain');
 assert.equal(j.updateStopProgress(stops,initial,fix(37.781,now,70),now).reason,'location-uncertain');
 const first=j.updateStopProgress(stops,initial,fix(37.781,now),now);
 assert.equal(j.updateStopProgress(stops,first,fix(37.781,now),now).confirmed,0);
});
test('find transfer only if itinerary includes boarding leg',()=>{
 const later=new Date(now+600000);
 const steps=[{type:'ride'},{type:'walk'},{type:'wait',li:{badge:'BART Red'},leg:{headsign:'Richmond',from:{name:'Millbrae'}},departs:later}];
 const t=j.nextTransfer(steps,0);
 assert.equal(t.route,'BART Red');assert.equal(t.stop,'Millbrae');
 assert.equal(j.nextTransfer(steps,2),null);
});
test('journey snapshots preserve progress but expire and reject corruption',()=>{
 let cache=null;
 const storage={setItem(k,v){cache=v},getItem(){return cache},removeItem(){cache=null}};
 const nav={it:{legs:[{mode:'TRANSIT'}],endTime:new Date(now+3600000).toISOString()},
   destination:{name:'Station',lat:37.78,lon:-122.4},steps:[{type:'ride'}],i:0,boarded:true,stopProgress:{confirmed:1}};
 assert.equal(j.store(nav,storage,now),true);
 assert.equal(j.load(storage,now).boarded,true);
 assert.equal(j.load(storage,now+13*3600000),null);
 cache='{bad json';assert.equal(j.load(storage,now),null);
 j.clear(storage);assert.equal(cache,null);
});

test('route-level live predictions require exact route matching and a fresh feed',()=>{
 const feed={status:'live',feed:{headerTimestamp:Math.floor(now/1000)},stale:false,
 arrivals:[{routeId:'22',tripId:'SF:trip-a',time:Math.floor(now/1000)+240},
           {routeId:'522',tripId:'SF:trip-b',time:Math.floor(now/1000)+180}]};
 const v=j.matchArrivals(feed,'22','SF:trip-a',now);
 assert.equal(v.status,'live');assert.equal(v.estimates.length,1);assert.equal(v.exactTrip,true);
 assert.equal(j.matchArrivals(feed,'7',null,now).status,'no-route-prediction');
 assert.equal(j.matchArrivals({...feed,feed:{headerTimestamp:Math.floor(now/1000)-600}},'22',null,now).status,'unverified');
 assert.equal(j.matchArrivals({...feed,status:'no-predictions'},'22',null,now).status,'unverified');
 assert.equal(j.matchArrivals({...feed,stale:true},'22',null,now).status,'unverified');
});
