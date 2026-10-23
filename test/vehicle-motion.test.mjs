import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const ctx={};vm.runInNewContext(readFileSync(new URL('../public/js/vehicle-motion.js',import.meta.url),'utf8'),ctx);
const point=(x,y,id='bus')=>({type:'Feature',properties:{id,agency:'muni'},geometry:{type:'Point',coordinates:[x,y]}});
const fc=(...features)=>({type:'FeatureCollection',features});
test('vehicle positions interpolate between real GPS fixes only',()=>{
 const a=fc(point(-122.4,37.7)),b=fc(point(-122.399,37.7));
 const mid=ctx.RoveVehicleMotion.interpolateVehicles(a,b,.5).features[0].geometry.coordinates[0];
 assert.ok(Math.abs(mid+122.3995)<1e-7);
 assert.equal(ctx.RoveVehicleMotion.interpolateVehicles(a,b,0).features[0].geometry.coordinates[0],-122.4);
 assert.equal(ctx.RoveVehicleMotion.interpolateVehicles(a,b,1).features[0].geometry.coordinates[0],-122.399);
});
test('new buses and impossible GPS jumps snap rather than invent motion',()=>{
 const a=fc(point(-122.4,37.7)),far=fc(point(-122.2,37.7));
 assert.equal(ctx.RoveVehicleMotion.interpolateVehicles(a,far,.5).features[0].geometry.coordinates[0],-122.2);
 assert.equal(ctx.RoveVehicleMotion.interpolateVehicles(fc(),far,.5).features[0].geometry.coordinates[0],-122.2);
});
