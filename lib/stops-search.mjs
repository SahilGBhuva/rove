/**
 * Server-side stop and station search over the published network dataset.
 * Platforms that share a parent station are returned once, as the station.
 */
const fold = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

export class StopSearch {
  constructor(network) {
    const groups = new Map();
    for (const agency of network.agencies || []) {
      for (const s of agency.stops || []) {
        const key = `${agency.id}|${s.parent || s.id}`;
        let g = groups.get(key);
        if (!g) {
          g = { agency: agency.id, agencyName: agency.name, id: s.parent || s.id, name: s.n, station: Boolean(s.parent) || s.k === 1, childIds: [], lats: [], lons: [] };
          groups.set(key, g);
        }
        if (s.k === 1) g.name = s.n;
        g.childIds.push(s.id);
        g.lats.push(s.p[1]);
        g.lons.push(s.p[0]);
      }
    }
    this.entries = [...groups.values()].map(g => ({
      agency: g.agency, agencyName: g.agencyName, id: g.id, name: g.name, station: g.station,
      stopIds: [...new Set(g.childIds)],
      lat: Number((g.lats.reduce((a, b) => a + b, 0) / g.lats.length).toFixed(6)),
      lon: Number((g.lons.reduce((a, b) => a + b, 0) / g.lons.length).toFixed(6)),
      folded: fold(g.name)
    }));
    this.byKey = new Map(this.entries.map(e => [`${e.agency}|${e.id}`, e]));
    for (const e of this.entries) for (const id of e.stopIds) if (!this.byKey.has(`${e.agency}|${id}`)) this.byKey.set(`${e.agency}|${id}`, e);
  }

  get(agency, id) {
    const e = this.byKey.get(`${agency}|${id}`);
    return e ? strip(e) : null;
  }

  search(query, { limit = 10, agencies = null } = {}) {
    const q = fold(query);
    if (q.length < 2) return [];
    const tokens = q.split(' ');
    const scored = [];
    for (const e of this.entries) {
      if (agencies && !agencies.includes(e.agency)) continue;
      if (!tokens.every(t => e.folded.includes(t))) continue;
      let score = 0;
      if (e.folded === q) score += 100;
      if (e.folded.startsWith(q)) score += 50;
      if (tokens.every(t => e.folded.split(' ').some(w => w.startsWith(t)))) score += 20;
      if (e.station) score += 15; // rail stations outrank individual bus poles with similar names
      score -= e.folded.length / 10;
      scored.push([score, e]);
    }
    scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
    return scored.slice(0, Math.max(1, Math.min(25, limit))).map(([, e]) => strip(e));
  }
}

function strip(e) {
  const { folded, ...rest } = e;
  return rest;
}
