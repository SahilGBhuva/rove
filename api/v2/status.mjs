// Honest capabilities for the Vercel schedule-only preview.
export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  res.setHeader('Cache-Control','public, s-maxage=30');
  return res.status(200).json({
    routing:{available:true,engine:'EXPERIMENTAL_SCHEDULE_ONLY',access:['WALK'],walkSteps:true,maxDriveMinutes:null},
    search:{addresses:false},
    agencies:['bart','muni','caltrain','vta','act'].map(id=>({
      id,
      arrivalsReasons: process.env.SF_511_API_KEY && ['muni','act'].includes(id)
        ? [] : ['LIVE_DATA_UNAVAILABLE'],
      arrivalsCapability: process.env.SF_511_API_KEY && ['muni','act'].includes(id)
        ? 'VERIFIED_WHEN_FRESH' : 'UNVERIFIED'
    })),
    warning:'Trip-planning itineraries are schedule-only. Separate real-time departures are supported for certain Muni and AC Transit stops only when a fresh feed is available. No physical boarding confirmation or verified pedestrian safety guidance.'
  });
}
