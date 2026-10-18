#!/usr/bin/env python3
"""Build Rove's Bay Area place index (addresses, businesses, landmarks, streets,
cities and neighborhoods) from an OpenStreetMap extract.

Output: an SQLite database with an FTS5 table, read by lib/places.mjs.
Everything comes from the OSM file; nothing is invented. Places without a
usable location are skipped.

Usage:
  build_places.py INPUT.osm.pbf OUTPUT.sqlite [MIN_LON MIN_LAT MAX_LON MAX_LAT]

Requires pyosmium 4 (pip install osmium) and shapely 2 (pip install shapely).
"""
import json
import math
import os
import re
import sqlite3
import sys
import time
import unicodedata

import osmium
import osmium.geom
from shapely import wkb
from shapely.geometry import Point
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORDS = json.load(open(os.path.join(ROOT, 'config', 'place-normalization.json')))['words']
# Curated points for places whose OSM outline gives a misleading point; lib/places.mjs applies the same file.
ANCHORS = json.load(open(os.path.join(ROOT, 'config', 'place-anchors.json')))['anchors']

POI_KEYS = ('amenity', 'shop', 'tourism', 'leisure', 'office', 'healthcare', 'historic', 'craft', 'aeroway', 'building', 'man_made', 'natural', 'sport', 'club')
SKIP_POI_VALUES = {('amenity', 'parking_space'), ('amenity', 'bench'), ('amenity', 'waste_basket'), ('amenity', 'bicycle_parking'),
                   ('amenity', 'vending_machine'), ('amenity', 'post_box'), ('amenity', 'telephone'), ('amenity', 'recycling'),
                   ('man_made', 'pipeline'), ('man_made', 'survey_point'), ('natural', 'tree'), ('natural', 'coastline')}
PLACE_TYPES = {'city': 9, 'town': 8, 'village': 6, 'suburb': 6, 'quarter': 5, 'neighbourhood': 5, 'hamlet': 3, 'locality': 2}
STREET_HIGHWAYS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian', 'service', 'footway', 'path', 'cycleway', 'steps', 'track'}
LABEL = {
    ('amenity', 'cafe'): 'Cafe', ('amenity', 'restaurant'): 'Restaurant', ('amenity', 'fast_food'): 'Fast food', ('amenity', 'bar'): 'Bar',
    ('amenity', 'pub'): 'Pub', ('amenity', 'hospital'): 'Hospital', ('amenity', 'clinic'): 'Clinic', ('amenity', 'school'): 'School',
    ('amenity', 'university'): 'University', ('amenity', 'college'): 'College', ('amenity', 'library'): 'Library', ('amenity', 'bank'): 'Bank',
    ('amenity', 'pharmacy'): 'Pharmacy', ('amenity', 'place_of_worship'): 'Place of worship', ('amenity', 'theatre'): 'Theater',
    ('amenity', 'cinema'): 'Movie theater', ('amenity', 'townhall'): 'City hall', ('amenity', 'courthouse'): 'Courthouse',
    ('amenity', 'police'): 'Police', ('amenity', 'fire_station'): 'Fire station', ('amenity', 'post_office'): 'Post office',
    ('amenity', 'marketplace'): 'Market', ('amenity', 'ferry_terminal'): 'Ferry terminal', ('amenity', 'bus_station'): 'Bus station',
    ('tourism', 'museum'): 'Museum', ('tourism', 'attraction'): 'Attraction', ('tourism', 'hotel'): 'Hotel', ('tourism', 'viewpoint'): 'Viewpoint',
    ('tourism', 'zoo'): 'Zoo', ('tourism', 'gallery'): 'Gallery', ('leisure', 'park'): 'Park', ('leisure', 'stadium'): 'Stadium',
    ('leisure', 'sports_centre'): 'Sports center', ('leisure', 'golf_course'): 'Golf course', ('shop', 'supermarket'): 'Supermarket',
    ('shop', 'mall'): 'Shopping center', ('shop', 'department_store'): 'Department store', ('aeroway', 'aerodrome'): 'Airport',
    ('aeroway', 'terminal'): 'Airport terminal', ('office', 'it'): 'Technology company', ('office', 'company'): 'Company',
    ('natural', 'water'): 'Lake', ('natural', 'peak'): 'Peak', ('natural', 'beach'): 'Beach', ('building', 'yes'): 'Building', ('railway', 'station'): 'Station', ('public_transport', 'station'): 'Station',
}


def norm(text):
    s = unicodedata.normalize('NFKD', str(text or '')).encode('ascii', 'ignore').decode().lower()
    s = s.replace('&', ' and ').replace("'", '')
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return ' '.join(w for w in (WORDS.get(t, t) for t in s.split()) if w)


def category(tags):
    for k in ('railway', 'public_transport', 'amenity', 'tourism', 'leisure', 'shop', 'aeroway', 'healthcare', 'office', 'historic', 'natural', 'building'):
        v = tags.get(k)
        if v and (k, v) in LABEL:
            return LABEL[(k, v)]
    for k in ('amenity', 'shop', 'tourism', 'leisure', 'office', 'healthcare', 'historic', 'craft'):
        v = tags.get(k)
        if v and v not in ('yes',):
            return v.replace('_', ' ').capitalize()
    return 'Place'


def is_poi(tags):
    if 'name' not in tags:
        return False
    for k in POI_KEYS:
        v = tags.get(k)
        if v is None or (k, v) in SKIP_POI_VALUES:
            continue
        if k == 'building' and v in ('house', 'residential', 'garage', 'garages', 'shed', 'detached', 'roof', 'semidetached_house', 'terrace'):
            continue
        return True
    return tags.get('railway') in ('station', 'halt') or tags.get('public_transport') == 'station'


def main():
    if len(sys.argv) not in (3, 7):
        sys.exit(__doc__)
    src, out = sys.argv[1], sys.argv[2]
    bbox = tuple(map(float, sys.argv[3:7])) if len(sys.argv) == 7 else (-122.62, 36.95, -121.50, 38.12)
    min_lon, min_lat, max_lon, max_lat = bbox
    inside = lambda lon, lat: min_lon <= lon <= max_lon and min_lat <= lat <= max_lat
    t0 = time.time()

    # Pass 1: municipal boundaries (admin_level 8) for assigning a city to addresses without addr:city.
    wkbf = osmium.geom.WKBFactory()
    polys, names = [], []
    for area in osmium.FileProcessor(src).with_areas(osmium.filter.KeyFilter('boundary')).with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)):
        t = area.tags
        name = t.get('name', '')
        # Cities are admin_level 8; San Francisco is a consolidated city-county mapped at admin_level 6.
        city_county = t.get('admin_level') == '6' and (t.get('border_type') == 'city' or t.get('official_name', '').startswith('City and County of '))
        if t.get('boundary') == 'administrative' and (t.get('admin_level') == '8' or city_county) and name:
            try:
                g = wkb.loads(wkbf.create_multipolygon(area), hex=True)
            except Exception:
                continue
            minx, miny, maxx, maxy = g.bounds
            if maxx < min_lon or minx > max_lon or maxy < min_lat or miny > max_lat:
                continue
            polys.append(g)
            names.append(name)
    tree = STRtree(polys)
    print(f'{len(polys)} municipal boundaries in {time.time() - t0:.0f}s', flush=True)

    place_nodes = []  # (lon, lat, name, weight) for unincorporated fallback

    def city_for(lon, lat, tags):
        if tags is not None and tags.get('addr:city'):
            return tags['addr:city']
        p = Point(lon, lat)
        for i in tree.query(p):
            if polys[i].contains(p):
                return names[i]
        return None

    rows = []
    addr_seen = set()
    streets = {}

    def add(kind, name, address_line, city, lon, lat, rank, osm_ref, category_label=None, housenumber=None, street=None, alt=''):
        rows.append((kind, name, address_line, city, round(lat, 6), round(lon, 6), rank, osm_ref, category_label, housenumber, street, alt))

    def centroid(nodes):
        xs = [n.location.lon for n in nodes if n.location.valid()]
        ys = [n.location.lat for n in nodes if n.location.valid()]
        if not xs:
            return None
        return sum(xs) / len(xs), sum(ys) / len(ys)

    # Pass 2: addresses, points of interest, streets and named places.
    fp = osmium.FileProcessor(src).with_locations().with_filter(osmium.filter.EmptyTagFilter())
    for o in fp:
        if o.is_relation():
            continue
        t = o.tags
        if o.is_node():
            if not o.location.valid():
                continue
            lon, lat = o.location.lon, o.location.lat
            ref = f'n{o.id}'
        else:
            nodes = o.nodes
            c = centroid(nodes)
            if not c:
                continue
            lon, lat = c
            ref = f'w{o.id}'
        if not inside(lon, lat):
            continue

        if o.is_node() and t.get('place') in PLACE_TYPES and 'name' in t:
            place_nodes.append((lon, lat, t['name'], PLACE_TYPES[t['place']]))
            add('area', t['name'], t.get('place').replace('neighbourhood', 'neighborhood').capitalize(), None, lon, lat, PLACE_TYPES[t['place']], ref)
            continue

        hn, st = t.get('addr:housenumber'), t.get('addr:street')
        poi = is_poi(t)
        if hn and st:
            city = city_for(lon, lat, t)
            key = (hn.lower(), norm(st), (city or '').lower())
            if key not in addr_seen:
                addr_seen.add(key)
                post = t.get('addr:postcode', '')
                add('address', f'{hn} {st}', ', '.join(x for x in (city, f"CA {post}".strip() if post else 'CA') if x), city, lon, lat, 1, ref, None, hn, st)
        if poi:
            city = city_for(lon, lat, t)
            line = f'{hn} {st}' if hn and st else (t.get('addr:street') or '')
            weight = 2 + (3 if 'wikidata' in t or 'wikipedia' in t else 0) + (2 if t.get('tourism') == 'attraction' else 0)
            alt = ' '.join(t[k] for k in ('alt_name', 'short_name', 'official_name', 'iata', 'faa', 'old_name', 'brand') if k in t)
            add('poi', t['name'], ', '.join(x for x in (line, city) if x), city, lon, lat, weight, ref, category(t), alt=alt)
        elif not o.is_node() and t.get('highway') in STREET_HIGHWAYS and 'name' in t:
            # Representative point: the middle node of the way, which lies on the street itself.
            nodes = o.nodes
            mid = nodes[len(nodes) // 2]
            if not mid.location.valid():
                continue
            mlon, mlat = mid.location.lon, mid.location.lat
            city = city_for(mlon, mlat, None)
            key = (norm(t['name']), (city or '').lower())
            length = len(nodes)
            if key not in streets or streets[key][0] < length:
                streets[key] = (length, t['name'], city, mlon, mlat, ref)

    # Pass 3: named multipolygon relations (large parks, lakes, campuses, stadiums, landmark buildings).
    for area in osmium.FileProcessor(src).with_areas(osmium.filter.KeyFilter('name')).with_filter(osmium.filter.EntityFilter(osmium.osm.AREA)):
        if area.from_way():
            continue  # closed ways were handled in pass 2
        t = area.tags
        if not is_poi(t):
            continue
        try:
            g = wkb.loads(wkbf.create_multipolygon(area), hex=True)
        except Exception:
            continue
        p = g.representative_point()
        if not inside(p.x, p.y):
            continue
        city = city_for(p.x, p.y, t)
        weight = 3 + (3 if 'wikidata' in t or 'wikipedia' in t else 0) + (2 if t.get('tourism') == 'attraction' else 0)
        alt = ' '.join(t[k] for k in ('alt_name', 'short_name', 'official_name', 'iata', 'old_name') if k in t)
        add('poi', t['name'], city or '', city, p.x, p.y, weight, f'r{area.orig_id()}', category(t), alt=alt)

    for _, name, city, lon, lat, ref in streets.values():
        add('street', name, city or '', city, lon, lat, 1, ref)

    # Unincorporated places (no municipal boundary): label with the nearest named place within 5 km.
    def nearest_place(lon, lat):
        best, bd = None, 5.0
        for plon, plat, pname, w in place_nodes:
            if w < 6:
                continue
            d = math.hypot((plon - lon) * 88.0, (plat - lat) * 111.0)
            if d < bd:
                best, bd = pname, d
        return best
    fixed = []
    for r in rows:
        if r[0] in ('address', 'poi', 'street') and not r[3]:
            city = nearest_place(r[5], r[4])
            if city:
                kind, name, line, _, lat, lon, rank, ref, cat, hn, st, alt = r
                if kind == 'address':
                    line = ', '.join(x for x in (city, line) if x)
                elif kind == 'street':
                    line = city
                else:
                    line = ', '.join(x for x in (line, city) if x)
                r = (kind, name, line, city, lat, lon, rank, ref, cat, hn, st, alt)
        a = ANCHORS.get(r[7])
        if a:
            kind, name, line, city, lat, lon, rank, ref, cat, hn, st, alt = r
            r = (kind, name, a.get('address', line), a.get('city', city), a['lat'], a['lon'], rank, ref, cat, hn, st, alt)
        fixed.append(r)
    rows = fixed

    if os.path.exists(out):
        os.remove(out)
    db = sqlite3.connect(out)
    db.executescript('''
      PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE places (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, address TEXT, city TEXT,
        lat REAL NOT NULL, lon REAL NOT NULL, rank REAL NOT NULL, osm TEXT, category TEXT, housenumber TEXT, street TEXT, alt TEXT);
      CREATE VIRTUAL TABLE places_fts USING fts5(name, context, content='', tokenize='unicode61', prefix='1 2 3');
    ''')
    db.executemany('INSERT INTO places (kind,name,address,city,lat,lon,rank,osm,category,housenumber,street,alt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', rows)
    cur = db.execute('SELECT id, name, address, city, category, kind, alt FROM places')
    batch = []
    for pid, name, address, city, cat, kind, alt in cur.fetchall():
        batch.append((pid, norm(' '.join(x for x in (name, alt) if x)), norm(' '.join(x for x in (address, city if city and city not in (address or '') else '', cat) if x))))
    db.executemany('INSERT INTO places_fts(rowid, name, context) VALUES (?,?,?)', batch)
    db.execute("INSERT INTO places_fts(places_fts) VALUES('optimize')")
    counts = dict(db.execute('SELECT kind, COUNT(*) FROM places GROUP BY kind').fetchall())
    meta = {'source': os.path.basename(src), 'bbox': list(bbox), 'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'counts': counts, 'normalization': WORDS}
    db.execute("INSERT INTO meta VALUES ('build', ?)", (json.dumps(meta),))
    db.commit()
    db.execute('VACUUM')
    db.close()
    print(json.dumps(meta['counts']), f'{os.path.getsize(out) / 1e6:.0f} MB in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
