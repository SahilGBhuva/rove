/* Live status for ONE planned trip: the exact vehicle the rider is catching or riding.
 * Matching is by trip id (verified to match the static timetable for all five agencies) and,
 * where stop ids also match (BART, Muni, AC Transit, Caltrain), by stop. When the stop cannot be
 * matched, the trip's reported delay is applied to the scheduled time and labelled as such.
 * Nothing here guesses: no match means no live data. */
const MAX_FEED_AGE_S = 300;

// '511' regional feeds prefix ids ('SF:12345'); the planner prefixes with the agency ('bart:M30-2').
export const rtId = id => String(id ?? '').replace(/^[A-Za-z]{2}:/, '');
export const plannerId = id => String(id ?? '').replace(/^[a-z]+:/, '');
const num = v => (v && typeof v.toNumber === 'function' ? v.toNumber() : Number(v));
const stuTime = (s, prefer) => {
  const first = prefer === 'arrival' ? s.arrival : s.departure;
  const second = prefer === 'arrival' ? s.departure : s.arrival;
  const t = num(first?.time) || num(second?.time);
  return Number.isFinite(t) && t > 0 ? t : null;
};
const stuDelay = s => { const d = num(s.departure?.delay ?? s.arrival?.delay); return Number.isFinite(d) ? d : null; };

/* Upcoming stop updates of a trip, in order, without stops already passed. */
function upcoming(update, now) {
  return (update.stopTimeUpdate || []).filter(s => s.scheduleRelationship !== 1 && (stuTime(s, 'arrival') ?? Infinity) >= now - 30);
}

function stopEstimate(stus, stopId, scheduled, prefer, now) {
  if (!stopId) return null;
  const i = stus.findIndex(s => rtId(s.stopId) === stopId);
  if (i >= 0) {
    const time = stuTime(stus[i], prefer);
    if (time) return { time, delay: stuDelay(stus[i]), source: 'stop', stopsAway: i };
  }
  // Stop not in the feed under the same id: apply the trip's nearest reported delay to the schedule.
  const withDelay = stus.find(s => stuDelay(s) != null);
  if (withDelay && Number.isFinite(scheduled)) {
    const delay = stuDelay(withDelay);
    return { time: scheduled + delay, delay, source: 'delay', stopsAway: null };
  }
  return null;
}

/**
 * @param feed { timestamp, entities } trip-update feed
 * @param vehicles [{ tripId, lat, lon, bearing, timestamp }] (may be empty: BART has no GPS feed)
 * @param q { tripId, boardStopId, exitStopId, routeId, scheduledBoard, scheduledExit } (epoch seconds)
 */
export function tripLive(feed, vehicles, q, now = Math.floor(Date.now() / 1000)) {
  const base = { generatedAt: now, feedTimestamp: feed?.timestamp || null };
  if (!feed?.timestamp || now - feed.timestamp > MAX_FEED_AGE_S) return { ...base, status: 'stale', reasons: ['Live predictions are out of date.'] };
  const tripId = String(q.tripId || '');
  const entity = (feed.entities || []).find(e => e.tripUpdate && rtId(e.tripUpdate.trip?.tripId) === tripId);
  const vehicle = (vehicles || []).find(v => rtId(v.tripId) === tripId) || null;
  const next = nextOnRoute(feed, q, now);
  if (!entity) return { ...base, status: 'no-trip', reasons: ['This trip is not in the live feed right now.'], vehicle, next };
  const update = entity.tripUpdate;
  if (update.trip?.scheduleRelationship === 3) return { ...base, status: 'canceled', reasons: ['The agency reports this trip as canceled.'], vehicle: null, next };
  const stus = upcoming(update, now);
  return {
    ...base,
    status: 'live',
    board: stopEstimate(stus, q.boardStopId, q.scheduledBoard, 'departure', now),
    exit: stopEstimate(stus, q.exitStopId, q.scheduledExit, 'arrival', now),
    vehicle: vehicle && { lat: vehicle.lat, lon: vehicle.lon, bearing: vehicle.bearing ?? null, timestamp: vehicle.timestamp || null },
    next
  };
}

/* Other live departures of the same route from the boarding stop (for "missed it?" recovery). */
export function nextOnRoute(feed, q, now) {
  if (!q.boardStopId || !q.routeId) return [];
  const out = [];
  for (const e of feed?.entities || []) {
    const u = e.tripUpdate;
    if (!u || u.trip?.scheduleRelationship === 3) continue;
    const route = rtId(u.trip?.routeId);
    if (route && route !== String(q.routeId)) continue;
    if (!route && rtId(u.trip?.tripId) !== String(q.tripId)) continue; // feeds without route ids: only this trip
    const s = (u.stopTimeUpdate || []).find(x => rtId(x.stopId) === q.boardStopId && x.scheduleRelationship !== 1);
    const t = s && stuTime(s, 'departure');
    if (t && t >= now - 30 && t <= now + 5400) out.push({ tripId: rtId(u.trip?.tripId), time: t, delay: stuDelay(s) });
  }
  return out.sort((a, b) => a.time - b.time).slice(0, 4);
}
