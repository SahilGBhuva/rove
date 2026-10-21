// Honest capabilities for the Vercel schedule-only preview.
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','public, s-maxage=30');
  return res.status(200).json({
    routing:{available:true,engine:'EXPERIMENTAL_SCHEDULE_ONLY',access:['WALK'],walkSteps:false,maxDriveMinutes:null},
    search:{addresses:false},
    agencies:['bart','muni','caltrain','vta','act'].map(id=>({id,arrivalsReasons:['LIVE_DATA_UNAVAILABLE']})),
    warning:'Scheduled stop-to-stop preview only. No verified pedestrian directions, real-time departures, or turn-by-turn navigation.'
  });
}
