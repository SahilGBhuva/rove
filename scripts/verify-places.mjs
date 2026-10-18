// Real-data check of search and door-to-door planning through a running Rove server.
// Searches well-known Bay Area places and checks the top result lands within a tolerance of the
// place's known location, then plans address-to-address trips using the search results.
// Writes data/reports/places-verification.json (ignored by Git).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.ROVE_URL || 'http://localhost:4173';
const get = async p => { const r = await fetch(base + p, { signal: AbortSignal.timeout(60_000) }); return { status: r.status, body: await r.json() }; };
const meters = (a, b) => Math.hypot((b.lon - a.lon) * 88_000, (b.lat - a.lat) * 111_000);

// Expected locations are the places' publicly known positions, rounded; tolerances allow for
// the map feature's point (entrance, building centroid or campus center).
const SEARCHES = [
  { q: 'Ferry Building', at: [37.7955, -122.3937], within: 300 },
  { q: 'SFO', at: [37.6213, -122.3790], within: 2500 },
  { q: 'Oakland airport', at: [37.7126, -122.2197], within: 3000 },
  { q: 'Salesforce Tower', at: [37.7897, -122.3972], within: 200 },
  { q: 'Oracle Park', at: [37.7786, -122.3893], within: 300 },
  { q: 'Chase Center', at: [37.7680, -122.3877], within: 300 },
  { q: 'Coit Tower', at: [37.8024, -122.4058], within: 200 },
  { q: 'Pier 39', at: [37.8087, -122.4098], within: 300 },
  { q: 'Stanford University', at: [37.4275, -122.1697], within: 1500 },
  { q: 'UC Berkeley', at: [37.8719, -122.2585], within: 500 },
  { q: 'University of California, Berkeley', at: [37.8719, -122.2585], within: 500 },
  { q: 'Levi\'s Stadium', at: [37.4033, -121.9694], within: 400 },
  { q: 'Lake Merritt', at: [37.8019, -122.2585], within: 1200 },
  { q: '1355 Market St', at: [37.7767, -122.4166], within: 150, kind: 'address' },
  { q: '2150 Shattuck Ave Berkeley', at: [37.8701, -122.2684], within: 150, kind: 'address' },
  { q: '1600 Amphitheatre Pkwy', at: [37.4220, -122.0841], within: 300 },
  { q: '1 Infinite Loop Cupertino', at: [37.3318, -122.0312], within: 300 },
  { q: 'Powell St BART', at: [37.7844, -122.4079], within: 300 },
  { q: 'San Jose Diridon', at: [37.3297, -121.9025], within: 400 },
  { q: '4th and King', at: [37.7766, -122.3947], within: 400 }
];

const TRIPS = [
  ['1355 Market St', '2150 Shattuck Ave Berkeley'],
  ['Ferry Building', 'Stanford University'],
  ['UC Berkeley', 'Ferry Building'],
  ['Oracle Park', 'Levi\'s Stadium'],
  ['Coit Tower', 'SFO']
];

let failures = 0;
const searchResults = [];
const top = {};
for (const c of SEARCHES) {
  const { status, body } = await get(`/api/v2/places/search?q=${encodeURIComponent(c.q)}&limit=5`);
  const first = body.results?.[0];
  const problems = [];
  if (status !== 200) problems.push(`HTTP ${status}`);
  if (!first) problems.push(`no results${body.reason ? ` (${body.reason})` : ''}`);
  else {
    const d = Math.round(meters({ lat: c.at[0], lon: c.at[1] }, first));
    if (d > c.within) problems.push(`top result is ${d} m from the expected location (limit ${c.within} m)`);
    if (c.kind && first.kind !== c.kind) problems.push(`top result kind ${first.kind}, expected ${c.kind}`);
    top[c.q] = first;
  }
  if (problems.length) failures++;
  searchResults.push({ query: c.q, ok: !problems.length, problems, top: first ? `${first.kind}: ${first.name}, ${first.address || first.city || ''} (${first.lat}, ${first.lon})` : null });
  console.log(`${problems.length ? '✗' : '✓'} search "${c.q}" → ${first ? `${first.name} [${first.kind}]` : 'nothing'}${problems.length ? `  ${problems.join('; ')}` : ''}`);
}

const tripResults = [];
for (const [from, to] of TRIPS) {
  const a = top[from], b = top[to];
  const problems = [];
  let summary = null;
  if (!a || !b) problems.push('search did not resolve both places');
  else {
    const qs = new URLSearchParams({ fromLat: a.lat, fromLon: a.lon, toLat: b.lat, toLon: b.lon, fromName: a.name, toName: b.name, limit: '2', time: process.env.ROVE_PLAN_TIME || '2026-10-20T08:30:00-07:00' });
    const { status, body } = await get(`/api/v2/plan?${qs}`);
    const it = body.itineraries?.[0];
    if (status !== 200 || !it) problems.push(`no itinerary (HTTP ${status}${body.errors?.length ? `, ${body.errors.map(e => e.code).join(', ')}` : ''}${body.error ? `, ${body.error}` : ''})`);
    else {
      if (!it.legs.some(l => l.transit)) problems.push('no transit leg');
      const first = it.legs[0], last = it.legs.at(-1);
      if (meters(a, first.from) > 300 || meters(b, last.to) > 300) problems.push('itinerary does not start and end at the searched places');
      summary = `${Math.round(it.durationSeconds / 60)} min: ` + it.legs.map(l => l.transit ? `${l.agency.name} ${l.route.shortName || l.route.longName} ${l.from.name} ${l.start.scheduled.slice(11, 16)} → ${l.to.name}` : `walk ${l.distanceMeters} m`).join(' | ');
    }
  }
  if (problems.length) failures++;
  tripResults.push({ from, to, ok: !problems.length, problems, summary });
  console.log(`${problems.length ? '✗' : '✓'} trip ${from} → ${to}${summary ? `\n    ${summary}` : ''}${problems.length ? `\n    ${problems.join('; ')}` : ''}`);
}

// The frontend's POST /api/journeys contract, on the same real searches.
{
  const a = top['1355 Market St'], b = top['Chase Center'];
  const problems = [];
  let summary = null;
  if (!a || !b) problems.push('search did not resolve both places');
  else {
    const r = await fetch(`${base}/api/journeys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ from: { name: a.name, lat: a.lat, lon: a.lon }, to: { name: b.name, lat: b.lat, lon: b.lon }, dateTime: process.env.ROVE_PLAN_TIME || '2026-10-20T17:30:00-07:00', arriveBy: false, modes: ['TRANSIT', 'WALK'] }) });
    const body = await r.json();
    const it = body.itineraries?.[0];
    if (r.status !== 200 || !it) problems.push(`HTTP ${r.status}${body.error ? ` ${body.error.code}` : ''}`);
    else {
      for (const k of ['id', 'startTime', 'endTime', 'durationSeconds', 'walkMeters', 'transfers', 'legs']) if (it[k] === undefined) problems.push(`missing ${k}`);
      const t = it.legs.find(l => l.mode === 'TRANSIT');
      if (!t) problems.push('no TRANSIT leg');
      else for (const k of ['agencyId', 'routeId', 'routeName', 'routeColor', 'from', 'to', 'startTime', 'endTime', 'geometry']) if (t[k] == null) problems.push(`transit leg missing ${k}`);
      if (it.legs.some(l => l.realtime)) problems.push('realtime flagged without live routing data');
      summary = it.legs.map(l => l.mode === 'TRANSIT' ? `${l.agencyName} ${l.routeName} ${l.startTime.slice(11, 16)}` : `walk ${l.distanceMeters} m`).join(' | ');
    }
  }
  if (problems.length) failures++;
  tripResults.push({ from: '1355 Market St', to: 'Chase Center', endpoint: 'POST /api/journeys', ok: !problems.length, problems, summary });
  console.log(`${problems.length ? '✗' : '✓'} POST /api/journeys 1355 Market St → Chase Center${summary ? `\n    ${summary}` : ''}${problems.length ? `\n    ${problems.join('; ')}` : ''}`);
}

fs.mkdirSync(path.join(root, 'data/reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/reports/places-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), searchResults, tripResults }, null, 2) + '\n');
const total = SEARCHES.length + TRIPS.length + 1;
if (failures) { console.error(`${failures}/${total} checks failed`); process.exit(1); }
console.log(`All ${total} search and door-to-door checks passed`);
