// Serverless-compatible, explicitly experimental schedule-only route API.
// No OTP JVM, API keys, hidden external requests, live arrivals, or driving.
// Exposed by /api/v2/plan with clear preview warnings and navigation disabled.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {findJourneys, directFootpaths} from '../../experiments/bay-router/route.mjs';
import {combineServiceDays} from '../../experiments/bay-router/combine-days.mjs';
import {enrichWalks} from '../../experiments/bay-router/pedestrian.mjs';
import {rankItineraries} from '../../experiments/bay-router/rank.mjs';
import {pacificMidnight} from '../../experiments/bay-router/timezone.mjs';

const TZ = 'America/Los_Angeles';
const MAX_ENDPOINT_METERS = 1100;
const loaded = new Map();
const combinedCache = new Map();
const footpathCache = new WeakMap();
function localParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
    minute:'2-digit',second:'2-digit',hourCycle:'h23'
  }).formatToParts(date).map(p=>[p.type,p.value]));
}
function isoDayBefore(day) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}
export function dateContext(instant) {
  const p=localParts(instant);
  const day=`${p.year}-${p.month}-${p.day}`;
  return {day, previousDay:isoDayBefore(day),
    seconds:(instant.getTime()-pacificMidnight(isoDayBefore(day)))/1000};
}
function loadDay(day) {
  if (loaded.has(day)) return loaded.get(day);
  const url = new URL('../../public/data/schedule/'+day+'.json.gz', import.meta.url);
  const data = JSON.parse(gunzipSync(readFileSync(url)));
  if (data.date!==day) throw new Error('Schedule date mismatch');
  loaded.set(day,data);
  if (loaded.size>3) loaded.delete(loaded.keys().next().value);
  return data;
}
export function loadFor(instant, loader=loadDay) {
  const context=dateContext(instant);
  const key=context.previousDay+'|'+context.day;
  if (loader===loadDay && combinedCache.has(key))
    return {context,timetable:combinedCache.get(key)};
  const days=[context.previousDay,context.day].map(loader);
  const timetable=combineServiceDays(days);
  if (loader===loadDay) {
    combinedCache.set(key,timetable);
    if (combinedCache.size>2) combinedCache.delete(combinedCache.keys().next().value);
  }
  return {context,timetable};
}
export function straightLineMeters(a,b) {
  const dy=(a.lat-b.lat)*111200;
  const dx=(a.lon-b.lon)*111200*Math.cos(a.lat*Math.PI/180);
  return Math.hypot(dx,dy);
}
export function candidateStops(stops,point,maxMeters=MAX_ENDPOINT_METERS,maxCount=4) {
  const found=[];
  for (let i=0;i<stops.length;i++){
    const s=stops[i];
    if (!Number.isFinite(s[2])||!Number.isFinite(s[3])||!s[2]||!s[3]) continue;
    const d=straightLineMeters(point,{lat:s[2],lon:s[3]});
    if(d<=maxMeters)found.push({index:i,distance:d});
  }
  return found.sort((a,b)=>a.distance-b.distance).slice(0,maxCount);
}
// Nearby bus stops are dense and can crowd out a walkable rail station.
// Preserve rail access independently of the closest bus stop ranking.
export function diverseCandidateStops(stops,point,maxMeters=1800) {
  const all=candidateStops(stops,point,maxMeters,120);
  const chosen=all.slice(0,12);
  const seen=new Set(chosen.map(s=>s.index));
  for(const agency of ['caltrain','bart']) {
    let count=0;
    for(const s of all) {
      if(count>=4) break;
      if(!stops[s.index][0].startsWith(agency+':')) continue;
      if(!seen.has(s.index)) {chosen.push(s);seen.add(s.index);count++;}
    }
  }
  return chosen;
}
function legEndpoint(stop) {
  return {name:stop[1],lat:stop[2],lon:stop[3],stop:{id:stop[0]}};
}
function transferLeg(stops,a,b,depart,arrive,midnight) {
  // This coordinate line is an illustration, NEVER validated walking directions.
  const p=legEndpoint(stops[a]),q=legEndpoint(stops[b]);
  return {mode:'WALK',transit:false,from:p,to:q,
    start:{scheduled:new Date(midnight+depart*1000).toISOString()},
    end:{scheduled:new Date(midnight+arrive*1000).toISOString()},
    durationSeconds:arrive-depart, distanceMeters:Math.ceil(straightLineMeters(p,q)),
    steps:[],geometry:null, approximate:true};
}
export function adaptJourney(journey,data,origin,destination,serviceMidnight) {
  const starts=new Map(data.stops.map((s,i)=>[s[0],i]));
  const legs=[], when=s=>new Date(serviceMidnight+s*1000).toISOString();
  let clock=journey.departureSeconds;
  for(const step of journey.legs){
    const a=starts.get(step.from),b=starts.get(step.to);
    if(a===undefined||b===undefined)throw new Error('Unknown stop in journey');
    if(step.type==='approximate-walk'){
      legs.push(transferLeg(data.stops,a,b,clock,clock+step.seconds,serviceMidnight));
      clock+=step.seconds;
      continue;
    }
    // A GTFS trip ID can occur on both adjacent service days. Preserve the exact
    // scanned trip index rather than resolving a duplicate ID from the wrong day.
    const trip=Number.isInteger(step.tripIndex) ? data.trips[step.tripIndex] :
      data.trips.find(t=>t[1]===step.tripId && t[0]===step.agency);
    if(!trip)throw new Error('Unrecognized scheduled trip');
    const from=legEndpoint(data.stops[a]),to=legEndpoint(data.stops[b]);
    const mode=trip[5]==='1'?'SUBWAY':trip[5]==='0'?'TRAM':trip[5]==='2'?'RAIL':trip[5]==='5'?'CABLE_CAR':'BUS';
    legs.push({mode,
      transit:true,agency:{id:step.agency},route:{id:trip[2],shortName:trip[3]},
      trip:{id:step.tripId,headsign:step.headsign},headsign:step.headsign,
      from,to,start:{scheduled:when(step.depart)},end:{scheduled:when(step.arrive)},
      durationSeconds:step.arrive-step.depart,realtime:false,steps:[],geometry:null});
    clock=step.arrive;
  }
  // Consecutive segments on the same physical trip are one boarding, not transfers.
  const merged=[];
  for(const leg of legs) {
    const prev=merged.at(-1);
    if(prev?.transit && leg.transit && prev.agency.id===leg.agency.id && prev.trip.id===leg.trip.id &&
       prev.to.stop.id===leg.from.stop.id) {
      prev.to=leg.to;
      prev.end=leg.end;
      prev.durationSeconds=(Date.parse(prev.end.scheduled)-Date.parse(prev.start.scheduled))/1000;
    } else merged.push(leg);
  }
  legs.splice(0,legs.length,...merged);
  return {id:'schedule-'+journey.departureSeconds+'-'+legs.length,
    start:when(journey.departureSeconds),end:when(journey.arrivalSeconds),
    durationSeconds:journey.durationSeconds,walkMeters:Math.round(legs.filter(l=>!l.transit).reduce((s,l)=>s+l.distanceMeters,0)),
    walkSeconds:legs.filter(l=>!l.transit).reduce((s,l)=>s+l.durationSeconds,0),
    transfers:Math.max(0,legs.filter(l=>l.transit).length-1),
    usesRealtime:false,legs};
}
function bad(status,error,field) {return {status,body:{error,field}};}
function parsePoint(q,prefix) {
  const lat=Number(q.get(prefix+'Lat')),lon=Number(q.get(prefix+'Lon'));
  if(q.get(prefix+'Lat')==null||q.get(prefix+'Lon')==null||
    !Number.isFinite(lat)||!Number.isFinite(lon)||lat<36.9||lat>38.2||lon< -122.75||lon> -121.4)
    return null;
  return {lat,lon};
}
export function planExperimental(query, now=new Date(), loader=loadDay) {
  const q=query instanceof URLSearchParams?query:new URLSearchParams(query);
  const from=parsePoint(q,'from'),to=parsePoint(q,'to');
  if(!from||!to)return bad(400,'Choose valid Bay Area coordinates','fromLat');
  if(q.get('arriveBy')==='true')return bad(422,'Arrive-by planning requires the full routing engine. Try Depart at.','time');
  if(q.get('access')&&q.get('access')!=='WALK')return bad(422,'Driving to transit requires the full routing engine.','access');
  const time=q.get('time')?new Date(q.get('time')):now;
  if(!Number.isFinite(time.getTime()))return bad(400,'Invalid departure time','time');
  if(Math.abs(time-now)>14*86400000)return bad(422,'Only dates in the published timetable are supported','time');
  let ctx,data;
  try {({context:ctx,timetable:data}=loadFor(time,loader));}
  catch {return bad(503,'Scheduled timetable unavailable for this date; try another service date.');}
  const origins=diverseCandidateStops(data.stops,from,1800);
  const destinations=diverseCandidateStops(data.stops,to,1500);
  if(!origins.length||!destinations.length)
    return bad(422,'No transit stops within walking reach of one or both places. Try a nearby station or a closer starting point.');
  let footpaths=footpathCache.get(data.stops);
  if (!footpaths) {
    footpaths=directFootpaths(data.stops,260,12);
    footpathCache.set(data.stops,footpaths);
  }
  const answers=[];
  const simplerOrigins = new Set([
    ...origins.slice(0,6).map(s=>s.index),
    ...origins.filter(s=>/^(bart|caltrain):/.test(data.stops[s.index][0])).map(s=>s.index)
  ]);
  for (const penalty of [0, 8*60]) for(const a of origins) {
    if (penalty && !simplerOrigins.has(a.index)) continue;
    const startSeconds=ctx.seconds+Math.ceil(a.distance/1.2);
    // One scan per boarding candidate, not one scan for every boarding/exit pair.
    const matches=findJourneys(data,a.index,destinations.map(b=>b.index),startSeconds,
      {footpaths,maxSeconds:8*3600,transferPenaltySeconds:penalty});
    for (const b of destinations) {
      if(a.index===b.index)continue;
      const trip=matches.get(b.index);
      if(trip&&trip.legs.some(l=>l.type==='transit')){
        const it=adaptJourney(trip,data,from,to,pacificMidnight(ctx.previousDay));
        const egress=Math.ceil(b.distance/1.2);
        // Make the start/end walking estimates explicit; their geometry is NOT street-verified.
        const first=it.legs[0];
        const ingress=Math.max(0,Math.ceil(a.distance/1.2));
        const firstStart=Date.parse(first.start.scheduled);
        const originStart=Math.max(time.getTime(), firstStart-ingress*1000);
        if(a.distance>1 && firstStart>originStart){
          it.legs.unshift({mode:'WALK',transit:false,from:{name:'Starting point',lat:from.lat,lon:from.lon},to:first.from,
            start:{scheduled:new Date(originStart).toISOString()},end:{scheduled:new Date(firstStart).toISOString()},
            durationSeconds:(firstStart-originStart)/1000,distanceMeters:Math.ceil(a.distance),steps:[],geometry:null,approximate:true});
        }
        if(egress>0){
          const last=it.legs.at(-1);
          const end=new Date(Date.parse(last.end.scheduled)+egress*1000).toISOString();
          it.legs.push({mode:'WALK',transit:false,from:last.to,to:{name:'Destination',lat:to.lat,lon:to.lon},
            start:{scheduled:last.end.scheduled},end:{scheduled:end},durationSeconds:egress,
            distanceMeters:Math.ceil(b.distance),steps:[],geometry:null,approximate:true});
          it.end=end;
        }
        it.start=it.legs[0].start.scheduled;
        it.durationSeconds=Math.round((Date.parse(it.end)-Date.parse(it.start))/1000);
        it.walkMeters=Math.round(it.legs.filter(l=>!l.transit).reduce((sum,l)=>sum+l.distanceMeters,0));
        it.walkSeconds=it.legs.filter(l=>!l.transit).reduce((sum,l)=>sum+l.durationSeconds,0);
        answers.push(it);
      }
    }
  }
  const limit=Math.max(1,Math.min(5,Number(q.get('limit')||3)||3));
  const unique=rankItineraries(answers,limit);
  return {status:200,body:{request:{time:time.toISOString()},
    routing:{engine:'EXPERIMENTAL_SCHEDULE_ONLY',realtime:'none',
      notes:['Experimental scheduled stop-to-stop routing only. Walk transfers use straight-line estimates, NOT safe pedestrian routes. GPS turn-by-turn and driving directions are unavailable.']},
    itineraries:unique.slice(0,limit),errors:unique.length?[]:[{code:'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW'}]}};
}
export async function planWithWalking(query,now=new Date(),loader=loadDay,fetcher=fetch) {
  const result=planExperimental(query,now,loader);
  if (result.status!==200 || !result.body.itineraries.length) return result;
  // Limit requests to the public demonstration router. A failed lookup remains preview-only.
  await Promise.all(result.body.itineraries.slice(0,2).map(it=>enrichWalks(it,fetcher)));
  // A real pedestrian path that cannot fit the transfer window is not a
  // catchable itinerary. Keep unverified alternatives clearly labeled, but
  // never rank a proven impossible connection ahead of a possible one.
  const feasible=result.body.itineraries.filter(it=>it.transferFeasible!==false);
  if (feasible.length) result.body.itineraries=feasible;
  result.body.routing.walkingGeometry=result.body.itineraries.some(it=>it.walkingVerified);
  result.body.routing.notes=[
    'Beta: scheduled transit times only. Walking geometry uses an external pedestrian router and may be incomplete or inaccurate. Check crossings, signs and station platforms.',
    'Live train/bus positions and automatic boarding confirmation are not available. Keep navigation in the foreground and verify each transfer.',
    ...(feasible.length?[]:['A mapped walking transfer exceeds its scheduled connection window; these results are not suitable for navigation.'])
  ];
  for (const it of result.body.itineraries) {
    it.navigationReady=Boolean(it.walkingVerified && it.legs.some(l=>l.transit));
  }
  return result;
}
export default async function handler(req,res) {
  res.setHeader('Cache-Control','public, s-maxage=20, stale-while-revalidate=20');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  try {
    const result=await planWithWalking(new URL(req.url,'https://rove.invalid').searchParams);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Preview trip planning failed:', error);
    return res.status(503).json({error:'Trip planning is temporarily unavailable. Please try again.',code:'ROUTING_UNAVAILABLE'});
  }
}
