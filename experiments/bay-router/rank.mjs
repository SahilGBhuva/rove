// Pareto-aware selection: preserve a useful fastest, fewest-transfer and least-walk option.
// All comparisons are on complete door-to-door itineraries, including access and egress.
export function rankItineraries(itineraries, limit = 3) {
  const end = it => Date.parse(it.end);
  const duration = it => Number(it.durationSeconds) || Infinity;
  const transfers = it => Number(it.transfers) || 0;
  const walk = it => Number(it.walkMeters) || 0;
  const signature = it => it.legs.filter(l => l.transit).map(l => `${l.agency?.id}:${l.route?.id}:${l.trip?.id}`).join('|');
  const fastest = (a,b) => end(a)-end(b) || duration(a)-duration(b) || transfers(a)-transfers(b) || walk(a)-walk(b);
  // Riders generally prefer a reliable, simple trip to saving two minutes
  // with multiple additional boardings. Use a generalized journey cost.
  const balancedCost = it => end(it) + transfers(it)*7*60000 + walk(it)*60000/250;
  const balanced = (a,b) => balancedCost(a)-balancedCost(b) || fastest(a,b);
  const fewest = (a,b) => transfers(a)-transfers(b) || end(a)-end(b) || walk(a)-walk(b);
  const leastWalk = (a,b) => walk(a)-walk(b) || end(a)-end(b) || transfers(a)-transfers(b);
  // Keep the most practical endpoint access for each distinct transit trip sequence.
  const unique = new Map();
  for (const it of itineraries) {
    const key = signature(it);
    if (!unique.has(key) || balanced(it, unique.get(key)) < 0) unique.set(key,it);
  }
  const pool = [...unique.values()];
  if (!pool.length) return [];
  // Do not recommend an extreme detour solely to save a few metres of walking.
  const earliest=Math.min(...pool.map(end));
  const minTransfers=Math.min(...pool.map(transfers));
  const reasonable=pool.filter(it=>end(it)<=earliest+40*60000 && transfers(it)<=minTransfers+(minTransfers===0?2:1));
  const options=reasonable.length?reasonable:pool;
  const selected = [];
  const add = it => { if (it && !selected.includes(it) && selected.length < limit) selected.push(it); };
  // Recommend a low-friction journey first; retain the absolute fastest
  // arrival and a genuine lower-transfer or lower-walk alternative.
  add(options.toSorted(balanced)[0]);
  if (limit > 1) add(pool.toSorted(fastest)[0]);
  if (limit > 2) add(options.toSorted(fewest)[0]);
  if (limit > 3) add(options.toSorted(leastWalk)[0]);
  for (const it of options.toSorted(balanced)) add(it);
  return selected;
}
