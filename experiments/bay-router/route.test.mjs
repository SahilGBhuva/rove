import assert from 'node:assert/strict';
import test from 'node:test';
import { findJourney, directFootpaths } from './route.mjs';

const stops = [
  ['a:1', 'Start', 37.0, -122.0, ''],
  ['a:2', 'Mid', 37.002, -122.0, ''],
  ['b:3', 'Transfer', 37.00205, -122.0, ''],
  ['b:4', 'End', 37.004, -122.0, '']
];
const trips = [['a', 'ride1', 'r1', '1', 'Mid', '3'], ['b', 'ride2', 'r2', '2', 'End', '3']];
const base = {date:'2026-10-20',stops,trips,connections:[
  [0,1,500,600,0,3],[2,3,750,800,1,3]
]};
test('journey with pedestrian transfer at another agency', () => {
  const footpaths = directFootpaths(stops,120);
  const journey = findJourney(base,0,3,450,{footpaths});
  assert.ok(journey);
  assert.equal(journey.arrivalSeconds,800);
  assert.deepEqual(journey.legs.map(l=>l.type),['transit','approximate-walk','transit']);
  assert.deepEqual(journey.legs.filter(l=>l.type==='transit').map(l=>l.agency),['a','b']);
});
test('cannot board without a permitted pickup',()=>{
  assert.equal(findJourney({...base,connections:[[0,1,500,600,0,2]]},0,1,450),null);
});
test('cannot alight without permitted drop-off',()=>{
  assert.equal(findJourney({...base,connections:[[0,1,500,600,0,1]]},0,1,450),null);
});
test('rejects departures outside five-hour search window',()=>{
  assert.equal(findJourney(base,0,1,0,{maxSeconds:100}),null);
});
test('reject invalid origin stop',()=>{
  assert.throws(()=>findJourney(base,99,1,450),/Invalid/);
});
test('returns zero-duration journey for same stop',()=>{
  const j=findJourney(base,0,0,450);
  assert.equal(j.durationSeconds,0);
  assert.deepEqual(j.legs,[]);
});
