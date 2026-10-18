// End-to-end routing check through a running Rove server and OpenTripPlanner.
// Plans real multi-agency trips for the next weekday morning and asserts each result is a
// genuine transit itinerary (walk + transit legs, ordered times, known agencies).
// Writes data/reports/routing-verification.json (ignored by Git).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const base = process.env.ROVE_URL || 'http://localhost:4173';

const CASES = [
  { name: 'Powell St (SF) to Lake Merritt (Oakland)', from: [37.78461, -122.40734], to: [37.79740, -122.26510], expectAny: ['bart'] },
  { name: 'Ocean Beach (SF) to Mission & 24th (SF)', from: [37.77210, -122.50980], to: [37.75230, -122.41860], expectAny: ['muni', 'bart'] },
  { name: 'Downtown Berkeley to Fruitvale', from: [37.87010, -122.26800], to: [37.77480, -122.22410], expectAny: ['bart', 'act'] },
  { name: 'SF 4th & King to San Jose Diridon', from: [37.77640, -122.39440], to: [37.32970, -121.90250], expectAny: ['caltrain'] },
  { name: 'Mountain View to Downtown San Jose', from: [37.39470, -122.07610], to: [37.33540, -121.88960], expectAny: ['vta', 'caltrain'] },
  { name: 'Downtown Oakland to Palo Alto (BART + Caltrain)', from: [37.80370, -122.27150], to: [37.44310, -122.16490], expectAny: ['caltrain'], multiAgency: true },
  { name: 'Richmond to Milpitas (transfer across the bay)', from: [37.93700, -122.35300], to: [37.41020, -121.89110], expectAny: ['bart', 'vta'] },
  // Agency-specific trips where the obvious answer requires that operator.
  { name: 'Alameda (South Shore) to Downtown Oakland (AC Transit)', from: [37.75650, -122.25250], to: [37.80440, -122.27120], expectAny: ['act'], mustUse: 'act' },
  { name: 'Haight & Ashbury to Chestnut St, Marina (Muni)', from: [37.76990, -122.44680], to: [37.80020, -122.43690], expectAny: ['muni'], mustUse: 'muni' },
  { name: 'Downtown Mountain View to Tasman (VTA Orange Line)', from: [37.39470, -122.07610], to: [37.40920, -121.95170], expectAny: ['vta'], mustUse: 'vta' },
  { name: 'Arrive by 9:00 at Civic Center from Daly City', from: [37.70630, -122.46900], to: [37.77960, -122.41390], expectAny: ['bart', 'muni'], arriveBy: true }
];

function nextWeekdayMorning() {
  const d = new Date();
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })).getDay()));
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return `${ymd}T08:15:00-07:00`.replace('-07:00', offsetFor(ymd));
}
function offsetFor(ymd) {
  const probe = new Date(`${ymd}T12:00:00Z`);
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).formatToParts(probe).find(p => p.type === 'timeZoneName').value; // GMT-7
  const h = Number(tz.replace('GMT', '')) || 0;
  return `${h < 0 ? '-' : '+'}${String(Math.abs(h)).padStart(2, '0')}:00`;
}

const time = process.env.ROVE_PLAN_TIME || nextWeekdayMorning();
const results = [];
let failures = 0;
for (const c of CASES) {
  const t = c.arriveBy ? time.replace('T08:15', 'T09:00') : time;
  const qs = new URLSearchParams({ fromLat: c.from[0], fromLon: c.from[1], toLat: c.to[0], toLon: c.to[1], time: t, limit: '3', ...(c.arriveBy ? { arriveBy: 'true' } : {}) });
  const started = Date.now();
  const r = await fetch(`${base}/api/v2/plan?${qs}`, { signal: AbortSignal.timeout(60_000) });
  const body = await r.json();
  const problems = [];
  if (r.status !== 200) problems.push(`HTTP ${r.status}: ${body.error}`);
  const its = body.itineraries || [];
  if (!its.length) problems.push(`no itineraries (${(body.errors || []).map(e => e.code).join(', ') || 'no error code'})`);
  for (const it of its) {

    let prev = null;
    for (const l of it.legs) {
      const s = Date.parse(l.start.scheduled), e = Date.parse(l.end.scheduled);
      if (!(e >= s)) problems.push(`${it.id}: leg ends before it starts`);
      if (prev != null && s + 1000 < prev) problems.push(`${it.id}: legs overlap`);
      prev = e;
      if (l.transit && (!l.agency?.id || !l.route?.id || !l.trip?.id || !l.from.stop || !l.to.stop)) problems.push(`${it.id}: transit leg missing agency/route/trip/stop ids`);
      if (!l.geometry?.coordinates?.length && l.distanceMeters > 50) problems.push(`${it.id}: leg without geometry`);
    }
  }
  if (its.length && !its.some(i => i.legs.some(l => l.transit))) problems.push('no itinerary uses transit');
  for (let k = 1; k < its.length; k++) {
    const order = c.arriveBy ? Date.parse(its[k - 1].start) >= Date.parse(its[k].start) : Date.parse(its[k - 1].end) <= Date.parse(its[k].end);
    if (!order) problems.push(`itineraries are not ordered (${its[k - 1].id}, ${its[k].id})`);
  }
  const agenciesUsed = [...new Set(its.flatMap(i => i.agencies))];
  if (its.length && !c.expectAny.some(a => agenciesUsed.includes(a))) problems.push(`expected one of ${c.expectAny.join('/')}, got ${agenciesUsed.join('/') || 'none'}`);
  if (c.mustUse && its.length && !its.some(i => i.agencies.includes(c.mustUse))) problems.push(`no itinerary uses ${c.mustUse}`);
  if (c.arriveBy && its.length && its.some(i => Date.parse(i.end) > Date.parse(t))) problems.push('arrive-by itinerary arrives after the requested time');
  if (c.multiAgency && its.length && !its.some(i => i.agencies.length > 1)) problems.push('expected at least one multi-agency itinerary');
  if (problems.length) failures++;
  results.push({
    case: c.name, ms: Date.now() - started, ok: problems.length === 0, problems,
    itineraries: its.map(i => ({ start: i.start, end: i.end, minutes: Math.round(i.durationSeconds / 60), transfers: i.transfers, walkMeters: i.walkMeters, legs: i.legs.map(l => l.transit ? `${l.agency.id} ${l.route.shortName || l.route.longName} ${l.from.name} ${l.start.scheduled.slice(11, 16)} -> ${l.to.name} ${l.end.scheduled.slice(11, 16)}` : `${l.mode} ${l.distanceMeters}m`) }))
  });
  console.log(`${problems.length ? '✗' : '✓'} ${c.name} (${Date.now() - started} ms)`);
  for (const i of results.at(-1).itineraries.slice(0, 2)) console.log(`    ${i.minutes} min, ${i.transfers} transfer(s): ${i.legs.join(' | ')}`);
  for (const p of problems) console.log(`    problem: ${p}`);
}
fs.mkdirSync(path.join(root, 'data/reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'data/reports/routing-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), departureTime: time, results }, null, 2) + '\n');
if (failures) { console.error(`${failures}/${CASES.length} routing checks failed`); process.exit(1); }
console.log(`All ${CASES.length} routing checks passed for departures at ${time}`);
