// Serverless-compatible, explicitly experimental schedule-only route API.
// No OTP JVM, API keys, hidden external requests, live arrivals, or driving.
// Exposed by /api/v2/plan with clear preview warnings and navigation disabled.
// Algorithm, ranking weights and honesty rules: docs/ROUTING.md ("Schedule-only planner").
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {directFootpaths, reverseFootpaths, forwardRounds, latestDeparture, buildTripIndex, tripStops,
  WALK_METERS_PER_SECOND, BOARDING_MARGIN_SECONDS, MIN_TRANSFER_SECONDS} from '../../experiments/bay-router/route.mjs';
import {combineServiceDays} from '../../experiments/bay-router/combine-days.mjs';
import {enrichWalks} from '../../experiments/bay-router/pedestrian.mjs';
import {rankItineraries, revisitsEarlierStations, paretoFilter, generalizedCost} from '../../experiments/bay-router/rank.mjs';

const TZ = 'America/Los_Angeles';
const MAX_ENDPOINT_METERS = 1100;
// Honesty thresholds (see docs/ROUTING.md).
export const PLANNING = Object.freeze({
  MAX_VEHICLES: 4,                    // at most 3 transfers
  SEARCH_SECONDS: 8 * 3600,           // forward search horizon per pass
  PRACTICAL_START_SECONDS: 90 * 60,   // leaving later than this after the requested time is not "leave now"
  LATER_START_SECONDS: 30 * 60,       // DEPARTS_LATER warning
  LONG_WAIT_SECONDS: 30 * 60,         // LONG_WAIT warning for one wait at a stop
  IMPRACTICAL_WAIT_SECONDS: 60 * 60,  // a single wait at a stop this long is never recommended
  LONG_WALK_LEG_METERS: 800,          // LONG_WALK warning (straight-line estimate)
  LONG_WALK_TOTAL_METERS: 1500,
});
const loaded = new Map();
const prepared = new Map();
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
function pacificMidnight(day) {
  // Evaluate the offset at midday to avoid UTC/local date confusion.
  // DST boundary days need real wall-clock conversion (handled by tests/gate).
  const probe = new Date(day+'T12:00:00Z');
  const tz = new Intl.DateTimeFormat('en-US',{timeZone:TZ,timeZoneName:'shortOffset'})
    .formatToParts(probe).find(p=>p.type==='timeZoneName')?.value || 'GMT-8';
  const m = /^GMT([+-]\d+)(?::(\d+))?$/.exec(tz);
  const minutes = (m ? Number(m[1])*60 + Math.sign(Number(m[1]))*Number(m[2]||0) : -480);
  return Date.parse(day+'T00:00:00Z') - minutes*60000;
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
  const days=[context.previousDay,context.day].map(loader);
  return {context, timetable:combineServiceDays(days)};
}
// The combined two-day timetable and its derived indexes are immutable, so warm requests reuse
// them instead of re-sorting 1.5 M connections and rebuilding footpaths on every call.
function preparedFor(instant, loader) {
  const context=dateContext(instant);
  const key=context.previousDay+'|'+context.day;
  if (loader===loadDay && prepared.has(key)) return {context, ...prepared.get(key)};
  const {timetable}=loadFor(instant, loader);
  const footpaths=directFootpaths(timetable.stops,260,12);
  const entry={timetable, footpaths, incoming:reverseFootpaths(footpaths), tripIndex:buildTripIndex(timetable)};
  if (loader===loadDay) {
    prepared.set(key,entry);
    if (prepared.size>2) prepared.delete(prepared.keys().next().value);
  }
  return {context, ...entry};
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
const MODES={'0':'TRAM','1':'SUBWAY','2':'RAIL','3':'BUS','4':'FERRY','5':'CABLE_CAR','6':'GONDOLA','7':'FUNICULAR'};
function walkLeg(from,to,startMs,seconds,meters) {
  // Straight-line illustration only, NEVER validated walking directions.
  return {mode:'WALK',transit:false,from,to,
    start:{scheduled:new Date(startMs).toISOString()},end:{scheduled:new Date(startMs+seconds*1000).toISOString()},
    durationSeconds:seconds,distanceMeters:Math.ceil(meters),steps:[],geometry:null,approximate:true};
}

/**
 * Turn a search journey into the frontend itinerary contract (docs/API_CONTRACT.md) plus additive
 * quality fields: initialWaitSeconds, transferWaitSeconds, longestWaitSeconds, warnings, detour,
 * backtrackMeters, generalizedCost.
 */
export function buildItinerary(journey, prep, endpoints, requestMs, serviceMidnight) {
  const {timetable:data, tripIndex}=prep;
  const {from, to, origin, target}=endpoints;
  const at=s=>serviceMidnight+s*1000;
  const legs=[], visits=[];
  const first=journey.legs[0];
  const accessSeconds=Math.ceil(origin.distance/WALK_METERS_PER_SECOND);
  const boardStop=legEndpoint(data.stops[first.fromIndex]);
  const leaveMs=at(first.depart-BOARDING_MARGIN_SECONDS)-accessSeconds*1000;
  if (origin.distance>1) legs.push(walkLeg({name:'Starting point',lat:from.lat,lon:from.lon},boardStop,leaveMs,accessSeconds,origin.distance));
  let clock=null, transferWait=0, longestWait=origin.distance>1?BOARDING_MARGIN_SECONDS:0;
  for (const step of journey.legs) {
    if (step.type==='approximate-walk') {
      const p=legEndpoint(data.stops[step.fromIndex]), q=legEndpoint(data.stops[step.toIndex]);
      legs.push(walkLeg(p,q,at(clock),step.seconds,straightLineMeters(p,q)));
      clock+=step.seconds;
      continue;
    }
    const trip=data.trips[step.tripIndex];
    if (clock!==null) {
      const wait=step.depart-clock;
      transferWait+=wait; longestWait=Math.max(longestWait,wait);
    }
    const stopsOnTrip=tripStops(data,tripIndex,step.tripIndex,step.fromIndex,step.depart,step.toIndex,step.arrive);
    visits.push(stopsOnTrip.map(i=>({lat:data.stops[i][2],lon:data.stops[i][3]})));
    legs.push({mode:MODES[String(trip[5])] || 'BUS',
      transit:true,agency:{id:step.agency},route:{id:trip[2],shortName:trip[3]},
      trip:{id:step.tripId,headsign:step.headsign},headsign:step.headsign,
      from:legEndpoint(data.stops[step.fromIndex]),to:legEndpoint(data.stops[step.toIndex]),
      start:{scheduled:new Date(at(step.depart)).toISOString()},end:{scheduled:new Date(at(step.arrive)).toISOString()},
      durationSeconds:step.arrive-step.depart,realtime:false,steps:[],geometry:null,
      intermediateStopCount:Math.max(0,stopsOnTrip.length-2)});
    clock=step.arrive;
  }
  const egressSeconds=Math.ceil(target.distance/WALK_METERS_PER_SECOND);
  if (egressSeconds>0) {
    const last=legs.at(-1);
    legs.push(walkLeg(last.to,{name:'Destination',lat:to.lat,lon:to.lon},Date.parse(last.end.scheduled),egressSeconds,target.distance));
  }
  // A footpath straight into the final walk is one walk for the rider, not two.
  for (let i=legs.length-1;i>0;i--) {
    const a=legs[i-1], b=legs[i];
    if (a.transit||b.transit) continue;
    legs.splice(i-1,2,{...a,to:b.to,end:b.end,durationSeconds:a.durationSeconds+b.durationSeconds,
      distanceMeters:a.distanceMeters+b.distanceMeters});
  }
  const transit=legs.filter(l=>l.transit), walks=legs.filter(l=>!l.transit);
  const start=legs[0].start.scheduled, end=legs.at(-1).end.scheduled;
  const backtrackMeters=Math.round(transit.reduce((sum,l)=>sum+Math.max(0,straightLineMeters(l.to,to)-straightLineMeters(l.from,to)),0));
  const it={id:'schedule-'+journey.doorDeparture+'-'+transit.map(l=>l.trip.id).join('-'),
    start,end,durationSeconds:Math.round((Date.parse(end)-Date.parse(start))/1000),
    walkMeters:Math.round(walks.reduce((s,l)=>s+l.distanceMeters,0)),
    walkSeconds:walks.reduce((s,l)=>s+l.durationSeconds,0),
    transfers:Math.max(0,transit.length-1),
    initialWaitSeconds:Math.max(0,Math.round((Date.parse(start)-requestMs)/1000)),
    transferWaitSeconds:Math.round(transferWait),
    longestWaitSeconds:Math.round(longestWait),
    detour:revisitsEarlierStations(visits),
    backtrackMeters,
    usesRealtime:false,legs};
  const warnings=[];
  if (it.initialWaitSeconds>PLANNING.PRACTICAL_START_SECONDS) warnings.push('DEPARTS_MUCH_LATER');
  else if (it.initialWaitSeconds>PLANNING.LATER_START_SECONDS) warnings.push('DEPARTS_LATER');
  if (it.longestWaitSeconds>=PLANNING.LONG_WAIT_SECONDS) warnings.push('LONG_WAIT');
  if (walks.some(l=>l.distanceMeters>PLANNING.LONG_WALK_LEG_METERS) || it.walkMeters>PLANNING.LONG_WALK_TOTAL_METERS) warnings.push('LONG_WALK');
  if (it.detour) warnings.push('DETOUR');
  if (backtrackMeters>Math.max(2000,0.25*straightLineMeters(from,to))) warnings.push('BACKTRACKS');
  it.warnings=warnings;
  it.practical=it.initialWaitSeconds<=PLANNING.PRACTICAL_START_SECONDS &&
    it.longestWaitSeconds<PLANNING.IMPRACTICAL_WAIT_SECONDS && !it.detour;
  it.generalizedCost=Math.round(generalizedCost(it,requestMs));
  return it;
}

// Run the forward/backward search in a few passes: a normal and a walk-averse profile, each with
// "next departure" passes so alternatives with fewer transfers or less walking can surface.
export function searchJourneys(prep, origins, destinations, requestSeconds) {
  const {timetable:data, footpaths, incoming}=prep;
  const found=new Map();
  for (const walkFactor of [1, 2.5]) {
    const seeds=origins.map(o=>({index:o.index,accessSeconds:Math.ceil(walkFactor*o.distance/WALK_METERS_PER_SECOND)}));
    const targets=destinations.map(d=>({index:d.index,egressSeconds:Math.ceil(walkFactor*d.distance/WALK_METERS_PER_SECOND)}));
    let departFrom=requestSeconds;
    for (let pass=0; pass<3; pass++) {
      const front=forwardRounds(data,seeds,targets,departFrom,{footpaths,maxSeconds:PLANNING.SEARCH_SECONDS,maxRides:PLANNING.MAX_VEHICLES});
      if (!front.length) break;
      let earliest=Infinity;
      for (const point of front) {
        const journey=latestDeparture(data,seeds,targets,point.doorArrival,departFrom,{incomingFootpaths:incoming,maxRides:point.rides});
        if (!journey) continue;
        earliest=Math.min(earliest,journey.doorDeparture);
        const key=journey.legs.map(l=>l.type==='transit'?`${l.tripIndex}:${l.fromIndex}:${l.toIndex}`:`w${l.toIndex}`).join('|');
        if (!found.has(key)) found.set(key,journey);
      }
      if (earliest===Infinity) break;
      departFrom=earliest+60;
      if (departFrom-requestSeconds>PLANNING.SEARCH_SECONDS/2) break;
    }
  }
  return [...found.values()];
}

function bad(status,error,field) {return {status,body:{error,field}};}
function parsePoint(q,prefix) {
  const lat=Number(q.get(prefix+'Lat')),lon=Number(q.get(prefix+'Lon'));
  if(q.get(prefix+'Lat')==null||q.get(prefix+'Lon')==null||
    !Number.isFinite(lat)||!Number.isFinite(lon)||lat<36.9||lat>38.2||lon< -122.75||lon> -121.4)
    return null;
  return {lat,lon};
}
const clockTime=ms=>new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'numeric',minute:'2-digit'}).format(new Date(ms));
const SCHEDULE_NOTE='Experimental scheduled stop-to-stop routing only. Walk transfers use straight-line estimates, NOT safe pedestrian routes. GPS turn-by-turn and driving directions are unavailable.';

export function planExperimental(query, now=new Date(), loader=loadDay) {
  const q=query instanceof URLSearchParams?query:new URLSearchParams(query);
  const from=parsePoint(q,'from'),to=parsePoint(q,'to');
  if(!from||!to)return bad(400,'Choose valid Bay Area coordinates','fromLat');
  if(q.get('arriveBy')==='true')return bad(422,'Arrive-by planning requires the full routing engine. Try Depart at.','time');
  if(q.get('access')&&q.get('access')!=='WALK')return bad(422,'Driving to transit requires the full routing engine.','access');
  const time=q.get('time')?new Date(q.get('time')):now;
  if(!Number.isFinite(time.getTime()))return bad(400,'Invalid departure time','time');
  if(Math.abs(time-now)>14*86400000)return bad(422,'Only dates in the published timetable are supported','time');
  let prep;
  try {prep=preparedFor(time,loader);}
  catch {return bad(503,'Scheduled timetable unavailable for this date; try another service date.');}
  const {context:ctx,timetable:data}=prep;
  const origins=diverseCandidateStops(data.stops,from,1800);
  const destinations=diverseCandidateStops(data.stops,to,1500);
  if(!origins.length||!destinations.length)
    return bad(422,'No transit stops within walking reach of one or both places. Try a nearby station or a closer starting point.');
  const requestMs=time.getTime();
  const serviceMidnight=pacificMidnight(ctx.previousDay);
  const originBy=new Map(origins.map(o=>[o.index,o])), targetBy=new Map(destinations.map(d=>[d.index,d]));
  const all=[];
  for (const journey of searchJourneys(prep,origins,destinations,ctx.seconds)) {
    const origin=originBy.get(journey.originIndex), target=targetBy.get(journey.targetIndex);
    if (!origin||!target||journey.originIndex===journey.targetIndex) continue;
    all.push(buildItinerary(journey,prep,{from,to,origin,target},requestMs,serviceMidnight));
  }
  const limit=Math.max(1,Math.min(5,Number(q.get('limit')||3)||3));
  const practical=all.filter(it=>it.practical);
  const itineraries=rankItineraries(practical,limit,{requestMs});
  const routing={engine:'EXPERIMENTAL_SCHEDULE_ONLY',realtime:'none',notes:[SCHEDULE_NOTE],
    search:{algorithm:'transfer-bounded connection scan with latest-departure refinement',
      maxTransfers:PLANNING.MAX_VEHICLES-1,minTransferSeconds:MIN_TRANSFER_SECONDS,boardingMarginSeconds:BOARDING_MARGIN_SECONDS,
      practicalStartSeconds:PLANNING.PRACTICAL_START_SECONDS}};
  const body={request:{time:time.toISOString()},routing,itineraries,errors:[]};
  if (itineraries.length) return {status:200,body};
  // Nothing practical: never present a multi-hour wait or a much later start as "leave now".
  // Only trips that exist in the timetable are offered, separately, as later options.
  const later=paretoFilter(all.filter(it=>!it.detour && it.longestWaitSeconds<PLANNING.IMPRACTICAL_WAIT_SECONDS))
    .sort((a,b)=>Date.parse(a.start)-Date.parse(b.start) || a.generalizedCost-b.generalizedCost).slice(0,2);
  if (later.length) {
    const next=later[0];
    routing.serviceGap={reason:'NO_PRACTICAL_SERVICE_NEAR_REQUESTED_TIME',requestedTime:time.toISOString(),
      nextPracticalDeparture:next.start,nextPracticalArrival:next.end,
      minutesUntilNextDeparture:Math.round((Date.parse(next.start)-requestMs)/60000)};
    routing.notes.push(`No practical scheduled trip leaves within ${PLANNING.PRACTICAL_START_SECONDS/60} minutes of the requested time. The next scheduled option leaves at ${clockTime(Date.parse(next.start))} and arrives at ${clockTime(Date.parse(next.end))}; it is listed separately as a later option, not as a leave-now recommendation.`);
    body.laterItineraries=later;
    body.errors=[{code:'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW',
      message:`No practical trip leaves near this time. The next scheduled trip leaves at ${clockTime(Date.parse(next.start))}.`,
      nextPracticalDeparture:next.start}];
  } else {
    body.errors=[{code:'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW',
      message:'No scheduled transit connection was found in the search window. Try another departure time.'}];
  }
  return {status:200,body};
}
export async function planWithWalking(query,now=new Date(),loader=loadDay,fetcher=fetch) {
  const result=planExperimental(query,now,loader);
  if (result.status!==200 || !result.body.itineraries.length) return result;
  // Limit requests to the public demonstration router. A failed lookup remains preview-only.
  await Promise.all(result.body.itineraries.slice(0,2).map(it=>enrichWalks(it,fetcher)));
  result.body.routing.walkingGeometry=result.body.itineraries.some(it=>it.walkingVerified);
  result.body.routing.notes=[
    'Beta: scheduled transit times only. Walking geometry uses an external pedestrian router and may be incomplete or inaccurate. Check crossings, signs and station platforms.',
    'Plans use published schedules. During your trip Rove shows live predictions where the agency provides them, but it never confirms boarding automatically. Keep Rove open and verify each transfer.'
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
