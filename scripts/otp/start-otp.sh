#!/usr/bin/env bash
# Serve the saved graph locally. Rove's server proxies it; browsers never call OTP directly.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OTP_VERSION="${OTP_VERSION:-2.8.1}"
JAR="$ROOT/data/otp/bin/otp-shaded-${OTP_VERSION}.jar"
GRAPH="$ROOT/data/otp/graph"
[[ -s "$GRAPH/graph.obj" ]] || { echo "No graph found. Run npm run otp:build first." >&2; exit 1; }
# Bind to localhost only: OTP has no authentication and must not be reachable from the network.
exec java -Xmx"${OTP_HEAP:-2g}" -jar "$JAR" --load --bindAddress 127.0.0.1 --port "${OTP_PORT:-8080}" "$GRAPH"
