import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const apiKey = process.env.SF_511_API_KEY?.trim();
const FEED_POLICY = {
  vehicles: { ttlMs: 120_000, staleMs: 270_000 },
  updates: { ttlMs: 180_000, staleMs: 390_000 },
  alerts: { ttlMs: 900_000, staleMs: 1_230_000 }
};
const MAX_UPSTREAM_REQUESTS_PER_HOUR = 54;
const requestTimes = [];
const cache = new Map();
const inflight = new Map();
const endpoints = {
  vehicles: 'https://api.511.org/transit/vehiclepositions?agency=RG',
  updates: 'https://api.511.org/transit/tripupdates?agency=RG',
  alerts: 'https://api.511.org/transit/servicealerts?agency=RG'
};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const num=value=>value == null ? null : typeof value === 'number' ? value : typeof value.toNumber === 'function' ? value.toNumber() : Number(value);
const text=t=>t?.translation?.find(x=>x.language==='en')?.text || t?.translation?.[0]?.text || '';

function cleanBudget(){const cutoff=Date.now()-3600000;while(requestTimes.length&&requestTimes[0]<cutoff)requestTimes.shift()}
function decodeFeed(type,buffer){const feed=GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));const headerTs=num(feed.header?.timestamp);if(type==='vehicles')return{headerTimestamp:headerTs,items:feed.entity.filter(e=>e.vehicle?.position).map(e=>({id:e.vehicle.vehicle?.id||e.id||'',label:e.vehicle.vehicle?.label||'',tripId:e.vehicle.trip?.tripId||'',routeId:e.vehicle.trip?.routeId||'',directionId:e.vehicle.trip?.directionId??null,lat:e.vehicle.position.latitude,lon:e.vehicle.position.longitude,bearing:e.vehicle.position.bearing??null,speed:e.vehicle.position.speed??null,timestamp:num(e.vehicle.timestamp)||headerTs,stopId:e.vehicle.stopId||'',currentStopSequence:e.vehicle.currentStopSequence??null,status:e.vehicle.currentStatus??null}))};
  if(type==='updates')return{headerTimestamp:headerTs,items:feed.entity.filter(e=>e.tripUpdate).map(e=>({id:e.id||'',tripId:e.tripUpdate.trip?.tripId||'',routeId:e.tripUpdate.trip?.routeId||'',directionId:e.tripUpdate.trip?.directionId??null,timestamp:num(e.tripUpdate.timestamp)||headerTs,delay:e.tripUpdate.delay??null,stopTimes:(e.tripUpdate.stopTimeUpdate||[]).map(s=>({stopId:s.stopId||'',sequence:s.stopSequence??null,arrival:num(s.arrival?.time),departure:num(s.departure?.time),delay:s.arrival?.delay??s.departure?.delay??null,relationship:s.scheduleRelationship??null}))}))};
  return{headerTimestamp:headerTs,items:feed.entity.filter(e=>e.alert).map(e=>({id:e.id||'',header:text(e.alert.headerText),description:text(e.alert.descriptionText),cause:e.alert.cause??null,effect:e.alert.effect??null,activePeriods:(e.alert.activePeriod||[]).map(p=>({start:num(p.start),end:num(p.end)})),entities:(e.alert.informedEntity||[]).map(x=>({agencyId:x.agencyId||'',routeId:x.routeId||'',stopId:x.stopId||'',tripId:x.trip?.tripId||''}))}))}}
async function fetchFeed(type){const now=Date.now(),existing=cache.get(type),policy=FEED_POLICY[type];if(existing&&now-existing.fetchedAt<policy.ttlMs)return{...existing,cache:'fresh'};if(inflight.has(type))return inflight.get(type);const task=(async()=>{cleanBudget();if(requestTimes.length>=MAX_UPSTREAM_REQUESTS_PER_HOUR){if(existing)return{...existing,cache:'rate-limited',stale:true};throw new Error('Server-side 511 request budget reached')}
    requestTimes.push(Date.now());try{const url=`${endpoints[type]}&api_key=${encodeURIComponent(apiKey)}`;const response=await fetch(url,{headers:{Accept:'application/x-protobuf','User-Agent':'Rove-local/0.3'},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`511 ${type} returned ${response.status}`);const decoded=decodeFeed(type,await response.arrayBuffer());const receivedAt=Date.now();const ageMs=decoded.headerTimestamp ? Math.max(0,receivedAt-decoded.headerTimestamp*1000) : 0;const value={...decoded,fetchedAt:receivedAt,stale:ageMs>policy.staleMs,error:null};cache.set(type,value);return{...value,cache:'miss'}}catch(error){if(existing&&now-existing.fetchedAt<policy.staleMs)return{...existing,cache:'stale',stale:true,error:error.message};throw error}finally{inflight.delete(type)}})();inflight.set(type,task);return task}
async function realtimeResponse(){cleanBudget();if(!apiKey)return{configured:false,live:false,reason:'SF_511_API_KEY is not configured',meta:{feedPolicy:Object.fromEntries(Object.entries(FEED_POLICY).map(([k,v])=>[k,{pollSeconds:v.ttlMs/1000,staleSeconds:v.staleMs/1000}])),requestBudget:{used:requestTimes.length,limit:MAX_UPSTREAM_REQUESTS_PER_HOUR}}};const results=await Promise.allSettled(Object.keys(endpoints).map(async type=>[type,await fetchFeed(type)]));const data={};const errors=[];for(const result of results){if(result.status==='fulfilled')data[result.value[0]]=result.value[1];else errors.push(result.reason?.message||String(result.reason))}return{configured:true,live:Boolean(data.vehicles||data.updates||data.alerts),generatedAt:Date.now(),meta:{feedPolicy:Object.fromEntries(Object.entries(FEED_POLICY).map(([k,v])=>[k,{pollSeconds:v.ttlMs/1000,staleSeconds:v.staleMs/1000}])),requestBudget:{used:requestTimes.length,limit:MAX_UPSTREAM_REQUESTS_PER_HOUR},errors},...data}}
function send(res,status,body,headers={}){res.writeHead(status,{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(body)}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/realtime'){const body=await realtimeResponse();return send(res,200,JSON.stringify(body),{'Content-Type':'application/json; charset=utf-8'})}if(url.pathname==='/api/realtime/status')return send(res,200,JSON.stringify({configured:Boolean(apiKey),feedPolicy:Object.fromEntries(Object.entries(FEED_POLICY).map(([k,v])=>[k,{pollSeconds:v.ttlMs/1000,staleSeconds:v.staleMs/1000}])),requestLimitPerHour:MAX_UPSTREAM_REQUESTS_PER_HOUR}),{'Content-Type':'application/json; charset=utf-8'});
    const requestPath=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
    const allowedRootFiles=new Set(['index.html','app.js','styles.css']);
    const isAllowed=allowedRootFiles.has(requestPath)||requestPath.startsWith('public/');
    if(!isAllowed||requestPath.split('/').some(part=>part.startsWith('.')))return send(res,404,'Not found');
    const filePath=path.resolve(root,requestPath);if(!filePath.startsWith(root+path.sep)&&filePath!==path.join(root,'index.html'))return send(res,403,'Forbidden');const stat=fs.existsSync(filePath)&&fs.statSync(filePath);if(!stat||!stat.isFile())return send(res,404,'Not found');send(res,200,fs.readFileSync(filePath),{'Content-Type':mime[path.extname(filePath)]||'application/octet-stream','Cache-Control':requestPath.startsWith('public/data/')?'public, max-age=300':'no-cache'})}catch(error){console.error(error.message);send(res,500,JSON.stringify({error:'Internal server error'}),{'Content-Type':'application/json; charset=utf-8'})}});
server.listen(port,()=>console.log(`Rove running at http://localhost:${port} · 511 realtime ${apiKey?'configured':'not configured'}`));
