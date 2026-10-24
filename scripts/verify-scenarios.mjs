// End-to-end launch scenarios through a running Rove server (search -> plan -> arrivals).
// Every check uses real data. Each result is labeled:
//   schedule  planned from the published GTFS schedules through OpenTripPlanner
//   live      uses live realtime feeds (511 or BART), only meaningful while those feeds are reachable
// Fixture tests are not part of this script (see npm test).
// Usage: ROVE_URL=http://localhost:4180 node scripts/verify-scenarios.mjs
// Writes data/reports/scenarios-verification.json (ignored by Git).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.ROVE_URL || 'http://localhost:4173';
// These launch scenarios require the full OTP server and its local place index.
// Vercel preview exposes a smaller schedule-only contract with external geocoding.
const capabilities = await fetch(`${base}/api/v2/status`, { signal: AbortSignal.timeout(15000) }).then(r => r.json());
if (capabilities?.routing?.engine === 'EXPERIMENTAL_SCHEDULE_ONLY') {
  console.log('SKIPPED: full-engine launch scenarios do not apply to the schedule-only preview. Run scripts/demo-readiness.mjs instead.');
  process.exit(3);
}
const DAY = process.env.ROVE_TEST_DAY || nextWeekday();
const results = [];
let failures = 0;

function nextWeekday() {
  const d = new Date();
  for (;;) {
    d.setUTCDate(d.getUTCDate() + 1);
    const local = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    if (![0, 6].includes(local.getDay())) return d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  }
}
const at = hhmm => `${DAY}T${hhmm}:00-07:00`;
const get = async p => { const r = await fetch(base + p, { signal: AbortSignal.timeout(60_000) }); return { status: r.status, body: await r.json() }; };
const search = async q => (await get(`/api/v2/places/search?q=${encodeURIComponent(q)}&limit=3`)).body.results?.[0] || null;
const fmt = it => `${it.start.slice(11, 16)} → ${it.end.slice(11, 16)} (${Math.round(it.durationSeconds / 60)} min): ` + it.legs.map(l => l.transit
  ? `${l.agency.name} ${l.route.shortName || l.route.longName} ${l.from.name} ${l.start.scheduled.slice(11, 16)} → ${l.to.name}`
  : `${l.mode === 'CAR' ? 'drive' : 'walk'} ${l.distanceMeters} m`).join(' | ');

function record(name, kind, problems, detail, skipped = false) {
  if (problems.length) failures++;
  results.push({ name, kind, ok: !problems.length && !skipped, skipped, problems, detail });
  const mark = problems.length ? '✗' : skipped ? '–' : '✓';
  console.log(`${mark} [${kind}] ${name}${skipped ? ' (skipped: no live feed data)' : ''}${detail ? `\n    ${detail}` : ''}${problems.length ? `\n    problem: ${problems.join('; ')}` : ''}`);
}

/** Structural checks every real itinerary must pass. */
function checkItinerary(it) {
  const p = [];
  const start = Date.parse(it.start), end = Date.parse(it.end);
  if (Math.abs((end - start) / 1000 - it.durationSeconds) > 60) p.push('duration does not equal end minus start');
  let prevEnd = start;
  for (const l of it.legs) {
    const s = Date.parse(l.start.scheduled), e = Date.parse(l.end.scheduled);
    if (s + 1000 < prevEnd) p.push(`leg ${l.mode} starts before the previous leg ends`);
    if (e < s) p.push(`leg ${l.mode} ends before it starts`);
    prevEnd = e;
    if (!l.geometry?.coordinates?.length && (l.distanceMeters || 0) > 50) p.push(`leg ${l.mode} has no geometry`);
    if (l.transit && (!l.route?.id || !l.trip?.id || !l.from.stop || !l.to.stop)) p.push('transit leg missing route, trip or stop');
    if (!l.transit && (l.distanceMeters || 0) > 80) {
      if (!l.steps?.length) p.push(`${l.mode} leg of ${l.distanceMeters} m has no turn-by-turn steps`);
      else {
        const sum = l.steps.reduce((a, x) => a + (x.distanceMeters || 0), 0);
        if (Math.abs(sum - l.distanceMeters) > Math.max(60, l.distanceMeters * 0.25)) p.push(`${l.mode} steps add up to ${sum} m but the leg is ${l.distanceMeters} m`);
        if (l.steps.some(x => !x.instruction)) p.push('a step has no instruction');
      }
    }
    if (l.realtime && !l.start.estimated) p.push('leg marked realtime without an estimate');
    if (l.mode === 'CAR' && l.durationSeconds > 20 * 60 + 60) p.push(`drive of ${Math.round(l.durationSeconds / 60)} min exceeds the 20-minute cap`);
  }
  if (Math.abs(prevEnd - end) > 60_000) p.push('last leg does not end at the itinerary end');
  return p;
}

async function plan(name, fromQ, toQ, { time = '08:15', access = 'walk', expect = {} } = {}) {
  const a = await search(fromQ), b = await search(toQ);
  const p = [];
  if (!a || !b) { record(name, 'schedule', ['search did not resolve both places'], `${fromQ}: ${a?.name || 'none'}; ${toQ}: ${b?.name || 'none'}`); return null; }
  const qs = new URLSearchParams({ fromLat: a.lat, fromLon: a.lon, fromName: a.name, toLat: b.lat, toLon: b.lon, toName: b.name, time: at(time), access, limit: '3' });
  const { status, body } = await get(`/api/v2/plan?${qs}`);
  const its = body.itineraries || [];
  if (status !== 200 || !its.length) { record(name, 'schedule', [`no itinerary (HTTP ${status} ${body.errors?.map(e => e.code).join(',') || body.code || ''})`], null); return null; }
  for (const it of its) p.push(...checkItinerary(it).map(x => `${it.id}: ${x}`));
  const best = its[0];
  if (expect.agency && !its.some(i => i.agencies.some(g => expect.agency.includes(g)))) p.push(`expected ${expect.agency.join(' or ')}`);
  if (expect.access && !its.some(i => i.access === expect.access)) p.push(`no ${expect.access} itinerary`);
  if (expect.transfer && !its.some(i => i.transfers >= 1 && i.legs[0].mode === 'WALK' && i.legs.at(-1).mode === 'WALK')) p.push('no walk-board-transfer-walk itinerary');
  const chosen = expect.access ? its.find(i => i.access === expect.access) || best : expect.transfer ? its.find(i => i.transfers >= 1) || best : best;
  const firstWalk = chosen.legs.find(l => !l.transit && l.steps?.length);
  const detail = `${a.name} → ${b.name}; leave at ${chosen.start.slice(11, 16)}; ${fmt(chosen)}` +
    (firstWalk ? `\n    first directions: ${firstWalk.steps.slice(0, 3).map(s => `${s.instruction} (${s.distanceMeters} m)`).join('; ')}` : '') +
    (body.routing?.notes ? `\n    notes: ${body.routing.notes.join(' ')}` : '');
  record(name, 'schedule', p, detail);
  return chosen;
}

console.log(`Rove launch scenarios against ${base}, weekday ${DAY}\n`);

// 1-4: required door-to-door trips.
await plan('Sunnyvale residential address → SFO (walk to transit)', '1105 Lily Avenue Sunnyvale', 'SFO', { time: '08:00', expect: { agency: ['caltrain', 'bart', 'vta'] } });
await plan('Sunnyvale residential address → SFO (park and ride)', '1105 Lily Avenue Sunnyvale', 'SFO', { time: '08:00', access: 'park-and-ride', expect: { access: 'park-and-ride' } });
await plan('Sunnyvale residential address → SFO (drop-off)', '1105 Lily Avenue Sunnyvale', 'SFO', { time: '08:00', access: 'drop-off', expect: { access: 'drop-off' } });
await plan('South San Jose → San Francisco (park and ride, long trip: drive cap applies)', 'Santa Teresa Station', 'Salesforce Tower', { time: '07:30', access: 'park-and-ride', expect: { access: 'park-and-ride' } });
await plan('UC Berkeley → Ferry Building', 'University of California, Berkeley', 'Ferry Building', { time: '09:00', expect: { agency: ['bart', 'act', 'muni'] } });
await plan('Stanford → San Jose Diridon', 'Stanford University', 'San Jose Diridon', { time: '10:00', expect: { agency: ['caltrain', 'vta'] } });
await plan('Oakland → Palo Alto', 'Oakland City Hall', 'Palo Alto City Hall', { time: '07:45', expect: { agency: ['caltrain'] } });

// 5: walk → board → transfer → final walk, with turn-by-turn walking on both ends.
await plan('Walk, board, transfer, walk (Haight St → Chase Center)', 'Haight and Ashbury', 'Chase Center', { time: '17:30', expect: { transfer: true } });

// 6: unavailable routes and outages must fail honestly, never with an invented trip.
{
  const la = await get(`/api/v2/plan?fromLat=37.7849&fromLon=-122.4073&toLat=34.0522&toLon=-118.2437`);
  record('Outside the Bay Area is refused', 'schedule', la.status === 400 && la.body.field === 'toLat' ? [] : [`expected 400 on toLat, got ${la.status}`], la.body.error);
  const far = await get(`/api/v2/plan?fromLat=37.7849&fromLon=-122.4073&toLat=37.7974&toLon=-122.2651&time=${encodeURIComponent('2027-09-01T08:00:00-07:00')}`);
  record('A date beyond the published schedules is refused', 'schedule', far.status === 400 ? [] : [`expected 400, got ${far.status}`], far.body.error);
  const night = await get(`/api/v2/plan?fromLat=37.4282&fromLon=-121.9066&toLat=37.5485&toLon=-121.9886&time=${encodeURIComponent(at('02:30'))}&limit=2`);
  const its = night.body.itineraries || [];
  const p = [];
  if (night.status !== 200) p.push(`HTTP ${night.status}`);
  if (its.some(i => i.legs.some(l => l.transit && Date.parse(l.start.scheduled) < Date.parse(at('04:00'))))) p.push('a transit leg departs during the overnight gap');
  record('Overnight with no service (Milpitas → Fremont, 2:30 am)', 'schedule', p, its.length ? `first option: ${fmt(its[0])}` : `no itinerary: ${night.body.errors?.map(e => e.message).join(' ')}`);
}

// 7: live arrivals, only where the live feed passes the quality gate.
{
  const status = (await get('/api/v2/status')).body;
  const probes = { bart: 'POWL', muni: '15688', act: '55777', caltrain: 'san_francisco', vta: 'PS_DRDN' };
  for (const agency of status.agencies || []) {
    const stop = probes[agency.id];
    const r = await get(`/api/v2/arrivals?agency=${agency.id}&stop=${encodeURIComponent(stop)}`);
    const b = r.body;
    const p = [];
    if (r.status !== 200) p.push(`HTTP ${r.status}`);
    if (agency.arrivals === 'verified' && b.status === 'unverified') p.push('status says verified but arrivals are withheld');
    if (agency.arrivals !== 'verified' && b.arrivals?.length) p.push('arrivals shown for an unverified agency');
    const detail = b.status === 'live'
      ? `${b.stop?.name || stop}: ${b.arrivals.slice(0, 4).map(x => `${x.routeName || 'BART'} ${x.headsign || ''} in ${Math.round((x.time - Date.now() / 1000) / 60)} min`).join('; ')}`
      : `${b.stop?.name || stop}: ${b.status}${b.reasons?.length ? ` (${b.reasons.join('; ')})` : ''}`;
    // With no live feed reachable there is nothing to verify; count it as skipped, not passed.
    const noFeed = b.status === 'unverified' && (b.reasons || []).some(x => /no trip updates|not configured|could not be reached|minutes old|no data for this agency/.test(x));
    record(`Live arrivals: ${agency.name}`, 'live', p, detail, noFeed);
  }
}

const counts = results.reduce((a, r) => ((a[r.kind] ||= { pass: 0, fail: 0, skipped: 0 })[r.skipped && !r.problems.length ? 'skipped' : r.ok ? 'pass' : 'fail']++, a), {});
fs.mkdirSync(path.join(root, 'data/reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/reports/scenarios-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), base, day: DAY, counts, results }, null, 2) + '\n');
console.log(`\n${JSON.stringify(counts)}`);
if (failures) { console.error(`${failures} scenario checks failed`); process.exit(1); }
console.log('All scenario checks passed');
