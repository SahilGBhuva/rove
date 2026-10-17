import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

const rt = GtfsRealtimeBindings.transit_realtime;

const invert = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
const TRIP_REL = invert(rt.TripDescriptor.ScheduleRelationship);
const STOP_REL = invert(rt.TripUpdate.StopTimeUpdate.ScheduleRelationship);
const VEHICLE_STATUS = invert(rt.VehiclePosition.VehicleStopStatus);

export const num = value => value == null ? null
  : typeof value === 'number' ? value
  : typeof value.toNumber === 'function' ? value.toNumber()
  : Number(value);

const text = t => t?.translation?.find(x => x.language === 'en')?.text || t?.translation?.[0]?.text || '';

/** Trip schedule relationship name. Unknown numeric values (for example DELETED=7 from newer specs) are kept as text. */
const tripRelationship = v => v == null ? 'SCHEDULED' : (TRIP_REL[v] || (v === 7 ? 'DELETED' : `UNKNOWN_${v}`));
const stopRelationship = v => v == null ? 'SCHEDULED' : (STOP_REL[v] || `UNKNOWN_${v}`);

function tripDescriptor(trip) {
  return {
    tripId: trip?.tripId || '',
    routeId: trip?.routeId || '',
    directionId: trip?.directionId ?? null,
    startDate: trip?.startDate || '',
    startTime: trip?.startTime || '',
    scheduleRelationship: tripRelationship(trip?.scheduleRelationship)
  };
}

export function decodeFeedMessage(buffer) {
  return rt.FeedMessage.decode(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
}

export function encodeFeedMessage(object) {
  return rt.FeedMessage.encode(rt.FeedMessage.fromObject(object)).finish();
}

export function decodeVehicles(feed) {
  const headerTimestamp = num(feed.header?.timestamp);
  return {
    headerTimestamp,
    items: feed.entity.filter(e => e.vehicle?.position).map(e => ({
      id: e.vehicle.vehicle?.id || e.id || '',
      label: e.vehicle.vehicle?.label || '',
      ...tripDescriptor(e.vehicle.trip),
      lat: e.vehicle.position.latitude,
      lon: e.vehicle.position.longitude,
      bearing: e.vehicle.position.bearing ?? null,
      speed: e.vehicle.position.speed ?? null,
      timestamp: num(e.vehicle.timestamp) || headerTimestamp,
      stopId: e.vehicle.stopId || '',
      currentStopSequence: e.vehicle.currentStopSequence ?? null,
      status: e.vehicle.currentStatus == null ? null : VEHICLE_STATUS[e.vehicle.currentStatus] || null
    }))
  };
}

export function decodeTripUpdates(feed) {
  const headerTimestamp = num(feed.header?.timestamp);
  return {
    headerTimestamp,
    items: feed.entity.filter(e => e.tripUpdate).map(e => ({
      id: e.id || '',
      ...tripDescriptor(e.tripUpdate.trip),
      vehicleId: e.tripUpdate.vehicle?.id || '',
      timestamp: num(e.tripUpdate.timestamp) || headerTimestamp,
      delay: e.tripUpdate.delay ?? null,
      stopTimes: (e.tripUpdate.stopTimeUpdate || []).map(s => ({
        stopId: s.stopId || '',
        sequence: s.stopSequence ?? null,
        arrival: num(s.arrival?.time),
        departure: num(s.departure?.time),
        arrivalDelay: s.arrival?.delay ?? null,
        departureDelay: s.departure?.delay ?? null,
        delay: s.arrival?.delay ?? s.departure?.delay ?? null,
        uncertainty: s.arrival?.uncertainty ?? s.departure?.uncertainty ?? null,
        relationship: stopRelationship(s.scheduleRelationship)
      }))
    }))
  };
}

export function decodeAlerts(feed) {
  const headerTimestamp = num(feed.header?.timestamp);
  return {
    headerTimestamp,
    items: feed.entity.filter(e => e.alert).map(e => ({
      id: e.id || '',
      header: text(e.alert.headerText),
      description: text(e.alert.descriptionText),
      url: text(e.alert.url),
      cause: e.alert.cause ?? null,
      effect: e.alert.effect ?? null,
      activePeriods: (e.alert.activePeriod || []).map(p => ({ start: num(p.start), end: num(p.end) })),
      entities: (e.alert.informedEntity || []).map(x => ({
        agencyId: x.agencyId || '', routeId: x.routeId || '', stopId: x.stopId || '', tripId: x.trip?.tripId || ''
      }))
    }))
  };
}

export const DECODERS = { vehicles: decodeVehicles, updates: decodeTripUpdates, alerts: decodeAlerts };

export function decode(type, buffer) {
  return DECODERS[type](decodeFeedMessage(buffer));
}
