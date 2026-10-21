import test from 'node:test';
import assert from 'node:assert/strict';
await import('../site/public/js/search-intelligence.js');
const {correct,edits}=globalThis.RoveSearchIntelligence;
test('misspelled Sunnyvale library resolves to recognizable destination',()=>{
 assert.equal(correct('sunnyvake libary',new Map([['sunnyvale',15]])),'sunnyvale library');
});
test('keeps exact place names and address numbers untouched',()=>{
 assert.equal(correct('404 South Murphy Avenue',new Map([['murphy',9]])),'404 south murphy avenue');
 assert.equal(correct('Sunnyvale Public Library',new Map([['sunnyvale',9]])),'sunnyvale public library');
});
test('recognizes swapped neighboring letters without broad guessing',()=>{
 assert.equal(edits('berkely','berkeley'),1);
 assert.equal(correct('berkely station',new Map([['berkeley',12]])),'berkeley station');
 assert.equal(correct('random destination',new Map([['berkeley',12]])),'random destination');
});

test('corrects common transit station spelling while preserving abbreviations',()=>{
 assert.equal(correct('powll street'),'powell street');
 assert.equal(correct('SFO'),'sfo');
 assert.equal(correct('404 S Murphy Ave'),'404 s murphy ave');
});
