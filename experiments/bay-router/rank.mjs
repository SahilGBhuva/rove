// Itinerary quality, Pareto filtering and generalized-cost ranking for the schedule-only planner.
// All comparisons are on complete door-to-door itineraries, including access and egress walks.
// The weights are documented in docs/ROUTING.md; keep the two in sync.
export const RANKING = Object.freeze({
  TRANSFER_PENALTY_SECONDS: 300,  // each extra vehicle costs 5 minutes (transfers are hard without sight)
  WALK_RELUCTANCE: 2,             // a walking second costs 2 seconds (it is already in the duration once)
  COMFORTABLE_WALK_LEG_SECONDS: 8 * 60, // one walk longer than this (about 450 m straight line)...
  LONG_WALK_LEG_RELUCTANCE: 1,    // ...costs one more second per second beyond it (long unfamiliar walks are hard without sight)
  STOP_WAIT_RELUCTANCE: 1.5,      // a second spent waiting at a stop between vehicles costs 1.5 s
  LONG_WAIT_SECONDS: 15 * 60,     // waits at a stop beyond this cost one extra second per second
  DETOUR_PENALTY_SECONDS: 3600,   // riding away and coming back through the same stations
  BACKTRACK_SECONDS_PER_METER: 1, // net movement away from the destination, beyond a 2 km allowance
  REASONABLE_EXTRA_COST_SECONDS: 45 * 60, // alternatives costing more than best + this are not shown
  HOP_MAX_WALK_SAVED_METERS: 600, // an extra vehicle that only saves this much walking is not an alternative
  HOP_MIN_TIME_SAVED_SECONDS: 120,
});

const num = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const end = it => Date.parse(it.end);
const transfers = it => num(it.transfers);
const walk = it => num(it.walkMeters);
const initialWait = it => num(it.initialWaitSeconds);
const transferWait = it => num(it.transferWaitSeconds);
const longestWait = it => num(it.longestWaitSeconds);
// Same vehicles in the same order = same option, even if it boards or alights one stop apart.
const signature = it => it.legs.filter(l => l.transit)
  .map(l => `${l.agency?.id}:${l.route?.id}:${l.trip?.id}`).join('|');

// Walking seconds beyond the comfortable length, summed over walking legs.
const longWalkLegSeconds = it => (it.legs || []).reduce((sum, l) => l.transit ? sum
  : sum + Math.max(0, num(l.durationSeconds) - RANKING.COMFORTABLE_WALK_LEG_SECONDS), 0);

/**
 * Generalized cost in seconds. `referenceMs` is the requested departure time, so waiting at home
 * before a later departure counts like travel time (it delays arrival), while waiting at a stop
 * between vehicles, walking and transfers cost more than riding.
 */
export function generalizedCost(it, referenceMs) {
  const reference = Number.isFinite(referenceMs) ? referenceMs : Date.parse(it.start);
  const walkSeconds = num(it.walkSeconds, walk(it) / 1.2);
  return (end(it) - reference) / 1000
    + RANKING.TRANSFER_PENALTY_SECONDS * transfers(it)
    + (RANKING.WALK_RELUCTANCE - 1) * walkSeconds
    + RANKING.LONG_WALK_LEG_RELUCTANCE * longWalkLegSeconds(it)
    + (RANKING.STOP_WAIT_RELUCTANCE - 1) * transferWait(it)
    + Math.max(0, longestWait(it) - RANKING.LONG_WAIT_SECONDS)
    + (it.detour ? RANKING.DETOUR_PENALTY_SECONDS : 0)
    + RANKING.BACKTRACK_SECONDS_PER_METER * Math.max(0, num(it.backtrackMeters) - 2000);
}

// A dominates B when it arrives no later, with no more transfers, walking or waiting of any kind,
// and is strictly better in at least one of those.
export function dominates(a, b) {
  const pairs = [[end(a), end(b)], [transfers(a), transfers(b)], [walk(a), walk(b)],
    [initialWait(a), initialWait(b)], [transferWait(a), transferWait(b)], [longestWait(a), longestWait(b)],
    [a.detour ? 1 : 0, b.detour ? 1 : 0]];
  return pairs.every(([x, y]) => x <= y) && pairs.some(([x, y]) => x < y);
}

export function paretoFilter(itineraries) {
  return itineraries.filter(b => !itineraries.some(a => a !== b && dominates(a, b)));
}

/**
 * Detour test on the stations each transit leg actually passes (board, intermediate, alight).
 * A journey is a detour when a later vehicle passes within `meters` of a station an earlier vehicle
 * already served, ignoring the immediate surroundings of the transfer point itself.
 * legVisits: one array per transit leg of {lat, lon} in travel order.
 */
export function revisitsEarlierStations(legVisits, meters = 250) {
  const d = (p, q) => Math.hypot((p.lat - q.lat) * 111200, (p.lon - q.lon) * 111200 * Math.cos(p.lat * Math.PI / 180));
  for (let j = 1; j < legVisits.length; j++) {
    const later = legVisits[j];
    if (!later.length) continue;
    const boardPoint = later[0];
    for (let i = 0; i < j; i++) {
      const earlier = legVisits[i];
      if (!earlier.length) continue;
      const alightPoint = earlier.at(-1);
      const transferZone = p => d(p, boardPoint) <= meters || d(p, alightPoint) <= meters;
      for (const p of later) {
        if (transferZone(p)) continue;
        if (earlier.some(q => !transferZone(q) && d(p, q) <= meters)) return true;
      }
    }
  }
  return false;
}

const vehicles = it => it.legs.filter(l => l.transit).map(l => `${l.agency?.id}:${l.route?.id}:${l.trip?.id}`);
/**
 * True when B rides every vehicle of A, in order, plus extra vehicles that neither get the rider
 * there meaningfully sooner nor save much walking: e.g. a one-stop bus hop to the BART station
 * instead of a 300 m walk. That is one more boarding to find without sight, not a real alternative.
 */
export function onlyAddsShortHop(a, b) {
  const va = vehicles(a), vb = vehicles(b);
  if (!va.length || vb.length <= va.length) return false;
  let start = -1;
  for (let i = 0; i + va.length <= vb.length && start < 0; i++)
    if (va.every((v, j) => vb[i + j] === v)) start = i;
  if (start < 0) return false;
  return end(b) >= end(a) - RANKING.HOP_MIN_TIME_SAVED_SECONDS * 1000
    && walk(a) - walk(b) <= RANKING.HOP_MAX_WALK_SAVED_METERS;
}

/**
 * Rank complete itineraries:
 *  1. keep the cheapest copy of each identical vehicle sequence;
 *  2. drop detours when any non-detour option exists;
 *  3. Pareto filter on arrival, transfers, walking, initial wait, transfer wait, longest wait;
 *     then drop options that only add a short extra vehicle to another option (onlyAddsShortHop);
 *  4. order by generalized cost and drop options far more expensive than the best one.
 */
export function rankItineraries(itineraries, limit = 3, options = {}) {
  if (!itineraries.length) return [];
  const reference = Number.isFinite(options.requestMs) ? options.requestMs
    : Math.min(...itineraries.map(it => Date.parse(it.start)).filter(Number.isFinite));
  const cost = new Map(itineraries.map(it => [it, generalizedCost(it, reference)]));
  const unique = new Map();
  for (const it of itineraries) {
    const key = signature(it), seen = unique.get(key);
    if (!seen || cost.get(it) < cost.get(seen) || (cost.get(it) === cost.get(seen) && end(it) < end(seen))) unique.set(key, it);
  }
  let pool = [...unique.values()];
  if (pool.some(it => !it.detour)) pool = pool.filter(it => !it.detour);
  pool = paretoFilter(pool);
  pool = pool.filter(b => !pool.some(a => a !== b && onlyAddsShortHop(a, b)));
  pool.sort((a, b) => cost.get(a) - cost.get(b) || end(a) - end(b) || transfers(a) - transfers(b));
  const best = cost.get(pool[0]);
  return pool.filter(it => cost.get(it) <= best + RANKING.REASONABLE_EXTRA_COST_SECONDS).slice(0, limit);
}
