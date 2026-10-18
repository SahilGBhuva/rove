import fs from 'node:fs';
import path from 'node:path';

/**
 * Bay Area place search over the OpenStreetMap-derived index built by
 * scripts/places/build_places.py (addresses, businesses, landmarks, streets,
 * cities and neighborhoods). Read-only SQLite with FTS5, through node:sqlite.
 */
const WORDS = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../config/place-normalization.json'), 'utf8')).words;

/** Must stay identical to norm() in scripts/places/build_places.py. */
export function normalizePlaceText(text) {
  let s = String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7f]/g, '').toLowerCase();
  s = s.replaceAll('&', ' and ').replaceAll("'", '');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.split(' ').filter(Boolean).map(t => (Object.hasOwn(WORDS, t) ? WORDS[t] : t)).filter(Boolean).join(' ');
}

const KIND_WEIGHT = { poi: 3, area: 2.5, address: 2, street: 1.5 };

function distanceKm(a, b) {
  const x = (b.lon - a.lon) * 88.0, y = (b.lat - a.lat) * 111.0;
  return Math.hypot(x, y);
}

export class PlaceIndex {
  /** @param {string} file path to the SQLite index */
  static async open(file) {
    if (!fs.existsSync(file)) return { index: null, reason: `place index not found at ${path.relative(process.cwd(), file)} (run npm run places:build)` };
    let DatabaseSync;
    try {
      const prev = process.emitWarning;
      process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : prev.call(process, w, ...rest));
      ({ DatabaseSync } = await import('node:sqlite'));
      process.emitWarning = prev;
    } catch {
      return { index: null, reason: 'this Node.js version has no node:sqlite (Node 22.5 or newer is required)' };
    }
    const db = new DatabaseSync(file, { readOnly: true });
    return { index: new PlaceIndex(db), reason: null };
  }

  constructor(db) {
    this.db = db;
    this.meta = JSON.parse(db.prepare("SELECT value FROM meta WHERE key = 'build'").get()?.value || '{}');
    this.searchStmt = db.prepare(`
      SELECT p.id, p.kind, p.name, p.address, p.city, p.lat, p.lon, p.rank, p.category, p.housenumber, p.street, p.alt, bm25(places_fts, 4.0, 1.0) AS score
      FROM places_fts JOIN places p ON p.id = places_fts.rowid
      WHERE places_fts MATCH ? ORDER BY score LIMIT ?`);
    this.nearStmt = db.prepare(`
      SELECT id, kind, name, address, city, lat, lon, category, housenumber, street FROM places
      WHERE kind IN ('address', 'poi') AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? LIMIT 400`);
  }

  /**
   * Search places. Every token must match (prefix match on the last one, and on
   * all tokens of three or more letters), ranked by text relevance, place type,
   * exact house number and, when `near` is given, distance.
   */
  search(query, { limit = 8, near = null } = {}) {
    const q = normalizePlaceText(query);
    if (q.length < 2) return [];
    const tokens = q.split(' ').slice(0, 8);
    const results = this.#rank(tokens, near, limit);
    if (results.length) return results;
    // "1 Dr Carlton B Goodlett Pl": the street is mapped but that house number is not. Fall back to the
    // street itself and say so, rather than returning nothing or pretending the address was found.
    const number = tokens.find(t => /^\d+[a-z]?$/.test(t));
    if (number && tokens.length > 1) {
      const rest = tokens.filter(t => t !== number);
      return this.#rank(rest, near, limit).filter(r => r.kind === 'street')
        .map(r => ({ ...r, approximate: true, note: `House number ${number} is not in the map data; showing the street.` }));
    }
    return [];
  }

  #rank(tokens, near, limit) {
    const match = tokens.map((t, i) => (i === tokens.length - 1 || t.length >= 3) && !/^\d+$/.test(t) ? `"${t}"*` : `"${t}"`).join(' ');
    let rows;
    try { rows = this.searchStmt.all(match, 200); } catch { return []; }
    const q = tokens.join(' ');
    const number = tokens.find(t => /^\d+[a-z]?$/.test(t));
    const scored = rows.map(r => {
      let s = -r.score + (KIND_WEIGHT[r.kind] || 1) + r.rank * 0.6;
      const n = normalizePlaceText(r.name);
      const alts = r.alt ? r.alt.split(/[;]|\s{2,}/).map(normalizePlaceText) : [];
      const altTokens = new Set(normalizePlaceText(r.alt || '').split(' '));
      if (n === q || alts.includes(q) || (tokens.length === 1 && altTokens.has(q))) s += 6;
      else if (n.startsWith(q)) s += 1.5;
      if (n !== q && ` ${n} `.includes(` ${q} `)) s += 1.5;
      if (number && r.kind === 'address') s += r.housenumber?.toLowerCase() === number ? 6 : -4;
      if (near) s -= Math.min(6, distanceKm(near, r) / 5);
      return { s, r };
    });
    scored.sort((a, b) => b.s - a.s);
    const seen = new Set();
    const out = [];
    for (const { r } of scored) {
      // Same name at (about) the same spot is one place; same-name branches elsewhere stay separate.
      const key = `${r.kind}|${normalizePlaceText(r.name)}|${r.lat.toFixed(3)}|${r.lon.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(PlaceIndex.toResult(r));
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Nearest address or named place to a point (for "current location" and map taps). */
  reverse(lat, lon) {
    const d = 0.0025; // about 250 m
    const rows = this.nearStmt.all(lat - d, lat + d, lon - d * 1.3, lon + d * 1.3);
    let best = null, bestD = Infinity;
    for (const r of rows) {
      const dist = distanceKm({ lat, lon }, r) * (r.kind === 'address' ? 1 : 1.5);
      if (dist < bestD) { best = r; bestD = dist; }
    }
    return best ? { ...PlaceIndex.toResult(best), distanceMeters: Math.round(distanceKm({ lat, lon }, best) * 1000) } : null;
  }

  static toResult(r) {
    return {
      kind: r.kind, id: `osm:${r.id}`, name: r.name, address: r.address || null, city: r.city || null,
      category: r.category || null, lat: r.lat, lon: r.lon, source: 'openstreetmap'
    };
  }
}
