// Actual Pacific wall-clock midnight, including spring/fall DST transitions.
// GTFS times count elapsed seconds from the service day's local midnight.
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', timeZoneName: 'shortOffset'
});
function offsetMinutes(instant) {
  const zone = formatter.formatToParts(instant).find(p => p.type === 'timeZoneName')?.value;
  const match = /^GMT([+-]\d+)(?::(\d+))?$/.exec(zone || '');
  if (!match) throw new Error('Unable to resolve Pacific time offset');
  const hours = Number(match[1]);
  return hours * 60 + Math.sign(hours) * Number(match[2] || 0);
}
export function pacificMidnight(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(day + 'T00:00:00Z').toISOString().slice(0,10) !== day)
    throw new Error('Invalid service date');
  const midnightUTC = Date.parse(day + 'T00:00:00Z');
  let instant = midnightUTC - offsetMinutes(new Date(midnightUTC + 12*3600000)) * 60000;
  // The offset at midnight can differ from the offset at noon on a DST day.
  instant = midnightUTC - offsetMinutes(new Date(instant)) * 60000;
  return instant;
}
export function serviceDayOffset(baseDay, day) {
  return (pacificMidnight(day) - pacificMidnight(baseDay)) / 1000;
}
