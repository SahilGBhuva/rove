// Honest capabilities for the Vercel schedule-only preview.
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','public, s-maxage=30');
  return res.status(200).json({
    routing:{available:true,engine:'EXPERIMENTAL_SCHEDULE_ONLY',access:['WALK'],walkSteps:true,maxDriveMinutes:null},
    search:{addresses:false},
    // Live departures are verified by trip and stop id: BART always (its own feed, no key); Muni, AC Transit
    // and Caltrain when this server has a 511 key; VTA not yet (stop ids do not match the live feed).
    agencies:['bart','muni','caltrain','vta','act'].map(id=>{const live=id==='bart'||(id!=='vta'&&Boolean(process.env.SF_511_API_KEY));return live?{id,arrivals:'verified',arrivalsReasons:[]}:{id,arrivals:'unverified',arrivalsReasons:[id==='vta'?'LIVE_MATCHING_UNVERIFIED':'LIVE_DATA_UNAVAILABLE']};}),
    warning:'Trip plans use published schedules. Live departures and trip tracking are shown where an agency feed verifies them (BART; Muni, AC Transit and Caltrain when a 511 key is configured). Walking distances are straight-line estimates.'
  });
}
