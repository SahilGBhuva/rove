#!/usr/bin/env bash
# Build and save the OpenTripPlanner graph from data/otp/graph (run setup-otp.sh first).
# Two steps keep peak memory lower and let a GTFS refresh reuse the street graph:
#   1. streets: OSM -> streetGraph.obj (skipped when it is newer than the OSM extract)
#   2. transit: streetGraph.obj + GTFS -> graph.obj
# Set ROVE_REBUILD_STREETS=1 to force step 1.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OTP_VERSION="${OTP_VERSION:-2.8.1}"
JAR="$ROOT/data/otp/bin/otp-shaded-${OTP_VERSION}.jar"
GRAPH="$ROOT/data/otp/graph"
HEAP="${OTP_HEAP:-5g}"
[[ -s "$JAR" ]] || { echo "Missing $JAR. Run npm run otp:setup first." >&2; exit 1; }
[[ -s "$GRAPH/bay-area.osm.pbf" ]] || { echo "Missing OSM extract. Run npm run otp:setup first." >&2; exit 1; }
major="$(java -version 2>&1 | awk -F'"' '/version/ {split($2, v, "."); print v[1]}')"
[[ "${major:-0}" -ge 21 ]] || { echo "OpenTripPlanner ${OTP_VERSION} needs Java 21 or newer (found ${major:-none})." >&2; exit 1; }

if [[ -n "${ROVE_REBUILD_STREETS:-}" || ! -s "$GRAPH/streetGraph.obj" || "$GRAPH/bay-area.osm.pbf" -nt "$GRAPH/streetGraph.obj" ]]; then
  echo "Step 1/2: building the street graph with ${HEAP} heap (about 3 minutes)."
  java -Xmx"$HEAP" -jar "$JAR" --buildStreet "$GRAPH"
else
  echo "Step 1/2: street graph is current; reusing streetGraph.obj."
fi
echo "Step 2/2: adding transit from the GTFS feeds (about 3 minutes)."
java -Xmx"$HEAP" -jar "$JAR" --loadStreet --save "$GRAPH"
ls -lh "$GRAPH"/graph.obj
