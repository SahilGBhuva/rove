/* Journey assistance uses verified itinerary stop sequences, never assumed stop order.
 * GPS observations provide estimates, not vehicle/boarding confirmation. */
(function(root) {
  const CACHE_KEY = 'rove-journey-v1';
  function normalizeStop(record) {
    const s = record?.stop || record;
    if (!s) return null;
    const lat = Number(s.lat ?? s.latitude);
    const lon = Number(s.lon ?? s.longitude);
    const name = s.name || s.stopName || record?.name;
    if (typeof name !== 'string' || !name.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { name: name.trim(), lat, lon, id: s.id || s.stopId || null };
  }
  function stopSequence(leg) {
    if (!Array.isArray(leg?.intermediateStops)) return null;
    const list = [leg.from, ...leg.intermediateStops, leg.to].map(normalizeStop);
    return list.every(Boolean) && list.length >= 3 ? list : null;
  }
  function distanceMetres(point,stop) {
    const dy = (point[1] - stop.lat) * 111200;
    const dx = (point[0] - stop.lon) * 111200 * Math.cos(stop.lat * Math.PI / 180);
    return Math.hypot(dx,dy);
  }
  function updateStopProgress(stops, progress, fix, now = Date.now()) {
    const prev = progress && Number.isInteger(progress.confirmed) ? progress.confirmed : 0;
    const current = {confirmed:prev,pending:progress?.pending||null,changed:false,remaining:null};
    if (!Array.isArray(stops) || stops.length < 3) return {...current,reason:'sequence-unavailable'};
    current.remaining=Math.max(0,stops.length-1-prev);
    if (!fix || !Array.isArray(fix.point) || !Number.isFinite(fix.accuracy) || fix.accuracy > 40 ||
        !Number.isFinite(fix.time) || now-fix.time > 18000 || fix.time > now+2000)
      return {...current,pending:null,reason:'location-uncertain'};
    const next = stops[prev+1];
    if (!next) return current;
    const distance = distanceMetres(fix.point,next);
    if (distance > Math.max(75,fix.accuracy*2)) return {...current,pending:null,reason:'not-near-next-stop'};
    const pending = current.pending;
    if (pending?.index === prev+1 && fix.time > pending.lastTime &&
        fix.time - pending.firstTime >= 3000 && fix.time - pending.firstTime <= 45000) {
      return {confirmed:prev+1,pending:null,changed:true,remaining:Math.max(0,stops.length-prev-2),reason:'gps-estimate'};
    }
    if (!pending || pending.index !== prev+1 || fix.time-pending.firstTime>45000)
      return {...current,pending:{index:prev+1,firstTime:fix.time,lastTime:fix.time},reason:'awaiting-second-fix'};
    return {...current,reason:'awaiting-second-fix'};
  }
  function nextTransfer(steps,index) {
    for(let i=index+1;i<(steps||[]).length;i++) {
      const step=steps[i];
      if(step?.type==='wait') return {index:i,route:step.li?.badge||step.leg?.routeName||'transit',
        headsign:step.leg?.headsign||null,stop:step.leg?.from?.name||'the next stop',
        time:step.departs instanceof Date ? step.departs.toISOString() : null};
    }
    return null;
  }
  function safeSnapshot(nav,now=Date.now()) {
    if (!nav?.it || !Array.isArray(nav.it.legs) || !nav.destination || !Array.isArray(nav.steps)) return null;
    return {v:1,savedAt:now,it:nav.it,destination:nav.destination,
      index:nav.i,boarded:!!nav.boarded,stopProgress:nav.stopProgress||null};
  }
  function validSnapshot(s,now=Date.now()) {
    const end=Date.parse(s?.it?.endTime);
    return !!(s?.v===1 && Number.isFinite(s.savedAt) && s.savedAt<=now+60000 && now-s.savedAt < 12*3600000 &&
      Number.isFinite(end) && now < end+2*3600000 &&
      Number.isInteger(s.index) && s.index>=0 && s.index<100 &&
      Array.isArray(s.it.legs) && s.it.legs.length<=30 &&
      s.destination && Number.isFinite(Number(s.destination.lat)) && Number.isFinite(Number(s.destination.lon)));
  }
  function store(nav,storage,now=Date.now()) {
    try {const s=safeSnapshot(nav,now);if(s)storage.setItem(CACHE_KEY,JSON.stringify(s));return !!s;}catch{return false;}
  }
  function load(storage,now=Date.now()) {
    try {const s=JSON.parse(storage.getItem(CACHE_KEY)||'null');return validSnapshot(s,now)?s:null;}catch{return null;}
  }
  function clear(storage) {try{storage.removeItem(CACHE_KEY);}catch{}}
  // Only trust server-validated GTFS-Realtime predictions for the exact route at
  // the queried stop. Without a matching trip ID this is NOT the selected vehicle.
  function matchArrivals(response, routeId, tripId, now=Date.now()) {
    const stamp=Number(response?.feed?.headerTimestamp);
    if(response?.status!=='live' || response.stale ||
       !Number.isFinite(stamp) || Math.abs(now-stamp*1000)>110000)
      return {status:'unverified',estimates:[],reason:'Real-time arrivals are unavailable or stale.'};
    const estimates=(Array.isArray(response.arrivals)?response.arrivals:[])
      .filter(a=>String(a.routeId||'')===String(routeId||'') &&
        Number.isFinite(Number(a.time)) && Number(a.time)*1000>=now-60000 &&
        Number(a.time)*1000<=now+3600000)
      .sort((a,b)=>Number(a.time)-Number(b.time))
      .slice(0,3)
      .map(a=>({time:Number(a.time),delay:a.delay??null,
        exactTrip:!!tripId && String(a.tripId||'')===String(tripId)}));
    if(!estimates.length)return {status:'no-route-prediction',estimates:[],
      reason:'No verified prediction for this route at the selected stop.'};
    return {status:'live',estimates,feedTs:stamp,exactTrip:estimates.some(e=>e.exactTrip)};
  }
  root.RoveJourneyAssist={normalizeStop,stopSequence,distanceMetres,updateStopProgress,nextTransfer,
    safeSnapshot,validSnapshot,store,load,clear,matchArrivals,CACHE_KEY};
})(typeof globalThis !== 'undefined' ? globalThis : window);
