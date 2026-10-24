import {serviceDayOffset} from './timezone.mjs';
// Combine adjacent GTFS service dates without confusing 24:xx/25:xx times.
// Use local service-day date labels, not UTC timestamps, for DST-safe day offsets.
export function combineServiceDays(days) {
  if (!Array.isArray(days) || !days.length) throw new Error('At least one service day required');
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const dateNumber = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid GTFS service date');
    const n = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== date) throw new Error('Invalid GTFS service date');
    return n / 86400000;
  };
  const baseDay = sorted[0].date;
  const stops = sorted[0].stops;
  const ids = stops.map(s => s[0]);
  const trips = [], connections = [];
  for (const day of sorted) {
    dateNumber(day.date);
    const offset = serviceDayOffset(baseDay,day.date);
    if (!Array.isArray(day.stops) || day.stops.length !== ids.length ||
        day.stops.some((s, i) => s[0] !== ids[i])) {
      throw new Error('Service-day stop indexes differ; rebuild from the same GTFS archives');
    }
    const tripOffset = trips.length;
    trips.push(...day.trips);
    for (const c of day.connections) {
      if (!Array.isArray(c) || c.length < 6 || !Number.isInteger(c[4]) ||
          c[4] < 0 || c[4] >= day.trips.length) throw new Error('Invalid service-day connection');
      connections.push([c[0], c[1], c[2] + offset, c[3] + offset, c[4] + tripOffset, c[5]]);
    }
  }
  connections.sort((a, b) => a[2] - b[2] || a[3] - b[3]);
  return { date: sorted[0].date, timeZone: 'America/Los_Angeles', stops, trips, connections,
    serviceDates: sorted.map(d => d.date) };
}
