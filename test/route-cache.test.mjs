import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedPlan} from '../api/v2/experimental-plan.mjs';

test('identical explicit-time route requests reuse the same in-flight computation', async()=>{
 let calls=0;
 const planner=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {status:200,body:{itineraries:[]}}};
 const q=new URLSearchParams({fromLat:'37.7',toLat:'37.8',time:'2026-10-24T11:00:00-07:00'});
 const [a,b]=await Promise.all([cachedPlan(q,planner),cachedPlan(q,planner)]);
 assert.equal(calls,1);assert.strictEqual(a,b);
 await cachedPlan(q,planner);assert.equal(calls,1);
});
test('implicit-now requests are never cached',async()=>{
 let calls=0;const planner=async()=>({status:200,body:{count:++calls}});
 const q=new URLSearchParams({fromLat:'37.7',toLat:'37.8'});
 await cachedPlan(q,planner);await cachedPlan(q,planner);assert.equal(calls,2);
});
test('failed route responses are not cached',async()=>{
 let calls=0;const planner=async()=>({status:503,body:{count:++calls}});
 const q=new URLSearchParams({time:'2026-10-25T13:00:00-07:00',fromLat:'37.7'});
 await cachedPlan(q,planner);await cachedPlan(q,planner);assert.equal(calls,2);
});
