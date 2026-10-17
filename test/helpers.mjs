// Test-only fixtures. Nothing here is used by the running server.
import { AGENCIES } from '../lib/agencies.mjs';
import { AgencyStaticIndex } from '../lib/gtfs/static-index.mjs';
import { encodeFeedMessage } from '../lib/realtime/decode.mjs';

export const SERVICE_DATE = '20261020'; // a Tuesday
export const NOW_MS = Date.UTC(2026, 9, 20, 16, 0, 0); // 09:00 Pacific
export const NOW_S = NOW_MS / 1000;

const calendarRow = (service_id, days = '1111100') => ({
  service_id, start_date: '20260801', end_date: '20270131',
  monday: days[0], tuesday: days[1], wednesday: days[2], thursday: days[3], friday: days[4], saturday: days[5], sunday: days[6]
});

const stopTimes = (tripId, stops, firstSeq = 1) => stops.map((stop_id, i) => ({ trip_id: tripId, stop_sequence: String(firstSeq + i), stop_id }));

/** Small but structurally faithful static feeds, mirroring each agency's real id conventions. */
export function fixtureIndexes() {
  const m = new Map();
  m.set('muni', AgencyStaticIndex.fromTables(AGENCIES.muni, {
    routes: [{ route_id: '38R', route_short_name: '38R' }, { route_id: '14', route_short_name: '14' }],
    trips: [
      { trip_id: '11001', route_id: '38R', service_id: 'WKDY', direction_id: '0', trip_headsign: 'Ocean Beach' },
      { trip_id: '11002', route_id: '14', service_id: 'WKDY', direction_id: '1', trip_headsign: 'Downtown' },
      { trip_id: '11003', route_id: '38R', service_id: 'WKND', direction_id: '0', trip_headsign: 'Ocean Beach' }
    ],
    stops: [{ stop_id: '15550', stop_name: 'Geary & Masonic', stop_lat: '37.78', stop_lon: '-122.44' }, { stop_id: '15551', stop_name: 'Geary & Arguello', stop_lat: '37.78', stop_lon: '-122.45' }, { stop_id: '15552', stop_name: 'Mission & 5th', stop_lat: '37.78', stop_lon: '-122.41' }],
    calendar: [calendarRow('WKDY'), calendarRow('WKND', '0000011')]
  }));
  m.set('caltrain', AgencyStaticIndex.fromTables(AGENCIES.caltrain, {
    routes: [{ route_id: '77119', route_short_name: 'Local Weekday' }, { route_id: '77121', route_short_name: 'Limited' }],
    trips: [{ trip_id: '141', route_id: '77119', service_id: 'c_wkdy', direction_id: '0', trip_short_name: '141' }, { trip_id: '412', route_id: '77121', service_id: 'c_wkdy', direction_id: '1', trip_short_name: '412' }],
    stops: [{ stop_id: '70271', stop_name: 'San Jose Diridon', stop_lat: '37.33', stop_lon: '-121.90' }, { stop_id: '70261', stop_name: 'Santa Clara', stop_lat: '37.35', stop_lon: '-121.94' }],
    calendar: [calendarRow('c_wkdy')],
    stopTimes: [...stopTimes('141', ['70271', '70261']), ...stopTimes('412', ['70261', '70271'])]
  }));
  m.set('vta', AgencyStaticIndex.fromTables(AGENCIES.vta, {
    routes: [{ route_id: 'Blue', route_short_name: 'Blue Line' }, { route_id: '22', route_short_name: '22' }],
    trips: [{ trip_id: '4042835', route_id: 'Blue', service_id: '289.0.1', direction_id: '0', trip_headsign: 'BAYPOINTE' }, { trip_id: '4050001', route_id: '22', service_id: '289.0.1', direction_id: '1' }],
    // VTA's direct feed uses short numeric stop_ids with 5-digit public stop_codes; 511 may publish either.
    stops: [
      { stop_id: '4736', stop_code: '64736', stop_name: 'Santa Teresa', stop_lat: '37.23', stop_lon: '-121.79' },
      { stop_id: '4737', stop_code: '64737', stop_name: 'Cottle', stop_lat: '37.24', stop_lon: '-121.80' },
      { stop_id: '4738', stop_code: '64738', stop_name: 'Snell', stop_lat: '37.25', stop_lon: '-121.82' },
      { stop_id: '64739', stop_code: '4736', stop_name: 'Ambiguous pole', stop_lat: '37.26', stop_lon: '-121.83' },
      { stop_id: '9001', stop_code: '69001', stop_name: 'El Camino & Castro', stop_lat: '37.39', stop_lon: '-122.08' }
    ],
    calendar: [calendarRow('289.0.1')],
    stopTimes: [...stopTimes('4042835', ['4736', '4737', '4738']), ...stopTimes('4050001', ['9001'])]
  }));
  m.set('bart', AgencyStaticIndex.fromTables(AGENCIES.bart, {
    routes: [{ route_id: '1', route_short_name: 'Yellow-S' }, { route_id: '7', route_short_name: 'Red-S' }],
    trips: [{ trip_id: '1965118', route_id: '1', service_id: 'BWKDY', direction_id: '1', trip_headsign: 'SFO / Millbrae' }, { trip_id: '1965200', route_id: '7', service_id: 'BWKDY', direction_id: '1', trip_headsign: 'Millbrae' }],
    stops: [
      { stop_id: 'LAKE', stop_name: 'Lake Merritt', location_type: '1', stop_lat: '37.797', stop_lon: '-122.265' },
      { stop_id: 'A10-1', stop_name: 'Lake Merritt', parent_station: 'LAKE', stop_lat: '37.797', stop_lon: '-122.265' },
      { stop_id: 'A10-2', stop_name: 'Lake Merritt', parent_station: 'LAKE', stop_lat: '37.797', stop_lon: '-122.265' },
      { stop_id: 'M30-1', stop_name: 'Powell Street', parent_station: 'POWL', stop_lat: '37.784', stop_lon: '-122.407' },
      { stop_id: 'POWL', stop_name: 'Powell Street', location_type: '1', stop_lat: '37.784', stop_lon: '-122.407' }
    ],
    calendar: [calendarRow('BWKDY')],
    stopTimes: [...stopTimes('1965118', ['A10-1', 'M30-1'], 0), ...stopTimes('1965200', ['M30-1'], 0)]
  }));
  m.set('act', AgencyStaticIndex.fromTables(AGENCIES.act, {
    routes: [{ route_id: '51A', route_short_name: '51A' }],
    trips: [{ trip_id: '9900', route_id: '51A', service_id: 'AWK', direction_id: '0' }],
    stops: [{ stop_id: '55555', stop_name: 'Transit Center Bay C', stop_lat: '37.80', stop_lon: '-122.27' }],
    calendar: [calendarRow('AWK')]
  }));
  return m;
}

/** GTFS-RT TripUpdate entity (plain object for FeedMessage.fromObject). */
export function tripUpdate(id, { tripId, routeId, startDate = SERVICE_DATE, rel, stops = [], timestamp = NOW_S }) {
  return {
    id,
    tripUpdate: {
      trip: { tripId, routeId, startDate, ...(rel != null ? { scheduleRelationship: rel } : {}) },
      timestamp,
      stopTimeUpdate: stops.map(s => ({
        stopId: s.stopId, stopSequence: s.seq,
        ...(s.rel != null ? { scheduleRelationship: s.rel } : {}),
        ...(s.t != null ? { arrival: { time: s.t, delay: s.delay ?? 0 }, departure: { time: s.t + 20 } } : {})
      }))
    }
  };
}

export function feed(entities, headerTimestamp = NOW_S) {
  return encodeFeedMessage({ header: { gtfsRealtimeVersion: '2.0', incrementality: 0, timestamp: headerTimestamp }, entity: entities });
}

export const vehicle = (id, { tripId, routeId, lat = 37.78, lon = -122.44, timestamp = NOW_S }) => ({
  id, vehicle: { trip: { tripId, routeId, startDate: SERVICE_DATE }, vehicle: { id, label: id }, position: { latitude: lat, longitude: lon }, timestamp }
});

export const alert = (id, header, entities) => ({ id, alert: { headerText: { translation: [{ text: header, language: 'en' }] }, informedEntity: entities } });

/** Build N matched trip-update predictions so the quality gate has enough samples. */
export function manyMuniUpdates(n, start = NOW_S + 300) {
  return Array.from({ length: n }, (_, i) => tripUpdate(`m${i}`, { tripId: 'SF:11001', routeId: 'SF:38R', stops: [{ stopId: 'SF:15550', seq: 1, t: start + i * 60 }] }));
}
