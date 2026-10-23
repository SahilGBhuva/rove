import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { readFileSync } from 'node:fs';
const prefix = { SF: 'muni', AC: 'act', SC: 'vta', CT: 'caltrain' };
const network = JSON.parse(readFileSync(new URL('../../public/data/network.json', import.meta.url), 'utf8'));
const known = Object.fromEntries(network.agencies.map(a => [a.id, new Set(a.routes.map(r => String(r.id)))]));
const inBounds = (lat, lon) => lat >= 36.9 && lat <= 38.6 && lon >= -123.1 && lon <= -121.1;
const numeric = n => n?.toNumber ? n.toNumber() : Number(n);
let cached = null;
let inflight = null;
async function retrieve() {
  const key = process.env.SF_511_API_KEY;
  if (!key) return { generatedAt: Date.now(), configured: { feed511: false, bartDirect: false }, feeds: {}, quality: {}, vehicles: [], updates: [], alerts: [], errors: [{ feed: 'vehicles', message: '511 feed is not configured' }] };
  const response = await fetch('https://api.511.org/transit/vehiclepositions?agency=RG&api_key=' + encodeURIComponent(key), {
    headers: { Accept: 'application/x-protobuf' }, signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('511 vehicle feed returned ' + response.status);
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(await response.arrayBuffer()));
  const timestamp = numeric(message.header?.timestamp) || Math.floor(Date.now() / 1000);
  const age = Math.max(0, Date.now() / 1000 - timestamp);
  const stale = age > 270;
  const vehicles = [];
  for (const e of message.entity || []) {
    const v = e.vehicle;
    if (!v?.position || !v.trip?.routeId) continue;
    const raw = String(v.trip.routeId);
    const m = /^([A-Za-z]{2}):(.*)$/.exec(raw);
    if (!m) continue;
    const agency = prefix[m[1].toUpperCase()];
    if (!agency || !known[agency]?.has(m[2])) continue;
    const lat = Number(v.position.latitude), lon = Number(v.position.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBounds(lat, lon)) continue;
    const observed = numeric(v.timestamp) || timestamp;
    if (Date.now() / 1000 - observed > 900) continue;
    vehicles.push({ id: v.vehicle?.id || e.id, label: v.vehicle?.label || '', agency, routeId: m[2],
      lat, lon, bearing: v.position.bearing ?? null, speed: v.position.speed ?? null, timestamp: observed });
  }
  return { generatedAt: Date.now(), configured: { feed511: true, bartDirect: false },
    feeds: { vehicles: { headerTimestamp: timestamp, fetchedAt: Date.now(), stale } },
    quality: {}, vehicles: stale ? [] : vehicles, updates: [], alerts: [], errors: [] };
}
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, s-maxage=180, stale-while-revalidate=60');
  try {
    if (!cached || Date.now() - cached.generatedAt > 120000) {
      inflight ||= retrieve().finally(() => { inflight = null; });
      cached = await inflight;
    }
    return res.status(200).json(cached);
  } catch {
    if (cached && Date.now() - cached.generatedAt < 270000) return res.status(200).json({ ...cached, feeds: { vehicles: { ...cached.feeds.vehicles, stale: true } }, vehicles: [] });
    return res.status(503).json({ error: 'Live vehicle positions temporarily unavailable', configured: { feed511: false, bartDirect: false }, vehicles: [] });
  }
}
