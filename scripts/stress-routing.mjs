#!/usr/bin/env node
// Routing stress suite for the schedule-only planner behind /api/v2/plan.
//
//   node scripts/stress-routing.mjs --geocode    geocode missing places with Photon (OSM), <1 req/s,
//                                                cached in scripts/stress-geocodes.json
//   node scripts/stress-routing.mjs              run every pair at 5 weekday times (offline), write
//                                                docs/ROUTING_STRESS.md
//   options: --walking N        also send N sampled requests through planWithWalking (public Valhalla)
//            --json FILE        write raw per-request results
//            --summary FILE     write the summary JSON (for --compare on a later run)
//            --compare FILE     include a before/after table against an earlier --summary
//            --explain FILE     JSON {"from>to@band": "explanation"} added to the worst-case list
//            --extra FILE       Markdown appended to the report (investigation notes)
//            --report FILE      report path (default docs/ROUTING_STRESS.md), "-" to skip
//
// Nothing here invents data: coordinates come from OpenStreetMap via Photon, every trip from the
// bundled GTFS timetables. The one-seat baseline below is an independent, deliberately naive scan
// (one vehicle, stops within 800 m of each end) used to catch missed direct rides.
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {planExperimental, planWithWalking, loadFor, dateContext, straightLineMeters} from '../api/v2/experimental-plan.mjs';

// Real Bay Area places. Each place: key -> [Photon query, city hint used to pick the right result].
// Coordinates are NOT written here: they come from Photon (OpenStreetMap) once and are cached in
// scripts/stress-geocodes.json, so runs are deterministic and offline afterwards.
export const PLACES = {
  // San Francisco
  sf_ferry: ['San Francisco Ferry Building', 'San Francisco'],
  sf_union_sq: ['Union Square, San Francisco', 'San Francisco'],
  sf_powell_st: ['Powell Street BART Station, San Francisco', 'San Francisco'],
  sf_mission24: ['2400 Mission Street, San Francisco', 'San Francisco'],
  sf_castro: ['Castro Theatre, San Francisco', 'San Francisco'],
  sf_haight: ['1500 Haight Street, San Francisco', 'San Francisco'],
  sf_sunset: ['2000 Irving Street, San Francisco', 'San Francisco'],
  sf_cliff_house: ['1090 Point Lobos Avenue, San Francisco', 'San Francisco'],
  sf_richmond: ['5000 Geary Boulevard, San Francisco', 'San Francisco'],
  sf_marina: ['Palace of Fine Arts, San Francisco', 'San Francisco'],
  sf_wash_sq: ['Washington Square, San Francisco', 'San Francisco'],
  sf_chinatown: ['Dragon Gate, Grant Avenue, San Francisco', 'San Francisco'],
  sf_moscone: ['Moscone Center, San Francisco', 'San Francisco'],
  sf_4th_king: ['San Francisco 4th and King Street station', 'San Francisco'],
  sf_chase: ['Chase Center, San Francisco', 'San Francisco'],
  sf_ucsf_mb: ['1675 Owens Street, San Francisco', 'San Francisco'],
  sf_bayview: ['4705 3rd Street, San Francisco', 'San Francisco'],
  sf_hunters_pt: ['Hunters Point Shipyard, San Francisco', 'San Francisco'],
  sf_excelsior: ['4500 Mission Street 94112', 'San Francisco'],
  sf_glen_park: ['2901 Diamond Street, San Francisco', 'San Francisco'],
  sf_twin_peaks: ['Twin Peaks Boulevard, San Francisco', 'San Francisco'],
  sf_sfsu: ['San Francisco State University', 'San Francisco'],
  sf_stonestown: ['Stonestown Galleria, San Francisco', 'San Francisco'],
  sf_presidio: ['Walt Disney Family Museum, San Francisco', 'San Francisco'],
  sf_gg_bridge: ['Golden Gate Bridge Welcome Center', 'San Francisco'],
  sf_coit: ['Coit Tower, San Francisco', 'San Francisco'],
  sf_city_hall: ['San Francisco City Hall', 'San Francisco'],
  sf_dogpatch: ['900 Minnesota Street, San Francisco', 'San Francisco'],
  sf_potrero: ['1601 18th Street, San Francisco', 'San Francisco'],
  sf_zoo: ['San Francisco Zoo', 'San Francisco'],
  sf_treasure: ['Treasure Island, San Francisco', 'San Francisco'],
  sf_cal_academy: ['California Academy of Sciences, San Francisco', 'San Francisco'],
  sf_noe: ['4000 24th Street, San Francisco', 'San Francisco'],
  sf_sunnydale: ['1654 Sunnydale Avenue, San Francisco', 'San Francisco'],
  // Oakland, Berkeley and the inner East Bay
  oak_city_hall: ['Oakland City Hall', 'Oakland'],
  oak_jack_london: ['Jack London Square, Oakland', 'Oakland'],
  oak_museum: ['Oakland Museum of California', 'Oakland'],
  oak_fruitvale: ['Fruitvale Village, Oakland', 'Oakland'],
  oak_temescal: ['4900 Telegraph Avenue, Oakland', 'Oakland'],
  oak_rockridge: ['5500 College Avenue, Oakland', 'Oakland'],
  oak_montclair: ['6200 La Salle Avenue, Oakland', 'Oakland'],
  oak_eastmont: ['7200 Bancroft Avenue, Oakland', 'Oakland'],
  oak_coliseum: ['Oakland Arena', 'Oakland'],
  oak_airport: ['Oakland International Airport station', 'Oakland'],
  oak_mills: ['Mills College, Oakland', 'Oakland'],
  oak_chabot: ['Chabot Space and Science Center', 'Oakland'],
  oak_west: ['West Oakland BART', 'Oakland'],
  oak_kaiser: ['3600 Broadway, Oakland', 'Oakland'],
  brk_sather: ['Sather Gate, Berkeley', 'Berkeley'],
  brk_downtown: ['2160 Shattuck Avenue, Berkeley', 'Berkeley'],
  brk_4th: ['1800 4th Street, Berkeley', 'Berkeley'],
  brk_north: ['1750 Sacramento Street, Berkeley', 'Berkeley'],
  brk_lhs: ['Lawrence Hall of Science, Berkeley', 'Berkeley'],
  brk_elmwood: ['2900 College Avenue, Berkeley', 'Berkeley'],
  albany_solano: ['1200 Solano Avenue, Albany', 'Albany'],
  emv_market: ['5959 Shellmound Street, Emeryville', 'Emeryville'],
  rich_bart: ['1700 Nevin Avenue, Richmond', 'Richmond'],
  rich_hilltop: ['Hilltop Mall, Richmond', 'Richmond'],
  rich_point: ['101 Park Place, Richmond', 'Richmond'],
  elc_plaza: ['El Cerrito Plaza', 'El Cerrito'],
  ala_south_shore: ['South Shore Center, Alameda', 'Alameda'],
  ala_theatre: ['2317 Central Avenue, Alameda', 'Alameda'],
  ala_point: ['950 West Mall Square, Alameda', 'Alameda'],
  sl_bart: ['San Leandro BART', 'San Leandro'],
  sl_bayfair: ['Bayfair Center, San Leandro', 'San Leandro'],
  hay_city_hall: ['Hayward City Hall', 'Hayward'],
  hay_csueb: ['California State University East Bay, Hayward', 'Hayward'],
  hay_southland: ['Southland Mall, Hayward', 'Hayward'],
  cv_bart: ['Castro Valley BART', 'Castro Valley'],
  uc_bart: ['Union City BART', 'Union City'],
  fre_bart: ['Fremont BART station', 'Fremont'],
  fre_warm_springs: ['Warm Springs/South Fremont BART', 'Fremont'],
  fre_hub: ['Fremont Hub', 'Fremont'],
  fre_mission: ['43300 Mission Boulevard, Fremont', 'Fremont'],
  fre_ohlone: ['Ohlone College, Fremont', 'Fremont'],
  dub_bart: ['Dublin/Pleasanton BART', 'Pleasanton'],
  dub_city_hall: ['100 Civic Plaza, Dublin', 'Dublin'],
  ple_stoneridge: ['Stoneridge Shopping Center, Pleasanton', 'Pleasanton'],
  wc_bart: ['Walnut Creek BART', 'Walnut Creek'],
  wc_broadway: ['Broadway Plaza, Walnut Creek', 'Walnut Creek'],
  laf_bart: ['Lafayette BART', 'Lafayette'],
  ph_bart: ['Pleasant Hill/Contra Costa Centre BART', 'Walnut Creek'],
  con_bart: ['Concord BART', 'Concord'],
  ant_bart: ['Antioch BART', 'Antioch'],
  pit_bart: ['Pittsburg/Bay Point BART', 'Pittsburg'],
  // South Bay
  mil_great_mall: ['Great Mall, Milpitas', 'Milpitas'],
  mil_transit: ['Milpitas Transit Center', 'Milpitas'],
  sj_diridon: ['San Jose Diridon Station', 'San Jose'],
  sj_city_hall: ['San Jose City Hall', 'San Jose'],
  sj_sap: ['SAP Center, San Jose', 'San Jose'],
  sj_sjsu: ['Martin Luther King Jr. Library San Jose', 'San Jose'],
  sj_santana_row: ['Santana Row, San Jose', 'San Jose'],
  sj_oakridge: ['Westfield Oakridge, San Jose', 'San Jose'],
  sj_berryessa: ['Berryessa/North San Jose BART', 'San Jose'],
  sj_airport: ['San Jose Mineta International Airport Terminal B', 'San Jose'],
  sj_eastridge: ['Eastridge Center, San Jose', 'San Jose'],
  sj_evergreen: ['Evergreen Valley College, San Jose', 'San Jose'],
  sj_almaden: ['Almaden Lake Park, San Jose', 'San Jose'],
  sj_japantown: ['Japanese American Museum of San Jose', 'San Jose'],
  sc_levis: ["Levi's Stadium, Santa Clara", 'Santa Clara'],
  sc_scu: ['Santa Clara University', 'Santa Clara'],
  sc_caltrain: ['Santa Clara Caltrain station', 'Santa Clara'],
  sc_mission_college: ['Mission College, Santa Clara', 'Santa Clara'],
  sv_caltrain: ['Sunnyvale Caltrain station', 'Sunnyvale'],
  sv_moffett: ['1100 Enterprise Way, Sunnyvale', 'Sunnyvale'],
  mv_station: ['Mountain View Transit Center', 'Mountain View'],
  mv_google: ['1600 Amphitheatre Parkway, Mountain View', 'Mountain View'],
  mv_chm: ['Computer History Museum, Mountain View', 'Mountain View'],
  mv_hospital: ['El Camino Hospital, Mountain View', 'Mountain View'],
  la_downtown: ['1 North San Antonio Road, Los Altos', 'Los Altos'],
  cup_apple: ['Apple Park Visitor Center, Cupertino', 'Cupertino'],
  // Peninsula
  pa_stanford: ['Stanford Main Quad', 'Stanford'],
  pa_caltrain: ['Palo Alto Caltrain station', 'Palo Alto'],
  pa_shopping: ['Stanford Shopping Center', 'Palo Alto'],
  pa_baylands: ['Lucy Evans Baylands Nature Interpretive Center', 'Palo Alto'],
  mp_caltrain: ['Menlo Park Caltrain station', 'Menlo Park'],
  rwc_caltrain: ['Redwood City Caltrain station', 'Redwood City'],
  sm_caltrain: ['San Mateo Caltrain station', 'San Mateo'],
  sm_hillsdale: ['Hillsdale Shopping Center, San Mateo', 'San Mateo'],
  bur_caltrain: ['Burlingame Caltrain station', 'Burlingame'],
  mil_station: ['Millbrae station', 'Millbrae'],
  sfo_intl: ['San Francisco International Airport International Terminal', 'San Francisco'],
  dc_bart: ['Daly City BART', 'Daly City'],
  dc_serramonte: ['Serramonte Center, Daly City', 'Daly City'],
  ssf_bart: ['South San Francisco BART', 'South San Francisco'],
  sb_tanforan: ['Tanforan, San Bruno', 'San Bruno'],
  // Outside the bundled agencies' coverage (SamTrans, Golden Gate, ferries are not in the data)
  hmb_main: ['Main Street, Half Moon Bay', 'Half Moon Bay'],
  sausalito: ['Sausalito Ferry Terminal', 'Sausalito'],
  pacifica: ['Linda Mar Shopping Center, Pacifica', 'Pacifica'],
};

// [from, to, category]. Categories drive the report grouping.
export const PAIRS = [
  // Across the bay
  ['sf_ferry', 'brk_sather', 'across-bay'], ['sf_castro', 'oak_jack_london', 'across-bay'],
  ['sf_sunset', 'oak_temescal', 'across-bay'], ['sf_richmond', 'emv_market', 'across-bay'],
  ['sf_mission24', 'oak_fruitvale', 'across-bay'], ['sf_4th_king', 'brk_downtown', 'across-bay'],
  ['oak_city_hall', 'sf_ucsf_mb', 'across-bay'], ['brk_4th', 'sf_moscone', 'across-bay'],
  ['ala_theatre', 'sf_ferry', 'across-bay'], ['rich_bart', 'sf_powell_st', 'across-bay'],
  ['sf_marina', 'oak_airport', 'across-bay'], ['sf_zoo', 'oak_coliseum', 'across-bay'],
  ['fre_bart', 'sf_chase', 'across-bay'], ['wc_bart', 'sf_city_hall', 'across-bay'],
  ['dub_bart', 'sf_4th_king', 'across-bay'], ['hay_city_hall', 'sf_moscone', 'across-bay'],
  ['emv_market', 'sf_4th_king', 'across-bay'], ['sf_chase', 'oak_coliseum', 'across-bay'],
  ['sf_haight', 'rich_hilltop', 'across-bay'], ['oak_montclair', 'sf_ferry', 'across-bay'],
  // Caltrain + Muni
  ['pa_caltrain', 'sf_castro', 'caltrain+muni'], ['sv_caltrain', 'sf_chase', 'caltrain+muni'],
  ['pa_stanford', 'sf_wash_sq', 'caltrain+muni'], ['mv_station', 'sf_sfsu', 'caltrain+muni'],
  ['sm_caltrain', 'sf_haight', 'caltrain+muni'], ['rwc_caltrain', 'sf_cal_academy', 'caltrain+muni'],
  ['sf_richmond', 'mp_caltrain', 'caltrain+muni'], ['sf_coit', 'mil_station', 'caltrain+muni'],
  ['mv_google', 'sf_ferry', 'caltrain+muni'], ['sf_ucsf_mb', 'mv_google', 'caltrain+muni'],
  // BART + AC Transit
  ['oak_eastmont', 'brk_sather', 'bart+act'], ['ala_point', 'sf_powell_st', 'bart+act'],
  ['hay_csueb', 'oak_city_hall', 'bart+act'], ['fre_hub', 'oak_kaiser', 'bart+act'],
  ['rich_hilltop', 'oak_jack_london', 'bart+act'], ['sl_bayfair', 'brk_elmwood', 'bart+act'],
  ['oak_mills', 'emv_market', 'bart+act'], ['albany_solano', 'oak_airport', 'bart+act'],
  ['elc_plaza', 'ala_south_shore', 'bart+act'], ['brk_lhs', 'oak_city_hall', 'bart+act'],
  // VTA + Caltrain
  ['sj_diridon', 'mv_google', 'vta+caltrain'], ['sj_city_hall', 'pa_stanford', 'vta+caltrain'],
  ['sj_airport', 'pa_caltrain', 'vta+caltrain'], ['sj_santana_row', 'mv_station', 'vta+caltrain'],
  ['sc_levis', 'sf_4th_king', 'vta+caltrain'], ['sc_scu', 'sv_moffett', 'vta+caltrain'],
  ['sj_eastridge', 'mv_chm', 'vta+caltrain'], ['cup_apple', 'sj_diridon', 'vta+caltrain'],
  ['mil_great_mall', 'pa_caltrain', 'vta+caltrain'], ['sj_oakridge', 'sc_caltrain', 'vta+caltrain'],
  // Within the South Bay
  ['sj_sjsu', 'sj_sap', 'south-bay'], ['sj_berryessa', 'sj_japantown', 'south-bay'],
  ['mil_transit', 'sj_city_hall', 'south-bay'], ['sc_mission_college', 'sj_airport', 'south-bay'],
  ['la_downtown', 'sv_caltrain', 'south-bay'], ['sj_almaden', 'sj_diridon', 'south-bay'],
  ['sj_evergreen', 'sj_city_hall', 'south-bay'], ['mv_station', 'mv_hospital', 'south-bay'],
  // South Bay <-> East Bay (BART Silicon Valley)
  ['sj_diridon', 'oak_city_hall', 'south-east'], ['sj_sjsu', 'fre_bart', 'south-east'],
  ['mil_great_mall', 'hay_city_hall', 'south-east'], ['sj_berryessa', 'brk_sather', 'south-east'],
  ['oak_jack_london', 'sj_sap', 'south-east'], ['wc_bart', 'sj_berryessa', 'south-east'],
  // Peninsula / SFO / Daly City
  ['sfo_intl', 'sf_powell_st', 'peninsula'], ['sfo_intl', 'oak_city_hall', 'peninsula'],
  ['mil_station', 'brk_sather', 'peninsula'], ['dc_bart', 'sf_ferry', 'peninsula'],
  ['dc_serramonte', 'sf_powell_st', 'peninsula'], ['ssf_bart', 'sf_mission24', 'peninsula'],
  ['sb_tanforan', 'sf_glen_park', 'peninsula'], ['bur_caltrain', 'sm_hillsdale', 'peninsula'],
  ['mp_caltrain', 'rwc_caltrain', 'peninsula'], ['sm_caltrain', 'sfo_intl', 'peninsula'],
  ['oak_airport', 'sfo_intl', 'peninsula'], ['pa_shopping', 'pa_baylands', 'peninsula'],
  // Very long
  ['sj_diridon', 'rich_bart', 'long'], ['ant_bart', 'pa_caltrain', 'long'],
  ['dub_bart', 'mv_station', 'long'], ['con_bart', 'sfo_intl', 'long'],
  ['sv_caltrain', 'wc_bart', 'long'], ['sj_eastridge', 'brk_sather', 'long'],
  ['la_downtown', 'oak_jack_london', 'long'], ['pit_bart', 'sj_diridon', 'long'],
  ['sf_cliff_house', 'fre_bart', 'long'], ['cup_apple', 'sf_ferry', 'long'],
  ['sf_ferry', 'sj_city_hall', 'long'], ['brk_sather', 'pa_stanford', 'long'],
  // Very short (walking distance or one or two stops)
  ['sf_ferry', 'sf_chinatown', 'short'], ['sf_powell_st', 'sf_city_hall', 'short'],
  ['oak_city_hall', 'oak_jack_london', 'short'], ['brk_sather', 'brk_downtown', 'short'],
  ['sj_diridon', 'sj_sap', 'short'], ['sf_4th_king', 'sf_chase', 'short'],
  ['sf_castro', 'sf_noe', 'short'], ['pa_caltrain', 'pa_stanford', 'short'],
  ['sf_union_sq', 'sf_powell_st', 'short'], ['sf_mission24', 'sf_glen_park', 'short'],
  // Within San Francisco
  ['sf_cliff_house', 'sf_ferry', 'sf'], ['sf_zoo', 'sf_marina', 'sf'],
  ['sf_bayview', 'sf_wash_sq', 'sf'], ['sf_excelsior', 'sf_ucsf_mb', 'sf'],
  ['sf_presidio', 'sf_mission24', 'sf'], ['sf_sunnydale', 'sf_cal_academy', 'sf'],
  ['sf_stonestown', 'sf_chinatown', 'sf'], ['sf_dogpatch', 'sf_richmond', 'sf'],
  ['sf_potrero', 'sf_haight', 'sf'], ['sf_sfsu', 'sf_coit', 'sf'],
  // Hills and edges of service
  ['sf_twin_peaks', 'sf_powell_st', 'hills'], ['oak_chabot', 'oak_rockridge', 'hills'],
  ['brk_lhs', 'brk_4th', 'hills'], ['hay_csueb', 'hay_southland', 'hills'],
  ['sf_hunters_pt', 'sf_city_hall', 'edge'], ['sf_treasure', 'sf_4th_king', 'edge'],
  ['sf_gg_bridge', 'sf_castro', 'edge'], ['dub_city_hall', 'ple_stoneridge', 'edge'],
  ['rich_point', 'elc_plaza', 'edge'],
  // Within the East Bay
  ['oak_rockridge', 'oak_fruitvale', 'east-bay'], ['brk_north', 'oak_west', 'east-bay'],
  ['emv_market', 'oak_museum', 'east-bay'], ['ala_south_shore', 'oak_coliseum', 'east-bay'],
  ['hay_southland', 'cv_bart', 'east-bay'], ['uc_bart', 'fre_ohlone', 'east-bay'],
  ['fre_mission', 'fre_warm_springs', 'east-bay'], ['sl_bart', 'hay_csueb', 'east-bay'],
  ['laf_bart', 'wc_broadway', 'east-bay'], ['ph_bart', 'con_bart', 'east-bay'],
  ['ple_stoneridge', 'dub_bart', 'east-bay'],
  // Outside the bundled data's coverage: must fail honestly, never invent a route
  ['hmb_main', 'sf_ferry', 'no-coverage'], ['sf_ferry', 'sausalito', 'no-coverage'],
  ['pacifica', 'dc_bart', 'no-coverage'],
];

export const GEOCODE_FILE = fileURLToPath(new URL('./stress-geocodes.json', import.meta.url));
// Weekday bands inside the bundled timetable window (2026-10-19..27). 00:30 is Wednesday night
// (Thursday 00:30), so it exercises the previous service day's 24:xx trips.
export const BANDS = [
  ['08:15', '2026-10-21T08:15:00-07:00'], ['12:30', '2026-10-21T12:30:00-07:00'],
  ['17:30', '2026-10-21T17:30:00-07:00'], ['22:30', '2026-10-21T22:30:00-07:00'],
  ['00:30', '2026-10-22T00:30:00-07:00'],
];
const DAYTIME = new Set(['08:15', '12:30', '17:30']);
const BBOX = {minLat: 36.9, maxLat: 38.2, minLon: -122.75, maxLon: -121.4};
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function loadGeocodes(file = GEOCODE_FILE) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

async function geocodeAll() {
  const cache = loadGeocodes();
  for (const [key, [query, hint]] of Object.entries(PLACES)) {
    if (cache[key]?.query === query) continue;
    const url = 'https://photon.komoot.io/api/?' + new URLSearchParams({q: query, lat: '37.77', lon: '-122.27', limit: '5'});
    const res = await fetch(url, {headers: {'User-Agent': 'Rove-routing-stress/1.0 (transit accessibility QA)'}});
    if (!res.ok) throw new Error(`Photon ${res.status} for ${query}`);
    const features = (await res.json()).features || [];
    const inBox = features.filter(f => {
      const [lon, lat] = f.geometry.coordinates;
      return lat >= BBOX.minLat && lat <= BBOX.maxLat && lon >= BBOX.minLon && lon <= BBOX.maxLon;
    });
    const h = hint.toLowerCase();
    const has = (f, fields) => fields.some(k => String(f.properties[k] || '').toLowerCase().includes(h));
    const pick = inBox.find(f => has(f, ['city', 'locality', 'district'])) ||
      inBox.find(f => has(f, ['county', 'name'])) || inBox[0];
    if (!pick) { console.warn('NO RESULT', key, query); await sleep(1100); continue; }
    const p = pick.properties, [lon, lat] = pick.geometry.coordinates;
    cache[key] = {query, lat: +lat.toFixed(6), lon: +lon.toFixed(6), name: p.name || null,
      address: [p.housenumber, p.street].filter(Boolean).join(' ') || null, city: p.city || p.locality || null,
      osm: `${p.osm_type}${p.osm_id}`, source: 'photon.komoot.io (OpenStreetMap)'};
    console.log(key.padEnd(18), lat.toFixed(5), lon.toFixed(5), p.name || '', '|', p.city || '');
    writeFileSync(GEOCODE_FILE, JSON.stringify(cache, null, 1) + '\n');
    await sleep(1100);
  }
}

// ---- Independent naive baseline: earliest single-vehicle ride (no transfers). ----
const timetables = new Map();
function timetableFor(iso) {
  const instant = new Date(iso);
  const ctx = dateContext(instant);
  const key = ctx.previousDay + '|' + ctx.day;
  if (!timetables.has(key)) {
    timetables.clear();
    const {context, timetable} = loadFor(instant);
    timetables.set(key, {timetable, context});
  }
  return timetables.get(key);
}
function lowerBound(connections, t) {
  let lo = 0, hi = connections.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (connections[m][2] < t) lo = m + 1; else hi = m; }
  return lo;
}
export function oneSeatBaseline(timetable, from, to, requestSeconds, maxWalk = 800) {
  const near = point => {
    const m = new Map();
    timetable.stops.forEach((s, i) => {
      if (!s[2] || !s[3]) return;
      const d = straightLineMeters(point, {lat: s[2], lon: s[3]});
      if (d <= maxWalk) m.set(i, Math.ceil(d / 1.2));
    });
    return m;
  };
  const access = near(from), egress = near(to);
  if (!access.size || !egress.size) return null;
  const boarded = new Map();
  let best = null;
  const {connections, trips} = timetable;
  for (let ci = lowerBound(connections, requestSeconds); ci < connections.length; ci++) {
    const [a, b, dep, arr, trip, flags] = connections[ci];
    if (dep > requestSeconds + 4 * 3600 || (best && dep >= best.doorArrival)) break;
    if (!boarded.has(trip) && (flags & 1) && access.has(a) && dep >= requestSeconds + access.get(a) + 60)
      boarded.set(trip, {stop: a, dep});
    const on = boarded.get(trip);
    if (on && (flags & 2) && egress.has(b) && b !== on.stop) {
      const door = arr + egress.get(b);
      if (!best || door < best.doorArrival)
        best = {doorArrival: door, agency: trips[trip][0], route: trips[trip][3], boardSeconds: on.dep,
          walkMeters: Math.round((access.get(on.stop) + egress.get(b)) * 1.2)};
    }
  }
  return best;
}

// ---- Per-itinerary measurements and invariants ----
const ms = s => Date.parse(s);
export function measureItinerary(it, requestMs, from, to) {
  const transit = it.legs.filter(l => l.transit), walks = it.legs.filter(l => !l.transit);
  const violations = [];
  let prevEnd = -Infinity;
  for (const [i, l] of it.legs.entries()) {
    const s = ms(l.start.scheduled), e = ms(l.end.scheduled);
    if (!(e >= s)) violations.push(`leg ${i} ends before it starts`);
    if (s < prevEnd - 1000) violations.push(`leg ${i} starts before the previous leg ends`);
    prevEnd = e;
  }
  if (ms(it.start) < requestMs - 1000) violations.push('leaves before the requested time');
  if (!transit.length) violations.push('no transit leg');
  // Transfer buffers: >= 120 s plus any walking between the two vehicles.
  const transferWaits = [];
  for (let i = 0, last = null, walkBetween = 0; i < it.legs.length; i++) {
    const l = it.legs[i];
    if (!l.transit) { if (last) walkBetween += l.durationSeconds; continue; }
    if (last) {
      const gap = (ms(l.start.scheduled) - ms(last.end.scheduled)) / 1000;
      if (gap < 120 + walkBetween - 1) violations.push(`transfer at ${l.from.name} has ${Math.round(gap)} s for ${walkBetween} s of walking`);
      transferWaits.push(gap - walkBetween);
    }
    last = l; walkBetween = 0;
  }
  // No stop visited twice (alighting and then boarding at the same stop is one visit).
  const visited = [];
  for (const l of transit) {
    if (visited.at(-1) !== l.from.stop?.id) visited.push(l.from.stop?.id);
    visited.push(l.to.stop?.id);
  }
  if (new Set(visited).size !== visited.length) violations.push('a stop is visited twice');
  const accessMeters = transit.length ? straightLineMeters(from, transit[0].from) : 0;
  const egressMeters = transit.length ? straightLineMeters(transit.at(-1).to, to) : 0;
  if (accessMeters > 2000 || egressMeters > 2000) violations.push('boards or alights more than 2 km from the requested point');
  const firstWalk = it.legs[0].transit ? null : it.legs[0], lastWalk = it.legs.at(-1).transit ? null : it.legs.at(-1);
  if (firstWalk && straightLineMeters(firstWalk.from, from) > 5) violations.push('first walk does not start at the origin');
  if (lastWalk && straightLineMeters(lastWalk.to, to) > 5) violations.push('last walk does not end at the destination');
  const rideMeters = transit.reduce((s, l) => s + straightLineMeters(l.from, l.to), 0);
  return {
    durationSeconds: it.durationSeconds, travelSeconds: Math.round((ms(it.end) - requestMs) / 1000),
    start: it.start, end: it.end, transfers: it.transfers, walkMeters: it.walkMeters,
    longestWalkMeters: Math.max(0, ...walks.map(l => l.distanceMeters)),
    accessMeters: Math.round(accessMeters), egressMeters: Math.round(egressMeters),
    initialWaitSeconds: it.initialWaitSeconds, longestTransferWaitSeconds: Math.round(Math.max(0, ...transferWaits)),
    agencies: [...new Set(transit.map(l => l.agency.id))], routes: transit.map(l => `${l.agency.id}:${l.route.shortName}`),
    warnings: it.warnings || [], practical: it.practical, detour: Boolean(it.detour), backtrackMeters: it.backtrackMeters || 0,
    rideCircuity: +(rideMeters / Math.max(500, straightLineMeters(from, to))).toFixed(2), violations,
  };
}

const pct = (values, p) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))];
};
// Door-to-door time against the straight-line distance at 20 km/h (a typical effective urban
// transit speed), floored at 10 minutes so very short trips do not explode the ratio.
export const durationRatio = (seconds, meters) => seconds / Math.max(600, meters / (20000 / 3600));

export function runOne(pair, band, geocodes, {planner = planExperimental, baseline = true} = {}) {
  const [fromKey, toKey, category] = pair, [bandName, iso] = band;
  const from = geocodes[fromKey], to = geocodes[toKey];
  const requestMs = ms(iso);
  const t0 = performance.now(), c0 = process.cpuUsage();
  const r = planner({fromLat: from.lat, fromLon: from.lon, toLat: to.lat, toLon: to.lon, time: iso, limit: 3}, new Date(iso));
  const elapsedMs = performance.now() - t0, cpu = process.cpuUsage(c0);
  const meters = straightLineMeters(from, to);
  const its = r.body?.itineraries || [];
  const row = {from: fromKey, to: toKey, category, band: bandName, time: iso, status: r.status, wallMs: Math.round(elapsedMs), ms: Math.round((cpu.user + cpu.system) / 1000),
    straightMeters: Math.round(meters), count: its.length, error: r.body?.errors?.[0]?.code || r.body?.error || null,
    serviceGap: r.body?.routing?.serviceGap || null, later: (r.body?.laterItineraries || []).length};
  row.itineraries = its.map(it => measureItinerary(it, requestMs, from, to));
  row.oneSeat = null;
  if (baseline) {
    const {timetable, context} = timetableFor(iso);
    const midnight = Date.parse(context.previousDay + 'T00:00:00-07:00');
    const requestSeconds = (requestMs - midnight) / 1000;
    const base = oneSeatBaseline(timetable, from, to, requestSeconds);
    row.oneSeat = base && {travelSeconds: Math.round(base.doorArrival - requestSeconds), route: `${base.agency}:${base.route}`,
      initialWaitSeconds: Math.round(base.boardSeconds - requestSeconds), walkMeters: base.walkMeters};
  }
  return classify(row);
}

// Issue codes with a severity weight, used to pick the worst cases.
export const ISSUE_WEIGHT = {INVARIANT: 100, FAIL_ONE_SEAT_EXISTS: 80, FAIL_DAYTIME: 60, NO_COVERAGE_ROUTED: 30,
  SLOWER_THAN_ONE_SEAT: 40, WALK_FASTER: 25, HIGH_RATIO: 20, MISSED_ONE_SEAT: 15, LONG_WALK: 10,
  LONG_TRANSFER_WAIT: 10, BACKTRACKS: 10, FAR_ENDPOINT: 10, SLOW_QUERY: 5, NIGHT_GAP: 0, NO_COVERAGE_OK: 0};
function classify(row) {
  const issues = [], notes = [];
  const top = row.itineraries[0];
  if (row.category === 'no-coverage') {
    if (row.count) { issues.push('NO_COVERAGE_ROUTED'); notes.push('routed although one end is outside the bundled agencies'); }
    else issues.push('NO_COVERAGE_OK');
  } else if (!row.count) {
    row.failure = row.status === 422 ? 'NO_STOPS_NEARBY' : row.serviceGap ? 'SERVICE_GAP' : row.status !== 200 ? 'HTTP_' + row.status : 'NO_CONNECTION';
    if (row.oneSeat && row.oneSeat.initialWaitSeconds <= 90 * 60) {
      issues.push('FAIL_ONE_SEAT_EXISTS');
      notes.push(`no itinerary, but ${row.oneSeat.route} gets there in ${Math.round(row.oneSeat.travelSeconds / 60)} min`);
    } else if (DAYTIME.has(row.band)) { issues.push('FAIL_DAYTIME'); notes.push(`no itinerary at ${row.band} (${row.failure})`); }
    else { issues.push('NIGHT_GAP'); notes.push(`no practical service at ${row.band} (${row.failure})`); }
  }
  for (const [i, m] of row.itineraries.entries())
    for (const v of m.violations) { issues.push('INVARIANT'); notes.push(`option ${i + 1}: ${v}`); }
  if (top) {
    row.ratio = +durationRatio(top.travelSeconds, row.straightMeters).toFixed(2);
    if (row.oneSeat) {
      const best = Math.min(...row.itineraries.map(m => m.travelSeconds));
      const hasOneSeat = row.itineraries.some(m => m.transfers === 0);
      if (top.transfers > 0 && row.oneSeat.travelSeconds < top.travelSeconds - 120) {
        issues.push('SLOWER_THAN_ONE_SEAT');
        notes.push(`top option (${top.routes.join(' > ')}) arrives ${Math.round((top.travelSeconds - row.oneSeat.travelSeconds) / 60)} min later than the direct ${row.oneSeat.route}`);
      } else if (!hasOneSeat && row.oneSeat.travelSeconds <= best + 10 * 60) {
        issues.push('MISSED_ONE_SEAT');
        notes.push(`direct ${row.oneSeat.route} (${Math.round(row.oneSeat.travelSeconds / 60)} min) not offered; best offered ${Math.round(best / 60)} min with transfers`);
      }
    }
    const walkSeconds = row.straightMeters * 1.3 / 1.2;
    if (row.straightMeters < 1600 && walkSeconds < top.travelSeconds - 60) {
      issues.push('WALK_FASTER'); notes.push(`walking (~${Math.round(walkSeconds / 60)} min at 1.3x straight line) beats the ${Math.round(top.travelSeconds / 60)} min transit option`);
    }
    if (row.ratio > 2.5 && row.straightMeters > 1600) { issues.push('HIGH_RATIO'); notes.push(`takes ${row.ratio}x the 20 km/h reference`); }
    if (top.walkMeters > 1500 || top.longestWalkMeters > 800) { issues.push('LONG_WALK'); notes.push(`walks ${top.walkMeters} m (longest ${top.longestWalkMeters} m)`); }
    if (top.longestTransferWaitSeconds >= 20 * 60) { issues.push('LONG_TRANSFER_WAIT'); notes.push(`waits ${Math.round(top.longestTransferWaitSeconds / 60)} min at a transfer`); }
    if (top.warnings.includes('BACKTRACKS')) { issues.push('BACKTRACKS'); notes.push(`rides ${top.backtrackMeters} m away from the destination`); }
    if (top.accessMeters > 1200 || top.egressMeters > 1200) { issues.push('FAR_ENDPOINT'); notes.push(`boards ${top.accessMeters} m / alights ${top.egressMeters} m from the points`); }
  }
  if (row.ms > 300) { issues.push('SLOW_QUERY'); notes.push(`${row.ms} ms CPU`); }
  row.issues = issues; row.notes = notes;
  row.score = issues.reduce((s, i) => s + (ISSUE_WEIGHT[i] || 0), 0) + (row.ratio || 0);
  return row;
}

export function summarize(rows) {
  const covered = rows.filter(r => r.category !== 'no-coverage');
  const bands = {};
  for (const [name] of BANDS) {
    const b = covered.filter(r => r.band === name), ok = b.filter(r => r.count);
    bands[name] = {requests: b.length, routed: ok.length, successRate: +(ok.length / Math.max(1, b.length)).toFixed(3),
      oneSeatAvailable: b.filter(r => r.oneSeat && r.oneSeat.initialWaitSeconds <= 5400).length,
      p50Ratio: pct(ok.map(r => r.ratio), 50), p90Ratio: pct(ok.map(r => r.ratio), 90),
      p50Minutes: pct(ok.map(r => Math.round(r.itineraries[0].travelSeconds / 60)), 50)};
  }
  const okAll = covered.filter(r => r.count);
  const failures = {};
  for (const r of covered.filter(r => !r.count)) {
    const k = `${r.failure} / ${r.issues.find(i => i.startsWith('FAIL') || i === 'NIGHT_GAP')}`;
    failures[k] = (failures[k] || 0) + 1;
  }
  const issues = {};
  for (const r of rows) for (const i of new Set(r.issues)) issues[i] = (issues[i] || 0) + 1;
  const times = rows.map(r => r.ms);
  const day = rows => rows.filter(r => DAYTIME.has(r.band));
  return {requests: rows.length, covered: covered.length, routed: okAll.length,
    successRate: +(okAll.length / covered.length).toFixed(3),
    daytimeSuccessRate: +(day(okAll).length / day(covered).length).toFixed(3),
    p50Ratio: pct(okAll.map(r => r.ratio), 50), p90Ratio: pct(okAll.map(r => r.ratio), 90),
    meanTransfers: +(okAll.reduce((s, r) => s + r.itineraries[0].transfers, 0) / Math.max(1, okAll.length)).toFixed(2),
    p90WalkMeters: pct(okAll.map(r => r.itineraries[0].walkMeters), 90),
    meanOptions: +(okAll.reduce((s, r) => s + r.count, 0) / Math.max(1, okAll.length)).toFixed(2),
    queryMs: {p50: pct(times, 50), p95: pct(times, 95), max: Math.max(...times)},
    bands, failures, issues};
}

const fmtMin = s => s == null ? '–' : `${Math.round(s / 60)}`;
function report(rows, summary, opts) {
  const L = [];
  const compare = opts.compare;
  L.push('# Routing stress results', '');
  L.push(`Generated by \`node scripts/stress-routing.mjs\`. ${new Set(rows.map(r => r.from + '>' + r.to)).size} real origin/destination pairs (geocoded once with Photon/OpenStreetMap, cached in \`scripts/stress-geocodes.json\`) × ${BANDS.length} weekday times (Wednesday 2026-10-21 08:15, 12:30, 17:30, 22:30 and Thursday 00:30) = ${rows.length} requests to \`planExperimental\`. All trips come from the bundled GTFS timetables, which contain BART, Muni, Caltrain, VTA and AC Transit only.`, '');
  L.push('Definitions:', '');
  L.push('- **Success**: at least one practical itinerary. The 3 "no-coverage" pairs (Half Moon Bay, Sausalito, Pacifica: SamTrans, Golden Gate Transit and the ferries are not in the data) are excluded from success rates and must return no route.');
  L.push('- **Duration ratio**: door-to-door time from the requested departure to arrival, divided by the straight-line distance at 20 km/h (floor 10 min). Lower is better.');
  L.push('- **One-seat baseline**: an independent, naive scan for the earliest single-vehicle ride from stops within 800 m of each end. `SLOWER_THAN_ONE_SEAT`: the top option has transfers and arrives more than 2 min later than that ride. `MISSED_ONE_SEAT`: no option is one-seat although the direct ride arrives within 10 min of the best option.');
  L.push('- `WALK_FASTER`: under 1.6 km apart and walking 1.3× the straight line at 1.2 m/s beats the top option. Walk distances are straight-line estimates, as the planner reports them.', '');
  if (compare) {
    L.push('## Before / after', '');
    L.push('| Metric | Before | After |', '|---|---|---|');
    const row = (label, a, b) => L.push(`| ${label} | ${a ?? '–'} | ${b ?? '–'} |`);
    row('Success rate (all bands)', compare.successRate, summary.successRate);
    row('Success rate (daytime bands)', compare.daytimeSuccessRate, summary.daytimeSuccessRate);
    for (const [name] of BANDS) row(`Success ${name}`, compare.bands[name]?.successRate, summary.bands[name].successRate);
    row('p50 / p90 duration ratio', `${compare.p50Ratio} / ${compare.p90Ratio}`, `${summary.p50Ratio} / ${summary.p90Ratio}`);
    row('Mean transfers (top option)', compare.meanTransfers, summary.meanTransfers);
    row('p90 walk m (top option)', compare.p90WalkMeters, summary.p90WalkMeters);
    row('Mean options returned', compare.meanOptions, summary.meanOptions);
    row('Query ms p50 / p95 / max', `${compare.queryMs.p50} / ${compare.queryMs.p95} / ${compare.queryMs.max}`, `${summary.queryMs.p50} / ${summary.queryMs.p95} / ${summary.queryMs.max}`);
    const codes = [...new Set([...Object.keys(compare.issues), ...Object.keys(summary.issues)])].sort();
    for (const c of codes) row(`Requests with ${c}`, compare.issues[c] || 0, summary.issues[c] || 0);
    L.push('');
  }
  L.push('## Summary', '');
  L.push(`- Requests: ${summary.requests} (${summary.covered} inside coverage). Success rate ${(summary.successRate * 100).toFixed(1)}% overall, ${(summary.daytimeSuccessRate * 100).toFixed(1)}% in the daytime bands.`);
  L.push(`- Duration ratio p50 ${summary.p50Ratio}, p90 ${summary.p90Ratio}. Mean transfers ${summary.meanTransfers}. p90 walking ${summary.p90WalkMeters} m. Mean options ${summary.meanOptions}.`);
  L.push(`- Query CPU time p50 ${summary.queryMs.p50} ms, p95 ${summary.queryMs.p95} ms, max ${summary.queryMs.max} ms (warm: each service day is loaded before measuring; CPU time is reported because wall time on a shared, heavily loaded machine is not meaningful).`, '');
  L.push('| Band | Requests | Routed | Success | One-seat ride exists | p50 ratio | p90 ratio | p50 minutes |', '|---|---|---|---|---|---|---|---|');
  for (const [name, b] of Object.entries(summary.bands))
    L.push(`| ${name} | ${b.requests} | ${b.routed} | ${(b.successRate * 100).toFixed(1)}% | ${b.oneSeatAvailable} | ${b.p50Ratio ?? '–'} | ${b.p90Ratio ?? '–'} | ${b.p50Minutes ?? '–'} |`);
  L.push('', '### Failures by cause', '');
  if (!Object.keys(summary.failures).length) L.push('None.');
  else { L.push('| Cause | Requests |', '|---|---|'); for (const [k, v] of Object.entries(summary.failures).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${v} |`); }
  L.push('', '`NIGHT_GAP`: no practical trip within 90 minutes at 22:30 or 00:30 and no one-seat ride either. The planner then lists the first real later trip separately (`laterItineraries`) when the loaded timetable has one.', '');
  L.push('### Issue counts (requests)', '', '| Issue | Requests |', '|---|---|');
  for (const [k, v] of Object.entries(summary.issues).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${v} |`);
  const cats = [...new Set(rows.map(r => r.category))];
  L.push('', '### By category', '', '| Category | Requests | Routed | p50 ratio | Mean transfers |', '|---|---|---|---|---|');
  for (const c of cats) {
    const rs = rows.filter(r => r.category === c), ok = rs.filter(r => r.count);
    L.push(`| ${c} | ${rs.length} | ${ok.length} | ${pct(ok.map(r => r.ratio), 50) ?? '–'} | ${ok.length ? (ok.reduce((s, r) => s + r.itineraries[0].transfers, 0) / ok.length).toFixed(2) : '–'} |`);
  }
  L.push('', '## Worst 20 cases', '');
  const worst = rows.filter(r => r.score >= 5).sort((a, b) => b.score - a.score).slice(0, 20);
  if (!worst.length) L.push('No case scored as a problem.');
  for (const [i, r] of worst.entries()) {
    const t = r.itineraries[0];
    L.push(`${i + 1}. **${r.from} → ${r.to}** at ${r.band} (${r.category}, ${(r.straightMeters / 1000).toFixed(1)} km): ${r.issues.filter(x => ISSUE_WEIGHT[x]).join(', ') || 'high ratio'}.`);
    L.push(`   ${t ? `Top: ${t.routes.join(' > ')}, ${fmtMin(t.travelSeconds)} min door to door (initial wait ${fmtMin(t.initialWaitSeconds)} min), ${t.transfers} transfers, walk ${t.walkMeters} m.` : `No itinerary (${r.failure}).`} ${r.oneSeat ? `One-seat baseline: ${r.oneSeat.route}, ${fmtMin(r.oneSeat.travelSeconds)} min.` : 'No one-seat ride within 800 m.'} ${r.notes.join('; ')}${r.notes.length ? '.' : ''}`);
    const ex = opts.explain?.[`${r.from}>${r.to}@${r.band}`] || opts.explain?.[`${r.from}>${r.to}`];
    if (ex) L.push(`   Explanation: ${ex}`);
  }
  if (opts.extra) L.push('', opts.extra.trim());
  if (opts.walking) {
    L.push('', '## planWithWalking sample', '');
    L.push(`${opts.walking.length} requests at 12:30 through \`planWithWalking\` (public Valhalla pedestrian router, best effort, 1 request per second). ${opts.walking.filter(w => w.verified).length} returned verified walking geometry on the top option; ${opts.walking.filter(w => w.count).length} had itineraries; median ${pct(opts.walking.map(w => w.ms), 50)} ms, max ${Math.max(...opts.walking.map(w => w.ms))} ms.`, '');
    L.push('| Pair | Options | Walking verified | Navigation ready | ms |', '|---|---|---|---|---|');
    for (const w of opts.walking) L.push(`| ${w.from} → ${w.to} | ${w.count} | ${w.verified ? 'yes' : 'no'} | ${w.nav ? 'yes' : 'no'} | ${w.ms} |`);
  }
  return L.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2), opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--geocode')) return geocodeAll();
  const geocodes = loadGeocodes();
  const missing = Object.keys(PLACES).filter(k => !geocodes[k]);
  if (missing.length) throw new Error('Missing geocodes (run with --geocode): ' + missing.join(', '));
  const rows = [];
  for (const band of BANDS) {
    runOne(PAIRS[0], band, geocodes); // warm-up: load this service day before measuring
    for (const pair of PAIRS) rows.push(runOne(pair, band, geocodes));
  }
  const summary = summarize(rows);
  let walking = null;
  const n = Number(opt('--walking') || 0);
  if (n > 0) {
    walking = [];
    const step = Math.max(1, Math.floor(PAIRS.length / n));
    for (let i = 0; i < PAIRS.length && walking.length < n; i += step) {
      const [f, t] = PAIRS[i], from = geocodes[f], to = geocodes[t], iso = BANDS[1][1];
      const t0 = performance.now();
      const r = await planWithWalking({fromLat: from.lat, fromLon: from.lon, toLat: to.lat, toLon: to.lon, time: iso}, new Date(iso));
      const top = r.body.itineraries?.[0];
      walking.push({from: f, to: t, count: r.body.itineraries?.length || 0, verified: Boolean(top?.walkingVerified),
        nav: Boolean(top?.navigationReady), ms: Math.round(performance.now() - t0)});
      await sleep(1000);
    }
  }
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify(rows, null, 1));
  if (opt('--summary')) writeFileSync(opt('--summary'), JSON.stringify(summary, null, 1));
  const compare = opt('--compare') ? JSON.parse(readFileSync(opt('--compare'), 'utf8')) : null;
  const explain = opt('--explain') ? JSON.parse(readFileSync(opt('--explain'), 'utf8')) : null;
  const extra = opt('--extra') ? readFileSync(opt('--extra'), 'utf8') : null;
  const out = opt('--report') || fileURLToPath(new URL('../docs/ROUTING_STRESS.md', import.meta.url));
  if (out !== '-') writeFileSync(out, report(rows, summary, {compare, walking, explain, extra}));
  const {bands, ...headline} = summary;
  console.log(JSON.stringify(headline));
  for (const [k, v] of Object.entries(bands)) console.log(k, JSON.stringify(v));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
