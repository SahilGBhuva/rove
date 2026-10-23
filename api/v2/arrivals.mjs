import G from 'gtfs-realtime-bindings';
import { readFileSync } from 'node:fs';
const network=JSON.parse(readFileSync(new URL('../../public/data/network.json',import.meta.url),'utf8'));
const agencies=Object.fromEntries(network.agencies.map(a=>[a.id,{routes:new Set(a.routes.map(r=>String(r.id))),stops:new Set(a.stops.map(s=>String(s.id))),children:new Map(a.stops.filter(s=>s.parent).map(s=>[s.id,s.parent]))}]));
const prefixes={SF:'muni',AC:'act',SC:'vta',CT:'caltrain'};
const numeric=x=>x?.toNumber?x.toNumber():Number(x);
let memo=null,pending=null;
async function getFeed(){
 if(memo&&Date.now()-memo.at<180000)return memo;
 if(!pending)pending=(async()=>{
  const key=process.env.SF_511_API_KEY;
  if(!key)throw new Error('511 not configured');
  const r=await fetch('https://api.511.org/transit/tripupdates?agency=RG&api_key='+encodeURIComponent(key),{headers:{Accept:'application/x-protobuf'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('Trip updates unavailable');
  const feed=G.transit_realtime.FeedMessage.decode(new Uint8Array(await r.arrayBuffer()));
  memo={at:Date.now(),timestamp:numeric(feed.header?.timestamp)||0,entities:feed.entity||[]};return memo;
 })().finally(()=>{pending=null});
 return pending;
}
export function selectArrivals(feed,agency,stop,now=Math.floor(Date.now()/1000)){
 const config=agencies[agency];
 if(!config||!config.stops.has(stop))return {status:'unverified',arrivals:[],reasons:['Unknown stop.']};
 // Only publish agencies with validated static stop and route identifier formats.
 if(!['muni','act'].includes(agency))return {status:'unverified',arrivals:[],reasons:['Live trip matching is not yet verified for this agency.']};
 if(!feed.timestamp||now-feed.timestamp>900)return {status:'unverified',arrivals:[],reasons:['Live predictions are stale.']};
 const targets=new Set([stop]);
 for(const [child,parent] of config.children)if(parent===stop)targets.add(child);
 const arrivals=[],canceled=[];
 for(const entity of feed.entities){
  const u=entity.tripUpdate;if(!u)continue;
  const m=/^([A-Za-z]{2}):(.*)$/.exec(u.trip?.routeId||'');
  if(prefixes[m?.[1]?.toUpperCase()]!==agency||!config.routes.has(m[2]))continue;
  for(const st of u.stopTimeUpdate||[]){
   if(!targets.has(st.stopId))continue;
   const t=numeric(st.departure?.time||st.arrival?.time);
   if(st.scheduleRelationship===1||u.trip?.scheduleRelationship===3){canceled.push({tripId:u.trip?.tripId,routeId:m[2],stopId:st.stopId,reason:st.scheduleRelationship===1?'stop-skipped':'trip-canceled'});continue;}
   if(!Number.isFinite(t)||t<now-60||t>now+10800)continue;
   arrivals.push({tripId:u.trip?.tripId||entity.id,routeId:m[2],routeName:m[2],headsign:null,stopId:st.stopId,time:t,delay:st.departure?.delay??st.arrival?.delay??null,scheduled:true});
  }
 }
 arrivals.sort((a,b)=>a.time-b.time);
 return {status:arrivals.length?'live':'no-predictions',arrivals:arrivals.slice(0,40),canceled:canceled.slice(0,10),feed:{headerTimestamp:feed.timestamp},stale:false};
}
export default async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 res.setHeader('Cache-Control','public, s-maxage=180, stale-while-revalidate=60');
 const agency=String(req.query?.agency||''),stop=String(req.query?.stop||'');
 if(!agencies[agency]||!agencies[agency].stops.has(stop))return res.status(400).json({status:'unverified',arrivals:[],reasons:['Unknown agency or stop.']});
 if(!['muni','act'].includes(agency))return res.status(200).json({status:'unverified',arrivals:[],reasons:['Live predictions are not verified for this agency.']});
 try{return res.status(200).json(selectArrivals(await getFeed(),agency,stop));}
 catch{return res.status(200).json({status:'unverified',arrivals:[],reasons:['Live predictions are temporarily unavailable.']});}
}
