// Pareto-aware selection: preserve a useful fastest, fewest-transfer and least-walk option.
// All comparisons are on complete door-to-door itineraries, including access and egress.
export function rankItineraries(itineraries, limit = 3) {
  const end = it => Date.parse(it.end);
  const duration = it => Number(it.durationSeconds) || Infinity;
  const transfers = it => Number(it.transfers) || 0;
  const walk = it => Number(it.walkMeters) || 0;
  const signature = it => it.legs.filter(l => l.transit).map(l => `${l.agency?.id}:${l.route?.id}:${l.trip?.id}`).join('|');
  const fastest = (a,b) => end(a)-end(b) || duration(a)-duration(b) || transfers(a)-transfers(b) || walk(a)-walk(b);
  const fewest = (a,b) => transfers(a)-transfers(b) || end(a)-end(b) || walk(a)-walk(b);
  const leastWalk = (a,b) => walk(a)-walk(b) || end(a)-end(b) || transfers(a)-transfers(b);
  // Keep the best endpoint access for each distinct transit trip sequence.
  const unique = new Map();
  for (const it of itineraries) {
    const key = signature(it);
    if (!unique.has(key) || fastest(it, unique.get(key)) < 0) unique.set(key,it);
  }
  const pool = [...unique.values()];
  if (!pool.length) return [];
  // Do not recommend an extreme detour solely to save a few metres of walking.
  const earliest=Math.min(...pool.map(end));
  const minTransfers=Math.min(...pool.map(transfers));
  const reasonable=pool.filter(it=>end(it)<=earliest+40*60000 && transfers(it)<=minTransfers+2);
  const options=reasonable.length?reasonable:pool;
  const selected = [];
  const add = it => { if (it && !selected.includes(it) && selected.length < limit) selected.push(it); };
  // Always expose the earliest arrival. Then genuinely different tradeoffs.
  add(pool.toSorted(fastest)[0]);
  if (limit > 1) add(options.toSorted(fewest)[0]);
  if (limit > 2) add(options.toSorted(leastWalk)[0]);
  for (const it of options.toSorted(fastest)) add(it);
  return selected;
}
