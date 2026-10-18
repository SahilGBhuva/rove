#!/usr/bin/env bash
# Stop the OpenTripPlanner process started by npm run rove (only that process).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PIDFILE="$ROOT/data/logs/otp.pid"
[[ -s "$PIDFILE" ]] || { echo "No OpenTripPlanner started by Rove is recorded."; exit 0; }
pid="$(cat "$PIDFILE")"
if ps -o command= -p "$pid" 2>/dev/null | grep -q 'otp-shaded'; then kill "$pid" && echo "Stopped OpenTripPlanner (PID $pid)."; else echo "PID $pid is not Rove's OpenTripPlanner; nothing stopped."; fi
rm -f "$PIDFILE"
