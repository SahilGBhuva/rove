import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = {};
vm.runInNewContext(readFileSync(new URL('../site/public/js/journey-audio.js', import.meta.url), 'utf8'), context);
const { describeStep } = context.RoveJourneyAudio;
test('boarding audio includes stop, platform, route and direction', () => {
 const speech = describeStep({type:'wait',leg:{from:{name:'Market Street',platform:'2'},headsign:'Downtown'},li:{badge:'22'}});
 for (const phrase of ['Market Street','platform 2','22','Downtown','Confirm']) assert.ok(speech.includes(phrase));
});
test('riding audio requires stop confirmation and does not assert GPS arrival', () => {
 const speech=describeStep({type:'ride',leg:{to:{name:'Mission Bay'}},li:{badge:'T'}},{remainingSteps:2});
 assert.match(speech,/Mission Bay/);
 assert.match(speech,/vehicle has stopped/);
 assert.match(speech,/2 journey steps/);
});
test('canceled trips never instruct boarding', () => {
 const speech=describeStep({type:'wait',leg:{canceled:true}});
 assert.match(speech,/Do not board/);
});
test('walking audio warns that GPS cannot detect obstacles', () => {
 const speech=describeStep({type:'walk',title:'Walk to the stop',meta:'250 meters'});
 assert.match(speech,/obstacles/);
 assert.match(speech,/250 meters/);
});
