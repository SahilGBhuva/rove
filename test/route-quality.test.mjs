import test from 'node:test';
import assert from 'node:assert/strict';
import {findJourney,findJourneys,directFootpaths} from '../experiments/bay-router/route.mjs';
import {pacificMidnight,serviceDayOffset} from '../experiments/bay-router/timezone.mjs';
import {combineServiceDays} from '../experiments/bay-router/combine-days.mjs';
import {adaptJourney,dateContext} from '../api/v2/experimental-plan.mjs';
import {rankItineraries} from '../experiments/bay-router/rank.mjs';

const stops = [
 ['x:A','Origin',37.7,-122.4],['x:B','Stop B',37.71,-122.4],
 ['x:C','Destination',37.72,-122.4],['x:D','Stop D',37.715,-122.4]
];
const trips = [
 ['x','transfer1','t1','T1','D','3'],
 ['x','direct','t2','D','C','2'],
 ['x','transfer2','t3','T2','C','3']
];
const data = {date:'2026-10-23',stops,trips,connections:[
 [0,3,100,200,0,3], [0,2,130,600,1,3], [3,2,300,420,2,3]
]};

test('one connection scan produces correct independent destinations',()=>{
 const answers=findJourneys(data,0,[1,2,3],0,{footpaths:[]});
 assert.equal(answers.get(1),null);
 assert.equal(answers.get(2).arrivalSeconds,420);
 assert.equal(answers.get(3).arrivalSeconds,200);
 assert.deepEqual(answers.get(2).legs,findJourney(data,0,2,0,{footpaths:[]}).legs);
});
test('transfer-aware search prefers a slightly later direct ride over a risky transfer',()=>{
 const fast=findJourney(data,0,2,0,{footpaths:[]});
 const simple=findJourney(data,0,2,0,{footpaths:[],transferPenaltySeconds:300});
 assert.equal(fast.arrivalSeconds,420);
 assert.equal(fast.legs.filter(l=>l.type==='transit').length,2);
 assert.equal(simple.arrivalSeconds,600);
 assert.equal(simple.legs.filter(l=>l.type==='transit').length,1);
});
test('GTFS rail is rail, not bus, and duplicate trip IDs retain scanned service-day identity',()=>{
 const dup={date:'2026-10-23',stops,trips:[['x','same','bus','Bus','D','3'],['x','same','rail','Rail','C','2']]};
 const journey={departureSeconds:130,arrivalSeconds:600,durationSeconds:470,legs:[{
   type:'transit',agency:'x',tripId:'same',tripIndex:1,from:'x:A',to:'x:C',depart:130,arrive:600,headsign:'C'
 }]};
 const it=adaptJourney(journey,dup,null,null,pacificMidnight('2026-10-23'));
 assert.equal(it.legs[0].mode,'RAIL');
 assert.equal(it.legs[0].route.id,'rail');
});
test('Pacific service days use real elapsed hours across DST transitions',()=>{
 assert.equal(new Date(pacificMidnight('2026-11-01')).toISOString(),'2026-11-01T07:00:00.000Z');
 assert.equal(serviceDayOffset('2026-11-01','2026-11-02'),90000);
 assert.equal(serviceDayOffset('2027-03-14','2027-03-15'),82800);
 const makeDay=day=>({date:day,stops,trips:[trips[0]],connections:[[0,3,100,200,0,3]]});
 const combined=combineServiceDays([makeDay('2026-11-01'),makeDay('2026-11-02')]);
 assert.equal(combined.connections[1][2],90100);
 assert.equal(dateContext(new Date('2026-11-02T16:00:00Z')).seconds,90000+8*3600);
});
test('balanced recommendation avoids extra transfers for negligible time savings',()=>{
 const mk=(id,minute,transfers)=>({start:'2026-10-23T09:00:00Z',end:`2026-10-23T09:${String(minute).padStart(2,'0')}:00Z`,
 durationSeconds:minute*60,transfers,walkMeters:500,legs:[{transit:true,agency:{id:'x'},route:{id:'a'},trip:{id}}]});
 const quickest=mk('quick',20,3),simple=mk('simple',23,1),slow=mk('slow',29,2);
 const chosen=rankItineraries([quickest,simple,slow],3);
 assert.equal(chosen[0],simple);
 assert.ok(chosen.includes(quickest));
});

test('rail platform transfers have a realistic minimum buffer',()=>{
 const nearby=[['caltrain:a','Rail',37.7,-122.4],['bart:b','Rail',37.7002,-122.4],
   ['muni:c','Bus',37.701,-122.4],['muni:d','Bus',37.7012,-122.4]];
 const paths=directFootpaths(nearby,250);
 assert.ok(paths[0].find(([j])=>j===1)[1]>=180);
 assert.ok(paths[2].find(([j])=>j===3)[1]>=75);
 assert.ok(paths[0].find(([j])=>j===1)[1]>paths[2].find(([j])=>j===3)[1]);
});
