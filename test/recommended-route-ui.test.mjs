import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const start=source.indexOf('function sortedItineraryIndexes(');
const end=source.indexOf('\nfunction legShapeMissing(',start);
assert.ok(start>=0 && end>start,'The route sort function must exist');
const sorter=source.slice(start,end);
function sort(sortMode,its) {
  const state={plan:{sort:sortMode,results:{itineraries:its,request:{arriveBy:false}}}};
  return [...runInNewContext(`${sorter}\nsortedItineraryIndexes()`,{state})];
}
const routes=[
 {startTime:'2026-10-23T16:00:00Z',endTime:'2026-10-23T17:45:00Z',durationSeconds:6300,transfers:1,walkMeters:300},
 {startTime:'2026-10-23T16:00:00Z',endTime:'2026-10-23T17:37:00Z',durationSeconds:5820,transfers:3,walkMeters:800},
 {startTime:'2026-10-23T16:00:00Z',endTime:'2026-10-23T17:50:00Z',durationSeconds:6600,transfers:0,walkMeters:150}
];
test('recommended route honors the routing engine rank',()=>{
 assert.deepEqual(sort('recommended',routes),[0,1,2]);
});
test('rider can explicitly select fastest, fewest transfers, or less walking',()=>{
 assert.deepEqual(sort('fastest',routes),[1,0,2]);
 assert.deepEqual(sort('transfers',routes),[2,0,1]);
 assert.deepEqual(sort('walking',routes),[2,0,1]);
});
test('results page defaults to recommended and offers a visible Best tab',()=>{
 assert.match(source,/plan\.sort = 'recommended';/);
 assert.match(source,/sortButton\('recommended', 'Best'\)/);
 assert.match(source,/Recommended<\/span>/);
});
