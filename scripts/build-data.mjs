import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const root = path.resolve(import.meta.dirname, '..');
const configs = [
  { id:'bart', name:'BART', color:'#1675be', mode:'Rapid rail' },
  { id:'muni', name:'Muni', color:'#e33d3d', mode:'Metro & bus' },
  { id:'caltrain', name:'Caltrain', color:'#e45b95', mode:'Commuter rail' },
  { id:'vta', name:'VTA', color:'#176c63', mode:'Light rail & bus' },
  { id:'act', name:'AC Transit', color:'#4b8c3a', mode:'Bus' }
];

function csvLine(line) {
  const out=[]; let current=''; let quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){out.push(current);current=''}else current+=c}
  out.push(current.replace(/\r$/,'')); return out;
}
function readCsv(file) {
  if(!fs.existsSync(file)) return [];
  const lines=fs.readFileSync(file,'utf8').split(/\n/).filter(Boolean); const headers=csvLine(lines.shift()).map(x=>x.replace(/^\uFEFF/,''));
  return lines.map(line=>Object.fromEntries(csvLine(line).map((value,i)=>[headers[i],value])));
}
function simplify(points, tolerance=.00025) {
  if(points.length<3)return points;
  const sq=tolerance*tolerance; const keep=new Uint8Array(points.length); keep[0]=keep[points.length-1]=1; const stack=[[0,points.length-1]];
  while(stack.length){const [a,b]=stack.pop(),p1=points[a],p2=points[b];let max=0,index=0;const dx=p2[0]-p1[0],dy=p2[1]-p1[1],len=dx*dx+dy*dy;
    for(let i=a+1;i<b;i++){let t=len?((points[i][0]-p1[0])*dx+(points[i][1]-p1[1])*dy)/len:0;t=Math.max(0,Math.min(1,t));const ex=points[i][0]-(p1[0]+t*dx),ey=points[i][1]-(p1[1]+t*dy),d=ex*ex+ey*ey;if(d>max){max=d;index=i}}
    if(max>sq){keep[index]=1;stack.push([a,index],[index,b])}}
  return points.filter((_,i)=>keep[i]);
}
async function associateStops(file, tripToRoute, routeStops) {
  if(!fs.existsSync(file))return;
  const rl=readline.createInterface({input:fs.createReadStream(file)});let headers;
  for await(const line of rl){if(!headers){headers=csvLine(line);continue}const values=csvLine(line),trip=values[headers.indexOf('trip_id')],stop=values[headers.indexOf('stop_id')],route=tripToRoute.get(trip);if(route&&stop)routeStops.get(route)?.add(stop)}
}
async function buildAgency(cfg){
  const dir=path.join(root,'data/extracted',cfg.id), routesRaw=readCsv(path.join(dir,'routes.txt')), trips=readCsv(path.join(dir,'trips.txt')), stopsRaw=readCsv(path.join(dir,'stops.txt')), shapesRaw=readCsv(path.join(dir,'shapes.txt'));
  if(!routesRaw.length||!trips.length||!stopsRaw.length)throw new Error(`${cfg.name}: required GTFS tables missing`);
  const tripToRoute=new Map(),shapeUsage=new Map(),headsigns=new Map();
  for(const t of trips){tripToRoute.set(t.trip_id,t.route_id);if(t.shape_id){const key=`${t.route_id}|${t.direction_id||0}|${t.shape_id}`;shapeUsage.set(key,(shapeUsage.get(key)||0)+1)}if(t.trip_headsign&&!headsigns.has(t.route_id))headsigns.set(t.route_id,t.trip_headsign)}
  const bestShapes=new Map();
  for(const [key,count] of shapeUsage){const [route,direction,shape]=key.split('|'),slot=`${route}|${direction}`,old=bestShapes.get(slot);if(!old||count>old.count)bestShapes.set(slot,{shape,count})}
  const needed=new Set([...bestShapes.values()].map(x=>x.shape)),shapeMap=new Map();
  for(const s of shapesRaw){if(!needed.has(s.shape_id))continue;if(!shapeMap.has(s.shape_id))shapeMap.set(s.shape_id,[]);shapeMap.get(s.shape_id).push([+s.shape_pt_lon,+s.shape_pt_lat,+s.shape_pt_sequence])}
  for(const [id,pts] of shapeMap){pts.sort((a,b)=>a[2]-b[2]);shapeMap.set(id,simplify(pts.map(([lon,lat])=>[+lon.toFixed(5),+lat.toFixed(5)])))}
  const routeStops=new Map(routesRaw.map(r=>[r.route_id,new Set()])); await associateStops(path.join(dir,'stop_times.txt'),tripToRoute,routeStops);
  const stops=stopsRaw.filter(s=>s.stop_lat&&s.stop_lon&&(!s.location_type||s.location_type==='0'||s.location_type==='1')).map(s=>({id:s.stop_id,n:s.stop_name||s.stop_code||s.stop_id,p:[+s.stop_lon,+s.stop_lat],parent:s.parent_station||'',k:s.location_type==='1'?1:0}));
  const stopIds=new Set(stops.map(s=>s.id));
  const routes=routesRaw.map((r,i)=>{const shapes=[...bestShapes.entries()].filter(([key])=>key.startsWith(`${r.route_id}|`)).map(([,v])=>shapeMap.get(v.shape)).filter(Boolean);return{id:r.route_id,n:r.route_short_name||r.route_long_name||r.route_id,long:r.route_long_name||'',d:headsigns.get(r.route_id)||'',c:`#${(r.route_color||cfg.color.slice(1)).padStart(6,'0')}`,text:`#${(r.route_text_color||'FFFFFF').padStart(6,'0')}`,type:+r.route_type||3,shapes,stops:[...(routeStops.get(r.route_id)||[])].filter(id=>stopIds.has(id))}});
  const calendar=readCsv(path.join(dir,'calendar.txt')),dates=readCsv(path.join(dir,'calendar_dates.txt'));
  return {...cfg,feed:{start:calendar.map(x=>x.start_date).filter(Boolean).sort()[0]||'',end:calendar.map(x=>x.end_date).filter(Boolean).sort().at(-1)||'',exceptions:dates.length},routes,stops};
}

const agencies=[];for(const cfg of configs){const result=await buildAgency(cfg);agencies.push(result);console.log(`${cfg.name}: ${result.routes.length} routes, ${result.stops.length} stops`)}
const payload={generatedAt:new Date().toISOString(),bounds:[-123.05,36.85,-121.45,38.35],agencies};
fs.mkdirSync(path.join(root,'public/data'),{recursive:true});fs.writeFileSync(path.join(root,'public/data/network.json'),JSON.stringify(payload));
console.log(`Wrote ${(fs.statSync(path.join(root,'public/data/network.json')).size/1048576).toFixed(1)} MB`);
