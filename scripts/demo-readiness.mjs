/* Public deployment smoke tests. Run with ROVE_URL=https://... node scripts/demo-readiness.mjs */
const origin = new URL(process.env.ROVE_URL || 'http://localhost:4173').origin;
const checks=[['website','/'],['network','/public/data/network.json'],['app script','/app.js'],['search script','/public/js/search-intelligence.js'],['routing status','/api/v2/status'],['stop search','/api/v2/stops/search?q=powell']];
const journeys=[['Sunnyvale → Berkeley',37.372448,-122.031308,37.870839,-122.272863],['Berkeley → Sunnyvale',37.870839,-122.272863,37.372448,-122.031308],['Powell → Oakland',37.78461,-122.40734,37.8047,-122.271],['Fremont → Berkeley',37.5575,-121.9765,37.7974,-122.2651],['San Jose → Sunnyvale',37.3299,-121.903,37.372448,-122.031308]];
let failures=0;
async function get(path){const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),20000);try{return await fetch(origin+path,{signal:ctrl.signal})}finally{clearTimeout(timer)}}
for(const [name,path] of checks){try{const r=await get(path);if(!r.ok)throw Error('HTTP '+r.status);if(name==='routing status' && !(await r.json()).routing?.available)throw Error('routing unavailable');if(name==='stop search' && !Array.isArray((await r.json()).results))throw Error('invalid search response');console.log('PASS',name)}catch(e){failures++;console.log('FAIL',name,e.message)}}
const localDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+86400000));
const date=new Date(`${localDay}T15:15:00Z`); // 8:15 AM PDT during demo week (October).
for(const [name,a,b,c,d] of journeys){try{const query=new URLSearchParams({fromLat:a,fromLon:b,toLat:c,toLon:d,time:date.toISOString(),limit:1});const r=await get('/api/v2/plan?'+query);if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(!j.itineraries?.some(it=>it.legs?.some(l=>l.transit)))throw Error('no usable transit itinerary');console.log('PASS',name)}catch(e){failures++;console.log('FAIL',name,e.message)}}
console.log(`${checks.length+journeys.length-failures}/${checks.length+journeys.length} passed`);process.exitCode=failures?1:0;
