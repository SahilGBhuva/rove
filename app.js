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
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
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
const STORAGE = { saved: 'rove-saved-v2', intro: 'rove-tour-v2', agencies: 'rove-agencies-v1', mapMode: 'rove-map-mode-v1', vehicles: 'rove-vehicles-v1' };

const state = {
  network: null,
  map: null,
  mapMode: 'standard',
  mapReady: false,
  glyphFont: ['Noto Sans Regular'],
  visible: new Set(),
  showVehicles: store.get(STORAGE.vehicles, true),
  selectedKey: null,
  journey: null,
  realtime: null,
  realtimeTimer: null,
  userLocation: null,
  saved: store.get(STORAGE.saved, []),
  stack: [{ name: 'home' }],
  searchQuery: '',
  detent: 'half',
  plan: { from: null, to: null, timeMode: 'now', dateTime: '', results: null, error: null, loading: false, expanded: 0, focus: null, query: '' },
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
  searchable: []
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
      idx.searchable.push({ a, s, haystack: normalizeSearch(`${s.n} ${a.name}`) });
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

function coverage(agencyId) {
  const fromServer = state.realtime?.meta?.coverage?.[agencyId];
  return { ...(DEFAULT_COVERAGE[agencyId] || { vehicles: false, arrivals: false }), ...(fromServer || {}) };
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
  if (!rt?.configured || !rt.vehicles?.items) return [];
  const out = [];
  for (const v of rt.vehicles.items) {
    if (!Number.isFinite(v.lat) || !Number.isFinite(v.lon) || (v.lat === 0 && v.lon === 0)) continue;
    const res = resolveItem(v);
    if (!res || !coverage(res.agencyId).vehicles) continue;
    const label = res.route ? null : tripLabel(res.agencyId, v);
    if (!res.route && !label) continue;
    out.push({ v, agencyId: res.agencyId, route: res.route, label });
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

function activeAlerts({ agencyId, routeKeys = [], stopIds = null }) {
  const items = state.realtime?.alerts?.items || [];
  const now = nowSec();
  const routeIds = new Set(routeKeys.map(k => k.split('::')[1]));
  return items.filter(alert => {
    const active = !alert.activePeriods?.length || alert.activePeriods.some(p => (!p.start || p.start <= now) && (!p.end || p.end >= now));
    if (!active || !alert.entities?.length) return false;
    return alert.entities.some(e => {
      const agencyOp = splitRealtimeId(e.agencyId).op || String(e.agencyId || '').toUpperCase();
      const route = splitRealtimeId(e.routeId), stop = splitRealtimeId(e.stopId);
      const entityAgency = OPERATOR_TO_AGENCY[agencyOp] || OPERATOR_TO_AGENCY[route.op] || OPERATOR_TO_AGENCY[stop.op] || null;
      if (entityAgency !== agencyId) return false;
      if (e.routeId && !routeIds.has(route.local)) return false;
      if (e.stopId && (!stopIds || !stopIds.has(stop.local))) return false;
      return true;
    });
  });
}

function realtimeAge() {
  const rt = state.realtime;
  return rt?.vehicles?.headerTimestamp || rt?.updates?.headerTimestamp || null;
}

async function loadRealtime() {
  if (document.hidden) return;
  try {
    const response = await fetch('/api/realtime', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Realtime returned ${response.status}`);
    state.realtime = await response.json();
  } catch (error) {
    console.warn('Realtime unavailable:', error.message);
    if (state.realtime) state.realtime = { ...state.realtime, fetchFailed: true };
  }
  renderVehicles();
  refreshLiveViews();
}

/* ======================================================================
 * 5. Map styles and layers
 * ==================================================================== */
const OPENFREEMAP_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const MAP_STYLES = {
  standard: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark'
};
/* Esri World Imagery. Review Esri's terms before any public launch. */
const SATELLITE_STYLE = {
  version: 8,
  glyphs: OPENFREEMAP_GLYPHS,
  sources: {
    imagery: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], attribution: 'Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community' },
    labels: { type: 'raster', tileSize: 256, maxzoom: 19, tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], attribution: 'Labels: Esri, HERE, Garmin, © OpenStreetMap contributors' }
  },
  layers: [
    { id: 'imagery', type: 'raster', source: 'imagery', paint: { 'raster-saturation': -0.25, 'raster-brightness-max': 0.78, 'raster-contrast': 0.05 } },
    { id: 'reference-labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } }
  ]
};
const fallbackStyle = dark => ({ version: 8, glyphs: OPENFREEMAP_GLYPHS, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#121315' : '#f6f4ef' } }] });

const THEME = {
  light: { surface: '#ffffff', ink: '#111214', bus: '#7b8088', faded: '#a9adb3', stopStroke: '#111214', journeyWalk: '#2f6bff', halo: '#ffffff' },
  dark: { surface: '#16171a', ink: '#f2f1ee', bus: '#7d8189', faded: '#4a4c51', stopStroke: '#f2f1ee', journeyWalk: '#5c8bff', halo: '#16171a' }
};
const theme = () => (state.mapMode === 'dark' ? THEME.dark : THEME.light);

async function fetchStyle(mode) {
  if (mode === 'satellite') return SATELLITE_STYLE;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const response = await fetch(MAP_STYLES[mode], { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Style returned ${response.status}`);
    const style = await response.json();
    for (const layer of style.layers || []) {
      if (/poi|housenumber|aerodrome_label|airport/i.test(layer.id)) layer.layout = { ...(layer.layout || {}), visibility: 'none' };
    }
    return style;
  } catch (error) {
    console.warn('Basemap unavailable, using a plain background:', error.message);
    return fallbackStyle(mode === 'dark');
  }
}

function routeFeatures() {
  const features = [];
  for (const info of idx.routes.values()) {
    for (const shape of info.r.shapes || []) {
      if (!shape || shape.length < 2) continue;
      features.push({ type: 'Feature', properties: { key: info.key, agency: info.a.id, cat: info.cat, color: info.color }, geometry: { type: 'LineString', coordinates: shape } });
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

function addTransitLayers() {
  const map = state.map;
  if (map.getSource('transit-routes')) return;
  const style = map.getStyle();
  const firstSymbol = style.layers.find(l => l.type === 'symbol');
  const labelFont = firstSymbol?.layout?.['text-font'];
  if (Array.isArray(labelFont) && labelFont.length) state.glyphFont = labelFont;
  const before = firstSymbol?.id;
  const t = theme();

  map.addSource('transit-routes', { type: 'geojson', data: routeFeatures(), tolerance: 0.6 });
  map.addSource('transit-stops', { type: 'geojson', data: stopFeatures() });
  map.addSource('vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('journey', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

  const line = { type: 'line', source: 'transit-routes', layout: { 'line-cap': 'round', 'line-join': 'round' } };
  map.addLayer({ ...line, id: 'tr-bus', minzoom: 11.5, filter: ['==', ['get', 'cat'], 'bus'], paint: { 'line-color': t.bus, 'line-width': ['interpolate', ['linear'], ['zoom'], 11.5, 0.7, 14, 1.4, 17, 2.6], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.5, 0.38] } }, before);
  map.addLayer({ ...line, id: 'tr-light', minzoom: 9.5, filter: ['==', ['get', 'cat'], 'light'], paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 9.5, 1.1, 13, 2.4, 16, 4], 'line-opacity': 0.75 } }, before);
  map.addLayer({ ...line, id: 'tr-heavy-casing', filter: ['==', ['get', 'cat'], 'heavy'], paint: { 'line-color': t.surface, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5, 16, 8], 'line-opacity': 0.9 } }, before);
  map.addLayer({ ...line, id: 'tr-heavy', filter: ['==', ['get', 'cat'], 'heavy'], paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.6, 12, 3, 16, 5], 'line-opacity': 0.92 } }, before);
  map.addLayer({ ...line, id: 'tr-selected-casing', filter: ['==', ['get', 'key'], ''], paint: { 'line-color': t.surface, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 5, 12, 8, 16, 11] } }, before);
  map.addLayer({ ...line, id: 'tr-selected', filter: ['==', ['get', 'key'], ''], paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3, 12, 5, 16, 7] } }, before);

  map.addLayer({ id: 'journey-casing', type: 'line', source: 'journey', filter: ['==', ['get', 'mode'], 'TRANSIT'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.surface, 'line-width': 9 } });
  map.addLayer({ id: 'journey-transit', type: 'line', source: 'journey', filter: ['==', ['get', 'mode'], 'TRANSIT'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5.5 } });
  map.addLayer({ id: 'journey-walk', type: 'line', source: 'journey', filter: ['!=', ['get', 'mode'], 'TRANSIT'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.journeyWalk, 'line-width': 3.5, 'line-dasharray': [0.2, 2] } });

  const stopPaint = (radius, strokeWidth) => ({ 'circle-radius': radius, 'circle-color': t.surface, 'circle-stroke-color': t.stopStroke, 'circle-stroke-width': strokeWidth });
  map.addLayer({ id: 'st-bus', type: 'circle', source: 'transit-stops', minzoom: 15, filter: ['all', ['==', ['get', 'cat'], 'bus'], ['==', ['get', 'child'], 0]], paint: { ...stopPaint(['interpolate', ['linear'], ['zoom'], 15, 2.5, 17, 4.5], 1.2), 'circle-stroke-color': t.bus } });
  map.addLayer({ id: 'st-light', type: 'circle', source: 'transit-stops', minzoom: 12, filter: ['all', ['==', ['get', 'cat'], 'light'], ['==', ['get', 'child'], 0]], paint: stopPaint(['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 5], 1.6) });
  map.addLayer({ id: 'st-heavy', type: 'circle', source: 'transit-stops', minzoom: 9.5, filter: ['all', ['==', ['get', 'cat'], 'heavy'], ['==', ['get', 'child'], 0]], paint: stopPaint(['interpolate', ['linear'], ['zoom'], 9.5, 2.6, 12, 4, 16, 6.5], 2) });
  map.addLayer({ id: 'st-selected', type: 'circle', source: 'transit-stops', filter: ['==', ['get', 'id'], '__none__'], paint: { ...stopPaint(['interpolate', ['linear'], ['zoom'], 9, 3, 14, 5.5], 2.4), 'circle-stroke-color': ['get', 'color'] } });
  map.addLayer({ id: 'st-place', type: 'circle', source: 'transit-stops', filter: ['==', ['get', 'id'], '__none__'], paint: { 'circle-radius': 9, 'circle-color': t.ink, 'circle-stroke-color': t.surface, 'circle-stroke-width': 3 } });

  const labelLayout = size => ({ 'text-field': ['get', 'name'], 'text-font': state.glyphFont, 'text-size': size, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true });
  const labelPaint = { 'text-color': t.ink, 'text-halo-color': t.halo, 'text-halo-width': 1.6 };
  map.addLayer({ id: 'st-heavy-label', type: 'symbol', source: 'transit-stops', minzoom: 11.5, filter: ['all', ['==', ['get', 'cat'], 'heavy'], ['==', ['get', 'child'], 0]], layout: labelLayout(12), paint: labelPaint });
  map.addLayer({ id: 'st-light-label', type: 'symbol', source: 'transit-stops', minzoom: 14, filter: ['all', ['==', ['get', 'cat'], 'light'], ['==', ['get', 'child'], 0]], layout: labelLayout(12), paint: labelPaint });
  map.addLayer({ id: 'st-selected-label', type: 'symbol', source: 'transit-stops', minzoom: 12.5, filter: ['==', ['get', 'id'], '__none__'], layout: labelLayout(12), paint: labelPaint });

  const vehiclePaint = radius => ({
    'circle-radius': radius,
    'circle-color': ['get', 'color'],
    'circle-stroke-color': t.surface,
    'circle-stroke-width': 2,
    'circle-opacity': ['case', ['get', 'stale'], 0.4, 1],
    'circle-stroke-opacity': ['case', ['get', 'stale'], 0.4, 1]
  });
  map.addLayer({ id: 'veh-rail', type: 'circle', source: 'vehicles', minzoom: 10.5, filter: ['in', ['get', 'cat'], ['literal', ['heavy', 'light']]], paint: vehiclePaint(['interpolate', ['linear'], ['zoom'], 10.5, 4, 15, 7]) });
  map.addLayer({ id: 'veh-bus', type: 'circle', source: 'vehicles', minzoom: 13.5, filter: ['==', ['get', 'cat'], 'bus'], paint: vehiclePaint(['interpolate', ['linear'], ['zoom'], 13.5, 4, 17, 7]) });
  map.addLayer({ id: 'veh-selected', type: 'circle', source: 'vehicles', filter: ['==', ['get', 'key'], '__none__'], paint: vehiclePaint(['interpolate', ['linear'], ['zoom'], 9, 5, 15, 8]) });
  map.addLayer({ id: 'veh-label', type: 'symbol', source: 'vehicles', minzoom: 15.5, filter: ['==', ['get', 'key'], '__none__'], layout: { 'text-field': ['get', 'badge'], 'text-font': state.glyphFont, 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-optional': true }, paint: labelPaint });

  applyMapState();
  renderVehicles();
  renderJourney();
}

const ROUTE_LAYERS = ['tr-bus', 'tr-light', 'tr-heavy-casing', 'tr-heavy'];
const STOP_LAYERS = ['st-bus', 'st-light', 'st-heavy', 'st-heavy-label', 'st-light-label'];
const VEHICLE_LAYERS = ['veh-rail', 'veh-bus'];

/* Applies agency visibility, line selection, and journey focus to every layer. */
function applyMapState() {
  const map = state.map;
  if (!map?.getLayer('tr-heavy')) return;
  const t = theme();
  const agencies = ['literal', [...state.visible]];
  const inAgencies = ['in', ['get', 'agency'], agencies];
  const focusKey = state.selectedKey;
  const journeyActive = Boolean(state.journey);
  const dimmed = Boolean(focusKey) || journeyActive;

  const catFilter = { 'tr-bus': 'bus', 'tr-light': 'light', 'tr-heavy-casing': 'heavy', 'tr-heavy': 'heavy' };
  for (const id of ROUTE_LAYERS) map.setFilter(id, ['all', ['==', ['get', 'cat'], catFilter[id]], inAgencies]);

  map.setPaintProperty('tr-bus', 'line-color', dimmed ? t.faded : t.bus);
  map.setPaintProperty('tr-bus', 'line-opacity', dimmed ? 0.18 : ['interpolate', ['linear'], ['zoom'], 11.5, 0, 12.5, 0.38]);
  for (const id of ['tr-light', 'tr-heavy']) {
    map.setPaintProperty(id, 'line-color', dimmed ? t.faded : ['get', 'color']);
    map.setPaintProperty(id, 'line-opacity', dimmed ? (journeyActive ? 0.22 : 0.3) : (id === 'tr-light' ? 0.75 : 0.92));
  }
  map.setPaintProperty('tr-heavy-casing', 'line-opacity', dimmed ? 0 : 0.9);

  const selFilter = focusKey ? ['==', ['get', 'key'], focusKey] : ['==', ['get', 'key'], ''];
  map.setFilter('tr-selected-casing', selFilter);
  map.setFilter('tr-selected', selFilter);

  const stopVisibility = journeyActive ? 'none' : 'visible';
  for (const id of STOP_LAYERS) {
    map.setLayoutProperty(id, 'visibility', stopVisibility);
    const base = map.getFilter(id);
    const kept = (base?.[0] === 'all' ? base.slice(1) : [base]).filter(f => !(Array.isArray(f) && f[0] === 'in' && Array.isArray(f[1]) && f[1][1] === 'agency'));
    map.setFilter(id, ['all', ...kept, inAgencies]);
  }
  for (const id of ['st-heavy', 'st-light', 'st-bus']) map.setPaintProperty(id, 'circle-opacity', focusKey ? 0.35 : 1);
  for (const id of ['st-heavy-label', 'st-light-label']) map.setLayoutProperty(id, 'visibility', focusKey || journeyActive ? 'none' : 'visible');

  const selectedStops = focusKey ? ['all', ['in', `|${focusKey}|`, ['get', 'keys']], ['==', ['get', 'child'], 0]] : ['==', ['get', 'id'], '__none__'];
  map.setFilter('st-selected', selectedStops);
  map.setFilter('st-selected-label', selectedStops);
  if (focusKey) map.setPaintProperty('st-selected', 'circle-stroke-color', idx.routes.get(focusKey)?.color || t.ink);

  const vehicleBase = ['all', inAgencies];
  const showVehicles = state.showVehicles && !journeyActive;
  for (const id of VEHICLE_LAYERS) {
    map.setLayoutProperty(id, 'visibility', showVehicles && !focusKey ? 'visible' : 'none');
    map.setFilter(id, ['all', id === 'veh-bus' ? ['==', ['get', 'cat'], 'bus'] : ['in', ['get', 'cat'], ['literal', ['heavy', 'light']]], vehicleBase]);
  }
  const selectedVehicles = focusKey ? ['==', ['get', 'key'], focusKey] : ['==', ['get', 'key'], '__none__'];
  map.setFilter('veh-selected', selectedVehicles);
  map.setFilter('veh-label', selectedVehicles);
  map.setLayoutProperty('veh-selected', 'visibility', state.showVehicles ? 'visible' : 'none');
  map.setLayoutProperty('veh-label', 'visibility', state.showVehicles ? 'visible' : 'none');
}

function highlightPlace(place) {
  const map = state.map;
  if (!map?.getLayer('st-place')) return;
  map.setFilter('st-place', place ? ['all', ['==', ['get', 'agency'], place.a.id], ['==', ['get', 'id'], place.s.id]] : ['==', ['get', 'id'], '__none__']);
}

function renderVehicles() {
  const source = state.map?.getSource('vehicles');
  if (!source) return;
  const stale = Boolean(state.realtime?.vehicles?.stale);
  const features = liveVehicles().map(({ v, agencyId, route, label }) => {
    const a = idx.agencies.get(agencyId);
    const color = route ? route.color : normalizeColor(a?.color);
    return {
      type: 'Feature',
      properties: { id: v.id, vehicle: v.label || v.id || '', key: route?.key || '', agency: agencyId, cat: route?.cat || (agencyId === 'caltrain' ? 'heavy' : 'bus'), color, badge: route?.badge || label || '', title: route?.title || label || '', ts: v.timestamp || 0, stale },
      geometry: { type: 'Point', coordinates: [v.lon, v.lat] }
    };
  });
  source.setData({ type: 'FeatureCollection', features });
}

function journeyFeatures(itinerary) {
  if (!itinerary) return { type: 'FeatureCollection', features: [] };
  const features = (itinerary.legs || []).map(leg => {
    let coords = leg.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) coords = [[leg.from?.lon, leg.from?.lat], [leg.to?.lon, leg.to?.lat]];
    coords = coords.filter(c => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]));
    if (coords.length < 2) return null;
    return { type: 'Feature', properties: { mode: leg.mode === 'WALK' ? 'WALK' : 'TRANSIT', color: normalizeColor(leg.routeColor, theme().ink) }, geometry: { type: 'LineString', coordinates: coords } };
  }).filter(Boolean);
  return { type: 'FeatureCollection', features };
}

function renderJourney() {
  const source = state.map?.getSource('journey');
  if (!source) return;
  source.setData(journeyFeatures(state.journey));
}

function cameraPadding() {
  if (isMobile()) {
    const sheet = currentSheetHeight();
    return { top: 48 + (window.visualViewport ? 0 : 0), bottom: Math.min(sheet + 24, window.innerHeight * 0.7), left: 32, right: 64 };
  }
  return { top: 64, bottom: 64, left: 64, right: 96 };
}

function fitCoordinates(coords, maxZoom = 14) {
  const map = state.map;
  const valid = coords.filter(c => Number.isFinite(c?.[0]) && Number.isFinite(c?.[1]));
  if (!map || !valid.length) return;
  if (valid.length === 1) { map.easeTo({ center: valid[0], zoom: Math.max(map.getZoom(), 15), padding: cameraPadding(), duration: motionMs(700) }); return; }
  const bounds = valid.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(valid[0], valid[0]));
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

  map.on('dragstart', () => { if (isMobile() && state.detent !== 'peek') setDetent('peek'); closePopovers(); });
}

function showVehiclePopup(feature) {
  const p = feature.properties;
  const a = idx.agencies.get(p.agency);
  const info = p.key ? idx.routes.get(p.key) : null;
  const badge = info ? badgeHtml(info) : `<span class="badge" style="background:${esc(normalizeColor(a?.color))};color:#fff">${esc(p.badge)}</span>`;
  const html = `<div class="vehicle-pop">${badge}<strong>${esc(info ? info.title : `${AGENCY_SHORT[p.agency] || ''} ${p.badge}`)}</strong>
    <div class="row-meta">${esc(AGENCY_SHORT[p.agency] || '')}${p.vehicle ? ` · Vehicle ${esc(p.vehicle)}` : ''}</div>
    <div class="row-meta ${p.stale ? 'status-stale' : ''}">${p.stale ? 'Location may be out of date. ' : ''}${esc(ageLabel(Number(p.ts)))}</div>
    ${info ? `<button class="text-button" data-popup-route="${esc(info.key)}">View line</button>` : ''}</div>`;
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
const DETENTS = ['peek', 'half', 'full'];

function detentHeight(name) {
  const vh = window.innerHeight;
  const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-t')) || 0;
  if (name === 'peek') return 152;
  if (name === 'half') return Math.round(vh * 0.5);
  return Math.round(vh - 56 - safeTop);
}
function currentSheetHeight() { return isMobile() ? detentHeight(state.detent) : 0; }

function setDetent(name) {
  state.detent = name;
  const panel = $('#panel');
  panel.classList.remove('detent-peek', 'detent-half', 'detent-full');
  panel.classList.add(`detent-${name}`);
  applySheetHeight(isMobile() ? detentHeight(name) : 0);
}

function applySheetHeight(px) {
  document.documentElement.style.setProperty('--sheet-h', `${px}px`);
  $('#mapControls').classList.toggle('hidden-by-sheet', isMobile() && px > window.innerHeight * 0.62);
}

function setupSheet() {
  const panel = $('#panel');
  const handles = [$('#sheetGrabber'), $('.panel-top')];
  let drag = null;
  const onDown = e => {
    if (!isMobile() || e.target.closest('input, button:not(#sheetGrabber)')) return;
    drag = { y: e.clientY, h: detentHeight(state.detent), t: performance.now(), moved: false, id: e.pointerId, el: e.currentTarget };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = drag.y - e.clientY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    panel.classList.add('dragging');
    applySheetHeight(clamp(drag.h + dy, detentHeight('peek') - 40, detentHeight('full')));
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    panel.classList.remove('dragging');
    const dy = drag.y - e.clientY, dt = Math.max(1, performance.now() - drag.t), velocity = dy / dt;
    const wasTap = !drag.moved;
    const current = DETENTS.indexOf(state.detent);
    const height = drag.h + dy;
    const fromGrabber = drag.el.id === 'sheetGrabber';
    drag = null;
    if (wasTap) { if (fromGrabber) setDetent(DETENTS[(current + 1) % 3]); else setDetent(state.detent); return; }
    let target;
    if (Math.abs(velocity) > 0.5) target = DETENTS[clamp(current + (velocity > 0 ? 1 : -1), 0, 2)];
    else target = DETENTS.reduce((best, d) => Math.abs(detentHeight(d) - height) < Math.abs(detentHeight(best) - height) ? d : best, 'peek');
    setDetent(target);
  };
  for (const h of handles) {
    h.addEventListener('pointerdown', onDown);
    h.addEventListener('pointermove', onMove);
    h.addEventListener('pointerup', onUp);
    h.addEventListener('pointercancel', onUp);
  }
  $('#sheetGrabber').addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const i = DETENTS.indexOf(state.detent);
    if (e.key === 'ArrowUp') setDetent(DETENTS[clamp(i + 1, 0, 2)]);
    else if (e.key === 'ArrowDown') setDetent(DETENTS[clamp(i - 1, 0, 2)]);
    else setDetent(DETENTS[(i + 1) % 3]);
  });
  window.addEventListener('resize', () => setDetent(state.detent));
}

/* ======================================================================
 * 7. Views
 * ==================================================================== */
const currentView = () => state.stack[state.stack.length - 1];

function pushView(view, { detent } = {}) {
  const top = currentView();
  if (top && top.name === view.name && JSON.stringify(top) === JSON.stringify(view)) { render(); return; }
  if (top?.name === 'search') state.stack.pop();
  state.stack.push(view);
  onLeaveFocus();
  render();
  if (isMobile() && detent) setDetent(detent);
  $('#panelBody').scrollTop = 0;
}

function popView() {
  if (state.stack.length > 1) state.stack.pop();
  const top = currentView();
  if (top.name === 'search' && !state.searchQuery) state.stack.pop();
  onLeaveFocus();
  render();
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
  if (!['results', 'navigate'].includes(top.name) && state.journey) { state.journey = null; renderJourney(); applyMapState(); }
  if (top.name !== 'navigate') releaseWakeLock();
}

function render() {
  const view = currentView();
  const body = $('#panelBody');
  const renderers = { home: viewHome, search: viewSearch, route: viewRoute, stop: viewStop, lines: viewLines, plan: viewPlan, results: viewResults, navigate: viewNavigate, sources: viewSources };
  body.innerHTML = (renderers[view.name] || viewHome)(view);
  $('#searchInput').closest('.search-field').hidden = ['plan', 'results', 'navigate'].includes(view.name);
}

/* Re-renders views that show live data, without moving the scroll position. */
function refreshLiveViews() {
  const view = currentView();
  if (!['home', 'route', 'stop', 'sources'].includes(view.name)) return;
  const body = $('#panelBody');
  const scroll = body.scrollTop;
  const expanded = $$('.alert-row.expanded', body).map(el => el.dataset.alert);
  render();
  expanded.forEach(id => $(`.alert-row[data-alert="${CSS.escape(id)}"]`, body)?.classList.add('expanded'));
  body.scrollTop = scroll;
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
  if (!rt.configured) return 'Live data is not connected on this server. Lines and stops show scheduled information only.';
  if (rt.fetchFailed) return 'Live data could not be refreshed. Showing the last update.';
  const stale = rt.vehicles?.stale || rt.updates?.stale;
  return `${stale ? 'Live data is delayed. ' : ''}Live data ${ageLabel(realtimeAge()).toLowerCase()}.`;
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
  const parts = [];
  const introDone = store.get(STORAGE.intro, null);
  if (!state.userLocation) {
    parts.push(`<div class="welcome">${introDone ? '' : '<p>Live times and maps for BART, Muni, VTA, AC Transit, and Caltrain.</p>'}
      <div class="inline-actions"><button class="text-button" data-action="locate">Use my location</button><button class="text-button" data-action="plan">Plan a trip</button></div></div>`);
  } else {
    parts.push(`<div class="welcome"><div class="inline-actions"><button class="text-button" data-action="plan">Plan a trip</button></div></div>`);
  }

  if (state.userLocation) {
    const nearby = nearbyPlaces(state.userLocation, 6);
    parts.push(`<section class="section"><h2 class="label">Nearby</h2>${nearby.length ? `<ul class="rows">${nearby.map(n => placeRow(n.place, distanceLabel(n.d))).join('')}</ul>` : '<p class="empty">No stops within a mile of your location.</p>'}</section>`);
  }

  const savedPlaces = state.saved.map(x => placeFor(x.a, x.id)).filter(Boolean);
  if (savedPlaces.length) {
    parts.push(`<section class="section"><h2 class="label">Saved</h2><ul class="rows">${savedPlaces.map(p => placeRow(p)).join('')}</ul></section>`);
  }

  parts.push(`<section class="section"><h2 class="label">Explore</h2><ul class="rows">
    <li><button class="row" data-action="lines"><span class="row-main"><span class="row-title">All lines</span><span class="row-meta">${idx.routes.size} lines across 5 agencies</span></span>${ICONS.chevron}</button></li>
    <li><button class="row" data-action="sources"><span class="row-main"><span class="row-title">Data sources and credits</span><span class="row-meta">Schedules, live data, and map providers</span></span>${ICONS.chevron}</button></li>
  </ul></section>`);
  parts.push(`<p class="note">${esc(liveStatusLine())} <button class="text-button" data-action="intro" style="min-height:0;font-size:13px">Show the introduction</button></p>`);
  return parts.join('');
}

function placeRow(place, trailing = '') {
  const arrivals = arrivalsForPlace(place);
  let meta = `${AGENCY_SHORT[place.a.id]}${place.s.k || idx.children.has(stopKey(place.a.id, place.s.id)) ? ' · Station' : ''}`;
  if (arrivals?.length) {
    const next = arrivals[0];
    const first = next.times.find(t => !t.skipped);
    const label = next.route ? next.route.badge : next.label;
    const m = minutesLabel(first.time);
    meta = `${ICONS.live}<span class="status-live">${esc(label)} ${esc(m.value)}${m.unit ? ` ${m.unit}` : ''}</span> · ${esc(meta)}`;
  } else {
    meta = esc(meta);
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
      if (score) routeResults.push({ info, score: score + CATEGORY_RANK[info.cat] });
    }
    routeResults.sort((x, y) => y.score - x.score || x.info.badge.localeCompare(y.info.badge, 'en', { numeric: true }));
  }
  const stopResults = [];
  if (q.length >= 2) {
    for (const entry of idx.searchable) {
      if (!state.visible.has(entry.a.id)) continue;
      if (!words.every(w => entry.haystack.includes(w))) continue;
      const name = normalizeSearch(entry.s.n);
      const score = (name === q ? 100 : name.startsWith(q) ? 50 : 10) + CATEGORY_RANK[stopCategory(entry.a.id, entry.s.id)] * 5;
      stopResults.push({ entry, score });
    }
    stopResults.sort((x, y) => y.score - x.score || x.entry.s.n.localeCompare(y.entry.s.n));
  }
  return { routes: routeResults.slice(0, routeLimit).map(x => x.info), stops: stopResults.slice(0, stopLimit).map(x => x.entry) };
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
  const { routes, stops } = searchNetwork(q);
  if (!routes.length && !stops.length) {
    return `<p class="empty" style="padding-top:16px">No results for “${esc(q)}”. Check the spelling, or search for a line number such as 38R or 51A.</p>`;
  }
  const parts = [];
  if (routes.length) parts.push(`<section class="section" style="margin-top:8px"><h2 class="label">Lines</h2><ul class="rows">${routes.map(info => `<li><button class="row result" data-action="route" data-key="${esc(info.key)}">${badgeHtml(info)}<span class="row-main"><span class="row-title">${highlight(info.title, q)}</span><span class="row-meta">${esc(AGENCY_SHORT[info.a.id])} · ${esc(modeName(info))}</span></span>${ICONS.chevron}</button></li>`).join('')}</ul></section>`);
  if (stops.length) parts.push(`<section class="section" style="margin-top:${routes.length ? 24 : 8}px"><h2 class="label">Stops and stations</h2><ul class="rows">${stops.map(({ a, s }) => {
    const rs = sortRoutes(routesForStop(a.id, s.id));
    const isStation = s.k || idx.children.has(stopKey(a.id, s.id));
    const d = state.userLocation ? distanceLabel(distanceMeters(state.userLocation, s.p)) : '';
    return `<li><button class="row result" data-action="stop" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">${badgesFor(rs, 3)}<span class="row-main"><span class="row-title">${highlight(s.n, q)}</span><span class="row-meta">${esc(AGENCY_SHORT[a.id])}${isStation ? ' · Station' : ''}</span></span>${d ? `<span class="row-end caption">${esc(d)}</span>` : ICONS.chevron}</button></li>`;
  }).join('')}</ul></section>`);
  return parts.join('');
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
  clearSearchField();
  pushView({ name: 'route', key }, { detent: 'half' });
  const coords = (info.r.shapes || []).flat();
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

function viewStop({ agency, stop }) {
  const place = placeFor(agency, stop);
  if (!place) return `${backHeader()}<p class="empty">This stop is no longer in the schedule data.</p>`;
  const { a, s } = place;
  const isSaved = state.saved.some(x => x.a === a.id && x.id === s.id);
  const isStation = s.k || idx.children.has(stopKey(a.id, s.id));
  const arrivals = arrivalsForPlace(place);
  const cov = coverage(a.id);
  const rt = state.realtime;
  const alerts = activeAlerts({ agencyId: a.id, routeKeys: place.routes.map(r => r.key), stopIds: place.ids });

  let departures;
  if (!rt?.configured) {
    departures = '<p class="empty">Live arrivals are not connected on this server. The lines that serve this stop are listed below.</p>';
  } else if (!cov.arrivals) {
    departures = `<p class="empty">Live arrivals for ${esc(AGENCY_SHORT[a.id])} are not available yet. The lines that serve this stop are listed below.</p>`;
  } else if (!arrivals?.length) {
    departures = '<p class="empty">No live predictions for this stop right now. Service may have ended for the day, or vehicles may not be reporting.</p>';
  } else {
    departures = `<ul class="departures">${arrivals.slice(0, 8).map((g, i) => departureRow(g, i === 0)).join('')}</ul>`;
  }
  const ageText = rt?.configured && cov.arrivals ? ` · ${ageLabel(rt.updates?.headerTimestamp)}` : '';
  const staleText = rt?.updates?.stale ? ' <span class="status-stale">Live times may be out of date.</span>' : '';

  return `${backHeader(`<button class="icon-button" data-action="save" aria-pressed="${isSaved}" aria-label="${isSaved ? 'Remove from saved stops' : 'Save this stop'}">${isSaved ? ICONS.starFilled : ICONS.star}</button>`)}
    <div class="hero">
      <h1 class="title-1">${esc(s.n)}</h1>
      <p class="caption">${esc(a.name)}${isStation ? ' · Station' : ' · Stop'}${esc(ageText)}${staleText}</p>
    </div>
    <section class="section" style="margin-top:8px"><h2 class="label">Departures</h2>${departures}</section>
    ${alerts.length ? `<div style="margin-top:16px">${alertsHtml(alerts, 1)}</div>` : ''}
    <div class="action-bar" style="margin-top:20px">
      <button class="button primary" data-action="plan-to" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">Directions</button>
      <button class="button secondary" data-action="plan-from" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">Leave from here</button>
    </div>
    <section class="section"><h2 class="label"><span>Lines here</span><span>${place.routes.length}</span></h2><ul class="rows">${place.routes.map(info => `<li><button class="row" data-action="route" data-key="${esc(info.key)}">${badgeHtml(info)}<span class="row-main"><span class="row-title">${esc(info.title)}</span></span>${ICONS.chevron}</button></li>`).join('')}</ul></section>`;
}

function departureRow(group, first) {
  const upcoming = group.times.filter(t => !t.skipped);
  const next = upcoming[0];
  const m = minutesLabel(next.time);
  const status = delayStatus(next.delay);
  const later = upcoming.slice(1, 3).map(t => minutesLabel(t.time));
  let laterText = '';
  if (later.length) {
    const allMinutes = later.every(x => x.unit === 'min');
    laterText = allMinutes ? `Then ${later.map(x => x.value).join(' and ')} min` : `Then ${later.map(x => (x.unit ? `${x.value} ${x.unit}` : x.value)).join(' and ')}`;
  }
  const skipped = group.times.some(t => t.skipped);
  const badge = group.route ? badgeHtml(group.route) : `<span class="badge" style="background:var(--ink);color:var(--surface)">${esc(group.label)}</span>`;
  const title = group.route ? group.route.title : `Caltrain ${group.label}`;
  return `<li class="departure${first ? ' first' : ''}">
    <span class="when"><strong>${esc(m.value)}</strong>${m.unit ? `<span>${m.unit}</span>` : ''}</span>
    <span class="what">${badge}<div class="row-title" style="margin-top:6px">${esc(title)}</div>
      <div class="status ${status.cls}">${ICONS.live}${esc(status.text)}</div>
      ${laterText ? `<div class="then">${esc(laterText)}</div>` : ''}
      ${skipped ? '<div class="then status-canceled">One trip is not stopping here</div>' : ''}</span>
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
function viewSources() {
  const rows = state.network.agencies.map(a => `<li><div class="row"><span class="dot" style="background:${esc(a.color)}"></span><span class="row-main"><span class="row-title">${esc(a.name)}</span><span class="row-meta">${plural(a.routes.length, 'line')} · Schedule valid ${esc(formatGtfsDate(a.feed?.start))} to ${esc(formatGtfsDate(a.feed?.end))}</span></span></div></li>`).join('');
  const rt = state.realtime;
  const budget = rt?.meta?.requestBudget;
  return `${backHeader()}
    <div class="hero"><h1 class="title-1">Data sources</h1><p class="caption">Schedules updated ${esc(dateFormat.format(new Date(state.network.generatedAt)))}</p></div>
    <section class="section"><h2 class="label">Schedules</h2><ul class="rows">${rows}</ul></section>
    <section class="section"><h2 class="label">Live data</h2><p class="empty">${esc(liveStatusLine())}${budget ? ` The server has used ${budget.used} of its ${budget.limit} hourly requests to 511.` : ''}</p></section>
    <section class="section"><h2 class="label">Credits</h2>
      <div class="empty" style="line-height:22px">
        <p>Transit data provided by 511.org, BART, AC Transit, VTA, Caltrain, and SFMTA.</p>
        <p>Reproduced with permission granted by the City and County of San Francisco.</p>
        <p>AC Transit data is licensed under a Creative Commons Attribution 3.0 Unported License.</p>
        <p>Map data © OpenStreetMap contributors and OpenMapTiles. Map tiles by OpenFreeMap. Satellite imagery by Esri, Maxar, Earthstar Geographics, and the GIS User Community.</p>
        <p>All transit data is provided as is, without warranty. Times are estimates. Confirm important trips with the agency.</p>
        <p>Rove is not affiliated with or endorsed by BART, SFMTA, VTA, AC Transit, Caltrain, or MTC.</p>
        <p>Typeface: Atkinson Hyperlegible Next, licensed under the SIL Open Font License 1.1.</p>
      </div>
    </section>`;
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
  return state.userLocation ? { kind: 'location', name: 'Your location', lat: state.userLocation[1], lon: state.userLocation[0] } : null;
}

function openPlan({ from, to } = {}) {
  closePopovers();
  clearSearchField();
  const plan = state.plan;
  if (from !== undefined) plan.from = from;
  if (to !== undefined) plan.to = to;
  if (!plan.from && state.userLocation) plan.from = currentLocationPlace();
  plan.results = null; plan.error = null; plan.focus = null; plan.query = '';
  pushView({ name: 'plan' }, { detent: 'full' });
  requestAnimationFrame(() => { if (!plan.to) $('#planTo')?.focus(); else if (!plan.from) $('#planFrom')?.focus(); });
}

function viewPlan() {
  const plan = state.plan;
  const field = (id, which, label, value) => `<label class="plan-field"><span class="marker"><i></i></span><span class="visually-hidden">${label}</span>
    <input id="${id}" data-plan-field="${which}" value="${esc(value?.name || '')}" placeholder="${label}" autocomplete="off" spellcheck="false" /></label>`;
  let suggestions = '';
  if (plan.focus) {
    const q = plan.query;
    const items = [];
    if (state.userLocation && (!q || 'your location'.includes(q.toLowerCase()))) items.push(`<li><button class="row" data-action="plan-pick-location"><span class="row-main"><span class="row-title">Your location</span></span></button></li>`);
    else if (!state.userLocation && !q) items.push(`<li><button class="row" data-action="plan-locate"><span class="row-main"><span class="row-title">Use my location</span><span class="row-meta">Rove asks your browser for permission</span></span></button></li>`);
    if (q.length >= 2) {
      for (const { a, s } of searchNetwork(q, { routes: false, stopLimit: 8 }).stops) {
        items.push(`<li><button class="row" data-action="plan-pick" data-agency="${esc(a.id)}" data-stop="${esc(s.id)}">${badgesFor(sortRoutes(routesForStop(a.id, s.id)), 3)}<span class="row-main"><span class="row-title">${highlight(s.n, q)}</span><span class="row-meta">${esc(AGENCY_SHORT[a.id])}</span></span></button></li>`);
      }
      if (items.length <= 1) items.push(`<li><p class="empty">No stops match “${esc(q)}”. Rove plans trips between stops and your location.</p></li>`);
    }
    suggestions = `<ul class="rows suggestions">${items.join('')}</ul>`;
  }
  const canPlan = plan.from && plan.to;
  return `${backHeader()}
    <div class="hero" style="padding-bottom:8px"><h1 class="title-2">Plan a trip</h1></div>
    <form class="plan-form" data-plan-form novalidate>
      <div class="plan-fields">
        ${field('planFrom', 'from', 'Starting point', plan.from)}
        ${field('planTo', 'to', 'Destination', plan.to)}
        <button type="button" class="swap-button" data-action="plan-swap" aria-label="Swap starting point and destination">${ICONS.swap}</button>
      </div>
      ${suggestions || `<div class="plan-options">
        <select id="planTimeMode" aria-label="When">
          <option value="now" ${plan.timeMode === 'now' ? 'selected' : ''}>Leave now</option>
          <option value="depart" ${plan.timeMode === 'depart' ? 'selected' : ''}>Depart at</option>
          <option value="arrive" ${plan.timeMode === 'arrive' ? 'selected' : ''}>Arrive by</option>
        </select>
        ${plan.timeMode !== 'now' ? `<input type="datetime-local" id="planDateTime" aria-label="Date and time" value="${esc(plan.dateTime || localInputValue(new Date()))}" />` : ''}
      </div>
      <button type="submit" class="button primary block plan-submit" ${canPlan ? '' : 'disabled style="opacity:.45;cursor:default"'} ${plan.loading ? 'aria-busy="true"' : ''}>${plan.loading ? 'Finding routes' : 'Find routes'}</button>`}
    </form>
    ${plan.error ? `<p class="empty" role="alert" style="padding-top:16px">${esc(plan.error)}</p>` : ''}`;
}

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
  if (!plan.from || !plan.to || plan.loading) return;
  if (plan.timeMode !== 'now') plan.dateTime = $('#planDateTime')?.value || plan.dateTime || localInputValue(new Date());
  const local = plan.timeMode === 'now' ? localInputValue(new Date()) : plan.dateTime;
  const body = {
    from: { name: plan.from.name, lat: plan.from.lat, lon: plan.from.lon },
    to: { name: plan.to.name, lat: plan.to.lat, lon: plan.to.lon },
    dateTime: pacificIso(local),
    arriveBy: plan.timeMode === 'arrive',
    modes: ['TRANSIT', 'WALK']
  };
  plan.loading = true; plan.error = null;
  render();
  try {
    const response = await fetch('/api/journeys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout ? AbortSignal.timeout(30000) : undefined });
    let data = null;
    try { data = await response.json(); } catch { data = null; }
    if (response.status === 404 || response.status === 501) throw new PlanError('Trip planning is not available on this server yet.');
    if (!response.ok || data?.error) {
      const code = data?.error?.code;
      if (code === 'NO_PATH') throw new PlanError('No transit route was found for this time. Try a different time or a nearby stop.');
      throw new PlanError(data?.error?.message ? `Trip planning failed: ${data.error.message}` : 'Trip planning failed. Please try again in a moment.');
    }
    const itineraries = Array.isArray(data?.itineraries) ? data.itineraries : [];
    if (!itineraries.length) throw new PlanError('No transit route was found for this time. Try a different time or a nearby stop.');
    plan.results = { itineraries, generatedAt: data.generatedAt, request: body };
    plan.expanded = 0;
    plan.loading = false;
    state.journey = itineraries[0];
    pushView({ name: 'results' }, { detent: 'half' });
    renderJourney(); applyMapState(); fitJourney(itineraries[0]);
  } catch (error) {
    plan.loading = false;
    plan.error = error instanceof PlanError ? error.message : 'Rove could not reach the trip planner. Check your connection and try again.';
    render();
  }
}
class PlanError extends Error {}

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
  return {
    agencyId,
    color: known?.color || color,
    text: known?.text || readableText(color),
    badge: known?.badge || leg.routeName || leg.routeShortName || 'Transit',
    title: known?.title || leg.routeLongName || leg.routeName || 'Transit'
  };
}

function journeyBar(it) {
  const total = Math.max(1, (new Date(it.endTime) - new Date(it.startTime)) / 1000);
  return `<div class="journey-bar" aria-hidden="true">${(it.legs || []).map(leg => {
    const dur = Math.max(30, (legEnd(leg) - legStart(leg)) / 1000);
    const pct = Math.max(4, dur / total * 100);
    if (leg.mode === 'WALK') return `<span class="seg walk" style="flex:${pct}"></span>`;
    const li = legInfo(leg);
    return `<span class="seg" style="flex:${pct};background:${esc(li.color)}"><span class="badge" style="background:${esc(li.color)};color:${esc(li.text)}">${esc(li.badge)}</span></span>`;
  }).join('')}</div>`;
}

function itinerarySummary(it) {
  const transitLegs = (it.legs || []).filter(l => l.mode !== 'WALK');
  const first = transitLegs[0];
  const transfers = Number.isFinite(it.transfers) ? it.transfers : Math.max(0, transitLegs.length - 1);
  const leaveIn = Math.round((new Date(it.startTime) - Date.now()) / 60000);
  const leave = leaveIn <= 0 ? 'Leave now' : leaveIn < 60 ? `Leave in ${leaveIn} min` : `Leave at ${clock(new Date(it.startTime))}`;
  const fromName = first?.from?.name ? ` from ${first.from.name}` : '';
  const walk = Number.isFinite(it.walkMeters) ? ` · ${distanceLabel(it.walkMeters)} walk` : '';
  const live = transitLegs.some(l => l.realtime);
  return `${live ? ICONS.live : ''}${esc(`${leave}${fromName}`)} · ${transfers === 0 ? 'No transfers' : plural(transfers, 'transfer')}${esc(walk)}${live ? '' : ' · Scheduled'}`;
}

function viewResults() {
  const plan = state.plan;
  const its = plan.results?.itineraries || [];
  return `${backHeader()}
    <div class="hero" style="padding-bottom:8px">
      <h1 class="title-2">${esc(plan.from?.name)} to ${esc(plan.to?.name)}</h1>
      <p class="caption">${plan.timeMode === 'arrive' ? 'Arriving by' : 'Departing'} ${esc(clock(new Date(plan.results?.request?.dateTime || Date.now())))} · Times are from published schedules unless marked live</p>
    </div>
    <ul class="itineraries">${its.map((it, i) => {
      const open = plan.expanded === i;
      return `<li><button class="itinerary" data-action="it-toggle" data-index="${i}" aria-expanded="${open}">
        <div class="it-top"><span class="it-times">${esc(clock(new Date(it.startTime)))} to ${esc(clock(new Date(it.endTime)))}</span><span class="it-duration">${esc(durationLabel(it.durationSeconds || (new Date(it.endTime) - new Date(it.startTime)) / 1000))}</span></div>
        ${journeyBar(it)}
        <div class="it-meta">${itinerarySummary(it)}</div></button>
        ${open ? `${itineraryTimeline(it)}<div class="action-bar" style="padding-bottom:16px"><button class="button primary" data-action="nav-start" data-index="${i}">Start</button></div>` : ''}</li>`;
    }).join('')}</ul>`;
}

function itineraryTimeline(it) {
  const items = [];
  const legs = it.legs || [];
  legs.forEach((leg, i) => {
    if (leg.mode === 'WALK') {
      const meters = Number.isFinite(leg.distanceMeters) ? leg.distanceMeters : null;
      items.push(`<li><span class="t">${esc(clock(legStart(leg)))}</span><span class="rail walk"></span><span class="body"><strong>Walk${meters ? ` ${esc(distanceLabel(meters))}` : ''}</strong><span class="row-meta">About ${esc(durationLabel((legEnd(leg) - legStart(leg)) / 1000))} to ${esc(leg.to?.name || 'your destination')}</span></span></li>`);
      return;
    }
    const li = legInfo(leg);
    const stopsCount = Array.isArray(leg.intermediateStops) ? leg.intermediateStops.length + 1 : null;
    items.push(`<li style="--leg-color:${esc(li.color)}"><span class="t">${esc(clock(legStart(leg)))}</span><span class="rail"><span class="node"></span></span><span class="body">
      <strong>${esc(leg.from?.name || 'Board')}</strong>
      <span class="row-meta" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px"><span class="badge" style="background:${esc(li.color)};color:${esc(li.text)}">${esc(li.badge)}</span>${leg.headsign ? `<span>Toward ${esc(leg.headsign)}</span>` : ''}</span>
      <span class="row-meta">${stopsCount ? `${plural(stopsCount, 'stop')} · ` : ''}${esc(durationLabel((legEnd(leg) - legStart(leg)) / 1000))}${leg.realtime ? ` · <span class="${delayStatus(leg.delaySeconds).cls}">${ICONS.live}${esc(delayStatus(leg.delaySeconds).text)}</span>` : ' · Scheduled'}</span></span></li>`);
    const next = legs[i + 1];
    if (!next || next.mode === 'WALK') {
      items.push(`<li style="--leg-color:${esc(li.color)}"><span class="t">${esc(clock(legEnd(leg)))}</span><span class="rail"><span class="node"></span></span><span class="body"><strong>${esc(leg.to?.name || 'Get off')}</strong><span class="row-meta">Get off</span></span></li>`);
    } else {
      const wait = Math.round((legStart(next) - legEnd(leg)) / 60000);
      items.push(`<li style="--leg-color:${esc(li.color)}"><span class="t">${esc(clock(legEnd(leg)))}</span><span class="rail"><span class="node"></span></span><span class="body"><strong>${esc(leg.to?.name || 'Transfer')}</strong><span class="row-meta ${wait < 3 ? 'status-late' : ''}">Change here · ${wait <= 0 ? 'Tight connection' : `${plural(wait, 'minute')} to connect${wait < 3 ? ', tight' : ''}`}</span></span></li>`);
    }
  });
  items.push(`<li><span class="t">${esc(clock(new Date(it.endTime)))}</span><span class="rail" style="--leg-color:var(--ink)"><span class="node" style="background:var(--ink)"></span></span><span class="body"><strong>Arrive at ${esc(state.plan.to?.name || 'your destination')}</strong></span></li>`);
  return `<ol class="timeline">${items.join('')}</ol>`;
}

/* ---------- Step-by-step navigation ---------- */
function buildSteps(it) {
  const steps = [];
  for (const leg of it.legs || []) {
    if (leg.mode === 'WALK') {
      steps.push({ type: 'walk', leg, title: `Walk to ${leg.to?.name || 'your destination'}`, big: durationLabel((legEnd(leg) - legStart(leg)) / 1000), meta: Number.isFinite(leg.distanceMeters) ? distanceLabel(leg.distanceMeters) : '' });
    } else {
      const li = legInfo(leg);
      steps.push({ type: 'wait', leg, li, title: `Board ${li.badge}${leg.headsign ? ` toward ${leg.headsign}` : ''} at ${leg.from?.name || 'the stop'}`, departs: legStart(leg) });
      const stopsCount = Array.isArray(leg.intermediateStops) ? leg.intermediateStops.length + 1 : null;
      steps.push({ type: 'ride', leg, li, title: `Ride to ${leg.to?.name || 'your stop'}`, big: stopsCount ? plural(stopsCount, 'stop') : durationLabel((legEnd(leg) - legStart(leg)) / 1000), meta: `Get off at ${clock(legEnd(leg))}` });
    }
  }
  steps.push({ type: 'arrive', title: `You have arrived at ${state.plan.to?.name || 'your destination'}.` });
  return steps;
}

async function startNavigation(index) {
  const it = state.plan.results?.itineraries?.[index];
  if (!it) return;
  state.journey = it;
  state.nav = { it, steps: buildSteps(it), i: 0 };
  renderJourney(); applyMapState();
  pushView({ name: 'navigate' }, { detent: 'half' });
  focusStep();
  try { if ('wakeLock' in navigator) state.wakeLock = await navigator.wakeLock.request('screen'); } catch { /* wake lock refused */ }
}
function releaseWakeLock() { try { state.wakeLock?.release(); } catch { /* already released */ } state.wakeLock = null; }

function focusStep() {
  const step = state.nav?.steps[state.nav.i];
  if (!step?.leg) { fitJourney(state.nav?.it); return; }
  const c = step.leg.geometry?.coordinates;
  if (step.type === 'wait') fitCoordinates([[step.leg.from?.lon, step.leg.from?.lat]], 16);
  else fitCoordinates(Array.isArray(c) && c.length ? c : [[step.leg.from?.lon, step.leg.from?.lat], [step.leg.to?.lon, step.leg.to?.lat]], 16);
}

function viewNavigate() {
  const nav = state.nav;
  if (!nav) return viewHome();
  const step = nav.steps[nav.i];
  const total = nav.steps.length - 1;
  const head = `<div class="view-head"><button class="back-button" data-action="nav-end">${ICONS.back}<span>End trip</span></button></div>
    <div class="nav-head"><div class="title-2">Arrive ${esc(clock(new Date(nav.it.endTime)))}</div><div class="caption">${esc(durationLabel((new Date(nav.it.endTime) - Date.now()) / 1000))} remaining · Times are scheduled unless marked live</div></div>`;
  if (step.type === 'arrive') {
    return `${head}<div class="arrived"><h2 class="title-1">${esc(step.title)}</h2><p class="caption" style="margin-top:8px">${esc(clock(new Date()))}</p><div style="margin-top:20px"><button class="button primary" data-action="nav-end">Done</button></div></div>`;
  }
  let big = step.big || '', meta = step.meta || '';
  if (step.type === 'wait') {
    const m = minutesLabel(step.departs.getTime() / 1000);
    big = m.unit ? `${m.value} min` : m.value;
    meta = `Departs ${clock(step.departs)}${step.leg.realtime ? '' : ' · Scheduled'}`;
  }
  const color = step.li?.color || 'var(--ink)';
  const list = nav.steps.slice(0, total).map((s, i) => `<li class="${i < nav.i ? 'done' : ''}" ${i === nav.i ? 'aria-current="step" style="color:var(--ink);font-weight:600"' : ''}>${i < nav.i ? ICONS.check : ICONS.circle}<span>${esc(s.title)}</span></li>`).join('');
  return `${head}
    <div class="step-card" style="--leg-color:${esc(color)}">
      <p class="label">Step ${nav.i + 1} of ${total}</p>
      <h2>${esc(step.title)}</h2>
      <div class="big">${esc(big)}</div>
      ${meta ? `<p class="caption" style="margin:6px 0 0">${esc(meta)}</p>` : ''}
    </div>
    <div class="action-bar">
      ${nav.i > 0 ? '<button class="button secondary" data-action="nav-prev">Previous</button>' : ''}
      <button class="button primary" data-action="nav-next">${nav.i === total - 1 ? 'Arrive' : 'Next step'}</button>
    </div>
    <ol class="step-list" style="margin-top:20px">${list}</ol>`;
}

/* ---------- Event handling ---------- */
function clearSearchField() {
  state.searchQuery = '';
  $('#searchInput').value = '';
  $('#searchClear').hidden = true;
}

function onSearchInput(value) {
  state.searchQuery = value;
  $('#searchClear').hidden = !value;
  const top = currentView();
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
  switch (action) {
    case 'back': popView(); break;
    case 'route': openRoute(el.dataset.key); break;
    case 'stop': openStop(el.dataset.agency, el.dataset.stop); break;
    case 'lines': clearSearchField(); pushView({ name: 'lines' }, { detent: 'full' }); break;
    case 'sources': clearSearchField(); pushView({ name: 'sources' }, { detent: 'full' }); break;
    case 'intro': showIntro(0); break;
    case 'locate': locate(); break;
    case 'plan': openPlan({}); break;
    case 'plan-to': openPlan({ to: placeFromStop(el.dataset.agency, el.dataset.stop), from: currentLocationPlace() || (state.plan.from?.stop !== el.dataset.stop ? state.plan.from : null) }); break;
    case 'plan-from': openPlan({ from: placeFromStop(el.dataset.agency, el.dataset.stop), to: state.plan.to && state.plan.to.stop !== el.dataset.stop ? state.plan.to : null }); break;
    case 'plan-swap': { const p = state.plan; [p.from, p.to] = [p.to, p.from]; p.focus = null; render(); break; }
    case 'plan-pick': state.plan[state.plan.focus] = placeFromStop(el.dataset.agency, el.dataset.stop); afterPick(); break;
    case 'plan-pick-location': state.plan[state.plan.focus] = currentLocationPlace(); afterPick(); break;
    case 'plan-locate': locate({ thenPick: state.plan.focus }); break;
    case 'save': if (view.name === 'stop') toggleSaved(view.agency, view.stop); break;
    case 'toggle-alert': { el.classList.toggle('expanded'); el.setAttribute('aria-expanded', String(el.classList.contains('expanded'))); break; }
    case 'it-toggle': {
      const i = Number(el.dataset.index);
      state.plan.expanded = state.plan.expanded === i ? -1 : i;
      const it = state.plan.results.itineraries[state.plan.expanded >= 0 ? state.plan.expanded : i];
      state.journey = it; renderJourney(); applyMapState(); fitJourney(it);
      render(); break;
    }
    case 'nav-start': startNavigation(Number(el.dataset.index)); break;
    case 'nav-next': if (state.nav && state.nav.i < state.nav.steps.length - 1) { state.nav.i++; render(); focusStep(); } break;
    case 'nav-prev': if (state.nav && state.nav.i > 0) { state.nav.i--; render(); focusStep(); } break;
    case 'nav-end': state.nav = null; releaseWakeLock(); goHome(); break;
    default: break;
  }
}

function afterPick() {
  const plan = state.plan;
  const picked = plan.focus;
  plan.focus = null; plan.query = '';
  render();
  const next = picked === 'from' && !plan.to ? '#planTo' : picked === 'to' && !plan.from ? '#planFrom' : null;
  if (next) requestAnimationFrame(() => $(next)?.focus());
  else requestAnimationFrame(() => $('.plan-submit')?.focus());
}

function bindPanel() {
  const body = $('#panelBody');
  body.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && body.contains(el)) { e.preventDefault(); handleAction(el); }
  });
  body.addEventListener('submit', e => { if (e.target.matches('[data-plan-form]')) { e.preventDefault(); submitPlan(); } });
  body.addEventListener('change', e => {
    if (e.target.id === 'planTimeMode') { state.plan.timeMode = e.target.value; if (!state.plan.dateTime) state.plan.dateTime = localInputValue(new Date()); render(); }
    if (e.target.id === 'planDateTime') state.plan.dateTime = e.target.value;
  });
  body.addEventListener('focusin', e => {
    const which = e.target.dataset?.planField;
    if (!which || state.plan.focus === which) return;
    state.plan.focus = which; state.plan.query = '';
    const pos = e.target.value.length;
    render();
    const input = $(`[data-plan-field="${which}"]`);
    input?.focus(); input?.setSelectionRange(pos, pos); input?.select();
  });
  body.addEventListener('input', e => {
    const which = e.target.dataset?.planField;
    if (!which) return;
    state.plan.query = e.target.value;
    state.plan[which] = null;
    const value = e.target.value, caret = e.target.selectionStart;
    render();
    const input = $(`[data-plan-field="${which}"]`);
    if (input) { input.value = value; input.focus(); input.setSelectionRange(caret, caret); }
  });
  body.addEventListener('keydown', e => {
    if (e.target.dataset?.planField && e.key === 'Escape') { state.plan.focus = null; render(); }
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
    if (e.key === 'ArrowDown') { e.preventDefault(); results[Math.min(i + 1, results.length - 1)].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (i === 0 ? input : results[i - 1]).focus(); }
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
  });
  $('#vehiclesToggle').checked = state.showVehicles;

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
  $('#locateButton').addEventListener('click', () => locate());

  document.addEventListener('keydown', e => {
    const typing = /input|select|textarea/i.test(document.activeElement?.tagName || '');
    if (e.key === '/' && !typing) { e.preventDefault(); $('#searchInput').focus(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); }
    if (e.key === 'Escape' && !typing) {
      if (!$('#layersPopover').hidden || !$('#menu').hidden) closePopovers();
      else if (!$('#intro').hidden) finishIntro();
      else if (state.stack.length > 1 && currentView().name !== 'navigate') popView();
    }
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadRealtime(); });
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
  $('#locateButton').classList.add('active');
  const pick = locate.pendingPick;
  locate.pendingPick = null;
  if (pick && currentView().name === 'plan') { state.plan[pick] = currentLocationPlace(); afterPick(); return; }
  if (first && ['home'].includes(currentView().name)) render();
}
function onPositionError(err) {
  locate.pendingPick = null;
  toast(err?.code === 1 ? 'Location is off. Search for a stop or line to get started.' : 'Your location could not be found. Please try again.');
}

const INTRO = [
  ['Find any stop or line', 'Search covers BART, Muni, VTA, AC Transit, and Caltrain. Try a line number such as 38R, or a station name.'],
  ['Tap a line to focus the map', 'Other lines fade so you can follow the one you ride. Stops and vehicles for that line come forward.'],
  ['Live means live', 'Times with the live symbol come from vehicles in service. Anything else is clearly labeled as scheduled.']
];
function showIntro(i = 0) {
  state.introIndex = i;
  const [title, text] = INTRO[i];
  $('#introStep').textContent = `${i + 1} of ${INTRO.length}`;
  $('#introTitle').textContent = title;
  $('#introText').textContent = text;
  $('#introNext').textContent = i === INTRO.length - 1 ? 'Done' : 'Next';
  $('#introSkip').hidden = i === INTRO.length - 1;
  $('#intro').hidden = false;
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

async function init() {
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

  const savedMode = store.get(STORAGE.mapMode, null);
  const mode = ['standard', 'satellite', 'dark'].includes(savedMode) ? savedMode : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'standard');
  state.mapMode = mode;
  document.body.classList.toggle('theme-dark', mode === 'dark');
  document.body.classList.toggle('map-satellite', mode === 'satellite');
  $$('[data-map-mode]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mapMode === mode)));

  if (typeof maplibregl === 'undefined') {
    $('#mapLoading').innerHTML = '<span>The map could not be loaded. Search and stop information still work.</span>';
  } else {
    const style = await fetchStyle(mode);
    const b = state.network.bounds;
    state.map = new maplibregl.Map({
      container: 'map',
      style,
      center: [-122.2, 37.7],
      zoom: isMobile() ? 8.6 : 9.3,
      maxZoom: 18.5,
      maxBounds: b ? [[b[0] - 0.6, b[1] - 0.4], [b[2] + 0.6, b[3] + 0.4]] : undefined,
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
    state.map.on('load', () => {
      state.mapReady = true;
      $('#mapLoading').classList.add('done');
      setupMapInteractions();
    });
    state.map.on('error', e => { if (e?.error?.status !== 404) console.warn('Map error:', e?.error?.message || e); });
  }

  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') navigator.geolocation.getCurrentPosition(onPosition, () => {}, { timeout: 10000 }); }).catch(() => {});
  }

  $('#introSkip').addEventListener('click', finishIntro);
  $('#introNext').addEventListener('click', () => (state.introIndex < INTRO.length - 1 ? showIntro(state.introIndex + 1) : finishIntro()));
  if (!store.get(STORAGE.intro, null)) setTimeout(() => showIntro(0), 600);

  loadRealtime();
  state.realtimeTimer = setInterval(loadRealtime, 60000);
  setInterval(() => { if (!document.hidden) refreshLiveViews(); }, 30000);
}

init();
