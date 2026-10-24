// Experimental Connection Scan Algorithm for the Bay Area-only GTFS snapshot.
// Intentionally separate from Rove's working OTP production backend.
// Timetable input: {stops, trips, connections} built by build.py for ONE GTFS service date.
// Connections sorted by departure. Times are seconds since service-date midnight.
// `served` (optional Uint8Array): only stops with service get footpaths, so GTFS entrances,
// elevators and parent stations cannot take the maxPerStop slots of real platforms.
export function directFootpaths(stops, radiusMeters = 220, maxPerStop = 12, served = null) {
  const buckets = new Map(), footpaths = Array.from({ length: stops.length }, () => []);
  const cell = Math.max(0.003, radiusMeters / 111_200 * 1.3);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!s[2] || !s[3] || (served && !served[i])) continue;
    const y = Math.floor(s[2] / cell), x = Math.floor(s[3] / cell);
    const k = y + '/' + x;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!s[2] || !s[3] || (served && !served[i])) continue;
    const y = Math.floor(s[2] / cell), x = Math.floor(s[3] / cell);
    const candidates = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of buckets.get((y + dy) + '/' + (x + dx)) || []) {
          if (i === j) continue;
          const t = stops[j];
          const northMeters = (s[2] - t[2]) * 111_200;
          const eastMeters = (s[3] - t[3]) * 111_200 * Math.cos(s[2] * Math.PI / 180);
          const dist = Math.hypot(northMeters, eastMeters);
          if (dist <= radiusMeters) candidates.push([j, dist]);
        }
      }
    }
    candidates.sort((a, b) => a[1] - b[1]);
    footpaths[i] = candidates.slice(0, maxPerStop).map(([j, distance]) =>
      [j, Math.ceil(distance / 1.2 + 45)]);
  }
  return footpaths;
}

// Struct-of-arrays copy of the connection list, built once per (immutable) timetable. Scanning
// typed arrays is several times more cache-friendly than 1.5 M small JS arrays.
const packCache = new WeakMap();
export function packedConnections(connections) {
  let p = packCache.get(connections);
  if (p) return p;
  const n = connections.length;
  p = { from: new Int32Array(n), to: new Int32Array(n), dep: new Float64Array(n), arr: new Float64Array(n),
    trip: new Int32Array(n), flags: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const c = connections[i];
    p.from[i] = c[0]; p.to[i] = c[1]; p.dep[i] = c[2]; p.arr[i] = c[3]; p.trip[i] = c[4]; p.flags[i] = c[5];
  }
  packCache.set(connections, p);
  return p;
}
function lowerBoundPacked(dep, time) {
  let low = 0, high = dep.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (dep[mid] < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

function lowerBoundConnection(connections, time) {
  let low = 0, high = connections.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (connections[mid][2] < time) low = mid + 1;
    else high = mid;
  }
  return low;
}

// This is a stop-to-stop prototype. Nearby walks are *straight-line estimates*,
// not checked against roads, pedestrian access, grades or waterways. Never show them
// to riders as turn-by-turn paths. No live delays or driving-to-transit here.
export function findJourney(data, fromStop, toStop, departSeconds, options = {}) {
  const { stops, trips, connections } = data;
  if (!Number.isInteger(fromStop) || !Number.isInteger(toStop) ||
      fromStop < 0 || toStop < 0 || fromStop >= stops.length || toStop >= stops.length ||
      !Number.isFinite(departSeconds)) throw new Error('Invalid origin, destination or time');
  const footpaths = options.footpaths || [];
  const maxSeconds = options.maxSeconds ?? 5 * 3600;
  const best = new Array(stops.length).fill(null);
  const boarded = new Array(trips.length).fill(null);
  const first = { time: departSeconds, via: null };
  const update = (stop, label) => {
    if (best[stop] && best[stop].time <= label.time) return;
    best[stop] = label;
    // One-step walking transfers. Path shapes are intentionally not asserted.
    for (const [neighbor, seconds] of footpaths[stop] || []) {
      const arrival = label.time + seconds;
      if (arrival <= departSeconds + maxSeconds &&
          (!best[neighbor] || arrival < best[neighbor].time)) {
        best[neighbor] = { time: arrival,
          via: { kind: 'walk', fromStop: stop, toStop: neighbor, durationSeconds: seconds, previous: label } };
      }
    }
  };
  update(fromStop, first);
  const lastDeparture = departSeconds + maxSeconds;
  for (let ci = lowerBoundConnection(connections, departSeconds); ci < connections.length; ci++) {
    const [from, to, dep, arr, trip, flags] = connections[ci];
    if (dep > lastDeparture) break;
    if (best[toStop] && dep >= best[toStop].time) break;
    let state = boarded[trip];
    if (!state && (flags & 1) && best[from]) {
      const lbl = best[from];
      const transferBuffer = lbl.via?.kind === 'ride' ? 45 : 0;
      if (lbl.time + transferBuffer <= dep) {
        state = { previous: lbl, boardStop: from, boardSeconds: dep };
        boarded[trip] = state;
      }
    }
    if (!state || !(flags & 2) || arr > lastDeparture) continue;
    if (!best[to] || arr < best[to].time) {
      update(to, { time: arr, via: { kind: 'ride', trip,
        boardStop: state.boardStop, toStop: to,
        departureSeconds: state.boardSeconds, arrivalSeconds: arr,
        previous: state.previous } });
    }
  }
  const result = best[toStop];
  if (!result) return null;
  const legs = [];
  let label = result;
  for (let n = 0; label?.via && n < 100; n++) {
    const step = label.via;
    legs.push(step.kind === 'ride'
      ? { type: 'transit', agency: trips[step.trip][0],
          route: trips[step.trip][3], headsign: trips[step.trip][4],
          tripId: trips[step.trip][1],
          from: stops[step.boardStop][0], to: stops[step.toStop][0],
          depart: step.departureSeconds, arrive: step.arrivalSeconds }
      : { type: 'approximate-walk', from: stops[step.fromStop][0],
          to: stops[step.toStop][0], seconds: step.durationSeconds });
    label = step.previous;
  }
  if (label?.via) throw new Error('Unexpected cyclic predecessor chain');
  legs.reverse();
  return { date: data.date, departureSeconds: departSeconds,
    arrivalSeconds: result.time, durationSeconds: result.time - departSeconds,
    legs, experimental: true };
}

// ---------------------------------------------------------------------------------------------
// Multicriteria journey search used by /api/v2/plan (api/v2/experimental-plan.mjs).
//
// Why not findJourney above: it is a plain earliest-arrival Connection Scan with ONE label per
// stop. It boards each trip at the FIRST stop where the trip becomes reachable and never revisits
// that choice, and it ignores transfers and waiting. Overnight this produced the P0
// "Sunnyvale -> Tamien (south) -> wait 3 h -> back north" journey: riding south to Tamien made the
// 4:37 AM northbound trip reachable at Tamien, which comes earlier in that trip than Sunnyvale,
// so the trip was boarded there. Arriving at 5:55 AM either way, earliest-arrival alone could not
// tell the detour from simply boarding the same train at Sunnyvale at 4:58 AM.
//
// The search below fixes that structurally:
//  1. forwardRounds: transfer-bounded (round-based) CSA from ALL origin stops at once. Round r
//     only allows journeys with <= r vehicles, so it yields the Pareto front of
//     (door arrival time, number of vehicles) instead of a single earliest-arrival label.
//  2. latestDeparture: for each Pareto point, a reverse CSA with the same vehicle bound finds the
//     journey that leaves the door as LATE as possible while still arriving by that time. That
//     removes pointless early departures, detours and waits that do not improve the arrival.
// Transfer feasibility is identical in both directions:
//  - the first vehicle departs >= request + walk-to-stop + BOARDING_MARGIN_SECONDS;
//  - every transfer needs >= MIN_TRANSFER_SECONDS after alighting, plus the walking time when the
//    next stop is a different stop (footpaths already include a 45 s fixed overhead).
export const WALK_METERS_PER_SECOND = 1.2;
// Streets are not straight lines. Access and egress walks are timed on an estimated path of
// 1.25 x the straight-line distance (a common urban circuity figure), so a 1.4 km straight-line
// walk costs about 24 minutes instead of an optimistic 19. Footpaths between stops (<= 260 m)
// keep their 45 s fixed overhead instead.
export const WALK_CIRCUITY = 1.25;
export const walkSecondsForMeters = meters => Math.ceil(meters * WALK_CIRCUITY / WALK_METERS_PER_SECOND);
export const BOARDING_MARGIN_SECONDS = 60;
export const MIN_TRANSFER_SECONDS = 120;
const NONE = 0, ORIGIN = 1, RIDE = 2, WALK = 3, INHERIT = 4, TARGET = 5, BOARD = 6;

function newLabels(n, fill) {
  return { time: new Float64Array(n).fill(fill), kind: new Uint8Array(n), rides: new Uint8Array(n),
    a: new Int32Array(n).fill(-1), b: new Int32Array(n).fill(-1), t: new Float64Array(n), w: new Float64Array(n) };
}
function inherit(prev) {
  const n = prev.time.length, cur = newLabels(n, 0);
  cur.time.set(prev.time); cur.rides.set(prev.rides);
  for (let i = 0; i < n; i++) if (prev.kind[i] !== NONE) cur.kind[i] = INHERIT;
  return cur;
}
// Incoming footpaths for the reverse search (directFootpaths lists are outgoing, not symmetric).
export function reverseFootpaths(footpaths) {
  const incoming = Array.from({ length: footpaths.length }, () => []);
  for (let from = 0; from < footpaths.length; from++)
    for (const [to, seconds] of footpaths[from] || []) incoming[to].push([from, seconds]);
  return incoming;
}

/**
 * Transfer-bounded forward scan.
 * seeds:   [{index, accessSeconds}]  stops the rider can walk to from the door
 * targets: [{index, egressSeconds}]  stops from which the rider can walk to the destination
 * Returns the Pareto front [{rides, doorArrival}], each entry strictly earlier than the last.
 */
export function forwardRounds(data, seeds, targets, departSeconds, options = {}) {
  const { stops, trips, connections } = data;
  const n = stops.length, footpaths = options.footpaths || [];
  const maxRides = options.maxRides ?? 4, limit = departSeconds + (options.maxSeconds ?? 8 * 3600);
  const egress = new Float64Array(n).fill(Infinity);
  for (const t of targets) egress[t.index] = Math.min(egress[t.index], t.egressSeconds);
  let prev = newLabels(n, Infinity);
  for (const s of seeds) {
    const time = departSeconds + s.accessSeconds;
    if (time < prev.time[s.index]) { prev.time[s.index] = time; prev.kind[s.index] = ORIGIN; }
  }
  const front = [];
  let bestDoor = Infinity;
  const C = packedConnections(connections), cFrom = C.from, cTo = C.to, cDep = C.dep, cArr = C.arr, cTrip = C.trip, cFlags = C.flags;
  const N = cDep.length, first = lowerBoundPacked(cDep, departSeconds);
  const boardStop = new Int32Array(trips.length), boardDep = new Float64Array(trips.length);
  for (let r = 1; r <= maxRides; r++) {
    const cur = inherit(prev);
    boardStop.fill(-1);
    let roundBest = bestDoor, improved = false;
    const prevTime = prev.time, prevRides = prev.rides, curTime = cur.time;
    for (let ci = first; ci < N; ci++) {
      const dep = cDep[ci];
      if (dep > limit || dep >= roundBest) break;
      const trip = cTrip[ci], flags = cFlags[ci];
      if (boardStop[trip] < 0) {
        if (!(flags & 1)) continue;
        const from = cFrom[ci], ready = prevTime[from];
        if (ready === Infinity) continue;
        const buffer = prevRides[from] === 0 ? BOARDING_MARGIN_SECONDS : MIN_TRANSFER_SECONDS;
        if (ready + buffer > dep) continue;
        boardStop[trip] = from; boardDep[trip] = dep;
      }
      if (!(flags & 2)) continue;
      const to = cTo[ci], arr = cArr[ci];
      if (arr > limit || arr >= curTime[to]) continue;
      curTime[to] = arr; cur.kind[to] = RIDE; cur.rides[to] = r;
      cur.a[to] = trip; cur.b[to] = boardStop[trip]; cur.t[to] = boardDep[trip];
      improved = true;
      if (arr + egress[to] < roundBest) roundBest = arr + egress[to];
      const fp = footpaths[to];
      if (fp) for (let k = 0; k < fp.length; k++) {
        const nb = fp[k][0], seconds = fp[k][1], walkArr = arr + seconds;
        if (walkArr <= limit && walkArr < curTime[nb]) {
          curTime[nb] = walkArr; cur.kind[nb] = WALK; cur.rides[nb] = r; cur.a[nb] = to; cur.w[nb] = seconds;
          if (walkArr + egress[nb] < roundBest) roundBest = walkArr + egress[nb];
        }
      }
    }
    if (roundBest < bestDoor) { bestDoor = roundBest; front.push({ rides: r, doorArrival: roundBest }); }
    if (!improved) break;
    prev = cur;
  }
  return front;
}

/**
 * Reverse, vehicle-bounded scan: the latest door departure (>= earliestDoorDeparture) that still
 * reaches the destination door by `deadline` using <= maxRides vehicles. Among equally late
 * departures the one with the fewest vehicles wins. Returns the journey or null.
 */
export function latestDeparture(data, seeds, targets, deadline, earliestDoorDeparture, options = {}) {
  const { stops, trips, connections } = data;
  const n = stops.length, incoming = options.incomingFootpaths || [];
  const maxRides = options.maxRides ?? 4;
  if (!seeds.length || !targets.length) return null;
  const minAccess = Math.min(...seeds.map(s => s.accessSeconds));
  // L.time[s]: latest time the rider can be standing at s (after alighting) and still make it.
  let prev = newLabels(n, -Infinity);
  for (const t of targets) {
    const time = deadline - t.egressSeconds;
    if (time > prev.time[t.index]) { prev.time[t.index] = time; prev.kind[t.index] = TARGET; prev.w[t.index] = t.egressSeconds; }
  }
  for (const t of targets) for (const [nb, seconds] of incoming[t.index] || []) {
    const time = prev.time[t.index] - seconds;
    if (time > prev.time[nb]) { prev.time[nb] = time; prev.kind[nb] = WALK; prev.a[nb] = t.index; prev.w[nb] = seconds; }
  }
  // B.time[s]: latest vehicle departure the rider can board at s (origins use this directly).
  let prevBoard = newLabels(n, -Infinity);
  let best = null;
  const tripAlight = new Int32Array(trips.length), tripAlightArr = new Float64Array(trips.length);
  const C = packedConnections(connections), cFrom = C.from, cTo = C.to, cDep = C.dep, cArr = C.arr, cTrip = C.trip, cFlags = C.flags;
  const hi = lowerBoundPacked(cDep, deadline + 1) - 1;
  const roundsL = [prev], roundsB = [prevBoard];
  for (let k = 1; k <= maxRides; k++) {
    const cur = inherit(prev), board = inherit(prevBoard);
    tripAlight.fill(-1);
    // No useful first boarding can happen before this (later rounds only need strictly later).
    const floor = Math.max(earliestDoorDeparture, best ? best.doorDeparture + 1 : -Infinity) + BOARDING_MARGIN_SECONDS + minAccess;
    let changed = false;
    const prevTime = prev.time;
    for (let ci = hi; ci >= 0; ci--) {
      const dep = cDep[ci];
      if (dep < floor) break;
      const trip = cTrip[ci], flags = cFlags[ci];
      // Alight as early along the trip as still works (connections are visited latest first).
      if ((flags & 2) && cArr[ci] <= prevTime[cTo[ci]]) { tripAlight[trip] = cTo[ci]; tripAlightArr[trip] = cArr[ci]; }
      if (tripAlight[trip] < 0 || !(flags & 1)) continue;
      const s = cFrom[ci];
      if (dep > board.time[s]) {
        board.time[s] = dep; board.kind[s] = BOARD; board.a[s] = trip; board.b[s] = tripAlight[trip]; board.t[s] = tripAlightArr[trip];
        changed = true;
      }
      const ready = dep - MIN_TRANSFER_SECONDS;
      if (ready > cur.time[s]) {
        cur.time[s] = ready; cur.kind[s] = BOARD;
        for (const [nb, seconds] of incoming[s] || []) {
          if (ready - seconds > cur.time[nb]) { cur.time[nb] = ready - seconds; cur.kind[nb] = WALK; cur.a[nb] = s; cur.w[nb] = seconds; }
        }
      }
    }
    roundsL.push(cur); roundsB.push(board);
    for (const seed of seeds) {
      const doorDeparture = board.time[seed.index] - BOARDING_MARGIN_SECONDS - seed.accessSeconds;
      if (doorDeparture >= earliestDoorDeparture && (!best || doorDeparture > best.doorDeparture))
        best = { doorDeparture, seed, k };
    }
    if (!changed) break;
    prev = cur; prevBoard = board;
  }
  if (!best) return null;
  // Rebuild the journey forward from the chosen origin stop.
  const legs = [];
  let stop = best.seed.index, k = best.k, target = -1, egressSeconds = 0;
  outer: for (let guard = 0; guard < 64; guard++) {
    while (k > 0 && roundsB[k].kind[stop] === INHERIT) k--;
    const B = roundsB[k];
    if (k <= 0 || B.kind[stop] !== BOARD) return null;
    const trip = B.a[stop], alight = B.b[stop];
    legs.push({ type: 'transit', tripIndex: trip, agency: trips[trip][0], route: trips[trip][3],
      headsign: trips[trip][4], tripId: trips[trip][1], fromIndex: stop, toIndex: alight,
      from: stops[stop][0], to: stops[alight][0], depart: B.time[stop], arrive: B.t[stop] });
    stop = alight; k--;
    for (let inner = 0; inner < 16; inner++) {
      while (k > 0 && roundsL[k].kind[stop] === INHERIT) k--;
      const L = roundsL[k], kind = L.kind[stop];
      if (kind === TARGET) { target = stop; egressSeconds = L.w[stop]; break outer; }
      if (kind === WALK) {
        legs.push({ type: 'approximate-walk', fromIndex: stop, toIndex: L.a[stop],
          from: stops[stop][0], to: stops[L.a[stop]][0], seconds: L.w[stop] });
        stop = L.a[stop];
        continue;
      }
      if (kind === BOARD) continue outer;
      return null;
    }
    return null;
  }
  if (target < 0) return null;
  let arrivalAtTarget = -Infinity, clock = -Infinity;
  for (const leg of legs) {
    if (leg.type === 'transit') clock = leg.arrive;
    else clock += leg.seconds;
    arrivalAtTarget = clock;
  }
  return { doorDeparture: best.doorDeparture, originIndex: best.seed.index,
    accessSeconds: best.seed.accessSeconds, targetIndex: target, egressSeconds,
    doorArrival: arrivalAtTarget + egressSeconds, legs,
    vehicles: legs.filter(l => l.type === 'transit').length };
}

/**
 * Which stops have service, and which route patterns (agency + route + headsign) board or alight
 * there. Used to pick access/egress stops (api/v2/experimental-plan.mjs accessCandidates) and to
 * keep unserved GTFS nodes (entrances, elevators, parent stations) out of footpaths.
 */
export function buildStopPatterns(data) {
  const { stops, trips, connections } = data;
  const n = stops.length;
  const patternOfTrip = new Int32Array(trips.length), ids = new Map();
  for (let t = 0; t < trips.length; t++) {
    const key = trips[t][0] + '\u0000' + trips[t][2] + '\u0000' + trips[t][4];
    let id = ids.get(key);
    if (id === undefined) { id = ids.size; ids.set(key, id); }
    patternOfTrip[t] = id;
  }
  const boards = new Uint8Array(n), alights = new Uint8Array(n), served = new Uint8Array(n), rail = new Uint8Array(n);
  const P = ids.size;
  const boardPatterns = Array.from({ length: n }, () => []), alightPatterns = Array.from({ length: n }, () => []);
  // GTFS route_type 0 light rail/streetcar, 1 subway (BART), 2 rail (Caltrain).
  const railTrip = trips.map(t => ['0', '1', '2'].includes(String(t[5])));
  // Visit trips grouped by pattern, so "already recorded for this pattern" is one array compare.
  const C = packedConnections(connections), index = buildTripIndex(data);
  const order = Array.from({ length: trips.length }, (_, t) => t).sort((a, b) => patternOfTrip[a] - patternOfTrip[b]);
  const markBoard = new Int32Array(n), markAlight = new Int32Array(n);
  for (const t of order) {
    const p = patternOfTrip[t], tag = p + 1;
    for (let q = index.offsets[t]; q < index.offsets[t + 1]; q++) {
      const ci = index.order[q], from = C.from[ci], to = C.to[ci], flags = C.flags[ci];
      if (railTrip[t]) { rail[from] = 1; rail[to] = 1; }
      if ((flags & 1) && markBoard[from] !== tag) { markBoard[from] = tag; boards[from] = 1; boardPatterns[from].push(p); }
      if ((flags & 2) && markAlight[to] !== tag) { markAlight[to] = tag; alights[to] = 1; alightPatterns[to].push(p); }
    }
  }
  for (let i = 0; i < n; i++) served[i] = (boards[i] || alights[i]) && stops[i][2] && stops[i][3] ? 1 : 0;
  return { boards, alights, served, rail, boardPatterns, alightPatterns, patternOfTrip, patternCount: P };
}

// Per-trip connection index, so a ride's intermediate stops can be listed cheaply.
export function buildTripIndex(data) {
  const { trips, connections } = data;
  const offsets = new Int32Array(trips.length + 1);
  for (const c of connections) offsets[c[4] + 1]++;
  for (let i = 1; i <= trips.length; i++) offsets[i] += offsets[i - 1];
  const order = new Int32Array(connections.length), fill = offsets.slice(0, trips.length);
  for (let i = 0; i < connections.length; i++) order[fill[connections[i][4]]++] = i;
  return { offsets, order };
}
// Stop indexes one trip visits from boarding to alighting, inclusive.
export function tripStops(data, index, tripIndex, fromIndex, depart, toIndex, arrive) {
  const out = [];
  let on = false;
  for (let p = index.offsets[tripIndex]; p < index.offsets[tripIndex + 1]; p++) {
    const c = data.connections[index.order[p]];
    if (!on && c[0] === fromIndex && c[2] === depart) { on = true; out.push(c[0]); }
    if (on) { out.push(c[1]); if (c[1] === toIndex && c[3] === arrive) break; }
  }
  return out;
}
