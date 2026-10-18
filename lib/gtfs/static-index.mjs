import path from 'node:path';
import { readTable, streamTable } from './csv.mjs';

/** Day-of-week column names in calendar.txt, indexed by Date#getUTCDay(). */
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function ymdToDow(ymd) {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(4, 6)), d = Number(ymd.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Service calendar for one feed: answers "does service_id run on YYYYMMDD?". */
export class ServiceCalendar {
  constructor(calendarRows = [], calendarDateRows = []) {
    this.base = new Map();
    for (const r of calendarRows) {
      this.base.set(r.service_id, { start: r.start_date, end: r.end_date, days: DOW.map(d => r[d] === '1') });
    }
    this.added = new Map();
    this.removed = new Map();
    for (const r of calendarDateRows) {
      const target = r.exception_type === '1' ? this.added : r.exception_type === '2' ? this.removed : null;
      if (!target) continue;
      if (!target.has(r.date)) target.set(r.date, new Set());
      target.get(r.date).add(r.service_id);
    }
  }

  isActive(serviceId, ymd) {
    if (this.removed.get(ymd)?.has(serviceId)) return false;
    if (this.added.get(ymd)?.has(serviceId)) return true;
    const b = this.base.get(serviceId);
    return Boolean(b && ymd >= b.start && ymd <= b.end && b.days[ymdToDow(ymd)]);
  }

  /** True when the feed has any knowledge of the service id. */
  knows(serviceId) {
    if (this.base.has(serviceId)) return true;
    for (const set of this.added.values()) if (set.has(serviceId)) return true;
    return false;
  }
}

/**
 * Exact lookup tables for one agency's static GTFS.
 * Built once at server start; never consulted with partial or fuzzy keys.
 */
export class AgencyStaticIndex {
  constructor(agency) {
    this.agency = agency;
    this.trips = new Map();        // trip_id -> { routeId, serviceId, directionId, headsign, shortName }
    this.routes = new Map();       // route_id -> { shortName, longName, color, textColor, type }
    this.stops = new Map();        // stop_id -> { name, code, lat, lon, parent, locationType }
    this.stopCodes = new Map();    // stop_code -> stop_id (only codes that are unique)
    this.tripStops = new Map();    // trip_id -> Map(stop_sequence -> stop_id) (only when needed)
    this.calendar = new ServiceCalendar();
    this.loadedAt = null;
  }

  static fromTables(agency, { routes = [], trips = [], stops = [], calendar = [], calendarDates = [], stopTimes = [] } = {}) {
    const index = new AgencyStaticIndex(agency);
    index.#ingest({ routes, trips, stops, calendar, calendarDates });
    for (const row of stopTimes) index.#addStopTime(row);
    index.loadedAt = Date.now();
    return index;
  }

  static async load(agency, directory) {
    const file = name => path.join(directory, name);
    const index = new AgencyStaticIndex(agency);
    index.#ingest({
      routes: readTable(file('routes.txt')),
      trips: readTable(file('trips.txt')),
      stops: readTable(file('stops.txt')),
      calendar: readTable(file('calendar.txt')),
      calendarDates: readTable(file('calendar_dates.txt'))
    });
    if (index.trips.size === 0 || index.stops.size === 0) {
      throw new Error(`${agency.name}: static GTFS missing trips or stops in ${directory}`);
    }
    if (agency.stopResolution.includes('sequence')) {
      await streamTable(file('stop_times.txt'), ['trip_id', 'stop_sequence', 'stop_id'], row => index.#addStopTime(row));
    }
    index.loadedAt = Date.now();
    return index;
  }

  #ingest({ routes, trips, stops, calendar, calendarDates }) {
    for (const r of routes) {
      this.routes.set(r.route_id, {
        shortName: r.route_short_name || '', longName: r.route_long_name || '',
        color: r.route_color ? `#${r.route_color}` : null, textColor: r.route_text_color ? `#${r.route_text_color}` : null,
        type: r.route_type === '' || r.route_type == null ? null : Number(r.route_type)
      });
    }
    for (const t of trips) {
      this.trips.set(t.trip_id, {
        routeId: t.route_id, serviceId: t.service_id,
        directionId: t.direction_id === '' || t.direction_id == null ? null : Number(t.direction_id),
        headsign: t.trip_headsign || '', shortName: t.trip_short_name || ''
      });
    }
    const codeCounts = new Map();
    for (const s of stops) {
      this.stops.set(s.stop_id, {
        name: s.stop_name || '', code: s.stop_code || '', lat: Number(s.stop_lat), lon: Number(s.stop_lon),
        parent: s.parent_station || '', locationType: Number(s.location_type || 0),
        platform: s.platform_code || ''
      });
      if (s.stop_code) codeCounts.set(s.stop_code, (codeCounts.get(s.stop_code) || 0) + 1);
    }
    for (const s of stops) {
      if (s.stop_code && codeCounts.get(s.stop_code) === 1) this.stopCodes.set(s.stop_code, s.stop_id);
    }
    this.calendar = new ServiceCalendar(calendar, calendarDates);
  }

  #addStopTime(row) {
    if (!row.trip_id || row.stop_sequence === '' || row.stop_sequence == null) return;
    let seq = this.tripStops.get(row.trip_id);
    if (!seq) { seq = new Map(); this.tripStops.set(row.trip_id, seq); }
    seq.set(Number(row.stop_sequence), row.stop_id);
  }
}

/** Load the static index for every agency whose extracted GTFS directory exists. */
export async function loadStaticIndexes(agencies, extractedRoot) {
  const out = new Map();
  const errors = [];
  for (const agency of agencies) {
    try {
      out.set(agency.id, await AgencyStaticIndex.load(agency, path.join(extractedRoot, agency.id)));
    } catch (error) {
      errors.push(`${agency.id}: ${error.message}`);
    }
  }
  return { indexes: out, errors };
}
