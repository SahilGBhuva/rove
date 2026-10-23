import test from 'node:test';
import assert from 'node:assert/strict';
import { accessibleJourney, accessibleJourneys } from '../lib/accessibility/guidance.mjs';
test('empty journey has no fabricated directions', () => {
 const result = accessibleJourney({legs: []});
 assert.equal(result.guidanceLevel, 'unavailable');
 assert.equal(result.instructions.length, 0);
});
test('walking steps are conservative and flag unverified geometry', () => {
 const result = accessibleJourney({legs:[{mode:'WALK',from:{name:'Home'},to:{name:'Stop'},distanceMeters:120}]});
 assert.match(result.instructions[0].speech, /mobility aid/);
 assert.match(result.warnings[0], /unavailable or unverified/);
 assert.equal(result.obstacleDetection, false);
});
test('transit guidance requires rider confirmation and warns when scheduled only', () => {
 const result = accessibleJourneys({itineraries:[{id:'trip1',legs:[{mode:'TRANSIT',routeName:'22',headsign:'Downtown',from:{name:'Main Street'},to:{name:'Library'},realtime:false}]}]});
 assert.match(result.journeys[0].instructions[0].speech, /verify the vehicle/);
 assert.equal(result.journeys[0].instructions[0].requiresConfirmation, true);
 assert.match(result.journeys[0].warnings[0], /not verified/);
 assert.equal(result.capabilities.safeCrossingDetection, false);
});
