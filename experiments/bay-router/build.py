#!/usr/bin/env python3
"""Experimental GTFS -> one-day, Bay Area-only connection scan timetable.

No network, API key, npm packages, or Java required. Prototype, NOT production.
Usage: python3 experiments/bay-router/build.py 2026-10-20
"""
import csv
import datetime as dt
import gzip
import json
import os
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
FEEDS = ("bart", "muni", "caltrain", "vta", "act")
OUT = Path(__file__).resolve().parent / "out"

def rows(archive, filename):
    matches = [n for n in archive.namelist() if n.rsplit("/", 1)[-1].lower() == filename]
    if not matches:
        return iter(())
    with archive.open(matches[0]) as stream:
        import io
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))

def sec(value):
    if not value:
        return None
    a = value.split(":")
    if len(a) != 3:
        return None
    return int(a[0]) * 3600 + int(a[1]) * 60 + int(a[2])

def active_services(archive, day):
    date_key = day.strftime("%Y%m%d")
    weekday = day.strftime("%A").lower()
    active = set()
    for row in rows(archive, "calendar.txt"):
        if row["start_date"] <= date_key <= row["end_date"] and row[weekday] == "1":
            active.add(row["service_id"])
    for row in rows(archive, "calendar_dates.txt"):
        if row["date"] == date_key:
            if row["exception_type"] == "1":
                active.add(row["service_id"])
            elif row["exception_type"] == "2":
                active.discard(row["service_id"])
    return active

def build(day):
    OUT.mkdir(exist_ok=True)
    stops = []
    stop_index = {}
    trips = []
    connections = []
    stats = {}
    for feed in FEEDS:
        raw = ROOT / "data" / "raw" / (feed + ".zip")
        with zipfile.ZipFile(raw) as archive:
            services = active_services(archive, day)
            routes = {r["route_id"]: r for r in rows(archive, "routes.txt")}
            local_stops = {}
            for row in rows(archive, "stops.txt"):
                key = feed + ":" + row["stop_id"]
                idx = len(stops)
                stop_index[key] = idx
                local_stops[row["stop_id"]] = idx
                stops.append([
                    key, row.get("stop_name", ""), float(row.get("stop_lat") or 0),
                    float(row.get("stop_lon") or 0),
                    row.get("parent_station", ""),
                ])
            active_trips = {}
            for row in rows(archive, "trips.txt"):
                if row["service_id"] not in services:
                    continue
                route = routes.get(row["route_id"], {})
                idx = len(trips)
                active_trips[row["trip_id"]] = idx
                trips.append([
                    feed, row["trip_id"], row["route_id"],
                    route.get("route_short_name") or route.get("route_long_name") or "",
                    row.get("trip_headsign", ""), route.get("route_type", ""),
                ])
            previous_id = None
            previous = None
            final_trips = 0
            added = 0
            for row in rows(archive, "stop_times.txt"):
                trip_id = row["trip_id"]
                if trip_id != previous_id:
                    previous_id = trip_id
                    previous = None
                tidx = active_trips.get(trip_id)
                if tidx is None:
                    continue
                stop = local_stops.get(row["stop_id"])
                if stop is None:
                    previous = None
                    continue
                arrival, departure = sec(row["arrival_time"]), sec(row["departure_time"])
                if arrival is None or departure is None:
                    previous = None
                    continue
                current = (stop, arrival, departure, row.get("pickup_type", "0"), row.get("drop_off_type", "0"))
                if previous is not None:
                    frm, _a, depart, pickup, _dropoff = previous
                    to, arrive, _d, _pickup, dropoff = current
                    # Flags 1=can board from stop, 2=can alight at destination.
                    flags = (0 if pickup == "1" else 1) | (0 if dropoff == "1" else 2)
                    if arrive < depart:
                        raise ValueError(f"{feed} trip {trip_id}: arrival precedes departure")
                    if frm != to:
                        connections.append([frm, to, depart, arrive, tidx, flags])
                        added += 1
                    # GTFS permits repeated platform stops on a single trip (e.g. BART).
                    # They require no physical connection and are omitted.
                else:
                    final_trips += 1
                previous = current
            stats[feed] = {"stops": len(local_stops), "trips": len(active_trips), "connections": added}
            print(feed, stats[feed], flush=True)

    connections.sort(key=lambda r: (r[2], r[3]))
    # JSON generated offline; gzip allows loading by DecompressionStream in modern browsers
    # (and by node:zlib in the test runner). Never commit generated schedule snapshots.
    blob = {"date": day.isoformat(), "timeZone": "America/Los_Angeles",
            "stops": stops, "trips": trips, "connections": connections}
    path = OUT / (day.isoformat() + ".json.gz")
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=6) as stream:
        stream.write(json.dumps(blob, separators=(",", ":"), ensure_ascii=False))
    print(json.dumps({"date": day.isoformat(), "stops": len(stops), "trips": len(trips),
                      "connections": len(connections), "gzipBytes": path.stat().st_size,
                      "uncompressedEstimateBytes": len(json.dumps(blob, separators=(",", ":"))),
                      "agencies": stats}, indent=2))

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: build.py YYYY-MM-DD")
    build(dt.date.fromisoformat(sys.argv[1]))
