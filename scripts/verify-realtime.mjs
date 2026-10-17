import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const base=process.env.ROVE_URL||'http://localhost:4173';
function csv(line){let out=[],value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){out.push(value);value=''}else value+=c}out.push(value.replace(/\r$/,''));return out}
function ids(dir,file,column){const lines=fs.readFileSync(path.join(root,'data/extracted',dir,file),'utf8').split(/\n/).filter(Boolean),headers=csv(lines.shift()||''),index=headers.indexOf(column);return new Set(lines.map(line=>csv(line)[index]))}
function percent(match,total){return{matched:match,total,percent:total?Number((match*100/total).toFixed(1)):null}}
const response=await fetch(`${base}/api/realtime`,{signal:AbortSignal.timeout(30_000)});
if(!response.ok)throw new Error(`Rove realtime API returned ${response.status}`);
const feed=await response.json();
if(!feed.configured||!feed.live)throw new Error('511 realtime is not configured or not live');
const configs={BA:'bart',SF:'muni',SC:'vta',AC:'act',CT:'caltrain'},agencies={};
for(const [prefix,dir] of Object.entries(configs)){
  const trips=ids(dir,'trips.txt','trip_id'),routes=ids(dir,'routes.txt','route_id'),stops=ids(dir,'stops.txt','stop_id');
  const updates=feed.updates.items.filter(item=>(item.tripId||item.routeId).startsWith(`${prefix}:`));
  const vehicles=feed.vehicles.items.filter(item=>(item.tripId||item.routeId).startsWith(`${prefix}:`));
  const strip=value=>String(value||'').replace(new RegExp(`^${prefix}:`),'');
  const realtimeStops=updates.flatMap(item=>item.stopTimes.map(stop=>stop.stopId)).filter(Boolean);
  agencies[dir]={vehicles:vehicles.length,tripUpdates:updates.length,tripMatch:percent(updates.filter(item=>trips.has(strip(item.tripId))).length,updates.length),routeMatch:percent(updates.filter(item=>routes.has(strip(item.routeId))).length,updates.length),stopMatch:percent(realtimeStops.filter(id=>stops.has(strip(id))).length,realtimeStops.length)};
}
const report={verifiedAt:new Date().toISOString(),feed:{vehicles:feed.vehicles.items.length,tripUpdates:feed.updates.items.length,alerts:feed.alerts.items.length,headers:{vehicles:feed.vehicles.headerTimestamp,updates:feed.updates.headerTimestamp,alerts:feed.alerts.headerTimestamp},stale:{vehicles:feed.vehicles.stale,updates:feed.updates.stale,alerts:feed.alerts.stale}},agencies};
fs.mkdirSync(path.join(root,'data/reports'),{recursive:true});
fs.writeFileSync(path.join(root,'data/reports/realtime-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
