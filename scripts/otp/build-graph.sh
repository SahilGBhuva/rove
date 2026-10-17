#!/usr/bin/env bash
# Build and save the OpenTripPlanner graph from data/otp/graph (run setup-otp.sh first).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OTP_VERSION="${OTP_VERSION:-2.8.1}"
JAR="$ROOT/data/otp/bin/otp-shaded-${OTP_VERSION}.jar"
GRAPH="$ROOT/data/otp/graph"
HEAP="${OTP_HEAP:-6g}"
[[ -s "$JAR" ]] || { echo "Missing $JAR. Run npm run otp:setup first." >&2; exit 1; }
[[ -s "$GRAPH/bay-area.osm.pbf" ]] || { echo "Missing OSM extract. Run npm run otp:setup first." >&2; exit 1; }
major="$(java -version 2>&1 | awk -F'"' '/version/ {split($2, v, "."); print v[1]}')"
[[ "${major:-0}" -ge 21 ]] || { echo "OpenTripPlanner ${OTP_VERSION} needs Java 21 or newer (found ${major:-none})." >&2; exit 1; }
echo "Building graph with ${HEAP} heap. This takes several minutes."
java -Xmx"$HEAP" -jar "$JAR" --build --save "$GRAPH"
ls -lh "$GRAPH"/graph.obj
