// Serverless-compatible, explicitly experimental schedule-only route API.
// No OTP JVM, API keys, hidden external requests, live arrivals, or driving.
// Exposed by /api/v2/plan with clear preview warnings and navigation disabled.
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {findJourney, directFootpaths} from '../../experiments/bay-router/route.mjs';
import {combineServiceDays} from '../../experiments/bay-router/combine-days.mjs';
import {enrichWalks} from '../../experiments/bay-router/pedestrian.mjs';

const TZ = 'America/Los_Angeles';
const MAX_ENDPOINT_METERS = 650;
const loaded = new Map();
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
    const trip=(data.tripIndex?.get(step.agency+'|'+step.tripId)) || data.trips.find(t=>t[1]===step.tripId && t[0]===step.agency);
    if(!trip)throw new Error('Unrecognized scheduled trip');
    const from=legEndpoint(data.stops[a]),to=legEndpoint(data.stops[b]);
    legs.push({mode:trip[5]==='1'?'SUBWAY':trip[5]==='0'?'TRAM':'BUS',
      transit:true,agency:{id:step.agency},route:{id:trip[2],shortName:trip[3]},
      trip:{id:step.tripId,headsign:step.headsign},headsign:step.headsign,
      from,to,start:{scheduled:when(step.depart)},end:{scheduled:when(step.arrive)},
      durationSeconds:step.arrive-step.depart,realtime:false,steps:[],geometry:null});
    clock=step.arrive;
  }
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
  const origins=candidateStops(data.stops,from,MAX_ENDPOINT_METERS,4);
  const destinations=candidateStops(data.stops,to,MAX_ENDPOINT_METERS,4);
  if(!origins.length||!destinations.length)
    return bad(422,'No transit stops within 650 metres of one or both places. Try a nearby station or a closer starting point.');
  const footpaths=directFootpaths(data.stops,140,8);
  // Avoid repeated linear trip lookups for every candidate itinerary.
  data.tripIndex=new Map(data.trips.map(t=>[t[0]+'|'+t[1],t]));
  const answers=[];
  for(const a of origins) for(const b of destinations){
    if(a.index===b.index)continue;
    const startSeconds=ctx.seconds+Math.ceil(a.distance/1.2);
    const trip=findJourney(data,a.index,b.index,startSeconds,{footpaths,maxSeconds:5*3600});
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
  answers.sort((a,b)=>Date.parse(a.end)-Date.parse(b.end));
  const unique=answers.filter((a,i)=>answers.findIndex(b=>b.legs.filter(l=>l.transit).map(l=>l.trip.id).join('|')===a.legs.filter(l=>l.transit).map(l=>l.trip.id).join('|'))===i);
  const limit=Math.max(1,Math.min(5,Number(q.get('limit')||3)||3));
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
  result.body.routing.walkingGeometry=result.body.itineraries.some(it=>it.walkingVerified);
  result.body.routing.notes=[
    'Beta: scheduled transit times only. Walking geometry uses an external pedestrian router and may be incomplete or inaccurate. Check crossings, signs and station platforms.',
    'Live train/bus positions and automatic boarding confirmation are not available. Keep navigation in the foreground and verify each transfer.'
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
