import fs from 'node:fs';
import path from 'node:path';
import { AGENCIES } from './agencies.mjs';
import { arrivalsForStop } from './realtime/match.mjs';
import { liveArrivalState } from './realtime/service.mjs';
import { PLAN_BOUNDS, PlanRequestError, SUPPORTED_ACCESS, parsePlanParams } from './routing/otp.mjs';
import { JourneyRequestError, parseJourneyBody, toJourneyResponse } from './journeys.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
// The site is never meant to be shown inside another site's frame.
const PAGE_HEADERS = { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'", 'Referrer-Policy': 'strict-origin-when-cross-origin' };
const ALLOWED_ROOT_FILES = new Set(['index.html', 'app.js', 'styles.css']);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res, status, value) => send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });

const MAX_BODY_BYTES = 16 * 1024;
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // Oversized bodies are drained and discarded so the client still receives a 413 response.
    req.on('data', c => { size += c.length; if (size <= MAX_BODY_BYTES) chunks.push(c); });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(Object.assign(new Error('Request body is too large'), { status: 413 }));
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); }
      catch { reject(Object.assign(new Error('Request body is not valid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/**
 * Browsers on a local development server (for example a Vite dev server on another port) may call
 * the API. Only loopback origins are allowed by default; ROVE_CORS_ORIGINS adds exact origins.
 */
const EXTRA_ORIGINS = new Set((process.env.ROVE_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
function corsHeaders(origin) {
  if (!origin) return {};
  if (!/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/.test(origin) && !EXTRA_ORIGINS.has(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' };
}

/**
 * Build the HTTP request handler.
 * @param {object} deps
 * @param {string} deps.root repository root (static files)
 * @param {string} [deps.frontendRoot] optional separate frontend checkout for the page files; public/data/ always comes from root
 * @param {import('./realtime/service.mjs').RealtimeService} deps.realtime
 * @param {import('./routing/otp.mjs').OtpClient} deps.otp
 * @param {import('./stops-search.mjs').StopSearch} deps.stops
 */
export function createHandler({ root, frontendRoot = root, realtime, otp, stops, places = null, placesUnavailableReason = 'place index not loaded', log = console }) {
  const parseNear = v => {
    const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(v || '');
    return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
  };
  const routes = {
    // Existing contract used by app.js (kept shape-compatible; IDs are now exact).
    '/api/realtime': async () => [200, await realtime.legacy()],
    '/api/realtime/status': async () => [200, realtime.status()],

    // v2 backend contract (documented in docs/API_CONTRACT.md).
    '/api/v2/realtime': async () => {
      const s = await realtime.snapshot();
      return [200, { generatedAt: s.generatedAt, configured: s.configured, feeds: s.feeds, errors: s.errors, requestBudget: s.requestBudget, quality: s.quality, vehicles: s.vehicles, updates: s.updates, alerts: s.alerts }];
    },
    '/api/v2/realtime/quality': async () => {
      const s = await realtime.snapshot();
      return [200, { generatedAt: s.generatedAt, feeds: s.feeds, errors: s.errors, quality: s.quality, unassigned: s.unassigned, hourly: realtime.matchLog.report() }];
    },
    '/api/v2/arrivals': async url => {
      const agency = url.searchParams.get('agency');
      const stopId = url.searchParams.get('stop');
      if (!AGENCIES[agency] || !stopId) return [400, { error: 'agency and stop are required', code: 'BAD_REQUEST' }];
      const station = stops.get(agency, stopId);
      const s = await realtime.snapshot();
      const live = liveArrivalState(s, agency);
      const result = live.verified
        ? arrivalsForStop({ updates: s.updates, quality: s.quality, agencyId: agency, stopId, includeChildStops: station?.stopIds || [] })
        : { status: 'unverified', reasons: live.reasons, arrivals: [], canceled: [] };
      const feed = agency === 'bart' && s.configured?.bartDirect ? s.feeds.bartUpdates : s.feeds.updates;
      return [200, { agency, stop: station || { agency, id: stopId }, ...result, feed: feed || null, stale: Boolean(feed?.stale), ageSeconds: live.ageSeconds ?? null, generatedAt: s.generatedAt }];
    },
    '/api/v2/stops/search': async url => {
      const q = url.searchParams.get('q') || '';
      const agencies = url.searchParams.get('agencies')?.split(',').filter(a => AGENCIES[a]) || null;
      return [200, { query: q, results: stops.search(q, { limit: Number(url.searchParams.get('limit')) || 10, agencies }) }];
    },
    // One search box for everything: transit stations/stops (GTFS) plus addresses, businesses,
    // landmarks, streets and neighborhoods (OpenStreetMap).
    '/api/v2/places/search': async url => {
      const q = (url.searchParams.get('q') || '').slice(0, 120);
      const limit = Math.max(1, Math.min(15, Number(url.searchParams.get('limit')) || 8));
      const near = parseNear(url.searchParams.get('near'));
      // "Powell St BART", "Diridon Caltrain": an agency name narrows station results and is not part of the place name.
      const AGENCY_WORDS = { bart: 'bart', muni: 'muni', caltrain: 'caltrain', vta: 'vta', 'ac transit': 'act', actransit: 'act' };
      let text = q.toLowerCase(), agencyHint = null;
      for (const [word, id] of Object.entries(AGENCY_WORDS)) {
        const re = new RegExp(`\\b${word}\\b`);
        if (re.test(text)) { agencyHint = id; text = text.replace(re, ' ').replace(/\s+/g, ' ').trim(); }
      }
      if (!text) text = q;
      const stations = stops.search(text, { limit: 4, agencies: agencyHint ? [agencyHint] : null }).filter(s => s.station || agencyHint).map(s => ({
        kind: s.station ? 'station' : 'stop', id: `${s.agency}:${s.id}`, name: s.name, address: null, city: null, category: `${s.agencyName} ${s.station ? 'station' : 'stop'}`,
        lat: s.lat, lon: s.lon, agency: s.agency, stopIds: s.stopIds, source: 'gtfs'
      }));
      const found = places ? places.search(agencyHint ? text : q, { limit, near }) : [];
      // Stations first when the query names them, then OSM results, without duplicating a station OSM also lists.
      const norm = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/ station$/, '').trim();
      const stationNames = new Set(stations.map(s => norm(s.name)));
      const merged = [...stations.slice(0, agencyHint ? 4 : 3), ...found.filter(p => !(p.category === 'Station' && stationNames.has(norm(p.name))))].slice(0, limit);
      return [200, { query: q, results: merged, addressSearch: places ? 'available' : 'unavailable', ...(places ? {} : { reason: placesUnavailableReason }) }];
    },
    '/api/v2/places/reverse': async url => {
      const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [400, { error: 'lat and lon are required', code: 'BAD_REQUEST' }];
      if (!places) return [503, { error: placesUnavailableReason, code: 'PLACES_UNAVAILABLE' }];
      return [200, { result: places.reverse(lat, lon) }];
    },
    '/api/v2/plan': async url => {
      let request;
      try { request = parsePlanParams(url.searchParams); }
      catch (error) { if (error instanceof PlanRequestError) return [400, { error: error.message, field: error.field, code: 'BAD_REQUEST' }]; throw error; }
      try { return [200, await otp.plan(request)]; }
      catch (error) { if (error.status) return [error.status, { error: error.message, code: error.code }]; throw error; }
    },
    // One call for the frontend to decide what to show: which subsystems are live, which agencies' arrivals are verified.
    '/api/v2/status': async () => {
      let routing;
      try { routing = { available: true, access: [...SUPPORTED_ACCESS], walkSteps: true, driveTraffic: false, maxDriveMinutes: 20, bounds: PLAN_BOUNDS, ...(await otp.health()) }; }
      catch (error) { routing = { available: false, access: [], walkSteps: false, bounds: PLAN_BOUNDS, code: error.code || 'ROUTING_UNAVAILABLE' }; }
      const rt = realtime.status();
      let snap = null;
      try { snap = await realtime.snapshot(); } catch { snap = null; }
      return [200, {
        region: 'San Francisco Bay Area',
        agencies: Object.values(AGENCIES).map(a => ({
          id: a.id, name: a.name,
          ...(live => ({ arrivals: live.verified ? 'verified' : 'unverified', arrivalsReasons: live.reasons, liveAgeSeconds: live.ageSeconds ?? null }))(snap ? liveArrivalState(snap, a.id) : { verified: false, reasons: ['Live data is unavailable.'] }),
          vehicles: a.id === 'bart' ? 'not-published' : !rt.configured ? 'not-configured' : (snap?.quality?.[a.id]?.vehicles ? 'live' : 'none')
        })),
        search: { stations: true, addresses: Boolean(places), ...(places ? { counts: places.meta.counts || null } : { reason: placesUnavailableReason }) },
        routing,
        realtime: { feed511: rt.configured, bartDirect: rt.bartDirect }
      }];
    },
    'POST /api/journeys': async (url, req) => {
      // JSON only: a cross-site form or text/plain post cannot start trip plans on a visitor's behalf.
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
        req.resume();
        return [415, { error: { code: 'BAD_REQUEST', message: 'Send the request body as JSON (Content-Type: application/json).', field: 'body' } }];
      }
      let request;
      try { request = parseJourneyBody(await readJson(req)); }
      catch (error) {
        if (error instanceof JourneyRequestError || error.status === 400 || error.status === 413) return [error.status || 400, { error: { code: 'BAD_REQUEST', message: error.message, field: error.field || null } }];
        throw error;
      }
      let plan;
      try { plan = await otp.plan(request); }
      catch (error) { if (error.status) return [error.status, { error: { code: error.code, message: error.message } }]; throw error; }
      const body = toJourneyResponse(plan);
      return [body.itineraries.length ? 200 : 404, body];
    },
    '/api/v2/plan/status': async () => {
      try { return [200, { available: true, engine: 'OpenTripPlanner', access: [...SUPPORTED_ACCESS], walkSteps: true, maxDriveMinutes: 20, bounds: PLAN_BOUNDS, ...(await otp.health()) }]; }
      catch (error) { return [503, { available: false, engine: 'OpenTripPlanner', bounds: PLAN_BOUNDS, error: error.message, code: error.code || 'ROUTING_UNAVAILABLE' }]; }
    }
  };

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const cors = url.pathname.startsWith('/api/') ? corsHeaders(req.headers.origin) : {};
      const reply = (status, body) => send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json; charset=utf-8', ...cors });
      const getRoute = routes[url.pathname];
      const postRoute = routes[`POST ${url.pathname}`];
      if (getRoute || postRoute) {
        if (req.method === 'OPTIONS') return send(res, 204, '', cors);
        const route = (req.method === 'GET' || req.method === 'HEAD') ? getRoute : req.method === 'POST' ? postRoute : null;
        if (!route) return send(res, 405, JSON.stringify({ error: 'Method not allowed' }), { 'Content-Type': 'application/json; charset=utf-8', Allow: [getRoute && 'GET', postRoute && 'POST'].filter(Boolean).join(', '), ...cors });
        const [status, body] = await route(url, req);
        return reply(status, body);
      }
      if (url.pathname.startsWith('/api/')) return reply(404, { error: 'Not found' });

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
      let requestPath;
      try { requestPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)); }
      catch { return send(res, 400, 'Bad request'); }
      const isAllowed = ALLOWED_ROOT_FILES.has(requestPath) || requestPath.startsWith('public/');
      if (!isAllowed || requestPath.split('/').some(part => part.startsWith('.') || part === '')) return send(res, 404, 'Not found');
      const base = requestPath.startsWith('public/data/') ? root : frontendRoot;
      const filePath = path.resolve(base, requestPath);
      if (!filePath.startsWith(base + path.sep)) return send(res, 403, 'Forbidden');
      const stat = fs.existsSync(filePath) && fs.statSync(filePath);
      if (!stat || !stat.isFile()) return send(res, 404, 'Not found');
      // A symbolic link inside the served folders must not lead outside them.
      if (!fs.realpathSync(filePath).startsWith(fs.realpathSync(base) + path.sep)) return send(res, 404, 'Not found');
      send(res, 200, fs.readFileSync(filePath), { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': requestPath.startsWith('public/data/') ? 'public, max-age=300' : 'no-cache', ...PAGE_HEADERS });
    } catch (error) {
      log.error?.(error.message);
      json(res, 500, { error: 'Internal server error' });
    }
  };
}
