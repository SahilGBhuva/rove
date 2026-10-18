import { PlanRequestError, parsePlanParams } from './routing/otp.mjs';

/**
 * Adapter for the frontend's journey contract (docs/FRONTEND_ROUTING_API_CONTRACT.md on the
 * work-frontend branch): POST /api/journeys. It is a thin shape translation over the same
 * validated planner as GET /api/v2/plan; nothing here changes how trips are planned.
 */

const ERROR_CODES = {
  NO_TRANSIT_CONNECTION: 'NO_PATH',
  NO_TRANSIT_CONNECTION_IN_SEARCH_WINDOW: 'NO_PATH',
  WALKING_BETTER_THAN_TRANSIT: 'WALKING_BETTER',
  NO_STOPS_IN_RANGE: 'NO_STOPS_NEARBY',
  LOCATION_NOT_FOUND: 'LOCATION_NOT_ROUTABLE',
  OUTSIDE_BOUNDS: 'OUTSIDE_SERVICE_AREA',
  OUTSIDE_SERVICE_PERIOD: 'OUTSIDE_SCHEDULE'
};

export class JourneyRequestError extends Error {
  constructor(message, field) { super(message); this.status = 400; this.field = field; }
}

const point = (p, label) => {
  if (!p || typeof p !== 'object') throw new JourneyRequestError(`${label} is required`, label);
  return p;
};

/** Translate the JSON body into the planner's validated request. */
export function parseJourneyBody(body, now = new Date()) {
  if (!body || typeof body !== 'object') throw new JourneyRequestError('Request body must be a JSON object', 'body');
  const from = point(body.from, 'from'), to = point(body.to, 'to');
  const modes = Array.isArray(body.modes) ? body.modes.map(m => String(m).toUpperCase()) : null;
  if (modes && modes.some(m => !['TRANSIT', 'WALK', 'BUS', 'RAIL', 'SUBWAY', 'TRAM', 'CABLE_CAR', 'FERRY', 'TROLLEYBUS', 'FUNICULAR'].includes(m))) {
    throw new JourneyRequestError('modes may contain TRANSIT, WALK or specific transit modes', 'modes');
  }
  const specific = modes?.filter(m => m !== 'TRANSIT' && m !== 'WALK') || [];
  const params = {
    fromLat: from.lat, fromLon: from.lon, fromName: from.name || '',
    toLat: to.lat, toLon: to.lon, toName: to.name || '',
    time: body.dateTime || '', arriveBy: body.arriveBy ? 'true' : 'false',
    limit: body.limit ?? '', modes: specific.length ? specific.join(',') : ''
  };
  try {
    return parsePlanParams(params, now);
  } catch (error) {
    if (error instanceof PlanRequestError) {
      const field = error.field.startsWith('from') ? 'from' : error.field.startsWith('to') ? 'to' : error.field === 'time' ? 'dateTime' : error.field;
      throw new JourneyRequestError(error.message, field);
    }
    throw error;
  }
}

const place = p => p && { name: p.name, lat: p.lat, lon: p.lon, stopId: p.stop?.id ?? null, agencyId: p.stop?.agency ?? null, stationId: p.stop?.station?.id ?? null, platform: p.stop?.platform ?? null };

/** Translate a /api/v2/plan result into the frontend journey shape. */
export function toJourneyResponse(plan, generatedAt = new Date()) {
  return {
    generatedAt: generatedAt.toISOString(),
    routing: plan.routing,
    request: plan.request,
    itineraries: plan.itineraries.map(it => ({
      // Stable for the same trip: built from the boarded trips and times, not from list position.
      id: it.legs.map(l => l.transit ? `${l.agency?.id}:${l.trip?.id}@${l.start.scheduled}` : `walk@${l.start.scheduled}`).join('|'),
      startTime: it.start,
      endTime: it.end,
      durationSeconds: it.durationSeconds,
      walkMeters: it.walkMeters,
      walkSeconds: it.walkSeconds,
      waitingSeconds: it.waitingSeconds,
      transfers: it.transfers,
      agencies: it.agencies,
      hasCancellation: it.hasCancellation,
      legs: it.legs.map(l => ({
        mode: l.transit ? 'TRANSIT' : l.mode,
        vehicleMode: l.transit ? l.mode : null,
        agencyId: l.agency?.id ?? null,
        agencyName: l.agency?.name ?? null,
        routeId: l.route?.id ?? null,
        routeName: l.route ? (l.route.shortName || l.route.longName) : null,
        routeLongName: l.route?.longName ?? null,
        routeColor: l.route?.color ?? null,
        routeTextColor: l.route?.textColor ?? null,
        tripId: l.trip?.id ?? null,
        headsign: l.headsign,
        from: place(l.from),
        to: place(l.to),
        startTime: l.start.scheduled,
        endTime: l.end.scheduled,
        durationSeconds: l.durationSeconds,
        distanceMeters: l.distanceMeters,
        intermediateStops: l.intermediateStops.map(s => ({ name: s.name, lat: s.lat, lon: s.lon, stopId: s.id })),
        geometry: l.geometry,
        // Scheduled routing: true only when OTP itself applied realtime data to this leg.
        realtime: Boolean(l.realtime && l.start.estimated),
        delaySeconds: l.realtime ? l.start.delaySeconds : null,
        canceled: l.canceled,
        staySeated: l.staySeated,
        alerts: l.alerts
      }))
    })),
    ...(plan.itineraries.length ? {} : {
      error: plan.errors.length
        ? { code: ERROR_CODES[plan.errors[0].code] || plan.errors[0].code, message: plan.errors[0].message }
        : { code: 'NO_PATH', message: 'No transit journey was found.' }
    })
  };
}
