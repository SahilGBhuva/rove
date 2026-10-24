// Best-effort pedestrian geometry for the scheduled preview; fail closed on invalid paths.
// The public Valhalla demo has no SLA. Never invent a street path when it is unavailable.
const ROUTER = 'https://valhalla1.openstreetmap.de/route';
const TIMEOUT_MS = 3800;
const MAX_WALK_METERS = 1800;
const MAX_AIR_METERS = 950;
const cache = new Map();
// Avoid duplicate network calls when route alternatives share a transfer.
const inFlight = new WeakMap();

export function decodeShape(shape, precision = 6) {
  const out = []; let index = 0, lat = 0, lon = 0;
  while (index < shape.length) {
    const values = [];
    for (let coordinate = 0; coordinate < 2; coordinate++) {
      let result = 0, shift = 0, byte;
      do {
        if (index >= shape.length || shift > 30) throw new Error('Invalid path encoding');
        byte = shape.charCodeAt(index++) - 63;
        if (byte < 0 || byte > 63) throw new Error('Invalid path encoding');
        result |= (byte & 31) << shift; shift += 5;
      } while (byte >= 32);
      values.push((result & 1) ? ~(result >> 1) : (result >> 1));
    }
    lat += values[0]; lon += values[1];
    out.push([lon / 10 ** precision, lat / 10 ** precision]);
    if (out.length > 10000) throw new Error('Path too long');
  }
  return out;
}
export function metersBetween(a,b) {
  const dy = (a.lat-b.lat)*111200;
  const dx = (a.lon-b.lon)*111200*Math.cos(a.lat*Math.PI/180);
  return Math.hypot(dx,dy);
}
async function walkingPathUncached(from,to,fetcher) {
  const air = metersBetween(from,to);
  if (air < 2) return {distanceMeters:0,durationSeconds:0,geometry:{type:'LineString',coordinates:[[from.lon,from.lat],[to.lon,to.lat]]},steps:[],verified:true};
  if (air > MAX_AIR_METERS) return null;
  const key = [from,to].map(p=>p.lat.toFixed(5)+','+p.lon.toFixed(5)).join('|');
  if (cache.has(key)) return cache.get(key);
  const query = JSON.stringify({locations:[{lat:from.lat,lon:from.lon},{lat:to.lat,lon:to.lon}],costing:'pedestrian',units:'kilometers'});
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try {
    const response = await fetcher(ROUTER+'?json='+encodeURIComponent(query), {signal:controller.signal,headers:{Accept:'application/json'}});
    if (!response.ok) return null;
    const body = await response.json();
    const leg = body?.trip?.legs?.[0];
    const summary = leg?.summary;
    if (body?.trip?.status !== 0 || typeof leg?.shape !== 'string' || !summary) return null;
    const coordinates = decodeShape(leg.shape);
    const distanceMeters = Math.round(summary.length * 1000);
    const durationSeconds = Math.ceil(summary.time);
    if (coordinates.length<2 || !Number.isFinite(distanceMeters) || distanceMeters < 1 ||
       distanceMeters > MAX_WALK_METERS || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
    const first = coordinates[0],last = coordinates.at(-1);
    if (metersBetween({lat:first[1],lon:first[0]},from)>65 ||
        metersBetween({lat:last[1],lon:last[0]},to)>65) return null;
    const steps = (leg.maneuvers || []).filter(m=>Number.isInteger(m.begin_shape_index) && coordinates[m.begin_shape_index])
      .map(m=>({lat:coordinates[m.begin_shape_index][1],lon:coordinates[m.begin_shape_index][0],
        instruction:String(m.instruction||'Continue walking').slice(0,180),
        streetName:Array.isArray(m.street_names)?m.street_names[0]||null:null,
        relativeDirection:'CONTINUE',distanceMeters:Math.round((m.length||0)*1000)}));
    const result = {distanceMeters,durationSeconds,geometry:{type:'LineString',coordinates},steps,verified:true,provider:'Valhalla / OpenStreetMap'};
    cache.set(key,result);
    if (cache.size>100) cache.delete(cache.keys().next().value);
    return result;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}
export function walkingPath(from,to,fetcher=fetch) {
  let pending = inFlight.get(fetcher);
  if (!pending) { pending = new Map(); inFlight.set(fetcher,pending); }
  const key = [from,to].map(p=>p.lat.toFixed(5)+','+p.lon.toFixed(5)).join('|');
  if (pending.has(key)) return pending.get(key);
  const request = walkingPathUncached(from,to,fetcher);
  pending.set(key,request);
  void request.then(()=>pending.delete(key),()=>pending.delete(key));
  return request;
}
export async function enrichWalks(itinerary,fetcher=fetch) {
  if (!itinerary?.legs?.length) return false;
  const walkLegs = itinerary.legs.filter(l=>l.mode==='WALK');
  if (!walkLegs.length) return false;
  // Never declare a transit itinerary navigable unless EVERY walking leg has a routed path.
  const paths = await Promise.all(walkLegs.map(l=>walkingPath(l.from,l.to,fetcher)));
  for(let i=0;i<walkLegs.length;i++) {
    const path=paths[i];
    if (!path) continue;
    const availableSeconds=(Date.parse(walkLegs[i].end.scheduled)-Date.parse(walkLegs[i].start.scheduled))/1000;
    Object.assign(walkLegs[i],path,{approximate:false,scheduledWalkSeconds:availableSeconds});
  }
  // A scheduled transfer is not reliable if the street route needs more time
  // than the approximate slot originally allocated to walking.
  const impossibleTransfer=walkLegs.some(l=>{
    if (!l.verified) return false;
    const index=itinerary.legs.indexOf(l);
    const followedByTransit=itinerary.legs.slice(index+1).some(next=>next.transit);
    return followedByTransit && l.durationSeconds>l.scheduledWalkSeconds+10;
  });
  const walkReady=walkLegs.every(l=>l.verified && l.geometry?.coordinates?.length) && !impossibleTransfer;
  itinerary.walkingVerified=walkReady;
  itinerary.transferFeasible=!impossibleTransfer;
  const last=itinerary.legs.at(-1);
  if (last.mode==='WALK' && last.verified) {
    last.end.scheduled=new Date(Date.parse(last.start.scheduled)+last.durationSeconds*1000).toISOString();
    itinerary.end=last.end.scheduled;
    itinerary.durationSeconds=Math.round((Date.parse(itinerary.end)-Date.parse(itinerary.start))/1000);
  }
  itinerary.walkMeters=walkLegs.reduce((s,l)=>s+(l.distanceMeters||0),0);
  itinerary.walkSeconds=walkLegs.reduce((s,l)=>s+(l.durationSeconds||0),0);
  return walkReady;
}
