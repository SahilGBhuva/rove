import test from 'node:test';import assert from 'node:assert/strict';
import {selectArrivals} from '../api/v2/arrivals.mjs';
const now=1792734799;
const update=(route,stop,time)=>({tripUpdate:{trip:{routeId:route,tripId:'SF:trip'},stopTimeUpdate:[{stopId:stop,departure:{time}}]}});
test('only exactly matched route and stop identifiers produce predictions',()=>{
 const f={timestamp:now,entities:[update('SF:5','15397',now+300),update('SF:unknown','15397',now+200),update('SF:5','fake',now+100)]};
 const result=selectArrivals(f,'muni','15397',now);
 assert.equal(result.status,'live');assert.equal(result.arrivals.length,1);assert.equal(result.arrivals[0].routeId,'5');
});
test('stale feed is not shown as live',()=>{
 assert.equal(selectArrivals({timestamp:now-1200,entities:[update('SF:5','15397',now+300)]},'muni','15397',now).status,'unverified');
});
test('unverified agencies do not invent arrivals',()=>{
 assert.equal(selectArrivals({timestamp:now,entities:[update('SC:22','15397',now+300)]},'vta','15397',now).status,'unverified');
});
