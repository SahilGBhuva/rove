/* Live status for the trip a rider is catching or riding: GET /api/v2/live?agency&trip&board&exit&route&sb&se
 * Feeds: BART's own GTFS-Realtime trip updates (no key, refreshed ~30 s); 511.org regional trip
 * updates and vehicle positions for Muni, AC Transit, VTA and Caltrain (server-side key, cached so
 * the 511 limit of 60 requests/hour is respected). The key never reaches the browser. */
import G from 'gtfs-realtime-bindings';
import { tripLive, plannerId } from '../../lib/realtime/live-trip.mjs';

const AGENCIES = new Set(['bart', 'muni', 'act', 'vta', 'caltrain']);
const BART_URL = 'https://api.bart.gov/gtfsrt/tripupdate.aspx';
const TTL = { bart: 30_000, updates: 150_000, vehicles: 150_000 };
const memo = {}, inflight = {};
const num = v => (v && typeof v.toNumber === 'function' ? v.toNumber() : Number(v));

async function load(name, url) {
  const hit = memo[name];
  if (hit && Date.now() - hit.at < TTL[name]) return hit;
  inflight[name] ||= (async () => {
    const r = await fetch(url, { headers: { Accept: 'application/x-protobuf' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`${name} feed ${r.status}`);
    const msg = G.transit_realtime.FeedMessage.decode(new Uint8Array(await r.arrayBuffer()));
    memo[name] = { at: Date.now(), timestamp: num(msg.header?.timestamp) || 0, entities: msg.entity || [] };
    return memo[name];
  })().finally(() => { delete inflight[name]; });
  try { return await inflight[name]; }
  catch (error) { if (hit && Date.now() - hit.at < 300_000) return hit; throw error; }
}
const vehiclesFrom = feed => (feed?.entities || []).filter(e => e.vehicle?.position && e.vehicle.trip?.tripId).map(e => ({
  tripId: e.vehicle.trip.tripId, lat: Number(e.vehicle.position.latitude), lon: Number(e.vehicle.position.longitude),
  bearing: e.vehicle.position.bearing ?? null, timestamp: num(e.vehicle.timestamp) || null
}));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=15');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = req.query || Object.fromEntries(new URL(req.url, 'https://rove.invalid').searchParams);
  const agency = String(q.agency || '');
  const trip = String(q.trip || '').slice(0, 80);
  if (!AGENCIES.has(agency) || !/^[\w.:-]{1,80}$/.test(trip)) return res.status(400).json({ status: 'bad-request', reasons: ['agency and trip are required'] });
  const query = {
    tripId: plannerId(trip), boardStopId: q.board ? plannerId(q.board) : null, exitStopId: q.exit ? plannerId(q.exit) : null,
    routeId: q.route ? plannerId(q.route) : null, scheduledBoard: Number(q.sb) || null, scheduledExit: Number(q.se) || null
  };
  try {
    let updates, vehicles = [];
    if (agency === 'bart') {
      updates = await load('bart', BART_URL); // BART publishes no vehicle positions
    } else {
      const key = process.env.SF_511_API_KEY;
      if (!key) return res.status(200).json({ status: 'unavailable', reasons: ['Live data is not configured on this server.'] });
      const k = encodeURIComponent(key);
      const [u, v] = await Promise.allSettled([
        load('updates', `https://api.511.org/transit/tripupdates?agency=RG&api_key=${k}`),
        load('vehicles', `https://api.511.org/transit/vehiclepositions?agency=RG&api_key=${k}`)
      ]);
      if (u.status !== 'fulfilled') throw u.reason;
      updates = u.value;
      vehicles = v.status === 'fulfilled' ? vehiclesFrom(v.value) : [];
    }
    return res.status(200).json({ agency, source: agency === 'bart' ? 'BART' : '511.org', ...tripLive(updates, vehicles, query) });
  } catch {
    return res.status(200).json({ status: 'unavailable', reasons: ['Live data could not be reached right now.'] });
  }
}
