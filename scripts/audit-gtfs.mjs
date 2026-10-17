import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const agencyArg = process.argv[2];
const dirArg = process.argv[3];
const agencies = agencyArg ? [agencyArg] : ['bart', 'muni', 'vta', 'act', 'caltrain'];

function csvLine(line) {
  const out=[]; let value=''; let quoted=false;
  for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){out.push(value);value=''}else value+=c}
  out.push(value.replace(/\r$/, '')); return out;
}
function readCsv(file) {
  if(!fs.existsSync(file)) return [];
  const lines=fs.readFileSync(file,'utf8').split(/\n/).filter(Boolean);
  const headers=csvLine(lines.shift()||'').map(x=>x.replace(/^\uFEFF/,''));
  return lines.map(line=>Object.fromEntries(csvLine(line).map((value,i)=>[headers[i],value])));
}
function ymd(date){return `${date.getFullYear()}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`}
function dayName(date){return ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getDay()]}
function activeServices(calendar, exceptions, date) {
  const key=ymd(date),active=new Set(calendar.filter(row=>row.start_date<=key&&row.end_date>=key&&row[dayName(date)]==='1').map(row=>row.service_id));
  for(const row of exceptions.filter(row=>row.date===key)){if(row.exception_type==='1')active.add(row.service_id);if(row.exception_type==='2')active.delete(row.service_id)}
  return active;
}
function sha256(file){return fs.existsSync(file)?crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'):null}

const report={generatedAt:new Date().toISOString(),agencies:{}};
let failed=false;
for(const id of agencies){
  const dir=dirArg?path.resolve(dirArg):path.join(root,'data/extracted',id);
  const required=['routes.txt','trips.txt','stops.txt','stop_times.txt','shapes.txt'];
  const missing=required.filter(name=>!fs.existsSync(path.join(dir,name)));
  const calendar=readCsv(path.join(dir,'calendar.txt')),exceptions=readCsv(path.join(dir,'calendar_dates.txt'));
  const routes=readCsv(path.join(dir,'routes.txt')),trips=readCsv(path.join(dir,'trips.txt')),stops=readCsv(path.join(dir,'stops.txt'));
  const routeIds=new Set(routes.map(x=>x.route_id)),stopIds=new Set(stops.map(x=>x.stop_id));
  const invalidTripRoutes=trips.filter(x=>!routeIds.has(x.route_id)).length;
  const dates=[];for(let i=0;i<15;i++){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+i);dates.push({date:ymd(d),activeServices:activeServices(calendar,exceptions,d).size})}
  const serviceDates=[...calendar.flatMap(x=>[x.start_date,x.end_date]),...exceptions.map(x=>x.date)].filter(Boolean).sort();
  const boardableStops=stops.filter(x=>!x.location_type||x.location_type==='0'||x.location_type==='1').length;
  const archive=path.join(root,'data/raw',`${id}.zip`);
  const ok=!missing.length&&!invalidTripRoutes&&routes.length>0&&trips.length>0&&boardableStops>0&&dates.every(x=>x.activeServices>0);
  report.agencies[id]={ok,sourceArchiveSha256:dirArg?null:sha256(archive),missing,serviceRange:{start:serviceDates[0]||null,end:serviceDates.at(-1)||null},next15Days:dates,counts:{routes:routes.length,trips:trips.length,stops:stops.length,boardableStops},integrity:{invalidTripRoutes,uniqueRouteIds:routeIds.size,uniqueStopIds:stopIds.size}};
  if(!ok)failed=true;
  console.log(`${id}: ${ok?'PASS':'FAIL'} · ${routes.length} routes · ${boardableStops} boardable stops · service ${serviceDates[0]||'unknown'}–${serviceDates.at(-1)||'unknown'}`);
  if(missing.length)console.log(`  missing: ${missing.join(', ')}`);
  if(dates.some(x=>x.activeServices===0))console.log(`  no active service: ${dates.filter(x=>x.activeServices===0).map(x=>x.date).join(', ')}`);
}
if(!agencyArg){fs.mkdirSync(path.join(root,'data/reports'),{recursive:true});fs.writeFileSync(path.join(root,'data/reports/gtfs-audit.json'),JSON.stringify(report,null,2)+'\n')}
if(failed)process.exitCode=1;
