/* Rove frontend.
 * Plain browser JavaScript, no build step. Sections:
 *  1. Utilities           5. Map styles and layers
 *  2. State and storage   6. Panel and bottom sheet
 *  3. Network data        7. Views
 *  4. Realtime            8. Popovers, intro, startup
 */
'use strict';

/* ======================================================================
 * 1. Utilities
 * ==================================================================== */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const nowSec = () => Date.now() / 1000;
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ESC_MAP[ch]);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const store = {
  get(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw == null ? fallback : JSON.parse(raw); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }
};

const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });
const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
const clock = date => timeFormat.format(date);

function minutesLabel(epochSeconds) {
  const minutes = Math.round((epochSeconds - nowSec()) / 60);
  if (minutes <= 0) return { value: 'Now', unit: '' };
  if (minutes < 60) return { value: String(minutes), unit: 'min' };
  return { value: clock(new Date(epochSeconds * 1000)), unit: '' };
}

function ageLabel(epochSeconds) {
  if (!epochSeconds) return 'Update time unknown';
  const seconds = Math.max(0, Math.round(nowSec() - epochSeconds));
  if (seconds < 60) return `Updated ${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes} min ago`;
  return `Updated ${plural(Math.round(minutes / 60), 'hour')} ago`;
}

function durationLabel(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function distanceMeters(a, b) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b[1] - a[1]), dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function distanceLabel(meters) {
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.round(meters * 3.281 / 10) * 10} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles).toLocaleString('en-US')} mi`;
}

/* WCAG relative luminance and contrast, used to keep badge text readable. */
function luminance(hex) {
  const n = hex.replace('#', '');
  if (n.length !== 6) return 0;
  const channel = i => { const c = parseInt(n.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
function contrast(a, b) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
function readableText(bg, preferred) {
  if (preferred && contrast(bg, preferred) >= 4.5) return preferred;
  return contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff';
}
const normalizeColor = (value, fallback = '#3d4046') => {
  const v = String(value || '').replace('#', '').trim();
  return /^[0-9a-f]{6}$/i.test(v) ? `#${v}` : fallback;
};

const ICONS = {
  chevron: '<svg class="chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5"/></svg>',
  back: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg>',
  live: '<span class="live-glyph" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M3.2 8.8a4 4 0 0 1 0-5.6M8.8 3.2a4 4 0 0 1 0 5.6"/><circle cx="6" cy="6" r="1.1" fill="currentColor" stroke="none"/></svg></span>',
  alert: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 18 17H2Z"/><path d="M10 8.5v3.5M10 14.6v.1"/></svg>',
  star: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7Z"/></svg>',
  starFilled: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7Z"/></svg>',
  swap: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 3v14M7 3 4 6M7 3l3 3M13 17V3M13 17l-3-3M13 17l3-3"/></svg>',
  check: '<svg class="mark" viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.5 3.5 7.5-8"/></svg>',
  circle: '<svg class="mark" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5"/></svg>'
};

/* ======================================================================
 * 2. State and storage
 * ==================================================================== */
const STORAGE = { saved: 'rove-saved-v2', intro: 'rove-tour-v2', agencies: 'rove-agencies-v1', mapMode: 'rove-map-mode-v1', vehicles: 'rove-vehicles-v1', busLines: 'rove-bus-lines-v1', railLines: 'rove-rail-lines-v1' };

const state = {
  network: null,
  map: null,
  mapMode: 'standard',
  mapReady: false,
  glyphFont: ['Noto Sans Regular'],
  visible: new Set(),
  showVehicles: store.get(STORAGE.vehicles, true),
  showBus: store.get(STORAGE.busLines, true),
  showRail: store.get(STORAGE.railLines, true),
  selectedKey: null,
  journey: null,
  realtime: null,
  realtimeTimer: null,
  userLocation: null,
  saved: store.get(STORAGE.saved, []),
  stack: [{ name: 'home' }],
  searchQuery: '',
  detent: 'half',
  plan: { from: null, to: null, draft: { from: '', to: '' }, access: ['CAR_PARKING', 'CAR_DROP_OFF'].includes(store.get('rove-first-mile-v1', 'WALK')) ? store.get('rove-first-mile-v1', 'WALK') : 'WALK', driveNote: false, timeMode: 'now', dateTime: '', results: null, error: null, loading: false, expanded: 0, focus: null, query: '', sort: 'fastest' },
  focusLeg: null,
  nav: null,
  wakeLock: null,
  introIndex: 0
};

/* ======================================================================
 * 3. Network data
 * ==================================================================== */
const OPERATOR_TO_AGENCY = { BA: 'bart', SF: 'muni', CT: 'caltrain', SC: 'vta', AC: 'act' };
const AGENCY_SHORT = { bart: 'BART', muni: 'Muni', caltrain: 'Caltrain', vta: 'VTA', act: 'AC Transit' };
const MODE_NAMES = { 0: 'Light rail', 1: 'Subway', 2: 'Commuter rail', 3: 'Bus', 4: 'Ferry', 5: 'Cable car', 7: 'Funicular', 11: 'Trolleybus', 12: 'Monorail' };

/* The current network.json records route_type 0 as 3 (see build-data.mjs), so these
 * known rail lines are classified explicitly until the dataset is regenerated. */
const RAIL_ROUTE_IDS = { muni: new Set(['J', 'K', 'L', 'M', 'N', 'T', 'F']), vta: new Set(['Blue', 'Green', 'Ornge']) };

/* Realtime coverage verified on October 17, 2026 (HANDOFF_TO_CLAUDE.md). The server can
 * override any entry by sending meta.coverage[agencyId] = { vehicles, arrivals }. */
const DEFAULT_COVERAGE = {
  muni: { vehicles: true, arrivals: true },
  act: { vehicles: true, arrivals: true },
  caltrain: { vehicles: true, arrivals: true },
  vta: { vehicles: true, arrivals: false },
  bart: { vehicles: false, arrivals: false }
};
const CATEGORY_RANK = { heavy: 3, light: 2, bus: 1 };
const modeName = info => (info.cat === 'light' ? 'Light rail' : MODE_NAMES[info.r.type] || 'Line');

const idx = {
  agencies: new Map(),
  routes: new Map(),       // routeKey -> { a, r, cat, badge, title }
  routeById: new Map(),    // agencyId -> Map(routeId -> route)
  stops: new Map(),        // stopKey -> { a, s }
  stopById: new Map(),     // agencyId -> Map(stopId -> stop)
  stopRoutes: new Map(),   // stopKey -> [routeKey]
  children: new Map(),     // stopKey (parent) -> [stop]
  searchable: [],
  wordFrequency: new Map(),
  correctionCache: new Map()
};
const routeKey = (agencyId, routeId) => `${agencyId}::${routeId}`;
const stopKey = (agencyId, stopId) => `${agencyId}::${stopId}`;

function routeCategory(a, r) {
  if (r.type === 1 || r.type === 2 || (a.id === 'bart' && r.type !== 3)) return 'heavy';
  if ([0, 5, 7, 12].includes(r.type) || RAIL_ROUTE_IDS[a.id]?.has(r.id)) return 'light';
  return 'bus';
}

function routeBadgeText(a, r) {
  const name = r.n || r.id;
  if (a.id === 'bart') return name.replace(/-[NS]$/, '').replace(/^Bridge([AB])$/, 'Bus $1');
  if (a.id === 'caltrain') return name.replace(/ (Weekday|Weekend)$/, '');
  if (a.id === 'vta') return name.replace(/ Line$/, '').replace(/^(Rapid|Express|School|Event-)\s?/, '') || name;
  return name;
}

const KEEP_UPPER = new Set(['BART', 'SFO', 'SF', 'UCSF', 'VA', 'CCSF', 'SJ', 'SJSU', 'AC', 'VTA', 'II', 'III', 'US', 'BBT']);
/* Agency feeds sometimes publish names in all caps ("GEARY RAPID"). Display them in title case. */
function displayName(text) {
  const value = String(text || '');
  if (!/[A-Z]{3}/.test(value) || value !== value.toUpperCase()) return value;
  return value.toLowerCase().replace(/\b([a-z][a-z']*)/g, (w, word) => {
    const upper = word.toUpperCase();
    if (KEEP_UPPER.has(upper)) return upper;
    if (['of', 'and', 'the', 'to', 'at', 'via'].includes(word)) return word;
    return word[0].toUpperCase() + word.slice(1);
  }).replace(/^./, c => c.toUpperCase());
}

function routeTitle(a, r) {
  if (a.id === 'caltrain') return `Caltrain ${r.n}`;
  if (r.long && r.long !== r.n) return displayName(r.long);
  if (r.d) return `To ${displayName(r.d)}`;
  return `${AGENCY_SHORT[a.id] || a.name} ${MODE_NAMES[r.type] || 'line'}`;
}

function buildIndexes(network) {
  for (const a of network.agencies) {
    idx.agencies.set(a.id, a);
    const routeMap = new Map(), stopMap = new Map();
    idx.routeById.set(a.id, routeMap);
    idx.stopById.set(a.id, stopMap);
    for (const s of a.stops) {
      stopMap.set(s.id, s);
      idx.stops.set(stopKey(a.id, s.id), { a, s });
    }
    for (const s of a.stops) {
      if (s.parent && stopMap.has(s.parent)) {
        const pk = stopKey(a.id, s.parent);
        if (!idx.children.has(pk)) idx.children.set(pk, []);
        idx.children.get(pk).push(s);
      }
    }
    for (const r of a.routes) {
      routeMap.set(r.id, r);
      const color = normalizeColor(r.c, a.color);
      const info = { a, r, key: routeKey(a.id, r.id), cat: routeCategory(a, r), badge: routeBadgeText(a, r), title: routeTitle(a, r), color, text: readableText(color, normalizeColor(r.text, '#ffffff')) };
      idx.routes.set(info.key, info);
      for (const sid of r.stops) {
        const sk = stopKey(a.id, sid);
        if (!idx.stopRoutes.has(sk)) idx.stopRoutes.set(sk, []);
        idx.stopRoutes.get(sk).push(info.key);
        const parent = stopMap.get(sid)?.parent;
        if (parent && stopMap.has(parent)) {
          const pk = stopKey(a.id, parent);
          if (!idx.stopRoutes.has(pk)) idx.stopRoutes.set(pk, []);
          if (!idx.stopRoutes.get(pk).includes(info.key)) idx.stopRoutes.get(pk).push(info.key);
        }
      }
    }
  }
  // Searchable stops: stations and stops without a parent, one entry per agency + name.
  const seen = new Map();
  for (const a of network.agencies) {
    const stopMap = idx.stopById.get(a.id);
    for (const s of a.stops) {
      if (s.parent && stopMap.has(s.parent)) continue;
      const nameKey = `${a.id}|${s.n.toLowerCase()}|${Math.round(s.p[1] * 300)}|${Math.round(s.p[0] * 240)}`;
      if (seen.has(nameKey)) continue;
      seen.set(nameKey, true);
      const name = normalizeSearch(s.n);
      idx.searchable.push({ a, s, name, haystack: normalizeSearch(`${s.n} ${a.name}`) });
      for (const word of new Set(name.split(' ').filter(x => x.length >= 4))) {
        idx.wordFrequency.set(word, (idx.wordFrequency.get(word) || 0) + (s.k ? 4 : 1));
      }
    }
  }
}

function routesForStop(aId, sId) {
  return (idx.stopRoutes.get(stopKey(aId, sId)) || []).map(k => idx.routes.get(k)).filter(Boolean);
}

function sortRoutes(list) {
  return [...list].sort((x, y) => (CATEGORY_RANK[y.cat] - CATEGORY_RANK[x.cat]) || x.badge.localeCompare(y.badge, 'en', { numeric: true }));
}

function stopCategory(aId, sId) {
  let best = 'bus';
  for (const info of routesForStop(aId, sId)) if (CATEGORY_RANK[info.cat] > CATEGORY_RANK[best]) best = info.cat;
  return best;
}

/* A "place" is what a rider thinks of as one stop: a station with its platforms, or
 * same-named stops of one agency within 250 m (for example both sides of a street). */
function placeFor(aId, sId) {
  const a = idx.agencies.get(aId);
  let s = idx.stopById.get(aId)?.get(sId);
  if (!a || !s) return null;
  const stopMap = idx.stopById.get(aId);
  if (s.parent && stopMap.has(s.parent)) s = stopMap.get(s.parent);
  const members = new Map([[s.id, s]]);
  for (const child of idx.children.get(stopKey(aId, s.id)) || []) members.set(child.id, child);
  if (!idx.children.has(stopKey(aId, s.id))) {
    const name = s.n.toLowerCase();
    for (const other of a.stops) {
      if (other.n.toLowerCase() === name && !members.has(other.id) && distanceMeters(s.p, other.p) < 250) {
        members.set(other.id, other);
        for (const child of idx.children.get(stopKey(aId, other.id)) || []) members.set(child.id, child);
      }
    }
  }
  const routeKeys = new Set();
  for (const m of members.values()) for (const k of idx.stopRoutes.get(stopKey(aId, m.id)) || []) routeKeys.add(k);
  return { a, s, members: [...members.values()], ids: new Set(members.keys()), routes: sortRoutes([...routeKeys].map(k => idx.routes.get(k)).filter(Boolean)) };
}

/* ======================================================================
 * 4. Realtime
 * ==================================================================== */
function splitRealtimeId(value) {
  const m = /^([A-Z]{2}):(.*)$/.exec(String(value || ''));
  return m ? { op: m[1], local: m[2] } : { op: null, local: String(value || '') };
}

/* Which live features to show for an agency. With the v2 backend this comes from the live
 * quality gate (quality[agency].arrivalsVerified). With the older /api/realtime it falls back
 * to the coverage measured on October 17, 2026, overridden by any quality the server sends. */
function coverage(agencyId) {
  const rt = state.realtime;
  if (rt?.version === 2) {
    const q = rt.quality?.[agencyId] || null;
    const feedOn = agencyId === 'bart' ? Boolean(rt.configured?.bartDirect) : Boolean(rt.configured?.feed511);
    return { vehicles: agencyId !== 'bart' && feedOn, arrivals: feedOn && Boolean(q?.arrivalsVerified), quality: q };
  }
  const base = { ...(DEFAULT_COVERAGE[agencyId] || { vehicles: false, arrivals: false }) };
  if (rt?.quality?.[agencyId]) base.arrivals = Boolean(rt.quality[agencyId].arrivalsVerified);
  return { ...base, ...(rt?.meta?.coverage?.[agencyId] || {}) };
}

/* Exact matching only. If the server ever sends agencyId and routeKey (an exact index),
 * those are used directly. Otherwise the 511 operator prefix is stripped and the route ID
 * must match a static route ID exactly. No name-based guessing. */

function resolveItem(item) {
  if (item.agencyId && idx.agencies.has(item.agencyId)) {
    return { agencyId: item.agencyId, route: item.routeKey ? idx.routes.get(item.routeKey) || null : null };
  }
  const prefixed = [item.routeId, item.tripId, item.id].map(splitRealtimeId).find(p => p.op);
  if (!prefixed) return null;
  const agencyId = OPERATOR_TO_AGENCY[prefixed.op];
  if (!agencyId) return null;
  const { local } = splitRealtimeId(item.routeId);
  const route = local ? idx.routes.get(routeKey(agencyId, local)) || null : null;
  return { agencyId, route };
}

function tripLabel(agencyId, item) {
  const { local } = splitRealtimeId(item.tripId);
  if (agencyId === 'caltrain' && /^\d{2,4}$/.test(local)) return `Train ${local}`;
  return null;
}

function liveVehicles() {
  const rt = state.realtime;
  if (!rtConfigured()) return [];
  const out = [];
  if (rt.version === 2) {
    for (const v of rt.vehicles || []) {
      if (!v.routeId || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) || (v.lat === 0 && v.lon === 0)) continue;
      if (!coverage(v.agency).vehicles) continue;
      const route = idx.routes.get(routeKey(v.agency, v.routeId));
      if (!route) continue;
      out.push({ v, agencyId: v.agency, route, label: null, headsign: v.headsign || null });
    }
    return out;
  }
  for (const v of rt.vehicles?.items || []) {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon) || (v.lat === 0 && v.lon === 0)) continue;
    const res = resolveItem(v);
    if (!res || !coverage(res.agencyId).vehicles) continue;
    const label = res.route ? null : tripLabel(res.agencyId, v);
    if (!res.route && !label) continue;
    out.push({ v, agencyId: res.agencyId, route: res.route, label, headsign: null });
  }
  return out;
}


function arrivalsForPlace(place) {
  const rt = state.realtime;
  const cov = coverage(place.a.id);
  if (!rt?.configured || !cov.arrivals || !rt.updates?.items) return null;
  const groups = new Map();
  const cutoff = nowSec() - 30;
  for (const u of rt.updates.items) {
    const res = resolveItem(u);
    if (!res || res.agencyId !== place.a.id) continue;
    const label = res.route ? null : tripLabel(res.agencyId, u);
    if (!res.route && !label) continue;
    for (const st of u.stopTimes || []) {
      const { local } = splitRealtimeId(st.stopId);
      if (!place.ids.has(local)) continue;
      const skipped = st.relationship === 1;
      if (st.relationship === 2) continue;
      const time = st.arrival || st.departure;
      if (!skipped && (!time || time < cutoff)) continue;
      const gKey = res.route ? res.route.key : `trip:${label}`;
      if (!groups.has(gKey)) groups.set(gKey, { route: res.route, label, times: [] });
      groups.get(gKey).times.push({ time: time || null, delay: st.delay, skipped });
    }
  }
  const list = [...groups.values()].map(g => {
    g.times.sort((x, y) => (x.time ?? Infinity) - (y.time ?? Infinity));
    return g;
  }).filter(g => g.times.some(t => !t.skipped));
  list.sort((x, y) => (x.times.find(t => !t.skipped)?.time ?? Infinity) - (y.times.find(t => !t.skipped)?.time ?? Infinity));
  return list;
}

function delayStatus(delay) {
  if (delay == null) return { cls: 'status-live', text: 'Live' };
  if (delay >= 60) return { cls: 'status-late', text: `${Math.round(delay / 60)} min late` };
  if (delay <= -60) return { cls: 'status-early', text: `${Math.round(-delay / 60)} min early` };
  return { cls: 'status-live', text: 'On time' };
}

/* Alerts for an agency, optionally narrowed to routes or stops. Works with both the v2 shape
 * ({agencies:[...], entities with raw ids}) and the older shape (entities with 511 prefixes). */
function activeAlerts({ agencyId, routeKeys = [], stopIds = null }) {
  const rt = state.realtime;
  const items = rt?.version === 2 ? rt.alerts || [] : rt?.alerts?.items || [];
  const now = nowSec();
  const routeIds = new Set(routeKeys.map(k => k.split('::')[1]));
  return items.filter(alert => {
    const active = !alert.activePeriods?.length || alert.activePeriods.some(p => (!p.start || p.start <= now) && (!p.end || p.end >= now));
    if (!active) return false;
    if (Array.isArray(alert.agencies) && !alert.agencies.includes(agencyId)) return false;
    const entities = alert.entities || [];
    if (!entities.length) return Array.isArray(alert.agencies);
    return entities.some(e => {
      const route = splitRealtimeId(e.routeId), stop = splitRealtimeId(e.stopId);
      const op = route.op || stop.op || splitRealtimeId(e.agencyId).op || String(e.agencyId || '').toUpperCase();
      const entityAgency = OPERATOR_TO_AGENCY[op] || (Array.isArray(alert.agencies) && alert.agencies.length === 1 ? alert.agencies[0] : null);
      if (entityAgency && entityAgency !== agencyId) return false;
      if (!entityAgency && !Array.isArray(alert.agencies)) return false;
      if (e.routeId && !routeIds.has(route.local)) return false;
      if (e.stopId && (!stopIds || !stopIds.has(stop.local))) return false;
      return true;
    });
  });
}


function realtimeAge() {
  const rt = state.realtime;
  if (rt?.version === 2) return rt.feeds?.vehicles?.headerTimestamp || rt.feeds?.updates?.headerTimestamp || rt.feeds?.bartUpdates?.headerTimestamp || null;
  return rt?.vehicles?.headerTimestamp || rt?.updates?.headerTimestamp || null;
}


async function loadRealtime() {
  if (document.hidden) return;
  try {
    let response = await fetch('/api/v2/realtime', { cache: 'no-store' });
    if (response.status === 404) {
      response = await fetch('/api/realtime', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Realtime returned ${response.status}`);
      state.realtime = { ...(await response.json()), version: 1 };
    } else {
      if (!response.ok) throw new Error(`Realtime returned ${response.status}`);
      state.realtime = { ...(await response.json()), version: 2 };
    }
  } catch (error) {
    console.warn('Realtime unavailable:', error.message);
    state.realtime = state.realtime ? { ...state.realtime, fetchFailed: true } : { configured: false, fetchFailed: true, version: 0 };
  }
  renderVehicles();
  refreshLiveViews();
}

/* ---------- Arrivals ---------- */

/* ======================================================================
 * 5. Map styles and layers
 * ==================================================================== */

const OPENFREEMAP_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
/* Standard and Dark both start from OpenFreeMap Positron and are recolored by restyleBasemap(). */
const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
/* Esri World Imagery. Review Esri's terms before any public launch. */
const SATELLITE_STYLE = {
  version: 8,
  glyphs: OPENFREEMAP_GLYPHS,
  sources: {
    imagery: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
    labels: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], attribution: 'Labels: Esri, HERE, Garmin, © OpenStreetMap contributors' }
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-saturation': -0.13, 'raster-brightness-max': 0.91, 'raster-contrast': 0.025 } },
    { id: 'reference-labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.92 } }
  ]
};
const fallbackStyle = dark => ({ version: 8, glyphs: OPENFREEMAP_GLYPHS, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#15171a' : '#f4f1ea' } }] });

/* Map palettes for Rove's three styles. `casing` outlines lines and stops so they read over any
 * basemap; satellite uses dark casings and light labels because imagery is dark and busy. */
const THEME = {
  light: { brightCasing: '#8a7d4a', surface: '#ffffff', ink: '#111214', bus: '#7b8088', faded: '#b3b7bd', stopStroke: '#111214', journeyWalk: '#2f6bff', journeyDrive: '#4b5260', halo: '#ffffff', label: '#111214', casing: '#ffffff', busCasingOpacity: 0.75 },
  dark: { brightCasing: '#16171a', surface: '#16171a', ink: '#f2f1ee', bus: '#8b9099', faded: '#43464c', stopStroke: '#f2f1ee', journeyWalk: '#6b96ff', journeyDrive: '#c3c6cc', halo: '#16171a', label: '#f2f1ee', casing: '#0f1012', busCasingOpacity: 0.7 },
  satellite: { brightCasing: '#0d0f12', surface: '#ffffff', ink: '#111214', bus: '#e6e8eb', faded: '#9aa0a8', stopStroke: '#111214', journeyWalk: '#8fb2ff', journeyDrive: '#ffffff', halo: 'rgba(8, 10, 14, 0.88)', label: '#ffffff', casing: '#0b0d10', busCasingOpacity: 0.8 }
};
const theme = () => THEME[state.mapMode === 'dark' ? 'dark' : state.mapMode === 'satellite' ? 'satellite' : 'light'];

function mixHex(a, b, t) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/* An agency's own route color, nudged only as far as needed to stay visible on the current map.
 * The color is mixed toward ink (Standard) or white (Dark, Satellite) in small steps until it
 * reaches a minimum contrast with that map's base, so near-black AC Transit lines lift on Dark and
 * pale lines deepen on Standard, while every color that already reads well is left exactly as is. */
const MAP_BASE = { standard: { bg: '#f4f1ea', toward: '#2a2d33', min: 2 }, dark: { bg: '#15171a', toward: '#f0f2f5', min: 2.4 }, satellite: { bg: '#1d211c', toward: '#ffffff', min: 2.6 } };
function mapLineColor(color, mode = state.mapMode) {
  const c = normalizeColor(color, '#6b7078');
  const base = MAP_BASE[mode] || MAP_BASE.standard;
  let out = c;
  for (let t = 0.1; t <= 0.9 && contrast(out, base.bg) < base.min; t += 0.1) out = mixHex(c, base.toward, t);
  return out;
}

/* Rove's basemap palettes, applied to the OpenFreeMap Positron layers. Land is warm off-white,
 * water a soft blue, parks a muted sage, and roads a subtle gold, so the transit lines remain
 * the most colorful things on the map. */
const BASEMAP = {
  light: {
    land: '#f4f1ea', residential: '#efebe2', park: '#dce6cd', wood: '#d4e0c6', ice: '#f8f8f5',
    water: '#bdd6e4', waterway: '#a9c8dc', building: '#e8e2d6', aeroway: '#ebe7de', runway: '#e2ddd2',
    path: '#e6dfd1', minor: '#ffffff', majorCasing: '#e9dec3', major: '#fbf6e9', majorSubtle: 'rgba(222, 205, 160, 0.4)',
    motorwayCasing: '#e4d2a6', motorway: '#f1e4c2', motorwaySubtle: 'rgba(212, 192, 146, 0.38)', rail: '#cdc6b8', railDash: '#f4f1ea',
    boundary: '#bdb5a6', label: '#2c2e33', labelSoft: '#5f636a', roadLabel: '#6f685c', waterLabel: '#4f7491', halo: 'rgba(246, 243, 236, 0.92)'
  },
  dark: {
    land: '#202b38', residential: '#25313e', park: '#243d38', wood: '#25413a', ice: '#344451',
    water: '#132e43', waterway: '#214d63', building: '#2a3745', aeroway: '#303a47', runway: '#394553',
    path: '#3a4654', minor: '#344353', majorCasing: '#273542', major: '#435161', majorSubtle: 'rgba(103, 128, 148, 0.22)',
    motorwayCasing: '#394350', motorway: '#62606a', motorwaySubtle: 'rgba(133, 133, 150, 0.26)', rail: '#465362', railDash: '#202b38',
    boundary: '#536170', label: '#edf4fb', labelSoft: '#bdcad7', roadLabel: '#b4c0cd', waterLabel: '#8cb9d3', halo: 'rgba(26, 38, 52, 0.95)'
  }
};

function restyleBasemap(style, dark) {
  const c = dark ? BASEMAP.dark : BASEMAP.light;
  const fills = {
    background: ['background-color', c.land], park: ['fill-color', c.park], water: ['fill-color', c.water],
    landcover_ice_shelf: ['fill-color', c.ice], landcover_glacier: ['fill-color', c.ice], landuse_residential: ['fill-color', c.residential],
    landcover_wood: ['fill-color', c.wood], building: ['fill-color', c.building], 'aeroway-area': ['fill-color', c.aeroway], road_area_pier: ['fill-color', c.land]
  };
  const lines = {
    waterway: c.waterway, tunnel_motorway_casing: c.majorCasing, tunnel_motorway_inner: c.major, 'aeroway-taxiway': c.runway, 'aeroway-runway-casing': c.runway,
    'aeroway-runway': c.aeroway, road_pier: c.land, highway_path: c.path, highway_minor: c.minor, highway_major_casing: c.majorCasing, highway_major_inner: c.major,
    highway_major_subtle: c.majorSubtle, highway_motorway_casing: c.motorwayCasing, highway_motorway_inner: c.motorway, highway_motorway_subtle: c.motorwaySubtle,
    highway_motorway_bridge_casing: c.motorwayCasing, highway_motorway_bridge_inner: c.motorway, railway_transit: c.rail, railway_transit_dashline: c.railDash,
    railway_service: c.rail, railway_service_dashline: c.railDash, railway: c.rail, railway_dashline: c.railDash, boundary_3: c.boundary, boundary_2: c.boundary, boundary_disputed: c.boundary
  };
  for (const layer of style.layers || []) {
    layer.paint = layer.paint || {};
    if (fills[layer.id]) {
      const [prop, color] = fills[layer.id];
      layer.paint[prop] = color;
      if (layer.id === 'building') { layer.paint['fill-outline-color'] = dark ? '#24272c' : '#ddd5c6'; layer.paint['fill-opacity'] = 0.85; }
      if (layer.id === 'landuse_residential') layer.paint['fill-opacity'] = 0.8;
    } else if (lines[layer.id]) {
      layer.paint['line-color'] = lines[layer.id];
    } else if (layer.type === 'symbol') {
      if (/housenumber/.test(layer.id)) { layer.layout = { ...(layer.layout || {}), visibility: 'none' }; continue; }
      let color = c.label;
      if (/water/.test(layer.id)) color = c.waterLabel;
      else if (/highway-name|road/.test(layer.id)) color = c.roadLabel;
      else if (/label_other|label_state|airport/.test(layer.id)) color = c.labelSoft;
      layer.paint['text-color'] = color;
      layer.paint['text-halo-color'] = c.halo;
      layer.paint['text-halo-width'] = Math.max(1.2, Number(layer.paint['text-halo-width']) || 0);
    }
  }
  return style;
}

async function fetchStyle(mode) {
  if (mode === 'satellite') return SATELLITE_STYLE;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(BASEMAP_STYLE_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Style returned ${response.status}`);
    return restyleBasemap(await response.json(), mode === 'dark');
  } catch (error) {
    console.warn('Basemap unavailable, using a plain background:', error.message);
    return fallbackStyle(mode === 'dark');
  }
}


function routeFeatures() {
  const features = [];
  for (const info of idx.routes.values()) {
    const lc = mapLineColor(info.color);
    for (const shape of info.r.shapes || []) {
      if (!shape || shape.length < 2) continue;
      features.push({ type: 'Feature', properties: { key: info.key, agency: info.a.id, cat: info.cat, color: info.color, lc, bright: luminance(lc) > 0.55 ? 1 : 0 }, geometry: { type: 'LineString', coordinates: shape } });
    }
  }
  return { type: 'FeatureCollection', features };
}

function stopFeatures() {
  const features = [];
  for (const a of state.network.agencies) {
    const stopMap = idx.stopById.get(a.id);
    for (const s of a.stops) {
      const keys = idx.stopRoutes.get(stopKey(a.id, s.id)) || [];
      if (!keys.length && !idx.children.has(stopKey(a.id, s.id))) continue;
      features.push({
        type: 'Feature',
        properties: { agency: a.id, id: s.id, name: s.n, station: s.k ? 1 : 0, child: s.parent && stopMap.has(s.parent) ? 1 : 0, cat: stopCategory(a.id, s.id), keys: `|${keys.join('|')}|` },
        geometry: { type: 'Point', coordinates: s.p }
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

/* When each part of the network appears. The regional view (zoom 8 to 10) shows rail only, so the
 * Bay Area reads at a glance; bus routes fade in from zoom 10, which is a city or neighborhood
 * view, and bus stops, labels and vehicles follow as the map gets closer. A selected line is
 * drawn at every zoom. The Bus lines switch in the layers panel says so ("Appear as you zoom in to a city"). */
const MAP_ZOOM = Object.freeze({ busRoutes: 10, busStops: 14.5, busStopLabels: 16.3, busVehicles: 11.5, lightRail: 9.5, lightStops: 13, lightLabels: 14, heavyStops: 9.5, heavyLabels: 11.5, railVehicles: 10.5 });
const BUS_OPACITY = ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busRoutes, 0, MAP_ZOOM.busRoutes + 0.6, 0.5, 12, 0.64, 14, 0.82];
// Night mode uses a quieter network overview. A selected bus line keeps its full agency color.
const NIGHT_BUS_OPACITY = ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busRoutes, 0, MAP_ZOOM.busRoutes + 0.6, 0.28, 12, 0.38, 14, 0.48];
const BUS_WIDTH = ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busRoutes, 0.8, 12, 1.4, 14, 2.2, 17, 3.6];

function addTransitLayers() {
  const map = state.map;
  if (map.getSource('transit-routes')) return;
  const style = map.getStyle();
  const firstSymbol = style.layers.find(l => l.type === 'symbol');
  const labelFont = firstSymbol?.layout?.['text-font'];
  if (Array.isArray(labelFont) && labelFont.length) state.glyphFont = labelFont;
  const before = firstSymbol?.id;
  const t = theme();

  // lineMetrics lets a selected line draw itself in (line-gradient on line-progress).
  map.addSource('transit-routes', { type: 'geojson', data: routeFeatures(), tolerance: 0.6, lineMetrics: true });
  const stops = stopFeatures();
  map.addSource('transit-stops', { type: 'geojson', data: stops });
  // Most map views never show bus stop names. Do not send thousands of bus
  // labels to a second GeoJSON worker until the rider actually zooms in.
  const compactLabels = { type: 'FeatureCollection', features: stops.features.filter(f => f.properties.cat !== 'bus') };
  let detailedLabels = map.getZoom() >= MAP_ZOOM.busStopLabels;
  const refreshStopLabels = () => {
    const needsDetail = map.getZoom() >= MAP_ZOOM.busStopLabels;
    if (needsDetail === detailedLabels || !map.getSource('transit-stop-labels')) return;
    detailedLabels = needsDetail;
    map.getSource('transit-stop-labels').setData(needsDetail ? stops : compactLabels);
  };
  map.on('zoomend', refreshStopLabels);
  // Labels get their own copy of the stops, so a font server outage cannot take the stop dots with it
  // (MapLibre drops a whole tile when one of its symbol layers fails to load glyphs).
  map.addSource('transit-stop-labels', { type: 'geojson', data: detailedLabels ? stops : compactLabels });
  map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('journey', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('journey-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('journey-point-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('vehicle-labels', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  const line = { type: 'line', source: 'transit-routes', layout: { 'line-cap': 'round', 'line-join': 'round' } };
  const widen = (expr, by) => ['interpolate', ['linear'], ['zoom'], ...expr.slice(3).map((v, i) => (i % 2 ? v + by : v))];
  map.addLayer({ ...line, id: 'tr-bus-casing', minzoom: MAP_ZOOM.busRoutes, filter: ['==', ['get', 'cat'], 'bus'], paint: { 'line-color': t.casing, 'line-width': widen(BUS_WIDTH, 2), 'line-opacity': ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busRoutes, 0, MAP_ZOOM.busRoutes + 0.6, t.busCasingOpacity] } }, before);
  map.addLayer({ ...line, id: 'tr-bus', minzoom: MAP_ZOOM.busRoutes, filter: ['==', ['get', 'cat'], 'bus'], paint: { 'line-color': ['get', 'lc'], 'line-width': BUS_WIDTH, 'line-opacity': state.mapMode === 'dark' ? NIGHT_BUS_OPACITY : BUS_OPACITY } }, before);
  const lightWidth = ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.lightRail, 1.1, 13, 2.4, 16, 4];
  map.addLayer({ ...line, id: 'tr-light-casing', minzoom: MAP_ZOOM.lightRail, filter: ['==', ['get', 'cat'], 'light'], paint: { 'line-color': t.casing, 'line-width': widen(lightWidth, 2.2), 'line-opacity': 0.8 } }, before);
  map.addLayer({ ...line, id: 'tr-light', minzoom: MAP_ZOOM.lightRail, filter: ['==', ['get', 'cat'], 'light'], paint: { 'line-color': ['get', 'lc'], 'line-width': lightWidth, 'line-opacity': 0.85 } }, before);
  map.addLayer({ ...line, id: 'tr-heavy-casing', filter: ['==', ['get', 'cat'], 'heavy'], paint: { 'line-color': ['case', ['==', ['get', 'bright'], 1], t.brightCasing, t.casing], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5, 16, 8], 'line-opacity': 0.9 } }, before);
  map.addLayer({ ...line, id: 'tr-heavy', filter: ['==', ['get', 'cat'], 'heavy'], paint: { 'line-color': ['get', 'lc'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 12, 3, 16, 5], 'line-opacity': 0.94 } }, before);
  map.addLayer({ ...line, id: 'tr-selected-casing', filter: ['==', ['get', 'key'], ''], paint: { 'line-color': ['case', ['==', ['get', 'bright'], 1], t.brightCasing, t.casing], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 8, 16, 11] } }, before);
  map.addLayer({ ...line, id: 'tr-selected', filter: ['==', ['get', 'key'], ''], paint: { 'line-color': ['get', 'lc'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5, 16, 7] } }, before);

  const jl = { type: 'line', source: 'journey', layout: { 'line-cap': 'round', 'line-join': 'round' } };
  const jOpacity = ['case', ['==', ['get', 'dim'], 1], 0.35, 1];
  const jWidth = (base, focus) => ['case', ['==', ['get', 'focus'], 1], focus, base];
  map.addLayer({ ...jl, id: 'journey-casing', filter: ['all', ['==', ['get', 'mode'], 'TRANSIT'], ['==', ['get', 'approx'], 0]], paint: { 'line-color': ['get', 'casing'], 'line-width': jWidth(9, 12), 'line-opacity': jOpacity } });
  map.addLayer({ ...jl, id: 'journey-transit', filter: ['all', ['==', ['get', 'mode'], 'TRANSIT'], ['==', ['get', 'approx'], 0]], paint: { 'line-color': ['get', 'color'], 'line-width': jWidth(5.5, 8), 'line-opacity': jOpacity } });
  map.addLayer({ ...jl, id: 'journey-approx', filter: ['all', ['==', ['get', 'mode'], 'TRANSIT'], ['==', ['get', 'approx'], 1]], layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: { 'line-color': ['get', 'stroke'], 'line-width': jWidth(4, 6), 'line-opacity': jOpacity, 'line-dasharray': [2, 1.5] } });
  map.addLayer({ ...jl, id: 'journey-drive-casing', filter: ['==', ['get', 'mode'], 'CAR'], paint: { 'line-color': t.casing, 'line-width': jWidth(8, 11), 'line-opacity': jOpacity } });
  map.addLayer({ ...jl, id: 'journey-drive', filter: ['==', ['get', 'mode'], 'CAR'], paint: { 'line-color': t.journeyDrive || t.ink, 'line-width': jWidth(4.5, 7), 'line-opacity': jOpacity } });
  map.addLayer({ ...jl, id: 'journey-walk-casing', filter: ['==', ['get', 'mode'], 'WALK'], paint: { 'line-color': t.casing, 'line-width': jWidth(6, 8), 'line-opacity': ['case', ['==', ['get', 'dim'], 1], 0.2, state.mapMode === 'standard' ? 0 : 0.6], 'line-dasharray': [0.2, 1.2] } });
  map.addLayer({ ...jl, id: 'journey-walk', filter: ['==', ['get', 'mode'], 'WALK'], paint: { 'line-color': t.journeyWalk, 'line-width': jWidth(3.5, 5), 'line-opacity': jOpacity, 'line-dasharray': [0.2, 2] } });
  map.addLayer({ id: 'journey-stops', type: 'circle', source: 'journey-points', paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'transfer'], 7, 5.5], 'circle-color': t.surface, 'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'transfer'], t.ink, ['get', 'color']], 'circle-stroke-width': 3 } });
  map.addLayer({ id: 'journey-stop-labels', type: 'symbol', source: 'journey-point-labels', minzoom: 10.5, layout: { 'text-field': ['get', 'name'], 'text-font': state.glyphFont, 'text-size': 12.5, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-max-width': 10, 'text-optional': true }, paint: { 'text-color': t.label, 'text-halo-color': t.halo, 'text-halo-width': 1.8 } });

  const stopPaint = (radius, strokeWidth) => ({ 'circle-radius': radius, 'circle-color': t.surface, 'circle-stroke-color': t.stopStroke, 'circle-stroke-width': strokeWidth });
  map.addLayer({ id: 'st-bus', type: 'circle', source: 'transit-stops', minzoom: MAP_ZOOM.busStops, filter: ['all', ['==', ['get', 'cat'], 'bus'], ['==', ['get', 'child'], 0]], paint: { ...stopPaint(['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busStops, 2.2, 17, 4.5], 1.4), 'circle-stroke-color': t.bus, 'circle-opacity': ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busStops, 0, MAP_ZOOM.busStops + 0.4, 1], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busStops, 0, MAP_ZOOM.busStops + 0.4, 1] } }, 'journey-casing');
  map.addLayer({ id: 'st-light', type: 'circle', source: 'transit-stops', minzoom: MAP_ZOOM.lightStops, filter: ['all', ['==', ['get', 'cat'], 'light'], ['==', ['get', 'child'], 0]], paint: stopPaint(['interpolate', ['linear'], ['zoom'], MAP_ZOOM.lightStops, 2.5, 16, 5], 1.6) }, 'journey-casing');
  map.addLayer({ id: 'st-heavy', type: 'circle', source: 'transit-stops', minzoom: MAP_ZOOM.heavyStops, filter: ['all', ['==', ['get', 'cat'], 'heavy'], ['==', ['get', 'child'], 0]], paint: stopPaint(['interpolate', ['linear'], ['zoom'], MAP_ZOOM.heavyStops, 2.6, 12, 4, 16, 6.5], 2) }, 'journey-casing');
  // At close zoom, show GTFS boarding platform / stop points at their published coordinates,
  // not just a station-centroid pin. This lets phone users tap the correct platform.
  map.addLayer({ id: 'st-platform', type: 'circle', source: 'transit-stops', minzoom: 16.5,
    filter: ['==', ['get', 'child'], 1],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 16.5, 3.4, 19, 5.4],
      'circle-color': t.surface, 'circle-stroke-color': t.ink, 'circle-stroke-width': 1.6 } }, 'journey-casing');
  map.addLayer({ id: 'st-selected', type: 'circle', source: 'transit-stops', filter: ['==', ['get', 'id'], '__none__'], paint: { ...stopPaint(['interpolate', ['linear'], ['zoom'], 9, 1.8, 12, 3.2, 14, 5.5], ['interpolate', ['linear'], ['zoom'], 9, 1.4, 12, 2, 14, 2.4]), 'circle-stroke-color': t.ink } });
  map.addLayer({ id: 'st-place', type: 'circle', source: 'transit-stops', filter: ['==', ['get', 'id'], '__none__'], paint: { 'circle-radius': 9, 'circle-color': t.ink, 'circle-stroke-color': t.surface, 'circle-stroke-width': 3 } });

  const labelLayout = size => ({ 'text-field': ['get', 'name'], 'text-font': state.glyphFont, 'text-size': size, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true });
  const labelPaint = { 'text-color': t.label, 'text-halo-color': t.halo, 'text-halo-width': 1.6 };
  map.addLayer({ id: 'st-heavy-label', type: 'symbol', source: 'transit-stop-labels', minzoom: MAP_ZOOM.heavyLabels, filter: ['all', ['==', ['get', 'cat'], 'heavy'], ['==', ['get', 'child'], 0]], layout: labelLayout(12), paint: labelPaint });
  map.addLayer({ id: 'st-light-label', type: 'symbol', source: 'transit-stop-labels', minzoom: MAP_ZOOM.lightLabels, filter: ['all', ['==', ['get', 'cat'], 'light'], ['==', ['get', 'child'], 0]], layout: labelLayout(12), paint: labelPaint });
  map.addLayer({ id: 'st-bus-label', type: 'symbol', source: 'transit-stop-labels', minzoom: MAP_ZOOM.busStopLabels, filter: ['all', ['==', ['get', 'cat'], 'bus'], ['==', ['get', 'child'], 0]], layout: labelLayout(11.5), paint: { ...labelPaint, 'text-color': t.label } });
  map.addLayer({ id: 'st-selected-label', type: 'symbol', source: 'transit-stop-labels', minzoom: 12.5, filter: ['==', ['get', 'id'], '__none__'], layout: labelLayout(12), paint: labelPaint });

  const vehiclePaint = radius => ({
    'circle-radius': radius,
    'circle-color': ['get', 'color'],
    'circle-stroke-color': t.surface,
    'circle-stroke-width': 2,
    'circle-opacity': ['case', ['get', 'stale'], 0.4, 1],
    'circle-stroke-opacity': ['case', ['get', 'stale'], 0.4, 1]
  });
  map.addLayer({ id: 'veh-rail', type: 'circle', source: 'vehicles', minzoom: MAP_ZOOM.railVehicles, filter: ['in', ['get', 'cat'], ['literal', ['heavy', 'light']]], paint: vehiclePaint(['interpolate', ['linear'], ['zoom'], MAP_ZOOM.railVehicles, 4, 15, 7]) });
  map.addLayer({ id: 'veh-bus', type: 'circle', source: 'vehicles', minzoom: MAP_ZOOM.busVehicles, filter: ['==', ['get', 'cat'], 'bus'], paint: vehiclePaint(['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busVehicles, 3.2, 15, 5.5, 17, 7]) });
  // Readable route numbers on moving vehicles, with collision avoidance at city zoom.
  map.addLayer({ id: 'veh-bus-badges', type: 'symbol', source: 'vehicle-labels', minzoom: 13,
    filter: ['==', ['get', 'cat'], 'bus'],
    layout: { 'text-field': ['get', 'badge'], 'text-font': state.glyphFont, 'text-size': 11,
      'text-offset': [0, 1.5], 'text-anchor': 'top', 'text-optional': true,
      'text-allow-overlap': false },
    paint: { 'text-color': t.label, 'text-halo-color': t.halo, 'text-halo-width': 2 } });
  map.addLayer({ id: 'veh-selected', type: 'circle', source: 'vehicles', filter: ['==', ['get', 'key'], '__none__'], paint: vehiclePaint(['interpolate', ['linear'], ['zoom'], 9, 5, 15, 8]) });
  map.addLayer({ id: 'veh-label', type: 'symbol', source: 'vehicle-labels', minzoom: 15.5, filter: ['==', ['get', 'key'], '__none__'], layout: { 'text-field': ['get', 'badge'], 'text-font': state.glyphFont, 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true }, paint: labelPaint });

  applyMapState();
  renderVehicles();
  renderJourney();
}


const ROUTE_LAYERS = ['tr-bus-casing', 'tr-bus', 'tr-light-casing', 'tr-light', 'tr-heavy-casing', 'tr-heavy'];
const STOP_LAYERS = ['st-bus', 'st-light', 'st-heavy', 'st-platform', 'st-heavy-label', 'st-light-label', 'st-bus-label'];
const VEHICLE_LAYERS = ['veh-rail', 'veh-bus', 'veh-bus-badges'];
const ROUTE_LAYER_CAT = { 'tr-bus-casing': 'bus', 'tr-bus': 'bus', 'tr-light-casing': 'light', 'tr-light': 'light', 'tr-heavy-casing': 'heavy', 'tr-heavy': 'heavy' };
const LAYER_KIND = { 'st-bus': 'bus', 'st-bus-label': 'bus', 'veh-bus': 'bus', 'veh-bus-badges': 'bus' };

/* Applies agency visibility, the Rail and Bus switches, line selection, and journey focus to every layer. */
function applyMapState() {
  const map = state.map;
  if (!map?.getLayer('tr-heavy')) return;
  const t = theme();
  const agencies = ['literal', [...state.visible]];
  const inAgencies = ['in', ['get', 'agency'], agencies];
  const focusKey = state.selectedKey;
  const journeyActive = Boolean(state.journey);
  const dimmed = Boolean(focusKey) || journeyActive;
  const kindShown = cat => (cat === 'bus' ? state.showBus : state.showRail);

  for (const id of ROUTE_LAYERS) {
    const cat = ROUTE_LAYER_CAT[id];
    map.setFilter(id, ['all', ['==', ['get', 'cat'], cat], inAgencies]);
    map.setLayoutProperty(id, 'visibility', kindShown(cat) ? 'visible' : 'none');
  }

  map.setPaintProperty('tr-bus', 'line-color', dimmed ? t.faded : ['get', 'lc']);
  map.setPaintProperty('tr-bus', 'line-opacity', dimmed ? ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busRoutes, 0, MAP_ZOOM.busRoutes + 0.6, 0.22] : (state.mapMode === 'dark' ? NIGHT_BUS_OPACITY : BUS_OPACITY));
  map.setPaintProperty('tr-bus-casing', 'line-opacity', dimmed ? 0 : ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busRoutes, 0, MAP_ZOOM.busRoutes + 0.6, t.busCasingOpacity]);
  for (const id of ['tr-light', 'tr-heavy']) {
    map.setPaintProperty(id, 'line-color', dimmed ? t.faded : ['get', 'lc']);
    map.setPaintProperty(id, 'line-opacity', dimmed ? (journeyActive ? 0.22 : 0.3) : (id === 'tr-light' ? 0.85 : 0.94));
  }
  map.setPaintProperty('tr-heavy-casing', 'line-opacity', dimmed ? 0 : 0.9);
  map.setPaintProperty('tr-light-casing', 'line-opacity', dimmed ? 0 : 0.8);

  const selFilter = focusKey ? ['==', ['get', 'key'], focusKey] : ['==', ['get', 'key'], ''];
  map.setFilter('tr-selected-casing', selFilter);
  map.setFilter('tr-selected', selFilter);

  for (const id of STOP_LAYERS) {
    const kind = LAYER_KIND[id] || 'rail';
    map.setLayoutProperty(id, 'visibility', !journeyActive && (id === 'st-platform' ? (state.showBus || state.showRail) : kindShown(kind)) && !(focusKey && /label/.test(id)) ? 'visible' : 'none');
    const base = map.getFilter(id);
    const kept = (base?.[0] === 'all' ? base.slice(1) : [base]).filter(f => !(
      Array.isArray(f) && f[0] === 'in' && Array.isArray(f[1]) &&
      (f[1][1] === 'agency' || (id === 'st-platform' && f[1][1] === 'cat'))
    ));
    const categoryFilter = id === 'st-platform' ? [['in', ['get', 'cat'], ['literal', [
      ...(state.showBus ? ['bus'] : []), ...(state.showRail ? ['light', 'heavy'] : [])
    ]]]] : [];
    map.setFilter(id, ['all', ...kept, ...categoryFilter, inAgencies]);
  }
  for (const id of ['st-heavy', 'st-light']) map.setPaintProperty(id, 'circle-opacity', focusKey ? 0.35 : 1);
  map.setPaintProperty('st-bus', 'circle-opacity', focusKey ? 0.35 : ['interpolate', ['linear'], ['zoom'], MAP_ZOOM.busStops, 0, MAP_ZOOM.busStops + 0.4, 1]);

  const selectedStops = focusKey ? ['all', ['in', `|${focusKey}|`, ['get', 'keys']], ['==', ['get', 'child'], 0]] : ['==', ['get', 'id'], '__none__'];
  map.setFilter('st-selected', selectedStops);
  map.setFilter('st-selected-label', selectedStops);
  if (focusKey) map.setPaintProperty('st-selected', 'circle-stroke-color', mapLineColor(idx.routes.get(focusKey)?.color || t.ink));

  const showVehicles = state.showVehicles && !journeyActive;
  for (const id of VEHICLE_LAYERS) {
    const kind = LAYER_KIND[id] || 'rail';
    map.setLayoutProperty(id, 'visibility', showVehicles && !focusKey && kindShown(kind) ? 'visible' : 'none');
    map.setFilter(id, ['all', kind === 'bus' ? ['==', ['get', 'cat'], 'bus'] : ['in', ['get', 'cat'], ['literal', ['heavy', 'light']]], inAgencies]);
  }
  const selectedVehicles = focusKey ? ['==', ['get', 'key'], focusKey] : ['==', ['get', 'key'], '__none__'];
  map.setFilter('veh-selected', selectedVehicles);
  map.setFilter('veh-label', selectedVehicles);
  map.setLayoutProperty('veh-selected', 'visibility', state.showVehicles ? 'visible' : 'none');
  map.setLayoutProperty('veh-label', 'visibility', state.showVehicles ? 'visible' : 'none');
  updateLayersIndicator();
}

/* The layers button shows a dot while anything is hidden, so a saved filter is never a mystery. */
function updateLayersIndicator() {
  const total = state.network?.agencies?.length || 0;
  const filtered = state.visible.size < total || !state.showBus || !state.showRail;
  $('#layersButton')?.classList.toggle('filtered', filtered);
  const reset = $('#layersReset');
  if (reset) reset.hidden = !filtered;
}

/* A selected line draws itself in from its first stop (line-progress), then settles to a solid
 * line. Skipped when the rider prefers reduced motion. */
let revealFrame = 0;
function revealSelectedRoute(key) {
  const map = state.map;
  cancelAnimationFrame(revealFrame);
  if (!map?.getLayer('tr-selected')) return;
  const info = idx.routes.get(key);
  const clear = () => { map.setPaintProperty('tr-selected', 'line-gradient', null); map.setPaintProperty('tr-selected-casing', 'line-gradient', null); };
  if (!info || prefersReducedMotion()) { clear(); return; }
  const color = mapLineColor(info.color);
  const casing = luminance(color) > 0.55 ? theme().brightCasing : theme().casing;
  const start = performance.now();
  const duration = 900;
  const step = now => {
    if (!map.getLayer('tr-selected')) return;
    const p = Math.min(1, (now - start) / duration);
    const e = 1 - (1 - p) ** 3;
    if (p >= 1) { clear(); return; }
    const head = Math.max(0.001, e);
    map.setPaintProperty('tr-selected', 'line-gradient', ['step', ['line-progress'], color, head, 'rgba(0,0,0,0)']);
    map.setPaintProperty('tr-selected-casing', 'line-gradient', ['step', ['line-progress'], casing, head, 'rgba(0,0,0,0)']);
    revealFrame = requestAnimationFrame(step);
  };
  revealFrame = requestAnimationFrame(step);
}

/* A new trip fades onto the map instead of appearing all at once. */
const JOURNEY_LINE_LAYERS = ['journey-casing', 'journey-transit', 'journey-approx', 'journey-drive-casing', 'journey-drive', 'journey-walk'];
function revealJourney() {
  const map = state.map;
  if (!map?.getLayer('journey-transit') || prefersReducedMotion()) return;
  const target = ['case', ['==', ['get', 'dim'], 1], 0.35, 1];
  for (const id of JOURNEY_LINE_LAYERS) {
    map.setPaintProperty(id, 'line-opacity-transition', { duration: 0, delay: 0 });
    map.setPaintProperty(id, 'line-opacity', 0);
    requestAnimationFrame(() => {
      if (!map.getLayer(id)) return;
      map.setPaintProperty(id, 'line-opacity-transition', { duration: 520, delay: 0 });
      map.setPaintProperty(id, 'line-opacity', target);
    });
  }
}

function highlightPlace(place) {
  const map = state.map;
  if (!map?.getLayer('st-place')) return;
  map.setFilter('st-place', place ? ['all', ['==', ['get', 'agency'], place.a.id], ['==', ['get', 'id'], place.s.id]] : ['==', ['get', 'id'], '__none__']);
}

let lastVehicleData = null;
let vehicleMotionFrame = null;
function renderVehicles() {
  const source = state.map?.getSource('vehicles');
  if (!source) return;
  const stale = vehiclesStale();
  const features = liveVehicles().map(({ v, agencyId, route, label, headsign }) => {
    const a = idx.agencies.get(agencyId);
    const color = mapLineColor(route ? route.color : normalizeColor(a?.color));
    return {
      type: 'Feature',
      properties: { id: v.id, headsign: headsign ? displayName(headsign) : '', vehicle: v.label || v.id || '', key: route?.key || '', agency: agencyId, cat: route?.cat || (agencyId === 'caltrain' ? 'heavy' : 'bus'), color, badge: route?.badge || label || '', title: route?.title || label || '', ts: v.timestamp || 0, stale },
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] }
    };
  });
  const data = { type: 'FeatureCollection', features };
  if (vehicleMotionFrame != null) cancelAnimationFrame(vehicleMotionFrame);
  const previous = lastVehicleData;
  lastVehicleData = data;
  const map = state.map;
  const paint = frame => {
    if (state.map !== map || !map.getSource('vehicles')) return;
    map.getSource('vehicles').setData(frame);
    map.getSource('vehicle-labels')?.setData(frame);
  };
  const motion = window.RoveVehicleMotion;
  const animate = previous?.features?.length && data.features.length && motion &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden;
  if (!animate) { paint(data); return; }
  const start = performance.now();
  const tick = now => {
    const progress = Math.min(1, (now - start) / 8000);
    paint(motion.interpolateVehicles(previous, data, progress));
    if (progress < 1 && state.map === map && !document.hidden) vehicleMotionFrame = requestAnimationFrame(tick);
    else vehicleMotionFrame = null;
  };
  vehicleMotionFrame = requestAnimationFrame(tick);
}

function journeyFeatures(itinerary) {
  if (!itinerary) return { type: 'FeatureCollection', features: [] };
  const focus = state.focusLeg;
  const features = (itinerary.legs || []).map((leg, legIndex) => {
    let coords = leg.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) coords = [[leg.from?.lon, leg.from?.lat], [leg.to?.lon, leg.to?.lat]];
    coords = coords.filter(c => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]));
    if (coords.length < 2) return null;
    const color = isTransit(leg) ? mapLineColor(legInfo(leg).color) : theme().ink;
    const casing = luminance(color) > 0.55 ? theme().brightCasing : theme().surface;
    return { type: 'Feature', properties: { mode: leg.mode, color, casing, stroke: luminance(color) > 0.55 ? theme().brightCasing : color, legIndex, approx: legShapeMissing(leg) ? 1 : 0, dim: focus != null && focus !== legIndex ? 1 : 0, focus: focus === legIndex ? 1 : 0 }, geometry: { type: 'LineString', coordinates: coords } };
  }).filter(Boolean);
  return { type: 'FeatureCollection', features };
}

/* Boarding, exit, transfer, parking and drop-off points for the journey on the map. */



function renderJourney() {
  const map = state.map;
  map?.getSource('journey')?.setData(journeyFeatures(state.journey));
  const points = journeyPointFeatures(state.journey);
  map?.getSource('journey-points')?.setData(points);
  map?.getSource('journey-point-labels')?.setData(points);
}


function cameraPadding() {
  if (isMobile()) {
    const sheet = currentSheetHeight();
    return { top: 48 + (window.visualViewport ? 0 : 0), bottom: Math.min(sheet + 24, window.innerHeight * 0.7), left: 32, right: 64 };
  }
  // The desktop panel floats over the map, so keep journeys clear of it.
  const right = $('#panel')?.getBoundingClientRect().right || 0;
  return { top: 64, bottom: 64, left: Math.round(right + 48), right: 96 };
}

function fitCoordinates(coords, maxZoom = 14) {
  const map = state.map;
  const valid = coords.filter(c => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]));
  if (!map || !valid.length) return;
  if (valid.length === 1) { map.easeTo({ center: valid[0], zoom: Math.max(map.getZoom(), 15), padding: cameraPadding(), duration: motionMs(700) }); return; }
  const bounds = valid.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(valid[0], valid[0]));
  // easeTo with padding leaves that padding on the map, and fitBounds adds its own on top. On a
  // phone the two together leave no room, and MapLibre silently skips the move. Clear it first.
  map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
  map.fitBounds(bounds, { padding: cameraPadding(), maxZoom, duration: motionMs(800) });
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionMs = ms => (prefersReducedMotion() ? 0 : ms);

async function setMapMode(mode, persist = true) {
  state.mapMode = mode;
  if (persist) store.set(STORAGE.mapMode, mode);
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('map-satellite', mode === 'satellite');
  $$('[data-map-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mapMode === mode)));
  tileFailures = []; clearMapStatus('tiles');
  if (!state.map) return;
  const style = await fetchStyle(mode);
  if (state.mapMode !== mode) return;
  state.map.setStyle(style, { diff: false });
}

function setupMapInteractions() {
  const map = state.map;
  const clickable = ['st-place', 'st-selected', 'st-heavy', 'st-light', 'st-bus', 'veh-selected', 'veh-rail', 'veh-bus', 'tr-selected', 'tr-heavy', 'tr-light', 'tr-bus'];
  const present = () => clickable.filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');

  map.on('mousemove', e => {
    const hit = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: present() });
    map.getCanvas().style.cursor = hit.length ? 'pointer' : '';
  });

  map.on('click', e => {
    if (state.mapPick) { endMapPick(e.lngLat); return; }
    if (state.journey && ['results', 'navigate'].includes(currentView().name)) {
      const box = isMobile() ? 12 : 6;
      const legHit = map.queryRenderedFeatures([[e.point.x - box, e.point.y - box], [e.point.x + box, e.point.y + box]], { layers: ['journey-transit', 'journey-approx', 'journey-walk', 'journey-drive'].filter(id => map.getLayer(id)) })[0];
      if (legHit && currentView().name === 'results') { focusLeg(Number(legHit.properties.legIndex), { scroll: true }); return; }
      if (legHit) return;
    }
    const box = isMobile() ? 12 : 6;
    const hits = map.queryRenderedFeatures([[e.point.x - box, e.point.y - box], [e.point.x + box, e.point.y + box]], { layers: present() });
    if (!hits.length) return;
    const stop = hits.find(f => f.layer.id.startsWith('st-'));
    if (stop) { openStop(stop.properties.agency, stop.properties.id); return; }
    const vehicle = hits.find(f => f.layer.id.startsWith('veh-'));
    if (vehicle) { showVehiclePopup(vehicle); return; }
    const keys = [...new Set(hits.filter(f => f.layer.id.startsWith('tr-')).map(f => f.properties.key))];
    if (keys.length === 1) openRoute(keys[0]);
    else if (keys.length > 1) showRouteChooser(e.lngLat, keys);
  });

  map.on('dragstart', () => {
    if (state.nav) { state.nav.follow = false; state.nav.status = 'Exploring map · tap Follow to recenter'; updateGuideLive(); }
    if (isMobile() && state.detent !== 'peek' && !['plan', 'navigate'].includes(currentView().name)) setDetent('peek');
    closePopovers();
  });

  map.on('contextmenu', e => {
    const point = placeFromPoint(e.lngLat);
    refinePointName(point);
    const html = `<div class="vehicle-pop"><strong>${esc(point.name)}</strong><div class="map-menu"><button class="text-button" data-pin="to">Directions to here</button><button class="text-button" data-pin="from">Leave from here</button></div></div>`;
    const popup = new maplibregl.Popup({ offset: 6, maxWidth: '260px' }).setLngLat(e.lngLat).setHTML(html).addTo(map);
    popup.getElement().querySelectorAll('[data-pin]').forEach(b => b.addEventListener('click', () => {
      popup.remove();
      openPlan(b.dataset.pin === 'to' ? { to: point, from: state.plan.from || currentLocationPlace() } : { from: point });
    }));
  });
}

function showVehiclePopup(feature) {
  const p = feature.properties;
  const a = idx.agencies.get(p.agency);
  const info = p.key ? idx.routes.get(p.key) : null;
  const badge = info ? badgeHtml(info) : `<span class="badge" style="background:${esc(normalizeColor(a?.color))};color:#fff">${esc(p.badge)}</span>`;
  const html = `<div class="vehicle-pop">${badge}<strong>${esc(info ? info.title : `${AGENCY_SHORT[p.agency] || ''} ${p.badge}`)}</strong>
    <div class="row-meta">${p.headsign ? `To ${esc(p.headsign)} · ` : ''}${esc(AGENCY_SHORT[p.agency] || '')}${p.vehicle ? ` · Vehicle ${esc(p.vehicle)}` : ''}</div>
    <div class="row-meta ${p.stale ? 'status-stale' : ''}">${p.stale ? 'Location may be out of date. ' : ''}${esc(ageLabel(Number(p.ts)))}</div>
    ${info ? `<button class="text-button" data-popup-route="${esc(info.key)}">View line</button>` : ''}<div class="caption">Vehicle location data provided by <a href="https://511.org" target="_blank" rel="noopener noreferrer">511.org</a></div></div>`;
  const popup = new maplibregl.Popup({ offset: 12, maxWidth: '280px' }).setLngLat(feature.geometry.coordinates).setHTML(html).addTo(state.map);
  popup.getElement().querySelector('[data-popup-route]')?.addEventListener('click', ev => { popup.remove(); openRoute(ev.currentTarget.dataset.popupRoute); });
}

function showRouteChooser(lngLat, keys) {
  const infos = sortRoutes(keys.map(k => idx.routes.get(k)).filter(Boolean)).slice(0, 8);
  const html = `<div class="vehicle-pop"><strong>Choose a line</strong><div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">${infos.map(info => `<button data-popup-route="${esc(info.key)}" aria-label="${esc(info.title)}">${badgeHtml(info)}</button>`).join('')}</div></div>`;
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '260px' }).setLngLat(lngLat).setHTML(html).addTo(state.map);
  popup.getElement().querySelectorAll('[data-popup-route]').forEach(b => b.addEventListener('click', () => { popup.remove(); openRoute(b.dataset.popupRoute); }));
}

/* ======================================================================
 * 6. Panel and bottom sheet
 * ==================================================================== */
const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
const safeArea = { top: 0, bottom: 0 };

function measureSafeArea() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  safeArea.top = parseFloat(cs.paddingTop) || 0;
  safeArea.bottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
}

const DETENTS = ['peek', 'half', 'full'];

function detentHeight(name) {
  const vh = window.innerHeight;
  if (name === 'peek') return Math.round(148 + safeArea.bottom);
  if (name === 'half') return Math.round(Math.max(vh * 0.5, Math.min(360, vh - 120)));
  return Math.round(vh - 56 - safeArea.top);
}

function currentSheetHeight() { return isMobile() ? detentHeight(state.detent) : 0; }

function setDetent(name) {
  state.detent = name;
  const panel = $('#panel');
  panel.classList.remove('detent-peek', 'detent-half', 'detent-full');
  panel.classList.add(`detent-${name}`);
  $('#sheetGrabber').setAttribute('aria-valuetext', name === 'peek' ? 'Collapsed' : name === 'half' ? 'Half height' : 'Full height');
  applySheetHeight(isMobile() ? detentHeight(name) : 0);
  if (name === 'peek') $('#panelBody').scrollTop = 0;
}


function applySheetHeight(px) {
  document.documentElement.style.setProperty('--sheet-h', `${px}px`);
  $('#mapControls').classList.toggle('hidden-by-sheet', isMobile() && px > window.innerHeight * 0.62);
}

/* Sheet heights on phones. Peek shows the search field (or the title of a detail view),
 * half shows the main content next to the map, and full leaves a strip of map visible. */

function nearestDetent(height, velocity, from) {
  const current = DETENTS.indexOf(from);
  if (Math.abs(velocity) > 0.45) return DETENTS[clamp(current + (velocity > 0 ? 1 : -1), 0, 2)];
  return DETENTS.reduce((best, d) => (Math.abs(detentHeight(d) - height) < Math.abs(detentHeight(best) - height) ? d : best), 'peek');
}

function setupSheet() {
  measureSafeArea();
  const panel = $('#panel');
  const body = $('#panelBody');
  const minH = () => detentHeight('peek') - 48;
  const maxH = () => detentHeight('full');

  // Grabber and header: pointer events (mouse, pen, and touch).
  let drag = null;
  const onDown = e => {
    if (!isMobile() || e.target.closest('input, button:not(#sheetGrabber)')) return;
    drag = { y: e.clientY, h: detentHeight(state.detent), t: performance.now(), moved: false, id: e.pointerId, fromGrabber: e.currentTarget.id === 'sheetGrabber' };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    panel.classList.add('dragging');
    applySheetHeight(clamp(drag.h + dy, minH(), maxH()));
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    panel.classList.remove('dragging');
    const dy = drag.y - e.clientY, velocity = dy / Math.max(1, performance.now() - drag.t);
    const { moved, fromGrabber, h } = drag;
    drag = null;
    if (!moved) { if (fromGrabber) setDetent(DETENTS[(DETENTS.indexOf(state.detent) + 1) % 3]); else setDetent(state.detent); return; }
    setDetent(nearestDetent(h + dy, velocity, state.detent));
  };
  for (const h of [$('#sheetGrabber'), $('.panel-top')]) {
    h.addEventListener('pointerdown', onDown);
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  }

  // Content area: below full height every vertical swipe moves the sheet. At full height the
  // content scrolls, and pulling down from the top of the content lowers the sheet.
  let touch = null;
  body.addEventListener('touchstart', e => {
    if (!isMobile() || e.touches.length !== 1 || e.target.closest('input, select, textarea')) { touch = null; return; }
    touch = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now(), h: detentHeight(state.detent), atTop: body.scrollTop <= 0, dragging: false, decided: false };
  }, { passive: true });
  body.addEventListener('touchmove', e => {
    if (!touch) return;
    const y = e.touches[0].clientY, dy = touch.y - y, dx = touch.x - e.touches[0].clientX;
    if (!touch.decided) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      touch.decided = true;
      const vertical = Math.abs(dy) > Math.abs(dx);
      touch.dragging = vertical && (state.detent !== 'full' || (touch.atTop && body.scrollTop <= 0 && dy < 0));
      if (touch.dragging) { touch.y = y; touch.t = performance.now(); }
    }
    if (!touch.dragging) return;
    e.preventDefault();
    panel.classList.add('dragging');
    touch.lastDy = touch.y - y;
    applySheetHeight(clamp(touch.h + touch.lastDy, minH(), maxH()));
  }, { passive: false });
  const endTouch = () => {
    if (!touch?.dragging) { touch = null; return; }
    panel.classList.remove('dragging');
    const dy = touch.lastDy || 0, velocity = dy / Math.max(1, performance.now() - touch.t);
    const target = nearestDetent(touch.h + dy, velocity, state.detent);
    touch = null;
    setDetent(target);
  };
  body.addEventListener('touchend', endTouch);
  body.addEventListener('touchcancel', endTouch);

  $('#sheetGrabber').addEventListener('keydown', e => {
    if (!['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    const i = DETENTS.indexOf(state.detent);
    if (e.key === 'ArrowUp') setDetent(DETENTS[clamp(i + 1, 0, 2)]);
    else if (e.key === 'ArrowDown') setDetent(DETENTS[clamp(i - 1, 0, 2)]);
    else setDetent(DETENTS[(i + 1) % 3]);
  });
  let resizeTimer, wasMobile = isMobile();
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      measureSafeArea();
      setDetent(state.detent);
      // Re-render only when crossing the phone breakpoint; an on-screen keyboard also resizes the window.
      if (wasMobile !== isMobile()) { wasMobile = isMobile(); if (!document.activeElement?.matches('input, select')) render(); }
    }, 120);
  });
}

/* ======================================================================
 * 7. Views
 * ==================================================================== */

const currentView = () => state.stack[state.stack.length - 1];

/* Screen-reader announcement, or Rove's own voice when `speak` is true. Never both at once:
 * a live region read by VoiceOver while Rove is speaking talks over (or ducks) the speech. */
function announceAccess(message, speak = false) {
  const text = String(message || '');
  if (speak && speakOut(text)) return;
  const live = document.getElementById('roveAccessAnnouncement');
  if (!live) return;
  // Clearing first makes screen readers repeat an identical message (for example, Repeat).
  // A newer announcement replaces a pending one, so messages never land out of order.
  clearTimeout(announceAccess.timer);
  live.textContent = '';
  announceAccess.timer = setTimeout(() => { live.textContent = text; }, 30);
}

/* All of Rove's speech goes through RoveSpeech (public/js/speech.js). Must be called directly
 * from a tap handler for the first utterance to be allowed on iPhone. Returns true if started. */
const speaker = window.RoveSpeech?.speaker || null;
function speakOut(text) {
  const message = String(text || '').trim();
  if (!message) return false;
  return (speaker ? speaker.speak(message) : 'unsupported') === 'started';
}
function stopSpeaking() { speaker?.stop(); }

const SPEECH_FAILURES = {
  'no-start': 'Rove could not play audio. Check that the volume is up and Silent mode is off, then try again. The text is on screen for your screen reader.',
  hidden: 'Audio pauses while Rove is in the background. Return to Rove and try again.',
  'not-allowed': 'Your browser blocked audio. Tap the button again to allow it.',
  'audio-busy': 'Another app is using audio. Try again in a moment.'
};
function renderSpeechBar(status) {
  const bar = document.getElementById('speechBar');
  if (!bar) return;
  const { state, reason } = status;
  document.body.classList.toggle('has-speech-bar', ['starting', 'speaking', 'failed', 'unsupported'].includes(state));
  if (state === 'starting' || state === 'speaking') {
    bar.hidden = false;
    bar.dataset.state = 'speaking';
    bar.innerHTML = `<span class="speech-bar-wave" aria-hidden="true"><i></i><i></i><i></i></span><span class="speech-bar-text">Speaking</span><button type="button" class="speech-bar-stop" data-speech-stop>Stop speaking</button>`;
    return;
  }
  if (state === 'failed' || state === 'unsupported') {
    const message = state === 'unsupported' ? 'This browser cannot speak. Your screen reader can read the text on screen.' : (SPEECH_FAILURES[reason] || 'Rove could not play audio. The text is on screen for your screen reader.');
    bar.hidden = false;
    bar.dataset.state = 'failed';
    bar.innerHTML = `<span class="speech-bar-text">${esc(message)}</span><button type="button" class="speech-bar-stop" data-speech-dismiss>Dismiss</button>`;
    // The words that could not be spoken still reach screen-reader users.
    announceAccess(`${message} ${status.text || ''}`);
    return;
  }
  bar.hidden = true;
  bar.innerHTML = '';
}
speaker?.onChange(renderSpeechBar);
document.addEventListener('click', event => {
  if (event.target.closest('[data-speech-stop]')) { stopSpeaking(); announceAccess('Speech stopped.'); }
  if (event.target.closest('[data-speech-dismiss]')) { const bar = document.getElementById('speechBar'); if (bar) { bar.hidden = true; bar.innerHTML = ''; } document.body.classList.remove('has-speech-bar'); }
});
function audioTripSummary(it) {
  const pieces = [durationLabel(it.durationSeconds || (new Date(it.endTime)-new Date(it.startTime))/1000), `${it.transfers || 0} transfers`];
  if (Number.isFinite(it.walkMeters)) pieces.push(`${Math.round(it.walkMeters)} metres walking`);
  pieces.push(`Depart ${clock(new Date(it.startTime))}, arrive ${clock(new Date(it.endTime))}.`);
  for (const leg of it.legs || []) {
    if (leg.mode === 'WALK') pieces.push(`Walk to ${leg.to?.name || 'the next stop'}. Walking directions may be approximate.`);
    else if (leg.mode === 'CAR') pieces.push(`Drive to ${leg.to?.name || 'transit'}.`);
    else pieces.push(`Board ${legInfo(leg).badge}${leg.headsign ? ' toward '+displayName(leg.headsign) : ''} at ${leg.from?.name || 'the stop'}. Exit at ${leg.to?.name || 'the destination'}.`);
  }
  return pieces.join(' ');
}
/* Short, comparable summary for choosing between routes ("Route 1: 52 minutes. Muni N train, then
 * BART Blue line. 1 transfer..."). Full stop-by-stop detail is a separate, per-route action. */
function transitLineNames(it) {
  return (it.legs || []).filter(l => l.mode === 'TRANSIT' && !l.staySeated).map(l => window.RoveJourneyGuide ? RoveJourneyGuide.vehicle(l).name : legInfo(l).badge);
}
const ROUTE_WARNINGS = { LONG_WALK: 'Long walk', LONG_WAIT: 'Long wait at a stop', DEPARTS_LATER: 'Leaves later than you asked', DEPARTS_MUCH_LATER: 'Leaves much later than you asked', DETOUR: 'Indirect route', BACKTRACKS: 'Doubles back' };
const routeWarnings = it => (it.warnings || []).map(w => ROUTE_WARNINGS[w]).filter(Boolean);
function routeChoiceSpeech(it, n) {
  const minutes = Math.round((it.durationSeconds || (new Date(it.endTime) - new Date(it.startTime)) / 1000) / 60);
  const lines = transitLineNames(it);
  const transfers = Math.max(0, lines.length - 1);
  const walk = Number.isFinite(it.walkMeters) && it.walkMeters >= 50 ? ` About ${RoveJourneyGuide.distanceWords(it.walkMeters)} of walking.` : '';
  const live = it.legs.some(l => l.mode === 'TRANSIT' && l.realtime);
  const spokenDuration = minutes < 60 ? plural(minutes, 'minute') : `${plural(Math.floor(minutes / 60), 'hour')}${minutes % 60 ? ' ' + plural(minutes % 60, 'minute') : ''}`;
  return `Route ${n}: ${spokenDuration}. ${lines.length ? lines.join(', then ') : 'Walking only'}. ${transfers ? plural(transfers, 'transfer') : 'No transfers'}.${walk} Leaves ${clock(new Date(it.startTime))}, arrives ${clock(new Date(it.endTime))}. ${live ? 'Includes live times.' : 'Scheduled times, not live.'}${it.hasCancellation ? ' Warning: includes a canceled trip.' : ''}${routeWarnings(it).length ? ` Note: ${routeWarnings(it).join(', ')}.` : ''}`;
}
function speakText(text) {
  announceAccess(text, true);
}
function focusViewHeading() {
  if (!document.body.classList.contains('rove-accessible')) return;
  const target = document.querySelector('#panelBody h1, #panelBody h2');
  if (target) { target.setAttribute('tabindex','-1'); target.focus({preventScroll:true}); }
  else document.getElementById('panelBody')?.focus({preventScroll:true});
}
function pushView(view, { detent } = {}) {
  const top = currentView();
  if (top && top.name === view.name && JSON.stringify(top) === JSON.stringify(view)) { render(); return; }
  if (top?.name === 'search') state.stack.pop();
  state.stack.push(view);
  onLeaveFocus();
  render();
  if (isMobile() && detent) setDetent(detent);
  $('#panelBody').scrollTop = 0;
  focusViewHeading();
}

function popView() {
  if (state.stack.length > 1) state.stack.pop();
  const top = currentView();
  if (top.name === 'search' && !state.searchQuery) state.stack.pop();
  onLeaveFocus();
  render();
  focusViewHeading();
}

function goHome() {
  state.stack = [{ name: 'home' }];
  onLeaveFocus();
  render();
}

/* Clears map focus when the visible view no longer needs it. */
function onLeaveFocus() {
  const top = currentView();
  const below = state.stack[state.stack.length - 2];
  const routeView = top.name === 'route' ? top : (top.name === 'stop' && below?.name === 'route' ? below : null);
  const wantKey = routeView ? routeView.key : null;
  if (state.selectedKey !== wantKey) { state.selectedKey = wantKey; applyMapState(); }
  if (top.name === 'stop') highlightPlace(placeFor(top.agency, top.stop)); else highlightPlace(null);
  if (!['results', 'navigate'].includes(top.name) && state.journey) { state.journey = null; state.focusLeg = null; renderJourney(); applyMapState(); }
  if (top.name === 'place') showPlacePin(top.place); else if (placePin) showPlacePin(null);
  if (top.name !== 'navigate') releaseWakeLock();
}


function render() {
  const view = currentView();
  const body = $('#panelBody');
  const renderers = { home: viewHome, search: viewSearch, route: viewRoute, stop: viewStop, lines: viewLines, plan: viewPlan, results: viewResults, navigate: viewNavigate, sources: viewSources, impact: viewImpact, access: viewAccess, accessNearby: viewAccessNearby, place: viewPlace, demo: viewDemo };
  // Keep the caret where it was if a field inside the panel has focus while the view refreshes.
  const active = document.activeElement;
  const keep = active && body.contains(active) && active.id && active.tagName === 'INPUT' && !(active.dataset.planField && !state.plan.focus) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  body.innerHTML = (renderers[view.name] || viewHome)(view);
  // A new view slides in gently; refreshing the same view never animates.
  if (state.lastViewName !== view.name && !prefersReducedMotion()) {
    body.classList.remove('view-enter'); void body.offsetWidth; body.classList.add('view-enter');
  }
  state.lastViewName = view.name;
  if (keep) {
    const again = document.getElementById(keep.id);
    if (again) { again.focus({ preventScroll: true }); try { again.setSelectionRange(keep.start, keep.end); } catch { /* not a text field */ } }
  }
  const hideSearch = ['home', 'demo', 'plan', 'results', 'navigate'].includes(view.name) || (isMobile() && ['route', 'stop', 'lines', 'sources', 'place'].includes(view.name));
  $('#searchInput').closest('.search-field').hidden = hideSearch;
  $('#panel').classList.toggle('search-hidden', hideSearch);
  if (view.name === 'plan') updatePlanSuggestions();
  updatePlanMarkers();
  setTimeout(prefetchVisibleArrivals, 0);
}

/* Re-renders views that show live data, without moving the scroll position. */

function refreshLiveViews() {
  const view = currentView();
  // Home has no live data; re-rendering it would only move screen-reader focus.
  if (!['route', 'stop', 'sources'].includes(view.name)) return;
  const body = $('#panelBody');
  if (body.contains(document.activeElement) && document.activeElement.matches('input, select')) return;
  const scroll = body.scrollTop;
  const focusedAction = document.activeElement?.closest?.('[data-action]');
  const focusKey = focusedAction ? `${focusedAction.dataset.action}|${focusedAction.dataset.key || ''}|${focusedAction.dataset.stop || ''}` : null;
  const expanded = $$('.alert-row.expanded', body).map(el => el.dataset.alert);
  render();
  expanded.forEach(id => $(`.alert-row[data-alert="${CSS.escape(id)}"]`, body)?.classList.add('expanded'));
  body.scrollTop = scroll;
  if (focusKey) {
    const [action, key, stop] = focusKey.split('|');
    $$(`[data-action="${CSS.escape(action)}"]`, body).find(el => (el.dataset.key || '') === key && (el.dataset.stop || '') === stop)?.focus({ preventScroll: true });
  }
}


function backHeader(trailing = '') {
  return `<div class="view-head"><button class="back-button" data-action="back">${ICONS.back}<span>Back</span></button><span class="spacer"></span>${trailing}</div>`;
}

function badgeHtml(info, large = false) {
  return `<span class="badge${large ? ' lg' : ''}" style="background:${esc(info.color)};color:${esc(info.text)}">${esc(info.badge)}</span>`;
}

function badgesFor(routes, max = 4) {
  const shown = routes.slice(0, max).map(r => badgeHtml(r)).join('');
  return `<span class="badges">${shown}${routes.length > max ? `<span class="badge" style="background:var(--fill);color:var(--ink-2)">+${routes.length - max}</span>` : ''}</span>`;
}

function liveStatusLine() {
  const rt = state.realtime;
  if (!rt) return 'Checking for live data.';
  if (!rtConfigured()) return rt.fetchFailed ? 'Live data could not be reached. Lines and stops show scheduled information.' : 'Live data is not connected on this server. Lines and stops show scheduled information only.';
  if (rt.fetchFailed) return 'Live data could not be refreshed. Showing the last update.';
  const stale = rt.version === 2 ? Object.values(rt.feeds || {}).some(f => f?.stale) : (rt.vehicles?.stale || rt.updates?.stale);
  const partial = rt.version === 2 && rt.configured && !rt.configured.feed511 && rt.configured.bartDirect ? ' Only BART live data is connected.' : '';
  return `${stale ? 'Some live data is delayed. ' : ''}Live data ${ageLabel(realtimeAge()).toLowerCase()}.${partial}`;
}


function alertsHtml(alerts, max = 2) {
  if (!alerts.length) return '';
  const shown = alerts.slice(0, max);
  return shown.map(alert => `<button class="alert-row" data-action="toggle-alert" data-alert="${esc(alert.id)}" aria-expanded="false">${ICONS.alert}
    <span class="alert-text"><strong>${esc(alert.header || 'Service alert')}</strong>${alert.description ? `<p>${esc(alert.description)}</p>` : ''}</span></button>`).join('')
    + (alerts.length > max ? `<p class="note">${plural(alerts.length - max, 'more service alert')} not shown.</p>` : '');
}

/* ---------- Home ---------- */
function viewHome() {
  const saved = !state.nav && loadTrip();
  const places = savedPlaces().slice(0, 4);
  const resume = state.nav ? `<section class="rg-resume" aria-labelledby="rgResumeTitle"><h2 id="rgResumeTitle">Trip in progress</h2><p>${esc(guidePhase()?.heading || '')}</p><button type="button" class="rg-primary small" data-action="access-my-journey">Return to trip</button></section>`
    : saved ? `<section class="rg-resume" aria-labelledby="rgResumeTitle"><h2 id="rgResumeTitle">Unfinished trip${saved.demo ? ' (demo)' : ''}</h2><p>To ${esc(saved.destination?.name || 'your destination')} · step ${saved.gs.index + 1}</p><div class="rg-resume-actions"><button type="button" class="rg-primary small" data-action="trip-resume">Resume trip</button><button type="button" class="rg-text-button" data-action="trip-discard">Discard</button></div></section>` : '';
  return `<div class="rg-home">
    ${resume}
    <h1 id="roveHomeTitle" class="rg-home-title" tabindex="-1">Where to?</h1>
    <div class="rg-stack">
      <button type="button" class="rg-primary" data-action="voice-destination">${MIC_ICON}<span>Speak destination</span></button>
      <button type="button" class="rg-field" data-action="plan">${SEARCH_ICON}<span>Type a destination</span></button>
    </div>
    ${places.length ? `<section class="rg-saved" aria-labelledby="rgSavedTitle"><h2 id="rgSavedTitle" class="rg-label">Saved places</h2><div class="rg-chips">${places.map(p => `<button type="button" class="rg-chip" data-action="go-saved" data-label="${esc(p.label)}">${esc(p.label)}</button>`).join('')}</div></section>` : ''}
    <nav class="rg-links" aria-label="More">
      <button type="button" class="rg-link" data-action="demo"><span>Try the demo journey</span><small>Simulated trip with a transfer</small></button>
      <button type="button" class="rg-link" data-action="access-nearby"><span>Nearby stops</span><small>Uses your location</small></button>
      <button type="button" class="rg-link" data-action="access"><span>Voice and accessibility</span><small>Rove voice, vibration, how it works</small></button>
      <button type="button" class="rg-link" data-action="sources"><span>Transit data</span><small>Sources and what is live</small></button>
    </nav>
  </div>`;
}

/* Stations lead the list only when the query names one; otherwise addresses and places do. */

function stationsLead(q, stops) {
  const needle = normalizeSearch(q);
  return needle.length >= 2 && stops.some(({ a, s }) => (s.k || stopCategory(a.id, s.id) !== 'bus' || idx.children.has(stopKey(a.id, s.id))) && normalizeSearch(s.n).startsWith(needle));
}

/* Saved and recent places whose name or address contains the query. */


function placeRow(place, trailing = '') {
  const arrivals = cachedArrivals(place);
  const isStation = place.s.k || idx.children.has(stopKey(place.a.id, place.s.id));
  let meta = esc(`${AGENCY_SHORT[place.a.id]}${isStation ? ' · Station' : ''}`);
  const next = arrivals?.status === 'live' ? arrivals.groups[0] : null;
  if (next) {
    const m = minutesLabel(next.times[0].time);
    const label = next.route ? next.route.badge : next.label;
    meta = `${ICONS.live}<span class="status-live">${esc(label)} in ${esc(m.value)}${m.unit ? ` ${m.unit}` : ''}</span> · ${meta}`;
  }
  return `<li><button class="row" data-action="stop" data-agency="${esc(place.a.id)}" data-stop="${esc(place.s.id)}">
    ${badgesFor(place.routes, 3)}
    <span class="row-main"><span class="row-title">${esc(place.s.n)}</span><span class="row-meta">${meta}</span></span>
    ${trailing ? `<span class="row-end caption">${esc(trailing)}</span>` : ICONS.chevron}</button></li>`;
}


function nearbyPlaces(location, limit) {
  const candidates = [];
  for (const entry of idx.searchable) {
    if (!state.visible.has(entry.a.id)) continue;
    const d = distanceMeters(location, entry.s.p);
    if (d < 1609) candidates.push({ entry, d });
  }
  candidates.sort((x, y) => x.d - y.d);
  const out = [], seen = new Set();
  for (const { entry, d } of candidates) {
    const place = placeFor(entry.a.id, entry.s.id);
    if (!place || !place.routes.length) continue;
    const memberKeys = place.members.map(m => `${place.a.id}|${m.id}`);
    if (memberKeys.some(k => seen.has(k))) continue;
    memberKeys.forEach(k => seen.add(k));
    out.push({ place, d });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------- Search ---------- */
function normalizeSearch(text) {
  return String(text).toLowerCase().replace(/&/g, ' and ').replace(/\bst\b\.?/g, 'street').replace(/\bave\b\.?/g, 'avenue').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/* Fast local typeahead: exact matches lead, then prefixes, then bounded typos.
 * Our GTFS station names and stop coordinates are local, so this works offline,
 * uses no paid geocoder, and responds even while the address service is loading.
 * A single adjacent transposition counts as one mistake ("berkely" -> "berkeley"). */
function typoDistance(a, b, limit) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prevPrev = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let distance = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        distance = Math.min(distance, prevPrev[j - 2] + 1);
      }
      curr.push(distance);
      rowMin = Math.min(rowMin, distance);
    }
    if (rowMin > limit) return limit + 1;
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

function transitSearchScore(needle, candidate) {
  const q = normalizeSearch(needle), name = normalizeSearch(candidate);
  if (!q || !name) return 0;
  if (q === name) return 130;
  if (name.startsWith(q)) return 108;
  if (name.includes(q)) return 87;
  const terms = name.split(' ');
  let total = 0;
  for (const word of q.split(' ')) {
    let best = 0;
    for (const term of terms) {
      if (term === word) { best = 70; break; }
      if (word.length >= 2 && term.startsWith(word)) best = Math.max(best, 58);
      else if (word.length >= 3 && term.includes(word)) best = Math.max(best, 43);
      else if (word.length >= 4 && term.length >= 4) {
        const threshold = word.length >= 7 ? 2 : 1;
        const edits = typoDistance(word, term, threshold);
        if (edits <= threshold) best = Math.max(best, edits === 1 ? 37 : 25);
      }
    }
    if (!best) return 0;
    total += best;
  }
  return total / q.split(' ').length;
}

/* Correct only genuinely unmatched stop words, using a compact vocabulary built at startup.
 * This avoids running expensive edit-distance against 11,000+ stops on every keystroke. */
function correctedTransitQuery(query) {
  const words = normalizeSearch(query).split(' ');
  const vocabulary = idx.wordFrequency || new Map();
  return words.map(word => {
    if (word.length < 4 || vocabulary.has(word)) return word;
    if (idx.correctionCache?.has(word)) return idx.correctionCache.get(word);
    const limit = word.length >= 7 ? 2 : 1;
    let best = word, bestScore = -Infinity;
    for (const [candidate, frequency] of vocabulary) {
      if (candidate[0] !== word[0] || Math.abs(candidate.length - word.length) > limit) continue;
      const edits = typoDistance(word, candidate, limit);
      if (edits > limit) continue;
      const score = -edits * 100 + Math.log2(frequency + 1) * 3;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    idx.correctionCache?.set(word, best);
    return best;
  }).join(' ');
}

function searchNetwork(query, { routes = true, stopLimit = 8, routeLimit = 6 } = {}) {
  const q = normalizeSearch(query);
  if (!q) return { routes: [], stops: [] };
  const words = q.split(' ');
  const routeResults = [];
  if (routes) {
    for (const info of idx.routes.values()) {
      if (!state.visible.has(info.a.id)) continue;
      const badge = info.badge.toLowerCase(), name = (info.r.n || '').toLowerCase();
      const hay = normalizeSearch(`${info.badge} ${info.r.n} ${info.title} ${info.a.name}`);
      let score = 0;
      if (badge === q || name === q) score = 100;
      else if (badge.startsWith(q) || name.startsWith(q)) score = 60;
      else if (words.every(w => hay.includes(w))) score = 20;
      else if (q.length >= 3) score = Math.max(transitSearchScore(q, info.badge), transitSearchScore(q, info.r.n || ''), transitSearchScore(q, info.title)) * 0.65;
      if (score) routeResults.push({ info, score: score + CATEGORY_RANK[info.cat] });
    }
    routeResults.sort((x, y) => y.score - x.score || x.info.badge.localeCompare(y.info.badge, 'en', { numeric: true }));
  }
  const stopResults = [];
  const collectStops = (terms, correction = false) => {
    const wanted = terms.split(' ');
    for (const entry of idx.searchable) {
      if (!state.visible.has(entry.a.id) || !wanted.every(w => entry.haystack.includes(w))) continue;
      const name = entry.name || normalizeSearch(entry.s.n);
      const score = (name === terms ? 130 : name.startsWith(terms) ? 108 : name.includes(terms) ? 87 : 45)
        + CATEGORY_RANK[stopCategory(entry.a.id, entry.s.id)] * 5 - (correction ? 24 : 0);
      stopResults.push({ entry, score });
    }
  };
  let correction = null;
  if (q.length >= 2) {
    collectStops(q);
    if (stopResults.length === 0 && q.length >= 4) {
      const fixed = correctedTransitQuery(q);
      if (fixed !== q) { collectStops(fixed, true); if (stopResults.length) correction = fixed; }
    }
    stopResults.sort((x, y) => y.score - x.score || x.entry.s.n.localeCompare(y.entry.s.n));
  }
  return { routes: routeResults.slice(0, routeLimit).map(x => x.info), stops: stopResults.slice(0, stopLimit).map(x => x.entry), correction };
}

function highlight(text, query) {
  const q = query.trim();
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(text);
  return `${esc(text.slice(0, i))}<strong>${esc(text.slice(i, i + q.length))}</strong>${esc(text.slice(i + q.length))}`;
}

function viewSearch() {
  const q = state.searchQuery;
  const { routes, stops, correction } = searchNetwork(q);
  const personal = matchingPersonalPlaces(q, 3);
  const forSearch = autocomplete.target === 'search';
  const places = forSearch ? autocompleteSectionHtml('search-place') : '';
  const waiting = forSearch && autocomplete.status === 'loading' && autocomplete.query === q.trim();
  const noPlaces = !forSearch || q.trim().length < 3 || (autocomplete.status === 'done' && !autocomplete.results.length);
  if (!routes.length && !stops.length && !personal.length && noPlaces && !waiting) {
    return `<p class="empty" style="padding-top:16px">No Bay Area results for “${esc(q)}”. Check the spelling, or try a Bay Area address, a station, or a line such as 38R or 51A.</p>`;
  }
  const parts = [];
  if (correction) parts.push(`<p class="search-correction" role="status">Showing stop results for <strong>${esc(correction)}</strong></p>`);
  if (personal.length) parts.push(`<section class="section" style="margin-top:8px"><h2 class="label">Your places</h2><ul class="rows">${personal.map(([p, icon]) => placeOptionRow(p, 'search-place', icon)).join('')}</ul></section>`);
  const linesHtml = routes.length ? `<section class="section"><h2 class="label">Lines</h2><ul class="rows">${routes.map(info => `<li><button class="row result" data-action="route" data-key="${esc(info.key)}">${badgeHtml(info)}<span class="row-main"><span class="row-title">${highlight(info.title, q)}</span><span class="row-meta">${esc(AGENCY_SHORT[info.a.id])} · ${esc(modeName(info))}</span></span>${ICONS.chevron}</button></li>`).join('')}</ul></section>` : '';
  const stopsHtml = stops.length ? `<section class="section"><h2 class="label">Stops and stations</h2><ul class="rows">${stops.slice(0, 6).map(({ a, s }) => {
    const rs = sortRoutes(routesForStop(a.id, s.id));
    const isStation = s.k || idx.children.has(stopKey(a.id, s.id));
    const d = state.userLocation ? distanceLabel(distanceMeters(state.userLocation, s.p)) : '';
    return `<li><button class="row result" data-action="stop" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">${badgesFor(rs, 3)}<span class="row-main"><span class="row-title">${highlight(s.n, q)}</span><span class="row-meta">${esc(AGENCY_SHORT[a.id])}${isStation ? ' · Station' : ''}</span></span>${d ? `<span class="row-end caption">${esc(d)}</span>` : ICONS.chevron}</button></li>`;
  }).join('')}</ul></section>` : '';
  // A query that starts with a house number is almost always an address.
  if (/^\d+\s+\S/.test(q.trim())) parts.push(places, linesHtml, stopsHtml);
  else if (correction || stationsLead(q, stops)) parts.push(linesHtml, stopsHtml, places);
  else parts.push(linesHtml, places, stopsHtml);
  return `<div class="search-results">${parts.filter(Boolean).join('')}</div>`;
}

/* ---------- Route ---------- */

function openRoute(key) {
  const info = idx.routes.get(key);
  if (!info) return;
  closePopovers();
  if (!state.visible.has(info.a.id)) { state.visible.add(info.a.id); persistAgencies(); renderAgencyToggles(); }
  state.selectedKey = key;
  state.journey = null;
  renderJourney();
  applyMapState();
  revealSelectedRoute(key);
  clearSearchField();
  pushView({ name: 'route', key }, { detent: 'half' });
  // A line without a published shape (BART's temporary bus bridges) is framed by its stops instead.
  let coords = (info.r.shapes || []).flat();
  if (!coords.length) { const stopMap = idx.stopById.get(info.a.id); coords = info.r.stops.map(id => stopMap.get(id)?.p).filter(Boolean); }
  requestAnimationFrame(() => fitCoordinates(coords, 13.5));
}

function viewRoute({ key }) {
  const info = idx.routes.get(key);
  if (!info) return `${backHeader()}<p class="empty">This line is no longer in the schedule data.</p>`;
  const { a, r } = info;
  const stopMap = idx.stopById.get(a.id);
  const stops = r.stops.map(id => stopMap.get(id)).filter(Boolean);
  const vehicles = liveVehicles().filter(x => x.route?.key === key);
  const cov = coverage(a.id);
  const rt = state.realtime;
  let liveLine;
  if (!rt?.configured) liveLine = 'Scheduled service. Live data is not connected.';
  else if (!cov.vehicles) liveLine = `${AGENCY_SHORT[a.id]} does not share vehicle locations. Scheduled service is shown.`;
  else if (vehicles.length) liveLine = `${ICONS.live}<span class="status-live">${plural(vehicles.length, 'vehicle')} in service</span> · ${esc(ageLabel(rt.vehicles?.headerTimestamp))}`;
  else liveLine = 'No vehicles are reporting on this line right now.';

  const vehicleStops = new Map();
  for (const { v } of vehicles) {
    const sid = splitRealtimeId(v.stopId).local;
    if (sid) vehicleStops.set(sid, (vehicleStops.get(sid) || 0) + 1);
  }
  const alerts = activeAlerts({ agencyId: a.id, routeKeys: [key] });
  const mode = modeName(info);
  return `${backHeader()}
    <div class="hero">
      ${badgeHtml(info, true)}
      <h1 class="title-1">${esc(info.title)}</h1>
      <p class="caption">${esc(a.name)} · ${esc(mode)}${r.d ? ` · Toward ${esc(displayName(r.d))}` : ''}</p>
      <p class="caption" style="margin-top:4px">${liveLine}</p>
      ${(r.shapes || []).some(sh => sh?.length > 1) ? '' : `<p class="area-note shape-missing">${esc(a.name)} has not published a route shape for this line, so the map shows its stops only.</p>`}
    </div>
    ${alertsHtml(alerts)}
    <section class="section"><h2 class="label"><span>Stops</span><span>${stops.length}</span></h2>
      <ol class="line-diagram" style="--line-color:${esc(info.color)}">${stops.map(s => {
        const count = vehicleStops.get(s.id);
        return `<li><button data-action="stop" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}"><span class="node"></span><span class="stop-name">${esc(s.n)}</span>${count ? `<span class="vehicle-here">${plural(count, 'vehicle')} here</span>` : ''}</button></li>`;
      }).join('')}</ol>
    </section>`;
}

/* ---------- Stop ---------- */
function openStop(agencyId, stopId) {
  const place = placeFor(agencyId, stopId);
  if (!place) return;
  closePopovers();
  clearSearchField();
  pushView({ name: 'stop', agency: place.a.id, stop: place.s.id }, { detent: 'half' });
  const map = state.map;
  if (map) requestAnimationFrame(() => map.easeTo({ center: place.s.p, zoom: Math.max(map.getZoom(), 15), padding: cameraPadding(), duration: motionMs(700) }));
}

/* The server's reason live arrivals are withheld, when it is a sentence a rider can read
 * ("Live data from 511 is not configured on this server."). Technical detail in parentheses is
 * dropped; internal gate notes ("too few stop predictions to verify (0)") are not shown. */
function liveUnavailableReason(reasons) {
  const sentence = (Array.isArray(reasons) ? reasons : []).find(r => typeof r === 'string' && /^[A-Z].*\.$/.test(r.trim()));
  return sentence ? sentence.trim().replace(/\s*\((?:[^()]|\([^()]*\))*\)\.$/, '.') : '';
}

function viewStop({ agency, stop }) {
  const place = placeFor(agency, stop);
  if (!place) return `${backHeader()}<p class="empty">This stop is no longer in the schedule data.</p>`;
  const { a, s } = place;
  const isSaved = state.saved.some(x => x.a === a.id && x.id === s.id);
  const isStation = s.k || idx.children.has(stopKey(a.id, s.id));
  const cov = coverage(a.id);
  const alerts = activeAlerts({ agencyId: a.id, routeKeys: place.routes.map(r => r.key), stopIds: place.ids });
  const arrivals = state.realtime?.version === 2 ? cachedArrivals(place) : rtConfigured() && cov.arrivals ? cachedArrivals(place) : null;

  let departures;
  if (!rtConfigured()) {
    departures = '<p class="empty">Live arrivals are not connected on this server. The lines that serve this stop are listed below.</p>';
  } else if ((state.realtime?.version !== 2 && !cov.arrivals) || arrivals?.status === 'unverified') {
    const why = liveUnavailableReason(arrivals?.reasons?.length ? arrivals.reasons : state.planStatus?.liveReasons?.[a.id]);
    departures = `<p class="empty">Live arrivals for ${esc(AGENCY_SHORT[a.id])} are unavailable right now. ${esc(why || 'Rove only shows predictions it can match to the schedule.')} The lines that serve this stop are listed below.</p>`;
  } else if (!arrivals) {
    departures = '<p class="empty" aria-busy="true">Loading live arrivals.</p>';
  } else if (arrivals.status === 'error') {
    departures = '<p class="empty">Live arrivals could not be loaded. Rove will try again shortly.</p>';
  } else if (!arrivals.groups.length) {
    departures = '<p class="empty">No live predictions for the next three hours. Service may have ended for the day, or vehicles may not be reporting.</p>';
  } else {
    departures = `<ul class="departures">${arrivals.groups.slice(0, 8).map((g, i) => departureRow(g, i === 0, a.id)).join('')}</ul>`;
  }
  const canceled = arrivals?.canceled?.length ? `<ul class="rows canceled-list">${arrivals.canceled.slice(0, 4).map(c => `<li><div class="row">${c.route ? badgeHtml(c.route) : `<span class="badge" style="background:var(--fill);color:var(--ink)">${esc(c.routeName || 'Trip')}</span>`}<span class="row-main"><span class="row-title status-canceled">${c.reason === 'stop-skipped' ? 'Not stopping here' : 'Canceled'}</span><span class="row-meta">${c.headsign ? `Toward ${esc(c.headsign)}` : 'One trip'}</span></span></div></li>`).join('')}</ul>` : '';
  const ageText = arrivals?.feedTs ? ` · ${ageLabel(arrivals.feedTs)}` : '';
  const staleText = arrivals?.stale ? ' <span class="status-stale">Live times may be out of date.</span>' : '';

  return `${backHeader(`<button class="icon-button" data-action="save" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Remove from saved stops' : 'Save this stop'}">${isSaved ? ICONS.starFilled : ICONS.star}</button>`)}
    <div class="hero">
      <h1 class="title-1">${esc(s.n)}</h1>
      <p class="caption">${esc(a.name)}${isStation ? ' · Station' : ' · Stop'}${esc(ageText)}${staleText}</p>
    </div>
    <section class="section" style="margin-top:4px"><h2 class="label">Departures</h2>${document.body.classList.contains('rove-accessible') ? `<button class="button secondary" data-action="access-departures" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">Read next departures aloud</button>` : ''}${departures}${canceled}</section>
    ${alerts.length ? `<div style="margin-top:16px">${alertsHtml(alerts, 1)}</div>` : ''}
    <div class="action-bar" style="margin-top:20px">
      <button class="button primary" data-action="plan-to" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">Directions</button>
      <button class="button secondary" data-action="plan-from" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">Leave from here</button>
    </div>
    <section class="section"><h2 class="label"><span>Lines here</span><span>${place.routes.length}</span></h2><ul class="rows">${place.routes.map(info => `<li><button class="row" data-action="route" data-key="${esc(info.key)}">${badgeHtml(info)}<span class="row-main"><span class="row-title">${esc(info.title)}</span></span>${ICONS.chevron}</button></li>`).join('')}</ul></section>`;
}


function departureRow(group, first, agencyId) {
  const next = group.times[0];
  const m = minutesLabel(next.time);
  // A trip missing from the schedule has no scheduled time to be early or late against.
  const status = group.unscheduled ? { cls: 'status-live', text: 'Live' } : delayStatus(next.delay);
  const later = group.times.slice(1, 3).map(t => minutesLabel(t.time));
  let laterText = '';
  if (later.length) {
    const allMinutes = later.every(x => x.unit === 'min');
    laterText = allMinutes ? `Then ${later.map(x => x.value).join(' and ')} min` : `Then ${later.map(x => (x.unit ? `${x.value} ${x.unit}` : x.value)).join(' and ')}`;
  }
  const badge = group.route ? badgeHtml(group.route) : `<span class="badge" style="background:var(--ink);color:var(--surface)">${esc(group.label)}</span>`;
  const title = group.headsign ? `To ${displayName(group.headsign)}` : group.route ? group.route.title : `${AGENCY_SHORT[agencyId] || ''} ${group.label}`.trim();
  return `<li class="departure${first ? ' first' : ''}">
    <span class="when"><strong>${esc(m.value)}</strong>${m.unit ? `<span>${m.unit}</span>` : ''}</span>
    <span class="what">${badge}<div class="row-title" style="margin-top:6px">${esc(title)}</div>
      <div class="status ${status.cls}">${ICONS.live}${esc(status.text)}</div>
      ${group.unscheduled ? `<div class="then">${group.antioch ? 'Antioch line train (Pittsburg Center and Antioch). BART does not publish a schedule match for these trips.' : 'Extra train not in the published schedule, so the line is not shown.'}</div>` : ''}
      ${laterText ? `<div class="then">${esc(laterText)}</div>` : ''}</span>
    <span class="row-end"></span></li>`;
}

/* ---------- Lines directory ---------- */

function viewLines() {
  const groups = state.network.agencies.map(a => {
    const infos = sortRoutes(a.routes.map(r => idx.routes.get(routeKey(a.id, r.id))).filter(Boolean));
    return `<section class="section"><h2 class="label"><span>${esc(a.name)}</span><span>${infos.length}</span></h2><ul class="rows">${infos.map(info => `<li><button class="row" data-action="route" data-key="${esc(info.key)}">${badgeHtml(info)}<span class="row-main"><span class="row-title">${esc(info.title)}</span></span>${ICONS.chevron}</button></li>`).join('')}</ul></section>`;
  });
  return `${backHeader()}<div class="hero"><h1 class="title-1">All lines</h1><p class="caption">${idx.routes.size} lines from current schedules</p></div>${groups.join('')}`;
}

/* ---------- Sources ---------- */
function carbonComparison(it) {
  const legs = it?.legs || [];
  if (legs.some(l => l.mode === 'CAR')) return '';
  const transitKm = legs.filter(l => isTransit(l)).reduce((n,l) => n + (Number.isFinite(l.distanceMeters) ? l.distanceMeters / 1000 : 0), 0);
  if (!transitKm) return '';
  // Illustrative, not measured: passenger-km factors vary with occupancy and vehicle type.
  const carKg = transitKm * 0.25, transitKg = transitKm * 0.10;
  return `<p class="carbon-estimate">🌱 About ${esc((carKg-transitKg).toFixed(1))} kg CO₂e less than driving alone <span>· illustrative estimate</span></p>`;
}
function viewImpact() {
 return `${backHeader()}<div class="hero"><h1 class="title-1">A lighter way to move</h1><p class="caption">The impact of a shared ride</p></div><section class="section"><div class="impact-visual" aria-hidden="true"><span>🚘 Driving alone</span><div class="impact-track"><i style="width:100%"></i></div><span>🚆 Shared transit</span><div class="impact-track"><i style="width:40%"></i></div></div><h2 class="label">How the comparison works</h2><p class="empty">Our route cards use illustrative factors of 0.25 kg CO₂e per passenger-km for a solo car and 0.10 kg CO₂e per passenger-km for transit. This is an example, not a verified emissions inventory or a promise for a particular trip.</p><p class="empty">Real emissions depend on vehicle type, energy source, ridership, detours, and whether you would otherwise drive. Walking and biking generally have very low operational emissions. We do not count construction or full lifecycle impacts in these estimates.</p></section>`;
}
function accessPreference(key, defaultValue = false) {
  try { const value = localStorage.getItem('rove-access-'+key); return value == null ? defaultValue : value === 'yes'; } catch { return defaultValue; }
}
function accessSetting(key, enabled) {
  try { localStorage.setItem('rove-access-'+key, enabled ? 'yes' : 'no'); } catch {}
}
function accessVibrate(pattern = [90]) {
  if (accessPreference('haptics', true) && navigator.vibrate) navigator.vibrate(pattern);
}
function viewAccessNearby() {
 const fix=state.accessLocationFix;
 const valid=state.userLocation && fix && Date.now()-fix.time<60000 && Number.isFinite(fix.accuracy);
 const uncertain=!valid || fix.accuracy>65;
 const items=state.userLocation ? nearbyPlaces(state.userLocation,8) : [];
 return `${backHeader()}<div class="hero"><h1 class="title-1">Nearby transit stops</h1><p class="caption">Stop locations from Bay Area transit schedules</p></div>
 <section class="section"><button class="button primary" data-action="access-refresh-location">${state.userLocation?'Refresh my location':'Find my location'}</button>
 <p class="access-location-status" role="status">${!valid?'Your current location accuracy is unknown. Distances may be inaccurate.':`Location accuracy: approximately ${Math.round(fix.accuracy)} metres. ${uncertain?'Accuracy is too low to locate an exact stop.':'Distances are estimates, not walking directions.'}`}</p>
 <p>GPS cannot identify a safe crossing, platform edge, or exact boarding position. Confirm the stop and direction before boarding.</p></section>
 <section class="section"><h2>Closest stops</h2>${items.length?`<ol class="access-nearby-list">${items.map(({place,d})=>`<li><h3>${esc(place.s.n)}</h3><p>${esc(AGENCY_SHORT[place.a.id]||place.a.name)} · Approximately ${Math.round(d/10)*10} metres straight-line distance${uncertain?' (low confidence)':''}</p><p>Routes: ${esc(place.routes.slice(0,7).map(r=>r.title).join(', ')||'Not listed')}</p><button class="button primary" data-action="access-select-stop" data-agency="${esc(place.a.id)}" data-stop="${esc(place.s.id)}">Select this stop and check departures</button></li>`).join('')}</ol>`:'<p class="empty">No nearby stops available yet. Refresh location, or search for a stop by name.</p>'}</section>`;
}
function viewAccess() {
  return `${backHeader()}<div class="rg-page">
    <h1 class="rg-title">Voice and accessibility</h1>
    <section class="rg-settings" aria-labelledby="rgSettingsTitle">
      <h2 id="rgSettingsTitle" class="rg-label">Settings</h2>
      <label class="access-setting"><input type="checkbox" data-access-setting="speak" ${accessPreference('speak', true) ? 'checked' : ''}/> <span><strong>Rove voice</strong><br>Rove reads each step and reminder aloud. If you use VoiceOver or TalkBack, you can turn this off; your screen reader will announce updates instead.</span></label>
      <label class="access-setting"><input type="checkbox" data-access-setting="haptics" ${accessPreference('haptics', true) ? 'checked' : ''}/> <span><strong>Vibration</strong><br>For reminders and confirmations, on phones that support it. iPhone Safari does not.</span></label>
      <button type="button" class="rg-quiet" data-action="access-demo">Test Rove voice</button>
      <p class="rg-body">When you speak a destination, the recording is sent to a speech-to-text service (through Vercel AI Gateway) to turn it into text. Rove does not store recordings. If that service is unavailable, Rove uses your browser's own voice input.</p>
    </section>
    <section class="rg-settings" aria-labelledby="rgHowTitle">
      <h2 id="rgHowTitle" class="rg-label">How a trip works</h2>
      <ol class="access-guide"><li>Speak or type where you want to go, then choose the right match.</li><li>Listen to the route choices and start one.</li><li>Rove gives one step at a time. Confirm each step yourself: I'm at the stop, I've boarded, I've got off.</li><li>Rove reminds you before your stop, by live time when available, otherwise by the schedule.</li><li>Help is always one tap away: find another route, where am I, undo.</li></ol>
    </section>
    <section class="rg-settings" aria-labelledby="rgCantTitle">
      <h2 id="rgCantTitle" class="rg-label">What Rove cannot do</h2>
      <p class="rg-body">Rove cannot detect obstacles, safe crossings, platform edges, accessible entrances or elevators, or which vehicle you are on. GPS can be off by a block or more. Use your usual mobility aids, and ask transit staff when unsure.</p>
    </section>
  </div>`;
}

function readNavInstruction() {
 const step = state.nav?.steps[state.nav.i];
 if (!step) return;
 speakText(`${step.title}. ${step.meta || ''}. Confirm boarding and safe paths independently.`);
}
function viewSources() {
  const rows = state.network.agencies.map(a => `<li><div class="row"><span class="dot" style="background:${esc(a.color)}"></span><span class="row-main"><span class="row-title">${esc(a.name)}</span><span class="row-meta">${plural(a.routes.length, 'line')} · Schedule valid ${esc(formatGtfsDate(a.feed?.start))} to ${esc(formatGtfsDate(a.feed?.end))}</span></span></div></li>`).join('');
  const rt = state.realtime;
  const budget = rt?.meta?.requestBudget || rt?.requestBudget;
  return `${backHeader()}
    <div class="hero"><h1 class="title-1">Data sources</h1><p class="caption">Schedules updated ${esc(dateFormat.format(new Date(state.network.generatedAt)))}</p></div>
    <section class="section"><h2 class="label">Schedules</h2><ul class="rows">${rows}</ul></section>
    <section class="section"><h2 class="label">Live data</h2><p class="empty">${esc(liveStatusLine())}${budget ? ` The server has used ${budget.used} of its ${budget.limit} hourly requests to 511.` : ''}</p>${liveCoverageHtml()}</section>
    <section class="section"><h2 class="label">Credits</h2>
      <div class="empty" style="line-height:22px">
        <p>Transit data provided by 511.org, BART, AC Transit, VTA, Caltrain, and SFMTA.</p>
        <p>Reproduced with permission granted by the City and County of San Francisco.</p>
        <p>AC Transit data is licensed under a Creative Commons Attribution 3.0 Unported License.</p>
        <p>Map data © OpenStreetMap contributors and OpenMapTiles. Map tiles by OpenFreeMap. Satellite imagery by Esri, Maxar, Earthstar Geographics, and the GIS User Community.</p>
        <p>Address search by Stadia Maps, with Photon by Komoot as a backup. Geocoding data © OpenStreetMap contributors, OpenAddresses, and Who’s On First.</p>
        <p>Trip plans are calculated with OpenTripPlanner.</p>
        <p>All transit data is provided as is, without warranty. Times are estimates. Confirm important trips with the agency.</p>
        <p>Rove is not affiliated with or endorsed by BART, SFMTA, VTA, AC Transit, Caltrain, or MTC.</p>
        <p>Typeface: Atkinson Hyperlegible Next, licensed under the SIL Open Font License 1.1.</p>
      </div>
    </section>`;
}


/* Per-agency statement of what trip planning on this server uses: live predictions or schedules only. */
function liveCoverageHtml() {
  const verified = state.planStatus?.liveVerified;
  if (!verified) return '';
  const rows = state.network.agencies.map(a => {
    const live = verified[a.id] === true; // only an explicit server confirmation counts as live
    return `<li><span>${esc(AGENCY_SHORT[a.id] || a.name)}</span><strong>${live ? 'Live predictions where available' : 'Scheduled times only'}</strong></li>`;
  }).join('');
  return `<ul class="rg-coverage" aria-label="Trip planning data by agency">${rows}</ul><p class="empty">Route plans on this server say "Scheduled times, not live" whenever live data is not used.</p>`;
}
function formatGtfsDate(value) {
  if (!/^\d{8}$/.test(value || '')) return 'unknown';
  const d = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00-08:00`);
  return dateFormat.format(d);
}

/* ---------- Planner ---------- */
function placeFromStop(agencyId, stopId) {
  const place = placeFor(agencyId, stopId);
  if (!place) return null;
  return { kind: 'stop', name: place.s.n, lat: place.s.p[1], lon: place.s.p[0], agency: place.a.id, stop: place.s.id };
}

function currentLocationPlace() {
  return state.userLocation && inServiceArea({ lat: state.userLocation[1], lon: state.userLocation[0] }) ? { kind: 'location', name: 'Your location', lat: state.userLocation[1], lon: state.userLocation[0] } : null;
}

function openPlan({ from, to } = {}) {
  closePopovers();
  clearSearchField();
  const plan = state.plan;
  if (from !== undefined) { plan.from = from; plan.draft.from = ''; }
  if (to !== undefined) { plan.to = to; plan.draft.to = ''; }
  if (!plan.from && !plan.draft.from && state.userLocation) plan.from = currentLocationPlace();
  plan.results = null; plan.error = null; plan.errorField = null; plan.focus = null; plan.query = '';
  pushView({ name: 'plan' }, { detent: 'full' });
  fetchPlanStatus();
  updatePlanMarkers();
  // The voice flow manages its own focus (listening state, then the first match).
  requestAnimationFrame(() => { if (plan.voice) return; if (!plan.to) $('#planTo')?.focus(); else if (!plan.from) $('#planFrom')?.focus(); });
}



function viewPlan() {
  const plan = state.plan;
  const status = state.planStatus;
  const field = (id, which, label) => {
    const value = plan[which]?.name || plan.draft[which] || '';
    return `<label class="plan-field${plan.errorField === which ? ' invalid' : ''}"><span class="marker"><i></i></span><span class="visually-hidden">${label}</span>
    <input id="${id}" data-plan-field="${which}" value="${esc(value)}" placeholder="${label}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="${which === 'to' ? 'search' : 'next'}" role="combobox" aria-autocomplete="list" aria-controls="planSuggest" aria-expanded="${plan.focus === which}" ${plan.errorField === which ? 'aria-invalid="true" aria-describedby="planError"' : ''} /></label>`;
  };
  const hasFrom = Boolean(plan.from || plan.draft.from.trim());
  const hasTo = Boolean(plan.to || plan.draft.to.trim());
  const coverage = planCoverageIssue();
  const driveOk = driveSupported('CAR_PARKING');
  const dropOk = driveSupported('CAR_DROP_OFF');
  const access = driveSupported(plan.access) ? plan.access : 'WALK';
  let submit;
  if (status && !status.available) submit = '';
  else if (coverage) submit = `<p class="plan-coverage" role="status">${esc(coverage.text)}</p>`;
  else if (hasFrom && hasTo) submit = `<button type="submit" class="button primary block plan-submit" ${plan.loading ? 'aria-busy="true" disabled' : ''}>${plan.loading ? 'Finding routes' : 'Find routes'}</button>`;
  else submit = `<p class="caption plan-hint">${hasFrom ? 'Enter a destination address, place, or stop to see routes.' : hasTo ? 'Enter a starting address, place, or stop to see routes.' : 'Enter a starting point and a destination. Any Bay Area address, place, or stop works.'}</p>`;
  const modeButton = (key, icon, label) => `<button type="button" class="seg-option mode-option" data-action="first-mile" data-first-mile="${key}" aria-pressed="${access === key}" ${key === 'CAR_PARKING' && !driveOk ? 'aria-disabled="true" aria-describedby="driveNote"' : ''}>${icon}<span>${label}</span></button>`;
  return `${backHeader()}
    <div class="hero" style="padding-bottom:8px"><h1 class="title-2">Directions</h1></div>
    <div id="planNotice">${planNoticeHtml()}</div>
    <div class="rg-voice-row"><button type="button" class="rg-mic" data-action="voice-destination" aria-label="Speak destination">${MIC_ICON}<span>Speak</span></button><div class="rg-voice-slot">${voiceStatusHtml()}</div></div>
    <form class="plan-form${plan.focus ? ' suggesting' : ''}" data-plan-form novalidate>
      <div class="plan-fields">
        ${field('planFrom', 'from', 'Starting point')}
        ${field('planTo', 'to', 'Destination')}
        <button type="button" class="swap-button" data-action="plan-swap" aria-label="Swap starting point and destination">${ICONS.swap}</button>
      </div>
      <div id="planSuggest" class="plan-suggest" role="listbox" aria-label="Suggestions"></div>
      <div class="plan-body">
        ${coverage ? '' : `<div class="plan-options">
          ${driveOk || dropOk ? `<div class="segmented mode-switch${dropOk ? ' three' : ''}" role="group" aria-label="Getting to transit">${modeButton('WALK', MODE_ICONS.walk, 'Walk')}${driveOk ? modeButton('CAR_PARKING', MODE_ICONS.car, 'Drive') : ''}${dropOk ? modeButton('CAR_DROP_OFF', MODE_ICONS.car, 'Drop-off') : ''}</div>` : ''}
          <label class="time-select"><span class="visually-hidden">When</span><select id="planTimeMode">
            <option value="now" ${plan.timeMode === 'now' ? 'selected' : ''}>Leave now</option>
            <option value="depart" ${plan.timeMode === 'depart' ? 'selected' : ''}>Depart at</option>
            <option value="arrive" ${plan.timeMode === 'arrive' ? 'selected' : ''}>Arrive by</option>
          </select></label>
          ${plan.timeMode !== 'now' ? `<input type="datetime-local" id="planDateTime" aria-label="Date and time" class="${plan.errorField === 'time' ? 'invalid' : ''}" value="${esc(plan.dateTime || localInputValue(new Date()))}" />` : ''}
        </div>
        ${plan.driveNote && !driveOk ? '<p class="caption plan-hint" id="driveNote" role="status">Driving to a station is not available yet. Rove plans walking connections to transit today.</p>' : ''}
        ${access === 'CAR_PARKING' ? `<p class="caption plan-hint">Rove plans a drive to a park-and-ride lot, then transit from there. ${driveLimitText()}Parking availability is not known.</p>` : ''}
        ${access === 'CAR_DROP_OFF' ? `<p class="caption plan-hint">Rove plans a drive to a street near the station, where you are dropped off, then transit from there. ${driveLimitText()}</p>` : ''}`}
        ${submit}
        ${plan.loading ? '<ul class="itineraries skeleton-list" aria-hidden="true">' + '<li><div class="itinerary"><span class="sk sk-line"></span><span class="sk sk-bar"></span><span class="sk sk-line short"></span></div></li>'.repeat(3) + '</ul>' : ''}
        ${plan.error ? `<div class="plan-error-group"><p class="empty plan-error" id="planError" role="alert">${esc(plan.error)}</p>${plan.noServiceWindow && plan.later?.length ? `<button class="button secondary plan-later" type="button" data-action="plan-show-later">Show the ${esc(clock(new Date(plan.later[0].startTime)))} trip</button>` : plan.noServiceWindow && plan.timeMode === 'now' ? '<button class="button secondary plan-later" type="button" data-action="plan-next-morning">Try tomorrow at 8:15 AM</button>' : ''}</div>` : ''}
      </div>
    </form>`;
}

/* "Drives are limited to 20 minutes and do not include traffic. " from /api/v2/status. */
function driveLimitText() {
  const max = state.planStatus?.maxDriveMinutes;
  return max ? `Drives are limited to ${max} minutes and do not include traffic. ` : 'Drive times do not include traffic. ';
}

/* Driving to a park-and-ride lot needs the server to say it can route it (/api/v2/status). */

/* Fills the suggestion list for the focused trip field without re-rendering the inputs. */



function localInputValue(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/* Converts "2026-10-23T17:30" in Pacific time to an ISO string with the correct offset. */
function pacificIso(localValue) {
  const [d, t] = localValue.split('T');
  const guess = new Date(`${d}T${t}:00Z`);
  const offsetName = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset' }).formatToParts(guess).find(p => p.type === 'timeZoneName')?.value || 'GMT-8';
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(offsetName);
  const hours = m ? Number(m[1]) : -8, mins = m?.[2] ? Number(m[2]) : 0;
  const sign = hours < 0 ? '-' : '+';
  return `${d}T${t}:00${sign}${String(Math.abs(hours)).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

async function submitPlan() {
  const plan = state.plan;
  if (plan.loading) return;
  if (plan.timeMode !== 'now') plan.dateTime = $('#planDateTime')?.value || plan.dateTime || localInputValue(new Date());
  plan.focus = null;
  document.activeElement?.blur?.();
  plan.loading = true; plan.error = null; plan.errorField = null; plan.noServiceWindow = false;
  render();
  try {
    for (const which of ['from', 'to']) {
      if (!plan[which] && plan.draft[which].trim()) {
        plan[which] = await resolveDraft(which);
        plan.draft[which] = '';
        rememberPlace(plan[which]);
      }
    }
    if (!plan.from || !plan.to) throw new PlanError(plan.from ? 'Enter a destination.' : 'Enter a starting point.', plan.from ? 'to' : 'from');
    const coverage = planCoverageIssue();
    if (coverage) { plan.loading = false; render(); return; }
    if (distanceMeters([plan.from.lon, plan.from.lat], [plan.to.lon, plan.to.lat]) < 30) throw new PlanError('The starting point and destination are the same place.', 'to');
    const params = new URLSearchParams({
      fromLat: plan.from.lat.toFixed(6), fromLon: plan.from.lon.toFixed(6), fromName: plan.from.name,
      toLat: plan.to.lat.toFixed(6), toLon: plan.to.lon.toFixed(6), toName: plan.to.name, limit: '5'
    });
    const requestTime = plan.timeMode === 'now' ? new Date() : new Date(pacificIso(plan.dateTime));
    if (plan.timeMode !== 'now') params.set('time', pacificIso(plan.dateTime));
    const access = plan.access !== 'WALK' && driveSupported(plan.access) ? plan.access : 'WALK';
    if (access !== 'WALK') params.set('access', access);
    if (plan.timeMode === 'arrive') params.set('arriveBy', 'true');
    render();
    const response = await fetch(`/api/v2/plan?${params}`, { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(35000) : undefined });
    const body = await response.json().catch(() => null);
    // The planner answers 404 with an empty itinerary list when there is no route; that is not an outage.
    plan.later = (body?.laterItineraries || []).map(normalizeItinerary).filter(it => it.legs.length);
    if (response.status === 404 && Array.isArray(body?.itineraries)) throw new PlanError(noRouteMessage(body), null, false, body?.errors?.[0]?.code);
    if (!response.ok) {
      const err = planErrorMessage(response.status, body);
      if (err.offline) state.planStatus = { available: false, reason: response.status === 404 ? 'missing' : 'ROUTING_UNAVAILABLE', checkedAt: Date.now() };
      throw new PlanError(err.text, err.which, Boolean(err.offline));
    }
    const itineraries = (body?.itineraries || []).map(normalizeItinerary).filter(it => it.legs.length);
    plan.later = (body?.laterItineraries || []).map(normalizeItinerary).filter(it => it.legs.length);
    if (!itineraries.length) throw new PlanError(noRouteMessage(body), null, false, body?.errors?.[0]?.code);
    // Driving notes only apply when an option actually includes a drive (a short trip may be walk-only).
    const hasDrive = itineraries.some(it => it.legs.some(l => l.mode === 'CAR'));
    plan.results = { itineraries, notes: Array.isArray(body.routing?.notes) ? body.routing.notes.filter(n => typeof n === 'string' && (hasDrive || !/driv|parking|drop-off/i.test(n))) : [], request: { time: body.request?.time || requestTime.toISOString(), arriveBy: plan.timeMode === 'arrive', access }, scheduledOnly: body.routing?.realtime !== 'partial' };
    plan.sort = 'fastest';
    plan.expanded = sortedItineraryIndexes()[0];
    plan.loading = false;
    state.focusLeg = null;
    state.journey = itineraries[plan.expanded];
    pushView({ name: 'results' }, { detent: 'half' });
    renderJourney(); revealJourney(); applyMapState(); updatePlanMarkers(); fitJourney(state.journey);
    const best = sortedItineraryIndexes()[0];
    announceAccess(`${plural(Math.min(itineraries.length, 3), 'route')} found. ${routeChoiceSpeech(itineraries[best], 1)}`);
  } catch (error) {
    plan.loading = false;
    // An outage is already explained by the planner notice above the form (with Check again), so it is not repeated below.
    if (error instanceof PlanError) { plan.error = error.offline ? null : error.message; plan.errorField = error.field || null; plan.noServiceWindow = error.code === 'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW'; }
    else plan.error = error?.name === 'TimeoutError' ? 'The trip planner took too long to respond. Please try again.' : 'Rove could not reach the trip planner. Check your connection and try again.';
    if (currentView().name === 'plan') render();
  }
}


class PlanError extends Error {
  constructor(message, field = null, offline = false, code = null) { super(message); this.field = field; this.offline = offline; this.code = code; }
}


function fitJourney(it) {
  const coords = [];
  for (const leg of it?.legs || []) {
    const c = leg.geometry?.coordinates;
    if (Array.isArray(c) && c.length) coords.push(...c); else coords.push([leg.from?.lon, leg.from?.lat], [leg.to?.lon, leg.to?.lat]);
  }
  requestAnimationFrame(() => fitCoordinates(coords, 15));
}

const legStart = leg => new Date(leg.startTime);
const legEnd = leg => new Date(leg.endTime);
function legInfo(leg) {
  const agencyId = idx.agencies.has(leg.agencyId) ? leg.agencyId : null;
  const color = normalizeColor(leg.routeColor, '#3d4046');
  const known = agencyId && leg.routeId ? idx.routes.get(routeKey(agencyId, leg.routeId)) : null;
  const fallbackBadge = agencyId === 'caltrain' && leg.tripShortName ? `Train ${leg.tripShortName}` : leg.routeName || 'Transit';
  return {
    agencyId,
    color: known?.color || color,
    text: known?.text || readableText(color, normalizeColor(leg.routeTextColor, '#ffffff')),
    badge: known ? (agencyId === 'caltrain' && leg.tripShortName ? `${known.badge} ${leg.tripShortName}` : known.badge) : fallbackBadge,
    title: known?.title || displayName(leg.routeLongName || leg.routeName || 'Transit')
  };
}


function journeyBar(it) {
  const parts = [];
  for (const leg of it.legs || []) {
    if (isTransit(leg)) {
      if (leg.staySeated) continue;
      const li = legInfo(leg);
      parts.push(`<span class="js-item${leg.canceled ? ' canceled' : ''}">${modeIcon(leg)}<span class="badge" style="background:${esc(li.color)};color:${esc(li.text)}">${esc(li.badge)}</span></span>`);
    } else {
      const min = legMinutes(leg);
      // Short walks between two rides are implied by the transfer; the first and last walks always show.
      const at = it.legs.indexOf(leg);
      if (leg.mode === 'WALK' && min < 4 && at > 0 && at < it.legs.length - 1) continue;
      parts.push(`<span class="js-item js-${leg.mode === 'CAR' ? 'drive' : 'walk'}">${modeIcon(leg)}<span>${min}</span></span>`);
    }
  }
  return `<div class="journey-strip" aria-hidden="true">${parts.join('<span class="js-sep"></span>')}</div>`;
}



function itinerarySummary(it) {
  const legs = it.legs || [];
  const transitLegs = legs.filter(isTransit);
  if (!transitLegs.length) return esc(`Walk the whole way · ${distanceLabel(it.walkMeters || 0)}`);
  const first = transitLegs[0];
  const transfers = Number.isFinite(it.transfers) ? it.transfers : Math.max(0, transitLegs.filter(l => !l.staySeated).length - 1);
  const leaveIn = Math.round((new Date(it.startTime) - Date.now()) / 60000);
  const leave = leaveIn <= 0 ? 'Leave now' : leaveIn < 60 ? `Leave in ${leaveIn} min` : `Leave at ${clock(new Date(it.startTime))}`;
  const firstIdx = legs.indexOf(first);
  const lastIdx = legs.indexOf(transitLegs.at(-1));
  const sumMin = list => Math.round(list.reduce((s, l) => s + (l.durationSeconds ?? (legEnd(l) - legStart(l)) / 1000), 0) / 60);
  const before = legs.slice(0, firstIdx), after = legs.slice(lastIdx + 1);
  const drive = sumMin(before.filter(l => l.mode === 'CAR'));
  const walkBefore = sumMin(before.filter(l => l.mode === 'WALK'));
  const walkAfter = sumMin(after.filter(l => l.mode === 'WALK'));
  const wait = Number.isFinite(it.waitingSeconds) ? Math.round(it.waitingSeconds / 60) : null;
  const line1 = `${leave} · ${first.from?.name || 'first stop'} at ${clock(legStart(first))}`;
  const facts = [];
  if (drive) facts.push(`${drive} min drive`);
  if (walkBefore) facts.push(`${walkBefore} min walk to start`);
  facts.push(transfers === 0 ? 'No transfers' : plural(transfers, 'transfer'));
  if (wait && wait >= 2) facts.push(`${wait} min waiting`);
  if (walkAfter) facts.push(`${walkAfter} min walk at end`);
  let html = `<span class="it-line">${it.usesRealtime ? ICONS.live : ''}${esc(line1)}</span><span class="it-line">${esc(facts.join(' · '))}</span>`;
  const flags = [];
  if (it.hasCancellation) flags.push('<span class="status-canceled">Includes a canceled trip</span>');
  if (legs.some(l => l.alerts?.length)) flags.push(`<span class="status-late">${ICONS.alert}Service alert</span>`);
  if (flags.length) html += `<span class="it-line">${flags.join(' · ')}</span>`;
  return html;
}




function viewResults() {
  const plan = state.plan;
  const its = plan.results?.itineraries || [];
  const when = plan.results?.request?.time ? clock(new Date(plan.results.request.time)) : '';
  const order = sortedItineraryIndexes();
  const fastestIndex = sortedItineraryIndexes('fastest')[0];
  const sortButton = (key, label) => `<button type="button" class="seg-option" data-action="it-sort" data-sort="${key}" aria-pressed="${(plan.sort || 'fastest') === key}">${label}</button>`;
  const firstMile = { CAR_PARKING: 'Drive to transit', CAR_DROP_OFF: 'Drop-off at transit' }[plan.results?.request?.access] || 'Walk to transit';
  return `${backHeader()}
    <h1 class="visually-hidden">Routes from ${esc(plan.from?.name)} to ${esc(plan.to?.name)}</h1>
    <div class="trip-card">
      <div class="trip-ends"><p><span class="marker"><i></i></span><span>${esc(plan.from?.name)}</span></p><p><span class="marker to"><i></i></span><span>${esc(plan.to?.name)}</span></p></div>
      <button type="button" class="text-button" data-action="back">Edit</button>
    </div>
    ${plan.results?.demo ? '<p class="rg-note rg-results-demo"><strong>Demo.</strong> Times are copied from published Muni and BART timetables and shifted to start now. Nothing is live.</p>' : ''}
    <div class="rg-results-head"><h2 class="rg-label">${plural(Math.min(order.length, plan.showAll ? order.length : 3), 'route')}</h2><button type="button" class="rg-read" data-action="access-all-routes">${MIC_ICON}<span>Read route choices aloud</span></button></div>
    <p class="caption results-when">${esc(firstMile)} · ${plan.timeMode === 'arrive' ? 'Arrive by' : plan.timeMode === 'depart' ? 'Depart at' : 'Leaving'} ${esc(when)}${plan.results?.scheduledOnly ? ' · Scheduled times' : ''}</p>
    ${plan.results?.notes?.length ? `<ul class="route-notes">${plan.results.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${areaNoteHtml()}
    ${its.length > 1 ? `<div class="segmented sort-switch" role="group" aria-label="Sort routes">${sortButton('fastest', 'Fastest')}${sortButton('transfers', 'Fewer transfers')}${sortButton('walking', 'Less walking')}</div>` : ''}
    <ul class="itineraries">${order.slice(0, plan.showAll ? order.length : 3).map((i, n) => {
      const it = its[i];
      const open = plan.expanded === i;
      return `<li><button class="itinerary" data-action="it-toggle" data-index="${i}" aria-expanded="${open}" aria-label="${esc(routeChoiceSpeech(it, n + 1))}">
        <div class="it-top"><span class="it-duration">${esc(durationLabel(it.durationSeconds || (new Date(it.endTime) - new Date(it.startTime)) / 1000))}${its.length > 1 && i === fastestIndex ? '<span class="tag">Fastest</span>' : ''}</span><span class="it-times">${esc(clock(new Date(it.startTime)))} – ${esc(clock(new Date(it.endTime)))}</span></div>
        ${journeyBar(it)}
        <div class="it-meta">${itinerarySummary(it)}</div>${routeWarnings(it).length ? `<div class="rg-warn-tags">${routeWarnings(it).map(w => `<span>${esc(w)}</span>`).join('')}</div>` : ''}</button>${document.body.classList.contains('rove-accessible') ? `<button class="button secondary audio-route" data-action="access-route" data-index="${i}" aria-label="Listen to route ${n + 1} stop by stop">Listen to route ${n + 1}</button>` : ''}
        ${carbonComparison(it)}
        ${open ? `<div class="action-bar it-actions"><button class="button primary" data-action="nav-start" data-index="${i}">Start route ${n + 1}</button></div>${itineraryTimeline(it)}` : ''}</li>`;
    }).join('')}</ul>
    ${!plan.showAll && order.length > 3 ? `<button type="button" class="rg-text-button rg-more" data-action="it-more">Show ${plural(order.length - 3, 'more route')}</button>` : ''}
    <p class="note">${plan.results?.scheduledOnly ? 'These routes use published schedules. Check live departures at your stop before you leave.' : 'Live times are shown where agencies provide them. Other times are scheduled.'}</p>`;
}

/* True when the leg's line on the map is a straight join of its end stops, not the real route. */




function itineraryTimeline(it) {
  const items = [];
  const legs = it.legs || [];
  const focus = state.journey === it ? state.focusLeg : null;
  const legLink = (i, text) => `<button type="button" class="leg-link" data-action="leg-focus" data-leg="${i}" aria-pressed="${focus === i}">${esc(text)}</button>`;
  legs.forEach((leg, i) => {
    const focused = focus === i ? ' leg-focused' : '';
    if (leg.mode === 'CAR') {
      items.push(`<li class="${focused}" data-leg="${i}"><span class="t">${esc(clock(legStart(leg)))}</span><span class="rail drive"><span class="glyph">${MODE_ICONS.car}</span></span><span class="body">${legLink(i, `Drive${Number.isFinite(leg.distanceMeters) ? ` ${distanceLabel(leg.distanceMeters)}` : ''}`)}<span class="row-meta">About ${esc(durationLabel((legEnd(leg) - legStart(leg)) / 1000))} to ${esc(parkingLabel(leg, legs))}</span>${leg.to?.parking ? `<span class="row-meta">${leg.to.parkingCapacity ? `${esc(leg.to.parkingCapacity.toLocaleString('en-US'))} spaces mapped. ` : ''}Space availability is not known.</span>` : ''}${stepsListHtml(leg, 'Driving directions')}</span></li>`);
      return;
    }
    if (leg.mode === 'WALK') {
      const meters = Number.isFinite(leg.distanceMeters) ? leg.distanceMeters : null;
      const isLast = i === legs.length - 1;
      items.push(`<li class="${focused}" data-leg="${i}"><span class="t">${esc(clock(legStart(leg)))}</span><span class="rail walk"><span class="glyph">${MODE_ICONS.walk}</span></span><span class="body">${legLink(i, `Walk${meters ? ` ${distanceLabel(meters)}` : ''}`)}<span class="row-meta">About ${esc(durationLabel((legEnd(leg) - legStart(leg)) / 1000))}${isLast ? ` to ${esc(state.plan.to?.name || 'your destination')}` : ` to ${esc(leg.to?.name || 'the stop')}`}</span>${stepsListHtml(leg, 'Walking directions')}</span></li>`);
      return;
    }
    const li = legInfo(leg);
    const stopsCount = leg.intermediateStops ? leg.intermediateStops.length + 1 : null;
    const timing = leg.canceled ? '<span class="status-canceled">Canceled</span>' : leg.realtime ? `<span class="${delayStatus(leg.delaySeconds).cls}">${ICONS.live}${esc(delayStatus(leg.delaySeconds).text)}</span>` : 'Scheduled';
    const shapeNote = legShapeMissing(leg) ? '<span class="row-meta shape-note">Route shape not available. The map joins the boarding and exit stops with a dashed line.</span>' : '';
    if (!leg.staySeated) {
      items.push(`<li class="${focused}" data-leg="${i}" style="--leg-color:${esc(li.color)}"><span class="t">${esc(clock(legStart(leg)))}</span><span class="rail"><span class="node"></span></span><span class="body">
        ${legLink(i, leg.from?.name || 'Board')}
        <span class="row-meta leg-line">${modeIcon(leg)}<span class="badge" style="background:${esc(li.color)};color:${esc(li.text)}">${esc(li.badge)}</span>${leg.headsign ? `<span>To ${esc(displayName(leg.headsign))}</span>` : ''}</span>
        <span class="row-meta">${leg.from?.platform ? `Platform ${esc(leg.from.platform)} · ` : ''}${stopsCount ? `${plural(stopsCount, 'stop')} · ` : ''}${esc(durationLabel((legEnd(leg) - legStart(leg)) / 1000))} · ${timing}</span>
        ${shapeNote}${legAlertsHtml(leg)}</span></li>`);
    } else {
      items.push(`<li class="${focused}" data-leg="${i}" style="--leg-color:${esc(li.color)}"><span class="t"></span><span class="rail"></span><span class="body"><span class="row-meta leg-line">Stay on board. It continues as <span class="badge" style="background:${esc(li.color)};color:${esc(li.text)}">${esc(li.badge)}</span>${leg.headsign ? ` to ${esc(displayName(leg.headsign))}` : ''}</span>${shapeNote}</span></li>`);
    }
    const next = legs[i + 1];
    if (isTransit(next) && next.staySeated) return;
    if (!isTransit(next)) {
      items.push(`<li style="--leg-color:${esc(li.color)}"><span class="t">${esc(clock(legEnd(leg)))}</span><span class="rail"><span class="node"></span></span><span class="body"><strong>${esc(leg.to?.name || 'Get off')}</strong><span class="row-meta">Get off</span></span></li>`);
    } else {
      const wait = Math.round((legStart(next) - legEnd(leg)) / 60000);
      items.push(`<li style="--leg-color:${esc(li.color)}"><span class="t">${esc(clock(legEnd(leg)))}</span><span class="rail"><span class="node"></span></span><span class="body"><strong>${esc(leg.to?.name || 'Transfer')}</strong><span class="row-meta ${wait < 3 ? 'status-late' : ''}">Change here · ${wait <= 0 ? 'Tight connection' : `${plural(wait, 'minute')} to connect${wait < 3 ? ', tight' : ''}`}</span></span></li>`);
    }
  });
  items.push(`<li><span class="t">${esc(clock(new Date(it.endTime)))}</span><span class="rail end" style="--leg-color:var(--ink)"><span class="node"></span></span><span class="body"><strong>Arrive at ${esc(state.plan.to?.name || 'your destination')}</strong></span></li>`);
  return `<ol class="timeline">${items.join('')}</ol>`;
}

/* Highlights one leg on the map and in the list, and frames it. */

/* ---------- Step-by-step navigation ---------- */



function buildSteps(it) {
  const steps = [];
  for (const leg of it.legs || []) {
    if (leg.mode === 'CAR') {
      steps.push({ type: 'drive', leg, title: `Drive to ${parkingLabel(leg, it.legs)}`, big: durationLabel((legEnd(leg) - legStart(leg)) / 1000), meta: Number.isFinite(leg.distanceMeters) ? distanceLabel(leg.distanceMeters) : '' });
      continue;
    }
    if (leg.mode === 'WALK') {
      const last = leg === it.legs[it.legs.length - 1];
      steps.push({ type: 'walk', leg, title: last ? `Walk to ${state.plan.to?.name || 'your destination'}` : `Walk to ${leg.to?.name || 'the stop'}`, big: durationLabel((legEnd(leg) - legStart(leg)) / 1000), meta: Number.isFinite(leg.distanceMeters) ? distanceLabel(leg.distanceMeters) : '' });
      continue;
    }
    const li = legInfo(leg);
    const stopsCount = leg.intermediateStops ? leg.intermediateStops.length + 1 : null;
    const ride = { type: 'ride', leg, li, title: `Ride to ${leg.to?.name || 'your stop'}`, big: stopsCount ? plural(stopsCount, 'stop') : durationLabel((legEnd(leg) - legStart(leg)) / 1000), meta: `Get off at ${clock(legEnd(leg))}` };
    if (leg.staySeated) {
      steps.push({ ...ride, title: `Stay on board as it continues as ${li.badge}${leg.headsign ? ` to ${displayName(leg.headsign)}` : ''}. Ride to ${leg.to?.name || 'your stop'}.` });
      continue;
    }
    const where = `${leg.from?.name || 'the stop'}${leg.from?.platform ? `, platform ${leg.from.platform}` : ''}`;
    steps.push({ type: 'wait', leg, li, title: `Board ${li.badge}${leg.headsign ? ` to ${displayName(leg.headsign)}` : ''} at ${where}`, departs: legStart(leg) });
    steps.push(ride);
  }
  steps.push({ type: 'arrive', title: `You have arrived at ${state.plan.to?.name || 'your destination'}.` });
  return steps;
}



/* Navigation session UI, camera, and cautious replanning.
 * Foreground-only web navigation: browsers can suspend tracking while locked. */
let navMarker = null;
let navOrientationListener = null;
function navNormalizeBearing(degrees) { return ((degrees % 360) + 360) % 360; }
function navAngularDelta(a, b) { return ((b - a + 540) % 360) - 180; }
function navOrientationHeading(event) {
  // Safari provides a north-referenced compass heading; other browsers may expose
  // absolute alpha. Relative alpha alone is not a reliable compass.
  if (Number.isFinite(event.webkitCompassHeading) &&
      (!Number.isFinite(event.webkitCompassAccuracy) || event.webkitCompassAccuracy <= 35))
    return navNormalizeBearing(event.webkitCompassHeading);
  if (event.absolute === true && Number.isFinite(event.alpha)) {
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    return navNormalizeBearing(360 - event.alpha + angle);
  }
  return null;
}
function stopNavOrientation() {
  if (navOrientationListener) window.removeEventListener('deviceorientation', navOrientationListener, true);
  navOrientationListener = null;
}
async function enableNavCompass() {
  const nav = state.nav;
  if (!nav || typeof DeviceOrientationEvent === 'undefined') {
    if (nav) { nav.status = 'Compass unavailable; using GPS travel direction.'; render(); }
    return;
  }
  try {
    // iOS requires this call inside a direct user gesture.
    if (typeof DeviceOrientationEvent.requestPermission === 'function' &&
        await DeviceOrientationEvent.requestPermission() !== 'granted') {
      nav.status = 'Compass denied; using GPS travel direction.'; render(); return;
    }
    stopNavOrientation();
    nav.compassEnabled = true;
    navOrientationListener = event => {
      if (state.nav !== nav) return;
      const raw = navOrientationHeading(event);
      if (!Number.isFinite(raw)) return;
      const now = Date.now();
      if (now - (nav.lastCompassAt || 0) < 130) return;
      nav.lastCompassAt = now;
      const previous = nav.compassHeading;
      nav.compassHeading = Number.isFinite(previous)
        ? navNormalizeBearing(previous + navAngularDelta(previous, raw) * 0.28) : raw;
      if (nav.fix) {
        updateNavMarker(nav.fix, nav.compassHeading);
        if (nav.follow && nav.headingUp) navFollowCamera();
      }
    };
    window.addEventListener('deviceorientation', navOrientationListener, true);
    nav.status = 'Compass on · keep your phone upright for heading-up navigation.';
    render();
  } catch {
    nav.status = 'Compass unavailable; using GPS travel direction.';
    render();
  }
}

function updateNavMarker(fix, heading) {
  const map = state.map;
  if (!map || typeof maplibregl === 'undefined') return;
  if (!navMarker) {
    const el = document.createElement('div');
    el.className = 'rove-nav-avatar';
    el.setAttribute('aria-label', 'Your live location');
    el.innerHTML = '<span class="rove-nav-halo"></span><span class="rove-nav-direction"></span><span class="rove-nav-dot"></span>';
    navMarker = new maplibregl.Marker({ element: el, anchor: 'center', rotationAlignment: 'map' }).setLngLat(fix.point).addTo(map);
  }
  navMarker.setLngLat(fix.point);
  // Marker rotation follows heading independently from the map's rotating camera.
  if (Number.isFinite(heading)) navMarker.setRotation(heading);
}
function navFollowCamera() {
  const nav = state.nav, map = state.map;
  if (!nav?.follow || !nav.fix || !map || document.hidden) return;
  const direction = Number.isFinite(nav.compassHeading) ? nav.compassHeading : nav.heading;
  const bearing = nav.headingUp && Number.isFinite(direction) ? direction : 0;
  // The user's dot sits below center, leaving more of the upcoming route visible.
  const mobile = isMobile();
  const offset = nav.headingUp ? [0, mobile ? 95 : 85] : [0, 0];
  const last = nav.lastCameraAt || 0;
  const now = Date.now();
  if (now - last < 240) return;
  nav.lastCameraAt = now;
  map.easeTo({ center: nav.fix.point, bearing, pitch: nav.headingUp ? 50 : 0,
    zoom: Math.max(map.getZoom(), nav.headingUp ? 17 : 15.5),
    offset, duration: motionMs(550), essential: true });
}
function navChangeFollow(what) {
  const nav = state.nav;
  if (!nav) return;
  if (what === 'overview') { nav.follow = false; nav.status = 'Map overview. Tap Follow to recenter.'; fitJourney(nav.it); }
  else if (what === 'bearing') { nav.headingUp = !nav.headingUp; nav.follow = true; nav.lastCameraAt = 0; navFollowCamera(); }
  else { nav.follow = true; nav.status = 'Following your location'; nav.lastCameraAt = 0; navFollowCamera(); }
  render();
}
function routeLegDistance(nav, point) {
  const step = nav.steps[nav.i];
  if (!step || !['walk', 'drive'].includes(step.type)) return null;
  const coords = step.leg.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2 || (step.leg.mode === 'TRANSIT' && legShapeMissing(step.leg))) return null;
  return RoveNavigation.distanceToPolyline(point, coords);
}
function maybeAdvanceNavigation(nav, fix) {
  const step = nav.steps[nav.i];
  if (!step?.leg || step.type === 'arrive') return;
  const here = fix.point;
  const target = [step.leg.to?.lon, step.leg.to?.lat];
  if (!target.every(Number.isFinite)) return;
  const radius = step.type === 'walk' ? 28 + Math.min(fix.accuracy, 25) :
    step.type === 'drive' ? 65 + Math.min(fix.accuracy, 30) : 100 + Math.min(fix.accuracy, 30);
  // A low-accuracy GPS point should never silently advance an itinerary.
  if (fix.accuracy > 55) return;
  const rideNearArrival = step.type !== 'ride' || Date.now() >= legEnd(step.leg).getTime() - 3 * 60000;
  if ((step.type === 'walk' || step.type === 'drive' || step.type === 'ride') && rideNearArrival &&
      RoveNavigation.meters(here, target) < radius) {
    nav.i = Math.min(nav.i + 1, nav.steps.length - 1);
    nav.maneuver = null; nav.spokenKey = null;
    render();
  }
  // Boarding cannot be inferred merely because a train departed on the schedule.
}
async function navReroute(nav) {
  if (state.nav !== nav || nav.rerouting || !nav.destination || !nav.fix || !navigator.onLine) return;
  const destination = nav.destination;
  nav.rerouting = true;
  nav.rerouteAt = Date.now();
  nav.offRouteFixes = 0;
  nav.status = 'Calculating a new route from your location…';
  const controller = new AbortController();
  nav.controller = controller;
  const timeout = setTimeout(() => controller.abort(), 25000);
  render();
  try {
    const query = new URLSearchParams({
      fromLat: nav.fix.point[1].toFixed(6), fromLon: nav.fix.point[0].toFixed(6), fromName: 'Your location',
      toLat: Number(destination.lat).toFixed(6), toLon: Number(destination.lon).toFixed(6),
      toName: destination.name || 'Destination', limit: '3'
    });
    if (nav.access !== 'WALK') query.set('access', nav.access);
    const response = await fetch('/api/v2/plan?' + query, { signal: controller.signal, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.itineraries?.length) throw new Error('No replacement route available');
    const alternatives = body.itineraries.map(normalizeItinerary).filter(it => it.legs.length && !it.hasCancellation);
    if (!alternatives.length) throw new Error('No usable replacement route available');
    if (state.nav !== nav) return;
    nav.it = alternatives[0];
    nav.steps = buildSteps(nav.it);
    nav.i = 0; nav.maneuver = null; nav.spokenKey = null; nav.showHelp = false;
    nav.guide = guideFor(nav.it, nav.destination?.name);
    nav.gs = Guide.createState(nav.guide, navNow(nav));
    state.journey = nav.it;
    nav.status = 'Route updated from your current location';
    nav.error = null;
    renderJourney(); applyMapState();
    guideEnter(nav, 'New route from your location.');
    navFollowCamera();
  } catch (error) {
    if (state.nav !== nav) return;
    nav.error = 'Rove could not find another route right now.';
    nav.status = nav.error;
    guideSay(`${nav.error} ${navigator.onLine ? 'Ask transit staff for help, or try again in a minute.' : 'You are offline. Try again when you have a connection.'}`, { force: true });
    updateGuideLive();
  } finally {
    clearTimeout(timeout);
    if (state.nav === nav) { nav.rerouting = false; nav.controller = null; }
  }
}

/* Spoken directions are off by default, and announce only grounded OTP steps. */
function speakNav(text) {
  const nav = state.nav;
  if (!nav?.voice || !nav.speechAllowed || document.hidden) return;
  speakOut(text);
}
function toggleNavVoice() {
  const nav = state.nav;
  if (!nav) return;
  if (!speaker?.supported()) {
    nav.status = 'Voice guidance is not supported by this browser.';
    render();
    return;
  }
  nav.voice = !nav.voice;
  nav.speechAllowed = nav.voice;
  nav.spokenKey = null;
  if (!nav.voice) stopSpeaking();
  else {
    const next = nav.maneuver;
    if (next?.step && next.metersAhead <= 350) {
      speakNav('In ' + Math.max(10, Math.round(next.metersAhead / 10) * 10) + ' meters, ' + stepText(next.step));
      nav.spokenKey = String(nav.i) + ':' + next.index;
    } else speakNav('Voice guidance on.');
  }
  render();
}
function updateNavManeuver(nav, fix) {
  const step = nav.steps[nav.i];
  if (!step || !['walk', 'drive'].includes(step.type) ||
      fix.accuracy > 55 || !Array.isArray(step.leg.geometry?.coordinates)) {
    nav.maneuver = null;
    return;
  }
  const next = RoveNavigation.nextManeuver(
    fix.point, step.leg.geometry.coordinates, step.leg.steps || []
  );
  if (!next || next.offRouteMeters > Math.max(65, fix.accuracy * 2)) {
    nav.maneuver = null;
    return;
  }
  nav.maneuver = next;
  if (!next.step) return;
  const key = String(nav.i) + ':' + next.index;
  if (nav.voice && key !== nav.spokenKey && next.metersAhead <= 170) {
    const lead = next.metersAhead >= 25
      ? 'In ' + Math.round(next.metersAhead / 10) * 10 + ' meters, ' : '';
    speakNav(lead + stepText(next.step));
    nav.spokenKey = key;
  }
}

function startNavigation(index) {
  const it = state.plan.results?.itineraries?.[index];
  if (!it) return;
  beginNav(it, { destination: state.plan.to, access: state.plan.results?.request?.access || 'WALK', demo: Boolean(state.plan.results?.demo) });
}

function releaseWakeLock() {
  stopNavOrientation();
  stopSpeaking();
  try { state.wakeLock?.release(); } catch { /* already released */ }
  state.wakeLock = null;
  const nav = state.nav;
  nav?.controller?.abort();
  if (nav?.watchId != null) { navigator.geolocation.clearWatch(nav.watchId); nav.watchId = null; nav.tracking = false; }
  navMarker?.remove(); navMarker = null;
  if (state.map) state.map.easeTo({ bearing: 0, pitch: 0, duration: 0 });
}

function focusStep() {
  const step = state.nav?.steps[state.nav.i];
  if (!step?.leg) { fitJourney(state.nav?.it); return; }
  const c = step.leg.geometry?.coordinates;
  if (step.type === 'wait') fitCoordinates([[step.leg.from?.lon, step.leg.from?.lat]], 16);
  else fitCoordinates(Array.isArray(c) && c.length ? c : [[step.leg.from?.lon, step.leg.from?.lat], [step.leg.to?.lon, step.leg.to?.lat]], 16);
}

/* ---------- Guided journey: voice destination, confirmed steps, help, demo ----------
 * The journey rules live in public/js/journey-guide.js (tested in test/journey-guide.test.mjs).
 * This section only renders them and wires rider actions. Never re-render the navigation view
 * on timers or GPS: replacing the DOM moves VoiceOver focus. Use updateGuideLive() instead. */
const Guide = window.RoveJourneyGuide;
const TRIP_KEY = 'rove-active-trip-v1';
const rgClock = ms => clock(new Date(ms));
const navNow = nav => Date.now() + (nav?.clockOffset || 0);
const MIC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';
const SEARCH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>';

function guideFor(it, destinationName) { return Guide.buildGuide(it, { destinationName, clock: rgClock }); }
function guidePhase(nav = state.nav) { return nav?.gs ? nav.guide.phases[nav.gs.index] : null; }
function guideSpeech(phase) { return Guide.speech(phase, { clock: rgClock }); }

/* Rove's voice when the rider wants it, otherwise the screen reader. `force` is for explicit
 * requests such as Repeat, which always try to speak. */
function guideSay(text, { force = false } = {}) {
  if ((force || accessPreference('speak', true)) && speakOut(text)) return;
  announceAccess(text);
}

function navFixQuality(nav) {
  const f = nav?.fix;
  if (nav?.demo || !f || Date.now() - f.time > 30000) return null;
  return f.accuracy <= 30 ? 'good' : 'poor';
}

/* Keep the legacy step index (used by the map camera and off-route checks) aligned with the guide. */
function syncNavSteps(nav) {
  const phase = guidePhase(nav);
  if (!phase) return;
  const leg = nav.it.legs[phase.legIndex];
  const idx = nav.steps.findIndex(s => s.leg === leg && (phase.kind !== 'ride' || s.type === 'ride'));
  nav.i = idx >= 0 ? idx : nav.steps.length - 1;
}

function saveTrip(nav = state.nav) {
  if (!nav?.gs) return;
  const { index, history, given, snoozeUntil, startedAt } = nav.gs;
  store.set(TRIP_KEY, { v: 1, savedAt: Date.now(), it: nav.it, destination: nav.destination, access: nav.access, demo: nav.demo, clockOffset: nav.clockOffset || 0, gs: { index, history, given, snoozeUntil, startedAt } });
}
function loadTrip() {
  const t = store.get(TRIP_KEY, null);
  if (!t || t.v !== 1 || !Array.isArray(t.it?.legs) || !t.it.legs.length || !Number.isInteger(t.gs?.index)) return null;
  const end = Date.parse(t.it.endTime);
  if (Date.now() - t.savedAt > 12 * 3600e3 || !Number.isFinite(end) || Date.now() + (t.clockOffset || 0) > end + 2 * 3600e3) { clearTrip(); return null; }
  return t;
}
function clearTrip() { try { localStorage.removeItem(TRIP_KEY); } catch { /* storage unavailable */ } }

function guideStatus(nav) {
  const phase = guidePhase(nav);
  if (!phase) return null;
  if (nav.alert && nav.alert.index === nav.gs.index) return nav.alert;
  const now = navNow(nav);
  if (phase.kind === 'board') {
    const st = Guide.departureStatus(nav.gs, now, { clock: rgClock });
    return st && { message: st.message, level: st.state === 'maybe-missed' || st.state === 'canceled' ? 'uncertain' : 'info' };
  }
  if (phase.kind === 'ride' && phase.arrives != null) {
    const m = Math.round((phase.arrives - now) / 60000);
    return { message: m > 0 ? `About ${plural(m, 'minute')} to ${phase.place}, ${phase.live ? 'live time' : 'by the schedule'}.` : `${phase.place} is expected about now. Listen for the announcement.`, level: 'info' };
  }
  return null;
}
function guideCertainty(nav) {
  const phase = guidePhase(nav);
  const base = nav.demo ? (phase?.kind === 'arrive' ? '' : 'Demo: simulated times, location not used.') : Guide.certainty(phase, navFixQuality(nav));
  return `${base}${!navigator.onLine ? ' You are offline; your steps still work, new routes need a connection.' : ''}`.trim();
}

/* Patch the live text in place (timers, GPS, connectivity). Never replaces focused elements. */
function updateGuideLive() {
  const nav = state.nav;
  if (!nav?.gs || currentView().name !== 'navigate') return;
  const status = guideStatus(nav);
  const el = document.getElementById('rgStatus');
  if (el) { el.textContent = status?.message || ''; el.dataset.level = status?.level || 'info'; el.hidden = !status; }
  const c = document.getElementById('rgCertainty');
  if (c) c.textContent = guideCertainty(nav);
}

function guideTick() {
  const nav = state.nav;
  if (!nav?.gs || document.hidden) return;
  const due = Guide.dueReminders(nav.gs, navNow(nav), { clock: rgClock });
  if (due.length) {
    for (const r of due) nav.gs = Guide.reduce(nav.gs, { type: 'REMINDED', key: r.key });
    const r = due[due.length - 1];
    nav.alert = { ...r, index: nav.gs.index };
    accessVibrate(r.level === 'exit' ? [250, 120, 250, 120, 250] : r.level === 'uncertain' ? [450] : [150, 100, 150]);
    guideSay(r.message);
    saveTrip(nav);
  }
  updateGuideLive();
}

/* After any phase change: re-render, move focus to the new instruction, and say it. */
function guideEnter(nav, preface = '') {
  nav.alert = null;
  syncNavSteps(nav);
  saveTrip(nav);
  render();
  document.getElementById('rgHeading')?.focus({ preventScroll: true });
  $('#panelBody').scrollTop = 0;
  focusStep();
  guideSay(`${preface ? preface + ' ' : ''}${guideSpeech(guidePhase(nav))}`);
}

function beginNav(it, { destination, access = 'WALK', demo = false, restore = null } = {}) {
  releaseWakeLock();
  state.journey = it;
  const nav = {
    it, steps: buildSteps(it), i: 0, tracking: false, watchId: null, boarded: false, exitAlerted: false, exitHint: null,
    destination: destination ? { ...destination } : null, access, demo, clockOffset: restore?.clockOffset || 0,
    follow: true, headingUp: true, voice: false, fix: null, heading: null, compassHeading: null, compassEnabled: false, lastCompassAt: 0, lastCameraAt: 0,
    offRouteFixes: 0, lastOffRouteAt: 0, rerouteAt: 0, rerouting: false,
    maneuver: null, spokenKey: null, speechAllowed: false, lastUiAt: 0, showHelp: false, alert: null,
    status: demo ? 'Demo journey' : 'Waiting for GPS permission…', error: null, controller: null
  };
  nav.guide = guideFor(it, destination?.name);
  nav.gs = Guide.createState(nav.guide, navNow(nav));
  if (restore) nav.gs = { ...nav.gs, ...restore.gs, index: Math.min(restore.gs.index, nav.guide.phases.length - 1) };
  state.nav = nav;
  renderJourney(); applyMapState();
  pushView({ name: 'navigate' }, { detent: 'full' });
  guideEnter(nav, restore ? 'Trip resumed.' : demo ? 'Demo journey started. Times are simulated.' : 'Trip started.');
  // Location is advisory only (exit-stop estimates, Where am I, rerouting). Never used in the demo.
  if (!demo && 'geolocation' in navigator && window.isSecureContext) {
    nav.watchId = navigator.geolocation.watchPosition(onNavPosition, error => {
      if (state.nav !== nav) return;
      nav.tracking = false;
      nav.fix = null;
      nav.status = error?.code === 1 ? 'Location is off. Steps still work; Where am I and new routes need location.' : 'No usable GPS signal yet.';
      updateGuideLive();
    }, { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 });
    nav.tracking = true;
  }
  if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(lock => { if (state.nav === nav) state.wakeLock = lock; else lock.release(); }).catch(() => { /* wake lock unavailable */ });
  return nav;
}

function endTrip() {
  releaseWakeLock();
  state.nav = null;
  clearTrip();
  goHome();
  announceAccess('Trip ended.');
  document.getElementById('roveHomeTitle')?.focus({ preventScroll: true });
}

function guideHelpHtml(nav, phase) {
  const st = phase.kind === 'board' ? Guide.departureStatus(nav.gs, navNow(nav), { clock: rgClock }) : null;
  const speakOn = accessPreference('speak', true);
  const transfer = phase.kind === 'transfer' || phase.isTransfer || (phase.kind === 'ride' && phase.connectMin != null);
  return `<section id="rgHelp" class="rg-help" aria-labelledby="rgHelpHeading">
    <h2 id="rgHelpHeading" tabindex="-1">Help</h2>
    <div class="rg-help-actions">
      ${st?.state === 'maybe-missed' ? '<button type="button" class="rg-row-button" data-action="rg-wait">I\'m still waiting</button>' : ''}
      <button type="button" class="rg-row-button" data-action="rg-replan">${transfer ? 'Find an easier transfer from here' : 'Find another route from here'}</button>
      <button type="button" class="rg-row-button" data-action="rg-where">Where am I?</button>
      ${nav.gs.history.length ? '<button type="button" class="rg-row-button" data-action="rg-back">Undo last confirmation</button>' : ''}
      <button type="button" class="rg-row-button" data-action="rg-voice" aria-pressed="${speakOn}">Rove voice: ${speakOn ? 'On' : 'Off'}</button>
    </div>
    <dl class="rg-tips">
      <dt>Changing buses or trains</dt><dd>After you get off, Rove will guide you to the next boarding stop, then ask you to confirm boarding. You can use Find an easier transfer from here to recalculate with your current location. Rove does not automatically confirm platforms, crossings, or transfers.</dd>
      <dt>Finding the exact stop</dt><dd>GPS may place you several metres away from the actual boarding point. Do not use the map pin to decide where to stand or cross. Check the stop sign or ask transit staff to identify the correct boarding location.</dd>
      <dt>Several buses arriving together</dt><dd>Before boarding, ask the driver to confirm the route number and destination. Do not rely on the order buses arrive or Rove's location estimate.</dd>
      <dt>Lost or unsure</dt><dd>Stop somewhere safe. Ask transit staff or the operator, then use Where am I. That feature provides an approximate location, not an obstacle-free walking route.</dd>
      <dt>Wrong vehicle or missed stop</dt><dd>Get off at the next stop when it is safe, then choose Find another route.</dd>
      <dt>Missed or canceled service</dt><dd>Choose Find another route. If you are still waiting, Rove checks again in a few minutes.</dd>
      <dt>No internet</dt><dd>Your current steps stay on this phone. Finding a new route needs a connection.</dd>
      <dt>What Rove cannot do</dt><dd>Rove cannot detect obstacles, safe crossings, platform edges, or which vehicle you are on.</dd>
    </dl>
  </section>`;
}

function viewNavigate() {
  const nav = state.nav;
  if (!nav?.gs) return viewHome();
  const phases = nav.guide.phases;
  const i = nav.gs.index;
  const phase = phases[i];
  const next = phases[i + 1];
  const leg = phase.leg;
  const li = leg?.mode === 'TRANSIT' ? legInfo(leg) : null;
  const kind = { walk: 'Walk', transfer: 'Transfer', drive: 'Drive', board: phase.isTransfer ? 'Transfer · Board' : 'Board', ride: 'On board', arrive: 'Arrived' }[phase.kind];
  const mark = li ? `<span class="rg-badge" style="background:${esc(li.color)};color:${esc(li.text)}" aria-hidden="true">${esc(li.badge)}</span>`
    : `<span class="rg-glyph" aria-hidden="true">${phase.kind === 'arrive' ? ICONS.check : MODE_ICONS.walk}</span>`;
  const status = guideStatus(nav);
  const dots = phases.map((p, n) => `<li class="${n < i ? 'done' : n === i ? 'now' : ''}"></li>`).join('');
  const arrive = phase.kind === 'arrive';
  return `<div class="rg-nav${nav.demo ? ' is-demo' : ''}${arrive ? ' is-arrived' : ''}">
    <div class="rg-top">
      ${arrive ? '<span></span>' : '<button type="button" class="rg-end" data-action="rg-end">End trip</button>'}
      <p class="rg-step">Step ${i + 1} of ${phases.length}</p>
    </div>
    ${nav.demo ? `<div class="rg-demo-banner"><p><strong>Demo</strong> Simulated times from a published timetable. Not live.</p>${['ride', 'board'].includes(phase.kind) ? '<button type="button" class="rg-demo-skip" data-action="rg-demo-skip">Skip ahead</button>' : ''}</div>` : ''}
    <ol class="rg-progress" aria-hidden="true">${dots}</ol>
    <section class="rg-card" aria-labelledby="rgHeading">
      <p class="rg-kind">${mark}<span>${esc(kind)}</span></p>
      <h1 id="rgHeading" tabindex="-1">${esc(phase.heading)}</h1>
      ${phase.facts.length ? `<ul class="rg-facts">${phase.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${phase.check ? `<p class="rg-check"><strong>Check before boarding.</strong> ${esc(phase.check)}</p>` : ''}
      <p id="rgStatus" class="rg-status" data-level="${esc(status?.level || 'info')}" ${status ? '' : 'hidden'}>${esc(status?.message || '')}</p>
    </section>
    <p id="rgCertainty" class="rg-certainty">${esc(guideCertainty(nav))}</p>
    ${next && !arrive ? `<p class="rg-next"><span>Next</span>${esc(next.heading)}</p>` : ''}
    ${nav.showHelp && !arrive ? guideHelpHtml(nav, phase) : ''}
    <div class="rg-dock" role="group" aria-label="Trip controls">
      ${nav.showHelp && !arrive
        // While Help is open the step cannot be confirmed: a tap meant for Help must never count as I've boarded.
        ? '<button type="button" class="rg-secondary rg-close-help" data-action="rg-help" aria-expanded="true" aria-controls="rgHelp">Close help</button>'
        : `<button type="button" class="rg-confirm" data-action="rg-confirm" data-phase="${i}"${phase.confirmAria ? ` aria-label="${esc(phase.confirmAria)}"` : ''}>${esc(arrive ? 'Done' : phase.confirmLabel)}</button>
      ${arrive ? '' : `<div class="rg-dock-row">
        <button type="button" class="rg-secondary" data-action="rg-repeat">Repeat</button>
        <button type="button" class="rg-secondary" data-action="rg-help" aria-expanded="false" aria-controls="rgHelp">Help</button>
      </div>`}`}
    </div>
  </div>`;
}

/* ---- Voice destination ----
 * Order of preference, so voice works in every browser:
 * 1. Record with MediaRecorder (all modern browsers) and transcribe on Rove's server with a
 *    high-accuracy model biased toward Bay Area place names (api/v2/transcribe.mjs).
 * 2. The browser's own speech recognition (cloud, or on-device where the browser supports it).
 * 3. Typing, with a clear reason and the keyboard's dictation key as a hint. */
let recognition = null;
let capture = null;
let voiceServer = null;   // null = unknown, true/false after probing /api/v2/transcribe
let voiceUseLocal = false; // browser cloud recognition failed while online; use on-device instead
const BrowserRecognition = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
const VOICE_ERRORS = {
  'not-allowed': 'Microphone access is off for this site. Type your destination instead. To use voice later, allow the microphone in your browser settings for this site.',
  'service-not-allowed': 'Voice input is turned off in this browser. Type your destination instead.',
  'no-speech': "I didn't hear anything. Try again, or type your destination.",
  'audio-capture': 'No microphone was found. Type your destination instead.',
  offline: "You're offline, so voice input can't reach a speech service. Type your destination instead.",
  'voice-service': "Voice input isn't working in this browser right now. Type your destination below. Your keyboard's dictation key also works.",
  'voice-busy': 'The voice service is busy. Try again in a moment, or type your destination.',
  'voice-download': 'This browser can understand speech on your device after a one-time download.',
  network: "Voice input isn't working in this browser right now. Type your destination below. Your keyboard's dictation key also works.",
  aborted: 'Stopped listening.',
  unsupported: "Voice input isn't available in this browser. Type your destination. Your keyboard's dictation key also works."
};
const PERMANENT_VOICE_ERRORS = ['not-allowed', 'service-not-allowed', 'unsupported', 'audio-capture', 'voice-download'];

async function probeVoiceServer() {
  try {
    const res = await fetch('/api/v2/transcribe', { cache: 'no-store' });
    const body = await res.json();
    voiceServer = res.ok && body?.available === true;
  } catch { voiceServer = null; }
}

function voiceStatusHtml() {
  const v = state.plan.voice;
  if (!v) return '';
  const retry = currentView().name === 'demo' ? 'demo-speak' : 'voice-destination';
  if (v.state === 'starting') return `<div class="rg-listening" role="status"><span class="rg-pulse is-waiting" aria-hidden="true"></span><span>Speak after the tone.</span><button type="button" class="rg-text-button" data-action="voice-stop">Cancel</button></div>`;
  if (v.state === 'listening') return `<div class="rg-listening" role="status"><span class="rg-pulse" aria-hidden="true"></span><span>${v.mode === 'server' ? "Listening. I'll stop when you pause." : 'Listening. Say a place, address, or station.'}</span>${v.mode === 'server' ? '<button type="button" class="rg-text-button" data-action="voice-done">Done</button>' : ''}<button type="button" class="rg-text-button" data-action="voice-stop">Cancel</button></div>`;
  if (v.state === 'understanding') return `<div class="rg-listening" role="status"><span class="spinner" aria-hidden="true"></span><span>Understanding…</span></div>`;
  if (v.state === 'installing') return `<div class="rg-listening" role="status"><span class="spinner" aria-hidden="true"></span><span>Downloading on-device voice…</span></div>`;
  if (v.state === 'heard') return `<p class="rg-heard">Heard <q>${esc(v.heard)}</q>${v.matches === 0 ? '. No matches; try again or type.' : '. Choose the right match below.'}</p>`;
  if (v.state === 'error') return `<div class="rg-voice-error" role="alert"><p>${esc(VOICE_ERRORS[v.error] || "Voice input didn't work. Try again, or type your destination.")}</p>${v.error === 'voice-download' ? '<button type="button" class="rg-text-button" data-action="voice-install">Download on-device voice</button>' : ''}${PERMANENT_VOICE_ERRORS.includes(v.error) ? '' : `<button type="button" class="rg-text-button" data-action="${retry}">Try again</button>`}</div>`;
  return '';
}
/* Patch the voice status in place: re-rendering would move screen-reader focus (and make
 * VoiceOver talk while the microphone is open). */
function updateVoiceSlot() {
  const slot = document.querySelector('.rg-voice-slot');
  if (slot) slot.innerHTML = voiceStatusHtml();
  else render();
}
function planDestinationResults() { return $$('#planSuggest .result:not([data-action="plan-map"]):not([data-action="plan-locate"]):not([data-action="plan-pick-location"])'); }
function voiceResultsReady() {
  const plan = state.plan;
  if (!plan.voicePending || currentView().name !== 'plan') return;
  const heard = plan.voicePending;
  plan.voicePending = null;
  const results = planDestinationResults();
  plan.voice = { state: 'heard', heard, matches: results.length };
  const slot = document.querySelector('.rg-voice-slot');
  if (slot) slot.innerHTML = voiceStatusHtml();
  if (!results.length) { announceAccess(`Heard ${heard}. No matching places. Try again, or type your destination.`); return; }
  const first = results[0].querySelector('.row-title')?.textContent || results[0].textContent.trim();
  announceAccess(`Heard ${heard}. ${plural(results.length, 'match', 'matches')}. First: ${first}. Choose one to confirm.`);
  results[0].focus({ preventScroll: true });
}

/* What happens with recognised words, whichever engine produced them. */
function voiceHeard(words, demo) {
  const plan = state.plan;
  const text = String(words || '').trim();
  if (!text) { voiceFail('no-speech', demo); return; }
  if (demo) { plan.voice = null; startDemo(text); return; }
  plan.voice = { state: 'heard', heard: text };
  plan.to = null; plan.draft.to = text; plan.query = text; plan.focus = 'to'; plan.voicePending = text;
  render();
  requestAutocomplete(text, 'to');
  updatePlanSuggestions();
  if (autocomplete.status !== 'loading') voiceResultsReady();
  setTimeout(voiceResultsReady, 3000); // geocoder slow or offline: announce local stop matches anyway
}
function voiceFail(error, demo) {
  const plan = state.plan;
  plan.voice = { state: 'error', error };
  updateVoiceSlot();
  announceAccess(VOICE_ERRORS[error] || "Voice input didn't work. Try again, or type your destination.");
  if (error === 'voice-download') { $('[data-action="voice-install"]')?.focus({ preventScroll: true }); return; }
  if (!demo && error !== 'no-speech') $('#planTo')?.focus({ preventScroll: true });
}
function voiceCancelAll() {
  try { recognition?.abort(); } catch { /* none active */ }
  recognition = null;
  const c = capture; capture = null; c?.cancel();
}

function voiceDestination({ demo = false } = {}) {
  stopSpeaking();
  voiceCancelAll();
  if (!demo && currentView().name !== 'plan') openPlan({});
  if (voiceServer !== false && window.RoveVoice?.supported() && navigator.onLine) voiceViaServer({ demo });
  else voiceViaBrowser({ demo });
}

function voiceViaServer({ demo }) {
  const plan = state.plan;
  plan.voice = { state: 'starting', mode: 'server' };
  updateVoiceSlot();
  announceAccess('Speak after the tone.');
  // The lead-in lets a screen reader finish speaking before the microphone starts listening.
  const c = RoveVoice.record({ leadInMs: 1300, onState: s => {
    if (capture !== c) return;
    plan.voice = { state: s === 'listening' ? 'listening' : 'starting', mode: 'server' };
    updateVoiceSlot();
    if (s === 'listening') accessVibrate([40]);
  } });
  capture = c;
  c.done.then(async ({ blob, mediaType, heard }) => {
    if (capture !== c) return;
    if (!heard || blob.size < 1000) { capture = null; voiceFail('no-speech', demo); return; }
    plan.voice = { state: 'understanding', mode: 'server' };
    updateVoiceSlot();
    let res = null, body = null;
    try {
      const audio = await RoveVoice.blobToBase64(blob);
      res = await fetch('/api/v2/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audio, mediaType }), signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined });
      body = await res.json().catch(() => null);
    } catch { res = null; }
    if (capture !== c) return; // the rider cancelled or started again
    capture = null;
    if (res?.ok) { if (body?.text) voiceHeard(body.text, demo); else voiceFail('no-speech', demo); return; }
    if (body?.code === 'VOICE_BUSY') { voiceFail('voice-busy', demo); return; }
    // Rove's speech service is not usable here: fall back to the browser's recognizer right away.
    voiceServer = false;
    if (BrowserRecognition()) { announceAccess("Rove's voice service isn't available. Using your browser's voice input. Say it again now."); voiceViaBrowser({ demo }); return; }
    voiceFail(navigator.onLine ? 'voice-service' : 'offline', demo);
  }, error => {
    if (capture !== c) return;
    capture = null;
    if (error?.name === 'AbortError') return;
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') { voiceFail('not-allowed', demo); return; }
    if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') { voiceFail('audio-capture', demo); return; }
    voiceServer = false;
    if (BrowserRecognition()) voiceViaBrowser({ demo }); else voiceFail('voice-service', demo);
  });
}

function voiceViaBrowser({ demo, local = voiceUseLocal }) {
  const Recognition = BrowserRecognition();
  const plan = state.plan;
  if (!Recognition) { voiceFail(navigator.onLine ? 'unsupported' : 'offline', demo); return; }
  let r;
  try { r = new Recognition(); } catch { voiceFail('unsupported', demo); return; }
  recognition = r;
  r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false;
  if (local && 'processLocally' in r) r.processLocally = true;
  let got = false;
  r.onresult = e => { const words = e.results?.[0]?.[0]?.transcript?.trim(); if (!words || recognition !== r) return; got = true; recognition = null; voiceHeard(words, demo); };
  r.onerror = e => { got = true; if (recognition !== r) return; recognition = null; recognitionError(e.error || 'unknown', { demo, local }); };
  r.onend = () => { if (recognition === r) recognition = null; if (!got && plan.voice?.state === 'listening') voiceFail('no-speech', demo); };
  plan.voice = { state: 'listening', mode: 'browser' };
  updateVoiceSlot();
  accessVibrate([40]);
  try { r.start(); } catch { voiceFail('voice-service', demo); }
}

/* "network" from a browser recognizer often means its cloud service is unreachable even though
 * the device is online; try on-device recognition before giving up. */
async function recognitionError(error, { demo, local }) {
  const Recognition = BrowserRecognition();
  let availability = 'unsupported';
  if ((error === 'network' || error === 'language-not-supported') && typeof Recognition?.available === 'function') {
    try { availability = await Recognition.available({ langs: ['en-US'], processLocally: true }); } catch { availability = 'unsupported'; }
  }
  const step = RoveSpeech.recognitionFallback({ error, onLine: navigator.onLine, local, availability });
  if (step.action === 'retry-local') { voiceUseLocal = true; voiceViaBrowser({ demo, local: true }); return; }
  voiceFail(step.code, demo);
}
function voiceInstallLocal() {
  const Recognition = BrowserRecognition();
  if (typeof Recognition?.install !== 'function') { voiceFail('voice-service'); return; }
  state.plan.voice = { state: 'installing' };
  updateVoiceSlot();
  announceAccess('Downloading on-device voice. This happens once.');
  Recognition.install({ langs: ['en-US'], processLocally: true }).then(ok => {
    if (!ok) { voiceFail('voice-service'); return; }
    voiceUseLocal = true;
    announceAccess('Ready. Say your destination now.');
    voiceViaBrowser({ demo: currentView().name === 'demo', local: true });
  }, () => voiceFail('voice-service'));
}

/* ---- Demo journey: a real Muni N + BART timetable (Tuesday 20 Oct 2026, 08:15) shifted to now.
 * Visibly labeled everywhere; uses no location and no live data. ---- */
function demoItinerary(nowMs = Date.now()) {
  const shift = nowMs - Date.parse('2026-10-20T15:15:53Z');
  const t = iso => new Date(Date.parse(iso) + shift).toISOString();
  const place = (name, lat, lon) => ({ name, lat, lon, platform: null, stopName: name, parking: null, parkingCapacity: null });
  const base = { routeId: null, routeName: null, routeLongName: null, routeColor: null, routeTextColor: null, headsign: null, tripShortName: null, delaySeconds: null, realtime: false, canceled: false, staySeated: false, intermediateStops: null, geometry: null, steps: [], alerts: [] };
  const walk = (from, to, s, e, d) => ({ ...base, mode: 'WALK', transitMode: 'WALK', agencyId: null, from, to, startTime: t(s), endTime: t(e), scheduledStart: t(s), distanceMeters: d, durationSeconds: (Date.parse(e) - Date.parse(s)) / 1000, approximate: true });
  const ride = (o, from, to, s, e) => ({ ...base, ...o, mode: 'TRANSIT', from, to, startTime: t(s), endTime: t(e), scheduledStart: t(s), distanceMeters: null, durationSeconds: (Date.parse(e) - Date.parse(s)) / 1000 });
  const start = place('La Playa St & Judah St', 37.76, -122.509);
  const judah = place('Judah/La Playa/Ocean Beach', 37.760304, -122.508181);
  const civicMuni = place('Civic Center Muni Station', 37.779712, -122.413347);
  const civicBart = place('Civic Center / UN Plaza', 37.77938, -122.413804);
  const lake = place('Lake Merritt', 37.797296, -122.265287);
  const legs = [
    walk(start, judah, '2026-10-20T15:15:53Z', '2026-10-20T15:17:00Z', 80),
    ride({ transitMode: 'TRAM', agencyId: 'muni', routeId: 'N', routeName: 'N', headsign: 'Caltrain/Ballpark' }, judah, civicMuni, '2026-10-20T15:17:00Z', '2026-10-20T15:56:15Z'),
    walk(civicMuni, civicBart, '2026-10-20T15:56:15Z', '2026-10-20T15:57:46Z', 55),
    ride({ transitMode: 'SUBWAY', agencyId: 'bart', routeId: '12', routeName: 'Blue-N', headsign: 'Dublin/Pleasanton' }, civicBart, lake, '2026-10-20T16:01:00Z', '2026-10-20T16:18:00Z'),
    walk(lake, place('Lake Merritt BART', 37.7974, -122.2651), '2026-10-20T16:18:00Z', '2026-10-20T16:18:17Z', 21)
  ];
  return { id: 'demo', startTime: legs[0].startTime, endTime: legs.at(-1).endTime, durationSeconds: 3744, walkMeters: 156, walkSeconds: 175, waitingSeconds: 194, transfers: 1, usesRealtime: false, hasCancellation: false, demo: true, legs };
}
function startDemo(heard = '') {
  const it = demoItinerary();
  const plan = state.plan;
  plan.from = { kind: 'demo', name: 'La Playa St & Judah St (demo start)', lat: 37.76, lon: -122.509 };
  plan.to = { kind: 'demo', name: 'Lake Merritt BART', lat: 37.7974, lon: -122.2651 };
  plan.timeMode = 'now'; plan.error = null; plan.voice = null; plan.showAll = false;
  plan.results = { itineraries: [it], notes: [], request: { time: it.startTime, access: 'WALK' }, scheduledOnly: true, demo: true };
  plan.sort = 'fastest'; plan.expanded = 0;
  state.journey = it;
  pushView({ name: 'results' }, { detent: 'full' });
  const matched = /lake|merritt/i.test(heard);
  announceAccess(`${heard ? `Heard ${heard}. ${matched ? '' : 'This demo always goes to Lake Merritt. '}` : ''}Demo route to Lake Merritt BART. ${routeChoiceSpeech(it, 1)}`);
}
function viewDemo() {
  return `${backHeader()}
  <div class="rg-page">
    <p class="rg-kicker">Demo journey</p>
    <h1 class="rg-title">Ocean Beach to Lake Merritt</h1>
    <p class="rg-lede">Try a whole trip from home: walk to a stop, board a Muni N train, transfer to BART, and arrive.</p>
    <p class="rg-note"><strong>Simulated.</strong> Times come from Muni and BART published timetables and are shifted to start now. Nothing is live, and Rove does not use your location.</p>
    <div class="rg-voice-slot">${voiceStatusHtml()}</div>
    <div class="rg-stack">
      <button type="button" class="rg-primary" data-action="demo-speak">${MIC_ICON}<span>Speak the destination</span></button>
      <button type="button" class="rg-quiet" data-action="demo-continue">Continue without speaking</button>
    </div>
  </div>`;
}

/* Spoken detail for one route, built from the same phases navigation will use. */
function routeDetailSpeech(it) {
  const g = guideFor(it, state.plan.to?.name);
  return g.phases.map(p => p.kind === 'arrive' ? `Arrive at ${p.place}.` : `${p.heading}. ${p.facts.slice(0, 3).map(f => f.replace(/\.$/, '')).join('. ')}.`).join(' ');
}

/* ---------- Event handling ---------- */


document.addEventListener('change', event => {
  const key = event.target?.dataset?.accessSetting;
  if (!['haptics', 'autoVoice', 'speak'].includes(key)) return;
  accessSetting(key, Boolean(event.target.checked));
  announceAccess(({ haptics: 'Vibration', autoVoice: 'Automatic route speech', speak: 'Rove voice' })[key] + (event.target.checked ? ' on' : ' off'));
});
function clearSearchField() {
  state.searchQuery = '';
  $('#searchInput').value = '';
  $('#searchClear').hidden = true;
  requestAutocomplete('', 'search');
}


function onSearchInput(value) {
  state.searchQuery = value;
  $('#searchClear').hidden = !value;
  const top = currentView();
  requestAutocomplete(value, 'search');
  if (value.trim()) {
    if (top.name === 'search') render();
    else { state.stack.push({ name: 'search' }); render(); }
    if (isMobile() && state.detent !== 'full') setDetent('full');
  } else if (top.name === 'search') {
    state.stack.pop();
    render();
  }
}


function toggleSaved(agencyId, stopId) {
  const place = placeFor(agencyId, stopId);
  if (!place) return;
  const exists = state.saved.some(x => x.a === place.a.id && x.id === place.s.id);
  state.saved = exists ? state.saved.filter(x => !(x.a === place.a.id && x.id === place.s.id)) : [...state.saved, { a: place.a.id, id: place.s.id, n: place.s.n }];
  store.set(STORAGE.saved, state.saved);
  render();
  toast(exists ? 'Removed from saved stops' : 'Saved. It will appear on the home screen.');
}

function handleAction(el) {
  const action = el.dataset.action;
  const view = currentView();
  const plan = state.plan;
  switch (action) {
    case 'back': popView(); break;
    case 'route': openRoute(el.dataset.key); break;
    case 'stop': openStop(el.dataset.agency, el.dataset.stop); break;
    case 'lines': clearSearchField(); pushView({ name: 'lines' }, { detent: 'full' }); break;
    case 'impact': clearSearchField(); pushView({ name: 'impact' }, { detent: 'full' }); break;
    case 'access-my-journey': if(state.nav) pushView({name:'navigate'},{detent:'full'}); else announceAccess('No journey is currently active. Plan a trip to begin.'); break;
    case 'access-nearby': pushView({name:'accessNearby'},{detent:'full'}); if(!state.userLocation) locate(); break;
    case 'access-refresh-location': locate(); break;
    case 'access-select-stop': { const place=placeFor(el.dataset.agency,el.dataset.stop); if(place){announceAccess('Selected '+place.s.n+'. Confirm the physical stop and direction before boarding.'); openStop(el.dataset.agency,el.dataset.stop);} break; }
    case 'access-stop-speech': stopSpeaking(); announceAccess('Speech stopped.'); break;
    case 'access-dictate': voiceDestination(); break;
    case 'access-all-routes': {
      const order = sortedItineraryIndexes().slice(0, 3);
      const its = state.plan.results?.itineraries || [];
      speakText(order.length ? `${plural(order.length, 'route')}. ${order.map((i, n) => routeChoiceSpeech(its[i], n + 1)).join(' ')} Choose Listen on a route for its stops.` : 'No routes are available.');
      break;
    }
    case 'access-route': { const it = state.plan.results?.itineraries?.[Number(el.dataset.index)]; if (it) speakText(routeDetailSpeech(it)); break; }
    case 'access-departures': {
      const place = placeFor(el.dataset.agency,el.dataset.stop);
      const data = place && cachedArrivals(place);
      if (!data || data.status !== 'live' || !data.groups?.length) { speakText('Verified live departures are not currently available for this stop. Please check posted signs or agency information.'); break; }
      const messages = data.groups.slice(0,5).map(g => { const t=g.times[0]; const minutes=Math.max(0,Math.round((t.time*1000-Date.now())/60000)); return `${g.route?.title || g.label || 'Transit'} ${g.headsign ? 'toward '+g.headsign : ''}, ${minutes} minutes.`; });
      speakText(`Live departures for ${place.s.n}. ${messages.join(' ')}`);
      break;
    }
    case 'access-demo': speakText('This is Rove voice. Example: Board the Muni 38R bus toward Downtown. Ask the driver to confirm the route number as you board.'); break;
    case 'access': clearSearchField(); pushView({ name: 'access' }, { detent: 'full' }); break;
    case 'access-toggle': announceAccess('Accessible navigation is always enabled.'); break;
    case 'nav-read': readNavInstruction(); break;
    case 'sources': clearSearchField(); pushView({ name: 'sources' }, { detent: 'full' }); break;
    case 'intro': showIntro(0); break;
    case 'locate': locate(); break;
    case 'plan': openPlan({}); break;
    case 'first-mile': setFirstMile(el.dataset.firstMile); break;
    case 'go-saved': { const p = savedPlaces().find(x => x.label === el.dataset.label); if (p) openPlan({ to: { ...p }, from: currentLocationPlace() || (plan.from && placeKey(plan.from) !== placeKey(p) ? plan.from : null) }); break; }
    case 'plan-to': openPlan({ to: placeFromStop(el.dataset.agency, el.dataset.stop), from: currentLocationPlace() || (plan.from?.stop !== el.dataset.stop ? plan.from : null) }); break;
    case 'plan-from': openPlan({ from: placeFromStop(el.dataset.agency, el.dataset.stop), to: plan.to && plan.to.stop !== el.dataset.stop ? plan.to : null }); break;
    case 'plan-swap': {
      [plan.from, plan.to] = [plan.to, plan.from];
      [plan.draft.from, plan.draft.to] = [plan.draft.to, plan.draft.from];
      if (plan.errorField === 'from' || plan.errorField === 'to') plan.errorField = plan.errorField === 'from' ? 'to' : 'from';
      plan.focus = null; render(); updatePlanMarkers(); break;
    }
    case 'plan-pick': { const p = placeFromStop(el.dataset.agency, el.dataset.stop); plan[plan.focus] = p; rememberPlace(p); afterPick(); break; }
    case 'plan-place': { const p = placeFromRow(el); plan[plan.focus] = p; rememberPlace(p); afterPick(); break; }
    case 'plan-pick-location': plan[plan.focus] = currentLocationPlace(); afterPick(); break;
    case 'plan-locate': locate({ thenPick: plan.focus }); break;
    case 'plan-map': startMapPick(plan.focus || (plan.to ? 'from' : 'to')); break;
    case 'plan-recheck': fetchPlanStatus(true); break;
    case 'plan-show-later': {
      // Real later departures from the timetable, shown as ordinary results labeled with their own times.
      if (!plan.later?.length) break;
      plan.results = { itineraries: plan.later, notes: ['These trips leave later than you asked. Times are from the published schedule.'], request: { time: plan.later[0].startTime, access: 'WALK' }, scheduledOnly: true };
      plan.error = null; plan.noServiceWindow = false; plan.sort = 'fastest'; plan.expanded = 0; plan.showAll = false;
      state.journey = plan.later[0];
      pushView({ name: 'results' }, { detent: 'half' });
      announceAccess(`Later trips. ${routeChoiceSpeech(plan.later[0], 1)}`);
      break;
    }
    case 'plan-next-morning': {
      // The alternate journey is explicitly labeled as tomorrow, never as 'Leave now'.
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      plan.timeMode = 'depart';
      plan.dateTime = localInputValue(tomorrow).slice(0, 11) + '08:15';
      plan.error = null; plan.noServiceWindow = false;
      render();
      submitPlan();
      break;
    }
    case 'search-place': openPlace(placeFromRow(el)); break;
    case 'place-directions': openPlan({ to: { ...view.place }, from: currentLocationPlace() || (plan.from && placeKey(plan.from) !== placeKey(view.place) ? plan.from : null) }); break;
    case 'place-from': openPlan({ from: { ...view.place }, to: plan.to && placeKey(plan.to) !== placeKey(view.place) ? plan.to : null }); break;
    case 'place-save': savePlace(view.place, el.dataset.label); render(); toast(el.dataset.label === 'Saved' ? 'Saved. It will appear on the home screen.' : `Set as ${el.dataset.label}.`); break;
    case 'place-unsave': unsavePlace(view.place); render(); toast('Removed from your places'); break;
    case 'save': if (view.name === 'stop') toggleSaved(view.agency, view.stop); break;
    case 'toggle-alert': { el.classList.toggle('expanded'); el.setAttribute('aria-expanded', String(el.classList.contains('expanded'))); break; }
    case 'it-sort': plan.sort = el.dataset.sort; render(); break;
    case 'it-toggle': {
      const i = Number(el.dataset.index);
      plan.expanded = plan.expanded === i ? -1 : i;
      const it = plan.results.itineraries[plan.expanded >= 0 ? plan.expanded : i];
      state.focusLeg = null;
      const changed = state.journey !== it;
      state.journey = it; renderJourney(); if (changed) revealJourney(); applyMapState(); fitJourney(it);
      render(); break;
    }
    case 'leg-focus': focusLeg(Number(el.dataset.leg)); break;
    case 'nav-start': startNavigation(Number(el.dataset.index)); break;
    case 'nav-board': if (state.nav) { state.nav.boarded = true; accessVibrate([120,70,120]); announceAccess('You confirmed boarding. Rove cannot independently verify the vehicle.',true); render(); } break;
    case 'nav-exit-check': if (state.nav) { checkBlindExit(state.nav,true); render(); } break;
    case 'nav-follow': navChangeFollow('follow'); break;
    case 'nav-compass': enableNavCompass(); break;
    case 'nav-voice': toggleNavVoice(); break;
    case 'nav-bearing': navChangeFollow('bearing'); break;
    case 'nav-overview': navChangeFollow('overview'); break;
    case 'nav-replan': if (state.nav?.fix) navReroute(state.nav); break;
    case 'nav-missed': if (state.nav?.fix) navReroute(state.nav); break;
    case 'nav-next': if (state.nav && state.nav.i < state.nav.steps.length - 1) { state.nav.i++; state.nav.exitAlerted = false; state.nav.exitHint = null; state.nav.maneuver = null; state.nav.spokenKey = null; render(); focusStep(); accessVibrate([100,70,100]); if (document.body.classList.contains('rove-accessible')) readNavInstruction(); } break;
    case 'nav-prev': if (state.nav && state.nav.i > 0) { state.nav.i--; state.nav.exitAlerted = false; state.nav.exitHint = null; state.nav.maneuver = null; state.nav.spokenKey = null; render(); focusStep(); if (document.body.classList.contains('rove-accessible')) readNavInstruction(); } break;
    case 'nav-end': endTrip(); break;
    case 'rg-confirm': {
      const nav = state.nav;
      if (!nav?.gs) break;
      const before = guidePhase(nav);
      if (nav.showHelp && before.kind !== 'arrive') break;
      if (before.kind === 'arrive') { endTrip(); break; }
      const next = Guide.reduce(nav.gs, { type: 'CONFIRM', phaseIndex: Number(el.dataset.phase), now: navNow(nav) });
      if (next === nav.gs) break; // stale double tap
      nav.gs = next;
      nav.showHelp = false;
      accessVibrate(before.kind === 'board' ? [120, 70, 120] : [70]);
      guideEnter(nav, before.confirmSpeech);
      break;
    }
    case 'rg-repeat': { const nav = state.nav; const phase = guidePhase(nav); if (!phase) break; const st = guideStatus(nav); guideSay(`${guideSpeech(phase)}${st ? ' ' + st.message : ''}`, { force: true }); break; }
    case 'rg-help': {
      const nav = state.nav;
      if (!nav) break;
      nav.showHelp = !nav.showHelp;
      render();
      (nav.showHelp ? document.getElementById('rgHelpHeading') : $('.rg-dock .rg-confirm'))?.focus({ preventScroll: true });
      if (nav.showHelp) document.getElementById('rgHelp')?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      break;
    }
    case 'rg-back': { const nav = state.nav; if (!nav?.gs?.history.length) break; nav.gs = Guide.reduce(nav.gs, { type: 'BACK', now: navNow(nav) }); nav.showHelp = false; guideEnter(nav, 'Went back one step.'); break; }
    case 'rg-wait': { const nav = state.nav; if (!nav?.gs) break; nav.gs = Guide.reduce(nav.gs, { type: 'STILL_WAITING', now: navNow(nav) }); nav.alert = null; saveTrip(nav); render(); guideSay('OK. Rove will check again in 5 minutes. Keep listening for announcements.', { force: true }); $('.rg-dock .rg-confirm')?.focus({ preventScroll: true }); break; }
    case 'rg-replan': {
      const nav = state.nav;
      if (!nav) break;
      if (nav.demo) { guideSay('In the demo, Rove does not use your location. On a real trip, Find another route plans again from where you are.', { force: true }); break; }
      if (!navigator.onLine) { guideSay('You are offline, so Rove cannot find a new route. Ask transit staff, or try again when you have a connection.', { force: true }); break; }
      if (!nav.fix || Date.now() - nav.fix.time > 60000 || !Number.isFinite(nav.fix.accuracy) || nav.fix.accuracy > 100) { guideSay('Rove needs a recent, reasonably accurate location to plan from here. Wait for a better GPS signal, or plan again using a stop name. Do not use the map pin to decide where to cross.', { force: true }); break; }
      guideSay('Finding another route from your approximate location. Check the first boarding stop with signs or staff.', { force: true });
      navReroute(nav);
      break;
    }
    case 'rg-where': {
      const nav = state.nav;
      if (nav?.demo) { guideSay('The demo does not use your location.', { force: true }); break; }
      const f = nav?.fix;
      if (!f || Date.now() - f.time > 60000) { guideSay('No recent GPS location. Ask someone nearby or transit staff where you are.', { force: true }); break; }
      const near = nearbyPlaces(f.point, 1)[0];
      guideSay(`${near ? `Nearest listed stop: ${near.place.s.n}, about ${Math.round(near.d / 10) * 10} metres in a straight line.` : 'No listed stop nearby.'} GPS accuracy is about ${Math.round(f.accuracy)} metres${f.accuracy > 30 ? ', which is too rough to tell which side of the street you are on' : ''}.`, { force: true });
      break;
    }
    case 'rg-voice': { const on = !accessPreference('speak', true); accessSetting('speak', on); render(); $('[data-action="rg-voice"]')?.focus({ preventScroll: true }); announceAccess(on ? 'Rove voice on.' : 'Rove voice off. Your screen reader will announce updates.'); break; }
    case 'rg-end': if (window.confirm('End this trip?')) endTrip(); break;
    case 'rg-demo-skip': {
      const nav = state.nav;
      const phase = guidePhase(nav);
      if (!nav?.demo || !phase) break;
      const now = navNow(nav);
      const target = phase.kind === 'ride' && phase.arrives != null ? phase.arrives - (phase.arrives - now > 3 * 60000 ? 2.8 * 60000 : 0.8 * 60000)
        : phase.kind === 'board' && phase.departs != null ? phase.departs - 1.5 * 60000 : now;
      if (target > now) nav.clockOffset += target - now;
      announceAccess(`Demo clock moved to ${rgClock(navNow(nav))}.`);
      guideTick();
      break;
    }
    case 'trip-resume': { const t = loadTrip(); if (!t) { render(); announceAccess('That trip has expired.'); break; } state.plan.to = t.destination; beginNav(t.it, { destination: t.destination, access: t.access, demo: t.demo, restore: t }); break; }
    case 'trip-discard': clearTrip(); render(); announceAccess('Saved trip discarded.'); document.getElementById('roveHomeTitle')?.focus({ preventScroll: true }); break;
    case 'voice-destination': voiceDestination(); break;
    case 'voice-stop': voiceCancelAll(); state.plan.voice = null; updateVoiceSlot(); announceAccess('Stopped listening.'); if (currentView().name === 'plan') $('#planTo')?.focus({ preventScroll: true }); break;
    case 'voice-done': capture?.stop(); break;
    case 'voice-install': voiceInstallLocal(); break;
    case 'demo': state.plan.voice = null; pushView({ name: 'demo' }, { detent: 'full' }); break;
    case 'demo-speak': voiceDestination({ demo: true }); break;
    case 'demo-continue': startDemo(); break;
    case 'it-more': plan.showAll = true; render(); break;
    default: break;
  }
}


function afterPick() {
  const plan = state.plan;
  const picked = plan.focus;
  if (picked) plan.draft[picked] = '';
  plan.focus = null; plan.query = '';
  requestAutocomplete('', picked);
  if (plan.errorField === picked) { plan.error = null; plan.errorField = null; }
  document.activeElement?.blur?.();
  render();
  const next = picked === 'from' && !plan.to ? '#planTo' : picked === 'to' && !plan.from ? '#planFrom' : null;
  // Spoken destination confirmed by choosing a match: go straight to routes when the start is known.
  if (picked === 'to' && plan.voice?.state === 'heard') {
    plan.voice = null;
    if (plan.from) { announceAccess(`Destination: ${plan.to?.name}. Finding routes.`); submitPlan(); return; }
    announceAccess(`Destination: ${plan.to?.name}. Now choose a starting point. Use my location is first.`);
  }
  if (next) requestAnimationFrame(() => $(next)?.focus());
  else requestAnimationFrame(() => { document.activeElement?.blur?.(); $('.plan-submit')?.focus({ preventScroll: true }); });
}

/* Moves the trip fields in and out of their suggestion state without rebuilding them. */


function bindPanel() {
  const body = $('#panelBody');
  body.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && body.contains(el)) { e.preventDefault(); handleAction(el); }
  });
  // Keep focus in the trip field while a suggestion is pressed, so the list stays put.
  body.addEventListener('mousedown', e => { if (e.target.closest('#planSuggest button')) e.preventDefault(); });
  body.addEventListener('submit', e => { if (e.target.matches('[data-plan-form]')) { e.preventDefault(); submitPlan(); } });
  body.addEventListener('change', e => {
    if (e.target.id === 'planTimeMode') { state.plan.timeMode = e.target.value; if (!state.plan.dateTime) state.plan.dateTime = localInputValue(new Date()); render(); }
    if (e.target.id === 'planDateTime') state.plan.dateTime = e.target.value;
  });
  body.addEventListener('focusin', e => {
    const which = e.target.dataset?.planField;
    if (!which) return;
    setPlanFocus(which);
    if (state.plan[which]) e.target.select();
  });
  body.addEventListener('focusout', e => {
    if (!e.target.dataset?.planField) return;
    const to = e.relatedTarget;
    if (to && (to.dataset?.planField || to.closest?.('#planSuggest'))) return;
    setTimeout(() => {
      const active = document.activeElement;
      if (currentView().name !== 'plan' || active?.dataset?.planField || active?.closest?.('#planSuggest')) return;
      if (state.plan.focus) { setPlanFocus(null); render(); }
    }, 0);
  });
  body.addEventListener('input', e => {
    const which = e.target.dataset?.planField;
    if (!which) return;
    const plan = state.plan;
    plan.draft[which] = e.target.value;
    plan[which] = null;
    plan.query = e.target.value;
    if (plan.errorField === which) { plan.errorField = null; plan.error = null; e.target.closest('.plan-field')?.classList.remove('invalid'); e.target.removeAttribute('aria-invalid'); $('#planError')?.remove(); }
    if (plan.focus !== which) plan.focus = which;
    requestAutocomplete(e.target.value, which);
    updatePlanSuggestions();
    updatePlanMarkers();
  });
  body.addEventListener('keydown', e => {
    const which = e.target.dataset?.planField;
    if (!which) return;
    if (e.key === 'Escape') { setPlanFocus(null); e.target.blur(); render(); }
    if (e.key === 'Enter') { e.preventDefault(); commitPlanField(which); }
    if (e.key === 'ArrowDown') { const first = $('#planSuggest .result'); if (first) { e.preventDefault(); first.focus(); } }
  });

  const input = $('#searchInput');
  input.addEventListener('input', () => onSearchInput(input.value));
  input.addEventListener('focus', () => { if (isMobile() && state.detent === 'peek') setDetent('half'); });
  input.addEventListener('keydown', e => {
    const results = $$('.result', body);
    if (e.key === 'Enter' && results.length) { e.preventDefault(); results[0].click(); }
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); results[0].focus(); }
    if (e.key === 'Escape') { clearSearchField(); onSearchInput(''); input.blur(); }
  });
  body.addEventListener('keydown', e => {
    if (!e.target.classList?.contains('result')) return;
    const results = $$('.result', body), i = results.indexOf(e.target);
    const inPlan = Boolean(e.target.closest('#planSuggest'));
    if (e.key === 'ArrowDown') { e.preventDefault(); results[Math.min(i + 1, results.length - 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i === 0 ? (inPlan ? $(`[data-plan-field="${state.plan.focus}"]`) : input) : results[i - 1])?.focus(); }
  });
  $('#searchClear').addEventListener('click', () => { clearSearchField(); onSearchInput(''); input.focus(); });
}

/* ======================================================================
 * 8. Popovers, intro, location, startup
 * ==================================================================== */

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function closePopovers() {
  $('#layersPopover').hidden = true;
  $('#layersButton').setAttribute('aria-expanded', 'false');
  $('#menu').hidden = true;
  $('#menuButton').setAttribute('aria-expanded', 'false');
}

function persistAgencies() { store.set(STORAGE.agencies, [...state.visible]); }

function renderAgencyToggles() {
  $('#agencyToggles').innerHTML = state.network.agencies.map(a => `<label class="toggle-row"><span class="dot" style="background:${esc(a.color)}"></span><span>${esc(a.name)} <small>${plural(a.routes.length, 'line')}</small></span><input type="checkbox" data-agency-toggle="${esc(a.id)}" ${state.visible.has(a.id) ? 'checked' : ''} /><i aria-hidden="true"></i></label>`).join('');
}

function bindChrome() {
  $('#layersButton').addEventListener('click', e => {
    e.stopPropagation();
    const pop = $('#layersPopover');
    const open = pop.hidden;
    closePopovers();
    pop.hidden = !open;
    $('#layersButton').setAttribute('aria-expanded', String(open));
    if (open && isMobile() && state.detent !== 'peek') setDetent('peek');
    if (open) pop.querySelector('[aria-checked="true"]')?.focus();
  });
  $('#layersClose').addEventListener('click', () => { closePopovers(); $('#layersButton').focus(); });
  $$('[data-map-mode]').forEach(b => b.addEventListener('click', () => setMapMode(b.dataset.mapMode)));
  $('#layersPopover').addEventListener('change', e => {
    const id = e.target.dataset.agencyToggle;
    if (id) {
      if (e.target.checked) state.visible.add(id); else state.visible.delete(id);
      persistAgencies();
      if (state.selectedKey && !state.visible.has(idx.routes.get(state.selectedKey)?.a.id)) goHome();
      applyMapState();
      if (['home', 'search'].includes(currentView().name)) render();
    }
    if (e.target.id === 'vehiclesToggle') { state.showVehicles = e.target.checked; store.set(STORAGE.vehicles, state.showVehicles); applyMapState(); }
    if (e.target.id === 'busToggle') { state.showBus = e.target.checked; store.set(STORAGE.busLines, state.showBus); applyMapState(); }
    if (e.target.id === 'railToggle') { state.showRail = e.target.checked; store.set(STORAGE.railLines, state.showRail); applyMapState(); }
  });
  $('#vehiclesToggle').checked = state.showVehicles;
  $('#busToggle').checked = state.showBus;
  $('#railToggle').checked = state.showRail;
  $('#layersReset').addEventListener('click', () => {
    state.visible = new Set(state.network.agencies.map(a => a.id));
    state.showBus = true; state.showRail = true;
    persistAgencies(); store.set(STORAGE.busLines, true); store.set(STORAGE.railLines, true);
    $('#busToggle').checked = true; $('#railToggle').checked = true;
    renderAgencyToggles(); applyMapState();
    if (['home', 'search'].includes(currentView().name)) render();
    $('#layersPopover').querySelector('[aria-checked="true"]')?.focus();
  });

  $('#menuButton').addEventListener('click', e => {
    e.stopPropagation();
    const menu = $('#menu');
    const open = menu.hidden;
    closePopovers();
    menu.hidden = !open;
    $('#menuButton').setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector('button')?.focus();
  });
  $('#menu').addEventListener('click', e => {
    const item = e.target.closest('[data-menu]');
    if (!item) return;
    closePopovers();
    if (item.dataset.menu === 'intro') showIntro(0);
    else { clearSearchField(); pushView({ name: item.dataset.menu }, { detent: 'full' }); }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#layersPopover, #layersButton, #menu, #menuButton')) closePopovers();
  });

  $('#zoomIn').addEventListener('click', () => state.map?.zoomIn());
  $('#zoomOut').addEventListener('click', () => state.map?.zoomOut());
  $('#locateButton').addEventListener('click', () => state.nav ? navChangeFollow('follow') : locate());

  document.addEventListener('keydown', e => {
    const typing = /input|select|textarea/i.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing) { e.preventDefault(); $('#searchInput').focus(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); }
    if (e.key === 'Escape' && state.mapPick) { endMapPick(null); return; }
    if (e.key === 'Escape' && !typing) {
      if (!$('#layersPopover').hidden || !$('#menu').hidden) closePopovers();
      else if (!$('#intro').hidden) finishIntro();
      else if (state.stack.length > 1 && currentView().name !== 'navigate') popView();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSpeaking();
    else {
      loadRealtime();
      if (state.nav) {
        if (state.nav.fix && Date.now() - state.nav.fix.time > 30000) state.nav.status = 'Refreshing GPS after returning to Rove…';
        navFollowCamera();
        // Patch in place: a full re-render here would move VoiceOver focus every time the phone unlocks.
        updateGuideLive();
      }
    }
  });
}

let geolocateControl = null;
function locate({ thenPick = null } = {}) {
  if (!('geolocation' in navigator)) { toast('Location is not available in this browser.'); return; }
  locate.pendingPick = thenPick;
  if (geolocateControl && state.mapReady) geolocateControl.trigger();
  else navigator.geolocation.getCurrentPosition(onPosition, onPositionError, { enableHighAccuracy: true, timeout: 12000 });
}
function onPosition(pos) {
  const first = !state.userLocation;
  state.userLocation = [pos.coords.longitude, pos.coords.latitude];
  state.accessLocationFix = {accuracy:pos.coords.accuracy,time:pos.timestamp||Date.now()};
  if(currentView().name==='accessNearby') { render(); announceAccess('Nearby stops updated. Location accuracy approximately '+Math.round(pos.coords.accuracy)+' metres.'); }
  $('#locateButton').classList.add('active');
  const pick = locate.pendingPick;
  locate.pendingPick = null;
  const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
  if (!inServiceArea(here)) {
    if (first || pick) toast('You are outside the Bay Area. Search for a Bay Area place to plan a trip.');
    if (pick) return;
  }
  if (pick && currentView().name === 'plan') { state.plan[pick] = currentLocationPlace(); afterPick(); return; }
  if (first && ['home'].includes(currentView().name)) render();
}

/* When location permission was already granted, open the map where the rider is, as long as
 * that is inside the Bay Area. */
function centerOnGrantedLocation() {
  navigator.geolocation.getCurrentPosition(pos => {
    onPosition(pos);
    const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    if (!state.map || !inServiceArea(here)) return;
    const center = () => { if (currentView().name === 'home') state.map.easeTo({ center: [here.lon, here.lat], zoom: Math.max(state.map.getZoom(), 14), padding: cameraPadding(), duration: motionMs(900) }); };
    const whenReady = () => (state.mapReady ? center() : setTimeout(whenReady, 300));
    whenReady();
  }, () => {}, { timeout: 10000, maximumAge: 60000 });
}
function onPositionError(err) {
  locate.pendingPick = null;
  toast(err?.code === 1 ? 'Location is off. Search for a stop or line to get started.' : 'Your location could not be found. Please try again.');
}

/* The introduction: four short cards, each with a small illustration that plays once.
 * With reduced motion, the illustrations show their finished state and nothing moves. */
const INTRO = [
  {
    title: '1. Find your stop',
    text: 'Tap Search. Type a station, bus line, or address. Pick a result.',
    art: `<svg viewBox="0 0 280 120"><rect class="ia-field" x="20" y="14" width="240" height="30" rx="9"/><circle class="ia-ink-stroke" cx="37" cy="29" r="6"/><path class="ia-ink-stroke" d="m41.5 33.5 4 4"/><text class="ia-type" x="56" y="34">38R</text><rect class="ia-caret" x="83" y="21" width="1.6" height="16" rx=".8"/>
      <g class="ia-row" style="--d:.55s"><rect x="20" y="56" width="240" height="26" rx="7" class="ia-card"/><rect x="30" y="62" width="34" height="14" rx="4" fill="#bf2b45"/><text x="38" y="73" class="ia-badge-text">38R</text><rect x="72" y="65" width="120" height="7" rx="3.5" class="ia-bar"/></g>
      <g class="ia-row" style="--d:.75s"><rect x="20" y="88" width="240" height="26" rx="7" class="ia-card"/><circle cx="40" cy="101" r="6" class="ia-pin"/><rect x="72" y="97" width="150" height="7" rx="3.5" class="ia-bar"/></g></svg>`
  },
  {
    title: '2. See buses on the map',
    text: 'Tap a colored line. Zoom in to see its stops and reported bus locations.',
    art: `<svg viewBox="0 0 280 120"><path class="ia-faded" d="M10 30h80l40 40h140"/><path class="ia-faded" d="M10 95c60 0 80-60 140-60s70 30 120 30"/><path class="ia-faded" d="M60 5v110"/>
      <path class="ia-draw" style="--c:#1675be" d="M10 70c40 0 50-40 100-40s60 55 160 55" pathLength="1"/><g class="ia-pop" style="--d:.9s"><circle cx="10" cy="70" r="5" class="ia-stop"/><circle cx="110" cy="30" r="5" class="ia-stop"/><circle cx="270" cy="85" r="5" class="ia-stop"/></g><circle class="ia-vehicle" r="5.5" fill="#1675be"><animateMotion dur="3.2s" repeatCount="indefinite" path="M10 70c40 0 50-40 100-40s60 55 160 55"/></circle></svg>`
  },
  {
    title: '3. Check when it arrives',
    text: 'Tap a stop for departures. Live predictions are labeled separately from scheduled times.',
    art: `<svg viewBox="0 0 280 120"><rect x="20" y="16" width="240" height="88" rx="12" class="ia-card"/><text x="40" y="66" class="ia-big">4</text><text x="42" y="84" class="ia-small">min</text><rect x="96" y="38" width="44" height="16" rx="4" fill="#f5c100"/><text x="105" y="50" class="ia-badge-text dark">Yellow</text><rect x="96" y="62" width="120" height="7" rx="3.5" class="ia-bar"/><g class="ia-live"><circle cx="102" cy="84" r="3" class="ia-live-dot"/><circle cx="102" cy="84" r="3" class="ia-live-ring"/></g><text x="112" y="88" class="ia-live-text">Live · On time</text></svg>`
  },
  {
    title: '4. Start your trip',
    text: 'Tap Directions, choose where to go, then pick a route. Navigation shows each boarding and transfer step.',
    art: `<svg viewBox="0 0 280 120"><path class="ia-walk" d="M28 92h40" pathLength="1"/><path class="ia-draw" style="--c:#005b95;--d:.35s" d="M68 92c30 0 30-40 70-40" pathLength="1"/><path class="ia-draw" style="--c:#e4002b;--d:.85s" d="M138 52c40 0 50 26 92 26" pathLength="1"/><path class="ia-walk" style="--d:1.3s" d="M230 78h22" pathLength="1"/><circle cx="28" cy="92" r="6" class="ia-from"/><rect x="246" y="72" width="12" height="12" rx="2.5" class="ia-to"/><g class="ia-pop" style="--d:.7s"><circle cx="68" cy="92" r="4.5" class="ia-stop"/><circle cx="138" cy="52" r="5.5" class="ia-stop strong"/><circle cx="230" cy="78" r="4.5" class="ia-stop"/></g></svg>`
  }
];
function showIntro(i = 0) {
  state.introIndex = i;
  const step = INTRO[i];
  $('#introStep').textContent = `${i + 1} of ${INTRO.length}`;
  $('#introTitle').textContent = step.title;
  $('#introText').textContent = step.text;
  // Re-inserting the art restarts its animation for each card.
  $('#introArt').innerHTML = prefersReducedMotion() ? step.art.replace(/<circle class="ia-vehicle"[^>]*>.*?<\/circle>/s, '<circle class="ia-vehicle" r="5.5" cx="185" cy="62" fill="#1675be"/>') : step.art;
  $('#introProgress').innerHTML = INTRO.map((_, k) => `<span class="${k === i ? 'on' : k < i ? 'done' : ''}"></span>`).join('');
  $('#introNext').textContent = i === INTRO.length - 1 ? 'Explore Rove' : 'Next step →';
  $('#introSkip').hidden = false;
  const intro = $('#intro');
  intro.hidden = false;
  intro.classList.remove('intro-in'); if (!prefersReducedMotion()) { void intro.offsetWidth; intro.classList.add('intro-in'); }
  $('#introNext').focus({ preventScroll: true });
}
function finishIntro() {
  store.set(STORAGE.intro, 'done');
  $('#intro').hidden = true;
  if (currentView().name === 'home') render();
}

function initialAgencies() {
  const savedAgencies = store.get(STORAGE.agencies, null);
  const ids = state.network.agencies.map(a => a.id);
  const chosen = Array.isArray(savedAgencies) ? savedAgencies.filter(id => ids.includes(id)) : ids;
  return new Set(chosen.length ? chosen : ids);
}

function rtConfigured() {
  const c = state.realtime?.configured;
  return c === true || Boolean(c && typeof c === 'object' && (c.feed511 || c.bartDirect));
}

function vehiclesStale() {
  const rt = state.realtime;
  return Boolean(rt?.version === 2 ? rt.feeds?.vehicles?.stale : rt?.vehicles?.stale);
}

const arrivalCache = new Map();

const placeCacheKey = place => `${place.a.id}|${place.s.id}`;

/* Returns cached arrivals for a place in one normalized shape:
 * { status: 'live'|'no-predictions'|'unverified'|'offline', groups:[{route, label, headsign, times:[{time, delay}]}], canceled:[...], feedTs, stale } */
function cachedArrivals(place) {
  if (state.realtime?.version !== 2) return legacyArrivals(place);
  return arrivalCache.get(placeCacheKey(place))?.data || null;
}

function legacyArrivals(place) {
  if (!rtConfigured()) return { status: 'offline', groups: [], canceled: [] };
  if (!coverage(place.a.id).arrivals) return { status: 'unverified', groups: [], canceled: [] };
  const groups = arrivalsForPlace(place) || [];
  return {
    status: groups.length ? 'live' : 'no-predictions',
    groups: groups.map(g => ({ route: g.route, label: g.label, headsign: null, times: g.times.filter(t => !t.skipped) })),
    canceled: [],
    feedTs: state.realtime?.updates?.headerTimestamp || null,
    stale: Boolean(state.realtime?.updates?.stale)
  };
}

async function fetchArrivals(place, { maxAgeMs = 25000 } = {}) {
  if (state.realtime?.version !== 2) return;
  const cacheKey = placeCacheKey(place);
  const cached = arrivalCache.get(cacheKey);
  if (cached && (cached.pending || Date.now() - cached.at < maxAgeMs)) return cached.pending;
  const isStation = idx.children.has(stopKey(place.a.id, place.s.id));
  const ids = isStation ? [place.s.id] : place.members.map(m => m.id).slice(0, 4);
  const task = (async () => {
    try {
      const results = await Promise.all(ids.map(id => fetch(`/api/v2/arrivals?agency=${encodeURIComponent(place.a.id)}&stop=${encodeURIComponent(id)}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)));
      const ok = results.filter(Boolean);
      if (!ok.length) throw new Error('No arrivals response');
      const statuses = ok.map(r => r.status);
      const status = statuses.includes('live') ? 'live' : statuses.every(st => st === 'unverified') ? 'unverified' : 'no-predictions';
      const seen = new Set();
      const arrivals = ok.flatMap(r => r.arrivals || []).filter(a => { const k = `${a.tripId}|${a.stopId}`; if (seen.has(k)) return false; seen.add(k); return true; });
      const groups = new Map();
      for (const a of arrivals) {
        const route = a.routeId ? idx.routes.get(routeKey(place.a.id, a.routeId)) : null;
        const gk = `${a.routeId || a.routeName}|${a.headsign || ''}`;
        if (!groups.has(gk)) groups.set(gk, { route, label: route ? null : a.routeName || AGENCY_SHORT[place.a.id] || 'Transit', headsign: a.headsign || null, unscheduled: a.scheduled === false, antioch: a.scheduled === false && /antioch line/i.test(a.note || ''), times: [] });
        groups.get(gk).times.push({ time: a.time, delay: a.delay });
      }
      const list = [...groups.values()].map(g => { g.times.sort((x, y) => x.time - y.time); return g; }).sort((x, y) => x.times[0].time - y.times[0].time);
      const canceled = ok.flatMap(r => r.canceled || []).map(c => ({ ...c, route: c.routeId ? idx.routes.get(routeKey(place.a.id, c.routeId)) : null }));
      const feed = ok.find(r => r.feed)?.feed || null;
      const data = { status, groups: list, canceled, feedTs: feed?.headerTimestamp || null, stale: ok.some(r => r.stale), reasons: ok.find(r => r.reasons)?.reasons || null };
      arrivalCache.set(cacheKey, { at: Date.now(), data });
      return data;
    } catch {
      const data = { status: 'error', groups: [], canceled: [] };
      arrivalCache.set(cacheKey, { at: Date.now() - maxAgeMs + 10000, data });
      return data;
    }
  })();
  arrivalCache.set(cacheKey, { ...(cached || {}), at: cached?.at || 0, pending: task });
  const result = await task;
  refreshLiveViews();
  return result;
}

/* Fetch arrivals for the places currently on screen, then re-render once. */
function prefetchVisibleArrivals() {
  if (state.realtime?.version !== 2 || document.hidden) return;
  const view = currentView();
  let places = [];
  if (view.name === 'stop') places = [placeFor(view.agency, view.stop)];
  else if (view.name === 'home') {
    // Avoid fan-out of per-stop 511 requests; the active stop gets priority.
    if (state.userLocation) places.push(...nearbyPlaces(state.userLocation, 1).map(n => n.place));
    places.push(...state.saved.slice(0, 1).map(x => placeFor(x.a, x.id)));
  }
  places.filter(Boolean).filter(p => state.realtime?.version === 2 ? ['muni','act'].includes(p.a.id) : coverage(p.a.id).arrivals).forEach(p => fetchArrivals(p));
}

/* A point picked on the map is named after the nearest stop when one is close. */
function placeFromPoint(lngLat) {
  const point = [lngLat.lng, lngLat.lat];
  let best = null;
  for (const entry of idx.searchable) {
    const d = distanceMeters(point, entry.s.p);
    if (d < 250 && (!best || d < best.d)) best = { d, entry };
  }
  return { kind: 'pin', name: best ? `Near ${best.entry.s.n}` : 'Pinned location', lat: point[1], lon: point[0] };
}

async function fetchPlanStatus(force = false) {
  const st = state.planStatus;
  if (!force && st && Date.now() - st.checkedAt < 60000) return st;
  let next;
  try {
    // /api/v2/status describes the whole service (routing, first-mile options, address search).
    // Older servers only have /api/v2/plan/status.
    let response = await fetch('/api/v2/status', { cache: 'no-store' });
    if (response.ok) {
      const body = await response.json().catch(() => ({}));
      const routing = body.routing || {};
      next = { available: routing.available !== false, reason: routing.available === false ? routing.code || 'ROUTING_UNAVAILABLE' : null, access: Array.isArray(routing.access) ? routing.access : ['WALK'], walkSteps: Boolean(routing.walkSteps), maxDriveMinutes: Number.isFinite(routing.maxDriveMinutes) ? routing.maxDriveMinutes : null,
        liveReasons: Object.fromEntries((Array.isArray(body.agencies) ? body.agencies : []).map(x => [x.id, Array.isArray(x.arrivalsReasons) ? x.arrivalsReasons : []])),
        liveVerified: Object.fromEntries((Array.isArray(body.agencies) ? body.agencies : []).map(x => [x.id, x.arrivals === 'verified'])) };
      if (body.search && body.search.addresses === false) geocodeBackend = 'missing';
    } else {
      response = await fetch('/api/v2/plan/status', { cache: 'no-store' });
      if (response.status === 404) next = { available: false, reason: 'missing' };
      else {
        const body = await response.json().catch(() => ({}));
        next = { available: response.ok && body.available !== false, reason: response.ok ? null : body.code || 'ROUTING_UNAVAILABLE', access: ['WALK'] };
      }
    }
  } catch {
    next = { available: false, reason: 'network' };
  }
  const changed = !st || st.available !== next.available || String(st.access) !== String(next.access);
  state.planStatus = { ...next, checkedAt: Date.now() };
  if (changed && currentView().name === 'plan') {
    if (state.plan.focus) { const el = $('#planNotice'); if (el) el.innerHTML = planNoticeHtml(); }
    else render();
  }
  return state.planStatus;
}

function planNoticeHtml() {
  const status = state.planStatus;
  if (!status || status.available) return '';
  const text = status.reason === 'missing' ? 'Trip planning is not available right now.' : 'Trip planning is offline right now. You can still choose places, then check again in a few minutes.';
  return `<div class="plan-notice" role="status"><p>${esc(text)}</p>${status.reason === 'missing' ? '' : '<button type="button" class="text-button" data-action="plan-recheck">Check again</button>'}</div>`;
}

/* Converts a /api/v2/plan itinerary (docs/API_CONTRACT.md) into the shape the views render. */
function normalizeItinerary(it) {
  const legs = (it.legs || []).map(leg => {
    const transit = Boolean(leg.transit);
    const startTime = leg.start?.estimated || leg.start?.scheduled;
    const endTime = leg.end?.estimated || leg.end?.scheduled;
    const end = p => p ? { name: displayName(p.stop?.station?.name || p.name || ''), lat: p.lat, lon: p.lon, platform: p.stop?.platform || null, stopName: p.name, parking: p.parking ? (p.parking.name || 'Parking') : null, parkingCapacity: Number.isFinite(p.parking?.capacity) ? p.parking.capacity : null } : null;
    return {
      mode: transit ? 'TRANSIT' : (leg.mode === 'CAR' ? 'CAR' : 'WALK'),
      transitMode: leg.mode,
      agencyId: leg.agency?.id || null,
      routeId: leg.route?.id || null,
      routeName: leg.route?.shortName || leg.route?.longName || null,
      routeLongName: leg.route?.longName || null,
      routeColor: leg.route?.color || null,
      routeTextColor: leg.route?.textColor || null,
      headsign: leg.headsign || leg.trip?.headsign || null,
      tripShortName: leg.trip?.shortName || null,
      from: end(leg.from),
      to: end(leg.to),
      startTime,
      endTime,
      scheduledStart: leg.start?.scheduled || startTime,
      delaySeconds: leg.start?.delaySeconds ?? null,
      realtime: Boolean(leg.realtime && leg.start?.estimated),
      canceled: Boolean(leg.canceled),
      staySeated: Boolean(leg.staySeated),
      intermediateStops: Array.isArray(leg.intermediateStops) ? leg.intermediateStops : null,
      distanceMeters: leg.distanceMeters ?? null,
      durationSeconds: leg.durationSeconds ?? null,
      geometry: leg.geometry,
      // Turn-by-turn steps, only when the server provides them (OTP legs.steps).
      steps: Array.isArray(leg.steps) ? leg.steps.filter(s => s && (s.relativeDirection || s.streetName)).map(s => ({ ...s, distanceMeters: s.distanceMeters ?? (Number.isFinite(s.distance) ? Math.round(s.distance) : null) })) : [],
      alerts: (leg.alerts || []).filter(a => a.header || a.description)
    };
  });
  return {
    id: it.id,
    startTime: it.start,
    endTime: it.end,
    durationSeconds: it.durationSeconds,
    walkMeters: it.walkMeters,
    walkSeconds: it.walkSeconds,
    waitingSeconds: it.waitingSeconds ?? null,
    transfers: it.transfers,
    usesRealtime: Boolean(it.usesRealtime),
    hasCancellation: Boolean(it.hasCancellation),
    warnings: Array.isArray(it.warnings) ? it.warnings.filter(w => typeof w === 'string') : [],
    legs
  };
}

/* "Turn left onto Hollenbeck Avenue". Built only from the planner's own step fields. */


function planErrorMessage(status, body) {
  const field = body?.field || '';
  const which = /^from/.test(field) ? 'from' : /^to/.test(field) ? 'to' : field === 'time' ? 'time' : null;
  if (status === 400) {
    const message = String(body?.error || '');
    if (/same place/i.test(message)) return { which: 'to', text: 'The starting point and destination are the same place.' };
    if (which === 'from') return { which, text: /outside/i.test(message) ? 'This starting point is outside the Bay Area. Rove plans trips within the San Francisco Bay Area.' : 'Choose the starting point again.' };
    if (which === 'to') return { which, text: /outside/i.test(message) ? 'This destination is outside the Bay Area. Rove plans trips within the San Francisco Bay Area.' : 'Choose the destination again.' };
    if (which === 'time') return { which, text: 'Choose a time within the next 60 days.' };
    return { which: null, text: 'Rove could not plan this trip. Check the places and time, then try again.' };
  }
  if (status === 503) return { which: null, text: 'Trip planning is offline right now. Please try again in a few minutes.', offline: true };
  if (status === 404) return { which: null, text: 'Trip planning is not available right now.', offline: true };
  return { which: null, text: 'Trip planning ran into a problem. Please try again.' };
}

function legAlertsHtml(leg) {
  if (!leg.alerts?.length) return '';
  return leg.alerts.slice(0, 2).map(a => `<span class="row-meta leg-alert">${ICONS.alert}<span>${esc(a.header || a.description)}</span></span>`).join('');
}

/* Advances walk and ride steps when the rider reaches the end of the leg. Riders can always
 * move between steps with the buttons; this only saves taps. */
function checkBlindExit(nav,manual=false) {
  const step=nav.steps[nav.i];
  if (!step || step.type!=='ride') { if(manual)announceAccess('Select the riding step first.'); return; }
  const stop=step.leg?.to;
  const helper=window.RoveBlindNavigation;
  const proximity=helper?.exitProximity(nav.fix,stop);
  const message=helper?.stopMessage(step.title,stop?.name||'your exit stop',proximity)||'GPS stop proximity is unavailable.';
  nav.exitHint=message;
  if (manual || (proximity?.near && !nav.exitAlerted)) {
    if(proximity?.near)nav.exitAlerted=true;
    if(proximity?.near)accessVibrate([200,120,200,120,200]);
    if(manual || document.body.classList.contains('rove-accessible'))speakText(message);
    else announceAccess(message);
  }
}
/* GPS near the exit stop gives one advisory nudge per ride. It never confirms or advances anything. */
function guideGpsHint(nav) {
  const phase = guidePhase(nav);
  if (phase?.kind !== 'ride' || !window.RoveBlindNavigation) return;
  const stop = phase.leg?.to;
  const p = RoveBlindNavigation.exitProximity(nav.fix, stop);
  const key = `${nav.gs.index}:gps`;
  if (!p?.near || nav.gs.given[key]) return;
  nav.gs = Guide.reduce(nav.gs, { type: 'REMINDED', key });
  nav.alert = { key, level: 'exit', index: nav.gs.index, message: `GPS estimate: ${phase.place} may be close. Confirm with the announcement before getting off.` };
  accessVibrate([200, 120, 200]);
  guideSay(nav.alert.message);
  saveTrip(nav);
}
function onNavPosition(pos) {
  const nav = state.nav;
  if (!nav) return;
  const fix = { point: [pos.coords.longitude, pos.coords.latitude],
    accuracy: pos.coords.accuracy, time: pos.timestamp || Date.now(),
    speed: pos.coords.speed, heading: pos.coords.heading };
  if (Date.now() - fix.time > 30000 || !RoveNavigation.validFix(nav.fix, fix)) return;
  if (!inServiceArea({ lon: fix.point[0], lat: fix.point[1] })) return;
  const previous = nav.fix;
  nav.fix = fix;
  nav.tracking = true;
  state.userLocation = fix.point;
  state.accessLocationFix = {accuracy:fix.accuracy,time:fix.time};
  const seconds = previous ? (fix.time - previous.time) / 1000 : 0;
  // When actual sensor heading is unavailable, infer heading only after real movement.
  const moved = previous ? RoveNavigation.meters(previous.point, fix.point) : 0;
  const heading = Number.isFinite(fix.heading) && fix.speed > 1.2 ? fix.heading :
    moved >= Math.max(8, fix.accuracy) && seconds > 0 ? RoveNavigation.bearing(previous.point, fix.point) : nav.heading;
  if (Number.isFinite(heading)) nav.heading = heading;
  nav.status = nav.follow ? 'Following your location' : 'Tracking GPS · map exploration paused following';
  updateNavMarker(fix, Number.isFinite(nav.compassHeading) ? nav.compassHeading : nav.heading);
  navFollowCamera();
  guideGpsHint(nav);
  const distance = routeLegDistance(nav, fix.point);
  if (distance != null && fix.accuracy <= 75 && distance > Math.max(85, fix.accuracy * 2.5)) {
    nav.offRouteFixes = seconds < 20 ? nav.offRouteFixes + 1 : 1;
  } else nav.offRouteFixes = 0;
  updateNavManeuver(nav, fix);
  if (RoveNavigation.shouldReroute(fix, distance, nav.offRouteFixes, Date.now() - nav.rerouteAt)) {
    navReroute(nav);
  } else updateGuideLive();
}

/* Small start and end markers for the trip being planned. */
const planMarkers = { from: null, to: null };

function updatePlanMarkers() {
  if (!state.map || typeof maplibregl === 'undefined') return;
  const active = ['plan', 'results', 'navigate'].includes(currentView().name) || state.mapPick;
  for (const which of ['from', 'to']) {
    const p = state.plan[which];
    if (!active || !p || p.kind === 'location') { planMarkers[which]?.remove(); planMarkers[which] = null; continue; }
    if (!planMarkers[which]) {
      const el = document.createElement('div');
      el.className = `plan-marker plan-marker-${which}`;
      el.setAttribute('aria-hidden', 'true');
      planMarkers[which] = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(state.map);
    } else planMarkers[which].setLngLat([p.lon, p.lat]);
  }
}

function startMapPick(which) {
  if (window.innerWidth <= 800) {
    announceAccess('Use the accessible search field to choose a location.');
    document.getElementById(which === 'from' ? 'planFrom' : 'planTo')?.focus();
    return;
  }
  state.mapPick = which;
  state.plan.focus = null;
  const banner = $('#mapPick');
  $('#mapPickText').textContent = which === 'from' ? 'Tap the map to set the starting point.' : 'Tap the map to set the destination.';
  banner.hidden = false;
  document.body.classList.add('map-picking');
  if (isMobile()) setDetent('peek');
  $('#mapPickCancel').focus({ preventScroll: true });
}

function endMapPick(lngLat) {
  const which = state.mapPick;
  state.mapPick = null;
  $('#mapPick').hidden = true;
  document.body.classList.remove('map-picking');
  if (!which) return;
  if (lngLat) {
    const p = placeFromPoint(lngLat);
    state.plan[which] = p;
    state.plan.draft[which] = '';
    if (state.plan.errorField === which) { state.plan.error = null; state.plan.errorField = null; }
    refinePointName(p);
  }
  if (isMobile()) setDetent('full');
  render();
  updatePlanMarkers();
}

/* Replaces "Near <stop>" with the street address once the reverse geocoder answers. */


const GEOCODER = {
  backend: '/api/v2/places/search',
  backendReverse: '/api/v2/places/reverse',
  autocomplete: 'https://api.stadiamaps.com/geocoding/v1/autocomplete',
  search: 'https://api.stadiamaps.com/geocoding/v1/search',
  reverse: 'https://api.stadiamaps.com/geocoding/v1/reverse',
  photon: 'https://photon.komoot.io/api/',
  photonReverse: 'https://photon.komoot.io/reverse',
  attribution: {
    stadia: 'Address search by Stadia Maps, using OpenStreetMap, OpenAddresses, and Who’s On First',
    photon: 'Address search by Photon from Komoot, using OpenStreetMap data',
    rove: 'Address data © OpenStreetMap contributors'
  }
};

/* Stadia Maps is the primary geocoder. If Stadia refuses a request (401 or 403, for example when
 * the site's domain is not registered or the account's quota is used up), Rove switches to the
 * public Photon geocoder for the rest of the session, so address search keeps working. */
let geocodeProvider = 'stadia';
let geocodeSource = 'stadia';
const geocodeAttribution = () => GEOCODER.attribution[geocodeSource] || GEOCODER.attribution.stadia;

/* A result from Rove's /api/v2/places/search (docs/API_CONTRACT.md). */
const ROVE_KIND_LAYER = { address: 'address', poi: 'venue', street: 'street', area: 'locality', station: 'station', stop: 'stop' };
function normalizeRovePlace(r) {
  if (!r || !Number.isFinite(r.lat) || !Number.isFinite(r.lon) || !r.name) return null;
  const detail = r.approximate && r.note ? r.note : [r.category && r.kind !== 'address' && r.kind !== 'area' ? r.category : null, r.address].filter(Boolean).join(' · ');
  return { kind: 'place', id: r.id || `${r.lat},${r.lon}`, name: r.name, detail, layer: ROVE_KIND_LAYER[r.kind] || 'venue', lat: r.lat, lon: r.lon, approximate: Boolean(r.approximate) };
}

function normalizePhotonFeature(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = p.name || street || p.city;
  if (!name) return null;
  const isLocality = ['city', 'town', 'village', 'suburb', 'neighbourhood'].includes(p.osm_value) && p.osm_key === 'place';
  const detail = [p.name && street ? street : null, p.city && p.city !== name ? p.city : null].filter(Boolean).join(', ');
  return { kind: 'place', id: `photon:${p.osm_type || ''}${p.osm_id || `${lat},${lon}`}`, name, detail, layer: isLocality ? 'locality' : (!p.name && p.housenumber ? 'address' : 'venue'), lat, lon };
}

/* Drops repeats of the same name within about 150 m (one stop is often mapped twice). */
function dedupePlaces(list) {
  const out = [];
  for (const p of list) if (!out.some(q => q.name === p.name && distanceMeters([p.lon, p.lat], [q.lon, q.lat]) < 150)) out.push(p);
  return out;
}

async function photonGeocode(q, { signal, size }) {
  const params = new URLSearchParams({ q, limit: String(size + 2), lang: 'en', bbox: [SERVICE_AREA.minLon, SERVICE_AREA.minLat, SERVICE_AREA.maxLon, SERVICE_AREA.maxLat].join(',') });
  const response = await fetch(`${GEOCODER.photon}?${params}`, { signal });
  if (response.status === 429) throw new Error('rate-limited');
  if (!response.ok) throw new Error(`geocoder ${response.status}`);
  const body = await response.json();
  return dedupePlaces((body.features || []).map(normalizePhotonFeature).filter(p => p && inServiceArea(p))).slice(0, size);
}

const PLACES_KEY = { recent: 'rove-recent-places-v1', saved: 'rove-saved-places-v1' };

const geocodeCache = new Map();

let geocodeBackend = 'unknown';

/* The point sent to a backend address-search proxy, if one exists: the rider's location, or the
 * part of the map they are looking at. It is rounded to about 1 km before it leaves the browser.
 * Stadia and Photon are not sent a point (see geocode). */
function geocodeBias() {
  const center = state.userLocation || (state.map ? state.map.getCenter().toArray() : [-122.27, 37.8]);
  return { center };
}

function normalizeGeocodeFeature(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry?.coordinates || [];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const name = p.name || p.label || 'Unnamed place';
  const detail = String(p.label || '').replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')},?\\s*`), '').replace(/, (United States|USA)$/, '');
  return { kind: 'place', id: p.gid || `${lat},${lon}`, name, detail, layer: p.layer || 'place', lat, lon };
}

async function geocode(query, { signal, mode = 'autocomplete', size = 6 } = {}) {
  const q = query.trim();
  const cacheKey = `${mode}|${q.toLowerCase()}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);
  const { center } = geocodeBias();
  // Rove's own place index (addresses, businesses, landmarks, stations; OpenStreetMap and GTFS)
  // comes first. When the server has no address index, Stadia and Photon take over.
  if (geocodeBackend !== 'missing') {
    try {
      const params = new URLSearchParams({ q, limit: String(Math.max(size, 6)), near: `${center[1].toFixed(2)},${center[0].toFixed(2)}` });
      const r = await fetch(`${GEOCODER.backend}?${params}`, { signal });
      if ([404, 501, 503].includes(r.status)) geocodeBackend = 'missing';
      else if (r.ok) {
        const body = await r.json();
        if (body.addressSearch !== 'available') geocodeBackend = 'missing';
        else {
          geocodeBackend = 'available';
          const results = dedupePlaces((body.results || []).map(normalizeRovePlace).filter(p => p && inServiceArea(p)));
          geocodeCache.set(cacheKey, promoteAddressMatch(results, q));
          geocodeSource = 'rove';
          return geocodeCache.get(cacheKey);
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
  }
  if (geocodeProvider === 'stadia') {
    // No focus point: in testing, a focus point let nearby businesses that merely contain the
    // words outrank the place itself (typing "Oakland" in San Francisco listed bridge viewpoints
    // before the city). The Bay Area rectangle already keeps results local.
    const params = new URLSearchParams({
      text: q, size: String(size), lang: 'en',
      'boundary.rect.min_lat': String(SERVICE_AREA.minLat), 'boundary.rect.max_lat': String(SERVICE_AREA.maxLat),
      'boundary.rect.min_lon': String(SERVICE_AREA.minLon), 'boundary.rect.max_lon': String(SERVICE_AREA.maxLon)
    });
    let response = null;
    try {
      response = await fetch(`${mode === 'search' ? GEOCODER.search : GEOCODER.autocomplete}?${params}`, { signal });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
    if (response && response.status === 429) throw new Error('rate-limited');
    if (response && response.ok) {
      const body = await response.json();
      const results = dedupePlaces((body.features || []).map(normalizeGeocodeFeature).filter(p => p && inServiceArea(p)));
      geocodeCache.set(cacheKey, promoteAddressMatch(results, q));
      geocodeSource = 'stadia';
      return geocodeCache.get(cacheKey);
    }
    // Not authorized for this domain: use Photon for the rest of the session. A network error or
    // server error: use Photon for this request only.
    if (response && [401, 403].includes(response.status)) geocodeProvider = 'photon';
    else if (response && response.status < 500) throw new Error(`geocoder ${response.status}`);
  }
  const results = await photonGeocode(q, { signal, size });
  geocodeCache.set(cacheKey, promoteAddressMatch(results, q));
  geocodeSource = 'photon';
  return geocodeCache.get(cacheKey);
}

async function reverseGeocode(lat, lon) {
  const signal = AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined;
  const near = place => (place && distanceMeters([lon, lat], [place.lon, place.lat]) < 120 ? place : null);
  try {
    if (geocodeBackend !== 'missing') {
      const response = await fetch(`${GEOCODER.backendReverse}?${new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6) })}`, { signal }).catch(() => null);
      if (response?.ok) return near(normalizeRovePlace((await response.json()).result));
    }
    if (geocodeProvider === 'stadia') {
      const params = new URLSearchParams({ 'point.lat': lat.toFixed(6), 'point.lon': lon.toFixed(6), size: '1', layers: 'address,venue,street', lang: 'en' });
      const response = await fetch(`${GEOCODER.reverse}?${params}`, { signal }).catch(() => null);
      if (response?.ok) { const f = (await response.json()).features?.[0]; return near(f ? normalizeGeocodeFeature(f) : null); }
      if (response && ![401, 403].includes(response.status) && response.status < 500) return null;
      if (response && [401, 403].includes(response.status)) geocodeProvider = 'photon';
    }
    const response = await fetch(`${GEOCODER.photonReverse}?${new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6), limit: '1', lang: 'en' })}`, { signal });
    if (!response.ok) return null;
    const f = (await response.json()).features?.[0];
    return near(f ? normalizePhotonFeature(f) : null);
  } catch { return null; }
}

/* Debounced, cancelable autocomplete shared by the main search and the trip fields. */

const autocomplete = { timer: null, controller: null, query: '', status: 'idle', results: [], target: null };

function requestAutocomplete(query, target) {
  const q = query.trim();
  autocomplete.commitOnResults = null;
  clearTimeout(autocomplete.timer);
  autocomplete.controller?.abort();
  autocomplete.query = q; autocomplete.target = target;
  if (q.length < 3) { autocomplete.status = 'idle'; autocomplete.results = []; return; }
  const cached = geocodeCache.get(`autocomplete|${q.toLowerCase()}`);
  if (cached) { autocomplete.status = 'done'; autocomplete.results = cached; return; }
  autocomplete.status = 'loading'; autocomplete.results = [];
  autocomplete.timer = setTimeout(async () => {
    const controller = new AbortController();
    autocomplete.controller = controller;
    try {
      const results = await geocode(q, { signal: controller.signal });
      if (autocomplete.query !== q) return;
      autocomplete.status = 'done'; autocomplete.results = results;
    } catch (error) {
      if (error.name === 'AbortError' || autocomplete.query !== q) return;
      autocomplete.status = error.message === 'rate-limited' ? 'limited' : 'error'; autocomplete.results = [];
    }
    onAutocompleteResults(target);
  }, 220);
}

function onAutocompleteResults(target) {
  if (target === 'search' && currentView().name === 'search') render();
  if ((target === 'from' || target === 'to') && currentView().name === 'plan' && state.plan.focus === target) {
    updatePlanSuggestions();
    if (autocomplete.commitOnResults === target) { autocomplete.commitOnResults = null; commitPlanField(target); }
    if (target === 'to' && state.plan.voicePending) voiceResultsReady();
  }
}

function placeKey(p) { return p.kind === 'stop' ? `stop:${p.agency}:${p.stop}` : `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`; }

function recentPlaces() { return store.get(PLACES_KEY.recent, []).filter(p => Number.isFinite(p?.lat)); }

function savedPlaces() { return store.get(PLACES_KEY.saved, []).filter(p => Number.isFinite(p?.lat)); }

function rememberPlace(p) {
  if (!p || p.kind === 'location') return;
  const entry = { kind: p.kind, name: p.name, detail: p.detail || '', lat: p.lat, lon: p.lon, agency: p.agency, stop: p.stop, layer: p.layer };
  const list = recentPlaces().filter(x => placeKey(x) !== placeKey(entry));
  store.set(PLACES_KEY.recent, [entry, ...list].slice(0, 8));
}

function savePlace(p, label) {
  const entry = { kind: p.kind, name: p.name, detail: p.detail || '', lat: p.lat, lon: p.lon, agency: p.agency, stop: p.stop, layer: p.layer, label };
  let list = savedPlaces().filter(x => placeKey(x) !== placeKey(entry));
  if (label === 'Home' || label === 'Work') list = list.filter(x => x.label !== label);
  store.set(PLACES_KEY.saved, [...list, entry].sort((a, b) => ['Home', 'Work'].indexOf(b.label) - ['Home', 'Work'].indexOf(a.label)));
}

function unsavePlace(p) { store.set(PLACES_KEY.saved, savedPlaces().filter(x => placeKey(x) !== placeKey(p))); }

function savedLabel(p) { return savedPlaces().find(x => placeKey(x) === placeKey(p))?.label || null; }

const PLACE_ICON = {
  saved: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="m10 2.8 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 8.1l5-.7Z"/></svg>',
  recent: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/></svg>',
  place: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17.5s5.5-5 5.5-9.5a5.5 5.5 0 0 0-11 0c0 4.5 5.5 9.5 5.5 9.5Z"/><circle cx="10" cy="8" r="2"/></svg>',
  location: '<svg viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" stroke="none" d="M10 2.5 16.5 16 10 12.8 3.5 16Z" transform="rotate(45 10 10)"/></svg>',
  map: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 5 4.5-1.8 5 1.8L17 3.2v11.8l-4.5 1.8-5-1.8L3 16.8Z"/><path d="M7.5 3.2v11.8M12.5 5v11.8"/></svg>'
};

function placeOptionRow(p, action, icon, extra = '') {
  const data = Object.entries({ lat: p.lat, lon: p.lon, name: p.name, detail: p.detail || '', kind: p.kind, agency: p.agency || '', stop: p.stop || '', layer: p.layer || '' }).map(([k, v]) => `data-p-${k}="${esc(v)}"`).join(' ');
  const fixedLabel = p.label === 'Home' || p.label === 'Work';
  const meta = fixedLabel ? [p.name, p.detail].filter(Boolean).join(' · ') : p.detail || (p.kind === 'stop' ? AGENCY_SHORT[p.agency] || '' : '');
  return `<li><button type="button" class="row result place-row" data-action="${action}" ${data} ${extra}><span class="place-icon ${icon === 'saved' ? 'is-saved' : ''}">${PLACE_ICON[icon] || PLACE_ICON.place}</span><span class="row-main"><span class="row-title">${esc(p.label === 'Home' || p.label === 'Work' ? p.label : p.name)}</span>${meta ? `<span class="row-meta">${esc(meta.replace(/ · $/, ''))}</span>` : ''}</span></button></li>`;
}

function placeFromRow(el) {
  const d = el.dataset;
  return { kind: d.pKind || 'place', name: d.pName, detail: d.pDetail || '', lat: Number(d.pLat), lon: Number(d.pLon), agency: d.pAgency || undefined, stop: d.pStop || undefined, layer: d.pLayer || undefined };
}

function autocompleteSectionHtml(action) {
  const a = autocomplete;
  if (a.query.length < 3) return '';
  let body;
  if (a.status === 'loading') body = '<li aria-hidden="true"><div class="row skeleton-row"><span class="sk sk-icon"></span><span class="row-main"><span class="sk sk-line"></span><span class="sk sk-line short"></span></span></div></li>'.repeat(3);
  else if (a.status === 'error') body = '<li><p class="empty">Address search is unavailable right now. You can still choose a stop, your location, or a point on the map.</p></li>';
  else if (a.status === 'limited') body = '<li><p class="empty">Address search is busy. Please wait a moment and try again.</p></li>';
  else if (!a.results.length) body = `<li><p class="empty">No addresses or places match “${esc(a.query)}” in the Bay Area.</p></li>`;
  else {
    // Stations already listed under "Stops and stations" are not repeated here.
    const listed = a.query.length >= 2 ? searchNetwork(a.query, { routes: false, stopLimit: 8 }).stops : [];
    const shown = a.results.filter(p => !(['station', 'stop'].includes(p.layer) && listed.some(({ s }) => distanceMeters(s.p, [p.lon, p.lat]) < 300)));
    if (!shown.length) return '';
    body = shown.map(p => placeOptionRow(p, action, 'place')).join('');
  }
  return `<section class="section suggest-section"><h2 class="label">Addresses and places</h2><ul class="rows" aria-busy="${a.status === 'loading'}">${body}</ul><p class="attribution-note">${esc(geocodeAttribution())}</p></section>`;
}

/* ---------- Place view: an address or point of interest chosen from search ---------- */

function openPlace(p) {
  closePopovers();
  clearSearchField();
  rememberPlace(p);
  pushView({ name: 'place', place: p }, { detent: 'half' });
  showPlacePin(p);
  state.map?.easeTo({ center: [p.lon, p.lat], zoom: Math.max(state.map.getZoom(), 15.5), padding: cameraPadding(), duration: motionMs(700) });
}

let placePin = null;

function showPlacePin(p) {
  placePin?.remove(); placePin = null;
  if (!p || !state.map || typeof maplibregl === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'place-pin';
  el.innerHTML = '<i></i>';
  el.setAttribute('aria-hidden', 'true');
  placePin = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lon, p.lat]).addTo(state.map);
}

function viewPlace({ place: p }) {
  const label = savedLabel(p);
  const covered = inServiceArea(p);
  const nearby = covered ? nearbyPlaces([p.lon, p.lat], 4) : [];
  const d = state.userLocation ? distanceLabel(distanceMeters(state.userLocation, [p.lon, p.lat])) : '';
  return `${backHeader()}
    <div class="hero">
      <h1 class="title-1">${esc(p.name)}</h1>
      ${[p.detail, d ? `${d} away` : ''].some(Boolean) ? `<p class="caption">${esc([p.detail, d ? `${d} away` : ''].filter(Boolean).join(' · '))}</p>` : ''}
    </div>
    ${covered ? `<div class="action-bar">
      <button class="button primary" data-action="place-directions">Directions</button>
      <button class="button secondary" data-action="place-from">Leave from here</button>
    </div>` : `<p class="plan-coverage place-coverage" role="status">This place is outside the Bay Area. Rove shows transit and plans trips within the San Francisco Bay Area.</p>`}
    <div class="inline-actions save-actions" style="padding:8px var(--pad) 0">
      ${label ? `<button class="text-button" data-action="place-unsave">Remove from saved (${esc(label)})</button>` : `<button class="text-button" data-action="place-save" data-label="Home">Set as Home</button><button class="text-button" data-action="place-save" data-label="Work">Set as Work</button><button class="text-button" data-action="place-save" data-label="Saved">Save place</button>`}
    </div>
    ${covered ? `<section class="section"><h2 class="label">Nearby stops</h2>${nearby.length ? `<ul class="rows">${nearby.map(n => placeRow(n.place, distanceLabel(n.d))).join('')}</ul>` : '<p class="empty">No stops within a mile of this place.</p>'}</section>` : ''}`;
}

function matchingPersonalPlaces(q, limit = 3) {
  const needle = normalizeSearch(q);
  const seen = new Set();
  const out = [];
  for (const [p, icon] of [...savedPlaces().map(p => [p, 'saved']), ...recentPlaces().map(p => [p, 'recent'])]) {
    const key = placeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    const hay = normalizeSearch(`${p.label || ''} ${p.name} ${p.detail || ''}`);
    if (!needle || hay.includes(needle)) out.push([p, icon]);
    if (out.length >= limit) break;
  }
  return out;
}

function updatePlanSuggestions() {
  const plan = state.plan;
  const box = $('#planSuggest');
  const form = $('.plan-form');
  if (!box || !form) return;
  form.classList.toggle('suggesting', Boolean(plan.focus));
  for (const which of ['from', 'to']) $(`[data-plan-field="${which}"]`)?.setAttribute('aria-expanded', String(plan.focus === which));
  if (!plan.focus) { box.innerHTML = ''; return; }
  const q = plan.query.trim();
  const other = plan[plan.focus === 'from' ? 'to' : 'from'];
  const sections = [];
  const top = [];
  if (currentLocationPlace() && other?.kind !== 'location' && (!q || 'your location'.startsWith(q.toLowerCase()))) top.push(placeOptionRow({ kind: 'location', name: 'Your location', lat: state.userLocation[1], lon: state.userLocation[0] }, 'plan-pick-location', 'location'));
  else if (!state.userLocation && !q && 'geolocation' in navigator) top.push(`<li><button type="button" class="row result place-row" data-action="plan-locate"><span class="place-icon">${PLACE_ICON.location}</span><span class="row-main"><span class="row-title">Use my location</span><span class="row-meta">Your browser will ask for permission</span></span></button></li>`);
  for (const [p, icon] of matchingPersonalPlaces(q, q ? 3 : 6)) top.push(placeOptionRow(p, 'plan-place', icon));
  if (top.length) sections.push(`<ul class="rows">${top.join('')}</ul>`);
  let stops = [];
  if (q.length >= 2) {
    const localMatches = searchNetwork(q, { routes: false, stopLimit: 4 });
    stops = localMatches.stops;
    if (localMatches.correction) sections.push(`<p class="search-correction" role="status">Showing stops for <strong>${esc(localMatches.correction)}</strong></p>`);
    if (stops.length) sections.push(`<section class="section suggest-section"><h2 class="label">Stops and stations</h2><ul class="rows">${stops.map(({ a, s }) => `<li><button type="button" class="row result" data-action="plan-pick" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">${badgesFor(sortRoutes(routesForStop(a.id, s.id)), 3)}<span class="row-main"><span class="row-title">${highlight(s.n, q)}</span><span class="row-meta">${esc(AGENCY_SHORT[a.id])}</span></span></button></li>`).join('')}</ul></section>`);
  }
  const places = autocomplete.target === plan.focus ? autocompleteSectionHtml('plan-place') : '';
  if (places) {
    if (!stationsLead(q, stops)) sections.splice(top.length ? 1 : 0, 0, places); else sections.push(places);
  }
  if (q.length > 0 && q.length < 3 && !sections.length) sections.push('<p class="empty">Keep typing to search addresses and places.</p>');
  if (window.innerWidth > 800) sections.push(`<ul class="rows"><li><button type="button" class="row result place-row" data-action="plan-map"><span class="place-icon">${PLACE_ICON.map}</span><span class="row-main"><span class="row-title">Choose on map</span><span class="row-meta">Tap any point on the map</span></span></button></li></ul>`);
  box.innerHTML = sections.join('');
}

/* Moves addresses whose house number matches the query to the top of the list. */
function promoteAddressMatch(results, text) {
  const best = bestGeocodeMatch(results, text);
  return best && best !== results[0] ? [best, ...results.filter(p => p !== best)] : results;
}

/* For text that starts with a house number, prefer a real address with that number over the
 * nearby intersections and businesses geocoders often rank first. */
function bestGeocodeMatch(results, text) {
  const number = /^(\d+[a-z]?)\s+\S/i.exec(text.trim())?.[1];
  if (number) {
    const address = results.find(p => p.layer === 'address' && p.name.toLowerCase().startsWith(`${number.toLowerCase()} `));
    if (address) return address;
  }
  return results[0] || null;
}

/* Resolves text the rider typed but did not pick from the list. Exact stop names win, then
 * the geocoder's best match. Nothing is guessed: if neither finds it, the field is flagged. */

async function resolveDraft(which) {
  const plan = state.plan;
  const text = plan.draft[which].trim();
  if (!text) return null;
  if (/^your location$/i.test(text) && state.userLocation) return currentLocationPlace();
  const needle = normalizeSearch(text);
  const personal = matchingPersonalPlaces(text, 6).find(([p]) => normalizeSearch(p.name) === needle || normalizeSearch(p.label || '') === needle);
  if (personal) return { ...personal[0] };
  const exact = searchNetwork(text, { routes: false, stopLimit: 8 }).stops.find(({ s }) => normalizeSearch(s.n) === needle);
  if (exact) return placeFromStop(exact.a.id, exact.s.id);
  const cached = autocomplete.query === text && autocomplete.status === 'done' ? bestGeocodeMatch(autocomplete.results, text) : null;
  if (cached) return cached;
  try {
    const results = await geocode(text, { mode: 'search', size: 5, signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    const best = bestGeocodeMatch(results, text);
    if (best) return best;
  } catch (error) {
    throw new PlanError('Address search is unavailable right now. Choose a suggestion, a stop, or a point on the map.', which);
  }
  throw new PlanError(`We could not find “${text}” in the Bay Area. Check the address, or choose a suggestion or a point on the map.`, which);
}

function noRouteMessage(body) {
  const code = body?.errors?.[0]?.code || '';
  if (code === 'WALKING_BETTER_THAN_TRANSIT') return 'These places are close enough that walking is faster than transit.';
  if (code === 'OUTSIDE_SERVICE_PERIOD') return 'Schedules are not available for that date. Choose a date closer to today.';
  if (code === 'OUTSIDE_BOUNDS') return 'One of these places is outside the Bay Area. Rove plans trips within the San Francisco Bay Area.';
  if (code === 'NO_STOPS_IN_RANGE' || code === 'LOCATION_NOT_FOUND') return 'One of these places is too far from a transit stop to plan a trip. Try a nearby address or stop.';
  if (code === 'NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW') {
    // The planner reports the next real timetable departure when service has a gap (for example overnight).
    const gap = body?.routing?.serviceGap;
    const leave = Date.parse(gap?.nextPracticalDeparture), arrive = Date.parse(gap?.nextPracticalArrival);
    if (Number.isFinite(leave)) return `No practical transit connection near this time. The next practical trip leaves at ${clock(new Date(leave))}${Number.isFinite(arrive) ? ` and arrives at ${clock(new Date(arrive))}` : ''}, by the published schedule.`;
    return 'No practical transit connection near this time. Service may be limited overnight. Try a later departure time.';
  }
  if (code === 'NO_TRANSIT_CONNECTION' || !body?.errors?.[0]?.message) return 'No transit connection was found. Try a different departure time or a nearby transit stop.';
  return body.errors[0].message;
}

/* A city or neighborhood picked as an end point is routed from its center, which can be far from
 * where the rider is going. Say so, rather than presenting it as door to door. */
const AREA_LAYERS = new Set(['locality', 'localadmin', 'borough', 'neighbourhood', 'macrohood', 'county', 'region', 'postalcode']);
function areaNoteHtml() {
  const { from, to } = state.plan;
  const areas = [from, to].filter(p => p && AREA_LAYERS.has(p.layer));
  if (!areas.length) return '';
  let text;
  if (areas.length === 2) text = `“${from.name}” and “${to.name}” are areas, not addresses, so these routes use their centers. Enter street addresses for exact door-to-door directions.`;
  else if (areas[0] === from) text = `“${from.name}” is an area, not an address, so these routes start at its center. Enter a street address for exact door-to-door directions.`;
  else text = `“${to.name}” is an area, not an address, so these routes end at its center. Enter a street address for exact door-to-door directions.`;
  return `<p class="area-note">${esc(text)}</p>`;
}

/* Indexes of plan.results.itineraries in the order chosen by plan.sort. */

function sortedItineraryIndexes(sort = state.plan.sort) {
  const plan = state.plan;
  const its = plan.results?.itineraries || [];
  const arriveBy = plan.results?.request?.arriveBy;
  const ms = v => new Date(v).getTime();
  const fastest = (a, b) => (arriveBy ? ms(b.startTime) - ms(a.startTime) : ms(a.endTime) - ms(b.endTime)) || (a.durationSeconds - b.durationSeconds);
  const transfersOf = it => (Number.isFinite(it.transfers) ? it.transfers : 99);
  const by = {
    fastest,
    transfers: (a, b) => transfersOf(a) - transfersOf(b) || fastest(a, b),
    walking: (a, b) => (a.walkMeters ?? 1e9) - (b.walkMeters ?? 1e9) || fastest(a, b)
  }[sort || 'fastest'];
  return its.map((it, i) => [it, i]).sort((x, y) => by(x[0], y[0]) || x[1] - y[1]).map(([, i]) => i);
}

function legShapeMissing(leg) {
  if (!isTransit(leg)) return false;
  const c = leg.geometry?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return true;
  return c.length === 2 && (leg.intermediateStops?.length || 0) > 0;
}


function focusLeg(i, { scroll = false } = {}) {
  const it = state.journey;
  const leg = it?.legs?.[i];
  if (!leg) return;
  state.focusLeg = state.focusLeg === i ? null : i;
  renderJourney();
  if (currentView().name === 'results') {
    render();
    if (scroll) requestAnimationFrame(() => $(`.timeline [data-leg="${i}"]`)?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
  }
  if (state.focusLeg == null) { fitJourney(it); return; }
  const c = leg.geometry?.coordinates;
  fitCoordinates(Array.isArray(c) && c.length >= 2 ? c : [[leg.from?.lon, leg.from?.lat], [leg.to?.lon, leg.to?.lat]], 16);
}

function journeyPointFeatures(itinerary) {
  if (!itinerary) return { type: 'FeatureCollection', features: [] };
  const legs = itinerary.legs || [];
  const out = [];
  const add = (p, kind, color, legIndex, name) => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
    const near = out.find(f => distanceMeters(f.geometry.coordinates, [p.lon, p.lat]) < 40);
    if (near) { if (near.properties.kind !== 'parking' && near.properties.kind !== 'dropoff') near.properties.kind = 'transfer'; return; }
    out.push({ type: 'Feature', properties: { kind, color, name: name || p.name || '', legIndex }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } });
  };
  legs.forEach((leg, i) => {
    // Park and ride ends at a mapped lot; a drop-off ends at a street near the station.
    if (leg.mode === 'CAR') { add(leg.to, leg.to?.parking ? 'parking' : 'dropoff', theme().ink, i, leg.to?.parking ? 'Park and ride' : 'Drop-off'); return; }
    if (!isTransit(leg)) return;
    const color = legInfo(leg).color;
    if (!leg.staySeated) add(leg.from, 'board', color, i);
    const next = legs[i + 1];
    if (!(isTransit(next) && next.staySeated)) add(leg.to, 'alight', color, i);
  });
  return { type: 'FeatureCollection', features: out };
}


function setPlanFocus(which) {
  const plan = state.plan;
  if (plan.focus === which) return;
  plan.focus = which;
  plan.query = which ? (plan[which] ? '' : plan.draft[which]) : '';
  if (which) requestAutocomplete(plan.query, which);
  updatePlanSuggestions();
}

/* Enter in a trip field: take the first suggestion, or move on to finding routes. */

function commitPlanField(which) {
  const plan = state.plan;
  if (plan.draft[which].trim() && autocomplete.target === which && autocomplete.status === 'loading') { autocomplete.commitOnResults = which; return; }
  const first = $('#planSuggest .result:not([data-action="plan-map"]):not([data-action="plan-locate"])');
  if (plan.draft[which].trim() && first) { handleAction(first); return; }
  if (!plan.draft[which].trim() && plan[which] && which === 'from' && !plan.to && !plan.draft.to) { $('#planTo')?.focus(); return; }
  setPlanFocus(null);
  submitPlan();
}

async function refinePointName(p) {
  const found = await reverseGeocode(p.lat, p.lon);
  if (!found) return;
  p.name = found.name; p.detail = found.detail;
  const inPlan = state.plan.from === p || state.plan.to === p;
  if (inPlan && currentView().name === 'plan') {
    for (const which of ['from', 'to']) {
      const input = $(`[data-plan-field="${which}"]`);
      if (state.plan[which] === p && input && document.activeElement !== input) input.value = p.name;
    }
  }
}

/* ---------- Service area ----------
 * Rove covers the San Francisco Bay Area. These bounds match PLAN_BOUNDS in the backend's
 * lib/routing/otp.mjs, so every place address search returns can also be routed. */
const SERVICE_AREA = { minLat: 36.9, maxLat: 38.2, minLon: -122.75, maxLon: -121.4 };

function inServiceArea(p) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
  return p.lat >= SERVICE_AREA.minLat && p.lat <= SERVICE_AREA.maxLat && p.lon >= SERVICE_AREA.minLon && p.lon <= SERVICE_AREA.maxLon;
}

/* Whether a trip between the chosen places can be planned. Returns null when it can. */
function planCoverageIssue() {
  const { from, to } = state.plan;
  const outFrom = from && !inServiceArea(from), outTo = to && !inServiceArea(to);
  const note = 'Rove plans trips within the San Francisco Bay Area.';
  if (outFrom && outTo) return { field: 'both', text: `Both places are outside the Bay Area. ${note}` };
  if (outFrom) return { field: 'from', text: `This starting point is outside the Bay Area. ${note}` };
  if (outTo) return { field: 'to', text: `This destination is outside the Bay Area. ${note}` };
  return null;
}

const MODE_ICONS = {
  walk: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10.6" cy="3.6" r="1.6" fill="currentColor" stroke="none"/><path d="M9.6 7.2 7.4 9.4v3M9.6 7.2l2.2 2.6 2.4.9M9.6 7.2l-.8 5.2 2.8 2.6 1.1 3.3M8.8 12.4l-2 2.8-2.2 2.4"/></svg>',
  car: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M4.2 9.2 5.6 5.4c.2-.6.8-1 1.4-1h6c.6 0 1.2.4 1.4 1l1.4 3.8"/><rect x="2.8" y="9.2" width="14.4" height="5.4" rx="1.4"/><path d="M5 14.6v1.6M15 14.6v1.6"/><circle cx="6.2" cy="11.9" r=".9" fill="currentColor" stroke="none"/><circle cx="13.8" cy="11.9" r=".9" fill="currentColor" stroke="none"/></svg>',
  bus: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="2.8" width="12" height="12.6" rx="2"/><path d="M4 9.2h12M4 6h12M6.2 15.4v1.8M13.8 15.4v1.8"/><circle cx="7" cy="12.4" r=".9" fill="currentColor" stroke="none"/><circle cx="13" cy="12.4" r=".9" fill="currentColor" stroke="none"/></svg>',
  train: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 12.6V6.4C5 4 7.2 2.6 10 2.6s5 1.4 5 3.8v6.2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"/><path d="M5 8.4h10M10 2.8v5.6M7.4 14.6l-2.2 2.8M12.6 14.6l2.2 2.8"/><circle cx="7.6" cy="11.4" r=".9" fill="currentColor" stroke="none"/><circle cx="12.4" cy="11.4" r=".9" fill="currentColor" stroke="none"/></svg>',
  tram: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 2.6h6M10 2.6v2.2"/><rect x="5" y="4.8" width="10" height="10" rx="2.2"/><path d="M5 9.6h10M7.6 14.8l-1.8 2.6M12.4 14.8l1.8 2.6"/><circle cx="7.8" cy="12.2" r=".8" fill="currentColor" stroke="none"/><circle cx="12.2" cy="12.2" r=".8" fill="currentColor" stroke="none"/></svg>',
  ferry: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.4 12.4h13.2l-1.8 3.4H5.2Z"/><path d="M5.6 12.4V8.6h8.8v3.8M8 8.6V6h4v2.6"/><path d="M2.6 17.6c1.2 0 1.2-.7 2.4-.7s1.2.7 2.4.7 1.2-.7 2.4-.7 1.2.7 2.4.7 1.2-.7 2.4-.7 1.2.7 2.4.7"/></svg>',
  parking: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="3.4" y="3.4" width="13.2" height="13.2" rx="2.6"/><path d="M8.2 14V6.2h2.6a2.3 2.3 0 0 1 0 4.6H8.2"/></svg>',
  directions: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.4 17.6 10 10 17.6 2.4 10Z"/><path d="M8 12.2V9.6h4M10.6 7.6 12.6 9.6l-2 2"/></svg>',
  home: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.4 9.2 10 3.6l6.6 5.6M5.2 7.8v8.4h3.6v-4.6h2.4v4.6h3.6V7.8"/></svg>',
  work: '<svg class="mode-icon" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.8" y="6.4" width="14.4" height="10" rx="1.8"/><path d="M7.4 6.4V5a1.4 1.4 0 0 1 1.4-1.4h2.4A1.4 1.4 0 0 1 12.6 5v1.4M2.8 10.6h14.4"/></svg>'
};

function modeIcon(leg) {
  if (leg.mode === 'WALK') return MODE_ICONS.walk;
  if (leg.mode === 'CAR') return MODE_ICONS.car;
  const m = leg.transitMode;
  if (m === 'BUS' || m === 'TROLLEYBUS' || m === 'COACH') return MODE_ICONS.bus;
  if (m === 'TRAM' || m === 'CABLE_CAR' || m === 'FUNICULAR') return MODE_ICONS.tram;
  if (m === 'FERRY') return MODE_ICONS.ferry;
  return MODE_ICONS.train;
}

/* Where a drive leg ends, in words. OSM parking names are often generic ("P+R"), so those
 * are described by the station the rider walks to next. */
function parkingLabel(leg, legs) {
  const name = leg.to?.parking || '';
  const next = legs ? legs[legs.indexOf(leg) + 1] : null;
  const station = next?.mode === 'WALK' ? next.to?.name : null;
  // A drive that does not end at a parking lot is a drop-off.
  if (!name) return `the drop-off point near ${station || leg.to?.name || 'the station'}`;
  if (name && !/^(p\s*\+\s*r|p\s*&\s*r|park\s*(and|&|n)\s*ride|parking|parking lot)$/i.test(name.trim())) return /parking|garage|\blot\b/i.test(name) ? name : `${name} parking`;
  if (station) return `the park-and-ride lot at ${station}`;
  return leg.to?.name || 'the park-and-ride lot';
}

const legMinutes = leg => Math.max(1, Math.round(((leg.durationSeconds ?? (legEnd(leg) - legStart(leg)) / 1000)) / 60));

const isTransit = leg => leg?.mode === 'TRANSIT';

/* Converts a /api/v2/plan itinerary (docs/API_CONTRACT.md) into the shape the views render. */

const STEP_VERBS = {
  LEFT: 'Turn left', RIGHT: 'Turn right', SLIGHTLY_LEFT: 'Bear left', SLIGHTLY_RIGHT: 'Bear right',
  HARD_LEFT: 'Turn sharp left', HARD_RIGHT: 'Turn sharp right', CONTINUE: 'Continue', UTURN_LEFT: 'Make a U-turn', UTURN_RIGHT: 'Make a U-turn',
  CIRCLE_CLOCKWISE: 'At the roundabout, take the exit', CIRCLE_COUNTERCLOCKWISE: 'At the roundabout, take the exit'
};

function stepText(s) {
  if (s.instruction) return s.instruction;
  const street = s.streetName && !/^(?:path|bike path|footpath|sidewalk|service road|steps|parking aisle|open area|corridor|footbridge|underpass|crosswalk|elevator|ramp|link|road|track|alley|bridleway|way\s+\d+(?:\s+from\s+\d+)?)$/i.test(s.streetName.trim()) ? s.streetName : null;
  const where = street ? ` onto ${street}` : '';
  switch (s.relativeDirection) {
    case 'DEPART': return `Head ${String(s.absoluteDirection || '').toLowerCase().replace('_', ' ') || 'out'}${street ? ` on ${street}` : ''}`;
    case 'ELEVATOR': return 'Take the elevator';
    case 'ENTER_STATION': return 'Enter the station';
    case 'EXIT_STATION': return 'Exit the station';
    case 'FOLLOW_SIGNS': return 'Follow the signs';
    case 'ENTER_OR_EXIT_STATION': return 'Enter or exit the station';
    default: return `${STEP_VERBS[s.relativeDirection] || 'Continue'}${where}`;
  }
}

function stepsListHtml(leg, label) {
  if (!leg.steps || leg.steps.length < 2) return '';
  return `<details class="turns"><summary>${esc(label)}<span class="caption">${plural(leg.steps.length, 'step')}</span></summary><ol>${leg.steps.map(s => `<li><span>${esc(stepText(s))}</span>${s.distanceMeters ? `<span class="caption">${esc(distanceLabel(s.distanceMeters))}</span>` : ''}</li>`).join('')}</ol></details>`;
}

/* The compact sequence on each route option: walk 4 › Local 655 › Yellow › walk 1. */

function driveSupported(mode = 'CAR_PARKING') {
  return Boolean(state.planStatus?.available && state.planStatus?.access?.includes(mode));
}

function setFirstMile(key) {
  const plan = state.plan;
  if (key !== 'WALK' && !driveSupported(key)) { plan.driveNote = true; render(); return; }
  plan.access = key; plan.driveNote = false;
  store.set('rove-first-mile-v1', key);
  render();
}

/* @@INSERT */
/* ---------- Map status (offline, basemap outage) ---------- */
const mapStatus = { tiles: null, offline: null };
function showMapStatus() {
  const el = $('#mapStatus');
  if (!el) return;
  const text = mapStatus.offline || mapStatus.tiles;
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('warn', Boolean(mapStatus.offline));
}
function clearMapStatus(kind) { if (mapStatus[kind]) { mapStatus[kind] = null; showMapStatus(); } }
let tileFailures = [];
function noteTileFailure() {
  const now = Date.now();
  tileFailures = tileFailures.filter(t => now - t < 15000).concat(now);
  if (tileFailures.length < 3 || mapStatus.tiles) return;
  mapStatus.tiles = state.mapMode === 'satellite' ? 'Satellite imagery is not loading. Transit lines and stops are still shown.' : 'Map details are not loading. Transit lines and stops are still shown.';
  showMapStatus();
}
function updateOnlineStatus() {
  mapStatus.offline = navigator.onLine ? null : 'You are offline. Saved places and loaded lines still work; live times and trip planning will return when you reconnect.';
  showMapStatus();
}
window.addEventListener('offline', updateOnlineStatus);
window.addEventListener('online', () => { updateOnlineStatus(); loadRealtime(); });

async function init() {
  document.body.classList.add('rove-accessible');
  // Start the basemap request while the transit network downloads and indexes.
  // Avoid the previous serial network -> index -> style waterfall on slow phones.
  const savedMode = store.get(STORAGE.mapMode, null);
  const mode = ['standard', 'satellite', 'dark'].includes(savedMode) ? savedMode : 'standard';
  const stylePromise = typeof maplibregl === 'undefined' ? null : fetchStyle(mode);
  try {
    const response = await fetch('public/data/network.json');
    if (!response.ok) throw new Error(`The transit network could not be loaded (${response.status}).`);
    state.network = await response.json();
  } catch (error) {
    $('#mapLoading').innerHTML = `<span>${esc(error.message || 'The transit network could not be loaded.')}</span>`;
    return;
  }
  buildIndexes(state.network);
  state.visible = initialAgencies();
  renderAgencyToggles();
  setupSheet();
  bindPanel();
  bindChrome();
  setDetent(isMobile() ? (window.innerHeight < 560 ? 'peek' : 'half') : 'half');
  render();

  state.mapMode = mode;
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('map-satellite', mode === 'satellite');
  $$('[data-map-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mapMode === mode)));

  if (typeof maplibregl === 'undefined') {
    $('#mapLoading').innerHTML = '<span>The map could not be loaded. Search and stop information still work.</span>';
  } else {
    const style = await stylePromise;
    state.map = new maplibregl.Map({
      container: 'map',
      style,
      center: [-122.2, 37.7],
      zoom: isMobile() ? 8.6 : 9.3,
      maxZoom: 18.5,
      maxBounds: [[SERVICE_AREA.minLon - 0.6, SERVICE_AREA.minLat - 0.4], [SERVICE_AREA.maxLon + 0.6, SERVICE_AREA.maxLat + 0.4]],
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: false
    });
    state.map.touchZoomRotate.disableRotation();
    state.map.addControl(new maplibregl.AttributionControl({ compact: isMobile(), customAttribution: isMobile() ? 'Transit data: 511.org and agencies' : 'Transit data: 511.org, BART, AC Transit, VTA, Caltrain, SFMTA' }), 'bottom-left');
    geolocateControl = new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: true, fitBoundsOptions: { maxZoom: 15.5 } });
    state.map.addControl(geolocateControl, 'top-right');
    geolocateControl.on('geolocate', onPosition);
    geolocateControl.on('error', onPositionError);
    state.map.on('style.load', () => { if (!state.map.getSource('transit-routes')) addTransitLayers(); });
    // 'load' waits for every tile and label font. If a font host is slow or down, still open the
    // map once the style and transit layers are in place, rather than leaving the spinner up.
    const markReady = () => {
      if (state.mapReady) return;
      state.mapReady = true;
      $('#mapLoading').classList.add('done');
      setupMapInteractions();
      // The introduction waits for the map, so its first card never sits on a loading screen.
      // Help remains available on demand; do not interrupt the map on first visit.
    };
    state.map.on('load', markReady);
    setTimeout(() => { if (state.map.isStyleLoaded() || state.map.getSource('transit-routes')) markReady(); }, 8000);
    state.map.on('error', e => {
      if (e?.error?.status !== 404) console.warn('Map error:', e?.error?.message || e);
      // Basemap or imagery tiles failing (not fonts or Rove's own data) is said on the map, once.
      if (e?.sourceId && !['transit-routes', 'transit-stops', 'transit-stop-labels', 'vehicles', 'vehicle-labels', 'journey', 'journey-points', 'journey-point-labels'].includes(e.sourceId)) noteTileFailure();
    });
    state.map.on('data', e => { if (e.dataType === 'source' && e.tile && !/^(transit|vehicle|journey)/.test(e.sourceId || '')) clearMapStatus('tiles'); });
  }

  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') centerOnGrantedLocation(); }).catch(() => {});
  }

  $('#introSkip').addEventListener('click', finishIntro);
  $('#introNext').addEventListener('click', () => (state.introIndex < INTRO.length - 1 ? showIntro(state.introIndex + 1) : finishIntro()));

  loadRealtime();
  fetchPlanStatus();
  probeVoiceServer();
  updateOnlineStatus();
  state.realtimeTimer = setInterval(loadRealtime, 60000);
  setInterval(() => { if (!document.hidden) { prefetchVisibleArrivals(); refreshLiveViews(); } }, 30000);
  setInterval(guideTick, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) guideTick(); });
  window.addEventListener('online', updateGuideLive);
  window.addEventListener('offline', updateGuideLive);
  $('#mapPickCancel').addEventListener('click', () => endMapPick(null));
}

init();
