import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/v2/accessibility/guidance.mjs';
function request(method, body, type = 'application/json') {
 const headers = {};
 const res = {statusCode: 200, setHeader(k,v){headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
 handler({method,body,headers:{'content-type':type}},res);
 return {res,headers};
}
test('serverless endpoint rejects invalid methods and payloads',()=>{
 assert.equal(request('GET').res.statusCode,405);
 assert.equal(request('POST',{}).res.statusCode,400);
 assert.equal(request('POST',{itineraries:[]},'text/plain').res.statusCode,415);
});
test('serverless guidance explicitly declines unsafe capabilities',()=>{
 const {res,headers}=request('POST',{itineraries:[{id:'x',legs:[{mode:'WALK',from:{name:'A'},to:{name:'B'}}]}]});
 assert.equal(res.statusCode,200);
 assert.equal(res.body.capabilities.obstacleDetection,false);
 assert.equal(res.body.journeys[0].instructions.length,1);
 assert.equal(headers['Cache-Control'],'no-store');
});
