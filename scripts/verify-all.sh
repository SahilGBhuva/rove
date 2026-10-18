#!/usr/bin/env bash
# Run every check against a running Rove server and save the reports in data/reports/.
#   ROVE_URL=http://localhost:4180 npm run verify-all
# Fixture tests (npm test) and real-data checks are reported separately.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export ROVE_URL="${ROVE_URL:-http://localhost:4173}"
mkdir -p data/reports
status=0
run() {
  local name="$1"; shift; printf '\n=== %s ===\n' "$name"
  "$@"; local rc=$?
  if [[ $rc -eq 0 ]]; then echo "PASS: $name"; elif [[ $rc -eq 3 ]]; then echo "SKIPPED (no live data reachable): $name"; else echo "FAIL: $name"; status=1; fi
}

# Make sure ROVE_URL is this version of Rove, not an older server on the same port.
if ! curl -s -m 5 "$ROVE_URL/api/v2/status" | grep -q '"region"'; then
  echo "No current Rove server answers at $ROVE_URL (an older server may hold the port). Start one with npm run rove."
  exit 1
fi

run "Fixture tests (npm test)" npm test --silent
run "Syntax check" npm run -s check
run "Secret scan" npm run -s check-secrets
run "Live realtime matching (511 + BART)" npm run -s verify-realtime
run "Schedule-based routing (11 trips)" npm run -s verify-routing
run "Place search and door-to-door (23 checks)" npm run -s verify-places
run "Launch scenarios" node scripts/verify-scenarios.mjs
printf '\nReports: %s\n' "$(ls data/reports | tr '\n' ' ')"
exit $status
