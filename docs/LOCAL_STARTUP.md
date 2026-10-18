# Running Rove locally

Everything runs on the Mac from the saved files in `data/`. Nothing depends on Claude's cloud workspace.

Prerequisites (one time): Node.js 22.5 or newer, Java 21, `npm install`, and the data already in `data/` (the OTP graph in `data/otp/graph`, the place index in `data/places`, GTFS in `data/raw` and `data/extracted`). The 511 key lives in `.env` (`npm run configure-511`); it is read by the server and never printed.

## Start

```bash
cd ~/rove-claude
npm run rove
```

`scripts/start-rove.sh`:

1. Checks Node and dependencies.
2. Reuses OpenTripPlanner if it already answers on port 8080. Otherwise starts it from the saved graph (`--load`, no rebuild; about 30 to 60 seconds; log in `data/logs/otp.log`).
3. Starts Rove on port 4173. If a port is taken, it prints the process that holds it (PID, command, start time, folder) and tries the next port, up to 4193. It never stops another process.
4. Prints the address, for example `Rove: http://localhost:4174`.

Options: `PORT=4180 npm run rove`, `OTP_PORT=8081 npm run rove`, `OTP_HEAP=6g npm run rove`.

Stop Rove with Ctrl+C. OpenTripPlanner keeps running so the next start is instant; stop it with `npm run otp:stop` (stops only the process recorded in `data/logs/otp.pid`, and only if it is OpenTripPlanner).

To see what holds a port yourself: `lsof -nP -iTCP:4173 -sTCP:LISTEN`.

## Verify

In a second window, with the address `npm run rove` printed:

```bash
ROVE_URL=http://localhost:4174 npm run verify-all
```

It runs, in order: fixture tests, syntax check, secret scan, live realtime matching (511 and BART), schedule-based routing, place search and door-to-door trips, and the launch scenarios. Each is reported as PASS, FAIL, or SKIPPED (no live data reachable). Reports go to `data/reports/` (not committed).

Fixture tests are not real-world verification; only the live and schedule-based checks are.

## After a schedule refresh

`npm run refresh-data`, `npm run otp:setup && npm run otp:build`, then `npm run otp:stop && npm run rove`.
