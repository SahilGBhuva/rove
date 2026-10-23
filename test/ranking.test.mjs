import test from 'node:test';
import assert from 'node:assert/strict';
import {rankItineraries} from '../experiments/bay-router/rank.mjs';
import {diverseCandidateStops,planExperimental} from '../api/v2/experimental-plan.mjs';
const make=(id,end,transfers,walk)=>({start:'2026-10-23T09:00:00Z',end:`2026-10-23T09:${String(end).padStart(2,'0')}:00Z`,durationSeconds:end*60,transfers,walkMeters:walk,legs:[{transit:true,agency:{id:'caltrain'},route:{id:'x'},trip:{id}}]});
test('ranking retains fastest, fewest transfers and least walking',()=>{
 const a=make('a',20,3,900),b=make('b',25,0,1000),c=make('c',30,2,100),d=make('d',35,4,1200);
 assert.deepEqual(rankItineraries([d,c,b,a],3),[a,b,c]);
});
test('duplicate trips keep the best arrival',()=>{
 const a=make('same',30,1,300),b=make('same',20,1,400);
 assert.deepEqual(rankItineraries([a,b],3),[b]);
});
test('nearby rail station is not crowded out by bus stops',()=>{
 const stops=Array.from({length:30},(_,i)=>['vta:'+i,'Bus',37.37+i*.00005,-122.04]);
 stops.push(['caltrain:sunnyvale','Sunnyvale',37.38,-122.04]);
 const selected=diverseCandidateStops(stops,{lat:37.37,lon:-122.04},1800);
 assert.ok(selected.some(s=>stops[s.index][0]==='caltrain:sunnyvale'));
});
test('Sunnyvale library to Pier 39 exposes a walk-to-Caltrain alternative',()=>{
 const t='2026-10-23T09:00:00-07:00';
 const r=planExperimental({fromLat:37.3717,fromLon:-122.0405,toLat:37.8087,toLon:-122.4098,time:t},new Date(t));
 assert.equal(r.status,200);
 assert.ok(r.body.itineraries.some(it=>it.legs[0].mode==='WALK'&&it.legs.some(l=>l.agency?.id==='caltrain')));
});
