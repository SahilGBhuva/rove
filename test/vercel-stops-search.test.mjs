import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/v2/stops/search.mjs';

function request(url, method='GET') {
  const result = { headers: {} };
  const res = {
    setHeader(k,v) {result.headers[k]=v;},
    status(code) {result.status=code; return this;},
    json(body) {result.body=body; return this;}
  };
  handler({url, method},res);
  return result;
}

test('Vercel station search finds named BART stations', () => {
  const r=request('/api/v2/stops/search?q=powell&agencies=bart&limit=3');
  assert.equal(r.status,200);
  assert.equal(r.body.query,'powell');
  assert.ok(r.body.results.length>0);
  assert.ok(r.body.results.length<=3);
  assert.ok(r.body.results.every(x=>x.agency==='bart'));
  assert.ok(r.body.results.some(x=>/powell/i.test(x.name)));
});
test('Vercel station search rejects non-GET methods',()=>{
  assert.equal(request('/api/v2/stops/search?q=powell','POST').status,405);
});
test('Vercel station search handles short queries, invalid agencies, and limits',()=>{
  assert.deepEqual(request('/api/v2/stops/search?q=p').body.results,[]);
  assert.deepEqual(request('/api/v2/stops/search?q=powell&agencies=invalid').body.results,[]);
  assert.ok(request('/api/v2/stops/search?q=station&limit=2').body.results.length<=2);
});
