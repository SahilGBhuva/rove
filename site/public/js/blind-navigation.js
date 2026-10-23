// Conservative stop proximity: advisory only, never proof of boarding or safe exit.
(function(root){
 function exitProximity(fix,stop,now=Date.now()){
  if(!fix||!stop||!Number.isFinite(stop.lon)||!Number.isFinite(stop.lat))return null;
  if(!Number.isFinite(fix.accuracy)||fix.accuracy>65||now-fix.time>20000)return null;
  const dlat=(fix.point[1]-stop.lat)*111200;
  const dlon=(fix.point[0]-stop.lon)*111200*Math.cos(stop.lat*Math.PI/180);
  const distance=Math.hypot(dlat,dlon);
  return {distance,near:distance<=Math.max(170,fix.accuracy*2),accuracy:fix.accuracy};
 }
 function stopMessage(route,stop,proximity){
  if(!proximity)return 'Location is not reliable enough to estimate your exit stop. Check stop announcements and ask transit staff if needed.';
  return proximity.near?`GPS suggests ${stop} may be nearby. Prepare to exit ${route}. Confirm the stop with vehicle announcements before leaving.`:`GPS estimates approximately ${Math.round(proximity.distance/50)*50} meters to ${stop}. This is not a stop-count or arrival guarantee.`;
 }
 root.RoveBlindNavigation={exitProximity,stopMessage};
})(typeof globalThis!=='undefined'?globalThis:window);
