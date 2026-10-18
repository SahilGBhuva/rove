import fs from 'node:fs';
import path from 'node:path';
import { AGENCIES } from './agencies.mjs';
import { arrivalsForStop } from './realtime/match.mjs';
import { PlanRequestError, parsePlanParams } from './routing/otp.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const ALLOWED_ROOT_FILES = new Set(['index.html', 'app.js', 'styles.css']);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res, status, value) => send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });

/**
 * Build the HTTP request handler.
 * @param {object} deps
 * @param {string} deps.root repository root (static files)
 * @param {import('./realtime/service.mjs').RealtimeService} deps.realtime
 * @param {import('./routing/otp.mjs').OtpClient} deps.otp
 * @param {import('./stops-search.mjs').StopSearch} deps.stops
 */
export function createHandler({ root, realtime, otp, stops, places = null, placesUnavailableReason = 'place index not loaded', log = console }) {
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
      const result = arrivalsForStop({ updates: s.updates, quality: s.quality, agencyId: agency, stopId, includeChildStops: station?.stopIds || [] });
      const feed = agency === 'bart' ? s.feeds.bartUpdates : s.feeds.updates;
      return [200, { agency, stop: station || { agency, id: stopId }, ...result, feed: feed || null, stale: Boolean(feed?.stale), generatedAt: s.generatedAt }];
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
    '/api/v2/plan/status': async () => {
      try { return [200, { available: true, engine: 'OpenTripPlanner', ...(await otp.health()) }]; }
      catch (error) { return [503, { available: false, engine: 'OpenTripPlanner', error: error.message, code: error.code || 'ROUTING_UNAVAILABLE' }]; }
    }
  };

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const route = routes[url.pathname];
      if (route) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
        const [status, body] = await route(url);
        return json(res, status, body);
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });

      const requestPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const isAllowed = ALLOWED_ROOT_FILES.has(requestPath) || requestPath.startsWith('public/');
      if (!isAllowed || requestPath.split('/').some(part => part.startsWith('.') || part === '')) return send(res, 404, 'Not found');
      const filePath = path.resolve(root, requestPath);
      if (!filePath.startsWith(root + path.sep)) return send(res, 403, 'Forbidden');
      const stat = fs.existsSync(filePath) && fs.statSync(filePath);
      if (!stat || !stat.isFile()) return send(res, 404, 'Not found');
      send(res, 200, fs.readFileSync(filePath), { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': requestPath.startsWith('public/data/') ? 'public, max-age=300' : 'no-cache' });
    } catch (error) {
      log.error?.(error.message);
      json(res, 500, { error: 'Internal server error' });
    }
  };
}
