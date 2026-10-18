#!/usr/bin/env bash
# Start Rove locally: OpenTripPlanner from the saved graph (no rebuild), then the Rove server.
#
#   npm run rove                  # Rove on 4173 (or the next free port), OTP on 8080
#   PORT=4180 npm run rove        # choose the Rove port
#
# It never stops another process. When a port is taken it says which process holds it and
# moves to the next free port. Stop Rove with Ctrl+C; OTP keeps running for the next start
# (stop it with: npm run otp:stop).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-4173}"
OTP_PORT="${OTP_PORT:-8080}"
OTP_VERSION="${OTP_VERSION:-2.8.1}"
JAR="$ROOT/data/otp/bin/otp-shaded-${OTP_VERSION}.jar"
GRAPH="$ROOT/data/otp/graph"
LOG_DIR="$ROOT/data/logs"
mkdir -p "$LOG_DIR"

say() { printf '%s\n' "$*"; }
owner() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }
describe() { local pid="$1"; printf 'PID %s (%s), started %s, in %s' "$pid" "$(ps -o command= -p "$pid" 2>/dev/null | cut -c1-120)" "$(ps -o lstart= -p "$pid" 2>/dev/null | sed 's/^ *//')" "$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"; }
otp_ready() { curl -s -m 3 -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"query":"{ feeds { feedId } }"}' "http://127.0.0.1:${OTP_PORT}/otp/gtfs/v1" 2>/dev/null | grep -q 200; }

# --- Prerequisites ------------------------------------------------------------
command -v node >/dev/null || { say "Node.js is required (22.5 or newer)."; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=5)?0:1)' \
  || { say "Node.js $(node -v) is too old; Rove needs 22.5 or newer for address search."; exit 1; }
[[ -d node_modules ]] || { say "Installing dependencies (npm install)…"; npm install --no-audit --no-fund >/dev/null || exit 1; }
[[ -s data/places/bay-area-places.sqlite ]] || say "Note: data/places/bay-area-places.sqlite is missing; address search will be unavailable."
[[ -d data/extracted/bart ]] || say "Note: data/extracted is missing; realtime matching will be unavailable (npm run refresh-data)."

# --- OpenTripPlanner ------------------------------------------------------------
if otp_ready; then
  say "OpenTripPlanner is already running on port ${OTP_PORT}; reusing it."
else
  holder="$(owner "$OTP_PORT")"
  if [[ -n "$holder" ]]; then
    say "Port ${OTP_PORT} is in use but is not answering as OpenTripPlanner: $(describe "$holder")"
    say "Choose another port with OTP_PORT=8081 npm run rove, or stop that process yourself."
    exit 1
  fi
  [[ -s "$JAR" ]] || { say "Missing $JAR. Run npm run otp:setup."; exit 1; }
  [[ -s "$GRAPH/graph.obj" ]] || { say "Missing $GRAPH/graph.obj. Run npm run otp:build (about 6 minutes)."; exit 1; }
  major="$(java -version 2>&1 | awk -F'"' '/version/ {split($2, v, "."); print v[1]}')"
  [[ "${major:-0}" -ge 21 ]] || { say "OpenTripPlanner needs Java 21 or newer (found ${major:-none})."; exit 1; }
  # Router settings are read when OTP loads the graph, so keep the graph's copy current (no rebuild needed).
  cmp -s otp/router-config.json "$GRAPH/router-config.json" || cp otp/router-config.json "$GRAPH/router-config.json"
  say "Starting OpenTripPlanner on port ${OTP_PORT} from the saved graph (about 30 to 60 seconds)…"
  nohup java -Xmx"${OTP_HEAP:-5g}" -jar "$JAR" --load --bindAddress 127.0.0.1 --port "$OTP_PORT" "$GRAPH" > "$LOG_DIR/otp.log" 2>&1 &
  echo $! > "$LOG_DIR/otp.pid"
  for _ in $(seq 1 90); do
    sleep 2
    otp_ready && break
    kill -0 "$(cat "$LOG_DIR/otp.pid")" 2>/dev/null || { say "OpenTripPlanner exited; see data/logs/otp.log:"; tail -5 "$LOG_DIR/otp.log"; exit 1; }
  done
  otp_ready || { say "OpenTripPlanner did not become ready in 3 minutes; see data/logs/otp.log."; exit 1; }
  say "OpenTripPlanner is ready (log: data/logs/otp.log)."
fi

# --- Rove server ----------------------------------------------------------------
chosen="$PORT"
for candidate in $(seq "$PORT" $((PORT + 20))); do
  holder="$(owner "$candidate")"
  if [[ -z "$holder" ]]; then chosen="$candidate"; break; fi
  say "Port ${candidate} is in use by $(describe "$holder"). Trying the next port."
done
export OTP_GRAPHQL_URL="http://127.0.0.1:${OTP_PORT}/otp/gtfs/v1"
say ""
say "Rove: http://localhost:${chosen}"
say "Checks (in another window): ROVE_URL=http://localhost:${chosen} npm run verify-all"
say ""
# .env is read by Node itself; its values are never printed.
PORT="$chosen" exec node --env-file-if-exists=.env server.mjs
