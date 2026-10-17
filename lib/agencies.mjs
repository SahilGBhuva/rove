/**
 * Agency registry shared by the realtime matcher, the routing proxy and the
 * OpenTripPlanner build configuration.
 *
 * - `id` is Rove's agency id. It is also the OTP feedId, so an OTP gtfsId such
 *   as `muni:1234` maps back to an agency without any lookup tables.
 * - `rtPrefix` is the operator prefix the 511 regional (agency=RG) feed puts in
 *   front of trip, route and stop ids.
 * - `realtime` names the source used for Trip Updates.
 * - `stopResolution` lists, in order, the exact methods allowed to turn a
 *   realtime stop reference into a static stop_id. No method is fuzzy:
 *     exact    realtime stop_id (prefix removed) equals a static stop_id
 *     code     realtime stop_id equals a unique static stop_code
 *     sequence static stop_times row for (trip_id, stop_sequence)
 *   When two methods both resolve a stop and disagree, the stop is left
 *   unmatched and counted as a conflict.
 */
export const AGENCIES = Object.freeze({
  bart: { id: 'bart', name: 'BART', rtPrefix: 'BA', realtime: 'bart-direct', stopResolution: ['exact', 'sequence'] },
  muni: { id: 'muni', name: 'Muni', rtPrefix: 'SF', realtime: '511', stopResolution: ['exact'] },
  caltrain: { id: 'caltrain', name: 'Caltrain', rtPrefix: 'CT', realtime: '511', stopResolution: ['exact', 'sequence'] },
  vta: { id: 'vta', name: 'VTA', rtPrefix: 'SC', realtime: '511', stopResolution: ['exact', 'code', 'sequence'] },
  act: { id: 'act', name: 'AC Transit', rtPrefix: 'AC', realtime: '511', stopResolution: ['exact'] }
});

export const AGENCY_IDS = Object.keys(AGENCIES);

const byPrefix = new Map(Object.values(AGENCIES).map(a => [a.rtPrefix, a]));

/** Returns the agency for a 511-prefixed id such as `SF:1234`, or null. */
export function agencyFromPrefixedId(value) {
  const match = /^([A-Za-z0-9]{2,3}):/.exec(String(value || ''));
  return match ? byPrefix.get(match[1].toUpperCase()) || null : null;
}

export function agencyFromRtPrefix(prefix) {
  return byPrefix.get(String(prefix || '').toUpperCase()) || null;
}

/** Removes an agency's 511 prefix; leaves ids without that prefix untouched. */
export function stripPrefix(agency, value) {
  const s = String(value ?? '');
  const p = `${agency.rtPrefix}:`;
  return s.toUpperCase().startsWith(p) ? s.slice(p.length) : s;
}

/**
 * Minimum quality, measured on the live feed, before an agency's arrival
 * predictions are exposed. Muni and AC Transit pass today; VTA and BART must
 * earn it from live data rather than by configuration.
 */
export const ARRIVAL_GATE = Object.freeze({ minTripMatchPct: 99, minStopMatchPct: 99, maxConflicts: 0, minStopTimes: 20 });
