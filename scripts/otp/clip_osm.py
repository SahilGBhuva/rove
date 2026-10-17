#!/usr/bin/env python3
"""Clip an OpenStreetMap PBF to the Rove service area for OpenTripPlanner.

Used only when the `osmium` command-line tool is not installed. Requires
pyosmium 4.x (`pip install osmium`).

Keeps, inside the bounding box:
  * ways tagged for walking/transit routing (highway, railway, public_transport,
    area:highway, platform-related amenity/parking) that touch the box, complete
    with all of their nodes (even the ones just outside), so streets are not cut
  * tagged nodes inside the box (entrances, elevators, crossings, barriers)
  * turn restrictions, and multipolygons/public_transport relations built from
    kept ways, complete with their members

Usage: clip_osm.py INPUT.osm.pbf OUTPUT.osm.pbf MIN_LON MIN_LAT MAX_LON MAX_LAT
"""
import sys
import osmium
import osmium.index

WAY_KEYS = ('highway', 'railway', 'public_transport', 'area:highway')
WAY_TAGS = {('amenity', 'parking'), ('amenity', 'bicycle_parking'), ('park_ride', 'yes')}
REL_TYPES = {'restriction', 'multipolygon', 'public_transport'}


def wanted_way(tags):
    return any(k in tags for k in WAY_KEYS) or any(tags.get(k) == v for k, v in WAY_TAGS)


def main():
    if len(sys.argv) != 7:
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    min_lon, min_lat, max_lon, max_lat = map(float, sys.argv[3:])

    def inside(loc):
        return loc.valid() and min_lon <= loc.lon <= max_lon and min_lat <= loc.lat <= max_lat

    kept_ways = osmium.index.IdSet()
    kept_nodes = osmium.index.IdSet()
    counts = {'nodes': 0, 'ways': 0, 'relations': 0}

    with osmium.BackReferenceWriter(dst, ref_src=src, overwrite=True) as writer:
        for obj in osmium.FileProcessor(src).with_locations():
            if obj.is_node():
                if len(obj.tags) and inside(obj.location):
                    writer.add_node(obj)
                    kept_nodes.set(obj.id)
                    counts['nodes'] += 1
            elif obj.is_way():
                if wanted_way(obj.tags) and any(inside(n.location) for n in obj.nodes):
                    writer.add_way(obj)
                    kept_ways.set(obj.id)
                    counts['ways'] += 1
            elif obj.is_relation():
                if obj.tags.get('type') not in REL_TYPES:
                    continue
                members = list(obj.members)
                if obj.tags.get('type') == 'multipolygon' and not wanted_way(obj.tags):
                    continue
                if any((m.type == 'w' and kept_ways.get(m.ref)) or (m.type == 'n' and kept_nodes.get(m.ref)) for m in members):
                    writer.add_relation(obj)
                    counts['relations'] += 1
    print(f"clip_osm: kept {counts['ways']} ways, {counts['nodes']} tagged nodes, {counts['relations']} relations")


if __name__ == '__main__':
    main()
