// Experimental Connection Scan Algorithm for the Bay Area-only GTFS snapshot.
// Intentionally separate from Rove's working OTP production backend.
// Timetable input: {stops, trips, connections} built by build.py for ONE GTFS service date.
// Connections sorted by departure. Times are seconds since service-date midnight.
export function directFootpaths(stops, radiusMeters = 220, maxPerStop = 12) {
  const buckets = new Map(), footpaths = Array.from({ length: stops.length }, () => []);
  const cell = 0.003;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!s[2] || !s[3]) continue;
    const y = Math.floor(s[2] / cell), x = Math.floor(s[3] / cell);
    const k = y + '/' + x;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (!s[2] || !s[3]) continue;
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
export function findJourneys(data, fromStop, toStops, departSeconds, options = {}) {
  if (!Array.isArray(toStops) || !toStops.length || toStops.some(stop => !Number.isInteger(stop)))
    throw new Error('Invalid destinations');
  const targetStops = [...new Set(toStops)];
  const { stops, trips, connections } = data;
  if (!Number.isInteger(fromStop) ||
      fromStop < 0 || targetStops.some(stop => stop < 0 || stop >= stops.length) || fromStop >= stops.length ||
      !Number.isFinite(departSeconds)) throw new Error('Invalid origin, destination or time');
  const footpaths = options.footpaths || [];
  const maxSeconds = options.maxSeconds ?? 5 * 3600;
  const transferPenaltySeconds = Math.max(0, options.transferPenaltySeconds || 0);
  const score = label => label.time + Math.max(0, label.boardings - 1) * transferPenaltySeconds;
  const best = new Array(stops.length).fill(null);
  const boarded = new Array(trips.length).fill(null);
  const first = { time: departSeconds, boardings: 0, via: null };
  const targets = new Set(targetStops);
  let reachableTargets = 0;
  let earliestTargetArrival = Infinity;
  const markTarget = stop => {
    if (targets.has(stop)) {
      if (!best[stop]) reachableTargets++;
    }
  };
  const update = (stop, label) => {
    if (best[stop] && score(best[stop]) <= score(label)) return;
    markTarget(stop);
    best[stop] = label;
    if (targets.has(stop)) earliestTargetArrival = Math.min(earliestTargetArrival, score(label));
    // One-step walking transfers. Path shapes are intentionally not asserted.
    for (const [neighbor, seconds] of footpaths[stop] || []) {
      const arrival = label.time + seconds;
      if (arrival <= departSeconds + maxSeconds &&
          (!best[neighbor] || score({time:arrival,boardings:label.boardings}) < score(best[neighbor]))) {
        markTarget(neighbor);
        if (targets.has(neighbor)) earliestTargetArrival = Math.min(earliestTargetArrival, score({time:arrival,boardings:label.boardings}));
        best[neighbor] = { time: arrival, boardings: label.boardings,
          via: { kind: 'walk', fromStop: stop, toStop: neighbor, durationSeconds: seconds, previous: label } };
      }
    }
  };
  update(fromStop, first);
  const lastDeparture = departSeconds + maxSeconds;
  for (let ci = lowerBoundConnection(connections, departSeconds); ci < connections.length; ci++) {
    const [from, to, dep, arr, trip, flags] = connections[ci];
    if (dep > lastDeparture) break;
    // Once every requested destination has a label, no later departure can improve
    // any earliest arrival. Keep scanning if even one destination is unreachable.
    if (reachableTargets === targets.size &&
        dep >= Math.max(...targetStops.map(stop => score(best[stop])))) break;
    // Stop searching alternatives after a reasonable window from the first
    // reachable destination. Otherwise one inaccessible stop can force every
    // origin search to scan the entire eight-hour timetable.
    if (earliestTargetArrival < Infinity && dep >= earliestTargetArrival +
        (options.alternativeWindowSeconds ?? 45 * 60)) break;
    let state = boarded[trip];
    if (!state && (flags & 1) && best[from]) {
      const lbl = best[from];
      const transferBuffer = lbl.via?.kind === 'ride' ? (options.minimumTransferSeconds ?? 90) : 0;
      if (lbl.time + transferBuffer <= dep) {
        state = { previous: lbl, boardStop: from, boardSeconds: dep, boardings: lbl.boardings + 1 };
        boarded[trip] = state;
      }
    }
    if (!state || !(flags & 2) || arr > lastDeparture) continue;
    if (!best[to] || score({time:arr,boardings:state.boardings}) < score(best[to])) {
      update(to, { time: arr, boardings: state.boardings, via: { kind: 'ride', trip,
        boardStop: state.boardStop, toStop: to,
        departureSeconds: state.boardSeconds, arrivalSeconds: arr,
        previous: state.previous } });
    }
  }
  const answers = new Map();
  for (const destination of targetStops) {
    const result = best[destination];
    if (!result) { answers.set(destination, null); continue; }
    const legs = [];
    let label = result;
    for (let n = 0; label?.via && n < 100; n++) {
      const step = label.via;
      legs.push(step.kind === 'ride'
        ? { type: 'transit', agency: trips[step.trip][0],
            route: trips[step.trip][3], headsign: trips[step.trip][4],
            tripId: trips[step.trip][1], tripIndex: step.trip,
            from: stops[step.boardStop][0], to: stops[step.toStop][0],
            depart: step.departureSeconds, arrive: step.arrivalSeconds }
        : { type: 'approximate-walk', from: stops[step.fromStop][0],
            to: stops[step.toStop][0], seconds: step.durationSeconds });
      label = step.previous;
    }
    if (label?.via) throw new Error('Unexpected cyclic predecessor chain');
    legs.reverse();
    answers.set(destination, { date: data.date, departureSeconds: departSeconds,
      arrivalSeconds: result.time, durationSeconds: result.time - departSeconds,
      legs, experimental: true });
  }
  return answers;
}

// Compatibility for callers requesting one destination. Multi-destination searches
// share the same connection scan and are significantly faster for map searches.
export function findJourney(data, fromStop, toStop, departSeconds, options = {}) {
  return findJourneys(data, fromStop, [toStop], departSeconds, options).get(toStop) || null;
}
