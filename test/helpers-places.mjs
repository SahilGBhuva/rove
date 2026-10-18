// Test-only: builds a small place index with the same schema as scripts/places/build_places.py.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizePlaceText } from '../lib/places.mjs';

const { DatabaseSync } = await import('node:sqlite');

export function fixtureDb(rows) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rove-places-')), 'p.sqlite');
  const db = new DatabaseSync(file);
  db.exec(`CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE places (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, address TEXT, city TEXT, lat REAL NOT NULL, lon REAL NOT NULL, rank REAL NOT NULL, osm TEXT, category TEXT, housenumber TEXT, street TEXT, alt TEXT);
    CREATE VIRTUAL TABLE places_fts USING fts5(name, context, content='', tokenize='unicode61', prefix='1 2 3');`);
  db.prepare("INSERT INTO meta VALUES ('build', ?)").run(JSON.stringify({ counts: { fixture: rows.length } }));
  const ins = db.prepare('INSERT INTO places (kind,name,address,city,lat,lon,rank,category,housenumber,street,alt) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const fts = db.prepare('INSERT INTO places_fts(rowid, name, context) VALUES (?,?,?)');
  for (const r of rows) {
    const info = ins.run(r.kind, r.name, r.address ?? null, r.city ?? null, r.lat, r.lon, r.rank ?? 1, r.category ?? null, r.housenumber ?? null, r.street ?? null, r.alt ?? null);
    fts.run(info.lastInsertRowid, normalizePlaceText([r.name, r.alt].filter(Boolean).join(' ')), normalizePlaceText([r.address, r.city, r.category].filter(Boolean).join(' ')));
  }
  db.close();
  return file;
}


export const ROWS = [
  { kind: 'address', name: '1355 Market Street', address: 'San Francisco, CA', city: 'San Francisco', lat: 37.77695, lon: -122.41664, housenumber: '1355', street: 'Market Street' },
  { kind: 'address', name: '135 Market Street', address: 'San Francisco, CA', city: 'San Francisco', lat: 37.79300, lon: -122.39600, housenumber: '135', street: 'Market Street' },
  { kind: 'street', name: 'Market Street', address: 'San Francisco', city: 'San Francisco', lat: 37.78, lon: -122.41 },
  { kind: 'poi', name: 'San Francisco International Airport', address: 'San Mateo County', city: null, lat: 37.6213, lon: -122.379, rank: 5, category: 'Airport', alt: 'SFO' },
  { kind: 'poi', name: 'Philz Coffee', address: 'Mission', city: 'San Francisco', lat: 37.7672, lon: -122.3888, rank: 2, category: 'Cafe' },
  { kind: 'poi', name: 'Philz Coffee', address: 'Palo Alto', city: 'Palo Alto', lat: 37.4420, lon: -122.1615, rank: 2, category: 'Cafe' },
  { kind: 'address', name: '1 Doctor Carlton B Goodlett Place', address: 'San Francisco, CA', city: 'San Francisco', lat: 37.7793, lon: -122.4193, housenumber: '1', street: 'Doctor Carlton B Goodlett Place' }
];
