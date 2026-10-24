import G from 'gtfs-realtime-bindings';
import { readFileSync } from 'node:fs';
import { loadFor } from './experimental-plan.mjs';
/* Live departures for a stop. Verified agencies only (static stop and trip ids match the live feed):
 * Muni and AC Transit (511, route ids match), BART (its own feed, no key) and Caltrain (511); for
 * BART and Caltrain the line is taken from the timetable by trip id, because their live feeds don't
 * carry a matching route id. VTA's stop ids do not match yet, so VTA stays unverified. */
const network=JSON.parse(readFileSync(new URL('../../public/data/network.json',import.meta.url),'utf8'));
const agencies=Object.fromEntries(network.agencies.map(a=>[a.id,{routes:new Set(a.routes.map(r=>String(r.id))),stops:new Set(a.stops.map(s=>String(s.id))),children:new Map(a.stops.filter(s=>s.parent).map(s=>[s.id,s.parent]))}]));
const prefixes={SF:'muni',AC:'act',SC:'vta',CT:'caltrain'};
const VERIFIED=new Set(['muni','act','bart','caltrain']);
const numeric=x=>x?.toNumber?x.toNumber():Number(x);
const stripped=id=>String(id??'').replace(/^[A-Za-z]{2}:/,'');
const memo={},pending={};
async function getFeed(name,url,ttl){
 if(memo[name]&&Date.now()-memo[name].at<ttl)return memo[name];
 pending[name]||=(async()=>{
  const r=await fetch(url,{headers:{Accept:'application/x-protobuf'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('Trip updates unavailable');
  const feed=G.transit_realtime.FeedMessage.decode(new Uint8Array(await r.arrayBuffer()));
  memo[name]={at:Date.now(),timestamp:numeric(feed.header?.timestamp)||0,entities:feed.entity||[]};return memo[name];
 })().finally(()=>{delete pending[name]});
 return pending[name];
}
/* tripId -> {routeId, headsign} for agencies whose live feed lacks usable route ids. */
let tripIndex=null;
function tripsFor(agency){
 const day=new Date().toISOString().slice(0,10);
 if(!tripIndex||tripIndex.day!==day){
  const map={bart:new Map(),caltrain:new Map()};
  try{for(const t of loadFor(new Date()).timetable.trips)if(map[t[0]])map[t[0]].set(String(t[1]),{routeId:String(t[2]),headsign:t[4]||null});}catch{/* timetable unavailable: no labels */}
  tripIndex={day,map};
 }
 return tripIndex.map[agency]||new Map();
}
export function selectArrivals(feed,agency,stop,now=Math.floor(Date.now()/1000),routeOf=null){
 const config=agencies[agency];
 if(!config||!config.stops.has(stop))return {status:'unverified',arrivals:[],reasons:['Unknown stop.']};
 if(!VERIFIED.has(agency))return {status:'unverified',arrivals:[],reasons:['Live trip matching is not yet verified for this agency.']};
 if(!feed.timestamp||now-feed.timestamp>900)return {status:'unverified',arrivals:[],reasons:['Live predictions are stale.']};
 const targets=new Set([stop]);
 for(const [child,parent] of config.children)if(parent===stop)targets.add(child);
 const arrivals=[],canceled=[];
 for(const entity of feed.entities){
  const u=entity.tripUpdate;if(!u)continue;
  let routeId=null,headsign=null;
  if(routeOf){const r=routeOf(stripped(u.trip?.tripId));if(!r)continue;({routeId,headsign}=r);}
  else{const m=/^([A-Za-z]{2}):(.*)$/.exec(u.trip?.routeId||'');if(prefixes[m?.[1]?.toUpperCase()]!==agency||!config.routes.has(m[2]))continue;routeId=m[2];}
  if(!config.routes.has(routeId))continue;
  for(const st of u.stopTimeUpdate||[]){
   const stopId=stripped(st.stopId);
   if(!targets.has(stopId))continue;
   const t=numeric(st.departure?.time||st.arrival?.time);
   if(st.scheduleRelationship===1||u.trip?.scheduleRelationship===3){canceled.push({tripId:stripped(u.trip?.tripId),routeId,stopId,reason:st.scheduleRelationship===1?'stop-skipped':'trip-canceled'});continue;}
   if(!Number.isFinite(t)||t<now-60||t>now+10800)continue;
   arrivals.push({tripId:stripped(u.trip?.tripId)||entity.id,routeId,routeName:routeId,headsign,stopId,time:t,delay:st.departure?.delay??st.arrival?.delay??null,scheduled:true});
  }
 }
 arrivals.sort((a,b)=>a.time-b.time);
 return {status:arrivals.length?'live':'no-predictions',arrivals:arrivals.slice(0,40),canceled:canceled.slice(0,10),feed:{headerTimestamp:feed.timestamp},stale:false};
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 res.setHeader('Cache-Control','public, s-maxage=30, stale-while-revalidate=30');
 const agency=String(req.query?.agency||''),stop=String(req.query?.stop||'');
 if(!agencies[agency]||!agencies[agency].stops.has(stop))return res.status(400).json({status:'unverified',arrivals:[],reasons:['Unknown agency or stop.']});
 if(!VERIFIED.has(agency))return res.status(200).json({status:'unverified',arrivals:[],reasons:['Live predictions are not verified for this agency.']});
 try{
  if(agency==='bart'){const t=tripsFor('bart');return res.status(200).json(selectArrivals(await getFeed('bart','https://api.bart.gov/gtfsrt/tripupdate.aspx',30000),agency,stop,undefined,id=>t.get(id)));}
  const key=process.env.SF_511_API_KEY;
  if(!key)throw new Error('511 not configured');
  const feed=await getFeed('updates','https://api.511.org/transit/tripupdates?agency=RG&api_key='+encodeURIComponent(key),180000);
  if(agency==='caltrain'){const t=tripsFor('caltrain');return res.status(200).json(selectArrivals(feed,agency,stop,undefined,id=>t.get(id)));}
  return res.status(200).json(selectArrivals(feed,agency,stop));
 }
 catch{return res.status(200).json({status:'unverified',arrivals:[],reasons:['Live predictions are temporarily unavailable.']});}
}
