import { AGENCIES, ARRIVAL_GATE, agencyFromPrefixedId, stripPrefix } from '../agencies.mjs';

/** BART publishes realtime trip ids 600-699 for Pittsburg Center and Antioch that have no GTFS match (bart.gov developer notice). */
const BART_ANTIOCH_TRIP = /^6\d\d$/;

/** Keep at most a few distinct diagnostic examples per category. */
function sample(list, value, max = 8) { if (list.length < max && !list.includes(value)) list.push(value); }

const pct = (matched, total) => total ? Number((matched * 100 / total).toFixed(1)) : null;

function emptyQuality() {
  return {
    tripUpdates: 0, tripMatched: 0, tripUnknown: 0, serviceDateMismatch: 0, documentedExceptions: 0, addedTrips: 0, canceledTrips: 0,
    stopTimes: 0, stopMatched: 0, stopConflicts: 0, stopUnmatched: 0, stopMethods: { exact: 0, code: 0, sequence: 0 },
    skippedStops: 0, noDataStops: 0, sequenceMismatches: 0,
    vehicles: 0, vehiclesMatched: 0,
    samples: { unmatchedTrips: [], unmatchedStops: [], conflicts: [], routeIdMismatch: [] }
  };
}

export function finalizeQuality(q, gate = ARRIVAL_GATE) {
  const tripDenominator = q.tripUpdates - q.documentedExceptions - q.addedTrips;
  const tripMatchPct = pct(q.tripMatched, tripDenominator);
  const stopMatchPct = pct(q.stopMatched, q.stopTimes);
  const reasons = [];
  if (!q.tripUpdates) reasons.push('no trip updates in the current feed');
  if (tripMatchPct != null && tripMatchPct < gate.minTripMatchPct) reasons.push(`trip match ${tripMatchPct}% is below ${gate.minTripMatchPct}%`);
  if (stopMatchPct == null || q.stopTimes < gate.minStopTimes) reasons.push(`too few stop predictions to verify (${q.stopTimes})`);
  else if (stopMatchPct < gate.minStopMatchPct) reasons.push(`stop match ${stopMatchPct}% is below ${gate.minStopMatchPct}%`);
  if (q.stopConflicts > gate.maxConflicts) reasons.push(`${q.stopConflicts} conflicting stop references`);
  return {
    ...q,
    tripMatchPct, stopMatchPct,
    vehicleMatchPct: pct(q.vehiclesMatched, q.vehicles),
    arrivalsVerified: reasons.length === 0,
    gateReasons: reasons
  };
}

/** Decide which agency a 511 regional entity belongs to from its prefixed ids. */
export function agencyOf511Item(item) {
  return agencyFromPrefixedId(item.tripId) || agencyFromPrefixedId(item.routeId)
    || agencyFromPrefixedId(item.stopId) || agencyFromPrefixedId(item.stopTimes?.find(s => s.stopId)?.stopId) || null;
}

export class RealtimeMatcher {
  /** @param {Map<string, import('../gtfs/static-index.mjs').AgencyStaticIndex>} indexes */
  constructor(indexes) {
    this.indexes = indexes;
    this.visitCache = new Map();
  }

  resolveTrip(agency, rawTripId, startDate, scheduleRelationship) {
    const index = this.indexes.get(agency.id);
    if (!index) return { status: 'no-static-index' };
    const tripId = stripPrefix(agency, rawTripId);
    if (!tripId) return { status: 'no-trip-id' };
    const trip = index.trips.get(tripId);
    if (!trip) {
      if (agency.id === 'bart' && BART_ANTIOCH_TRIP.test(tripId)) {
        return { status: 'documented-exception', tripId, note: 'BART Antioch line trip id; BART documents that these have no GTFS match' };
      }
      if (scheduleRelationship === 'ADDED') return { status: 'added', tripId };
      return { status: 'unknown-trip', tripId };
    }
    if (startDate && index.calendar.knows(trip.serviceId) && !index.calendar.isActive(trip.serviceId, startDate)) {
      return { status: 'service-date-mismatch', tripId, serviceDate: startDate };
    }
    const route = index.routes.get(trip.routeId) || null;
    return { status: 'matched', tripId, serviceDate: startDate || null, trip, route };
  }

  #visits(agency, tripId) {
    const key = `${agency.id}|${tripId}`;
    if (this.visitCache.has(key)) return this.visitCache.get(key);
    const index = this.indexes.get(agency.id);
    const seq = index?.tripStops.get(tripId);
    let set = null;
    if (seq) {
      set = new Set();
      for (const stopId of seq.values()) {
        set.add(stopId);
        const parent = index.stops.get(stopId)?.parent;
        if (parent) set.add(parent);
      }
    }
    if (this.visitCache.size > 50_000) this.visitCache.clear();
    this.visitCache.set(key, set);
    return set;
  }

  /** Resolve one stop_time_update to a static stop_id using only exact keys. */
  resolveStop(agency, tripId, stu) {
    const index = this.indexes.get(agency.id);
    const methods = agency.stopResolution;
    const raw = stripPrefix(agency, stu.stopId);
    const exact = methods.includes('exact') && raw && index.stops.has(raw) ? raw : null;
    const code = methods.includes('code') && raw ? index.stopCodes.get(raw) || null : null;
    if (exact && code && exact !== code) return { stopId: null, method: null, conflict: 'stop id and stop code name different stops' };
    const byId = exact || code;
    const visits = this.#visits(agency, tripId);
    if (byId) {
      if (visits && !visits.has(byId)) return { stopId: null, method: null, conflict: 'stop is not served by this trip' };
      // The stop id is authoritative once the trip is known to serve it. A differing stop_sequence is
      // recorded for diagnostics (some producers number sequences differently) but does not move the stop.
      let sequenceMismatch = false;
      if (stu.sequence != null) {
        const bySeq = index.tripStops.get(tripId)?.get(Number(stu.sequence));
        sequenceMismatch = Boolean(bySeq && bySeq !== byId && index.stops.get(bySeq)?.parent !== byId);
      }
      return { stopId: byId, method: exact ? 'exact' : 'code', conflict: null, sequenceMismatch };
    }
    if (methods.includes('sequence') && stu.sequence != null) {
      const bySeq = index.tripStops.get(tripId)?.get(Number(stu.sequence));
      if (bySeq) return { stopId: bySeq, method: 'sequence', conflict: null };
    }
    return { stopId: null, method: null, conflict: null };
  }

  /**
   * Match a list of trip updates and vehicles.
   * @param {{agency?: object, source: string, updates?: object[], vehicles?: object[]}[]} batches
   */
  match(batches) {
    const quality = Object.fromEntries(Object.keys(AGENCIES).map(id => [id, emptyQuality()]));
    const updates = [];
    const vehicles = [];
    const unassigned = { updates: 0, vehicles: 0 };

    for (const batch of batches) {
      for (const item of batch.updates || []) {
        const agency = batch.agency || agencyOf511Item(item);
        if (!agency) { unassigned.updates++; continue; }
        const q = quality[agency.id];
        q.tripUpdates++;
        const resolved = this.resolveTrip(agency, item.tripId, item.startDate, item.scheduleRelationship);
        const canceled = item.scheduleRelationship === 'CANCELED' || item.scheduleRelationship === 'DELETED';
        if (canceled) q.canceledTrips++;
        if (resolved.status === 'matched') q.tripMatched++;
        else if (resolved.status === 'documented-exception') q.documentedExceptions++;
        else if (resolved.status === 'added') q.addedTrips++;
        else if (resolved.status === 'service-date-mismatch') q.serviceDateMismatch++;
        else q.tripUnknown++;
        if (!['matched', 'documented-exception'].includes(resolved.status)) sample(q.samples.unmatchedTrips, `${item.tripId} (${resolved.status})`);
        if (resolved.status === 'matched' && item.routeId && stripPrefix(agency, item.routeId) !== resolved.trip.routeId) sample(q.samples.routeIdMismatch, `${item.routeId} -> ${resolved.trip.routeId}`);

        const stopTimes = item.stopTimes.map(stu => {
          if (stu.relationship === 'SKIPPED') q.skippedStops++;
          if (stu.relationship === 'NO_DATA') q.noDataStops++;
          let stop = { stopId: null, method: null, conflict: null };
          if (resolved.status === 'documented-exception' || resolved.status === 'added') {
            // No static trip to check against, so only an exact stop_id is accepted. These are real
            // predictions at real stops (for example BART's Antioch line); they carry no route.
            const raw = stripPrefix(agency, stu.stopId);
            if (raw && this.indexes.get(agency.id)?.stops.has(raw)) stop = { stopId: raw, method: 'exact', conflict: null };
          } else if (resolved.status === 'matched') {
            q.stopTimes++;
            stop = this.resolveStop(agency, resolved.tripId, stu);
            if (stop.stopId) { q.stopMatched++; q.stopMethods[stop.method]++; if (stop.sequenceMismatch) q.sequenceMismatches++; }
            else if (stop.conflict) { q.stopConflicts++; sample(q.samples.conflicts, `${stu.stopId}#${stu.sequence} on ${resolved.tripId}: ${stop.conflict}`); }
            else { q.stopUnmatched++; sample(q.samples.unmatchedStops, `${stu.stopId}#${stu.sequence} on ${resolved.tripId}`); }
          }
          const hasTime = stu.relationship !== 'SKIPPED' && stu.relationship !== 'NO_DATA' && !canceled;
          return {
            rawStopId: stu.stopId, stopId: stop.stopId, stopMatch: stop.method, conflict: stop.conflict,
            sequence: stu.sequence, relationship: canceled ? 'CANCELED' : stu.relationship,
            arrival: hasTime ? stu.arrival : null, departure: hasTime ? stu.departure : null,
            delay: hasTime ? stu.delay : null, uncertainty: hasTime ? stu.uncertainty ?? null : null
          };
        });

        updates.push({
          agency: agency.id, source: batch.source,
          rawTripId: item.tripId, rawRouteId: item.routeId,
          tripId: resolved.tripId || null, tripMatch: resolved.status, note: resolved.note || null,
          routeId: resolved.trip?.routeId || null,
          routeName: resolved.route ? (resolved.route.shortName || resolved.route.longName) : null,
          directionId: resolved.trip?.directionId ?? item.directionId ?? null,
          headsign: resolved.trip?.headsign || null,
          serviceDate: item.startDate || null,
          tripStatus: canceled ? 'CANCELED' : item.scheduleRelationship,
          vehicleId: item.vehicleId || null,
          timestamp: item.timestamp, delay: canceled ? null : item.delay,
          stopTimes
        });
      }

      for (const v of batch.vehicles || []) {
        const agency = batch.agency || agencyOf511Item(v);
        if (!agency) { unassigned.vehicles++; continue; }
        const q = quality[agency.id];
        q.vehicles++;
        const resolved = this.resolveTrip(agency, v.tripId, v.startDate, v.scheduleRelationship);
        if (resolved.status === 'matched') q.vehiclesMatched++;
        vehicles.push({
          agency: agency.id, source: batch.source, id: v.id, label: v.label,
          rawTripId: v.tripId, rawRouteId: v.routeId,
          tripId: resolved.tripId || null, tripMatch: resolved.status,
          routeId: resolved.trip?.routeId || null,
          routeName: resolved.route ? (resolved.route.shortName || resolved.route.longName) : null,
          headsign: resolved.trip?.headsign || null,
          directionId: resolved.trip?.directionId ?? v.directionId ?? null,
          lat: v.lat, lon: v.lon, bearing: v.bearing, speed: v.speed, timestamp: v.timestamp,
          stopId: v.stopId ? stripPrefix(agency, v.stopId) : null, status: v.status
        });
      }
    }

    const finalized = Object.fromEntries(Object.entries(quality).map(([id, q]) => [id, finalizeQuality(q)]));
    return { updates, vehicles, quality: finalized, unassigned };
  }
}

/**
 * Arrival predictions for one static stop, using only matched trips from agencies
 * whose live quality passed the gate. Returns status so the client can label
 * "no predictions" honestly instead of implying there is no service.
 */
export function arrivalsForStop({ updates, quality, agencyId, stopId, now = Date.now() / 1000, horizonSeconds = 3 * 3600, includeChildStops = [] }) {
  const q = quality?.[agencyId];
  if (!q) return { status: 'unknown-agency', arrivals: [] };
  if (!q.arrivalsVerified) return { status: 'unverified', reasons: q.gateReasons, arrivals: [] };
  const targets = new Set([stopId, ...includeChildStops]);
  const arrivals = [];
  const canceled = [];
  for (const u of updates) {
    const unscheduled = u.tripMatch === 'documented-exception' || u.tripMatch === 'added';
    if (u.agency !== agencyId || (u.tripMatch !== 'matched' && !unscheduled)) continue;
    for (const st of u.stopTimes) {
      if (!st.stopId || !targets.has(st.stopId)) continue;
      if (u.tripStatus === 'CANCELED' || st.relationship === 'SKIPPED') {
        canceled.push({ tripId: u.tripId, routeId: u.routeId, routeName: u.routeName, headsign: u.headsign, stopId: st.stopId, reason: u.tripStatus === 'CANCELED' ? 'trip-canceled' : 'stop-skipped' });
        continue;
      }
      const time = st.departure ?? st.arrival;
      if (time == null || time < now - 60 || time > now + horizonSeconds) continue;
      arrivals.push({ tripId: u.tripId, routeId: u.routeId, routeName: u.routeName, headsign: u.headsign, stopId: st.stopId, time, delay: st.delay, uncertainty: st.uncertainty, source: u.source, scheduled: !unscheduled, note: unscheduled ? (u.note || 'Added trip not in the published schedule') : null });
    }
  }
  arrivals.sort((a, b) => a.time - b.time);
  return { status: arrivals.length ? 'live' : 'no-predictions', arrivals, canceled };
}
