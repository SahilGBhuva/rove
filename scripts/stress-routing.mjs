import {planExperimental} from '../api/v2/experimental-plan.mjs';
import '../site/public/js/journey-guide.js';
const G=globalThis.RoveJourneyGuide;
const places=[['Powell',37.78461,-122.40734],['Oakland',37.7974,-122.2651],['Berkeley',37.8719,-122.2585],['Sunnyvale',37.3784,-122.0308],['Chase',37.768,-122.3877],['Diridon',37.3297,-121.9025],['Mountain View',37.3947,-122.0761],['Palo Alto',37.4434,-122.165],['Fruitvale',37.757,-122.253],['Fremont',37.5575,-121.9765],['Castro',37.7622,-122.435],['Ferry',37.793,-122.3965],['SFO',37.6152,-122.3899],['Ocean Beach',37.76,-122.509],['Richmond',37.937,-122.353]];
const times=['2026-10-20T08:15:00-07:00','2026-10-21T17:30:00-07:00','2026-10-23T23:40:00-07:00','2026-10-24T11:00:00-07:00'];
const durations=[];let count=0,nonempty=0,empty=0,errors=[],speechCount=0,transfers=0;let seed=7331;const rand=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);
const requested=Number(process.env.ROVE_STRESS_CASES || 120);
for(let i=0;i<requested;i++){
 const a=places[Math.floor(rand()*places.length)],b=places[Math.floor(rand()*places.length)];if(a===b)continue;
 const time=times[i%times.length],now=new Date(time),t=performance.now();const {status,body}=planExperimental({fromLat:a[1],fromLon:a[2],toLat:b[1],toLon:b[2],time},now);const ms=performance.now()-t;durations.push(ms);count++;
 if(status!==200){errors.push(`${a[0]} -> ${b[0]}: HTTP ${status}`);continue;}
 if(!body.itineraries?.length){empty++;continue;}nonempty++;
 for(const it of body.itineraries){if(Date.parse(it.end)<Date.parse(it.start))errors.push('negative itinerary duration');let prev=-Infinity;for(const leg of it.legs){const start=Date.parse(leg.start.scheduled),end=Date.parse(leg.end.scheduled);if(end<start||start<prev-1000)errors.push('overlapping leg '+a[0]+' '+b[0]);prev=end;}transfers+=it.transfers||0;
 const normalized={legs:it.legs.map(l=>({mode:l.transit?'TRANSIT':'WALK',transitMode:l.mode,agencyId:l.agency?.id,routeName:l.route?.shortName||l.route?.longName,headsign:l.headsign||l.trip?.headsign,tripShortName:l.trip?.shortName,from:{name:l.from?.name,platform:l.from?.stop?.platform},to:{name:l.to?.name},startTime:l.start?.scheduled,endTime:l.end?.scheduled,realtime:false,canceled:false,staySeated:!!l.staySeated,intermediateStops:l.intermediateStops||[],distanceMeters:l.distanceMeters,steps:l.steps||[],geometry:l.geometry}))};
 try{const guide=G.buildGuide(normalized,{destinationName:b[0]});for(const phase of guide.phases){const msg=G.speech(phase);if(!msg||msg.includes('undefined')||msg.includes('NaN'))errors.push('invalid speech '+a[0]+' '+b[0]+' '+phase.kind+':'+msg);speechCount++;}}catch(e){errors.push('speech error '+a[0]+' '+b[0]+':'+e.message)}
 }
}
durations.sort((a,b)=>a-b);const pct=p=>durations[Math.ceil(durations.length*p/100)-1];console.log(JSON.stringify({count,nonempty,empty,speechCount,transfers,medianMs:pct(50),p95Ms:pct(95),maxMs:pct(100),errors:errors.slice(0,25),errorCount:errors.length},null,2));
if (errors.length) process.exitCode=1;
