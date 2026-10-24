// Reproducible schedule-only demo routing QA against the checked-in GTFS snapshot.
// No public geocoder or walking-router network requests are made here.
import {planExperimental} from '../api/v2/experimental-plan.mjs';
const points={
  haight:[37.7699,-122.4468],chase:[37.768,-122.3877],
  sunnyvale:[37.372448,-122.031308],berkeley:[37.870839,-122.272863],
  powell:[37.78461,-122.40734],oakland:[37.8047,-122.271],
  fremont:[37.5575,-121.9765],sanjose:[37.3299,-121.903],
  pier39:[37.8087,-122.4098],paloalto:[37.4432,-122.1644]
};
const pairs=[['haight','chase'],['sunnyvale','berkeley'],['berkeley','sunnyvale'],
  ['powell','oakland'],['fremont','berkeley'],['sanjose','sunnyvale'],
  ['sunnyvale','pier39'],['paloalto','chase']];
const departure='2026-10-23T09:00:00-07:00';
let failures=0;
for (const [a,b] of pairs) {
  const [fromLat,fromLon]=points[a],[toLat,toLon]=points[b];
  const start=performance.now();
  const r=planExperimental({fromLat,fromLon,toLat,toLon,time:departure},new Date(departure));
  const ms=Math.round(performance.now()-start);
  const itineraries=r.body.itineraries||[];
  const valid=r.status===200 && itineraries.length>0 && itineraries.every(it=>
    it.legs.some(l=>l.transit) && it.legs.every((l,i)=>
      Number.isFinite(Date.parse(l.start.scheduled)) &&
      Date.parse(l.start.scheduled)<=Date.parse(l.end.scheduled) &&
      (i===0 || Date.parse(l.start.scheduled)>=Date.parse(it.legs[i-1].end.scheduled))));
  if (!valid) failures++;
  console.log(valid?'PASS':'FAIL',`${a} → ${b}`,`${ms}ms`,
    itineraries.map(it=>`${Math.round(it.durationSeconds/60)}min/${it.transfers} transfers`).join(' | '));
}
console.log(`${pairs.length-failures}/${pairs.length} itinerary cases passed`);
process.exitCode=failures?1:0;
