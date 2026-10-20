import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const from = code.indexOf('function normalizeSearch(text) {');
const to = code.indexOf('function highlight(text, query) {', from);
assert.ok(from > -1 && to > from);
const network = JSON.parse(fs.readFileSync(new URL('../public/data/network.json', import.meta.url), 'utf8'));
const searchable = network.agencies.flatMap(a => a.stops
  .filter(s => !s.parent || !a.stops.some(parent => parent.id === s.parent))
  .map(s => ({a,s,haystack: (s.n + ' ' + a.name).toLowerCase()})));
const wordFrequency = new Map();
for (const entry of searchable) for (const word of new Set(entry.s.n.toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(' ').filter(w=>w.length>=4))) {
  wordFrequency.set(word,(wordFrequency.get(word)||0)+(entry.s.k?4:1));
}
const sandbox = {
  state: {visible: new Set(network.agencies.map(a => a.id))},
  idx: {routes: new Map(), searchable, children: new Map(),stopRoutes:new Map(),wordFrequency,correctionCache:new Map()},
  CATEGORY_RANK: {heavy:3, light:2,bus:1},
  stopCategory: agency => agency === 'bart' || agency === 'caltrain' ? 'heavy' : 'bus'
};
vm.createContext(sandbox);
vm.runInContext(code.slice(from,to) + '\nthis.api={normalizeSearch,typoDistance,transitSearchScore,searchNetwork}',sandbox);
const {searchNetwork,typoDistance}=sandbox.api;
const names = q => searchNetwork(q,{routes:false,stopLimit:10}).stops.map(x=>x.s.n.toLowerCase());
test('transposed letters count as a one-character typo',()=>{
  assert.equal(typoDistance('berkely','berkeley',2),1);
  assert.equal(typoDistance('diridn','diridon',2),1);
});
test('search recognizes misspelled Berkeley',()=>{
  assert.ok(names('berkely').some(x=>x.includes('berkeley')));
});
test('search recognizes misspelled Diridon',()=>{
  assert.ok(names('diridn').some(x=>x.includes('diridon')));
});
test('search recognizes incomplete station name',()=>{
  assert.ok(names('powel').some(x=>x.includes('powell')));
});
test('search recognizes two words despite small typo',()=>{
  assert.ok(names('downtwn berkeley').some(x=>x.includes('downtown berkeley')));
});
test('exact station names outrank weak fuzzy matches',()=>{
  assert.ok(names('Powell Street')[0]?.includes('powell street'));
});
test('nonsense does not return a false match',()=>{
  assert.equal(names('zzxyqpwt').length,0);
});
test('all five agencies exist in source GTFS map pins',()=>{
  assert.equal(network.agencies.length,5);
  assert.ok(network.agencies.every(a=>a.stops.every(s=>Array.isArray(s.p)&&s.p.length===2)));
});
test('platform pins use their own coordinates and respect filters',()=>{
  assert.match(code,/id: 'st-platform'/);
  assert.match(code,/minzoom: 16\.5/);
  assert.match(code,/id === 'st-platform'/);
});
test('mobile search inputs are 16px to prevent iOS focus zoom',()=>{
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(css,/\.search-field input, \.plan-field input \{ font-size: 16px; \}/);
});
