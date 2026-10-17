import { AGENCIES } from '../agencies.mjs';

/** Service area accepted by the planner (covers all five agencies, Gilroy to Antioch). */
export const PLAN_BOUNDS = Object.freeze({ minLat: 36.9, maxLat: 38.2, minLon: -122.75, maxLon: -121.4 });
export const TIME_ZONE = 'America/Los_Angeles';

const TRANSIT_MODES = ['BUS', 'RAIL', 'SUBWAY', 'TRAM', 'CABLE_CAR', 'FERRY', 'FUNICULAR', 'TROLLEYBUS'];

export const PLAN_QUERY = `
query RovePlan($origin: PlanLabeledLocationInput!, $destination: PlanLabeledLocationInput!, $dateTime: PlanDateTimeInput, $first: Int, $modes: PlanModesInput, $searchWindow: Duration) {
  planConnection(origin: $origin, destination: $destination, dateTime: $dateTime, first: $first, modes: $modes, searchWindow: $searchWindow) {
    searchDateTime
    routingErrors { code description inputField }
    pageInfo { searchWindowUsed }
    edges {
      node {
        start end duration walkTime waitingTime walkDistance numberOfTransfers
        legs {
          mode transitLeg realTime realtimeState duration distance headsign serviceDate interlineWithPreviousLeg
          start { scheduledTime estimated { time delay } }
          end { scheduledTime estimated { time delay } }
          from { name lat lon stop { gtfsId code platformCode parentStation { gtfsId name } } }
          to { name lat lon stop { gtfsId code platformCode parentStation { gtfsId name } } }
          route { gtfsId shortName longName color textColor mode }
          agency { gtfsId name }
          trip { gtfsId tripHeadsign tripShortName }
          legGeometry { points }
          intermediateStops { gtfsId name lat lon }
          alerts { alertHeaderText alertDescriptionText effectiveStartDate effectiveEndDate }
        }
      }
    }
  }
}`;

export const HEALTH_QUERY = `query RoveHealth { feeds { feedId agencies { gtfsId name } } serviceTimeRange { start end } }`;

export class PlanRequestError extends Error {
  constructor(message, field) { super(message); this.field = field; this.status = 400; }
}

/** Format a Date as an ISO offset date-time in Pacific time, e.g. 2026-10-20T08:00:00-07:00. */
export function toPacificOffsetDateTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(p => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMin = Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function parseCoordinate(raw, field, min, max) {
  const value = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isFinite(value)) throw new PlanRequestError(`${field} is required and must be a number`, field);
  if (value < min || value > max) throw new PlanRequestError(`${field} is outside the Bay Area service area`, field);
  return value;
}

/**
 * Validate and normalise planner input from query parameters.
 * Accepted: fromLat, fromLon, toLat, toLon, fromName, toName,
 * time (ISO 8601; default now), arriveBy (true|false), modes (comma list of
 * transit modes or agency ids), limit (1-6), maxWalkMeters (optional, informational).
 */
export function parsePlanParams(params, now = new Date()) {
  const get = k => params.get ? params.get(k) : params[k];
  const from = { lat: parseCoordinate(get('fromLat'), 'fromLat', PLAN_BOUNDS.minLat, PLAN_BOUNDS.maxLat), lon: parseCoordinate(get('fromLon'), 'fromLon', PLAN_BOUNDS.minLon, PLAN_BOUNDS.maxLon), name: (get('fromName') || '').slice(0, 120) };
  const to = { lat: parseCoordinate(get('toLat'), 'toLat', PLAN_BOUNDS.minLat, PLAN_BOUNDS.maxLat), lon: parseCoordinate(get('toLon'), 'toLon', PLAN_BOUNDS.minLon, PLAN_BOUNDS.maxLon), name: (get('toName') || '').slice(0, 120) };
  if (Math.abs(from.lat - to.lat) < 1e-6 && Math.abs(from.lon - to.lon) < 1e-6) throw new PlanRequestError('Origin and destination are the same place', 'toLat');

  let when = now;
  const timeRaw = get('time');
  if (timeRaw) {
    when = new Date(timeRaw);
    if (Number.isNaN(when.getTime())) throw new PlanRequestError('time must be an ISO 8601 date-time', 'time');
    const days = (when.getTime() - now.getTime()) / 86_400_000;
    if (days < -1 || days > 60) throw new PlanRequestError('time must be within the next 60 days', 'time');
  }
  const arriveBy = String(get('arriveBy') || 'false').toLowerCase() === 'true';
  const limitRaw = get('limit');
  const limit = limitRaw == null || limitRaw === '' ? 5 : Math.max(1, Math.min(6, Math.trunc(Number(limitRaw)) || 5));

  let transitModes = null;
  const modesRaw = get('modes');
  if (modesRaw) {
    transitModes = [...new Set(String(modesRaw).toUpperCase().split(',').map(s => s.trim()).filter(Boolean))];
    const bad = transitModes.filter(m => !TRANSIT_MODES.includes(m));
    if (bad.length) throw new PlanRequestError(`Unsupported mode(s): ${bad.join(', ')}`, 'modes');
  }
  return { from, to, when, arriveBy, limit, transitModes };
}

export function buildPlanVariables({ from, to, when, arriveBy, limit, transitModes }) {
  const dateTime = arriveBy ? { latestArrival: toPacificOffsetDateTime(when) } : { earliestDeparture: toPacificOffsetDateTime(when) };
  const variables = {
    origin: { label: from.name || 'Origin', location: { coordinate: { latitude: from.lat, longitude: from.lon } } },
    destination: { label: to.name || 'Destination', location: { coordinate: { latitude: to.lat, longitude: to.lon } } },
    dateTime,
    first: limit,
    modes: { direct: ['WALK'], transit: { access: ['WALK'], egress: ['WALK'], transfer: ['WALK'] } }
  };
  if (transitModes?.length) variables.modes.transit.transit = transitModes.map(mode => ({ mode }));
  return variables;
}

/** Decode a Google encoded polyline (precision 5) into [lon, lat] pairs for GeoJSON. */
export function decodePolyline(encoded, precision = 5) {
  if (!encoded) return [];
  const factor = 10 ** precision;
  const coords = [];
  let index = 0, lat = 0, lon = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, byte;
      do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20 && index <= encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lon += delta;
    }
    coords.push([Number((lon / factor).toFixed(6)), Number((lat / factor).toFixed(6))]);
  }
  return coords;
}

/** "PT2M30S" or "-PT45S" -> seconds. */
export function isoDurationToSeconds(value) {
  if (value == null) return null;
  const m = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(value));
  if (!m) return null;
  const s = (+(m[2] || 0)) * 86400 + (+(m[3] || 0)) * 3600 + (+(m[4] || 0)) * 60 + (+(m[5] || 0));
  return Math.round(m[1] ? -s : s);
}

/** Split an OTP gtfsId ("muni:1234") into Rove agency id + static id. */
export function splitGtfsId(gtfsId) {
  if (!gtfsId) return { agency: null, id: null, gtfsId: null };
  const i = gtfsId.indexOf(':');
  const feed = i > 0 ? gtfsId.slice(0, i) : null;
  return { agency: feed && AGENCIES[feed] ? feed : null, feedId: feed, id: i > 0 ? gtfsId.slice(i + 1) : gtfsId, gtfsId };
}

function legTime(t) {
  if (!t) return null;
  return {
    scheduled: t.scheduledTime,
    estimated: t.estimated?.time || null,
    delaySeconds: t.estimated ? isoDurationToSeconds(t.estimated.delay) : null
  };
}

function place(p) {
  if (!p) return null;
  const stop = p.stop ? { ...splitGtfsId(p.stop.gtfsId), code: p.stop.code || null, platform: p.stop.platformCode || null, station: p.stop.parentStation ? { ...splitGtfsId(p.stop.parentStation.gtfsId), name: p.stop.parentStation.name } : null } : null;
  return { name: p.name || stop?.station?.name || null, lat: p.lat, lon: p.lon, stop };
}

const color = c => c ? `#${String(c).replace(/^#/, '')}` : null;

export function normalizeItinerary(node, index) {
  const legs = (node.legs || []).map(leg => {
    const route = leg.route ? splitGtfsId(leg.route.gtfsId) : null;
    const agencyId = route?.agency || splitGtfsId(leg.agency?.gtfsId).feedId || null;
    return {
      mode: leg.mode,
      transit: Boolean(leg.transitLeg),
      agency: leg.transitLeg ? { id: AGENCIES[agencyId] ? agencyId : null, name: AGENCIES[agencyId]?.name || leg.agency?.name || null } : null,
      route: leg.route ? { id: route.id, gtfsId: leg.route.gtfsId, shortName: leg.route.shortName || null, longName: leg.route.longName || null, color: color(leg.route.color), textColor: color(leg.route.textColor) } : null,
      trip: leg.trip ? { id: splitGtfsId(leg.trip.gtfsId).id, gtfsId: leg.trip.gtfsId, headsign: leg.trip.tripHeadsign || leg.headsign || null, shortName: leg.trip.tripShortName || null } : null,
      headsign: leg.headsign || leg.trip?.tripHeadsign || null,
      from: place(leg.from),
      to: place(leg.to),
      start: legTime(leg.start),
      end: legTime(leg.end),
      durationSeconds: leg.duration == null ? null : Math.round(leg.duration),
      distanceMeters: leg.distance == null ? null : Math.round(leg.distance),
      realtime: Boolean(leg.realTime),
      realtimeState: leg.realtimeState || null,
      canceled: leg.realtimeState === 'CANCELED',
      serviceDate: leg.serviceDate || null,
      staySeated: Boolean(leg.interlineWithPreviousLeg),
      intermediateStops: (leg.intermediateStops || []).map(s => ({ ...splitGtfsId(s.gtfsId), name: s.name, lat: s.lat, lon: s.lon })),
      geometry: { type: 'LineString', coordinates: decodePolyline(leg.legGeometry?.points) },
      alerts: (leg.alerts || []).map(a => ({ header: a.alertHeaderText || '', description: a.alertDescriptionText || '', start: a.effectiveStartDate ?? null, end: a.effectiveEndDate ?? null }))
    };
  });
  return {
    id: `it-${index}`,
    start: node.start,
    end: node.end,
    durationSeconds: node.duration,
    walkSeconds: node.walkTime ?? null,
    waitingSeconds: node.waitingTime ?? null,
    walkMeters: node.walkDistance == null ? null : Math.round(node.walkDistance),
    transfers: node.numberOfTransfers,
    agencies: [...new Set(legs.filter(l => l.transit && l.agency?.id).map(l => l.agency.id))],
    usesRealtime: legs.some(l => l.realtime),
    hasCancellation: legs.some(l => l.canceled),
    legs
  };
}

const ERROR_TEXT = {
  LOCATION_NOT_FOUND: 'One of the places is not near a walkable street.',
  NO_STOPS_IN_RANGE: 'No transit stops are within walking distance.',
  NO_TRANSIT_CONNECTION: 'No transit connection was found between these places.',
  NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW: 'No transit connection was found near the requested time.',
  OUTSIDE_BOUNDS: 'One of the places is outside the area Rove covers.',
  OUTSIDE_SERVICE_PERIOD: 'The requested date is outside the published schedules.',
  WALKING_BETTER_THAN_TRANSIT: 'Walking is faster than any transit option.'
};

export class OtpClient {
  constructor({ url = process.env.OTP_GRAPHQL_URL || 'http://localhost:8080/otp/gtfs/v1', fetchImpl = fetch, timeoutMs = 25_000 } = {}) {
    Object.assign(this, { url, fetchImpl, timeoutMs });
  }

  async #post(query, variables) {
    let response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      const e = new Error(error.name === 'TimeoutError' ? 'The routing engine timed out' : 'The routing engine is not running');
      e.status = 503; e.code = error.name === 'TimeoutError' ? 'ROUTING_TIMEOUT' : 'ROUTING_UNAVAILABLE';
      throw e;
    }
    if (!response.ok) {
      const e = new Error(`The routing engine returned HTTP ${response.status}`);
      e.status = 502; e.code = 'ROUTING_UPSTREAM_ERROR';
      throw e;
    }
    const body = await response.json();
    if (body.errors?.length && !body.data) {
      const e = new Error('The routing engine rejected the query');
      e.status = 502; e.code = 'ROUTING_QUERY_ERROR'; e.detail = body.errors.map(x => x.message).slice(0, 3);
      throw e;
    }
    return body.data;
  }

  async health() {
    const data = await this.#post(HEALTH_QUERY, {});
    return {
      feeds: (data.feeds || []).map(f => f.feedId),
      serviceTimeRange: data.serviceTimeRange ? { start: data.serviceTimeRange.start, end: data.serviceTimeRange.end } : null
    };
  }

  async plan(request) {
    const data = await this.#post(PLAN_QUERY, buildPlanVariables(request));
    const conn = data.planConnection;
    const itineraries = (conn?.edges || []).map((e, i) => normalizeItinerary(e.node, i));
    const errors = (conn?.routingErrors || []).map(e => ({ code: e.code, field: e.inputField || null, message: ERROR_TEXT[e.code] || e.description }));
    return {
      request: { from: request.from, to: request.to, time: toPacificOffsetDateTime(request.when), arriveBy: request.arriveBy, modes: request.transitModes },
      searchDateTime: conn?.searchDateTime || null,
      searchWindowSeconds: isoDurationToSeconds(conn?.pageInfo?.searchWindowUsed),
      itineraries,
      errors,
      routing: { engine: 'OpenTripPlanner', realtime: itineraries.some(i => i.usesRealtime) ? 'partial' : 'scheduled' }
    };
  }
}
